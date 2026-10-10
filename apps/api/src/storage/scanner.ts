import { Socket } from 'net';

// Escáner antimalware (P0-018): cliente clamd por TCP con el protocolo INSTREAM (bytes en trozos de
// longitud prefijada; respuesta «stream: OK» o «stream: <firma> FOUND»). Integración real en local
// (servicio `scanner`, ClamAV). Un escáner caído o con respuesta inesperada devuelve FAILED: nunca CLEAN.
// No registra contenido ni nombres de archivo.

export interface ScanResult { result: 'CLEAN' | 'INFECTED' | 'FAILED'; engine: string; signature: string | null; error_code: string | null }
export interface MalwareScanner { scan(bytes: Buffer): Promise<ScanResult> }
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');

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
      sock.on('close', () => {
        const reply = Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim();
        if (/^stream: OK$/.test(reply)) return done({ result: 'CLEAN', engine: 'clamd', signature: null, error_code: null });
        const m = /^stream: (.+) FOUND$/.exec(reply);
        if (m) return done({ result: 'INFECTED', engine: 'clamd', signature: m[1].slice(0, 120), error_code: null });
        fail(/size limit/i.test(reply) ? 'SCANNER_SIZE_LIMIT' : 'SCANNER_UNEXPECTED_REPLY');
      });
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
