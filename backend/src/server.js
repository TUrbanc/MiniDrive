import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

// ---------- constants ----------
const API_PORT = 8080;
const ALLOW_ORIGIN = '*';
const DB = {
  host: '127.0.0.1',
  port: 3306,
  user: 'minidrive_user',
  password: 'tilen4321',
  database: 'minidrive_db'
};
const ADMIN_REG_SECRET = 'hp';
const JWT_SECRET = 'very-simple-secret';
const STORAGE_ROOT = '/etc/minidrive/storage';
// --------------------------------

// Make sure base storage dir exists at boot
try {
  if (!fs.existsSync(STORAGE_ROOT)) fs.mkdirSync(STORAGE_ROOT, { recursive: true });
} catch (e) {
  console.error('Failed to ensure STORAGE_ROOT:', e);
}

const pool = mysql.createPool({ ...DB, connectionLimit: 10, charset: 'utf8mb4' });

const app = express();
app.use(morgan('tiny'));
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: ALLOW_ORIGIN }));
app.options('*', cors());

// -------- auth helpers ----------
function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}
function authRequired(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Manjka žeton.' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    req.user = { id: p.sub, username: p.username };
    return next();
  } catch {
    return res.status(401).json({ error: 'Neveljaven žeton.' });
  }
}
// -------------------------------

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ---- AUTH: username only ----
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Manjkajo podatki.' });

    const [rows] = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (!rows.length) return res.status(401).json({ error: 'Napačni podatki.' });

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Napačni podatki.' });

    const token = signToken(u);
    return res.json({ ok: true, token, user: { id: u.id, username: u.username } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// ---- ADMIN: register/list/delete ----
app.post('/api/admin/register', async (req, res) => {
  try {
    const { secret, username, password } = req.body || {};
    if (secret !== ADMIN_REG_SECRET) return res.status(403).json({ error: 'Napačen skrivni ključ.' });
    if (!username || !password) return res.status(400).json({ error: 'Manjkajo podatki.' });

    const [exists] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    if (exists.length) return res.status(409).json({ error: 'Uporabnik že obstaja.' });

    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (username, password_hash) VALUES (?,?)', [username, hash]);
    return res.status(201).json({ ok: true, message: 'Registracija uspešna.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.post('/api/admin/users/list', async (req, res) => {
  try {
    const { secret } = req.body || {};
    if (secret !== ADMIN_REG_SECRET) return res.status(403).json({ error: 'Napačen skrivni ključ.' });

    const [rows] = await pool.query(`
      SELECT u.id, u.username, u.created_at, COUNT(f.id) AS file_count
      FROM users u
      LEFT JOIN files f ON f.owner_user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return res.json({ users: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.post('/api/admin/users/delete', async (req, res) => {
  try {
    const { secret, userId } = req.body || {};
    if (secret !== ADMIN_REG_SECRET) return res.status(403).json({ error: 'Napačen skrivni ključ.' });
    if (!userId) return res.status(400).json({ error: 'Manjka userId.' });

    const dir = path.join(STORAGE_ROOT, String(userId));
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}

    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// ---------- Files (Drive) ----------
function ensureUserDir(userId) {
  const dir = path.join(STORAGE_ROOT, String(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    try {
      const dir = ensureUserDir(req.user.id);
      cb(null, dir);
    } catch (e) {
      console.error('Upload destination error:', e);
      cb(e);
    }
  },
  filename: function(req, file, cb) {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({ storage });

app.get('/api/files', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, original_name, size_bytes, mime_type, created_at FROM files WHERE owner_user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    return res.json({ files: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.post('/api/files/upload', authRequired, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Ni datoteke.' });

    // Compute storage_path robustly from what multer actually used
    const destDir = req.file.destination || ensureUserDir(req.user.id);
    const storagePath = path.join(destDir, req.file.filename);

    // sanity check file exists
    try { fs.statSync(storagePath); }
    catch (e) {
      console.error('Uploaded file missing at expected path:', storagePath, e);
      return res.status(500).json({ error: 'Datoteke ni bilo mogoče shraniti (FS).' });
    }

    const originalname = req.file.originalname;
    const mimetype     = req.file.mimetype || null;
    const size         = req.file.size;
    const filename     = req.file.filename;

    await pool.query(
      `INSERT INTO files (owner_user_id, original_name, stored_name, mime_type, size_bytes, storage_path)
       VALUES (?,?,?,?,?,?)`,
      [req.user.id, originalname, filename, mimetype, size, storagePath]
    );

    console.log(`Upload OK user=${req.user.id} -> ${storagePath}`);
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error('upload error:', e);
    return res.status(500).json({ error: 'Napaka strežnika pri nalaganju.' });
  }
});

app.get('/api/files/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[f]] = await pool.query('SELECT * FROM files WHERE id = ? LIMIT 1', [id]);
    if (!f) return res.status(404).json({ error: 'Ni najdeno.' });

    const isOwner = f.owner_user_id === req.user.id;
    let isShared = false;
    if (!isOwner) {
      const [[s]] = await pool.query('SELECT can_download FROM file_shares WHERE file_id = ? AND target_user_id = ? LIMIT 1', [id, req.user.id]);
      isShared = !!s && !!s.can_download;
    }
    if (!isOwner && !isShared) return res.status(403).json({ error: 'Ni dostopa.' });
    if (!fs.existsSync(f.storage_path)) return res.status(410).json({ error: 'Datoteka manjka.' });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.original_name)}"`);
    return fs.createReadStream(f.storage_path).pipe(res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.delete('/api/files/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1', [id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ni najdeno.' });
    const f = rows[0];
    try { if (fs.existsSync(f.storage_path)) fs.unlinkSync(f.storage_path); } catch {}
    await pool.query('DELETE FROM files WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});
// -----------------------------------

// ===================== SHARING: user-to-user =====================
app.post('/api/shares/user', authRequired, async (req, res) => {
  try {
    const { fileId, targetUsername, canDownload = true } = req.body || {};
    if (!fileId || !targetUsername) return res.status(400).json({ error: 'Manjkajoči podatki.' });

    const [[file]] = await pool.query('SELECT * FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1', [fileId, req.user.id]);
    if (!file) return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });

    const [[target]] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [targetUsername]);
    if (!target) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Ne moreš deliti samemu sebi.' });

    await pool.query(`
      INSERT INTO file_shares (file_id, owner_user_id, target_user_id, can_download)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE can_download = VALUES(can_download)
    `, [fileId, req.user.id, target.id, canDownload ? 1 : 0]);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.get('/api/shares/incoming', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.id AS share_id, f.id AS file_id, f.original_name, f.size_bytes, f.created_at,
             u.username AS owner_username, s.can_download
      FROM file_shares s
      JOIN files f ON f.id = s.file_id
      JOIN users u ON u.id = s.owner_user_id
      WHERE s.target_user_id = ?
      ORDER BY s.created_at DESC
    `, [req.user.id]);
    return res.json({ items: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.get('/api/shares/file/:fileId', authRequired, async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const [[file]] = await pool.query('SELECT id FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1', [fileId, req.user.id]);
    if (!file) return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });
    const [rows] = await pool.query(`
      SELECT s.id AS share_id, u.username AS target_username, s.can_download, s.created_at
      FROM file_shares s
      JOIN users u ON u.id = s.target_user_id
      WHERE s.file_id = ?
      ORDER BY s.created_at DESC
    `, [fileId]);
    return res.json({ shares: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.delete('/api/shares/user', authRequired, async (req, res) => {
  try {
    const { fileId, targetUsername } = req.body || {};
    if (!fileId || !targetUsername) return res.status(400).json({ error: 'Manjkajoči podatki.' });

    const [[file]] = await pool.query('SELECT id FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1', [fileId, req.user.id]);
    if (!file) return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });

    const [[target]] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [targetUsername]);
    if (!target) return res.status(404).json({ error: 'Uporabnik ne obstaja.' });

    await pool.query('DELETE FROM file_shares WHERE file_id = ? AND target_user_id = ?', [fileId, target.id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// ===================== LINK SHARING (public tokens) =====================
app.post('/api/shares/link', authRequired, async (req, res) => {
  try {
    const { fileId, expiresInDays = null, maxDownloads = null } = req.body || {};
    if (!fileId) return res.status(400).json({ error: 'Manjka fileId.' });

    const [[file]] = await pool.query('SELECT * FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1', [fileId, req.user.id]);
    if (!file) return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });

    const token = makeToken();
    let expiresAt = null;
    if (expiresInDays && Number(expiresInDays) > 0) {
      const [r] = await pool.query('SELECT DATE_ADD(NOW(), INTERVAL ? DAY) AS x', [Number(expiresInDays)]);
      expiresAt = r[0].x;
    }

    await pool.query(`
      INSERT INTO link_shares (file_id, owner_user_id, token, expires_at, max_downloads)
      VALUES (?,?,?,?,?)
    `, [fileId, req.user.id, token, expiresAt, maxDownloads ? Number(maxDownloads) : null]);

    const publicUrl = `${req.protocol}://${req.get('host')}/api/public/${token}`;
    return res.json({ ok: true, token, url: publicUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.get('/api/shares/link/:fileId', authRequired, async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const [[file]] = await pool.query('SELECT id FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1', [fileId, req.user.id]);
    if (!file) return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });

    const [rows] = await pool.query(`
      SELECT id, token, expires_at, max_downloads, download_count, created_at
      FROM link_shares WHERE file_id = ? ORDER BY created_at DESC
    `, [fileId]);
    return res.json({ links: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.delete('/api/shares/link/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[row]] = await pool.query('SELECT id FROM link_shares WHERE id = ? AND owner_user_id = ? LIMIT 1', [id, req.user.id]);
    if (!row) return res.status(404).json({ error: 'Ni najdeno.' });
    await pool.query('DELETE FROM link_shares WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// Public download (no auth)
app.get('/api/public/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const [[row]] = await pool.query(`
      SELECT l.*, f.original_name, f.storage_path
      FROM link_shares l
      JOIN files f ON f.id = l.file_id
      WHERE l.token = ?
      LIMIT 1
    `, [token]);
    if (!row) return res.status(404).json({ error: 'Neveljaven link.' });

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Povezava je potekla.' });
    }
    if (row.max_downloads && row.download_count >= row.max_downloads) {
      return res.status(410).json({ error: 'Doseženo je največje št. prenosov.' });
    }
    if (!fs.existsSync(row.storage_path)) {
      return res.status(410).json({ error: 'Datoteka manjka.' });
    }
    await pool.query('UPDATE link_shares SET download_count = download_count + 1 WHERE id = ?', [row.id]);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.original_name)}"`);
    return fs.createReadStream(row.storage_path).pipe(res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// ===================== COMMENTS =====================
app.get('/api/files/:id/comments', authRequired, async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const ok = await canUserAccessFile(req.user.id, fileId);
    if (!ok) return res.status(403).json({ error: 'Ni dostopa.' });
    const [rows] = await pool.query(`
      SELECT c.id, c.body, c.created_at, u.username AS author
      FROM comments c
      JOIN users u ON u.id = c.author_user_id
      WHERE c.file_id = ?
      ORDER BY c.created_at ASC
    `, [fileId]);
    return res.json({ comments: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.post('/api/files/:id/comments', authRequired, async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Prazen komentar.' });
    const ok = await canUserAccessFile(req.user.id, fileId);
    if (!ok) return res.status(403).json({ error: 'Ni dostopa.' });
    await pool.query('INSERT INTO comments (file_id, author_user_id, body) VALUES (?,?,?)', [fileId, req.user.id, body.trim()]);
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Ni najdeno.' }));

app.listen(API_PORT, () => {
  console.log(`API na http://0.0.0.0:${API_PORT}`);
});


// --- helpers for sharing ---
function makeToken(n = 22) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function canUserAccessFile(userId, fileId) {
  const [rows] = await pool.query(`
    SELECT 1 FROM files f WHERE f.id = ? AND f.owner_user_id = ?
    UNION
    SELECT 1 FROM file_shares s WHERE s.file_id = ? AND s.target_user_id = ?
    LIMIT 1
  `, [fileId, userId, fileId, userId]);
  return rows.length > 0;
}
