import { Hono } from 'hono';
import { getDb } from '../../db';
import * as schema from '../../db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { requireAuth, AppContext, EnvBindings } from '../middleware/auth';
import { requirePermission } from '../middleware/permission';
import { ScopeService } from '../services/scopeService';
import { OutletRepository } from '../repositories/outletRepository';
import { AuditRepository } from '../repositories/auditRepository';
import { PERMISSIONS } from '../../shared/constants';

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
  if (c.var.user.isGlobalScope) {
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

// Secure Authenticated Upload Endpoint with Server-Side R2 Key Generation
documents.post('/', requirePermission(PERMISSIONS.DOCUMENTS_WRITE) as any, async (c: AppContext) => {
  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  let fileName = '';
  let mimeType = '';
  let sizeBytes = 0;
  let outletId = '';
  let fileBuffer: ArrayBuffer | undefined = undefined;

  const contentType = c.req.header('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.parseBody();
    const file = formData['file'] as any;
    outletId = (formData['outletId'] as string) || '';

    if (!file || typeof file === 'string') {
      return c.json({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'File is required for document upload' } }, 400);
    }

    fileName = file.name || 'document.pdf';
    mimeType = file.type || 'application/pdf';
    sizeBytes = file.size || 0;
    fileBuffer = await file.arrayBuffer();
  } else {
    const body = await c.req.json().catch(() => ({}));
    fileName = body.name || '';
    mimeType = body.mimeType || '';
    sizeBytes = body.sizeBytes || 0;
    outletId = body.outletId || '';
  }

  // Validate Input
  if (!fileName || !outletId) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Document name and outletId are required' } }, 400);
  }

  const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg'];
  if (!allowedMimeTypes.includes(mimeType)) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Only PDF, PNG, and JPEG documents are permitted' } }, 400);
  }

  if (sizeBytes > 5 * 1024 * 1024) {
    return c.json({ success: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'File size cannot exceed 5 MB' } }, 400);
  }

  // Verify Scope Access over target Outlet
  const hasAccess = await ScopeService.canAccessOutlet(c.var.user, outletId, outletRepo);
  if (!hasAccess) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have organizational scope access for this retail outlet.' },
    }, 403);
  }

  // SERVER-SIDE R2 KEY GENERATION (Browser CANNOT control arbitrary R2 keys)
  const sanitized = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const docId = `doc-${crypto.randomUUID()}`;
  const r2Key = `outlets/${outletId}/${docId}-${sanitized}`;

  // Upload to R2 Bucket if binding is available
  if (c.env.DOCUMENTS_BUCKET && typeof c.env.DOCUMENTS_BUCKET.put === 'function' && fileBuffer) {
    await c.env.DOCUMENTS_BUCKET.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: mimeType },
    });
  }

  const nowIso = new Date().toISOString();

  await db.insert(schema.documents).values({
    id: docId,
    r2Key,
    name: fileName,
    mimeType,
    sizeBytes,
    outletId,
    uploadedByUserId: c.var.user.user.id,
    createdAt: nowIso,
  });

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'DOCUMENT_UPLOAD',
    entityType: 'DOCUMENT',
    entityId: docId,
    newValue: { name: fileName, r2Key, mimeType, sizeBytes, outletId },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: {
      id: docId,
      r2Key,
      name: fileName,
      mimeType,
      sizeBytes,
      outletId,
      uploadedByUserId: c.var.user.user.id,
      createdAt: nowIso,
    },
    error: null,
  });
});

export default documents;
