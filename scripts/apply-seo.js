import dns from 'node:dns';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../server/db.js';
import { categorySEO, seoDefaults } from '../shared/seo.js';
const vocabulary = {
  'ai-campaigns': ['AI campaign design', 'advertising concepts'],
  'imagined-worlds': ['AI art', 'visual storytelling'],
  'character-stories': ['character design', 'character artwork'],
  'brand-identities': ['logo design', 'brand identity'],
  'product-stories': ['product advertising', 'e-commerce design'],
  photography: ['product photography', 'commercial photography'],
  'digital-experiences': ['Figma UI design', 'website design'],
  'art-studies': ['paintings', 'art studies'],
  'sns-photoshop': ['Photoshop', 'social media design'],
};
if (process.env.MONGODB_URI?.startsWith('mongodb+srv:')) dns.setServers(['1.1.1.1', '8.8.8.8']);
const database = await db();
const [manifest, settings, media] = await Promise.all([
  database.collection('content').findOne({ _id: 'manifest' }),
  database.collection('content').findOne({ _id: 'settings' }),
  database.collection('media').find({}).toArray(),
]);
if (!manifest) throw Error('Portfolio manifest is missing');
const set = {};
for (const [index, section] of manifest.value.sections.entries()) {
  const seo = categorySEO[section.id];
  if (!seo) continue;
  set[`value.sections.${index}.seoTitle`] = section.seoTitle || seo.title + ' | Rajneesh Vaishnav';
  set[`value.sections.${index}.seoDescription`] = section.seoDescription || seo.description;
  set[`value.sections.${index}.focusKeywords`] = section.focusKeywords?.length
    ? section.focusKeywords
    : seo.keywords;
}
const changes = [];
for (const item of media) {
  const section = manifest.value.sections.find((s) => s.collections.includes(item.collectionId));
  if (!section || !vocabulary[section.id]) continue;
  const title = String(item.title || item.name || '')
    .replace(/\.(jpg|jpeg|png|webp|avif)$/i, '')
    .replace(/Panting/gi, 'Painting')
    .replace(/_/g, ' ')
    .trim();
  const values = {
    tags: [...new Set([...(item.tags || []), ...vocabulary[section.id]])].slice(0, 30),
    keywords: [...new Set([...(item.keywords || []), ...vocabulary[section.id]])].slice(0, 50),
  };
  if (
    !item.alt ||
    item.alt === item.title ||
    item.alt === item.name ||
    /^(Panting_|IMG_|DSC_|Untitled|Gemini_Generated|ChatGPT Image|final\.)/i.test(item.alt)
  )
    values.alt = (title + ' — ' + vocabulary[section.id][0]).slice(0, 500);
  changes.push({ updateOne: { filter: { _id: item._id }, update: { $set: values } } });
}
console.log(
  `Prepared ${Object.keys(set).length / 3} category SEO profiles and relevant tags/alt-text improvements for ${changes.length} images.`,
);
if (!process.argv.includes('--apply')) {
  console.log('Dry run only. Add --apply to save, with a recovery backup.');
  process.exit(0);
}
const backup = new URL('../backups/', import.meta.url);
await mkdir(backup, { recursive: true, mode: 0o700 });
await writeFile(
  new URL('before-seo-' + Date.now() + '.json', backup),
  JSON.stringify({ manifest, settings, media }),
  { mode: 0o600 },
);
await database.collection('content').updateOne({ _id: 'manifest' }, { $set: set });
await database.collection('content').updateOne(
  { _id: 'settings' },
  {
    $set: {
      'value.pageTitle': seoDefaults.title,
      'value.metaDescription': seoDefaults.description,
      'value.seoName': 'Rajneesh Vaishnav',
      'value.focusKeywords':
        'freelance graphic designer, product photographer Jaipur, AI art director, brand identity designer, Figma UI designer, social media designer',
      'value.workDescription':
        'Freelance design, product photography and AI art direction.\nFor brands in India and worldwide.',
    },
  },
  { upsert: true },
);
if (changes.length) await database.collection('media').bulkWrite(changes);
console.log(
  'Saved SEO metadata and image classifications. Descriptive existing alt text, artwork, titles, accounts and article content preserved.',
);
process.exit(0);
