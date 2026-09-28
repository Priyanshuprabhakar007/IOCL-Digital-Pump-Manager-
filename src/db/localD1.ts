import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const nodeRequire = typeof require !== 'undefined' ? require : createRequire(import.meta.url);

interface SqliteStatement {
  get(...params: any[]): any;
  run(...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  all(...params: any[]): any[];
  raw?(enable: boolean): { all(...params: any[]): any[] };
  values?(...params: any[]): any[];
}

interface SqliteDb {
  exec(sql: string): void;
  prepare?(sql: string): SqliteStatement;
  query?(sql: string): SqliteStatement;
  close(): void;
}

export class LocalD1PreparedStatement {
  constructor(private db: SqliteDb, private sql: string, private params: any[] = []) {}

  bind(...values: any[]): D1PreparedStatement {
    return new LocalD1PreparedStatement(this.db, this.sql, values) as unknown as D1PreparedStatement;
  }

  private getStatement(): SqliteStatement {
    if (typeof this.db.query === 'function') {
      return this.db.query(this.sql);
    }
    if (typeof this.db.prepare === 'function') {
      return this.db.prepare(this.sql);
    }
    throw new Error('Unsupported sqlite database instance');
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const stmt = this.getStatement();
    const row = stmt.get(...this.params) as any;
    if (!row) return null;
    if (colName) return row[colName] ?? null;
    return row as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.getStatement();
    const info = stmt.run(...this.params);
    return {
      results: [],
      success: true,
      meta: {
        duration: 1,
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
        served_by: 'local-sqlite',
        queries_executed: 1,
        size_after: 0,
        rows_read: 0,
        rows_written: info.changes,
        changed_db: false,
      },
    };
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.getStatement();
    const results = stmt.all(...this.params) as T[];
    return {
      results,
      success: true,
      meta: {
        duration: 1,
        changes: 0,
        last_row_id: 0,
        served_by: 'local-sqlite',
        queries_executed: 1,
        size_after: 0,
        rows_read: results.length,
        rows_written: 0,
        changed_db: false,
      },
    };
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<any> {
    const stmt = this.getStatement();
    if (typeof stmt.values === 'function') {
      return stmt.values(...this.params);
    }
    if (typeof stmt.raw === 'function') {
      return stmt.raw(true).all(...this.params);
    }
    return stmt.all(...this.params);
  }
}

export class LocalD1Database {
  private db: SqliteDb;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const isBun = typeof (globalThis as any).Bun !== 'undefined';
    if (isBun) {
      const { Database: BunDatabase } = nodeRequire('bun:sqlite');
      const bdb = new BunDatabase(dbPath);
      bdb.exec('PRAGMA journal_mode = WAL;');
      bdb.exec('PRAGMA foreign_keys = ON;');
      this.db = bdb;
    } else {
      const BetterSqlite = nodeRequire('better-sqlite3');
      const sdb = new BetterSqlite(dbPath);
      sdb.pragma('journal_mode = WAL');
      sdb.pragma('foreign_keys = ON');
      this.db = sdb;
    }

    this.initSchema();
  }

  private initSchema() {
    const migrationFile = path.resolve(process.cwd(), 'migrations/0001_initial_schema.sql');
    if (fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, 'utf8');
      this.db.exec(sql);
    }
  }

  prepare(query: string): D1PreparedStatement {
    return new LocalD1PreparedStatement(this.db, query) as unknown as D1PreparedStatement;
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('dump not implemented in LocalD1');
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const stmt of statements) {
      const res = await stmt.all<T>();
      results.push(res);
    }
    return results;
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.db.exec(query);
    return {
      count: 1,
      duration: 1,
    };
  }

  close(): void {
    try {
      this.db.close();
    } catch (e) {
      // ignore if already closed
    }
  }
}

export function createLocalD1Database(dbPath = './.sqlite/iocl_local.db'): D1Database & { close: () => void } {
  return new LocalD1Database(dbPath) as unknown as D1Database & { close: () => void };
}
