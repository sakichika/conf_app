// app.js

const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 未処理の例外をキャッチ
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const app = express();
const port = process.env.PORT || 3000;

// リクエストごとのログを追加
app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.url}`);
  next();
});

// SQLite データベースへの接続と初期化
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err);
  } else {
    console.log('Connected to SQLite database.');

    // データベースの初期化とシードデータの挿入
    db.serialize(() => {
      // テーブルの削除
      db.run(`DROP TABLE IF EXISTS users`);
      db.run(`DROP TABLE IF EXISTS sessions`);
      db.run(`DROP TABLE IF EXISTS presentations`);
      db.run(`DROP TABLE IF EXISTS speakers`);

      // テーブルの作成
      db.run(`CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
      )`);

      db.run(`CREATE TABLE sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        start_time TEXT,
        end_time TEXT
      )`);

      db.run(`CREATE TABLE speakers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT
      )`);

      db.run(`CREATE TABLE presentations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        title TEXT,
        abstract TEXT,
        speaker_id INTEGER,
        co_authors TEXT,
        affiliation TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(speaker_id) REFERENCES speakers(id)
      )`);

      // カスタムデータの定義
      const sessionsData = [
        {
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
            // 他の発表を追加可能
          ]
        },
        {
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
            // 他の発表を追加可能
          ]
        },
        // 他のセッションを追加可能
      ];

      // セッションデータの挿入
      const sessionStmt = db.prepare(`INSERT INTO sessions (title, start_time, end_time) VALUES (?, ?, ?)`);
      sessionsData.forEach(session => {
        sessionStmt.run(session.title, session.start_time, session.end_time, (err) => {
          if (err) {
            console.error('Error inserting session:', err);
          }
        });
      });
      sessionStmt.finalize();

      // スピーカーデータの挿入
      const speakerSet = new Set();
      sessionsData.forEach(session => {
        session.presentations.forEach(presentation => {
          speakerSet.add(presentation.speaker_name);
        });
      });

      const speakerStmt = db.prepare(`INSERT INTO speakers (name) VALUES (?)`);
      const speakerIdMap = {};
      let speakerIdCounter = 1;
      speakerSet.forEach(speakerName => {
        speakerStmt.run(speakerName, (err) => {
          if (err) {
            console.error('Error inserting speaker:', err);
          }
        });
        speakerIdMap[speakerName] = speakerIdCounter;
        speakerIdCounter++;
      });
      speakerStmt.finalize();

      // 発表データの挿入
      const presentationStmt = db.prepare(`
        INSERT INTO presentations (session_id, title, abstract, speaker_id, co_authors, affiliation)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      sessionsData.forEach((session, sessionIndex) => {
        const sessionId = sessionIndex + 1; // セッションIDは1から開始
        session.presentations.forEach(presentation => {
          const speakerId = speakerIdMap[presentation.speaker_name];
          presentationStmt.run(
            sessionId,
            presentation.title,
            presentation.abstract,
            speakerId,
            presentation.co_authors,
            presentation.affiliation,
            (err) => {
              if (err) {
                console.error('Error inserting presentation:', err);
              }
            }
          );
        });
      });
      presentationStmt.finalize();

      // ユーザーデータの挿入（パスワードはハッシュ化）
      const userStmt = db.prepare(`INSERT INTO users (username, password) VALUES (?, ?)`);
      const hashedPassword = bcrypt.hashSync("password123", 10);
      userStmt.run("admin", hashedPassword, (err) => {
        if (err) {
          console.error('Error inserting user:', err);
        }
      });
      userStmt.finalize();

      console.log('Database initialized and seeded.');
    });
  }
});

// セッションストアの設定
let sessionStore;
if (process.env.REDIS_URL) {
  // Redis クライアントの設定
  const redisClient = createClient({
    url: process.env.REDIS_URL,
    socket: {
      tls: true,
      rejectUnauthorized: false,
    },
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error', err);
  });

  redisClient.on('connect', () => {
    console.log('Connected to Redis');
  });

  redisClient.on('ready', () => {
    console.log('Redis client is ready');
  });

  // Redis クライアントの接続
  redisClient.connect().then(() => {
    sessionStore = new RedisStore({
      client: redisClient,
    });

    // セッションの設定
    app.use(session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || 'your_secret_key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60,
      },
    }));

    // アプリケーションのルートやミドルウェアを設定
    initializeApp();
  }).catch((err) => {
    console.error('Failed to connect to Redis:', err);
    // フォールバックとして MemoryStore を使用
    fallbackToMemoryStore();
  });
} else {
  console.warn('REDIS_URL is not set. Using default MemoryStore.');
  fallbackToMemoryStore();
}

function fallbackToMemoryStore() {
  sessionStore = new session.MemoryStore();

  // セッションの設定
  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 1000 * 60 * 60,
    },
  }));

  // アプリケーションのルートやミドルウェアを設定
  initializeApp();
}

function initializeApp() {
  // ボディパーサーの設定
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());

  // 認証が必要なルートに適用するミドルウェア
  function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
      next();
    } else {
      res.redirect('/login');
    }
  }

  // ログインページの表示
  app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  });

  // ログイン処理
  app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('サーバーエラーが発生しました。');
      }
      if (user) {
        const passwordMatches = bcrypt.compareSync(password, user.password);
        if (passwordMatches) {
          req.session.userId = user.id;
          console.log('Login successful for user:', username);
          return res.redirect('/');
        } else {
          console.warn('Password mismatch for user:', username);
        }
      } else {
        console.warn('User not found:', username);
      }
      res.send('ユーザー名またはパスワードが間違っています。');
    });
  });

  // ログアウト処理
  app.get('/logout', (req, res) => {
    req.session.destroy(err => {
      if (err) {
        console.error('Session destruction error:', err);
        return res.status(500).send('サーバーエラーが発生しました。');
      }
      res.redirect('/login');
    });
  });

  // 静的ファイルとAPIに認証を適用
  app.use('/api', requireAuth);
  app.use('/', requireAuth, express.static('public'));

  // セッション一覧を取得するAPI
  app.get('/api/sessions', (req, res) => {
    db.all(`SELECT * FROM sessions ORDER BY start_time`, [], (err, sessions) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('データベースエラーが発生しました。');
      }
      res.json(sessions);
    });
  });

  // セッション詳細と発表情報を取得するAPI
  app.get('/api/sessions/:id', (req, res) => {
    const sessionId = req.params.id;
    db.get('SELECT * FROM sessions WHERE id = ?', [sessionId], (err, session) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).send('データベースエラーが発生しました。');
      }
      if (!session) {
        return res.status(404).send('セッションが見つかりません。');
      }
      db.all(`
        SELECT presentations.*, speakers.name AS speaker_name
        FROM presentations
        LEFT JOIN speakers ON presentations.speaker_id = speakers.id
        WHERE presentations.session_id = ?
      `, [sessionId], (err, presentations) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).send('データベースエラーが発生しました。');
        }
        res.json({ session, presentations });
      });
    });
  });

  // エラーハンドリングミドルウェア
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal Server Error');
  });

  // サーバーの起動
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}
