import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authRouter } from './routes/auth.js';
import { appRouter } from './routes/app.js';
import { publicRouter } from './routes/public.js';
import { widgetScript } from './widget/script.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/widget.js', (_req, res) => {
  res.type('application/javascript').send(widgetScript);
});

app.use('/api/auth', authRouter);
app.use('/api/app', appRouter);
app.use('/public', publicRouter);

const clientDir = path.resolve(__dirname, '../client');
app.use(express.static(clientDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`WARREN Quote Tool hosted app listening on ${port}`);
});
