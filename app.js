const express = require('express');
const app = express();
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

// 静的ファイルを提供
app.use(express.static('public'));

// セッション一覧を取得するAPI
app.get('/api/sessions', (req, res) => {
  db.all(`SELECT * FROM sessions`, [], (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    res.json(rows);
  });
});

// 特定のセッション内のプレゼンテーション一覧を取得するAPI
app.get('/api/sessions/:id/presentations', (req, res) => {
  const sessionId = req.params.id;
  db.all(`
    SELECT presentations.*, speakers.name AS speaker_name, speakers.affiliation
    FROM presentations
    JOIN speakers ON presentations.speaker_id = speakers.id
    WHERE presentations.session_id = ?
  `, [sessionId], (err, rows) => {
    if (err) {
      return res.status(500).send(err.message);
    }
    res.json(rows);
  });
});

// サーバーを起動
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
