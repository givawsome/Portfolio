import dns from 'node:dns';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { db } from '../server/db.js';
import { media } from '../server/schemas.js';
dns.setServers(['1.1.1.1', '8.8.8.8']);
const library = new URL('../../brand-hero-banners/v2/', import.meta.url);
const items = JSON.parse(await readFile(new URL('manifest.json', library), 'utf8'));
if (items.length !== 15) throw Error('Expected all 15 finished banners');
for (const item of items) {
  item.title = item.brand + ' — Campaign concept';
  item.category = 'AI Campaigns';
}
const database = await db();
const manifest = await database.collection('content').findOne({ _id: 'manifest' });
const collection = Object.entries(manifest.value.collections).find(
  ([id, c]) => id === 'ai-campaigns' || c.title === 'AI Campaigns',
);
if (!collection) throw Error('AI Campaigns collection not found');
const collectionId = collection[0];
const cloud = process.env.CLOUDINARY_CLOUD_NAME;
const key = process.env.CLOUDINARY_API_KEY;
const secret = process.env.CLOUDINARY_API_SECRET;
if (!cloud || !key || !secret) throw Error('Cloudinary is not configured');
const receiptPath = new URL('upload-receipt.json', library);
let receipts = [];
try {
  receipts = JSON.parse(await readFile(receiptPath, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
for (const item of items) {
  const id = 'brand-hero-' + createHash('sha256').update(item.brand).digest('hex').slice(0, 24);
  if (false) {
    console.log('Already uploaded:', item.title);
    continue;
  }
  let uploaded = receipts.find((r) => r.id === id);
  if (!uploaded) {
    const params = {
      overwrite: 'false',
      public_id: 'portfolio/brand-heroes-v2/' + id,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const signature = createHash('sha1')
      .update(
        Object.keys(params)
          .sort()
          .map((k) => k + '=' + params[k])
          .join('&') + secret,
      )
      .digest('hex');
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...params, api_key: key, signature })) form.set(k, v);
    form.set('file', new Blob([await readFile(item.path)], { type: 'image/png' }), id + '.png');
    const response = await fetch('https://api.cloudinary.com/v1_1/' + cloud + '/image/upload', {
      method: 'POST',
      body: form,
    });
    const data = await response.json();
    if (!response.ok) throw Error('Upload failed: ' + (data.error?.message || response.status));
    uploaded = {
      id,
      title: item.title,
      src: data.secure_url,
      width: data.width,
      height: data.height,
    };
    receipts.push(uploaded);
    await writeFile(receiptPath, JSON.stringify(receipts, null, 2));
  }
  const record = media.parse({
    id,
    collectionId,
    title: item.title,
    name: item.path.split('/').pop(),
    src: uploaded.src,
    original: uploaded.src,
    thumb: uploaded.src.replace('/upload/', '/upload/c_limit,w_800,q_auto,f_auto/'),
    width: uploaded.width,
    height: uploaded.height,
    type: 'image',
    published: true,
    order: items.indexOf(item),
    tags: ['AI-generated', 'Concept work', item.category],
    keywords: ['Rajneesh Vaishnav', 'AI design', item.title],
    alt: item.title + ' — AI-generated concept',
    group: 'AI-generated concepts',
    folder: 'AI Campaigns',
  });
  await database
    .collection('media')
    .updateOne(
      { collectionId, id },
      { $set: { ...record, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
  console.log('Uploaded:', item.title);
}
console.log(
  JSON.stringify({
    uploaded: items.length,
    collectionId,
    visible: await database.collection('media').countDocuments({ collectionId, published: true }),
  }),
);
process.exit();
