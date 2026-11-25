"""Real-format fixtures generated locally with GDAL; no external geometries or network."""
import base64
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from osgeo import ogr, osr
from reader import inspect, InputError


def payload(name, data, **options):
    return dict(filename=name, content_base64=base64.b64encode(data).decode(), **options)


def zipped(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return stream.getvalue()


class ReaderTest(unittest.TestCase):
    def test_geojson_preserves_polygon_hole_and_attributes(self):
        ring = [[-80, -1], [-79.99, -1], [-79.99, -.99], [-80, -.99], [-80, -1]]
        hole = [[-79.998, -.998], [-79.998, -.992], [-79.992, -.992], [-79.992, -.998], [-79.998, -.998]]
        g = {'type': 'Polygon', 'coordinates': [ring, hole]}
        data = json.dumps({'type': 'Feature', 'properties': {'codigo': 'P01'}, 'geometry': g}).encode()
        result = inspect(payload('parcela.geojson', data))
        self.assertEqual(result['features'][0]['geometry'], g)
        self.assertEqual(result['features'][0]['properties']['codigo'], 'P01')

    def test_csv_decimal_comma_and_explicit_axis_mapping(self):
        data = b'codigo;x;y\nP01;-80,1;-1,2\n'
        result = inspect(payload('p.csv', data, mode='POINT', source_crs='EPSG:4326', columns={'x': 'x', 'y': 'y'}))
        self.assertEqual(result['features'][0]['geometry']['coordinates'], [-80.1, -1.2])

    def test_missing_crs_never_assumes_degrees(self):
        result = inspect(payload('p.csv', b'x;y\n500000;9900000\n', mode='POINT', columns={'x': 'x', 'y': 'y'}))
        self.assertIn('CRS_CONFIRMATION_REQUIRED', result['features'][0]['errors'])

    def test_utm_17_south_known_central_meridian(self):
        result = inspect(payload('p.csv', b'x;y\n500000;10000000\n', mode='POINT', source_crs='EPSG:32717', columns={'x': 'x', 'y': 'y'}))
        lon, lat = result['features'][0]['geometry']['coordinates']
        self.assertAlmostEqual(lon, -81, places=7)
        self.assertAlmostEqual(lat, 0, places=7)

    def test_wkt_multipolygon(self):
        wkt = 'MULTIPOLYGON (((-80 -1,-79.99 -1,-79.99 -0.99,-80 -1)))'
        result = inspect(payload('p.csv', ('code;shape\nP01;' + wkt + '\n').encode(), source_crs='EPSG:4326', columns={'geometry': 'shape'}))
        self.assertEqual(result['features'][0]['geometry']['type'], 'MultiPolygon')

    def test_vertices_follow_order_not_row_sequence(self):
        data = b'p;o;x;y\nP;3;-79;-0.5\nP;1;-80;-1\nP;4;-80;-1\nP;2;-79;-1\n'
        result = inspect(payload('p.csv', data, source_crs='EPSG:4326', mode='VERTICES', columns={'plot_code': 'p', 'order': 'o', 'x': 'x', 'y': 'y'}))
        self.assertEqual(result['features'][0]['geometry']['coordinates'][0], [[-80, -1], [-79, -1], [-79, -.5], [-80, -1]])

    def test_duplicate_vertex_order_is_error(self):
        data = b'p;o;x;y\nP;1;-80;-1\nP;1;-79;-1\nP;3;-79;0\nP;4;-80;-1\n'
        result = inspect(payload('p.csv', data, source_crs='EPSG:4326', mode='VERTICES', columns={'plot_code': 'p', 'order': 'o', 'x': 'x', 'y': 'y'}))
        self.assertIn('VERTEX_ORDER_OR_RING_INVALID', result['features'][0]['errors'])

    def test_kml_kmz_and_lines(self):
        kml = b'<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>P01</name><Point><coordinates>-80,-1,0</coordinates></Point></Placemark></Document></kml>'
        for name, data in [('p.kml', kml), ('p.kmz', zipped({'doc.kml': kml}))]:
            result = inspect(payload(name, data))
            self.assertEqual(result['features'][0]['geometry']['type'], 'Point')
            self.assertIn('KML_ALTITUDE_OMITTED_FOR_2D_PREVIEW', result['features'][0]['warnings'])
        line = {'type': 'LineString', 'coordinates': [[-80, -1], [-79, -1]]}
        result = inspect(payload('p.geojson', json.dumps(line).encode()))
        self.assertIn('GEOMETRY_TYPE_NOT_SUPPORTED', result['features'][0]['errors'])

    def create_vector(self, path, driver, layer_name='parcelas'):
        ds = ogr.GetDriverByName(driver).CreateDataSource(str(path))
        crs = osr.SpatialReference()
        crs.ImportFromEPSG(4326)
        layer = ds.CreateLayer(layer_name, crs, ogr.wkbPoint)
        layer.CreateField(ogr.FieldDefn('codigo', ogr.OFTString))
        f = ogr.Feature(layer.GetLayerDefn())
        f.SetField('codigo', 'P01')
        f.SetGeometry(ogr.CreateGeometryFromWkt('POINT(-80 -1)'))
        layer.CreateFeature(f)
        return ds

    def test_geopackage_layer_selection_and_shapefile_zip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'parcelas.gpkg'
            ds = self.create_vector(path, 'GPKG')
            ds.CreateLayer('otra', None, ogr.wkbPoint)
            ds = None
            data = path.read_bytes()
            result = inspect(payload('p.gpkg', data))
            self.assertIsNone(result['selected_layer'])
            result = inspect(payload('p.gpkg', data, layer='parcelas'))
            self.assertEqual(result['features'][0]['geometry']['coordinates'], [-80, -1])
            shp = Path(tmp) / 'shape'
            ds = self.create_vector(shp, 'ESRI Shapefile')
            ds = None
            archive = zipped({p.name: p.read_bytes() for p in shp.iterdir()})
            result = inspect(payload('p.zip', archive))
            self.assertEqual(result['features'][0]['properties']['codigo'], 'P01')

    def test_xlsx_sheet_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'p.xlsx'
            ds = ogr.GetDriverByName('XLSX').CreateDataSource(str(path))
            layer = ds.CreateLayer('parcelas')
            for name in ('codigo', 'x', 'y'):
                layer.CreateField(ogr.FieldDefn(name, ogr.OFTString))
            feature = ogr.Feature(layer.GetLayerDefn())
            for key, value in [('codigo', 'P01'), ('x', '-80'), ('y', '-1')]:
                feature.SetField(key, value)
            layer.CreateFeature(feature)
            ds = None
            result = inspect(payload('p.xlsx', path.read_bytes(), source_crs='EPSG:4326', mode='POINT', columns={'x': 'x', 'y': 'y'}))
            self.assertEqual(result['features'][0]['geometry']['coordinates'], [-80, -1])

    def test_unsafe_files_rejected(self):
        for name, data in [('p.zip', zipped({'../escape.shp': b'bad'})), ('p.kml', b'<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><kml/>'), ('p.zip', zipped({'a.shp': b'only shp'}))]:
            with self.assertRaises(InputError):
                inspect(payload(name, data))


if __name__ == '__main__':
    unittest.main()
