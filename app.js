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

// SQLite データベースへの接続と初期化（省略）

// セッションストアの設定
let sessionStore;

// Redis クライアントの設定
async function initializeRedis() {
  if (process.env.REDIS_URL) {
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

    try {
      await redisClient.connect();
      console.log('Connected to Redis');

      sessionStore = new RedisStore({
        client: redisClient,
      });
    } catch (err) {
      console.error('Failed to connect to Redis:', err);
      console.error('Using MemoryStore for session management.');
      sessionStore = new session.MemoryStore();
    }
  } else {
    console.warn('REDIS_URL is not set. Using MemoryStore.');
    sessionStore = new session.MemoryStore();
  }
}

// アプリケーションの初期化
async function initializeApp() {
  await initializeRedis();

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

// アプリケーションの初期化を開始
initializeApp();
