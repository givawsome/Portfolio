import { db, indexes } from '../server/db.js';
const database = await db();
await indexes(database);
const result = await database.collection('media').updateOne(
  {
    id: 'acc8a004d929828e',
    src: 'media/acc8a004d929828e.svg',
    $or: [{ width: { $exists: false } }, { height: { $exists: false } }],
  },
  { $set: { width: 400, height: 400, ratio: 1 } },
);
console.log(
  `Migration complete: ${result.modifiedCount} legacy image record repaired. Existing content preserved.`,
);
process.exit(0);
