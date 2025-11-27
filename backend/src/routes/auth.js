import express from 'express';
import { pool, bcrypt, signToken } from '../deps.js';

const router = express.Router();

router.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Manjkajo podatki.' });
    }

    const [rows] = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Napačni podatki.' });
    }

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Napačni podatki.' });
    }

    const token = signToken(u);
    return res.json({
      ok: true,
      token,
      user: { id: u.id, username: u.username }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Napaka strežnika.' });
  }
});

export default router;
