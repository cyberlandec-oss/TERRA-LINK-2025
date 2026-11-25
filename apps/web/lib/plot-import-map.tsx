'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibre from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { positions, type PlotVersion } from './plots';

export function PlotImportMap({ geometry, previous }: { geometry: PlotVersion['geometry']; previous?: PlotVersion['geometry'] }) {
  const container = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let map: maplibre.Map | undefined;
    const base = (process.env.NEXT_PUBLIC_MAPS_URL ?? 'http://localhost:8090').replace(/\/$/, '');
    maplibre.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
    const protocol = new Protocol();
    maplibre.addProtocol('pmtiles', protocol.tile);
    void (async () => {
      try {
        const response = await fetch(`${base}/estilo.json`);
        if (!response.ok) throw new Error('map');
        const style = JSON.parse((await response.text()).split('__MAPS__').join(base)) as maplibre.StyleSpecification;
        if (cancelled || !container.current) return;
        map = new maplibre.Map({ container: container.current, style, center: [-78.5, -1.5], zoom: 6,
          transformRequest: url => ({ url: url.startsWith(`${base}/`) || url.startsWith(`pmtiles://${base}/`) || url.startsWith('data:') || url.startsWith('blob:') ? url : `${base}/bloqueado` }) });
        map.addControl(new maplibre.NavigationControl());
        map.on('load', () => {
          const features = [previous ? { type: 'Feature', properties: { previous: true }, geometry: previous } : null,
            geometry ? { type: 'Feature', properties: { previous: false }, geometry } : null].filter(Boolean);
          map!.addSource('import', { type: 'geojson', data: { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection });
          map!.addLayer({ id: 'fill', type: 'fill', source: 'import', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['case', ['get', 'previous'], '#c47721', '#2b6650'], 'fill-opacity': 0.18 } });
          map!.addLayer({ id: 'border', type: 'line', source: 'import', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': ['case', ['get', 'previous'], '#c47721', '#2b6650'], 'line-width': 2 } });
          map!.addLayer({ id: 'point', type: 'circle', source: 'import', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#2b6650' } });
          const pts = [...positions(geometry), ...positions(previous ?? null)];
          if (pts.length) {
            const bounds = new maplibre.LngLatBounds();
            for (const point of pts) bounds.extend([point.lon, point.lat]);
            map!.fitBounds(bounds, { padding: 35, maxZoom: 17, duration: 0 });
          }
        });
        map.on('error', () => { if (!cancelled) setUnavailable(true); });
      } catch { if (!cancelled) setUnavailable(true); }
    })();
    return () => { cancelled = true; map?.remove(); maplibre.removeProtocol('pmtiles'); };
  }, [geometry, previous]);
  return <div><div ref={container} style={{ height: 320, maxWidth: '100%' }} aria-label="Mapa de revisión de parcela" />
    {unavailable && <p role="status">Cartografía local no disponible. Revisa la geometría y sus coordenadas en la tabla.</p>}
    <p className="muted">Verde: geometría propuesta. Naranja: geometría anterior. El mapa no modifica los límites.</p></div>;
}
