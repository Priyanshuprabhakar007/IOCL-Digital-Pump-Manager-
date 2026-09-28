import { serve } from '@hono/node-server';
import { createServer } from 'vite';
import path from 'path';
import app from './src/worker/app';
import { createLocalD1Database } from './src/db/localD1';

async function startServer() {
  const localDb = createLocalD1Database();

  // Inject local D1 database binding into request environment
  app.use('*', async (c, next) => {
    (c.env as any) = c.env || {};
    c.env.DB = localDb;
    await next();
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    // Handle Vite dev server assets via middleware
    const server = serve({
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname.startsWith('/api')) {
          return app.fetch(req);
        }

        return new Promise((resolve) => {
          vite.middlewares(req as any, {
            setHeader: (key: string, val: string) => {},
            end: (data: any) => resolve(new Response(data)),
          } as any, () => {
            resolve(app.fetch(req));
          });
        });
      },
      port: 3000,
    });

    console.log('🚀 IOCL Digital Pump Manager server running on http://localhost:3000');
  } else {
    serve({
      fetch: app.fetch,
      port: 3000,
    });
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
