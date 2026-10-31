import { z } from 'zod';
import { config } from './content.js';
export const id = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,100}$/)
  .refine(
    (value) => !['__proto__', 'constructor', 'prototype'].includes(value),
    'Reserved identifier',
  );
export const asset = z
  .string()
  .max(2000)
  .refine(
    (s) => /^media\/[a-zA-Z0-9_.-]+$/.test(s) || (/^https:\/\//.test(s) && !/[<>"\s]/.test(s)),
    'Use an HTTPS asset URL or bundled media path',
  );
export const media = z
  .object({
    id,
    collectionId: id,
    title: z.string().min(1).max(200),
    name: z.string().max(200),
    src: asset.optional(),
    thumb: asset.optional(),
    original: asset.optional(),
    width: z.number().positive().max(100000),
    height: z.number().positive().max(100000),
    type: z.enum(['image', 'archive']).default('image'),
    published: z.boolean().default(true),
    order: z.number().int().min(0).default(0),
    group: z.string().max(200).default(''),
    folder: z.string().max(200).default(''),
    path: z.string().max(1000).default(''),
    sheet: asset.optional(),
    cell: z.number().int().min(0).optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    hd: z.boolean().optional(),
  })
  .refine(
    (v) => (v.type === 'archive' ? v.sheet && v.cols && v.rows && v.cell !== undefined : !!v.src),
    'An image source is required',
  );
export const collection = z.object({
  id,
  title: z.string().min(1).max(150),
  folder: z.string().max(200).default(''),
  frame: z.enum(['square', 'portrait', 'web', 'natural']),
  method: z.string().max(80),
  note: z.string().max(2000),
});
export const section = z.object({
  id,
  title: z.string().min(1).max(100),
  subtitle: z.string().max(500),
  collections: z.array(id).min(1).max(100),
  featured: id,
});
// A single definition drives backend validation and the admin content forms.
const contentShape = {};
for (const field of config.fields) {
  let rule = z.string().max(field.max || 2000);
  if (field.type === 'asset') rule = z.union([asset, z.literal('')]);
  if (field.type === 'email') rule = z.email();
  if (field.type === 'url')
    rule = z.union([
      z.url().refine((value) => value.startsWith('https://'), 'Use an HTTPS URL'),
      z.literal(''),
    ]);
  if (field.type === 'boolean') rule = z.boolean();
  if (field.type === 'number') rule = z.number().int().min(field.min).max(field.max);
  if (field.key === 'phone') rule = z.string().regex(/^\+?[0-9 ]{8,20}$/);
  contentShape[field.key] = rule.optional();
}
for (const list of config.lists) {
  const columns = Object.fromEntries(
    Object.keys(list.columns).map((key) => [key, z.string().max(key === 'body' ? 6000 : 200)]),
  );
  contentShape[list.key] = z.array(z.object(columns).strict()).max(30).optional();
}
export const settings = z.object(contentShape).strict();
