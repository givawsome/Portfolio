import { Router } from 'express';
import { db } from './db.js';
import { readSettings } from './content.js';
import { siteOrigin, galleryPath, publicAsset } from '../shared/seo.js';
const xml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
export const seoRoutes = Router();
seoRoutes.get('/robots.txt', async (req, res) => {
  const settings = await readSettings(process.env.MONGODB_URI ? await db() : null);
  res
    .type('text/plain')
    .send(
      `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/admin/\nDisallow: /api/auth/\nDisallow: /api/inquiries\n\nSitemap: ${siteOrigin(settings)}/sitemap.xml\n`,
    );
});
seoRoutes.get('/sitemap.xml', async (req, res) => {
  const database = await db(),
    settings = await readSettings(database),
    origin = siteOrigin(settings);
  const [stored, media, posts] = await Promise.all([
    database.collection('content').findOne({ _id: 'manifest' }),
    database
      .collection('media')
      .find(
        { published: true, type: { $ne: 'archive' } },
        { projection: { collectionId: 1, src: 1, title: 1, alt: 1 } },
      )
      .sort({ collectionId: 1, order: 1, id: 1 })
      .limit(10000)
      .toArray(),
    database
      .collection('posts')
      .find({ published: true }, { projection: { slug: 1, cover: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .limit(10000)
      .toArray(),
  ]);
  const entries = [
    { path: '/' },
    { path: '/blog' },
    ...['photography', 'graphic-design', 'ai-design']
      .filter((category) => posts.length)
      .map((category) => ({ path: '/blog?category=' + category })),
  ];
  const collections = stored?.value.collections || {};
  for (const section of stored?.value.sections || []) {
    const images = media.filter((item) => section.collections.includes(item.collectionId));
    if (!images.length) continue;
    entries.push({ path: galleryPath(section.id), images: images.slice(0, 1000) });
    for (const id of section.collections) {
      if (!collections[id]?.character) continue;
      const characterImages = images.filter((item) => item.collectionId === id);
      if (characterImages.length)
        entries.push({ path: galleryPath(section.id, id), images: characterImages.slice(0, 1000) });
    }
  }
  for (const post of posts)
    entries.push({
      path: '/blog/' + encodeURIComponent(post.slug),
      lastmod: post.updatedAt,
      images: post.cover ? [{ src: post.cover }] : [],
    });
  const rows = entries
    .map(
      ({ path, images = [], lastmod }) =>
        `<url><loc>${xml(origin + path)}</loc>${lastmod && !Number.isNaN(new Date(lastmod).getTime()) ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}${images
          .map((item) => {
            const src = publicAsset(item.src);
            return src
              ? `<image:image><image:loc>${xml(new URL(src, origin).href)}</image:loc></image:image>`
              : '';
          })
          .join('')}</url>`,
    )
    .join('');
  res
    .set('Cache-Control', 'public, max-age=300')
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${rows}</urlset>`,
    );
});
