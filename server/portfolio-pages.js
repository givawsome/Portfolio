import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { db } from './db.js';
import { readSettings } from './content.js';
import { readPortfolio, publicItem } from './portfolio-data.js';
import {
  categorySEO,
  seoDefaults,
  sectionSEO,
  galleryPath,
  siteOrigin,
  jsonForHTML,
  publicAsset,
} from '../shared/seo.js';

const files = Promise.all(
  ['index.html', 'content.js', 'app.js'].map((name) =>
    readFile(new URL('../public/' + name, import.meta.url), 'utf8'),
  ),
);
const personGraph = (settings, origin) => ({
  '@type': 'Person',
  '@id': origin + '/#person',
  name: settings.seoName || 'Rajneesh Vaishnav',
  url: origin + '/',
  jobTitle: 'Visual Designer, Photographer and AI Creative',
  description:
    'Freelance visual designer and photographer based in Jaipur, working with clients across India and internationally.',
  homeLocation: { '@type': 'Place', name: 'Jaipur, Rajasthan, India' },
  knowsAbout: [
    'Graphic design',
    'Brand identity',
    'Product photography',
    'Image retouching',
    'Figma UI design',
    'Social media design',
    'AI art direction',
  ],
  sameAs: ['instagram', 'facebook', 'linkedin']
    .map((key) => settings[key])
    .filter((url) => /^https:\/\//.test(url || '')),
  ...(publicAsset(settings.aboutImage) && {
    image: new URL(publicAsset(settings.aboutImage), origin).href,
  }),
});
export function portfolioSEO(manifest, settings) {
  const origin = siteOrigin(settings),
    name = settings.seoName || 'Rajneesh Vaishnav';
  const common = [
    personGraph(settings, origin),
    {
      '@type': 'WebSite',
      '@id': origin + '/#website',
      url: origin + '/',
      name: name + ' — Design, Photography & AI',
      inLanguage: 'en',
      publisher: { '@id': origin + '/#person' },
    },
  ];
  const image =
    publicAsset(settings.seoImage || settings.journalHeaderBanner) ||
    '/media/journal-header-campaign-v2.jpg';
  const page = (meta, path, section, collection) => {
    const url = origin + path;
    const preview = collection?.cover?.src || collection?.preview?.[0]?.src;
    const socialImage = new URL(publicAsset(preview) || image, origin).href;
    const graph = [
      ...common,
      {
        '@type': section ? 'CollectionPage' : 'WebPage',
        '@id': url + '#webpage',
        url,
        name: meta.title,
        description: meta.description,
        isPartOf: { '@id': origin + '/#website' },
        about: { '@id': origin + '/#person' },
        inLanguage: 'en',
        primaryImageOfPage: { '@type': 'ImageObject', url: socialImage },
        ...(section && { breadcrumb: { '@id': url + '#breadcrumbs' } }),
      },
    ];
    if (section)
      graph.push({
        '@type': 'BreadcrumbList',
        '@id': url + '#breadcrumbs',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Portfolio', item: origin + '/' },
          {
            '@type': 'ListItem',
            position: 2,
            name: section.title,
            item: origin + galleryPath(section.id),
          },
          ...(collection?.character
            ? [{ '@type': 'ListItem', position: 3, name: collection.title, item: url }]
            : []),
        ],
      });
    return {
      ...meta,
      url,
      image: socialImage,
      imageAlt: settings.seoImageAlt || 'Design, photography and AI art direction by ' + name,
      robots:
        section &&
        (collection?.character
          ? collection.count === 0
          : section.collections.every((id) => !manifest.collections[id]?.count))
          ? 'noindex,follow'
          : 'index,follow,max-image-preview:large',
      schema: { '@context': 'https://schema.org', '@graph': graph },
    };
  };
  const result = {
    home: page(
      {
        title: settings.pageTitle || seoDefaults.title,
        description: settings.metaDescription || seoDefaults.description,
      },
      '/',
    ),
    pages: {},
  };
  for (const section of manifest.sections) {
    result.pages[section.id] = page(
      sectionSEO(section, null, settings),
      galleryPath(section.id),
      section,
      manifest.collections[section.featured],
    );
    for (const id of section.collections) {
      const collection = manifest.collections[id];
      if (collection)
        result.pages[section.id + '/' + id] = page(
          sectionSEO(section, collection, settings),
          galleryPath(section.id, id),
          section,
          collection,
        );
    }
  }
  return result;
}
function installMetadata(document, meta, settings) {
  document.title = meta.title;
  const set = (attribute, key, content) => {
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attribute, key);
      document.head.append(node);
    }
    node.content = content;
  };
  set('name', 'description', meta.description);
  set('name', 'robots', meta.robots);
  set('name', 'author', settings.seoName || 'Rajneesh Vaishnav');
  for (const [key, value] of Object.entries({
    'og:title': meta.title,
    'og:description': meta.description,
    'og:type': 'website',
    'og:url': meta.url,
    'og:image': meta.image,
    'og:image:alt': meta.imageAlt,
    'og:site_name': 'Rajneesh Vaishnav',
    'og:locale': 'en_IN',
  }))
    set('property', key, value);
  for (const [key, value] of Object.entries({
    'twitter:card': 'summary_large_image',
    'twitter:title': meta.title,
    'twitter:description': meta.description,
    'twitter:image': meta.image,
    'twitter:image:alt': meta.imageAlt,
  }))
    set('name', key, value);
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = meta.url;
  document.head.append(canonical);
  for (const [key, value] of [
    ['google-site-verification', settings.googleSiteVerification],
    ['msvalidate.01', settings.bingSiteVerification],
  ])
    if (value) set('name', key, value);
  const structured = document.createElement('script');
  structured.type = 'application/ld+json';
  structured.id = 'portfolio-structured-data';
  structured.textContent = jsonForHTML(meta.schema);
  document.head.append(structured);
}
export async function renderPortfolioPage({
  manifest,
  settings,
  sectionId,
  collectionId,
  items = [],
}) {
  const [template, contentSource, appSource] = await files;
  const origin = siteOrigin(settings),
    route = sectionId ? galleryPath(sectionId, collectionId) : '/';
  const dom = new JSDOM(template, { url: origin + route, runScripts: 'outside-only' });
  const { window } = dom,
    document = window.document;
  try {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    window.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    window.requestAnimationFrame = () => 0;
    window.scrollTo = () => {};
    window.fetch = async (url) => ({
      ok: true,
      json: async () =>
        structuredClone(
          String(url).includes('/api/settings')
            ? settings
            : String(url).includes('/api/portfolio')
              ? manifest
              : items,
        ),
    });
    for (const node of document.querySelectorAll('script[src],link[href]')) {
      const attribute = node.tagName === 'SCRIPT' ? 'src' : 'href',
        value = node.getAttribute(attribute);
      if (value && !value.startsWith('/') && !/^https?:/.test(value))
        node.setAttribute(attribute, '/' + value);
    }
    for (const node of document.querySelectorAll('a[href^="./"]'))
      node.setAttribute('href', '/' + node.getAttribute('href').slice(2));
    window.eval(contentSource);
    await window.portfolioContentReady;
    window.eval(appSource);
    await window.portfolioReady;
    const seo = portfolioSEO(manifest, settings),
      meta = sectionId ? seo.pages[sectionId + (collectionId ? '/' + collectionId : '')] : seo.home;
    installMetadata(document, meta, settings);
    for (const button of document.querySelectorAll('button.character-folder')) {
      const name = button.querySelector('.image-caption > span')?.textContent;
      const collection = Object.values(manifest.collections).find((c) => c.title === name);
      const section =
        collection && manifest.sections.find((s) => s.collections.includes(collection.id));
      if (!section) continue;
      const link = document.createElement('a');
      link.className = button.className;
      link.href = galleryPath(section.id, collection.id);
      link.innerHTML = button.innerHTML;
      button.replaceWith(link);
    }
    for (const button of document.querySelectorAll('#gallery-content button.gallery-item')) {
      const src = button.querySelector('img')?.getAttribute('src');
      if (!src) continue;
      const link = document.createElement('a');
      link.className = button.className;
      link.href = src;
      link.innerHTML = button.innerHTML;
      button.replaceWith(link);
    }
    if (document.querySelector('#home-sliders .error-message'))
      throw Error('Portfolio rendering failed');
    document
      .querySelector('.studio-outline')
      .setAttribute(
        'aria-label',
        'Rajneesh Vaishnav — freelance designer, photographer and AI creative',
      );
    if (sectionId) {
      const section = manifest.sections.find((s) => s.id === sectionId);
      const total = collectionId
        ? manifest.collections[collectionId]?.count
        : manifest.collections[section.featured]?.count;
      if (items.length && total > items.length)
        document.querySelector('#gallery-count').textContent =
          `Showing ${items.length} of ${total} images. Enable JavaScript to browse the complete collection.`;
    }
    for (const [id, value] of [
      ['portfolio-bootstrap', manifest],
      ['portfolio-settings', settings],
      ['portfolio-seo', seo],
    ]) {
      const node = document.createElement('script');
      node.type = 'application/json';
      node.id = id;
      node.textContent = jsonForHTML(value);
      document.body.append(node);
    }
    document.body.dataset.serverRendered = 'true';
    return dom.serialize();
  } finally {
    window.close();
  }
}
export const portfolioPages = Router();
portfolioPages.get('/index.html', (req, res) => res.redirect(301, '/'));
portfolioPages.get(['/', '/work/:section', '/work/:section/:collection'], async (req, res) => {
  let manifest, settings, database;
  if (process.env.MONGODB_URI) {
    database = await db();
    [manifest, settings] = await Promise.all([readPortfolio(database), readSettings(database)]);
  } else if (process.env.NODE_ENV !== 'production') {
    manifest = JSON.parse(
      await readFile(new URL('../seed/manifest.json', import.meta.url), 'utf8'),
    );
    settings = await readSettings(null);
  } else
    return res.status(503).send('Portfolio temporarily unavailable. Please try again shortly.');
  const sectionId = req.params.section || req.query.work,
    collectionId = req.params.collection || req.query.collection;
  const section = sectionId && manifest.sections.find((s) => s.id === sectionId);
  if (
    (sectionId && !section) ||
    (collectionId && (!section || !section.collections.includes(collectionId)))
  )
    return res
      .status(404)
      .set('X-Robots-Tag', 'noindex')
      .type('html')
      .send(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Collection not found | Rajneesh Vaishnav</title><h1>Collection not found</h1><a href="/">Return to the portfolio</a></html>',
      );
  if (!req.params.section && sectionId)
    return res.redirect(301, galleryPath(sectionId, collectionId));
  let items = [];
  if (section) {
    const selected = manifest.collections[collectionId || section.featured];
    if (database)
      items = (
        await database
          .collection('media')
          .find({ collectionId: selected.id, published: true })
          .sort({ order: 1, id: 1 })
          .limit(48)
          .toArray()
      ).map(publicItem);
    else
      items = JSON.parse(
        await readFile(
          new URL('../seed/collections/' + selected.id + '.json', import.meta.url),
          'utf8',
        ),
      ).slice(0, 48);
  }
  res
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(await renderPortfolioPage({ manifest, settings, sectionId, collectionId, items }));
});
