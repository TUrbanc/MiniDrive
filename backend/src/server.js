import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { API_PORT, ALLOW_ORIGIN } from './deps.js';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import filesRoutes from './routes/files.js';
import sharesRoutes from './routes/shares.js';

const app = express();

app.use(morgan('tiny'));
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: ALLOW_ORIGIN }));
app.options('*', cors());

// Attach route modules
app.use(healthRoutes);
app.use(authRoutes);
app.use(adminRoutes);
app.use(filesRoutes);
app.use(sharesRoutes);

// Fallback 404 JSON
app.use((_req, res) => res.status(404).json({ error: 'Ni najdeno.' }));

app.listen(API_PORT, () => {
  console.log(`API na http://0.0.0.0:${API_PORT}`);
});
