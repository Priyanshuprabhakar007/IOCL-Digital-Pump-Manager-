import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../src/worker/app';
import { createLocalD1Database } from '../src/db/localD1';
import { getDb } from '../src/db';
import { seedDatabase } from '../src/db/seed';
import fs from 'fs';

describe('Development Login & Authentication Regression Suite', () => {
  let envDev: { DB: any; DOCUMENTS_BUCKET: any; ENVIRONMENT: string; ALLOWED_ORIGINS?: string };
  let envProd: { DB: any; DOCUMENTS_BUCKET: any; ENVIRONMENT: string; ALLOWED_ORIGINS?: string };
  let dbPath: string;
  let localD1: any;

  beforeEach(async () => {
    dbPath = `./.sqlite/test_auth_reg_${Math.random().toString(36).substring(7)}.db`;
    localD1 = createLocalD1Database(dbPath);
    const db = getDb(localD1);
    await seedDatabase(db);

    const mockBucket = {
      put: async () => ({ key: '', size: 0 }),
      delete: async () => {},
    };

    envDev = {
      DB: localD1,
      DOCUMENTS_BUCKET: mockBucket as any,
      ENVIRONMENT: 'development',
      ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
    };

    envProd = {
      DB: localD1,
      DOCUMENTS_BUCKET: mockBucket as any,
      ENVIRONMENT: 'production',
      ALLOWED_ORIGINS: 'https://iocl.in,https://pumpmanager.iocl.in',
    };
  });

  afterEach(() => {
    try {
      localD1.close();
    } catch (e) {}

    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
    } catch (e) {}
  });

  // 1. development login returns Set-Cookie without Secure on HTTP
  it('1. development login returns Set-Cookie without Secure on HTTP', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(/;\s*Secure/i.test(setCookie!)).toBe(false);
  });

  // 2. production login cookie contains Secure
  it('2. production login cookie contains Secure', async () => {
    const res = await app.fetch(
      new Request('https://iocl.in/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://iocl.in' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      envProd
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('HttpOnly');
    expect(/;\s*Secure/i.test(setCookie!)).toBe(true);
  });

  // 3. valid admin demo credentials authenticate
  it('3. valid admin demo credentials authenticate', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.data.user.email).toBe('admin@iocl.in');
    expect(data.data.roles).toContain('ADMIN');
  });

  // 4. login followed by /auth/me succeeds with returned cookie
  it('4. login followed by /auth/me succeeds with returned cookie', async () => {
    const loginRes = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'dealer.parkstreet@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    expect(loginRes.status).toBe(200);
    const rawCookie = loginRes.headers.get('set-cookie');
    expect(rawCookie).toBeTruthy();
    const cookieHeader = rawCookie!.split(';')[0];

    const meRes = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/me', {
        method: 'GET',
        headers: { Cookie: cookieHeader, Origin: 'http://localhost:3000' },
      }),
      envDev
    );

    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as any;
    expect(meData.success).toBe(true);
    expect(meData.data.user.email).toBe('dealer.parkstreet@iocl.in');
  });

  // 5. invalid credentials return 401
  it('5. invalid credentials return 401', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'WrongPassword' }),
      }),
      envDev
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_CREDENTIALS');
  });

  // 6. demo login failure is surfaced by UI/auth context logic
  it('6. demo login failure is surfaced by UI/auth context', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'nonexistent@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.success).toBe(false);
    expect(data.error.message).toBe('Invalid email or password.');
  });

  // 7. same-origin development request is accepted
  it('7. same-origin development request is accepted', async () => {
    // Simulated hosted preview domain (Google AI Studio reverse proxy)
    const previewUrl = 'https://ais-preview-domain.run.app/api/v1/auth/login';
    const previewOrigin = 'https://ais-preview-domain.run.app';

    const res = await app.fetch(
      new Request(previewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: previewOrigin },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(previewOrigin);
  });

  // 8. unauthorized external Origin is rejected
  it('8. unauthorized external Origin is rejected', async () => {
    const res = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://malicious-site.com' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    expect(res.status).toBe(403);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe('FORBIDDEN_ORIGIN');
  });

  // 9. logout invalidates the session
  it('9. logout invalidates the session', async () => {
    const loginRes = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'admin@iocl.in', password: 'Password@123' }),
      }),
      envDev
    );

    const cookieHeader = loginRes.headers.get('set-cookie')!.split(';')[0];

    const logoutRes = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/logout', {
        method: 'POST',
        headers: { Cookie: cookieHeader, Origin: 'http://localhost:3000' },
      }),
      envDev
    );

    expect(logoutRes.status).toBe(200);
    const logoutCookie = logoutRes.headers.get('set-cookie');
    expect(logoutCookie).toBeTruthy();

    const afterMeRes = await app.fetch(
      new Request('http://localhost:3000/api/v1/auth/me', {
        method: 'GET',
        headers: { Cookie: cookieHeader, Origin: 'http://localhost:3000' },
      }),
      envDev
    );

    expect(afterMeRes.status).toBe(401);
  });
});
