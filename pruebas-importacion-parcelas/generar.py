"""Exporta fixtures GIS sintéticas con GDAL y las valida con el lector real.

Ejecutar solo en terra-link-plot-reader:local. Sin red, datos ni credenciales reales.
No sobrescribe archivos existentes con el mismo nombre.
"""
import base64
import csv
import io
import json
import sys
import tempfile
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from osgeo import ogr, osr

sys.path.insert(0, '/app')
from reader import inspect

ROOT = Path('/salida')
FORMATS = [('GeoJSON', 'geojson'), ('JSON', 'json'), ('GeoPackage', 'gpkg'),
           ('Shapefile-ZIP', 'zip'), ('KML', 'kml'), ('KMZ', 'kmz'),
           ('CSV', 'csv'), ('XLSX', 'xlsx')]


def square(x, y, size=.001):
    return [[x, y], [x+size, y], [x+size, y+size], [x, y+size], [x, y]]


def geometry(x, y, n):
    outer = square(x, y)
    if n == 2:
        return {'type': 'MultiPolygon', 'coordinates': [[outer], [square(x+.002, y)]]}
    if n == 3:
        return {'type': 'Polygon', 'coordinates': [outer, list(reversed(square(x+.0003, y+.0003, .0004)))]}
    return {'type': 'Polygon', 'coordinates': [outer]}


def crs(code):
    s = osr.SpatialReference()
    s.ImportFromEPSG(code)
    s.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return s


def pack(files):
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return output.getvalue()


def kml_polygon(rings):
    def boundary(name, ring):
        coords = ' '.join(f'{x:.9f},{y:.9f},0' for x, y in ring)
        return f'<{name}><LinearRing><coordinates>{coords}</coordinates></LinearRing></{name}>'
    return '<Polygon>' + boundary('outerBoundaryIs', rings[0]) + ''.join(
        boundary('innerBoundaryIs', r) for r in rings[1:]) + '</Polygon>'


def vector(path, driver, geom, props, source):
    ds = ogr.GetDriverByName(driver).CreateDataSource(str(path))
    layer = ds.CreateLayer('parcelas', source, geom.GetGeometryType())
    for field in props:
        layer.CreateField(ogr.FieldDefn(field, ogr.OFTString))
    feature = ogr.Feature(layer.GetLayerDefn())
    for field, value in props.items():
        feature.SetField(field, value)
    feature.SetGeometry(geom)
    assert layer.CreateFeature(feature) == 0
    ds = None


