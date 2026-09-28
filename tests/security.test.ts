import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

describe('IOCL Digital Pump Manager Phase 1B Security Hardening Suite', () => {
  let env: { DB: any; DOCUMENTS_BUCKET: any };
  let dbPath: string;
  let localD1: any;
  let mockR2Puts: Array<{ key: string; value: any; options?: any }>;
  let mockR2Deletes: string[];

  beforeEach(async () => {
    dbPath = `./.sqlite/test_iocl_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    mockR2Puts = [];
    mockR2Deletes = [];

    const mockBucket = {
      put: async (key: string, value: any, options?: any) => {
        mockR2Puts.push({ key, value, options });
        return { key, size: value.byteLength || 0 };
      },
      delete: async (key: string) => {
        mockR2Deletes.push(key);
      },
    };

    env = { DB: localD1, DOCUMENTS_BUCKET: mockBucket as any };
  });

  afterEach(() => {
    try {
      localD1.close();
    } catch (e) {}

    // Clean up temporary database files after execution
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) {}
  });

  const getCookie = (res: Response) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return '';
    return setCookie.split(';')[0];
  };

  const loginAs = async (email: string) => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email, password: 'Password@123' }),
      }),
      env
    );
    const cookie = getCookie(res);
    const json = (await res.json()) as any;
    return { res, cookie, json };
  };

  // Helper to build real multipart/form-data Request
  const createMultipartDocRequest = (
    url: string,
    cookie: string,
    outletId: string,
    fileContent = '%PDF-1.4 sample pdf binary data',
    fileName = 'compliance_license.pdf',
    mimeType = 'application/pdf',
    origin = 'http://localhost:3000'
  ) => {
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const bodyStr =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="outletId"\r\n\r\n` +
      `${outletId}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${fileContent}\r\n` +
      `--${boundary}--\r\n`;

    return new Request(url, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Origin: origin,
      },
      body: bodyStr,
    });
  };

  // 1. Admin GLOBAL login works
  it('1. Admin GLOBAL login works', async () => {
    const { res, json } = await loginAs('admin@iocl.in');
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.user.email).toBe('admin@iocl.in');
  });

  // 2. Wrong password fails
  it('2. Wrong password fails', async () => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'WrongPassword999' }),
      }),
      env
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INVALID_CREDENTIALS');
  });

  // 3. Disabled user cannot login with correct password
  it('3. Disabled user cannot login', async () => {
    await env.DB.prepare("UPDATE users SET status = 'INACTIVE' WHERE email = 'dealer.parkstreet@iocl.in'").run();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'dealer.parkstreet@iocl.in', password: 'Password@123' }),
      }),
      env
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('ACCOUNT_DISABLED');
  });

  // 4. Session survives /auth/me
  it('4. Session survives /auth/me', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const meRes = await app.fetch(
      new Request('http://localhost/api/v1/auth/me', {
        headers: { Cookie: cookie },
      }),
      env
    );
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as any;
    expect(meJson.data.user.email).toBe('admin@iocl.in');
  });

  // 5. Logout revokes session
  it('5. Logout revokes session', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const logoutRes = await app.fetch(
      new Request('http://localhost/api/v1/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(logoutRes.status).toBe(200);

    const meRes = await app.fetch(
      new Request('http://localhost/api/v1/auth/me', {
        headers: { Cookie: cookie },
      }),
      env
    );
    expect(meRes.status).toBe(401);
  });

  // 6. Unauthenticated API returns 401
  it('6. Unauthenticated API returns 401', async () => {
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets'), env);
    expect(res.status).toBe(401);
  });

  // 7. Missing permission returns 403
  it('7. Missing permission returns 403', async () => {
    const { cookie } = await loginAs('csp.parkstreet@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          empCode: 'IOCL-NEW-001',
          name: 'New Test User',
          email: 'newtest@iocl.in',
          phone: '9999999999',
          password: 'Password@123',
          roleCodes: ['CSP'],
        }),
      }),
      env
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('FORBIDDEN');
  });

  // 8. Dealer cannot access another outlet
  it('8. Dealer cannot access another outlet', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002', {
        headers: { Cookie: cookie },
      }),
      env
    );
    expect(res.status).toBe(403);
  });

  // 9. Field Officer cannot access another Sales Area
  it('9. Field Officer cannot access another Sales Area', async () => {
    const { cookie } = await loginAs('fo.central@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1003', {
        headers: { Cookie: cookie },
      }),
      env
    );
    expect(res.status).toBe(403);
  });

  // 10. State Office cannot access another State
  it('10. State Office cannot access another State', async () => {
    const { cookie } = await loginAs('wbso@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1003', {
        headers: { Cookie: cookie },
      }),
      env
    );
    expect(res.status).toBe(403);
  });

  // 11. GLOBAL Admin sees all allowed data
  it('11. GLOBAL Admin sees all allowed data', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets', { headers: { Cookie: cookie } }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.data.length).toBe(3);
  });

  // 12. State user cannot assign GLOBAL scope
  it('12. State user cannot assign GLOBAL scope', async () => {
    const { cookie } = await loginAs('wbso@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/scopes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          userId: 'user-fo',
          scopeLevel: 'GLOBAL',
        }),
      }),
      env
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('FORBIDDEN');
  });

  // 13. State user cannot grant ADMIN role
  it('13. State user cannot grant ADMIN role', async () => {
    const { cookie } = await loginAs('wbso@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          empCode: 'IOCL-ATT-001',
          name: 'Escalated Admin',
          email: 'escalated@iocl.in',
          phone: '9830098300',
          password: 'Password@123',
          roleCodes: ['ADMIN'],
        }),
      }),
      env
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('ROLE_CEILING_EXCEEDED');
  });

  // 14. Hierarchy parent validation works
  it('14. Hierarchy parent validation works', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/scopes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          userId: 'user-fo',
          scopeLevel: 'DIVISION',
          divisionId: 'non-existent-div-999',
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('INVALID_SCOPE_HIERARCHY');
  });

  // 15. Audit log created on state creation
  it('15. Important mutation creates audit log', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    await app.fetch(
      new Request('http://localhost/api/v1/hierarchy/states', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ code: 'MHSO', name: 'Maharashtra State Office' }),
      }),
      env
    );

    const auditRes = await app.fetch(
      new Request('http://localhost/api/v1/audit-logs', {
        headers: { Cookie: cookie },
      }),
      env
    );
    expect(auditRes.status).toBe(200);
    const json = (await auditRes.json()) as any;
    const actions = json.data.map((a: any) => a.action);
    expect(actions).toContain('STATE_CREATE');
  });

  // ==========================================================================
  // PHASE 1B HARDENING EXTENDED TESTS
  // ==========================================================================

  // 16. USER SCOPE ANCESTRY: STATE user can see and manage legitimate subordinate FO
  it('16. STATE user can see and manage legitimate subordinate FO via server-side ancestry derivation', async () => {
    const { cookie } = await loginAs('wbso@iocl.in'); // West Bengal State Office

    // FO Kolkata Central has scope SALES_AREA 'sa-kol-cen' (which is inside div-kol -> state-wb)
    // Redundant parent IDs are NOT stored in the scope record
    const res = await app.fetch(new Request('http://localhost/api/v1/users', { headers: { Cookie: cookie } }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    const userEmails = json.data.map((u: any) => u.email);
    expect(userEmails).toContain('fo.central@iocl.in');

    // STATE actor can manage/update legitimate subordinate FO status
    const updateRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-fo/status', {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
      env
    );
    expect(updateRes.status).toBe(200);
  });

  // 17. USER SCOPE ANCESTRY: DIVISION user can resolve child outlet users
  it('17. DIVISION user can resolve child outlet users', async () => {
    // kolkatado@iocl.in is seeded with DIVISION scope over div-kol
    const { cookie } = await loginAs('kolkatado@iocl.in');
    const res = await app.fetch(new Request('http://localhost/api/v1/users', { headers: { Cookie: cookie } }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    const userEmails = json.data.map((u: any) => u.email);

    // Dealer Park Street is scoped to OUTLET ro-1001 (which belongs to sa-cen -> div-kol)
    expect(userEmails).toContain('dealer.parkstreet@iocl.in');
  });

  // 18. MULTI-SCOPE SAFETY: multi-scope target cannot be modified through partial overlap
  it('18. multi-scope target cannot be modified through partial overlap', async () => {
    const now = new Date().toISOString();
    // Give user-dealer an additional Punjab state scope
    await env.DB.prepare("INSERT INTO user_scope_assignments (id, user_id, scope_level, state_id, created_at, created_by) VALUES ('usa-extra-pb', 'user-dealer', 'STATE', 'state-pb', ?, 'SYSTEM')").bind(now).run();

    const { cookie } = await loginAs('wbso@iocl.in'); // West Bengal State Office

    // Attempting to modify/disable user-dealer who now holds Punjab authority
    const patchRes = await app.fetch(
      new Request('http://localhost/api/v1/users/user-dealer/status', {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
      env
    );

    expect(patchRes.status).toBe(403);
    const json = (await patchRes.json()) as any;
    expect(json.error.code).toBe('FORBIDDEN');
  });

  // 19. MULTI-SCOPE SAFETY: deleting an out-of-scope assignment is forbidden
  it('19. deleting an out-of-scope assignment is forbidden', async () => {
    const now = new Date().toISOString();
    // Insert a Punjab scope assignment for user-fo
    await env.DB.prepare("INSERT INTO user_scope_assignments (id, user_id, scope_level, state_id, created_at, created_by) VALUES ('usa-target-pb', 'user-fo', 'STATE', 'state-pb', ?, 'SYSTEM')").bind(now).run();

    const { cookie } = await loginAs('wbso@iocl.in'); // West Bengal State Office

    // WBSO attempts to delete the Punjab scope assignment
    const delRes = await app.fetch(
      new Request('http://localhost/api/v1/scopes/usa-target-pb', {
        method: 'DELETE',
        headers: { Cookie: cookie, Origin: 'http://localhost:3000' },
      }),
      env
    );

    expect(delRes.status).toBe(403);
    const json = (await delRes.json()) as any;
    expect(json.error.code).toBe('FORBIDDEN');
  });

  // 20. HIERARCHY ANCESTOR VISIBILITY: does not broaden authorization
  it('20. hierarchy ancestor visibility does not broaden authorization', async () => {
    const { cookie } = await loginAs('fo.central@iocl.in'); // Scoped to SALES_AREA 'sa-kol-cen'

    // 1. Visible hierarchy ancestry: FO can see parent State for navigation/breadcrumbs
    const statesRes = await app.fetch(new Request('http://localhost/api/v1/hierarchy/states', { headers: { Cookie: cookie } }), env);
    expect(statesRes.status).toBe(200);
    const statesJson = (await statesRes.json()) as any;
    const stateIds = statesJson.data.map((s: any) => s.id);
    expect(stateIds).toContain('state-wb');

    // 2. But this does NOT grant operational authority: FO cannot create divisions in state-wb!
    const createDivRes = await app.fetch(
      new Request('http://localhost/api/v1/hierarchy/divisions', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ stateId: 'state-wb', code: 'UNAUTH', name: 'Unauthorized Div' }),
      }),
      env
    );
    expect(createDivRes.status).toBe(403);

    // 3. FO cannot access an outlet in another sales area within the same visible parent state
    const outletRes = await app.fetch(
      new Request('http://localhost/api/v1/outlets/ro-1002', { headers: { Cookie: cookie } }),
      env
    );
    expect(outletRes.status).toBe(403);
  });

  // 21. REAL FILE UPLOAD: JSON metadata-only document upload is rejected
  it('21. authorized JSON metadata-only document upload is rejected', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/documents', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          name: 'compliance.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          outletId: 'ro-1001',
        }),
      }),
      env
    );

    // Must be rejected because multipart/form-data with a real file is mandatory
    expect(res.status).toBe(415);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  // 22. REAL MULTIPART R2 UPLOAD: calls bucket.put and creates D1 row
  it('22. real multipart R2 upload calls bucket.put and records in D1', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in'); // Scoped to ro-1001

    const req = createMultipartDocRequest(
      'http://localhost/api/v1/documents',
      cookie,
      'ro-1001',
      '%PDF-1.4 authentic license binary data stream',
      'peso_license_2026.pdf',
      'application/pdf'
    );

    const res = await app.fetch(req, env);
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.outletId).toBe('ro-1001');
    expect(json.data.mimeType).toBe('application/pdf');

    // Verify R2 put was invoked with real key and buffer
    expect(mockR2Puts.length).toBe(1);
    expect(mockR2Puts[0].key).toContain('outlets/ro-1001/');
    expect(mockR2Puts[0].options?.httpMetadata?.contentType).toBe('application/pdf');
  });

  // 23. R2 FAILURE DOES NOT INSERT D1 METADATA
  it('23. R2 failure does not insert D1 metadata', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in');

    // Simulate R2 storage failure
    env.DOCUMENTS_BUCKET.put = async () => {
      throw new Error('Cloudflare R2 Put Error: Connection timed out');
    };

    const req = createMultipartDocRequest(
      'http://localhost/api/v1/documents',
      cookie,
      'ro-1001',
      '%PDF-1.4 binary content',
      'sample.pdf'
    );

    const res = await app.fetch(req, env);
    expect(res.status).toBe(502);

    // Verify no document was recorded in D1
    const d1Check = await env.DB.prepare("SELECT * FROM documents WHERE outlet_id = 'ro-1001'").all();
    expect(d1Check.results.length).toBe(0);
  });

  // 24. INVALID ROLE CODE REJECTED
  it('24. invalid role code rejected before database insertion', async () => {
    const { cookie } = await loginAs('admin@iocl.in');

    const res = await app.fetch(
      new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({
          empCode: 'IOCL-INV-001',
          name: 'Hacker User',
          email: 'hacker@iocl.in',
          phone: '9999999999',
          password: 'Password@123',
          roleCodes: ['SUPER_ADMINISTRATOR_ROLE'], // Invalid role code
        }),
      }),
      env
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('VALIDATION_ERROR');

    // Verify user was NOT inserted in database
    const userCheck = await env.DB.prepare("SELECT * FROM users WHERE email = 'hacker@iocl.in'").first();
    expect(userCheck).toBeNull();
  });

  // 25. ACCOUNT ENUMERATION BEHAVIOR
  it('25. account enumeration behavior: nonexistent vs wrong password produce equivalent response', async () => {
    // 1. Non-existent email + wrong password
    const resNonExistent = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'nonexistent.user.999@iocl.in', password: 'WrongPassword@999' }),
      }),
      env
    );
    expect(resNonExistent.status).toBe(401);
    const jsonNonExistent = (await resNonExistent.json()) as any;

    // 2. Existing email + wrong password
    const resExisting = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'WrongPassword@999' }),
      }),
      env
    );
    expect(resExisting.status).toBe(401);
    const jsonExisting = (await resExisting.json()) as any;

    // Must be completely equivalent
    expect(jsonNonExistent.error.code).toBe('INVALID_CREDENTIALS');
    expect(jsonExisting.error.code).toBe('INVALID_CREDENTIALS');
    expect(jsonNonExistent.error.message).toBe(jsonExisting.error.message);

    // 3. Inactive account + wrong password must NOT reveal ACCOUNT_DISABLED
    await env.DB.prepare("UPDATE users SET status = 'INACTIVE' WHERE email = 'dealer.parkstreet@iocl.in'").run();
    const resInactiveWrongPass = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'dealer.parkstreet@iocl.in', password: 'WrongPassword@999' }),
      }),
      env
    );
    expect(resInactiveWrongPass.status).toBe(401);
    const jsonInactive = (await resInactiveWrongPass.json()) as any;
    expect(jsonInactive.error.code).toBe('INVALID_CREDENTIALS');
  });

  // 26. EXACT-ORIGIN CORS BEHAVIOR
  it('26. exact-origin CORS behavior: approved origin succeeds, unapproved origin blocked', async () => {
    // 1. Approved origin (localhost:3000) preflight OPTIONS
    const approvedOptions = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:3000' },
      }),
      env
    );
    expect(approvedOptions.status).toBe(204);
    expect(approvedOptions.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');

    // 2. Unapproved origin (malicious shared subdomain or attacker domain) POST is blocked
    const maliciousPost = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.workers.dev' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      env
    );
    expect(maliciousPost.status).toBe(403);
    const malJson = (await maliciousPost.json()) as any;
    expect(malJson.error.code).toBe('FORBIDDEN_ORIGIN');
  });

  // 27. R2 upload rejects unauthorized outlet
  it('27. R2 upload rejects unauthorized outlet', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in'); // Dealer Park Street (ro-1001)

    // Attempt to upload document for Ludhiana outlet ro-1003
    const req = createMultipartDocRequest(
      'http://localhost/api/v1/documents',
      cookie,
      'ro-1003', // Unauthorized outlet
      '%PDF-1.4 test data',
      'malicious.pdf'
    );

    const res = await app.fetch(req, env);
    expect(res.status).toBe(403);
  });
});
