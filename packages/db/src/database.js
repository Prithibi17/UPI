import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate.js';
import { TursoBridge, getTursoConfig } from './turso-bridge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Checks if core tables exist and executes migrations if not yet initialized.
 * @param {Database} db
 */
export function ensureDatabaseInitialized(db) {
  try {
    const row = db.queryOne("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='merchants'");
    if (!row || Number(row.count) === 0) {
      return runMigrations(db);
    }
  } catch {
    return runMigrations(db);
  }
}

/**
 * Universal Database Client for YOUPI PG.
 * Uses native node:sqlite for local testing and high-performance embedded operation,
 * or Turso LibSQL for cloud/serverless persistent multi-instance synchronization.
 */
export class Database {
  /**
   * @param {{ dbPath?: string, inMemory?: boolean, autoMigrate?: boolean, useTurso?: boolean }} [options={}]
   */
  constructor(options = {}) {
    this.isTurso = false;
    this.turso = null;

    const tursoConfig = getTursoConfig();
    const shouldTryTurso = !options.inMemory && options.useTurso !== false && (
      options.useTurso === true ||
      process.env.VERCEL ||
      process.env.USE_TURSO === 'true' ||
      (tursoConfig.enabled && process.env.NODE_ENV !== 'test')
    );

    if (shouldTryTurso) {
      try {
        this.turso = new TursoBridge(options);
        this.isTurso = true;
        console.log('[Database] Connected to Turso cloud database (LibSQL)');
      } catch (err) {
        console.warn('[Database] Failed to connect to Turso, falling back to local SQLite:', err.message);
        this.isTurso = false;
        this.turso = null;
      }
    }

    if (!this.isTurso) {
      if (options.inMemory) {
        this.db = new DatabaseSync(':memory:');
      } else {
        let dbPath;
        if (options.dbPath) {
          dbPath = path.isAbsolute(options.dbPath)
            ? options.dbPath
            : path.resolve(process.cwd(), options.dbPath);
        } else if (process.env.SQLITE_DB_PATH) {
          dbPath = path.isAbsolute(process.env.SQLITE_DB_PATH)
            ? process.env.SQLITE_DB_PATH
            : path.resolve(repoRoot, process.env.SQLITE_DB_PATH);
        } else if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT) {
          dbPath = path.join('/tmp', 'youpi_pg.sqlite');
        } else {
          dbPath = path.resolve(repoRoot, 'data/youpi_pg.sqlite');
        }

        try {
          const dir = path.dirname(dbPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
          }
          this.db = new DatabaseSync(dbPath);
          try { fs.chmodSync(dbPath, 0o600); } catch {}
          try { fs.chmodSync(dir, 0o700); } catch {}
        } catch (err) {
          if (err.code === 'EROFS' || err.message?.includes('read-only')) {
            console.warn('[Database] Read-only filesystem detected, falling back to /tmp/youpi_pg.sqlite');
            dbPath = path.join('/tmp', 'youpi_pg.sqlite');
            const tmpDir = path.dirname(dbPath);
            if (!fs.existsSync(tmpDir)) {
              fs.mkdirSync(tmpDir, { recursive: true });
            }
            this.db = new DatabaseSync(dbPath);
          } else {
            throw err;
          }
        }
      }

      // Enable foreign keys, busy timeout, and WAL mode for maximum concurrency and integrity
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec('PRAGMA busy_timeout = 5000;');
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
      } catch {}
    }

    // Auto-initialize schema if not in memory and autoMigrate not disabled
    if (!options.inMemory && options.autoMigrate !== false) {
      ensureDatabaseInitialized(this);
    }
  }

  /**
   * Normalizes parameter markers from PostgreSQL style ($1, $2) to SQLite style (?, ?).
   * @param {string} sql
   * @returns {string}
   */
  normalizeSql(sql) {
    return sql.replace(/\$\d+/g, '?');
  }

  /**
   * Executes a statement (INSERT, UPDATE, DELETE, DDL).
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {{ changes: number, lastInsertRowid: number | bigint }}
   */
  execute(sql, params = []) {
    if (this.isTurso) {
      return this.turso.execute(sql, params);
    }
    const normalized = this.normalizeSql(sql);
    const stmt = this.db.prepare(normalized);
    return stmt.run(...params);
  }

  run(sql, params = []) {
    return this.execute(sql, params);
  }

  /**
   * Queries multiple rows.
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {any[]}
   */
  query(sql, params = []) {
    if (this.isTurso) {
      return this.turso.query(sql, params);
    }
    const normalized = this.normalizeSql(sql);
    const stmt = this.db.prepare(normalized);
    return stmt.all(...params);
  }

  /**
   * Queries a single row.
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {any | null}
   */
  queryOne(sql, params = []) {
    if (this.isTurso) {
      return this.turso.queryOne(sql, params);
    }
    const normalized = this.normalizeSql(sql);
    const stmt = this.db.prepare(normalized);
    const res = stmt.get(...params);
    return res !== undefined ? res : null;
  }

  /**
   * Executes a batch of DDL or SQL statements.
   * @param {string} sql
   */
  exec(sql) {
    if (this.isTurso) {
      return this.turso.exec(sql);
    }
    this.db.exec(sql);
  }

  /**
   * Executes a callback within an ACID database transaction.
   * Automatically rolls back on exception.
   * @template T
   * @param {() => T} callback
   * @returns {T}
   */
  transaction(callback) {
    if (this.isTurso) {
      return this.turso.transaction(callback);
    }
    // IMMEDIATE (not DEFERRED) so the write lock is taken up front.
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }
  }

  /**
   * Closes the database connection.
   */
  close() {
    if (this.isTurso) {
      return this.turso.close();
    }
    this.db.close();
  }
}

let defaultDbInstance = null;

/**
 * Returns the singleton database instance.
 * @param {{ dbPath?: string, inMemory?: boolean }} [options={}]
 * @returns {Database}
 */
export function getDatabase(options = {}) {
  if (!defaultDbInstance) {
    defaultDbInstance = new Database(options);
    ensureDatabaseInitialized(defaultDbInstance);
  }
  return defaultDbInstance;
}
