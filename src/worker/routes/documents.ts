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

/**
 * Helper to derive validated MIME type strictly from binary magic bytes.
 * Never trust browser-supplied metadata alone.
 *
 * Allowed signatures:
 * - PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
 * - PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
 * - JPEG: 0xFF 0xD8 0xFF
 */
function deriveMimeType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer);

  // PDF signature: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (bytes.length >= 5 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2D) {
    return 'application/pdf';
  }

  // PNG signature: \x89PNG\r\n\x1a\n (0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A) {
    return 'image/png';
  }

  // JPEG signature: 0xFF, 0xD8, 0xFF
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // Strictly reject unknown binary content; do NOT fall back to client file.type
  return null;
}

// Strict Real-File Multipart Upload Endpoint
documents.post('/', requirePermission(PERMISSIONS.DOCUMENTS_WRITE) as any, async (c: AppContext) => {
  const contentType = c.req.header('content-type') || '';

  // 1. REJECT JSON METADATA-ONLY CREATION - Must accept multipart/form-data only
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Document creation requires multipart/form-data with a real file upload. JSON metadata creation is forbidden.',
      },
    }, 415);
  }

  let file: File | null = null;
  let outletId = '';

  try {
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');
    if (fileEntry && typeof fileEntry === 'object' && 'arrayBuffer' in fileEntry) {
      file = fileEntry as File;
    }
    const outletEntry = formData.get('outletId');
    if (typeof outletEntry === 'string') {
      outletId = outletEntry.trim();
    }
  } catch (err: any) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'BAD_REQUEST', message: 'Failed to parse multipart form data: ' + err.message },
    }, 400);
  }

  if (!file) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Real file upload is required.' },
    }, 400);
  }

  if (!outletId) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'outletId is required for document upload.' },
    }, 400);
  }

  const fileBuffer = await file.arrayBuffer();
  const actualSize = fileBuffer.byteLength;

  if (actualSize === 0) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Uploaded file cannot be empty.' },
    }, 400);
  }

  if (actualSize > 5 * 1024 * 1024) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'File size exceeds maximum permitted limit (5 MB).' },
    }, 400);
  }

  const rawFilename = file.name || 'document.pdf';
  const derivedMimeType = deriveMimeType(fileBuffer);
  if (!derivedMimeType) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid file format. Only PDF, PNG, and JPEG documents are permitted.' },
    }, 400);
  }

  const db = getDb(c.env.DB);
  const outletRepo = new OutletRepository(db);
  const auditRepo = new AuditRepository(db);

  // Verify Scope Access over target Outlet
  const hasAccess = await ScopeService.canAccessOutlet(c.var.user, outletId, outletRepo);
  if (!hasAccess) {
    return c.json({
      success: false,
      data: null,
      error: { code: 'FORBIDDEN', message: 'You do not have organizational scope access for this retail outlet.' },
    }, 403);
  }

  // 2. REQUIRE R2 BUCKET - If DOCUMENTS_BUCKET is unavailable, fail
  if (!c.env.DOCUMENTS_BUCKET || typeof c.env.DOCUMENTS_BUCKET.put !== 'function') {
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        message: 'Cloudflare R2 document storage bucket is unavailable.',
      },
    }, 503);
  }

  // SERVER-SIDE R2 KEY GENERATION (Clients cannot specify arbitrary R2 keys)
  const sanitizedFilename = rawFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const docId = `doc-${crypto.randomUUID()}`;
  const r2Key = `outlets/${outletId}/${docId}-${sanitizedFilename}`;

  // 3. STORE IN R2 FIRST - If R2 put() fails, fail without modifying D1
  try {
    await c.env.DOCUMENTS_BUCKET.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: derivedMimeType },
      customMetadata: {
        outletId,
        uploadedBy: c.var.user.user.id,
        originalName: rawFilename,
      },
    });
  } catch (storageErr: any) {
    console.error('R2 put failed:', storageErr);
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'STORAGE_UPLOAD_FAILED',
        message: 'Failed to upload object to Cloudflare R2 storage.',
      },
    }, 502);
  }

  // 4. INSERT INTO D1 - If D1 fails after R2 succeeds, clean up newly created R2 object
  const nowIso = new Date().toISOString();
  try {
    await db.insert(schema.documents).values({
      id: docId,
      r2Key,
      name: sanitizedFilename,
      mimeType: derivedMimeType,
      sizeBytes: actualSize,
      outletId,
      uploadedByUserId: c.var.user.user.id,
      createdAt: nowIso,
    });
  } catch (dbErr: any) {
    console.error('D1 insertion failed after R2 upload; attempting R2 rollback cleanup:', dbErr);
    try {
      if (typeof c.env.DOCUMENTS_BUCKET.delete === 'function') {
        await c.env.DOCUMENTS_BUCKET.delete(r2Key);
      }
    } catch (cleanupErr) {
      console.error('Failed to cleanup orphaned R2 object:', cleanupErr);
    }
    return c.json({
      success: false,
      data: null,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Failed to record document metadata in database. Storage transaction rolled back.',
      },
    }, 500);
  }

  await auditRepo.logAction({
    id: `aud-${crypto.randomUUID()}`,
    userId: c.var.user.user.id,
    action: 'DOCUMENT_UPLOAD',
    entityType: 'DOCUMENT',
    entityId: docId,
    newValue: { name: sanitizedFilename, r2Key, mimeType: derivedMimeType, sizeBytes: actualSize, outletId },
    ipAddress: c.req.header('cf-connecting-ip') || null,
    userAgent: c.req.header('user-agent') || null,
    createdAt: nowIso,
  });

  return c.json({
    success: true,
    data: {
      id: docId,
      r2Key,
      name: sanitizedFilename,
      mimeType: derivedMimeType,
      sizeBytes: actualSize,
      outletId,
      uploadedByUserId: c.var.user.user.id,
      createdAt: nowIso,
    },
    error: null,
  }, 201);
});

export default documents;
