// db_init.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// データベースファイルへのパスを指定
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.serialize(() => {
  // 既存のテーブルを削除
  db.run(`DROP TABLE IF EXISTS presentations`);
  db.run(`DROP TABLE IF EXISTS sessions`);
  db.run(`DROP TABLE IF EXISTS speakers`);
  db.run(`DROP TABLE IF EXISTS users`);

  // セッションテーブルの作成
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL
  )`);

  // スピーカーテーブルの作成
  db.run(`CREATE TABLE IF NOT EXISTS speakers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
  )`);

  // 発表テーブルの作成
  db.run(`CREATE TABLE IF NOT EXISTS presentations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    abstract TEXT NOT NULL,
    speaker_id INTEGER NOT NULL,
    co_authors TEXT,
    affiliation TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(id),
    FOREIGN KEY(speaker_id) REFERENCES speakers(id)
  )`);

  // ユーザーテーブルの作成
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  )`);
});

db.close();
