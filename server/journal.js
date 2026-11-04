import { Router } from 'express';
import { db } from './db.js';
import { readSettings } from './content.js';
import { topics } from '../shared/journal-topics.js';

export const escapeHTML = (value = '') =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const e = escapeHTML;
const topic = (post) => topics[post.category] || topics.photography;
const assetURL = (src) =>
  /^https:\/\/[^\s<>"']+$/.test(src || '')
    ? src
    : /^media\/[a-zA-Z0-9_.-]+$/.test(src || '')
      ? '/' + src
      : '';
const href = (post) => '/blog/' + encodeURIComponent(post.slug);
const minutes = (post) =>
  Math.max(1, Math.ceil((post.body || post.excerpt || '').split(/\s+/).length / 200));
const date = (value) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    : '';
export function renderBody(body) {
  return String(body)
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => {
      const heading = p.match(/^(#{1,3})\s+([^\n]+)$/);
      return heading
        ? `<h${heading[1].length + 1}>${e(heading[2])}</h${heading[1].length + 1}>`
        : `<p>${e(p)}</p>`;
    })
    .join('');
}
function image(post, eager = false) {
  const src = assetURL(post.cover);
  return src
    ? `<img src="${e(src)}" alt="${e(post.coverAlt)}" width="1600" height="900" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : '<div class="cover-placeholder" aria-hidden="true">A different perspective.</div>';
}
function card(post) {
  return `<article class="post-card"><a class="card-image" href="${href(post)}" tabindex="-1" aria-hidden="true">${image(post)}</a><p class="eyebrow">${e(topic(post))} <span> / ${minutes(post)} min read</span></p><h2><a href="${href(post)}">${e(post.title)}</a></h2><p>${e(post.excerpt)}</p><a class="read-story" href="${href(post)}" aria-label="Read ${e(post.title)}">Read story <span aria-hidden="true">↗</span></a></article>`;
}
export function journalPage({
  settings = {},
  posts = [],
  total = 0,
  page = 1,
  category = '',
  post,
  origin = '',
  missing = false,
} = {}) {
  const siteName = settings.brandName || 'Rajneesh Vaishnav';
  const title = post
    ? `${post.title} · ${siteName}`
    : missing
      ? `Article not found · ${siteName}`
      : `${category ? topics[category] + ' · ' : ''}The Journal · ${siteName}`;
  const description =
    post?.excerpt ||
    'Photography, graphic design and AI art direction. Original practical guides and creative notes from Rajneesh Vaishnav.';
  const canonicalPath = post
    ? href(post)
    : '/blog' +
      (category || page > 1
        ? '?' + new URLSearchParams({ ...(category && { category }), ...(page > 1 && { page }) })
        : '');
  const canonical = origin + canonicalPath;
  const logo = assetURL(settings.headerLogo);
  const brand = logo
    ? `<img src="${e(logo)}" alt="${e(settings.logoAlt || siteName)}" width="240" height="80">`
    : `<span class="brand-name">${e(siteName)}</span>`;
  let content;
  if (missing)
    content =
      '<section class="journal-empty"><p class="eyebrow">404 / A MISSING PAGE</p><h1>This story isn’t here.</h1><p>It may be unpublished or the address may have changed.</p><a class="pill" href="/blog">Explore the Journal</a></section>';
  else if (post) {
    content = `<article class="article"><header class="article-heading"><a class="back-link" href="/blog?category=${e(post.category || 'photography')}">All journal entries</a><p class="eyebrow">${e(topic(post))} / ${minutes(post)} MIN READ</p><h1>${e(post.title)}</h1><p class="article-deck">${e(post.excerpt)}</p><p class="byline">By ${e(post.author)} <span> / ${e(date(post.publishedAt))}</span></p></header><figure class="article-cover">${image(post, true)}${post.coverCredit ? `<figcaption>${e(post.coverCredit)}</figcaption>` : ''}</figure><div class="reading-layout"><aside class="reading-aside"><p class="eyebrow">FIELD NOTES</p><p>${e(topic(post))}</p><a href="/#about">About the designer</a></aside><div class="article-body">${renderBody(post.body)}<div class="article-tags">${(post.tags || []).map((t) => `<span>${e(t)}</span>`).join('')}</div><div class="author-note"><p class="eyebrow">THE PRACTICE BEHIND THE NOTES</p><p>${e(siteName)} works across visual design, photography and AI-assisted concepts. Explore the portfolio for the work behind this journal.</p><a href="/#work">Explore selected work</a></div></div></div></article>${posts.length ? `<section class="related"><div class="section-heading"><p class="eyebrow">KEEP EXPLORING</p><h2>Another way to see.</h2></div><div class="post-grid">${posts.map(card).join('')}</div></section>` : ''}`;
  } else {
    const feature = posts[0];
    const filters = Object.entries({ '': 'All stories', ...topics })
      .map(
        ([key, label]) =>
          `<a href="/blog${key ? '?category=' + key : ''}" ${key === category ? 'aria-current="page"' : ''}>${e(label)}</a>`,
      )
      .join('');
    content = `<section id="journal-heading" class="journal-intro"><div><p class="eyebrow">THE JOURNAL / NOTES FROM A VISUAL PRACTICE</p><h1>Look closer.<br><em>Think differently.</em></h1><p>Photography, design and imagined possibilities.<br>Ideas to take back to your own creative practice.</p></div><div class="journal-stamp" aria-hidden="true"><span>Observe.</span><span>Explore.</span><span>Create.</span></div></section><nav class="topic-filters" aria-label="Journal topics">${filters}</nav>${feature && page === 1 ? `<section class="featured-story"><a class="feature-image" href="${href(feature)}" aria-label="Read ${e(feature.title)}">${image(feature, true)}</a><div class="feature-copy"><p class="eyebrow">EDITOR’S PICK / ${e(topic(feature))}</p><h2><a href="${href(feature)}">${e(feature.title)}</a></h2><p>${e(feature.excerpt)}</p><a class="pill" href="${href(feature)}">Read the story <span aria-hidden="true">↗</span></a></div></section>` : ''}<section class="story-collection"><div class="section-heading"><div><p class="eyebrow">PRACTICAL IDEAS / CONSIDERED PERSPECTIVES</p><h2>${e(category ? topics[category] : 'Fresh from the notebook.')}</h2></div><span class="story-count">${total} ${total === 1 ? 'story' : 'stories'}</span></div><div id="blog-content" class="post-grid">${posts.length ? posts.map(card).join('') : '<p class="journal-empty">New stories are on their way. Check back soon.</p>'}</div></section><nav id="blog-pagination" class="pagination" aria-label="Article pages">${page > 1 ? `<a class="pill" href="/blog?${new URLSearchParams({ page: page - 1, ...(category && { category }) })}">Previous</a>` : ''}${total > 12 ? `<span>Page ${page} of ${Math.ceil(total / 12)}</span>` : ''}${page * 12 < total ? `<a class="pill" href="/blog?${new URLSearchParams({ page: page + 1, ...(category && { category }) })}">Next</a>` : ''}</nav>`;
  }
  const structured = post
    ? {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.excerpt,
        author: { '@type': 'Person', name: post.author, url: origin + '/#about' },
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        mainEntityOfPage: canonical,
        articleSection: topic(post),
        ...(assetURL(post.cover) && { image: new URL(assetURL(post.cover), origin).href }),
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'The Journal · ' + siteName,
        url: canonical,
        description,
      };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}">${missing ? '<meta name="robots" content="noindex">' : ''}<link rel="canonical" href="${e(canonical)}"><meta property="og:type" content="${post ? 'article' : 'website'}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}">${post && assetURL(post.cover) ? `<meta property="og:image" content="${e(new URL(assetURL(post.cover), origin).href)}"><meta name="twitter:card" content="summary_large_image">` : ''}<link rel="icon" href="/favicon.svg"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&amp;family=DM+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><link href="/typography.css?v=20261104" rel="stylesheet"><link href="/blog.css?v=20261104-journal" rel="stylesheet"><script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script></head><body><a class="skip-link" href="#journal-main">Skip to content</a><header class="journal-header"><div class="header-inner"><a class="journal-brand" href="/" aria-label="${e(siteName)}, home">${brand}<small>VISUAL DESIGNER + PHOTOGRAPHER</small></a><span class="availability"><i></i>${e(settings.availability || 'Available for select freelance projects')}</span><nav aria-label="Main navigation"><a href="/blog" aria-current="page">Journal</a><a href="/#work">Work</a><a href="/#about">About</a><a href="/#contact">Let’s talk</a></nav></div></header><main id="journal-main" class="journal-wrap">${content}<section class="journal-cta"><p class="eyebrow">FROM READING TO MAKING</p><h2>Have an idea<br><em>worth exploring?</em></h2><a class="pill" href="/#contact">Let’s make something <span aria-hidden="true">↗</span></a></section></main><footer class="journal-footer"><a href="/">${e(siteName)}</a><span>Design / Photography / Imagination</span><a href="/blog">Back to the Journal</a></footer></body></html>`;
}
export const journal = Router();
function siteOrigin(req) {
  const value =
    process.env.APP_ORIGIN ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
      : 'http://localhost:3000');
  return new URL(value).origin;
}
journal.get(['/blog', '/blog/:slug'], async (req, res) => {
  const database = await db();
  const settings = await readSettings(database);
  const origin = siteOrigin(req);
  res.set('Cache-Control', 'no-store');
  if (req.params.slug) {
    const post = await database
      .collection('posts')
      .findOne({ slug: req.params.slug, published: true });
    if (!post)
      return res
        .status(404)
        .type('html')
        .send(journalPage({ settings, origin, missing: true }));
    const posts = await database
      .collection('posts')
      .find({ published: true, category: post.category || 'photography', slug: { $ne: post.slug } })
      .sort({ publishedAt: -1, _id: 1 })
      .limit(3)
      .toArray();
    return res.type('html').send(journalPage({ settings, origin, post, posts }));
  }
  const category = Object.hasOwn(topics, req.query.category) ? req.query.category : '';
  const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
  const filter = {
    published: true,
    ...(category && {
      category: category === 'photography' ? { $in: ['photography', null] } : category,
    }),
  };
  const [posts, total] = await Promise.all([
    database
      .collection('posts')
      .find(filter)
      .sort({ publishedAt: -1, _id: 1 })
      .skip((page - 1) * 12)
      .limit(12)
      .toArray(),
    database.collection('posts').countDocuments(filter),
  ]);
  res.type('html').send(journalPage({ settings, origin, posts, total, page, category }));
});
journal.get('/robots.txt', (req, res) =>
  res
    .type('text/plain')
    .send(
      `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\nSitemap: ${siteOrigin(req)}/sitemap.xml\n`,
    ),
);
journal.get('/sitemap.xml', async (req, res) => {
  const origin = siteOrigin(req);
  const posts = await (
    await db()
  )
    .collection('posts')
    .find({ published: true }, { projection: { slug: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(10000)
    .toArray();
  res
    .type('application/xml')
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/blog', ...posts.map(href)].map((url) => `<url><loc>${e(origin + url)}</loc></url>`).join('')}</urlset>`,
    );
});
