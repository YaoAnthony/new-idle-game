import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import { getDbPath } from './config.js'

/**
 * SQLite 连接与迁移。**Persistent Storage 变更必须使用 Migration**
 * （Backend AGENTS.md）——哪怕现在只有一条建表迁移，纪律从第一天立起：
 * 改表就追加一条，永不改已发布的旧条目。风格对齐客户端
 * Data/Save/migrations.ts 的"版本链"思路，但服务端简单得多：纯 SQL 顺跑。
 *
 * 测试环境（NODE_ENV=test）走 :memory:，每个进程一份、互不干扰、零清理。
 */

const MIGRATIONS: ReadonlyArray<{ version: number; up: string }> = [
  {
    version: 1,
    up: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        google_sub TEXT UNIQUE,
        created_at_utc TEXT NOT NULL
      );

      CREATE TABLE cloud_saves (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        revision INTEGER NOT NULL,
        save_schema_version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        last_write_id TEXT NOT NULL,
        updated_at_utc TEXT NOT NULL,
        prev_payload TEXT,
        prev_revision INTEGER
      );
    `,
  },
]

let database: Database.Database | null = null

export function getDb(): Database.Database {
  if (database) return database

  const dbPath = getDbPath()
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true })
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`)
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
      (row) => row.version,
    ),
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    const run = db.transaction(() => {
      db.exec(migration.up)
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version)
    })
    run()
  }

  database = db
  return db
}

/** 测试专用：关掉并丢弃连接，让下一次 getDb 重建一份干净的 :memory: */
export function resetDbForTests(): void {
  database?.close()
  database = null
}
