import dns from 'node:dns';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { db } from '../server/db.js';
import { postSchema } from '../server/blog.js';
const source = JSON.parse(
  await readFile(new URL('../content/journal/posts.json', import.meta.url), 'utf8'),
);
const posts = source.map(({ id, ...value }) => ({ id, ...postSchema.parse(value) }));
for (const post of posts) await access(new URL('../public/' + post.cover, import.meta.url));
if (posts.length !== 9 || new Set(posts.map((p) => p.slug)).size !== 9)
  throw Error('Expected nine unique articles.');
for (const category of ['photography', 'graphic-design', 'ai-design'])
  if (posts.filter((p) => p.category === category).length !== 3)
    throw Error('Expected three posts per topic.');
if (!process.argv.includes('--publish')) {
  console.log(
    'Validated 9 original articles and 9 local banners. Add --publish to insert missing articles. Existing posts and edits will be preserved.',
  );
  process.exit(0);
}
if (process.env.MONGODB_URI?.startsWith('mongodb+srv:')) dns.setServers(['1.1.1.1', '8.8.8.8']);
const database = await db();
const previous = await database.collection('posts').find({}).toArray();
const backup = new URL('../backups/', import.meta.url);
await mkdir(backup, { recursive: true, mode: 0o700 });
await writeFile(
  new URL('journal-before-publish-' + Date.now() + '.json', backup),
  JSON.stringify(previous),
  { mode: 0o600 },
);
await database.collection('posts').createIndex({ slug: 1 }, { unique: true });
const now = new Date();
const result = await database.collection('posts').bulkWrite(
  posts.map((post, index) => ({
    updateOne: {
      filter: { slug: post.slug },
      update: {
        $setOnInsert: {
          ...post,
          createdAt: now,
          updatedAt: now,
          publishedAt: new Date(now.getTime() - index * 1000),
        },
      },
      upsert: true,
    },
  })),
);
console.log(
  `Published ${result.upsertedCount} new articles; preserved ${result.matchedCount} existing articles. Recovery copy saved privately.`,
);
process.exit(0);
