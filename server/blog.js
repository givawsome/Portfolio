import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import { asset, id } from './schemas.js';
import { topics } from '../shared/journal-topics.js';
export const postSchema = z
  .object({
    category: z.enum(Object.keys(topics)).default('photography'),
    title: z.string().trim().min(1).max(180),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(160),
    excerpt: z.string().max(500),
    body: z.string().min(1).max(60000),
    author: z.string().trim().min(1).max(100),
    cover: z.union([asset, z.literal('')]).default(''),
    coverAlt: z.string().max(300).default(''),
    coverCredit: z.string().max(300).default(''),
    tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    published: z.boolean().default(false),
  })
  .strict();
const clean = ({ _id, ...post }) => post;
export const publicBlog = Router();
publicBlog.get('/', async (req, res) => {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(req.query.page || 1);
  const database = await db();
  const category = req.query.category ? z.enum(Object.keys(topics)).parse(req.query.category) : '';
  const filter = {
    published: true,
    ...(category && {
      category: category === 'photography' ? { $in: ['photography', null] } : category,
    }),
  };
  const rows = await database
    .collection('posts')
    .find(filter, { projection: { body: 0 } })
    .sort({ publishedAt: -1, _id: 1 })
    .skip((page - 1) * 12)
    .limit(12)
    .toArray();
  res.json({
    items: rows.map(clean),
    page,
    total: await database.collection('posts').countDocuments(filter),
  });
});
publicBlog.get('/:slug', async (req, res) => {
  const post = await (
    await db()
  )
    .collection('posts')
    .findOne({ slug: req.params.slug, published: true });
  if (!post) return res.status(404).json({ error: 'Article not found' });
  res.json(clean(post));
});
export const adminBlog = Router();
adminBlog.get('/', async (req, res) => {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(req.query.page || 1);
  const database = await db();
  res.json({
    items: (
      await database
        .collection('posts')
        .find({})
        .sort({ updatedAt: -1, _id: 1 })
        .skip((page - 1) * 30)
        .limit(30)
        .toArray()
    ).map(clean),
    page,
    total: await database.collection('posts').countDocuments({}),
  });
});
async function save(req, res) {
  const values = postSchema.parse(req.body),
    database = await db();
  await database.collection('posts').createIndex({ slug: 1 }, { unique: true });
  const postId = req.params.id ? id.parse(req.params.id) : randomUUID();
  const existing = await database.collection('posts').findOne({ id: postId });
  if (req.params.id && !existing) return res.status(404).json({ error: 'Article not found' });
  const now = new Date();
  const post = {
    ...values,
    id: postId,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    publishedAt: values.published ? existing?.publishedAt || now : existing?.publishedAt || null,
  };
  try {
    await database
      .collection('posts')
      .updateOne({ id: postId }, { $set: post }, { upsert: !req.params.id });
  } catch (error) {
    if (error.code === 11000)
      return res.status(409).json({ error: 'Another article already uses this URL slug.' });
    throw error;
  }
  res.status(existing ? 200 : 201).json(post);
}
adminBlog.post('/', save);
adminBlog.put('/:id', save);
adminBlog.delete('/:id', async (req, res) => {
  const result = await (await db()).collection('posts').deleteOne({ id: id.parse(req.params.id) });
  if (!result.deletedCount) return res.status(404).json({ error: 'Article not found' });
  res.json({ ok: true });
});
