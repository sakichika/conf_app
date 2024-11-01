// db_seed.js

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// データベースファイルへのパスを指定
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

db.serialize(() => {
  // カスタムデータの定義
  const sessions = [
    {
      id: 1,
      title: 'セッション1',
      start_time: '2022-01-01 09:00',
      end_time: '2022-01-01 10:00',
      presentations: [
        {
          title: '発表タイトル1',
          abstract: '発表要旨1の本文',
          speaker_name: '講演者A',
          co_authors: '共著者A1, 共著者A2',
          affiliation: '所属A'
        },
        {
          title: '発表タイトル2',
          abstract: '発表要旨2の本文',
          speaker_name: '講演者B',
          co_authors: '共著者B1, 共著者B2',
          affiliation: '所属B'
        },
        // 他の発表を追加
      ]
    },
    {
      id: 2,
      title: 'セッション2',
      start_time: '2022-01-01 10:30',
      end_time: '2022-01-01 11:30',
      presentations: [
        {
          title: '発表タイトル3',
          abstract: '発表要旨3の本文',
          speaker_name: '講演者C',
          co_authors: '共著者C1',
          affiliation: '所属C'
        },
        // 他の発表を追加
      ]
    },
    // 他のセッションを追加
  ];

  // セッションデータの挿入
  const sessionStmt = db.prepare(`INSERT INTO sessions (title, start_time, end_time) VALUES (?, ?, ?)`);
  sessions.forEach(session => {
    sessionStmt.run(session.title, session.start_time, session.end_time);
  });
  sessionStmt.finalize();

  // スピーカーデータの挿入
  const speakerSet = new Set();
  sessions.forEach(session => {
    session.presentations.forEach(presentation => {
      speakerSet.add(presentation.speaker_name);
    });
  });

  const speakerStmt = db.prepare(`INSERT INTO speakers (name) VALUES (?)`);
  const speakerIdMap = {};
  let speakerIdCounter = 1;
  speakerSet.forEach(speakerName => {
    speakerStmt.run(speakerName);
    speakerIdMap[speakerName] = speakerIdCounter;
    speakerIdCounter++;
  });
  speakerStmt.finalize();

  // 発表データの挿入
  const presentationStmt = db.prepare(`
    INSERT INTO presentations (session_id, title, abstract, speaker_id, co_authors, affiliation)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  sessions.forEach((session, sessionIndex) => {
    const sessionId = sessionIndex + 1; // セッションIDは1から開始
    session.presentations.forEach(presentation => {
      const speakerId = speakerIdMap[presentation.speaker_name];
      presentationStmt.run(
        sessionId,
        presentation.title,
        presentation.abstract,
        speakerId,
        presentation.co_authors,
        presentation.affiliation
      );
    });
  });
  presentationStmt.finalize();

  // ユーザーデータの挿入（パスワードはハッシュ化）
  const userStmt = db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`);
  const hashedPassword = bcrypt.hashSync("password123", 10);
  userStmt.run("admin", hashedPassword);
  userStmt.finalize();
});

db.close();
