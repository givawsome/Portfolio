import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../server/app.js';
import { hashPassword, verifyPassword, token } from '../server/security.js';
import { jwtVerify } from 'jose';
import { media } from '../server/schemas.js';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.AUTH_SECRET = 'test-secret-only-with-over-32-characters';
test('password hashes use random salt and reject wrong passwords', () => {
  const a = hashPassword('correct horse battery staple'),
    b = hashPassword('correct horse battery staple');
  assert.notEqual(a, b);
  assert(verifyPassword('correct horse battery staple', a));
  assert(!verifyPassword('wrong', a));
  assert(!verifyPassword('anything', 'malformed'));
});
test('signed session contains expiry, audience and revocation version', async () => {
  const jwt = await token({ _id: 'admin-id', email: 'admin@example.com', version: 4 });
  const { payload } = await jwtVerify(jwt, new TextEncoder().encode(process.env.AUTH_SECRET), {
    issuer: 'rajneesh-admin',
    audience: 'portfolio',
  });
  assert.equal(payload.version, 4);
  assert(payload.exp > payload.iat);
});
test('admin is protected, not just hidden by the UI', async () => {
  const r = await request(app).get('/api/admin/media?collectionId=products');
  assert.equal(r.status, 401);
});
test('cross-origin writes rejected before processing', async () => {
  const r = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'https://untrusted.example')
    .send({ email: 'admin@example.com', password: 'password' });
  assert.equal(r.status, 403);
});
test('invalid login input rejected', async () => {
  const r = await request(app)
    .post('/api/auth/login')
    .set('Origin', 'http://localhost:3000')
    .send({ email: 'wrong', password: '' });
  assert.equal(r.status, 400);
});
test('development fallback retains every original collection', async () => {
  if (process.env.MONGODB_URI) return;
  const r = await request(app).get('/api/portfolio');
  assert.equal(r.status, 200);
  assert.equal(r.body.sections.length, 12);
  assert.equal(Object.keys(r.body.collections).length, 48);
});
test('media schema blocks unsafe URLs and malformed entries', () => {
  const base = {
    id: 'one',
    collectionId: 'products',
    title: 'Product',
    name: 'product.jpg',
    src: 'https://cdn.example/image.jpg',
    width: 1000,
    height: 1000,
  };
  assert(media.safeParse(base).success);
  assert(!media.safeParse({ ...base, src: 'javascript:alert(1)' }).success);
  assert(!media.safeParse({ ...base, width: -1 }).success);
  assert(!media.safeParse({ ...base, id: '$set' }).success);
});
test('admin and frontend both served', async () => {
  assert.equal((await request(app).get('/admin/')).status, 200);
  assert.match((await request(app).get('/')).text, /CREATE/);
});

test('new management endpoints require authentication', async () => {
  for (const [method, path] of [
    ['get', '/api/admin/stats'],
    ['patch', '/api/admin/settings'],
    ['delete', '/api/admin/hero/product'],
    ['delete', '/api/admin/inquiries/012345678901234567890123'],
  ]) {
    const response = await request(app)
      [method](path)
      .set('Origin', 'http://localhost:3000')
      .send({});
    assert.equal(response.status, 401);
  }
});
