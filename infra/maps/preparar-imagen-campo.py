"""Paquete PNG georreferenciado Sentinel-2 para una zona pequeña de campo.

Solo preparación CON red en imagen GDAL local. No llama WHISP ni recibe identidad.
Salida nueva en /salida; no publica automáticamente ni sobrescribe archivos.
"""
import argparse
import hashlib
import json
import math
import re
import urllib.request
from pathlib import Path
from osgeo import gdal, ogr

parser = argparse.ArgumentParser()
parser.add_argument('--bbox', required=True, help='west,south,east,north EPSG:4326')
parser.add_argument('--id', required=True)
parser.add_argument('--until', required=True, help='Fecha máxima YYYY-MM-DD; nunca se inventa fecha de imagen')
args = parser.parse_args()
bounds = [float(v) for v in args.bbox.split(',')]
if len(bounds) != 4 or not all(math.isfinite(v) for v in bounds):
    raise SystemExit('Caja inválida')
w, s, e, n = bounds
if not (-180 <= w < e <= 180 and -85 <= s < n <= 85 and e-w <= .1 and n-s <= .1):
    raise SystemExit('Zona máxima 0.1 grados por eje, coordenadas WGS84')
if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', args.id) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.until):
    raise SystemExit('Identificador o fecha inválidos')
out = Path('/salida')
image = out / (args.id+'.png')
manifest = out / 'manifest.json'
if image.exists() or manifest.exists():
    raise SystemExit('La salida ya existe; se conserva sin sobrescribir')

query = {'collections': ['sentinel-2-l2a'], 'bbox': bounds, 'limit': 40,
         'datetime': '2024-01-01T00:00:00Z/'+args.until+'T23:59:59Z',
         'query': {'eo:cloud_cover': {'lt': 30}},
         'sortby': [{'field': 'properties.datetime', 'direction': 'desc'}]}
request = urllib.request.Request('https://earth-search.aws.element84.com/v1/search',
                                 data=json.dumps(query).encode(), headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(request, timeout=30) as response:
    payload = response.read(8*1024*1024+1)
if len(payload) > 8*1024*1024:
    raise SystemExit('Catálogo demasiado grande')
items = json.loads(payload)['features']
ring = [[w,s],[e,s],[e,n],[w,n],[w,s]]
box = ogr.CreateGeometryFromJson(json.dumps({'type':'Polygon','coordinates':[ring]}))
gdal.UseExceptions()
gdal.SetConfigOption('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
gdal.SetConfigOption('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif')
gdal.SetConfigOption('GDAL_HTTP_TIMEOUT', '60')
gdal.SetConfigOption('GDAL_HTTP_MAX_RETRY', '1')
gdal.SetConfigOption('GDAL_CACHEMAX', '64')
def allowed_asset(url):
    return bool(re.fullmatch(r'https://sentinel-cogs\.s3\.(?:us-west-2\.)?amazonaws\.com/[^\s?#]+\.tif', url))

# Nubes de escena no equivalen a nubes de la zona: verificar máscara SCL local antes de publicar.
selected = None
local_cloud = None
candidates = sorted(items, key=lambda item: item['properties'].get('eo:cloud_cover', 100))
for item in candidates[:20]:
    if not {'visual', 'scl'} <= set(item.get('assets', {})) or not ogr.CreateGeometryFromJson(json.dumps(item['geometry'])).Contains(box):
        continue
    if not all(allowed_asset(item['assets'][key]['href']) for key in ('visual', 'scl')):
        continue
    mask = gdal.Warp('', '/vsicurl/'+item['assets']['scl']['href'], format='MEM', outputBounds=bounds,
                     outputBoundsSRS='EPSG:4326', dstSRS='EPSG:4326', width=128, height=128, resampleAlg='near')
    values = mask.GetRasterBand(1).ReadRaster(buf_type=gdal.GDT_Byte)
    invalid = sum(value in (0, 1, 3, 8, 9, 10, 11) for value in values)
    if invalid/len(values) <= .15:
        selected = item
        local_cloud = round(100*invalid/len(values), 2)
        break
if not selected:
    raise SystemExit('Sin escena con cobertura completa y menos del 15% de nubes/sombra/nodata en la zona. No se genera paquete.')
url = selected['assets']['visual']['href']
raster = gdal.Warp('', '/vsicurl/'+url, format='MEM', outputBounds=bounds, outputBoundsSRS='EPSG:4326',
                   dstSRS='EPSG:4326', width=1024, height=1024, resampleAlg='bilinear', dstAlpha=True)
if raster is None or raster.RasterCount < 3 or raster.GetRasterBand(1).ComputeRasterMinMax()[1] == 0:
    raise SystemExit('Imagen vacía o no válida; no se genera paquete')
gdal.Translate(str(image), raster, format='PNG', creationOptions=['ZLEVEL=6'])
data = image.read_bytes()
package = {'id': args.id, 'bounds': bounds, 'acquired_at': selected['properties']['datetime'],
           'source': 'Copernicus Sentinel-2 L2A / Element 84 Earth Search; '+selected['id'],
           'license': 'Contains modified Copernicus Sentinel data; free, full and open access. Source: Copernicus / Element 84 AWS Open Data.',
           'resolution_m': 10, 'sha256': hashlib.sha256(data).hexdigest(), 'image_url': '/offline/'+image.name,
           'bytes': len(data), 'synthetic': False,
           'scene_cloud_percent': selected['properties'].get('eo:cloud_cover'),
           'local_obscured_percent': local_cloud,
           'limitations': 'Referencia visual de 10 m; el porcentaje de nubes es de la escena, no garantiza ausencia de nubes sobre la parcela. No prueba titularidad ni deforestación.'}
manifest.write_text(json.dumps({'packages': [package]}, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps({'id':args.id,'scene':selected['id'],'acquired_at':package['acquired_at'],'bytes':len(data),'sha256':package['sha256']}))
