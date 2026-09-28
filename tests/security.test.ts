import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

describe('IOCL Digital Pump Manager Phase 1A Security Hardening Suite', () => {
  let env: { DB: D1Database; DOCUMENTS_BUCKET: R2Bucket };

  beforeEach(async () => {
    const dbPath = `./.sqlite/test_iocl_${Math.random().toString(36).substring(7)}.db`;
    const localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);
    env = { DB: localD1, DOCUMENTS_BUCKET: {} as any };
  });

  const getCookie = (res: Response) => {
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) return '';
    return setCookie.split(';')[0];
  };

  // Helper login
  const loginAs = async (email: string) => {
    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password@123' }),
      }),
      env
    );
    const cookie = getCookie(res);
    const json = (await res.json()) as any;
    return { res, cookie, json };
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'WrongPassword999' }),
      }),
      env
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as any;
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('INVALID_CREDENTIALS');
  });

  // 3. Disabled user cannot login
  it('3. Disabled user cannot login', async () => {
    // First disable a user
    await env.DB.prepare("UPDATE users SET status = 'INACTIVE' WHERE email = 'dealer.parkstreet@iocl.in'").run();

    const res = await app.fetch(
      new Request('http://localhost/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { Cookie: cookie },
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
    // CSP does not have users.create permission
    const res = await app.fetch(
      new Request('http://localhost/api/v1/users', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
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
    // Attempting to access Salt Lake outlet ro-1002 (Dealer is only scoped to ro-1001)
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
    // FO Kolkata Central attempts to access Ludhiana outlet ro-1003
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
    const { cookie } = await loginAs('wbso@iocl.in'); // West Bengal SO
    // Attempting to access Punjab outlet ro-1003
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
    expect(json.data.length).toBe(3); // Sees all 3 outlets (Park Street, Salt Lake, Ludhiana)
  });

  // 12. State user cannot assign GLOBAL scope
  it('12. State user cannot assign GLOBAL scope', async () => {
    const { cookie } = await loginAs('wbso@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/scopes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
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
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
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

  // 14. State user cannot disable user from another State
  it('14. State user cannot disable user from another State', async () => {
    const { cookie } = await loginAs('wbso@iocl.in'); // WBSO
    // Attempting to disable Punjab user / Admin
    const res = await app.fetch(
      new Request('http://localhost/api/v1/users/user-admin/status', {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
      env
    );
    expect(res.status).toBe(403);
  });

  // 15. User cannot elevate their own scope
  it('15. User cannot elevate their own scope', async () => {
    const { cookie } = await loginAs('wbso@iocl.in');
    const res = await app.fetch(
      new Request('http://localhost/api/v1/scopes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-so', // Self
          scopeLevel: 'GLOBAL',
        }),
      }),
      env
    );
    expect(res.status).toBe(403);
  });

  // 16. Mixed STATE + OUTLET scopes do not broaden the OUTLET into state access
  it('16. Mixed STATE + OUTLET scopes do not broaden the OUTLET into state access', async () => {
    const now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO user_scope_assignments (id, user_id, scope_level, state_id, outlet_id, created_at, created_by) VALUES ('s-mix-1', 'user-fo', 'STATE', 'state-pb', NULL, ?, 'SYS')").bind(now).run();
    await env.DB.prepare("INSERT INTO user_scope_assignments (id, user_id, scope_level, state_id, outlet_id, created_at, created_by) VALUES ('s-mix-2', 'user-fo', 'OUTLET', 'state-wb', 'ro-1001', ?, 'SYS')").bind(now).run();

    const { cookie } = await loginAs('fo.central@iocl.in');
    const res = await app.fetch(new Request('http://localhost/api/v1/outlets', { headers: { Cookie: cookie } }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    const outletIds = json.data.map((o: any) => o.id);

    // FO sees Punjab outlets + Park Street outlet, but NOT Salt Lake outlet ro-1002!
    expect(outletIds).toContain('ro-1003'); // Ludhiana (Punjab)
    expect(outletIds).toContain('ro-1001'); // Park Street (Explicit OUTLET scope)
    expect(outletIds).not.toContain('ro-1002'); // Salt Lake (West Bengal, NOT assigned)
  });

  // 17. Hierarchy parent validation works
  it('17. Hierarchy parent validation works', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    // Invalid division scope with non-existent division ID
    const res = await app.fetch(
      new Request('http://localhost/api/v1/scopes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
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

  // 18. Important mutation creates audit log
  it('18. Important mutation creates audit log', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    await app.fetch(
      new Request('http://localhost/api/v1/hierarchy/states', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
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

  // 19. R2 upload rejects unauthorized outlet
  it('19. R2 upload rejects unauthorized outlet', async () => {
    const { cookie } = await loginAs('dealer.parkstreet@iocl.in'); // Dealer Park Street
    // Attempt to register document for Ludhiana outlet ro-1003
    const res = await app.fetch(
      new Request('http://localhost/api/v1/documents', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Malicious Upload.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          outletId: 'ro-1003',
        }),
      }),
      env
    );
    expect(res.status).toBe(403);
  });

  // 20. Invalid scope shapes are rejected
  it('20. Invalid scope shapes are rejected', async () => {
    const { cookie } = await loginAs('admin@iocl.in');
    // STATE scope missing stateId
    const res = await app.fetch(
      new Request('http://localhost/api/v1/scopes', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user-fo',
          scopeLevel: 'STATE', // missing stateId
        }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
