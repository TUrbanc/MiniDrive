import express from 'express';
import { pool, authRequired, makeToken, fs } from '../deps.js';

const router = express.Router();

// SHARING: user-to-user
router.post('/api/shares/user', authRequired, async (req, res) => {
  try {
    const { fileId, targetUsername, canDownload = true } = req.body || {};
    if (!fileId || !targetUsername) {
      return res.status(400).json({ error: 'Manjkajoči podatki.' });
    }

    const [[file]] = await pool.query(
      'SELECT * FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1',
      [fileId, req.user.id]
    );
    if (!file) {
      return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });
    }

    const [[target]] = await pool.query(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [targetUsername]
    );
    if (!target) {
      return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
    }
    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'Ne moreš deliti samemu sebi.' });
    }

    await pool.query(`
      INSERT INTO file_shares (file_id, owner_user_id, target_user_id, can_download)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE can_download = VALUES(can_download)
    `, [fileId, req.user.id, target.id, !!canDownload]);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

router.get('/api/shares/incoming', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT s.id AS share_id,
             f.id AS file_id,
             f.original_name,
             f.size_bytes,
             f.created_at,
             u.username AS owner_username,
             s.can_download
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

router.get('/api/shares/file/:fileId', authRequired, async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const [[file]] = await pool.query(
      'SELECT id FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1',
      [fileId, req.user.id]
    );
    if (!file) {
      return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });
    }

    const [rows] = await pool.query(`
      SELECT s.id AS share_id,
             u.username AS target_username,
             s.can_download,
             s.created_at
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

router.delete('/api/shares/user', authRequired, async (req, res) => {
  try {
    const { fileId, targetUsername } = req.body || {};
    if (!fileId || !targetUsername) {
      return res.status(400).json({ error: 'Manjkajoči podatki.' });
    }

    const [[file]] = await pool.query(
      'SELECT id FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1',
      [fileId, req.user.id]
    );
    if (!file) {
      return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });
    }

    const [[target]] = await pool.query(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [targetUsername]
    );
    if (!target) {
      return res.status(404).json({ error: 'Uporabnik ne obstaja.' });
    }

    await pool.query(
      'DELETE FROM file_shares WHERE file_id = ? AND target_user_id = ?',
      [fileId, target.id]
    );
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// LINK SHARING (public tokens)
router.post('/api/shares/link', authRequired, async (req, res) => {
  try {
    const { fileId, expiresInDays = null, maxDownloads = null } = req.body || {};
    if (!fileId) {
      return res.status(400).json({ error: 'Manjka fileId.' });
    }

    const [[file]] = await pool.query(
      'SELECT * FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1',
      [fileId, req.user.id]
    );
    if (!file) {
      return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });
    }

    const token = makeToken();
    let expiresAt = null;
    if (expiresInDays && Number(expiresInDays) > 0) {
      const [r] = await pool.query(
        'SELECT DATE_ADD(NOW(), INTERVAL ? DAY) AS x',
        [Number(expiresInDays)]
      );
      expiresAt = r[0].x;
    }

    let maxDL = null;
    if (maxDownloads && Number(maxDownloads) > 0) {
      maxDL = Number(maxDownloads);
    }

    await pool.query(`
      INSERT INTO link_shares (file_id, owner_user_id, token, expires_at, max_downloads, download_count, created_at)
      VALUES (?,?,?,?,?,0,NOW())
    `, [fileId, req.user.id, token, expiresAt, maxDL]);

    return res.json({ ok: true, token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

router.get('/api/shares/link/:fileId', authRequired, async (req, res) => {
  try {
    const fileId = Number(req.params.fileId);
    const [[file]] = await pool.query(
      'SELECT id FROM files WHERE id = ? AND owner_user_id = ? LIMIT 1',
      [fileId, req.user.id]
    );
    if (!file) {
      return res.status(404).json({ error: 'Datoteka ne obstaja ali ni tvoja.' });
    }

    const [rows] = await pool.query(`
      SELECT id, token, expires_at, max_downloads, download_count, created_at
      FROM link_shares
      WHERE file_id = ?
      ORDER BY created_at DESC
    `, [fileId]);
    return res.json({ links: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

router.delete('/api/shares/link/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[row]] = await pool.query(
      'SELECT id FROM link_shares WHERE id = ? AND owner_user_id = ? LIMIT 1',
      [id, req.user.id]
    );
    if (!row) {
      return res.status(404).json({ error: 'Ni najdeno.' });
    }
    await pool.query('DELETE FROM link_shares WHERE id = ?', [id]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

// Public download (no auth)
router.get('/api/public/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const [[row]] = await pool.query(`
      SELECT l.*, f.original_name, f.storage_path
      FROM link_shares l
      JOIN files f ON f.id = l.file_id
      WHERE l.token = ?
      LIMIT 1
    `, [token]);
    if (!row) {
      return res.status(404).json({ error: 'Neveljaven link.' });
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Povezava je potekla.' });
    }
    if (row.max_downloads && row.download_count >= row.max_downloads) {
      return res.status(410).json({ error: 'Doseženo je največje št. prenosov.' });
    }
    if (!fs.existsSync(row.storage_path)) {
      return res.status(410).json({ error: 'Datoteka manjka.' });
    }

    await pool.query(
      'UPDATE link_shares SET download_count = download_count + 1 WHERE id = ?',
      [row.id]
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(row.original_name)}"`
    );
    return fs.createReadStream(row.storage_path).pipe(res);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

export default router;
