"""Local, bounded vector-file reader. Never accepts a URL, SQL or a server path."""
import base64
import csv
import io
import json
import math
import os
import re
import signal
import stat
import subprocess
import sys
import tempfile
import zipfile
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MAX_FILE = 20 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
MAX_ROWS = 5000
MAX_POSITIONS = 100000
FORMATS = {'.json': 'GeoJSON', '.geojson': 'GeoJSON', '.gpkg': 'GPKG', '.zip': 'ESRI Shapefile', '.kml': 'KML', '.kmz': 'KML', '.csv': 'CSV', '.xlsx': 'XLSX'}


class InputError(Exception):
    pass


def require(ok, message):
    if not ok:
        raise InputError(message)


def safe_zip(data, folder, kind):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        infos = archive.infolist()
        require(0 < len(infos) <= 200, 'ZIP_ENTRIES_LIMIT')
        total = 0
        names = set()
        for info in infos:
            name = info.filename.replace('\\', '/')
            parts = name.split('/')
            require(not name.startswith('/') and ':' not in name and '..' not in parts and '\x00' not in name, 'ZIP_UNSAFE_PATH')
            require(not stat.S_ISLNK(info.external_attr >> 16) and not info.flag_bits & 1, 'ZIP_UNSAFE_ENTRY')
            require(name.casefold() not in names, 'ZIP_DUPLICATE_ENTRY')
            names.add(name.casefold())
            total += info.file_size
            require(info.file_size <= MAX_EXPANDED and total <= MAX_EXPANDED and info.file_size <= max(info.compress_size, 1) * 200, 'ZIP_EXPANSION_LIMIT')
            if kind == 'shp' and not info.is_dir():
                require(Path(name).suffix.lower() in {'.shp', '.shx', '.dbf', '.prj', '.cpg', '.qix', '.sbn', '.sbx', '.xml'}, 'ZIP_UNSUPPORTED_COMPONENT')
            if kind == 'xlsx':
                require('vbaproject' not in name.lower(), 'XLSX_MACROS_NOT_ALLOWED')
            if info.is_dir():
                continue
            content = archive.read(info)
            require(len(content) == info.file_size, 'ZIP_SIZE_MISMATCH')
            if Path(name).suffix.lower() in {'.xml', '.kml', '.rels'}:
                xml_guard(content)
            if kind != 'xlsx':
                target = Path(folder) / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
        if kind == 'shp':
            shapes = sorted(p for p in Path(folder).rglob('*') if p.suffix.lower() == '.shp')
            require(bool(shapes), 'SHAPEFILE_SHP_REQUIRED')
            for shape in shapes:
                sibling = {p.suffix.lower() for p in shape.parent.iterdir() if p.stem.casefold() == shape.stem.casefold()}
                require({'.shp', '.shx', '.dbf'} <= sibling, 'SHAPEFILE_COMPONENTS_REQUIRED')
            parents = {str(shape.parent) for shape in shapes}
            require(len(parents) == 1, 'SHAPEFILE_SINGLE_FOLDER_REQUIRED')
            return parents.pop()
        if kind == 'kmz':
            files = sorted(Path(folder).rglob('*'))
            kml = [p for p in files if p.suffix.lower() == '.kml']
            require(len(kml) == 1, 'KMZ_SINGLE_KML_REQUIRED')
            return str(kml[0])
    return None


def xml_guard(content):
    text = content.decode('utf-8-sig', errors='strict')
    require(not re.search(r'<!DOCTYPE|<!ENTITY|<\s*(?:\w+:)?NetworkLink\b|macroEnabled|vbaProject|<\s*(?:\w+:)?f(?:\s|>)', text, re.I), 'XML_EXTERNAL_OR_ACTIVE_CONTENT')


