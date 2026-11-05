import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderPortfolioPage, portfolioSEO } from '../server/portfolio-pages.js';
import { contentDefaults } from '../server/content.js';
import { jsonForHTML } from '../shared/seo.js';
const item = {
  id: 'test-image',
  title: 'A cobalt campaign',
  name: 'campaign.jpg',
  src: 'media/journal-ai-direction-v2.jpg',
  width: 1672,
  height: 941,
  ratio: 1672 / 941,
  type: 'image',
  alt: 'Cobalt campaign artwork',
};
const collection = {
  id: 'campaigns',
  title: 'Campaign concepts',
  method: 'AI-assisted',
  frame: 'natural',
  note: 'Original campaign concepts.',
  count: 1,
  preview: [item],
  data: '/api/collections/campaigns',
};
const manifest = {
  sections: [
    {
      id: 'ai-campaigns',
      title: 'AI Campaigns',
      subtitle: 'Creative advertising concepts.',
      collections: ['campaigns'],
      featured: 'campaigns',
    },
  ],
  collections: { campaigns: collection },
  hero: { product: item },
  total: 1,
};
const settings = {
  ...contentDefaults,
  publicSiteUrl: 'https://portfolio.example',
  googleSiteVerification: 'safe_token_123',
};
test('portfolio content, links and SEO are present in the initial HTML, before JavaScript', async () => {
  const html = await renderPortfolioPage({ manifest, settings });
  const dom = new JSDOM(html),
    d = dom.window.document;
  assert(d.querySelector('#home-sliders img'));
  assert.equal(d.querySelector('#category-nav a').getAttribute('href'), '/work/ai-campaigns');
  assert.equal(d.querySelector('link[rel=canonical]').href, 'https://portfolio.example/');
  assert.equal(d.querySelector('meta[name=google-site-verification]').content, 'safe_token_123');
  assert(!d.querySelector('meta[name=keywords]'));
  assert(d.querySelector('#portfolio-bootstrap'));
  const graph = JSON.parse(d.querySelector('#portfolio-structured-data').textContent)['@graph'];
  assert(graph.some((n) => n['@type'] === 'Person' && n.name === 'Rajneesh Vaishnav'));
  assert(graph.some((n) => n['@type'] === 'WebSite'));
  dom.window.close();
});
test('category HTML has unique metadata, real images, safe root asset paths and breadcrumbs', async () => {
  const html = await renderPortfolioPage({
    manifest,
    settings,
    sectionId: 'ai-campaigns',
    items: [item],
  });
  const dom = new JSDOM(html),
    d = dom.window.document;
  assert.equal(d.querySelector('#home-view').hidden, true);
  assert.equal(d.querySelector('#gallery-title').textContent, 'AI Campaigns');
  assert(d.querySelector('#gallery-content img'));
  assert.equal(
    d.querySelector('#gallery-content img').getAttribute('src'),
    '/media/journal-ai-direction-v2.jpg',
  );
  assert.equal(
    d.querySelector('link[rel=canonical]').href,
    'https://portfolio.example/work/ai-campaigns',
  );
  assert.match(d.title, /AI Campaign Design/);
  assert(!d.querySelector('.error-message'));
  assert(
    JSON.parse(d.querySelector('#portfolio-structured-data').textContent)['@graph'].some(
      (n) => n['@type'] === 'BreadcrumbList',
    ),
  );
  dom.window.close();
});
test('unpublished empty collections are noindexed and embedded JSON cannot terminate a script', () => {
  const empty = structuredClone(manifest);
  empty.collections.campaigns.count = 0;
  assert.match(portfolioSEO(empty, settings).pages['ai-campaigns'].robots, /noindex/);
  const source = { title: '</script><script>alert(1)</script>' };
  assert(!jsonForHTML(source).includes('</script>'));
  assert.deepEqual(JSON.parse(jsonForHTML(source)), source);
});
