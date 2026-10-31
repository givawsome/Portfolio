// Isolated end-to-end review. Never writes to the configured portfolio database.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { chromium } from '@playwright/test';
if (!process.env.MONGODB_URI) throw Error('Set MONGODB_URI to a running local MongoDB server.');
const uri = new URL(process.env.MONGODB_URI);
if (!['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname))
  throw Error('This check is restricted to local MongoDB.');
const testDatabase = 'portfolio_review_' + Date.now();
process.env.MONGODB_DB = testDatabase;
process.env.AUTH_SECRET = randomBytes(48).toString('hex');
process.env.NODE_ENV = 'development';
const client = new MongoClient(process.env.MONGODB_URI);
let browser, server;
try {
  await client.connect();
  const database = client.db(testDatabase);
  const manifest = JSON.parse(
    await readFile(new URL('../seed/manifest.json', import.meta.url), 'utf8'),
  );
  await database.collection('content').insertOne({ _id: 'manifest', value: manifest });
  for (const collection of Object.values(manifest.collections)) {
    const items = JSON.parse(
      await readFile(
        new URL('../seed/collections/' + collection.id + '.json', import.meta.url),
        'utf8',
      ),
    );
    if (items.length)
      await database.collection('media').insertMany(
        items.map((item, order) => ({
          ...item,
          collectionId: collection.id,
          order,
          published: true,
        })),
      );
  }
  const { hashPassword } = await import('../server/security.js');
  const password = randomBytes(16).toString('hex');
  await database
    .collection('admins')
    .insertOne({ email: 'review-admin', version: 1, passwordHash: hashPassword(password) });
  const { default: app } = await import('../server/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = origin;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await page.goto(origin + '/admin/');
  await page.locator('[name=email]').fill('review-admin');
  await page.locator('[name=password]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
  async function navigate(view) {
    await page.locator('.sidebar a[href="#' + view + '"]').click();
    await page.waitForFunction(
      (view) =>
        location.hash === '#' + view &&
        document.querySelector('.sidebar [aria-current=page]')?.hash === '#' + view,
      view,
    );
    console.log('Checking screen:', view);
  }
  async function save() {
    const request = page.waitForResponse(
      (r) => r.url().endsWith('/api/admin/settings') && r.request().method() === 'PATCH',
    );
    await page.locator('#management-view [type=submit]').click();
    const response = await request;
    assert.equal(response.status(), 200, await response.text());
    await page.waitForFunction(
      () => document.querySelector('#management-view [type=submit]')?.disabled === false,
    );
  }
  await navigate('profile');
  await page.locator('[name=about]').fill('A saved biography from the review.');
  await page.locator('[name=aboutCurrent]').fill('A complete current practice.');
  await page.locator('[name=aboutImageAlt]').fill('Review portrait');
  await page.getByRole('button', { name: 'Choose from library' }).click();
  await page.locator('.asset-picker .picker-grid button').first().click();
  await save();
  const publicPage = await context.newPage();
  publicPage.on('pageerror', (e) => failures.push(e.message));
  await publicPage.goto(origin + '/');
  await publicPage.waitForFunction(
    () => window.portfolioSettings?.about === 'A saved biography from the review.',
  );
  assert.equal(
    await publicPage.locator('[data-content=aboutCurrent]').textContent(),
    'A complete current practice.',
  );
  assert(await publicPage.locator('#about-image').isVisible());
  assert(
    await publicPage
      .locator('#about-image')
      .evaluate((img) => img.complete && img.naturalWidth > 0),
  );
  await navigate('contact');
  await page.locator('#management-view [name=email]').fill('review@example.com');
  await save();
  await publicPage.reload();
  await publicPage.waitForFunction(() => window.portfolioSettings?.email === 'review@example.com');
  assert.equal(
    await publicPage.locator('.contact-email').getAttribute('href'),
    'mailto:review@example.com',
  );
  await navigate('services');
  await page
    .locator('[data-list=services] .repeat-row')
    .first()
    .locator('[data-column=title]')
    .fill('Reviewed service');
  await save();
  await publicPage.reload();
  await publicPage.waitForFunction(() =>
    document.querySelector('.service-list summary')?.textContent.includes('Reviewed service'),
  );
  assert.equal(
    await publicPage.locator('[name=service] option').first().textContent(),
    'Reviewed service',
  );
  await navigate('welcome');
  await page.locator('[name=welcomeEnabled]').uncheck();
  await save();
  await publicPage.reload();
  await publicPage.waitForFunction(() => window.portfolioSettings?.welcomeEnabled === false);
  assert(await publicPage.locator('#welcome-popup').isHidden());
  await navigate('homepage');
  await page.locator('[name=heroNote]').fill('Ideas\nmade visible.');
  await save();
  await publicPage.reload();
  await publicPage.waitForFunction(
    () => document.querySelector('.studio-note').textContent === 'Ideas\nmade visible.',
  );
  for (const view of [
    'general',
    'process',
    'categories',
    'collections',
    'hero',
    'inquiries',
    'media',
  ])
    await navigate(view);
  // Full media create/edit/delete through the browser.
  await page.getByRole('button', { name: 'Add image', exact: true }).click();
  await page.locator('#image-form [name=title]').fill('Browser test image');
  await page.locator('#image-form [name=name]').fill('review.avif');
  const source = manifest.hero.product.src;
  await page.locator('#image-form [name=src]').fill(source);
  await page.locator('#image-form [name=published]').check();
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  await page.locator('#image-dialog').waitFor({ state: 'hidden' });
  await page.locator('#media-search').fill('Browser test image');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .locator('#grid article')
    .filter({ hasText: 'Browser test image' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await page.locator('#image-form [name=title]').fill('Updated browser image');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  await page.locator('#image-dialog').waitFor({ state: 'hidden' });
  await page.locator('#media-search').fill('Updated browser image');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page
    .locator('#grid article')
    .filter({ hasText: 'Updated browser image' })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove image', exact: true }).click();
  await page.locator('#image-dialog').waitFor({ state: 'hidden' });
  await navigate('profile');
  await mkdir('/tmp/portfolio-review', { recursive: true });
  await page.screenshot({ path: '/tmp/portfolio-review/admin-desktop.png', fullPage: true });
  await publicPage.screenshot({ path: '/tmp/portfolio-review/public-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/portfolio-review/admin-mobile.png', fullPage: true });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Mobile admin overflows horizontally',
  );
  assert.deepEqual(failures, [], 'Browser console errors');
  console.log(
    'PASS: real-browser login, all sidebar screens, About image/biography save → public render, contact, services, welcome, homepage copy, image CRUD, mobile overflow and console checks.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await client.db(testDatabase).dropDatabase();
  await client.close();
  console.log('Removed isolated review database.');
}
process.exit(0);
