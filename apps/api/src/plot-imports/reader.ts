import { AppError } from '../common/errors';

export interface ReaderOptions {
  layer?: string;
  source_crs?: string;
  delimiter?: string;
  mode?: 'POINT' | 'GEOMETRY' | 'VERTICES';
  columns?: Partial<Record<'plot_code' | 'producer_code' | 'crop' | 'x' | 'y' | 'geometry' | 'order' | 'part' | 'ring', string>>;
}
export interface ReaderResult {
  format: string;
  layers: Array<{ name: string; crs: string | null; columns: string[]; feature_count: number }>;
  selected_layer: string | null;
  source_crs: string | null;
  features: Array<{ row_numbers: number[]; properties: Record<string, unknown>; geometry: Record<string, unknown> | null; errors: string[]; warnings: string[] }>;
}

/** Fixed internal service: filenames and contents can never choose a URL or shell command. */
export async function readPlotFile(filename: string, content: Buffer, options: ReaderOptions = {}): Promise<ReaderResult> {
  const base = process.env.PLOT_IMPORT_READER_URL ?? 'http://127.0.0.1:8091';
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, '')}/inspect`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename, content_base64: content.toString('base64'), ...options }),
      signal: AbortSignal.timeout(65_000),
    });
  } catch {
    throw new AppError(503, 'PLOT_READER_UNAVAILABLE', 'El lector de parcelas no está disponible. Comprueba el servicio local y vuelve a intentar.');
  }
  const data = await response.json().catch(() => null) as ReaderResult & { error?: string } | null;
  if (!response.ok || !data || data.error) {
    const code = data?.error && /^[A-Z0-9_]{1,100}$/.test(data.error) ? data.error : 'FILE_NOT_READABLE';
    throw new AppError(422, code, 'No se pudo leer el archivo de parcelas. Revisa el formato, la capa, las columnas y el CRS de origen.', [{ field: 'file', reason: code }]);
  }
  if (!Array.isArray(data.layers) || !Array.isArray(data.features)) throw new AppError(503, 'PLOT_READER_INVALID_RESPONSE', 'El lector no devolvió una respuesta válida.');
  return data;
}
