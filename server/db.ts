import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
export const uploadsDir = path.join(dataDir, 'uploads')
export const dbPath = path.join(dataDir, 'dictation.db')

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

let _db: Database.Database | null = null

export function getDb() {
  if (!_db) throw new Error('Database not initialized')
  return _db
}

/** Prefer getDb(); kept for existing imports after init. */
export const db = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getDb(), prop, receiver)
    return typeof value === 'function' ? value.bind(getDb()) : value
  },
})

export function openDatabase() {
  if (_db) return _db
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      original_name TEXT NOT NULL,
      page_count INTEGER NOT NULL DEFAULT 0,
      pages_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS page_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      word_count INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      last_practiced_at TEXT,
      UNIQUE(user_id, document_id, page_index),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wrong_words (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      document_id TEXT,
      page_index INTEGER,
      word TEXT NOT NULL,
      expected TEXT NOT NULL,
      written TEXT,
      times INTEGER NOT NULL DEFAULT 1,
      last_wrong_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL
    );
  `)
  return _db
}

export function reopenDatabase() {
  if (_db) {
    try {
      _db.close()
    } catch {
      /* ignore */
    }
    _db = null
  }
  return openDatabase()
}
