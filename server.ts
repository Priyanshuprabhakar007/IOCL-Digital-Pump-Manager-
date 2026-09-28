import express from 'express';
import { createServer as createViteServer } from 'vite';
import app from './src/worker/app';
import { createLocalD1Database } from './src/db/localD1';

async function startServer() {
  const server = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  const localDb = createLocalD1Database();

  // Route API requests to Hono worker app
  server.use(async (req, res, next) => {
    if (req.url.startsWith('/api')) {
      try {
        const protocol = req.protocol || 'http';
        const host = req.get('host') || 'localhost:3000';
        const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;

        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
          } else if (value) {
            headers.append(key, value);
          }
        }

        let body: Uint8Array | undefined = undefined;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const chunks: Uint8Array[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          body = Buffer.concat(chunks);
        }

        const webReq = new Request(fullUrl, {
          method: req.method,
          headers,
          body: body && body.length > 0 ? (body as unknown as BodyInit) : undefined,
        });

        const webRes = await app.fetch(webReq, { DB: localDb, DOCUMENTS_BUCKET: {} as any });

        res.status(webRes.status);
        webRes.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        const arrayBuffer = await webRes.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
        return;
      } catch (err) {
        console.error('API Error:', err);
        return next(err);
      }
    }
    next();
  });

  // Mount Vite dev server middlewares for frontend SPA
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  server.use(vite.middlewares);

  server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 IOCL Digital Pump Manager server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start dev server:', err);
});
