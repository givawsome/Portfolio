import dns from 'node:dns';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../server/db.js';
import { collection, section } from '../server/schemas.js';
dns.setServers(['1.1.1.1', '8.8.8.8']);
const database = await db();
const manifest = await database.collection('content').findOne({ _id: 'manifest' });
if (!manifest) throw Error('Portfolio manifest is missing');
const folder = collection.parse({
  id: 'sns-photoshop',
  title: 'SNS / Photoshop',
  frame: 'natural',
  method: 'Photoshop',
  folder: 'SNS / Photoshop',
  note: 'Social media design, retouching and crafted layouts. Photoshop work, curated separately from AI-generated concepts.',
});
const category = section.parse({
  id: 'sns-photoshop',
  title: 'SNS / Photoshop',
  subtitle: 'Designed by hand: social creatives, retouching and typography in Photoshop.',
  collections: [folder.id],
  featured: folder.id,
});
const backupDir = new URL('../backups/', import.meta.url);
await mkdir(backupDir, { recursive: true, mode: 0o700 });
await writeFile(
  new URL('before-sns-category-' + Date.now() + '.json', backupDir),
  JSON.stringify(manifest),
  { mode: 0o600 },
);
if (!manifest.value.collections[folder.id]) {
  await database.collection('content').updateOne(
    { _id: 'manifest', ['value.collections.' + folder.id]: { $exists: false } },
    {
      $set: {
        ['value.collections.' + folder.id]: {
          ...folder,
          preview: [],
          count: 0,
          data: '/api/collections/' + folder.id,
        },
      },
    },
  );
}
await database
  .collection('content')
  .updateOne(
    { _id: 'manifest', 'value.sections.id': { $ne: category.id } },
    { $push: { 'value.sections': category } },
  );
await database.collection('content').updateOne(
  { _id: 'settings' },
  {
    $set: {
      'value.typographyStyle': 'cormorant',
      'value.heroDisciplines': 'PHOTOSHOP · FIGMA · CANVA',
      'value.aboutTools': 'PHOTOSHOP / LIGHTROOM / FIGMA / CANVA / AI-ASSISTED WORKFLOWS',
    },
  },
  { upsert: true },
);
console.log(
  'SNS / Photoshop category ready; approved font pairing and tool labels saved. Existing media preserved.',
);
process.exit();
