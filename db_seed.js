const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
  // セッションデータの挿入
  const sessionStmt = db.prepare(`INSERT INTO sessions (title, start_time, end_time) VALUES (?, ?, ?)`);
  sessionStmt.run("セッション1", "2022-01-01 09:00", "2022-01-01 10:00");
  sessionStmt.run("セッション2", "2022-01-01 10:00", "2022-01-01 11:00");
  sessionStmt.finalize();

  // スピーカーデータの挿入
  const speakerStmt = db.prepare(`INSERT INTO speakers (name, affiliation) VALUES (?, ?)`);
  speakerStmt.run("発表者A", "所属A");
  speakerStmt.run("発表者B", "所属B");
  speakerStmt.run("発表者C", "所属C");
  speakerStmt.run("発表者D", "所属D");
  speakerStmt.run("発表者E", "所属E");
  speakerStmt.run("発表者F", "所属F");
  speakerStmt.finalize();

  // プレゼンテーションデータの挿入
  const presentationStmt = db.prepare(`INSERT INTO presentations (session_id, speaker_id, title, abstract, co_authors) VALUES (?, ?, ?, ?, ?)`);
  // セッション1のプレゼンテーション
  presentationStmt.run(1, 1, "発表タイトル1", "要旨1", "共著者1, 共著者2");
  presentationStmt.run(1, 2, "発表タイトル2", "要旨2", "共著者3, 共著者4");
  presentationStmt.run(1, 3, "発表タイトル3", "要旨3", "共著者5");
  presentationStmt.run(1, 4, "発表タイトル4", "要旨4", null);
  presentationStmt.run(1, 5, "発表タイトル5", "要旨5", "共著者6, 共著者7");
  presentationStmt.run(1, 6, "発表タイトル6", "要旨6", "共著者8");
  // セッション2のプレゼンテーション
  presentationStmt.run(2, 1, "発表タイトル7", "要旨7", "共著者9");
  presentationStmt.finalize();
});

db.close();
