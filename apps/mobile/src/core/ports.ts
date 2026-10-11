// P0-023 Captura offline: puertos de plataforma. El núcleo (src/core) no importa Expo: así las transacciones, la
// recuperación y los fallos de almacenamiento se prueban con un motor SQLite real (node:sqlite) y un sistema de
// archivos real en Node, y en el dispositivo con expo-sqlite / expo-file-system / expo-secure-store (src/adapters/expo.ts).
// Esa diferencia se declara en la evidencia: una prueba en Node no es una prueba en Android.

export type SqlValue = string | number | null;

export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  /** Transacción exclusiva: solo las sentencias del callback entran en ella; un error revierte todo. */
  transaction<T>(fn: (tx: SqlDb) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Rutas relativas a un directorio persistente de la app (nunca la caché que el sistema puede vaciar). */
export interface FileStore {
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  /** Copia desde una URI/ruta externa (p. ej. la caché temporal de la cámara) hacia una ruta persistente. */
  importFrom(sourceUri: string, path: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  move(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  delete(path: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  ensureDir(dir: string): Promise<void>;
  /** Bytes libres si la plataforma lo informa; null si no se conoce. */
  freeBytes(): Promise<number | null>;
}

export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Platform {
  openDb(name: string): Promise<SqlDb>;
  files: FileStore;
  secrets: SecretStore;
  sha256(bytes: Uint8Array): Promise<string>;
  uuid(): string;
  now(): Date;
}

/** Error de almacenamiento lleno (ENOSPC u homólogo de la plataforma). */
export class StorageFullError extends Error {
  constructor(message = 'Almacenamiento insuficiente en el dispositivo.') { super(message); this.name = 'StorageFullError'; }
}

export function isStorageFull(err: unknown): boolean {
  if (err instanceof StorageFullError) return true;
  const e = err as { code?: string; message?: string };
  return e?.code === 'ENOSPC' || /ENOSPC|No space left|SQLITE_FULL|database or disk is full|insufficient storage/i.test(e?.message ?? '');
}
