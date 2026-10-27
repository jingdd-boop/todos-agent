import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "todo.db");

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`);
