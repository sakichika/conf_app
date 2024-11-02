// app.js

const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// 環境変数の設定
const PORT = process.env.PORT || 10000; // Render ではポート10000が推奨される場合があります
const NODE_ENV = process.env.NODE_ENV || 'development';

// データベースファイルのパス設定
const dbPath = NODE_ENV === 'production' ? '/tmp/database.sqlite' : path.join(__dirname, 'database.sqlite');

// SQLite データベースへの接続と初期化
let db;

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    // データベースファイルが存在しない場合は作成
    const dbExists = fs.existsSync(dbPath);

    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Failed to connect to SQLite database:', err);
        return reject(err);
      } else {
        console.log('Connected to SQLite database.');

        db.serialize(() => {
          // テーブルの作成
          db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            start_time TEXT,
            end_time TEXT
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS speakers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            bio TEXT
          )`);

          db.run(`CREATE TABLE IF NOT EXISTS presentations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            speaker_id INTEGER,
            title TEXT,
            description TEXT,
            co_authors TEXT,
            affiliation TEXT,
            FOREIGN KEY(session_id) REFERENCES sessions(id),
            FOREIGN KEY(speaker_id) REFERENCES speakers(id)
          )`);

          if (!dbExists) {
            // データベースが新規作成された場合のみシードデータを挿入
            seedDatabase().then(() => {
              console.log('Database initialized and seeded.');
              resolve();
            }).catch((err) => {
              console.error('Failed to seed database:', err);
              reject(err);
            });
          } else {
            console.log('Database already initialized.');
            resolve();
          }
        });
      }
    });
  });
}

// データベースのシードデータ挿入
function seedDatabase() {
  return new Promise((resolve, reject) => {
    // カスタムデータの定義
    const sessionsData = [
      {
        title: 'セッション1',
        description: 'セッション1の説明',
        start_time: '2022-01-01 09:00',
        end_time: '2022-01-01 10:00',
        presentations: [
          {
            title: '発表タイトル1',
            description: '発表説明1',
            speaker_name: '講演者A',
            bio: '講演者Aのバイオ',
            co_authors: '共著者A1, 共著者A2',
            affiliation: '所属A'
          },
          {
            title: '発表タイトル2',
            description: '発表説明2',
            speaker_name: '講演者B',
            bio: '講演者Bのバイオ',
            co_authors: '共著者B1, 共著者B2',
            affiliation: '所属B'
          }
          // 他の発表を追加可能
        ]
      },
      {
        title: 'セッション2',
        description: 'セッション2の説明',
        start_time: '2022-01-01 10:30',
        end_time: '2022-01-01 11:30',
        presentations: [
          {
            title: '発表タイトル3',
            description: '発表説明3',
            speaker_name: '講演者C',
            bio: '講演者Cのバイオ',
            co_authors: '共著者C1',
            affiliation: '所属C'
          }
          // 他の発表を追加可能
        ]
      }
      // 他のセッションを追加可能
    ];

    // セッションデータの挿入
    const sessionStmt = db.prepare(`INSERT INTO sessions (title, description, start_time, end_time) VALUES (?, ?, ?, ?)`);
    sessionsData.forEach(session => {
      sessionStmt.run(session.title, session.description, session.start_time, session.end_time);
    });
    sessionStmt.finalize();

    // スピーカーデータの挿入
    const speakerSet = new Set();
    sessionsData.forEach(session => {
      session.presentations.forEach(presentation => {
        speakerSet.add(presentation.speaker_name);
      });
    });

    const speakerStmt = db.prepare(`INSERT INTO speakers (name, bio) VALUES (?, ?)`);
    const speakerIdMap = {};
    let speakerIdCounter = 1;
    speakerSet.forEach(speakerName => {
      const speakerBio = sessionsData.flatMap(session => session.presentations)
        .find(p => p.speaker_name === speakerName)?.bio || '';
      speakerStmt.run(speakerName, speakerBio);
      speakerIdMap[speakerName] = speakerIdCounter;
      speakerIdCounter++;
    });
    speakerStmt.finalize();

    // 発表データの挿入
    const presentationStmt = db.prepare(`
      INSERT INTO presentations (session_id, speaker_id, title, description, co_authors, affiliation)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    sessionsData.forEach((session, sessionIndex) => {
      const sessionId = sessionIndex + 1; // セッションIDは1から開始
      session.presentations.forEach(presentation => {
        const speakerId = speakerIdMap[presentation.speaker_name];
        presentationStmt.run(
          sessionId,
          speakerId,
          presentation.title,
          presentation.description,
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

    resolve();
  });
}

// Redis クライアントの設定
async function initializeRedis() {
  if (process.env.REDIS_URL) {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        tls: true,
        rejectUnauthorized: false,
        connectTimeout: 5000 // 接続タイムアウトを5秒に設定
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    try {
      await redisClient.connect();
      console.log('Connected to Redis');

      return new RedisStore({
        client: redisClient,
      });
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      console.error('Using MemoryStore for session management.');
      return new session.MemoryStore();
    }
  } else {
    console.warn('REDIS_URL is not set. Using MemoryStore.');
    return new session.MemoryStore();
  }
}

// メインの初期化関数
async function main() {
  try {
    await initializeDatabase();
  } catch (err) {
    console.error('Database initialization failed:', err);
    process.exit(1); // データベースの初期化に失敗した場合、アプリケーションを終了
  }

  const sessionStore = await initializeRedis();

  // Express アプリケーションの設定
  const app = express();

  // リクエストごとのログを追加
  app.use((req, res, next) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    next();
  });

  // セッションの設定
  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // HTTPS を使用する場合は true に設定
      maxAge: 1000 * 60 * 60, // 1時間
    },
  }));

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
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// メインの初期化関数を実行
main();
