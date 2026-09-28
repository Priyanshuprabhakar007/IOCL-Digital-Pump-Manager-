import { Hono } from 'hono';
import { getDb } from '../../db';
import * as schema from '../../db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { requireOutletAccess } from '../middleware/scope';
import { DocumentMetadataSchema } from '../../shared/validators';
import { PERMISSIONS } from '../../shared/constants';
import { ScopeService } from '../services/scopeService';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';

const documents = new Hono<{ Bindings: EnvBindings }>();

documents.use('*', requireAuth as any);

documents.get('/', requirePermission(PERMISSIONS.DOCUMENTS_READ) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);

  const accessibleOutlets = await ScopeService.getAccessibleOutlets(c.var.user, outletRepo);
  const accessibleOutletIds = accessibleOutlets.map(o => o.id);

  let query = db
    .select({
      doc: schema.documents,
      uploadedByName: schema.users.name,
      outletName: schema.retailOutlets.name,
    })
    .from(schema.documents)
    .innerJoin(schema.users, eq(schema.documents.uploadedByUserId, schema.users.id))
    .leftJoin(schema.retailOutlets, eq(schema.documents.outletId, schema.retailOutlets.id))
    .orderBy(desc(schema.documents.createdAt));

  let docsList: any[] = [];
  if (c.var.user.isGlobalAdmin || c.var.user.primaryScope === 'GLOBAL') {
    docsList = await query;
  } else if (accessibleOutletIds.length > 0) {
    docsList = await query.where(inArray(schema.documents.outletId, accessibleOutletIds));
  } else {
    docsList = [];
  }

  const result = docsList.map(r => ({
    id: r.doc.id,
    r2Key: r.doc.r2Key,
    name: r.doc.name,
    mimeType: r.doc.mimeType,
    sizeBytes: r.doc.sizeBytes,
    outletId: r.doc.outletId,
    uploadedByUserId: r.doc.uploadedByUserId,
    createdAt: r.doc.createdAt,
    uploadedByName: r.uploadedByName,
    outletName: r.outletName ?? undefined,
  }));

  return c.json({
    success: true,
    data: result,
    error: null,
  });
});

documents.post('/', requirePermission(PERMISSIONS.DOCUMENTS_WRITE) as any, async (c: AppContext) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = DocumentMetadataSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid document payload',
        details: parseResult.error.flatten(),
      },
    }, 400);
  }

  const payload = parseResult.data;
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  if (payload.outletId) {
    const hasAccess = await ScopeService.canAccessOutlet(c.var.user, payload.outletId, outletRepo);
    if (!hasAccess) {
      return c.json({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'No scope access to specified outlet for document upload' },
      }, 403);
    }
  }

  const nowIso = new Date().toISOString();
  const docId = `doc-${crypto.randomUUID()}`;
  const r2Key = payload.r2Key || `docs/${payload.outletId || 'general'}/${docId}-${payload.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

  await db.insert(schema.documents).values({
    id: docId,
    r2Key,
    name: payload.name,
    mimeType: payload.mimeType,
    sizeBytes: payload.sizeBytes,
    outletId: payload.outletId ?? null,
    uploadedByUserId: c.var.user.user.id,
    createdAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'DOCUMENT_METADATA_REGISTER',
    entityType: 'DOCUMENT',
    entityId: docId,
    newValue: { name: payload.name, r2Key, sizeBytes: payload.sizeBytes },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: {
      id: docId,
      r2Key,
      name: payload.name,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      outletId: payload.outletId ?? null,
      uploadedByUserId: c.var.user.user.id,
      createdAt: nowIso,
    },
    error: null,
  });
});

export default documents;
