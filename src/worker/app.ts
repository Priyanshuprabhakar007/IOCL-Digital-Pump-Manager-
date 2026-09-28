import { Hono } from 'hono';
import { cors } from 'hono/cors';
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

// Configured Origin Validation
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (allowedOrigins.includes(origin) || origin.endsWith('.run.app') || origin.endsWith('.workers.dev')) {
      return origin;
    }
    return 'http://localhost:3000';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

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
