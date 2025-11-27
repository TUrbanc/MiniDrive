import express from 'express';
import { pool, bcrypt, ADMIN_REG_SECRET, STORAGE_ROOT, fs, path } from '../deps.js';

const router = express.Router();

router.post('/api/admin/register', async (req, res) => {
  try {
    const { secret, username, password } = req.body || {};
    if (secret !== ADMIN_REG_SECRET) {
      return res.status(403).json({ error: 'Napačen skrivni ključ.' });
    }
    if (!username || !password) {
      return res.status(400).json({ error: 'Manjkajo podatki.' });
    }

    const [exists] = await pool.query(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (exists.length) {
      return res.status(409).json({ error: 'Uporabnik že obstaja.' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      'INSERT INTO users (username, password_hash) VALUES (?,?)',
      [username, hash]
    );
    return res
      .status(201)
      .json({ ok: true, message: 'Registracija uspešna.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

router.post('/api/admin/users/list', async (req, res) => {
  try {
    const { secret } = req.body || {};
    if (secret !== ADMIN_REG_SECRET) {
      return res.status(403).json({ error: 'Napačen skrivni ključ.' });
    }

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

router.post('/api/admin/users/delete', async (req, res) => {
  try {
    const { secret, userId } = req.body || {};
    if (secret !== ADMIN_REG_SECRET) {
      return res.status(403).json({ error: 'Napačen skrivni ključ.' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'Manjka userId.' });
    }

    const dir = path.join(STORAGE_ROOT, String(userId));
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

export default router;
