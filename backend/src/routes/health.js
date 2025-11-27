import express from 'express';

const router = express.Router();

// Simple health check
router.get('/api/health', (_req, res) => res.json({ ok: true }));

export default router;
