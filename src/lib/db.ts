// Database layer.
//
// Two backends, chosen at runtime:
//   1. Turso (libSQL) over HTTP via the PURE-JS web client  -> when TURSO_URL is set.
//      (No native addon, so it works on Vercel and avoids the SIGBUS some
//       environments hit with the prebuilt native .node binding.)
//   2. In-memory SQLite via sql.js (WASM) -> fallback when no TURSO_URL.
//      Persists only for the lifetime of the process (fine for local dev / demo),
//      and is serverless-safe (writes to /tmp). Set TURSO_URL for real persistence.

export type Row = Record<string, any>;
export interface DB {
  execute(query: { sql: string; args?: any[] } | string): Promise<{ rows: Row[] }>;
  batch(queries: string[], _mode?: string): Promise<void>;
}

// ---- sql.js (fallback) adapter ----
let _sqljs: any = null;
async function getSqljs(): Promise<any> {
  if (_sqljs) return _sqljs;
  const init = require("sql.js");
  const fs = require("fs");
  const path = require("path");
  // Load the WASM binary explicitly from the committed file so it works on
  // serverless platforms (Vercel's tracer omits node_modules .wasm siblings).
  const wasmPath = path.join(process.cwd(), "sql-wasm.wasm");
  const wasmBinary = fs.readFileSync(wasmPath);
  _sqljs = await init({ wasmBinary });
  return _sqljs;
}

class SqljsDB implements DB {
  db: any;
  constructor(db: any) {
    this.db = db;
  }
  async execute(query: { sql: string; args?: any[] } | string) {
    const sql = typeof query === "string" ? query : query.sql;
    const args = typeof query === "string" ? [] : query.args || [];
    const stmt = this.db.prepare(sql);
    if (args.length) stmt.bind(args);
    const out: Row[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      out.push(row);
    }
    stmt.free();
    return { rows: out };
  }
  async batch(queries: string[]) {
    this.db.run("BEGIN");
    for (const q of queries) this.db.run(q);
    this.db.run("COMMIT");
  }
}

// ---- libSQL web (Turso) adapter ----
class LibsqlDB implements DB {
  client: any;
  constructor(client: any) {
    this.client = client;
  }
  async execute(query: { sql: string; args?: any[] } | string) {
    const res = await this.client.execute(query as any);
    return { rows: (res.rows as Row[]) || [] };
  }
  async batch(queries: string[]) {
    for (const q of queries) await this.client.execute(q);
  }
}

let _db: DB | null = null;
let _initPromise: Promise<DB> | null = null;

export function getDbUrl(): string {
  return process.env.TURSO_URL || process.env.DATABASE_URL || "";
}

export function getDbAuthToken(): string | undefined {
  return process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;
}

export async function getClient(): Promise<DB> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = (async () => {
      const url = getDbUrl();
      if (url) {
        const { createClient } = await import("@libsql/client/web");
        const client = createClient({ url, authToken: getDbAuthToken() });
        const db = new LibsqlDB(client);
        await ensureSchema(db);
        _db = db;
        return db;
      }
      // Fallback: in-memory sql.js
      const SQL = await getSqljs();
      const db = new SqljsDB(new SQL.Database());
      await ensureSchema(db);
      _db = db;
      return db;
    })();
  }
  return _initPromise;
}

export async function ensureSchema(db: DB): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY, source_url TEXT NOT NULL, title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', owner_id TEXT, is_public INTEGER NOT NULL DEFAULT 1,
      version_label TEXT, last_synced TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS source_pages (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT,
      markdown TEXT, hash TEXT, last_crawled TEXT,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_source_pages_space ON source_pages(space_id);`,
    `CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, page_id TEXT, content TEXT NOT NULL,
      embedding TEXT, section_title TEXT,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE,
      FOREIGN KEY (page_id) REFERENCES source_pages(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_chunks_space ON chunks(space_id);`,
    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);`,
    `CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY, space_id TEXT NOT NULL, title TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0, content_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX IF NOT EXISTS idx_lessons_space ON lessons(space_id);`,
    `CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, question TEXT NOT NULL,
      options TEXT NOT NULL, correct_index INTEGER NOT NULL,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );`,
    `CREATE TABLE IF NOT EXISTS user_progress (
      user_id TEXT NOT NULL, space_id TEXT NOT NULL, lesson_id TEXT, xp INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT, PRIMARY KEY (user_id, space_id, lesson_id)
    );`,
    `CREATE TABLE IF NOT EXISTS streaks (
      user_id TEXT PRIMARY KEY, current_streak INTEGER NOT NULL DEFAULT 0, last_activity_date TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT, name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );`,
  ];
  await db.batch(statements);
}

export function newId(prefix = "id"): string {
  const rnd =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rnd.replace(/-/g, "").slice(0, 24)}`;
}
