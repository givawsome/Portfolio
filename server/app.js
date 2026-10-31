import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { db } from './db.js';
import { authenticate, sameOrigin, token, verifyPassword, rateLimit } from './security.js';
import * as schemas from './schemas.js';
import { config, readSettings } from './content.js';
import { normalizeMedia } from './media.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'", 'https://api.cloudinary.com'],
        objectSrc: ["'none'"],
      },
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const clean = (doc) => {
  if (!doc) return doc;
  const { _id, ...rest } = normalizeMedia(doc);
  return rest;
};
const publicItem = (doc) => {
  const { _id, collectionId, published, order, ...rest } = normalizeMedia(doc);
  return { ...rest, ratio: rest.width / rest.height };
};
async function manifest() {
  const d = await db(),
    m = await d.collection('content').findOne({ _id: 'manifest' });
  if (!m) throw Object.assign(new Error('Import the portfolio first'), { status: 503 });
  const result = structuredClone(m.value);
  const counts = await d
    .collection('media')
    .aggregate([
      { $match: { published: true } },
      { $group: { _id: '$collectionId', count: { $sum: 1 } } },
    ])
    .toArray();
  const countMap = new Map(counts.map((row) => [row._id, row.count]));
  await Promise.all(
    Object.values(result.collections).map(async (c) => {
      c.count = countMap.get(c.id) || 0;
      c.preview = (
        await d
          .collection('media')
          .find({ collectionId: c.id, published: true })
          .sort({ order: 1, id: 1 })
          .limit(8)
          .toArray()
      ).map(publicItem);
      c.data = '/api/collections/' + c.id;
    }),
  );
  result.total = Object.values(result.collections).reduce((sum, c) => sum + c.count, 0);
  for (const key of Object.keys(result.hero || {})) {
    const ref = result.hero[key];
    const item = await d.collection('media').findOne({
      id: ref.id,
      ...(ref.collectionId ? { collectionId: ref.collectionId } : {}),
      published: true,
    });
    if (item) result.hero[key] = publicItem(item);
    else delete result.hero[key];
  }
  return result;
}
app.get('/api/health', async (req, res) => {
  if (!process.env.MONGODB_URI) return res.status(503).json({ database: 'not configured' });
  await (await db()).command({ ping: 1 });
  res.json({ database: 'connected', version: 'content-admin-v2' });
});
app.get(['/api/portfolio', '/portfolio.json'], async (req, res) => {
  if (!process.env.MONGODB_URI && process.env.NODE_ENV !== 'production')
    return res.sendFile(path.join(root, 'seed/manifest.json'), { dotfiles: 'allow' });
  res.json(await manifest());
});
app.get(['/api/collections/:id', '/collections/:id.json'], async (req, res) => {
  if (!process.env.MONGODB_URI && process.env.NODE_ENV !== 'production') {
    const name = schemas.id.parse(req.params.id);
    return res.sendFile(path.join(root, 'seed/collections', name + '.json'), { dotfiles: 'allow' });
  }
  const name = schemas.id.parse(req.params.id);
  res.json(
    (
      await (
        await db()
      )
        .collection('media')
        .find({ collectionId: name, published: true })
        .sort({ order: 1, id: 1 })
        .toArray()
    ).map(publicItem),
  );
});
app.get('/api/content-config', (_req, res) => res.json(config));
app.get('/api/settings', async (_req, res) =>
  res.json(await readSettings(process.env.MONGODB_URI ? await db() : null)),
);
app.post('/api/inquiries', sameOrigin, async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2).max(100),
      email: z.email(),
      service: z.string().max(100),
      message: z.string().min(10).max(5000),
      budget: z.string().max(100).optional(),
      timeline: z.string().max(100).optional(),
      website: z.string().max(0).optional(),
    })
    .parse(req.body);
  const d = await db();
  await rateLimit(d, 'inquiry:' + req.ip, 5, 3600);
  await d.collection('inquiries').insertOne({ ...data, status: 'new', createdAt: new Date() });
  res.status(201).json({ ok: true });
});
app.post('/api/auth/login', sameOrigin, async (req, res) => {
  const { email, password } = z
    .object({
      email: z
        .string()
        .trim()
        .min(3)
        .max(254)
        .regex(/^[a-zA-Z0-9@._+-]+$/),
      password: z.string().min(1).max(200),
    })
    .parse(req.body);
  const d = await db();
  await rateLimit(d, 'login:' + req.ip + ':' + email.toLowerCase(), 8, 900);
  await rateLimit(d, 'login-global:' + email.toLowerCase(), 30, 900);
  const admin = await d.collection('admins').findOne({ email: email.toLowerCase() });
  if (!verifyPassword(password, admin?.passwordHash || ''))
    return res.status(401).json({ error: 'Invalid admin ID or password' });
  res
    .cookie('session', await token(admin), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 8 * 3600000,
      path: '/',
    })
    .json({ email: admin.email });
});
app.post('/api/auth/logout', sameOrigin, (req, res) =>
  res.clearCookie('session', { path: '/' }).json({ ok: true }),
);
app.get('/api/auth/me', authenticate, (req, res) => res.json({ email: req.admin.email }));
app.use('/api/admin', sameOrigin, authenticate);
app.get('/api/admin/manifest', async (_req, res) => {
  const record = await (await db()).collection('content').findOne({ _id: 'manifest' });
  if (!record)
    return res.status(503).json({ error: 'Run npm run seed once before using the admin panel.' });
  res.json(record.value);
});
app.put('/api/admin/collections/:id', async (req, res) => {
  const c = schemas.collection.parse({ ...req.body, id: req.params.id });
  const d = await db();
  await d.collection('content').updateOne(
    { _id: 'manifest' },
    {
      $set: {
        ['value.collections.' + c.id]: {
          ...c,
          count: 0,
          data: '/api/collections/' + c.id,
          preview: [],
        },
      },
    },
  );
  res.json(c);
});
app.delete('/api/admin/collections/:id', async (req, res) => {
  const id = schemas.id.parse(req.params.id),
    d = await db(),
    m = await d.collection('content').findOne({ _id: 'manifest' });
  if (m.value.sections.some((s) => s.collections.includes(id)))
    return res.status(409).json({ error: 'Remove this collection from its category first' });
  if (await d.collection('media').countDocuments({ collectionId: id }))
    return res.status(409).json({ error: 'Move or delete its images first' });
  await d
    .collection('content')
    .updateOne({ _id: 'manifest' }, { $unset: { ['value.collections.' + id]: '' } });
  res.json({ ok: true });
});
app.put('/api/admin/sections', async (req, res) => {
  const sections = z.array(schemas.section).min(1).max(100).parse(req.body);
  if (new Set(sections.map((s) => s.id)).size !== sections.length)
    throw Object.assign(new Error('Duplicate category IDs'), { status: 400 });
  const d = await db(),
    m = await d.collection('content').findOne({ _id: 'manifest' });
  if (
    sections.some(
      (s) =>
        !s.collections.includes(s.featured) || s.collections.some((id) => !m.value.collections[id]),
    )
  )
    throw Object.assign(new Error('Invalid category collection references'), { status: 400 });
  await d
    .collection('content')
    .updateOne({ _id: 'manifest' }, { $set: { 'value.sections': sections } });
  res.json({ ok: true });
});
app.get('/api/admin/media', async (req, res) => {
  const cid = schemas.id.parse(req.query.collectionId),
    page = Math.max(1, parseInt(req.query.page) || 1);
  const d = await db(),
    filter = { collectionId: cid };
  if (req.query.status === 'published') filter.published = true;
  if (req.query.status === 'draft') filter.published = false;
  const query = z
    .string()
    .max(200)
    .parse(req.query.q || '');
  if (query) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { name: { $regex: escaped, $options: 'i' } },
    ];
  }
  res.json({
    items: (
      await d
        .collection('media')
        .find(filter)
        .sort({ order: 1, id: 1 })
        .skip((page - 1) * 48)
        .limit(48)
        .toArray()
    ).map(clean),
    total: await d.collection('media').countDocuments(filter),
    page,
  });
});
app.put('/api/admin/media/:id', async (req, res) => {
  const data = schemas.media.parse(normalizeMedia({ ...req.body, id: req.params.id })),
    d = await db(),
    m = await d.collection('content').findOne({ _id: 'manifest' });
  if (!m?.value.collections[data.collectionId])
    return res.status(400).json({ error: 'Unknown collection' });
  await d
    .collection('media')
    .updateOne(
      { collectionId: data.collectionId, id: data.id },
      { $set: { ...data, updatedAt: new Date() } },
      { upsert: true },
    );
  res.json(data);
});
app.delete('/api/admin/media/:collection/:id', async (req, res) => {
  await (await db()).collection('media').deleteOne({
    collectionId: schemas.id.parse(req.params.collection),
    id: schemas.id.parse(req.params.id),
  });
  res.json({ ok: true });
});
app.put('/api/admin/hero/:slot', async (req, res) => {
  const slot = z.enum(['product', 'painting', 'character']).parse(req.params.slot),
    d = await db();
  const input = z.object({ id: schemas.id, collectionId: schemas.id }).parse(req.body);
  const item = await d.collection('media').findOne({ ...input, published: true, type: 'image' });
  if (!item) return res.status(400).json({ error: 'Choose a published standalone image' });
  await d.collection('content').updateOne(
    { _id: 'manifest' },
    {
      $set: { ['value.hero.' + slot]: { ...publicItem(item), collectionId: item.collectionId } },
    },
  );
  res.json({ ok: true });
});
app.get('/api/admin/settings', async (_req, res) => res.json(await readSettings(await db())));
app.put('/api/admin/settings', async (req, res) => {
  const value = schemas.settings.parse(req.body);
  if (!Object.keys(value).length) return res.status(400).json({ error: 'No settings provided' });
  await (await db()).collection('content').updateOne(
    { _id: 'settings' },
    {
      $set: Object.fromEntries(Object.entries(value).map(([key, val]) => ['value.' + key, val])),
    },
    { upsert: true },
  );
  res.json(await readSettings(await db()));
});
app.get('/api/admin/inquiries', async (req, res) =>
  res.json(
    (
      await (await db()).collection('inquiries').find().sort({ createdAt: -1 }).limit(100).toArray()
    ).map((d) => ({ ...d, _id: String(d._id) })),
  ),
);
app.patch('/api/admin/inquiries/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid inquiry' });
  const status = z.enum(['new', 'read', 'archived']).parse(req.body.status);
  await (
    await db()
  )
    .collection('inquiries')
    .updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status } });
  res.json({ ok: true });
});
// Dedicated management screens share these authenticated endpoints.
app.get('/api/admin/stats', async (_req, res) => {
  const database = await db();
  const [published, drafts, inquiries] = await Promise.all([
    database.collection('media').countDocuments({ published: true }),
    database.collection('media').countDocuments({ published: false }),
    database.collection('inquiries').countDocuments({ status: 'new' }),
  ]);
  res.json({ published, drafts, inquiries });
});
app.patch('/api/admin/settings', async (req, res) => {
  const values = schemas.settings.partial().parse(req.body);
  const fields = Object.fromEntries(
    Object.entries(values).map(([key, value]) => ['value.' + key, value]),
  );
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'No settings provided' });
  await (
    await db()
  )
    .collection('content')
    .updateOne({ _id: 'settings' }, { $set: fields }, { upsert: true });
  res.json({ ok: true });
});
app.delete('/api/admin/hero/:slot', async (req, res) => {
  const slot = z.enum(['product', 'painting', 'character']).parse(req.params.slot);
  await (
    await db()
  )
    .collection('content')
    .updateOne({ _id: 'manifest' }, { $unset: { ['value.hero.' + slot]: '' } });
  res.json({ ok: true });
});
app.delete('/api/admin/inquiries/:id', async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid enquiry' });
  const result = await (
    await db()
  )
    .collection('inquiries')
    .deleteOne({ _id: new ObjectId(req.params.id) });
  if (!result.deletedCount) return res.status(404).json({ error: 'Enquiry not found' });
  res.json({ ok: true });
});
app.post('/api/admin/upload-signature', (req, res) => {
  const {
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: apiKey,
    CLOUDINARY_API_SECRET: secret,
  } = process.env;
  if (!cloudName || !apiKey || !secret)
    return res.status(503).json({ error: 'Configure Cloudinary to enable uploads' });
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: 'portfolio/' + randomUUID(),
    overwrite: false,
  };
  const base = Object.keys(params)
    .sort()
    .map((k) => k + '=' + params[k])
    .join('&');
  res.json({
    cloudName,
    apiKey,
    params,
    signature: createHash('sha1')
      .update(base + secret)
      .digest('hex'),
  });
});
app.use('/admin', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/admin', express.static(path.join(root, 'admin')));
app.use(express.static(path.join(root, 'public'), { index: 'index.html' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof z.ZodError ? 400 : err.status || 500;
  res.status(status).json({
    error:
      err instanceof z.ZodError
        ? 'Please correct the highlighted fields'
        : status === 500
          ? 'The request could not be completed'
          : err.message,
    issues: err instanceof z.ZodError ? err.issues : undefined,
  });
});
export default app;
