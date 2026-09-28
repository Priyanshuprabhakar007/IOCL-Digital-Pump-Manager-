import { Hono } from 'hono';
import { getDb } from '../../db';
import { PumpRepository } from '../repositories/pumpRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { ProductSchema, ProductUpdateSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';

const products = new Hono<{ Bindings: EnvBindings }>();

products.use('*', requireAuth as any);

// GET /api/v1/products - View products catalog
products.get('/', requirePermission(PERMISSIONS.PRODUCTS_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);

  const list = await pumpRepo.listProducts();
  return c.json({
    success: true,
    data: list,
    error: null,
  });
});

// Helper check: Only GLOBAL authorized administrators may manage global product masters
function isGlobalProductAdmin(c: AppContext): boolean {
  const userCtx = c.var.user;
  if (!userCtx) return false;
  if (userCtx.roles.includes('ADMIN') || userCtx.isGlobalScope) return true;
  return false;
}

// POST /api/v1/products - Create product (GLOBAL Admin only)
products.post('/', requirePermission(PERMISSIONS.PRODUCTS_WRITE) as any, async (c: AppContext) => {
  if (!isGlobalProductAdmin(c)) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Only GLOBAL-authorized administrators may manage global product masters',
      },
    }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const parseResult = ProductSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid product payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  // Check code uniqueness
  const existing = await pumpRepo.findProductByCode(payload.code);
  if (existing) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'CONFLICT',
        message: `Product code '${payload.code}' already exists`,
      },
    }, 409);
  }

  const nowIso = new Date().toISOString();
  const created = await pumpRepo.createProduct({
    id: `prod-${crypto.randomUUID()}`,
    code: payload.code,
    name: payload.name,
    category: payload.category,
    unit: payload.unit,
    status: payload.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'PRODUCT_CREATE',
    entityType: 'PRODUCT',
    entityId: created.id,
    newValue: created as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: created,
    error: null,
  }, 201);
});

// PUT /api/v1/products/:id - Update product (GLOBAL Admin only)
products.put('/:id', requirePermission(PERMISSIONS.PRODUCTS_WRITE) as any, async (c: AppContext) => {
  if (!isGlobalProductAdmin(c)) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Only GLOBAL-authorized administrators may manage global product masters',
      },
    }, 403);
  }

  const id = c.req.param('id');
  if (!id) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'BAD_REQUEST', message: 'Product ID is required' },
    }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const parseResult = ProductUpdateSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid product update payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await pumpRepo.findProductById(id);
  if (!existing) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    }, 404);
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateProduct(id, {
    ...parseResult.data,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'PRODUCT_UPDATE',
    entityType: 'PRODUCT',
    entityId: id,
    oldValue: existing as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: updated,
    error: null,
  });
});

// PATCH /api/v1/products/:id/status - Toggle status (GLOBAL Admin only)
products.patch('/:id/status', requirePermission(PERMISSIONS.PRODUCTS_WRITE) as any, async (c: AppContext) => {
  if (!isGlobalProductAdmin(c)) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'FORBIDDEN',
        message: 'Only GLOBAL-authorized administrators may manage global product masters',
      },
    }, 403);
  }

  const id = c.req.param('id');
  if (!id) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'BAD_REQUEST', message: 'Product ID is required' },
    }, 400);
  }
  const body = await c.req.json().catch(() => ({}));
  const status = body?.status;

  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: "status must be 'ACTIVE' or 'INACTIVE'" },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const pumpRepo = new PumpRepository(db);
  const auditRepo = new AuditRepository(db);

  const existing = await pumpRepo.findProductById(id);
  if (!existing) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'NOT_FOUND', message: 'Product not found' },
    }, 404);
  }

  const nowIso = new Date().toISOString();
  const updated = await pumpRepo.updateProduct(id, {
    status,
    updatedAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'PRODUCT_STATUS_UPDATE',
    entityType: 'PRODUCT',
    entityId: id,
    oldValue: { status: existing.status },
    newValue: { status },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: updated,
    error: null,
  });
});

export default products;
