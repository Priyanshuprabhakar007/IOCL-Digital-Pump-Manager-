import { Hono } from 'hono';
import { EnvBindings } from './middleware/auth';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roleRoutes from './routes/roles';
import hierarchyRoutes from './routes/hierarchy';
import outletRoutes from './routes/outlets';
import scopeRoutes from './routes/scopes';
import auditLogRoutes from './routes/auditLogs';
import documentRoutes from './routes/documents';

export const app = new Hono<{ Bindings: EnvBindings }>();

/**
 * Derives the exact approved origins from configuration and runtime environment.
 * Rejects arbitrary wildcards or shared platform subdomains (*.workers.dev, *.run.app).
 * Localhost is only permitted when running in development environment.
 */
export function getAllowedOrigins(env?: Partial<EnvBindings>): string[] {
  const configured = env?.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const isDev = !env?.ENVIRONMENT || env.ENVIRONMENT === 'development' || (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');

  const devOrigins = isDev ? [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost',
  ] : [];

  return Array.from(new Set([...configured, ...devOrigins]));
}

// Strict CORS and State-Changing Origin Validation Middleware
app.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  const allowedOrigins = getAllowedOrigins(c.env);

  // For state-changing methods (POST, PUT, PATCH, DELETE), validate origin against exact approved list
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
    if (origin && !allowedOrigins.includes(origin)) {
      return c.json({
        success: false,
        data: null,
        error: {
          code: 'FORBIDDEN_ORIGIN',
          message: `Cross-Origin request blocked. Origin '${origin}' is not authorized.`,
        },
      }, 403);
    }
  }

  // Preflight OPTIONS handler
  if (c.req.method === 'OPTIONS') {
    if (origin && allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
      return c.body(null, 204);
    }
    return c.body(null, 403);
  }

  await next();

  // Attach CORS headers to responses for authorized origins
  if (origin && allowedOrigins.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }
});

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'HEALTHY',
    service: 'IOCL Digital Pump Manager Worker API',
    timestamp: new Date().toISOString(),
  });
});

// Mount /api/v1 routes
app.route('/api/v1/auth', authRoutes);
app.route('/api/v1/users', userRoutes);
app.route('/api/v1/roles', roleRoutes);
app.route('/api/v1/hierarchy', hierarchyRoutes);
app.route('/api/v1/outlets', outletRoutes);
app.route('/api/v1/scopes', scopeRoutes);
app.route('/api/v1/audit-logs', auditLogRoutes);
app.route('/api/v1/documents', documentRoutes);

// Global Error Handler - Generic external response, detailed internal server log
app.onError((err, c) => {
  console.error('[Worker Server Error]:', err);
  return c.json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred. Please contact system administrator.',
    },
  }, 500);
});

// Global 404 Handler
app.notFound((c) => {
  return c.json({
    success: false,
    data: null,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${c.req.path} not found.`,
    },
  }, 404);
});

export default app;
