import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { FileStore, Platform, RuntimeEnvironment, SecretStore, SqlDb, SqlValue } from '../core/ports';

/** Expo Go = entorno de prueba SIN cifrado, limitado a datos sintéticos; cualquier otro build = build nativo (exige cifrado). */
export const runtimeEnvironment: RuntimeEnvironment = Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? 'EXPO_GO_SYNTHETIC' : 'NATIVE_BUILD';

// Adaptadores Expo SDK 57 (APIs confirmadas en docs.expo.dev el 2026-10-10):
// - expo-sqlite: openDatabaseAsync, withExclusiveTransactionAsync (solo las sentencias del callback entran en la
//   transacción), PRAGMA key con SQLCipher (`useSQLCipher` en el plugin; NO disponible en Expo Go: requiere build de
//   desarrollo). El estado real se mide con PRAGMA cipher_version y se muestra en «Diagnóstico».
// - expo-file-system: Paths.document (persistente; Paths.cache puede vaciarse), File/Directory, Paths.availableDiskSpace.
// - expo-secure-store: SharedPreferences cifradas con Android Keystore (no se conserva al desinstalar).

export type EncryptionStatus = 'SQLCIPHER_ACTIVE' | 'NOT_AVAILABLE_IN_THIS_BUILD' | 'UNKNOWN';
let encryption: EncryptionStatus = 'UNKNOWN';
export const encryptionStatus = () => encryption;

const safeKey = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_');

function wrap(db: SQLite.SQLiteDatabase, cipherActive: boolean): SqlDb {
  const base = (d: SQLite.SQLiteDatabase): SqlDb => ({
    exec: (s) => d.execAsync(s),
    run: async (s, p: SqlValue[] = []) => { await d.runAsync(s, p); },
    all: <T>(s: string, p: SqlValue[] = []) => d.getAllAsync<T>(s, p),
    get: async <T>(s: string, p: SqlValue[] = []) => (await d.getFirstAsync<T>(s, p)) ?? undefined,
    transaction: async <T>(fn: (tx: SqlDb) => Promise<T>) => {
      let out: T | undefined;
      await d.withExclusiveTransactionAsync(async (txn) => { out = await fn({ ...base(txn as unknown as SQLite.SQLiteDatabase), transaction: () => { throw new Error('transacción anidada no admitida'); } }); });
      return out as T;
    },
    close: () => d.closeAsync(),
    cipher: async () => (cipherActive ? 'ACTIVE' : 'NONE'),
  });
  return base(db);
}

async function openDb(name: string, secrets: SecretStore): Promise<SqlDb> {
  const keyName = `tl.dbkey.${safeKey(name)}`;
  let key = await secrets.get(keyName);
  if (!key) {
    key = Array.from(Crypto.getRandomBytes(32)).map((b) => b.toString(16).padStart(2, '0')).join('');
    await secrets.set(keyName, key);
  }
  const db = await SQLite.openDatabaseAsync(name);
  // Clave hexadecimal generada localmente (solo [0-9a-f]): sin riesgo de inyección en el PRAGMA.
  await db.execAsync(`PRAGMA key = "x'${key}'"`);
  const cipher = await db.getFirstAsync<{ cipher_version?: string }>('PRAGMA cipher_version').catch(() => null);
  encryption = cipher?.cipher_version ? 'SQLCIPHER_ACTIVE' : 'NOT_AVAILABLE_IN_THIS_BUILD';
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return wrap(db, encryption === 'SQLCIPHER_ACTIVE');
}

const file = (p: string) => new File(Paths.document, p);
const dir = (p: string) => new Directory(Paths.document, p);

export const expoFiles: FileStore = {
  async writeBytes(p, b) { const f = file(p); f.create({ overwrite: true }); f.write(b); },
  async importFrom(src, p) { await new File(src).copy(file(p)); },
  async readExternal(src) { return new File(src).bytes(); },
  async deleteExternal(src) { const f = new File(src); if (f.exists) f.delete(); },
  async readBytes(p) { return file(p).bytes(); },
  async move(a, b) { await file(a).move(file(b)); },
  async exists(p) { return file(p).exists; },
  async size(p) { return file(p).size; },
  async delete(p) { const f = file(p); if (f.exists) f.delete(); },
  async list(d) { const x = dir(d); return x.exists ? x.list().map((e) => e.name) : []; },
  async ensureDir(d) { dir(d).create({ intermediates: true, idempotent: true }); },
  async freeBytes() { try { return Paths.availableDiskSpace; } catch { return null; } },
};

export const expoSecrets: SecretStore = {
  get: (k) => SecureStore.getItemAsync(safeKey(k)),
  set: (k, v) => SecureStore.setItemAsync(safeKey(k), v),
  delete: (k) => SecureStore.deleteItemAsync(safeKey(k)),
};

export const expoPlatform: Platform = {
  environment: runtimeEnvironment,
  openDb: (name) => openDb(name, expoSecrets),
  files: expoFiles,
  secrets: expoSecrets,
  sha256: async (b) => Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(b) as Uint8Array<ArrayBuffer>))).map((x) => x.toString(16).padStart(2, '0')).join(''),
  uuid: () => Crypto.randomUUID(),
  now: () => new Date(),
};

/**
 * Subida multipart de un adjunto guardado en la base: se escribe una copia temporal en la caché (sin cifrar mientras
 * dura la subida), se sube y se borra. Limitación documentada: esa copia temporal existe durante la transferencia.
 */
export async function expoUploader(url: string, bytes: Uint8Array, mimeType: string, fields: Record<string, string>, headers: Record<string, string>) {
  const tmp = new File(Paths.cache, `tl-upload-${Crypto.randomUUID()}`);
  try {
    tmp.create({ overwrite: true });
    tmp.write(bytes);
    const r = await tmp.upload(url, { httpMethod: 'POST', uploadType: UploadType.MULTIPART, fieldName: 'file', mimeType, parameters: fields, headers });
    return { status: r.status, body: r.body };
  } finally {
    if (tmp.exists) tmp.delete();
  }
}
