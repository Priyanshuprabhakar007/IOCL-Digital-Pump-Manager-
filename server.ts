import express from 'express';
import { createServer as createViteServer } from 'vite';
import app from './src/worker/app';
import { createLocalD1Database } from './src/db/localD1';
import { getDb } from './src/db';
import { seedDatabase } from './src/db/seed';

async function startServer() {
  const server = express();
  const port = 3000;

  // Support reverse-proxy HTTPS preview (Google AI Studio / Cloud Run)
  server.set('trust proxy', true);

  const localDb = createLocalD1Database();
  try {
    await seedDatabase(getDb(localDb));
  } catch (err) {
    console.error('Initial DB seeding notice:', err);
  }

  const localR2 = {
    storage: new Map<string, { buffer: any; metadata: any }>(),
    async put(key: string, value: any, options?: any) {
      this.storage.set(key, { buffer: value, metadata: options });
      return { key, size: value?.byteLength || 0 };
    },
    async get(key: string) {
      const item = this.storage.get(key);
      if (!item) return null;
      return {
        body: item.buffer,
        arrayBuffer: async () => item.buffer,
        ...item.metadata,
      };
    },
    async delete(key: string) {
      this.storage.delete(key);
    },
  };

  // Route API requests to Hono worker app
  server.use(async (req, res, next) => {
    if (req.url.startsWith('/api')) {
      try {
        const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
        const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
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

        const configured = (process.env.ALLOWED_ORIGINS || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        const currentOrigin = `${protocol}://${host}`;
        const originsSet = new Set([
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost',
          currentOrigin,
          ...configured,
        ]);

        const originHeader = req.headers.origin;
        if (originHeader) {
          try {
            const reqOriginHost = new URL(originHeader).host;
            const currentHost = host.split(':')[0];
            if (
              reqOriginHost === host ||
              reqOriginHost.split(':')[0] === currentHost ||
              reqOriginHost.endsWith('.run.app') ||
              reqOriginHost.endsWith('.google.com') ||
              reqOriginHost.endsWith('.googleusercontent.com') ||
              reqOriginHost.endsWith('.goog') ||
              reqOriginHost.endsWith('.web.app') ||
              reqOriginHost.endsWith('.firebaseapp.com') ||
              reqOriginHost === 'localhost' ||
              reqOriginHost === '127.0.0.1'
            ) {
              originsSet.add(originHeader);
            }
          } catch {}
        }

        const webRes = await app.fetch(webReq, {
          DB: localDb,
          DOCUMENTS_BUCKET: localR2 as any,
          ENVIRONMENT: process.env.ENVIRONMENT || 'development',
          ALLOWED_ORIGINS: Array.from(originsSet).join(','),
        });

        res.status(webRes.status);

        if (typeof webRes.headers.getSetCookie === 'function') {
          const cookies = webRes.headers.getSetCookie();
          if (cookies && cookies.length > 0) {
            res.setHeader('set-cookie', cookies);
          }
        }

        webRes.headers.forEach((value, key) => {
          if (key.toLowerCase() !== 'set-cookie') {
            res.setHeader(key, value);
          }
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
