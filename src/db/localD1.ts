import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export class LocalD1PreparedStatement {
  constructor(private db: Database.Database, private sql: string, private params: any[] = []) {}

  bind(...values: any[]): D1PreparedStatement {
    return new LocalD1PreparedStatement(this.db, this.sql, values) as unknown as D1PreparedStatement;
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.params) as any;
    if (!row) return null;
    if (colName) return row[colName] ?? null;
    return row as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
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
    const stmt = this.db.prepare(this.sql);
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
    const stmt = this.db.prepare(this.sql);
    return stmt.raw(true).all(...this.params);
  }
}

export class LocalD1Database {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema() {
    const migrationFile = path.resolve(__dirname, '../../migrations/0001_initial_schema.sql');
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
}

export function createLocalD1Database(dbPath = './.sqlite/iocl_local.db'): D1Database {
  return new LocalD1Database(dbPath) as unknown as D1Database;
}
