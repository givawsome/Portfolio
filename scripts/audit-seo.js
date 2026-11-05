import { JSDOM } from 'jsdom';
import { writeFile, mkdir } from 'node:fs/promises';
const base = new URL(process.argv[2] || 'https://portfolio-six-nu-9ix8y8mx1c.vercel.app').origin;
const report = { site: base, checkedAt: new Date().toISOString(), pages: [], errors: [] };
async function check(path) {
  const response = await fetch(new URL(path, base));
  const html = await response.text();
  if (response.status !== 200) throw Error(`${path}: HTTP ${response.status}`);
  const dom = new JSDOM(html),
    d = dom.window.document;
  const title = d.title,
    description = d.querySelector('meta[name=description]')?.content,
    canonical = d.querySelector('link[rel=canonical]')?.href;
  if (!title || !description || !canonical) throw Error(`${path}: missing core metadata`);
  if (!d.querySelector('meta[property="og:image"]'))
    throw Error(`${path}: missing social sharing image`);
  for (const node of d.querySelectorAll('script[type="application/ld+json"]'))
    JSON.parse(node.textContent);
  if (!d.querySelector('script[type="application/ld+json"]'))
    throw Error(`${path}: missing structured data`);
  const result = {
    path,
    title,
    description,
    canonical,
    images: d.querySelectorAll('main img').length,
    robots: d.querySelector('meta[name=robots]')?.content,
  };
  if (path === '/') {
    if (
      !d.querySelector('#home-sliders img') ||
      !d.querySelector('#category-nav a[href^="/work/"]')
    )
      throw Error('Homepage galleries are absent from initial HTML');
  }
  report.pages.push(result);
  dom.window.close();
  return result;
}
try {
  const robots = await (await fetch(base + '/robots.txt')).text();
  if (!robots.includes('Sitemap: ' + base + '/sitemap.xml'))
    throw Error('Robots does not name the current-domain sitemap');
  const sitemapResponse = await fetch(base + '/sitemap.xml');
  if (!sitemapResponse.ok) throw Error('Sitemap unavailable');
  const sitemap = new JSDOM(await sitemapResponse.text(), { contentType: 'application/xml' });
  const paths = [...sitemap.window.document.querySelectorAll('url > loc')].map((n) => {
    const u = new URL(n.textContent);
    if (u.origin !== base) throw Error('Sitemap contains another domain');
    return u.pathname + u.search;
  });
  report.sitemapURLs = paths.length;
  report.sitemapImages = sitemap.window.document.getElementsByTagNameNS(
    'http://www.google.com/schemas/sitemap-image/1.1',
    'loc',
  ).length;
  sitemap.window.close();
  for (let i = 0; i < paths.length; i += 3) await Promise.all(paths.slice(i, i + 3).map(check));
  const titles = report.pages.map((p) => p.title);
  if (new Set(titles).size !== titles.length)
    throw Error('Duplicate page titles found in the sitemap');
  const admin = await fetch(base + '/admin/');
  if (!admin.headers.get('x-robots-tag')?.includes('noindex'))
    throw Error('Admin pages lack noindex protection');
} catch (error) {
  report.errors.push(error.message);
}
await mkdir(new URL('../content/seo/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../content/seo/live-audit.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    site: base,
    pagesChecked: report.pages.length,
    sitemapURLs: report.sitemapURLs,
    sitemapImages: report.sitemapImages,
    errors: report.errors,
  }),
);
if (report.errors.length) process.exitCode = 1;
