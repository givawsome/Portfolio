// Explicit operator action. Archive first, then remove only gallery records captured in that archive.
import { db } from '../server/db.js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { EJSON } from 'bson';
import { randomUUID } from 'node:crypto';
if (process.env.RESET_GALLERY !== 'CLEAR_IMPORTED_GALLERY')
  throw Error('Set RESET_GALLERY=CLEAR_IMPORTED_GALLERY explicitly.');
const database = await db();
const media = await database.collection('media').find({}).toArray();
const manifest = await database.collection('content').findOne({ _id: 'manifest' });
const settings = await database.collection('content').findOne({ _id: 'settings' });

const backup = {
  database: database.databaseName,
  createdAt: new Date(),
  media,
  manifest,
  settings,
};
const file = 'backups/' + database.databaseName + '-' + Date.now() + '-' + randomUUID() + '.ejson';
await mkdir('backups', { recursive: true, mode: 0o700 });
const encoded = EJSON.stringify(backup, { relaxed: false });
await writeFile(file, encoded, { mode: 0o600, flag: 'wx' });
const readback = EJSON.parse(await readFile(file, 'utf8'));
if (readback.media.length !== media.length)
  throw Error('Backup verification failed. Nothing deleted.');
const template = JSON.parse(
  await readFile(new URL('../shared/creative-categories.json', import.meta.url), 'utf8'),
);
// Snapshot filters ensure uploads added after the backup are not silently erased.
if (await database.collection('media').countDocuments({ _id: { $nin: media.map((x) => x._id) } }))
  throw Error('New uploads detected during backup; retry during a quiet period.');
const result = await database
  .collection('media')
  .deleteMany({ _id: { $in: media.map((x) => x._id) } });
await database
  .collection('content')
  .updateOne({ _id: 'manifest' }, { $set: { value: template } }, { upsert: true });
await database
  .collection('content')
  .updateOne({ _id: 'settings' }, { $set: { 'value.aboutImage': '' } }, { upsert: true });
console.log(
  JSON.stringify({
    database: database.databaseName,
    removed: result.deletedCount,
    remaining: await database.collection('media').countDocuments({}),
    backup: file,
    categories: template.sections.length,
  }),
);
process.exit(0);
