import express from 'express';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();
const PUB = path.join(__dirname, 'public');

const LOG_DIR = '/etc/minidrive/logs';
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
app.use(morgan('tiny'));

// Static files
app.use(express.static(PUB));

// Serve pages directly
app.get('/admin', (_req, res) => res.sendFile(path.join(PUB, 'admin.html')));
app.get('/drive', (_req, res) => res.sendFile(path.join(PUB, 'drive.html')));

const PORT = 80;
app.listen(PORT, () => console.log(`Frontend na http://0.0.0.0:${PORT}`));
