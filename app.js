const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./database.sqlite');

// ポート設定
const port = process.env.PORT || 3000;

// セッションの設定
app.use(session({
  secret: 'your_secret_key', // 適切な秘密鍵に変更してください
  resave: false,
  saveUninitialized: false
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
      return res.status(500).send('サーバーエラーが発生しました。');
    }
    if (user && bcrypt.compareSync(password, user.password)) {
      req.session.userId = user.id;
      res.redirect('/');
    } else {
      res.send('ユーザー名またはパスワードが間違っています。');
    }
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