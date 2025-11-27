import express from 'express';
import { pool, authRequired, multer, fs, path, STORAGE_ROOT } from '../deps.js';

const router = express.Router();

function ensureUserDir(userId) {
  const dir = path.join(STORAGE_ROOT, String(userId));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      const dir = ensureUserDir(req.user.id);
      cb(null, dir);
    } catch (e) {
      console.error('Upload destination error:', e);
      cb(e);
    }
  },
  filename: function (req, file, cb) {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  }
});

const upload = multer({ storage });

// List files for current user
router.get('/api/files', authRequired, async (req, res) => {
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

// Upload a file
router.post('/api/files/upload', authRequired, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Ni datoteke.' });
    }

    // Compute storage_path robustly from what multer actually used
    const destDir = req.file.destination || ensureUserDir(req.user.id);
    const storagePath = path.join(destDir, req.file.filename);

    // sanity check file exists
    try {
      fs.statSync(storagePath);
    } catch (e) {
      console.error('Uploaded file missing at expected path:', storagePath, e);
      return res.status(500).json({ error: 'Datoteke ni bilo mogoče shraniti (FS).' });
    }

    const originalname = req.file.originalname;
    const mimetype = req.file.mimetype || null;
    const size = req.file.size;
    const filename = req.file.filename;

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

// Download file (if owner or shared with download permission)
router.get('/api/files/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[f]] = await pool.query('SELECT * FROM files WHERE id = ? LIMIT 1', [id]);
    if (!f) return res.status(404).json({ error: 'Ni najdeno.' });

    const isOwner = f.owner_user_id === req.user.id;
    let isShared = false;
    if (!isOwner) {
      const [[s]] = await pool.query(
        'SELECT can_download FROM file_shares WHERE file_id = ? AND target_user_id = ? LIMIT 1',
        [id, req.user.id]
      );
      isShared = !!s && !!s.can_download;
    }
    if (!isOwner && !isShared) {
      return res.status(403).json({ error: 'Ni dostopa.' });
    }
    if (!fs.existsSync(f.storage_path)) {
      return res.status(410).json({ error: 'Datoteka manjka.' });
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(f.original_name)}"`
    );
    return fs.createReadStream(f.storage_path).pipe(res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// Delete file (owner only)
router.delete('/api/files/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      'SELECT * FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1',
      [id, req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Ni najdeno.' });
    }
    const f = rows[0];
    try {
      if (fs.existsSync(f.storage_path)) fs.unlinkSync(f.storage_path);
    } catch {
      // ignore
    }
    await pool.query('DELETE FROM files WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// Comments on files
async function canUserAccessFile(userId, fileId) {
  const [rows] = await pool.query(`
    SELECT 1 FROM files f WHERE f.id = ? AND f.owner_user_id = ?
    UNION
    SELECT 1 FROM file_shares s WHERE s.file_id = ? AND s.target_user_id = ?
    LIMIT 1
  `, [fileId, userId, fileId, userId]);
  return rows.length > 0;
}

router.get('/api/files/:id/comments', authRequired, async (req, res) => {
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

router.post('/api/files/:id/comments', authRequired, async (req, res) => {
  try {
    const fileId = Number(req.params.id);
    const { body } = req.body || {};
    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Prazen komentar.' });
    }

    const ok = await canUserAccessFile(req.user.id, fileId);
    if (!ok) {
      return res.status(403).json({ error: 'Ni dostopa.' });
    }

    await pool.query(
      'INSERT INTO comments (file_id, author_user_id, body) VALUES (?,?,?)',
      [fileId, req.user.id, body.trim()]
    );
    return res.status(201).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

export default router;
