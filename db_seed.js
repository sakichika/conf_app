const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  // セッションデータの挿入
  const sessionStmt = db.prepare(`INSERT INTO sessions (title, start_time, end_time) VALUES (?, ?, ?)`);
  sessionStmt.run("セッション1", "2022-01-01 09:00", "2022-01-01 10:00");
  sessionStmt.finalize();

  // スピーカーデータの挿入
  const speakerStmt = db.prepare(`INSERT INTO speakers (name) VALUES (?)`);
  speakerStmt.run("講演者A");
  speakerStmt.run("講演者B");
  speakerStmt.run("講演者C");
  speakerStmt.run("講演者D");
  speakerStmt.run("講演者E");
  speakerStmt.run("講演者F");
  speakerStmt.finalize();

  // 発表データの挿入
  const presentationStmt = db.prepare(`INSERT INTO presentations (session_id, title, abstract, speaker_id, co_authors, affiliation) VALUES (?, ?, ?, ?, ?, ?)`);
  presentationStmt.run(1, "発表タイトル1", "発表要旨1", 1, "共著者A", "所属A");
  presentationStmt.run(1, "発表タイトル2", "発表要旨2", 2, "共著者B", "所属B");
  presentationStmt.run(1, "発表タイトル3", "発表要旨3", 3, "共著者C", "所属C");
  presentationStmt.run(1, "発表タイトル4", "発表要旨4", 4, "共著者D", "所属D");
  presentationStmt.run(1, "発表タイトル5", "発表要旨5", 5, "共著者E", "所属E");
  presentationStmt.run(1, "発表タイトル6", "発表要旨6", 6, "共著者F", "所属F");
  presentationStmt.finalize();

  // ユーザーデータの挿入（パスワードはハッシュ化）
  const userStmt = db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`);
  const hashedPassword = bcrypt.hashSync("password123", 10);
  userStmt.run("admin", hashedPassword);
  userStmt.finalize();
});

db.close();