def main():
    inventory = []
    for index, (folder, ext) in enumerate(FORMATS):
        (ROOT/folder).mkdir(exist_ok=True)
        for n in (1, 2, 3):
            path = ROOT/folder/f'lote {n}.{ext}'
            code = f'TLTEST-{ext.upper()}-{n:02d}'
            obj = geometry(-80.15+index*.012, -1.25+n*.006, n)
            geom = ogr.CreateGeometryFromJson(json.dumps(obj))
            assert geom.IsValid()
            props = {'plot_code': code, 'crop': 'Cacao'}
            columns = {'plot_code': 'plot_code', 'crop': 'crop'}
            options = {'mode': 'GEOMETRY', 'columns': columns.copy()}
            if ext in ('kml', 'kmz'):
                options['columns'] = {'plot_code': 'Name'}
            if ext in ('csv', 'xlsx'):
                options['source_crs'] = 'EPSG:4326'
                if n == 2:
                    options['mode'] = 'VERTICES'
                    options['columns'].update({'x': 'x', 'y': 'y', 'order': 'order', 'part': 'part', 'ring': 'ring'})
                else:
                    options['columns']['geometry'] = 'geometry'
            if path.exists():
                pass  # Reanudar/verificar sin sobrescribir archivos de prueba existentes.
            elif ext in ('geojson', 'json'):
                path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [
                    {'type': 'Feature', 'properties': props, 'geometry': obj}]}, indent=2)+'\n', encoding='utf-8')
            elif ext == 'gpkg':
                source = crs(32717 if n == 2 else 4326)
                if n == 2:
                    geom.Transform(osr.CoordinateTransformation(crs(4326), source))
                vector(path, 'GPKG', geom, props, source)
            elif ext == 'zip':
                with tempfile.TemporaryDirectory() as tmp:
                    shp = Path(tmp)/'parcelas.shp'
                    vector(shp, 'ESRI Shapefile', geom, props, crs(4326))
                    (Path(tmp)/'parcelas.cpg').write_text('UTF-8', encoding='ascii')
                    path.write_bytes(pack({p.name: p.read_bytes() for p in Path(tmp).iterdir()}))
            elif ext in ('kml', 'kmz'):
                body = ('<MultiGeometry>'+''.join(kml_polygon(p) for p in obj['coordinates'])+'</MultiGeometry>'
                        if obj['type'] == 'MultiPolygon' else kml_polygon(obj['coordinates']))
                extended = ''.join(f'<Data name="{k}"><value>{escape(v)}</value></Data>' for k, v in props.items())
                content = ('<?xml version="1.0" encoding="UTF-8"?>'
                           '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>'
                           f'<name>{code}</name><description>PRUEBA SINTETICA, NO PARCELA REAL</description>'
                           f'<ExtendedData>{extended}</ExtendedData>{body}</Placemark></Document></kml>').encode()
                path.write_bytes(pack({'doc.kml': content}) if ext == 'kmz' else content)
            else:
                options['source_crs'] = 'EPSG:4326'
                if n == 2:
                    options['mode'] = 'VERTICES'
                    options['columns'].update({'x': 'x', 'y': 'y', 'order': 'order', 'part': 'part', 'ring': 'ring'})
                    rows = [dict(props, part=str(p+1), ring=str(r+1), order=str(v+1), x=str(x), y=str(y))
                            for p, poly in enumerate(obj['coordinates']) for r, ring in enumerate(poly)
                            for v, (x, y) in enumerate(ring)]
                else:
                    rows = [dict(props, geometry=geom.ExportToWkt())]
                    options['columns']['geometry'] = 'geometry'
                if ext == 'csv':
                    with path.open('w', encoding='utf-8', newline='') as file:
                        writer = csv.DictWriter(file, fieldnames=list(rows[0]), delimiter=';')
                        writer.writeheader()
                        writer.writerows(rows)
                else:
                    ds = ogr.GetDriverByName('XLSX').CreateDataSource(str(path))
                    layer = ds.CreateLayer('parcelas')
                    for field in rows[0]:
                        layer.CreateField(ogr.FieldDefn(field, ogr.OFTString))
                    for row in rows:
                        feature = ogr.Feature(layer.GetLayerDefn())
                        for field, value in row.items():
                            feature.SetField(field, value)
                        assert layer.CreateFeature(feature) == 0
                    ds = None
            # Read exactly the exported bytes through the production parser.
            data = path.read_bytes()
            result = inspect(dict(filename=path.name, content_base64=base64.b64encode(data).decode(), **options))
            assert len(result['features']) == 1, (path, result)
            feature = result['features'][0]
            assert not feature['errors'], (path, feature['errors'])
            parsed = ogr.CreateGeometryFromJson(json.dumps(feature['geometry']))
            expected = ogr.CreateGeometryFromJson(json.dumps(obj))
            assert parsed.IsValid(), path
            assert parsed.SymDifference(expected).GetArea() < 1e-14, path
            assert feature['properties'][options['columns']['plot_code']] == code, (path, feature['properties'])
            inventory.append({'archivo': str(path.relative_to(ROOT)), 'codigo_parcela': code,
                              'sintetico': True, 'tipo': obj['type'], 'capa': result['selected_layer'],
                              'crs': result['source_crs'], 'opciones': options, 'lector': 'APROBADO',
                              'bytes': len(data)})
            print(f'OK {path.relative_to(ROOT)} -> {code} ({obj["type"]})')
    manifest = ROOT/'inventario.json'
    if not manifest.exists():
        manifest.write_text(json.dumps(inventory, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'{len(inventory)}/24 archivos aprobados por el lector real; ninguna escritura a base de datos.')


if __name__ == '__main__':
    main()
