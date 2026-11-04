import dns from 'node:dns';
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { db } from '../server/db.js';
const posts = JSON.parse(
  await readFile(new URL('../content/journal/posts.json', import.meta.url), 'utf8'),
);
for (const post of posts) await access(new URL('../public/' + post.cover, import.meta.url));
await access(new URL('../public/media/journal-header-campaign-v2.jpg', import.meta.url));
if (!process.argv.includes('--apply')) {
  console.log(
    'Validated nine campaign covers and the header banner. Add --apply to update only the matching launch article cover fields; article content and publication state remain unchanged.',
  );
  process.exit(0);
}
if (process.env.MONGODB_URI?.startsWith('mongodb+srv:')) dns.setServers(['1.1.1.1', '8.8.8.8']);
const database = await db();
const before = await database
  .collection('posts')
  .find({ id: { $in: posts.map((post) => post.id) } })
  .toArray();
const directory = new URL('../backups/', import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(
  new URL('journal-before-campaign-covers-' + Date.now() + '.json', directory),
  JSON.stringify(before),
  { mode: 0o600 },
);
const result = await database.collection('posts').bulkWrite(
  posts.map((post) => ({
    updateOne: {
      filter: { id: post.id, slug: post.slug },
      update: {
        $set: {
          cover: post.cover,
          coverAlt: post.coverAlt,
          coverCredit: post.coverCredit,
          updatedAt: new Date(),
        },
      },
    },
  })),
);
console.log(
  `Updated ${result.modifiedCount} article covers (${result.matchedCount} matched). Article text, titles, tags and publication state preserved. Recovery copy saved privately.`,
);
process.exit(0);
