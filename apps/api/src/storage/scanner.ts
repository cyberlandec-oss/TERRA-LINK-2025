import { Socket } from 'net';

// Escáner antimalware (P0-018): cliente clamd por TCP con el protocolo INSTREAM (bytes en trozos de
// longitud prefijada; respuesta «stream: OK» o «stream: <firma> FOUND»). Integración real en local
// (servicio `scanner`, ClamAV). Un escáner caído o con respuesta inesperada devuelve FAILED: nunca CLEAN.
// No registra contenido ni nombres de archivo.

export interface ScanResult { result: 'CLEAN' | 'INFECTED' | 'FAILED'; engine: string; signature: string | null; error_code: string | null }
export interface MalwareScanner { scan(bytes: Buffer): Promise<ScanResult> }
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

/**
 * Interpreta la respuesta de clamd. Un límite alcanzado (AlertExceedsMax) significa análisis INCOMPLETO:
 * se registra como FAILED, nunca como limpio ni como malware. Cualquier respuesta no reconocida → FAILED.
 */
export function interpretReply(reply: string): ScanResult {
  const r = reply.split(String.fromCharCode(0)).join('').trim();
  if (/^stream: OK$/.test(r)) return { result: 'CLEAN', engine: 'clamd', signature: null, error_code: null };
  const m = /^stream: (.+) FOUND$/.exec(r);
  if (m) {
    if (m[1].startsWith('Heuristics.Limits.Exceeded')) return { result: 'FAILED', engine: 'clamd', signature: m[1].slice(0, 120), error_code: 'SCAN_INCOMPLETE_LIMITS' };
    return { result: 'INFECTED', engine: 'clamd', signature: m[1].slice(0, 120), error_code: null };
  }
  return { result: 'FAILED', engine: 'clamd', signature: null, error_code: /size limit/i.test(r) ? 'SCANNER_SIZE_LIMIT' : 'SCANNER_UNEXPECTED_REPLY' };
}

export class ClamdScanner implements MalwareScanner {
  constructor(private readonly host: string, private readonly port: number, private readonly timeoutMs = 30_000) {}

  scan(bytes: Buffer): Promise<ScanResult> {
    return new Promise((resolve) => {
      const sock = new Socket();
      const chunks: Buffer[] = [];
      let settled = false;
      const done = (r: ScanResult) => { if (!settled) { settled = true; sock.destroy(); resolve(r); } };
      const fail = (code: string) => done({ result: 'FAILED', engine: 'clamd', signature: null, error_code: code });
      sock.setTimeout(this.timeoutMs, () => fail('SCANNER_TIMEOUT'));
      sock.on('error', (e: NodeJS.ErrnoException) => fail(e.code === 'ECONNREFUSED' ? 'SCANNER_UNAVAILABLE' : 'SCANNER_ERROR'));
      sock.on('data', (d: Buffer) => chunks.push(d));
      sock.on('close', () => done(interpretReply(Buffer.concat(chunks).toString('utf8'))));
      sock.connect(this.port, this.host, () => {
        sock.write('zINSTREAM\0');
        const size = 64 * 1024;
        for (let i = 0; i < bytes.length; i += size) {
          const part = bytes.subarray(i, i + size);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length, 0);
          sock.write(len);
          sock.write(part);
        }
        sock.write(Buffer.alloc(4)); // fin del flujo
      });
    });
  }
}