def number(value):
    s = str(value).strip().replace(',', '.')
    require(bool(re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)', s)), 'COORDINATE_NOT_NUMERIC')
    n = float(s)
    require(math.isfinite(n), 'COORDINATE_NOT_FINITE')
    return n


def crs_from_code(value, osr):
    require(isinstance(value, str) and bool(re.fullmatch(r'(?:EPSG:)?\d{4,6}', value, re.I)), 'CRS_EPSG_REQUIRED')
    s = osr.SpatialReference()
    require(s.ImportFromEPSG(int(value.split(':')[-1])) == 0, 'CRS_UNKNOWN')
    s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return s


def inspect(payload):
    from osgeo import gdal, ogr, osr
    gdal.UseExceptions()
    ogr.UseExceptions()
    gdal.PushErrorHandler('CPLQuietErrorHandler')
    gdal.SetConfigOption('PROJ_NETWORK', 'OFF')
    gdal.SetConfigOption('OGR_SQLITE_LOAD_EXTENSIONS', '')
    gdal.SetConfigOption('GDAL_HTTP_UNSAFESSL', 'NO')
    gdal.SetConfigOption('OGR_XLSX_HEADERS', 'FORCE')
    gdal.SetConfigOption('OGR_XLSX_FIELD_TYPES', 'STRING')
    name = payload.get('filename', '')
    require(isinstance(name, str) and len(name) <= 255, 'FILENAME_INVALID')
    ext = Path(name).suffix.lower()
    require(ext in FORMATS, 'FORMAT_NOT_SUPPORTED')
    data = base64.b64decode(payload.get('content_base64', ''), validate=True)
    require(0 < len(data) <= MAX_FILE, 'FILE_SIZE_LIMIT')
    if ext == '.kml':
        xml_guard(data)
    with tempfile.TemporaryDirectory(prefix='tl-reader-') as folder:
        path = str(Path(folder) / ('input' + ext))
        Path(path).write_bytes(data)
        if ext in {'.zip', '.kmz', '.xlsx'}:
            selected = safe_zip(data, str(Path(folder) / 'expanded'), {'.zip': 'shp', '.kmz': 'kmz', '.xlsx': 'xlsx'}[ext])
            if selected:
                path = selected
        if ext in {'.json', '.geojson'}:
            geo = json.loads(data)
            require(isinstance(geo, dict), 'GEOJSON_OBJECT_REQUIRED')
            declared = geo.get('crs', {}).get('properties', {}).get('name') if isinstance(geo.get('crs'), dict) else None
            if declared and not payload.get('source_crs'):
                match = re.search(r'EPSG(?::|::|/0/)(\d+)$', declared, re.I)
                require(match is not None or declared.endswith('CRS84'), 'CRS_CONFIRMATION_REQUIRED')
                if match:
                    payload['source_crs'] = 'EPSG:' + match[1]
        layers = []
        sources = {}
        if ext == '.csv':
            text = data.decode('utf-8-sig', errors='strict')
            delimiter = payload.get('delimiter')
            require(delimiter in (None, '', ',', ';', '\t', '|'), 'CSV_DELIMITER_INVALID')
            if not delimiter:
                try:
                    delimiter = csv.Sniffer().sniff(text[:16384], delimiters=',;\t|').delimiter
                except csv.Error:
                    raise InputError('CSV_DELIMITER_REQUIRED')
            records = list(csv.reader(io.StringIO(text), delimiter=delimiter, strict=True))
            require(1 < len(records) <= MAX_ROWS + 1, 'ROW_COUNT_LIMIT')
            headers = records[0]
            require(0 < len(headers) <= 100 and len(headers) == len(set(headers)) and all(headers), 'COLUMNS_INVALID')
            require(all(len(row) == len(headers) for row in records[1:]), 'CSV_ROW_WIDTH_INVALID')
            rows = [{'row_numbers': [i + 2], 'properties': dict(zip(headers, row)), 'geometry': None} for i, row in enumerate(records[1:])]
            layers.append({'name': 'parcelas', 'crs': None, 'columns': headers, 'feature_count': len(rows)})
            sources['parcelas'] = (rows, None)
        else:
            ds = gdal.OpenEx(path, gdal.OF_VECTOR | gdal.OF_READONLY, allowed_drivers=[FORMATS[ext]])
            require(ds is not None, 'FILE_NOT_READABLE')
            require(0 < ds.GetLayerCount() <= 50, 'LAYERS_LIMIT')
            for i in range(ds.GetLayerCount()):
                layer = ds.GetLayerByIndex(i)
                definition = layer.GetLayerDefn()
                headers = [definition.GetFieldDefn(j).GetName() for j in range(definition.GetFieldCount())]
                require(len(headers) <= 100, 'COLUMNS_LIMIT')
                srs = layer.GetSpatialRef()
                crs = None
                if srs:
                    try:
                        srs.AutoIdentifyEPSG()
                        authority = srs.GetAuthorityCode(None)
                        crs = 'EPSG:' + authority if authority else srs.ExportToWkt()
                    except Exception:
                        crs = srs.ExportToWkt()
                rows = []
                for index, feature in enumerate(layer):
                    require(index < MAX_ROWS, 'ROW_COUNT_LIMIT')
                    props = {h: feature.GetField(h) for h in headers}
                    require(all(len(str(v)) <= 2000000 for v in props.values()), 'CELL_SIZE_LIMIT')
                    geometry = feature.GetGeometryRef()
                    rows.append({'row_numbers': [index + (2 if ext == '.xlsx' else 1)], 'properties': props, 'geometry': geometry.Clone() if geometry else None})
                layers.append({'name': layer.GetName(), 'crs': crs, 'columns': headers, 'feature_count': len(rows)})
                sources[layer.GetName()] = (rows, srs.Clone() if srs else None)
        chosen = payload.get('layer')
        if not chosen and len(layers) == 1:
            chosen = layers[0]['name']
        result = {'format': FORMATS[ext], 'layers': layers, 'selected_layer': chosen, 'source_crs': None, 'features': []}
        if not chosen:
            return result
        require(chosen in sources, 'LAYER_NOT_FOUND')
        rows, source = sources[chosen]
        if payload.get('source_crs'):
            source = crs_from_code(payload['source_crs'], osr)
        result['source_crs'] = payload.get('source_crs') or next(l['crs'] for l in layers if l['name'] == chosen)
        columns = payload.get('columns') or {}
        require(isinstance(columns, dict), 'MAPPING_INVALID')
        available = next(l['columns'] for l in layers if l['name'] == chosen)
        require(all(v in available for v in columns.values() if v), 'MAPPING_COLUMN_UNKNOWN')
        mode = payload.get('mode', 'GEOMETRY')
        require(mode in ('POINT', 'GEOMETRY', 'VERTICES'), 'MODE_INVALID')
        if mode == 'VERTICES':
            require(all(columns.get(k) for k in ('plot_code', 'x', 'y', 'order')), 'VERTEX_MAPPING_REQUIRED')
            groups = OrderedDict()
            for row in rows:
                props = row['properties']
                key = str(props.get(columns['plot_code'], '')).strip()
                require(bool(key), 'PLOT_CODE_REQUIRED')
                groups.setdefault(key, []).append(row)
            grouped = []
            for group in groups.values():
                item = {'row_numbers': [n for row in group for n in row['row_numbers']], 'properties': group[0]['properties'], 'geometry': None, 'errors': [], 'warnings': []}
                try:
                    for key in ('producer_code', 'crop'):
                        if columns.get(key):
                            require(len({str(r['properties'].get(columns[key], '')) for r in group}) == 1, 'VERTEX_ATTRIBUTES_CONFLICT')
                    parts = OrderedDict()
                    for row in group:
                        p = row['properties']
                        part = str(p.get(columns.get('part'), '1'))
                        ring = str(p.get(columns.get('ring'), '1'))
                        require(part.isdigit() and ring.isdigit(), 'PART_RING_POSITIVE_INTEGER_REQUIRED')
                        order = number(p[columns['order']])
                        require(order.is_integer() and order >= 0, 'VERTEX_ORDER_INVALID')
                        parts.setdefault(part, OrderedDict()).setdefault(ring, []).append((order, number(p[columns['x']]), number(p[columns['y']])))
                    polygons = []
                    for part in sorted(parts, key=int):
                        rings = parts[part]
                        polygon = []
                        for ring in sorted(rings, key=int):
                            entries = rings[ring]
                            require(len(entries) >= 4 and len({e[0] for e in entries}) == len(entries), 'VERTEX_ORDER_OR_RING_INVALID')
                            positions = [[e[1], e[2]] for e in sorted(entries)]
                            require(positions[0] == positions[-1], 'RING_NOT_CLOSED')
                            polygon.append(positions)
                        polygons.append(polygon)
                    item['geometry'] = ogr.CreateGeometryFromJson(json.dumps({'type': 'Polygon' if len(polygons) == 1 else 'MultiPolygon', 'coordinates': polygons[0] if len(polygons) == 1 else polygons}))
                except InputError as e:
                    item['errors'].append(str(e))
                grouped.append(item)
            rows = grouped
        destination = crs_from_code('EPSG:4326', osr)
        transform = None
        if source:
            source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
            transform = osr.CoordinateTransformation(source, destination)
        positions_total = 0
        for row in rows:
            row.setdefault('errors', [])
            row.setdefault('warnings', [])
            props = row['properties']
            geometry = row['geometry']
            try:
                require(not any(isinstance(v, str) and v.lstrip().startswith('=') for v in props.values()), 'FORMULA_NOT_ALLOWED')
                if mode == 'POINT':
                    require(columns.get('x') and columns.get('y'), 'XY_MAPPING_REQUIRED')
                    geometry = ogr.Geometry(ogr.wkbPoint)
                    geometry.AddPoint_2D(number(props[columns['x']]), number(props[columns['y']]))
                elif mode == 'GEOMETRY' and columns.get('geometry'):
                    raw = str(props[columns['geometry']]).strip()
                    require(len(raw) <= 2000000, 'GEOMETRY_SIZE_LIMIT')
                    obj = json.loads(raw) if raw.startswith('{') else None
                    if obj:
                        obj = obj.get('geometry') if obj.get('type') == 'Feature' else obj
                        require('crs' not in obj, 'CELL_CRS_NOT_ALLOWED_USE_SOURCE_CRS')
                    geometry = ogr.CreateGeometryFromJson(json.dumps(obj)) if obj else ogr.CreateGeometryFromWkt(raw)
                require(geometry is not None, 'GEOMETRY_REQUIRED')
                require(ogr.GT_Flatten(geometry.GetGeometryType()) in (ogr.wkbPoint, ogr.wkbPolygon, ogr.wkbMultiPolygon), 'GEOMETRY_TYPE_NOT_SUPPORTED')
                require(source is not None, 'CRS_CONFIRMATION_REQUIRED')
                if geometry.GetCoordinateDimension() > 2:
                    require(ext in ('.kml', '.kmz'), 'EXTRA_DIMENSIONS_NOT_SUPPORTED')
                    geometry.FlattenTo2D()
                    row['warnings'].append('KML_ALTITUDE_OMITTED_FOR_2D_PREVIEW')
                require(geometry.Transform(transform) == 0, 'CRS_TRANSFORM_FAILED')
                obj = json.loads(geometry.ExportToJson(['COORDINATE_PRECISION=17']))
                def check(value):
                    nonlocal positions_total
                    if isinstance(value, list) and value and isinstance(value[0], (int, float)):
                        positions_total += 1
                        require(len(value) == 2 and all(math.isfinite(n) for n in value) and abs(value[0]) <= 180 and abs(value[1]) <= 90, 'COORDINATE_OUT_OF_RANGE')
                        require(positions_total <= MAX_POSITIONS, 'POSITIONS_LIMIT')
                    elif isinstance(value, list):
                        for sub in value:
                            check(sub)
                check(obj['coordinates'])
                row['geometry'] = obj
            except InputError as e:
                row['errors'].append(str(e))
                row['geometry'] = None
            except Exception:
                row['errors'].append('GEOMETRY_OR_CRS_INVALID')
                row['geometry'] = None
        result['features'] = rows
        return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, code, value):
        data = json.dumps(value, allow_nan=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.respond(200 if self.path == '/health' else 404, {'status': 'ok'} if self.path == '/health' else {'error': 'NOT_FOUND'})

    def do_POST(self):
        if self.path != '/inspect':
            return self.respond(404, {'error': 'NOT_FOUND'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            require(0 < size <= 30 * 1024 * 1024, 'FILE_SIZE_LIMIT')
            body = self.rfile.read(size)
            child = subprocess.run([sys.executable, __file__, '--worker'], input=body, capture_output=True, timeout=60, env={**os.environ, 'PROJ_NETWORK': 'OFF'})
            require(child.returncode == 0 and len(child.stdout) <= MAX_EXPANDED, 'READER_FAILED')
            result = json.loads(child.stdout)
            self.respond(422 if 'error' in result else 200, result)
        except subprocess.TimeoutExpired:
            self.respond(422, {'error': 'READER_TIMEOUT'})
        except InputError as e:
            self.respond(422, {'error': str(e)})
        except Exception:
            self.respond(422, {'error': 'FILE_NOT_READABLE'})


if __name__ == '__main__':
    if '--worker' in sys.argv:
        signal.alarm(55)
        try:
            result = inspect(json.load(sys.stdin))
            print(json.dumps(result, allow_nan=False))
        except InputError as e:
            print(json.dumps({'error': str(e)}))
        except Exception:
            print(json.dumps({'error': 'FILE_NOT_READABLE'}))
    else:
        HTTPServer(('0.0.0.0', 8091), Handler).serve_forever()
