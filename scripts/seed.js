import { readFile } from 'node:fs/promises';
import { db, indexes } from '../server/db.js';
import { normalizeMedia } from '../server/media.js';
const d = await db();
await indexes(d);
if (await d.collection('content').findOne({ _id: 'manifest' })) {
  console.error('Already imported. Seed will not overwrite your edits.');
  process.exit(1);
}
const m = JSON.parse(await readFile(new URL('../seed/manifest.json', import.meta.url)));
for (const c of Object.values(m.collections)) {
  const name = c.data.split('/').pop();
  const rows = JSON.parse(await readFile(new URL('../seed/collections/' + name, import.meta.url)));
  if (rows.length)
    await d.collection('media').bulkWrite(
      rows.map((item, order) => ({
        updateOne: {
          filter: { collectionId: c.id, id: item.id },
          update: {
            $setOnInsert: { ...normalizeMedia(item), collectionId: c.id, order, published: true },
          },
          upsert: true,
        },
      })),
    );
}
await d.collection('content').insertOne({ _id: 'manifest', value: m });
console.log('Imported all categories and images.');
process.exit(0);
