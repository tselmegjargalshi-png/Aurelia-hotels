import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type DB = DatabaseSync;

export function openDatabase(file: string): DB {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

/**
 * Runs `fn` inside a write transaction. BEGIN IMMEDIATE takes SQLite's write
 * lock up front, so the availability check and the insert that follows are
 * serialised against every other writer — including other server processes
 * sharing the same database file. This is what prevents double booking.
 */
export function writeTransaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/** SQLite returns plain objects; this narrows them for callers. */
export function all<T>(db: DB, sql: string, ...params: SqlParam[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function get<T>(db: DB, sql: string, ...params: SqlParam[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function run(db: DB, sql: string, ...params: SqlParam[]) {
  return db.prepare(sql).run(...params);
}

export type SqlParam = string | number | bigint | null | Uint8Array;
