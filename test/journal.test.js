import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { journalPage, renderBody } from '../server/journal.js';
import { postSchema } from '../server/blog.js';
const source = JSON.parse(
  await readFile(new URL('../content/journal/posts.json', import.meta.url), 'utf8'),
);
test('nine original journal guides have three topics and existing distinct landscape covers', async () => {
  assert.equal(source.length, 9);
  assert.equal(new Set(source.map((p) => p.slug)).size, 9);
  assert.equal(new Set(source.map((p) => p.cover)).size, 9);
  for (const category of ['photography', 'graphic-design', 'ai-design'])
    assert.equal(source.filter((p) => p.category === category).length, 3);
  for (const { id, ...post } of source) {
    assert(postSchema.safeParse(post).success);
    assert(post.body.split(/\s+/).length >= 400);
    await access(new URL('../public/' + post.cover, import.meta.url));
  }
  assert(!postSchema.safeParse({ ...source[0], id: undefined, category: 'unrecognised' }).success);
});
test('article HTML contains crawlable text and escaped metadata without client JavaScript', () => {
  const post = {
    ...source[0],
    title: 'A <script>bad()</script> headline',
    excerpt: 'An "example" & detail',
    publishedAt: new Date('2026-11-04'),
    updatedAt: new Date('2026-11-04'),
  };
  const dom = new JSDOM(
    journalPage({ post, origin: 'https://portfolio.example', posts: source.slice(1, 3) }),
  );
  const d = dom.window.document;
  assert.equal(d.querySelector('h1').textContent, post.title);
  assert(d.querySelector('.article-body').textContent.includes('Mood one'));
  assert.equal(d.querySelector('meta[name=description]').content, post.excerpt);
  assert.equal(
    d.querySelector('link[rel=canonical]').href,
    'https://portfolio.example/blog/' + post.slug,
  );
  assert.equal(
    JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent).headline,
    post.title,
  );
  assert.equal(d.querySelectorAll('script:not([type="application/ld+json"])').length, 0);
  assert.equal(d.querySelectorAll('script').length, 1);
  dom.window.close();
  assert.match(renderBody('# A heading\n\n<img src=x onerror=alert(1)>'), /&lt;img/);
});
test('journal filters and pagination retain the topic, and unpublished pages have a noindex template', () => {
  const dom = new JSDOM(
    journalPage({
      posts: source.slice(6),
      total: 25,
      page: 2,
      category: 'ai-design',
      origin: 'https://portfolio.example',
    }),
  );
  const d = dom.window.document;
  assert.equal(d.querySelector('.topic-filters [aria-current=page]').textContent, 'AI design');
  assert(d.querySelector('#blog-pagination a').href.includes('category=ai-design'));
  assert.equal(d.querySelectorAll('.post-card').length, 3);
  dom.window.close();
  const missing = new JSDOM(journalPage({ missing: true, origin: 'https://portfolio.example' }));
  assert.match(missing.window.document.querySelector('meta[name=robots]').content, /noindex/);
  missing.window.close();
});

test('Journal header banner and complete footer use managed branding and contact settings safely', () => {
  const dom = new JSDOM(
    journalPage({
      origin: 'https://portfolio.example',
      settings: {
        brandName: 'Rajneesh',
        headerLogo: 'media/logo.png',
        footerLogo: 'media/footer.png',
        journalHeaderBanner: 'media/header.png',
        email: 'designer@example.com',
        phone: '+918005549405',
        instagram: 'https://instagram.com/portfolio',
        linkedin: 'https://linkedin.com/in/designer',
        facebook: 'javascript:alert(1)',
        linkedinIcon: 'media/linkedin.png',
      },
    }),
  );
  const d = dom.window.document;
  assert.equal(d.querySelector('.journal-header-art img').getAttribute('src'), '/media/header.png');
  assert.equal(
    d.querySelector('.journal-footer .footer-logo').getAttribute('src'),
    '/media/footer.png',
  );
  assert.equal(
    d.querySelector('.footer-email').getAttribute('href'),
    'mailto:designer@example.com',
  );
  assert(d.querySelector('.footer-socials a[href="https://linkedin.com/in/designer"] img'));
  assert.equal(d.querySelectorAll('.footer-socials a').length, 2);
  assert.equal(d.querySelectorAll('.journal-footer a[href^="javascript:"]').length, 0);
  assert.equal(d.querySelectorAll('.footer-explore nav a').length, 4);
  dom.window.close();
});
