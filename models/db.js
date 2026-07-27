"use strict";

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DB_DIR = path.join(__dirname, "..", "database");
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "sos.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    owner TEXT NOT NULL,
    total INTEGER NOT NULL,
    minimum INTEGER NOT NULL,
    time TEXT NOT NULL,
    expiration TEXT,
    description TEXT DEFAULT '',
    FOREIGN KEY (owner) REFERENCES users(username)
  );
`);

module.exports = db;
