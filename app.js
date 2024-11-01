// app.js

const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis')(session); // redis@3.1.2 を使用
const redis = require('redis'); // redis@3.1.2 を使用
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = process.env.PORT || 3000;

// SQLite データベースへの接続と初期化
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err);
  } else {
    console.log('Connected to SQLite database.');

    // データベースの初期化とシードデータの挿入
    db.serialize(() => {
      // **テーブルの削除**
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
        description TEXT,
        start_time TEXT,
        end_time TEXT
      )`);

      db.run(`CREATE TABLE presentations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        speaker_id INTEGER,
        title TEXT,
        description TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(speaker_id) REFERENCES speakers(id)
      )`);

      db.run(`CREATE TABLE speakers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        bio TEXT
      )`);

      // サンプルデータの挿入
      const hashedPassword = bcrypt.hashSync('password', 10);
      db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, ['admin', hashedPassword]);

      // セッションデータの挿入
      db.run(`INSERT INTO sessions (id, title, description, start_time, end_time) VALUES (?, ?, ?, ?, ?)`, [
        1,
        'Opening Ceremony',
        'Welcome to the conference!',
        '2023-01-01 09:00',
        '2023-01-01 10:00'
      ]);

      // スピーカーデータの挿入
      db.run(`INSERT INTO speakers (id, name, bio) VALUES (?, ?, ?)`, [
        1,
        'John Doe',
        'An expert in AI technologies.'
      ]);

      // プレゼンテーションデータの挿入
      db.run(`INSERT INTO presentations (id, session_id, speaker_id, title, description) VALUES (?, ?, ?, ?, ?)`, [
        1,
        1,
        1,
        'The Future of AI',
        'Exploring the advancements in AI.'
      ]);

      console.log('Database initialized and seeded.');
    });
  }
});

// セッションストアの設定
let sessionStore;
if (process.env.REDIS_URL) {
  // Redis クライアントの設定
  const redisClient = redis.createClient({
    url: process.env.REDIS_URL,
    tls: {
      rejectUnauthorized: false,
    },
  });

  redisClient.on('error', (err) => {
    console.error('Redis Client Error', err);
  });

  redisClient.on('connect', () => {
    console.log('Connected to Redis');
  });

  sessionStore = new RedisStore({ client: redisClient });
} else {
  console.warn('REDIS_URL is not set. Using default MemoryStore.');
  sessionStore = new session.MemoryStore();
}

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
  db.all(`
    SELECT sessions.*
    FROM sessions
    ORDER BY sessions.start_time
  `, [], (err, sessions) => {
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

// サーバーの起動
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
