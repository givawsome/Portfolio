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
  await page.locator('#image-form [name=tags]').fill('cinematic, portrait');
  await page.locator('#image-form [name=keywords]').fill('studio lighting, editorial');
  const source = manifest.hero.product.src;
  await page.locator('#image-form [name=src]').fill(source);
  await page.locator('#image-form [name=published]').check();
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  await page.locator('#image-dialog').waitFor({ state: 'hidden' });
  await page.locator('#media-search').fill('studio lighting');
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
  await navigate('blog');
  await page.getByRole('button', { name: 'New article', exact: true }).click();
  await page.locator('#management-view [name=title]').fill('A photography story');
  await page.locator('#management-view [name=slug]').fill('a-photography-story');
  await page.locator('#management-view [name=category]').selectOption('graphic-design');
  await page.locator('#management-view [name=coverCredit]').fill('Editorial test cover');
  await page
    .locator('#management-view [name=body]')
    .fill('# Light and form\n\nA practical photography story.');
  await page.locator('#management-view [type=submit]').click();
  await page.getByRole('button', { name: 'New article', exact: true }).waitFor();
  assert.equal((await context.request.get(origin + '/api/blog/a-photography-story')).status(), 404);
  await page.locator('#management-view').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#management-view [name=published]').check();
  const publishedResponse = page.waitForResponse(
    (r) => r.url().includes('/api/admin/posts/') && r.request().method() === 'PUT',
  );
  await page.locator('#management-view [type=submit]').click();
  const savedPost = await publishedResponse;
  assert.equal(savedPost.status(), 200);
  const savedArticle = await savedPost.json();
  assert.equal(savedArticle.slug, 'a-photography-story');
  assert.equal(savedArticle.category, 'graphic-design');
  assert.equal(savedArticle.coverCredit, 'Editorial test cover');
  await page.getByRole('button', { name: 'New article', exact: true }).waitFor();
  const publishedCheck = await context.request.get(origin + '/api/blog/a-photography-story');
  assert.equal(publishedCheck.status(), 200, await publishedCheck.text());
  await publicPage.goto(origin + '/blog/a-photography-story');
  await publicPage.waitForTimeout(1000);
  console.log('Blog rendered:', await publicPage.locator('main').innerText(), 'Errors:', failures);
  await publicPage.getByRole('heading', { name: 'A photography story', exact: true }).waitFor();
  assert.equal(
    await publicPage.locator('.article-body > p').first().textContent(),
    'A practical photography story.',
  );
  page.once('dialog', (dialog) => dialog.accept());
  await page
    .locator('#management-view')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page.locator('#management-view .empty').waitFor();
  assert.equal((await context.request.get(origin + '/api/blog/a-photography-story')).status(), 404);
  const journalSource = JSON.parse(
    await readFile(new URL('../content/journal/posts.json', import.meta.url), 'utf8'),
  );
  await database.collection('posts').insertMany(
    journalSource.map((post) => ({
      ...post,
      createdAt: new Date(),
      updatedAt: new Date(),
      publishedAt: new Date(),
    })),
  );
  await publicPage.goto(origin + '/blog');
  assert.equal(await publicPage.locator('.post-card').count(), 9);
  await publicPage.evaluate(() => document.fonts.ready);
  await publicPage.locator('.post-card img').evaluateAll(async (images) => {
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => image.decode()));
  });
  await publicPage.screenshot({
    path: '/tmp/portfolio-review/journal-desktop.png',
    fullPage: true,
  });
  for (const category of ['photography', 'graphic-design', 'ai-design']) {
    await publicPage.goto(origin + '/blog?category=' + category);
    assert.equal(await publicPage.locator('.post-card').count(), 3);
    const response = await context.request.get(origin + '/api/blog?category=' + category);
    assert.equal((await response.json()).total, 3);
  }
  for (const post of journalSource) {
    const response = await context.request.get(origin + '/blog/' + post.slug);
    assert.equal(response.status(), 200);
    assert((await response.text()).includes(post.title));
    assert.equal((await context.request.get(origin + '/' + post.cover)).status(), 200);
  }
  assert.equal((await context.request.get(origin + '/blog/not-a-real-story')).status(), 404);
  assert(
    (await (await context.request.get(origin + '/sitemap.xml')).text()).includes(
      journalSource[0].slug,
    ),
  );
  await publicPage.goto(origin + '/blog/' + journalSource[0].slug);
  await publicPage.screenshot({
    path: '/tmp/portfolio-review/journal-article.png',
    fullPage: true,
  });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  assert(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await publicPage.screenshot({
    path: '/tmp/portfolio-review/journal-article-mobile.png',
    fullPage: true,
  });
  await publicPage.goto(origin + '/blog');
  assert(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await publicPage.locator('.post-card img').evaluateAll(async (images) => {
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => image.decode()));
  });
  await publicPage.screenshot({ path: '/tmp/portfolio-review/journal-mobile.png', fullPage: true });
  await publicPage.setViewportSize({ width: 1440, height: 1000 });
  await navigate('characters');
  await page.locator('#management-view [name=title]').fill('Aster');
  await page.getByRole('button', { name: 'Create character folder' }).click();
  await page.getByRole('heading', { name: 'Aster', exact: true }).waitFor();
  const current = await (await context.request.get(origin + '/api/admin/manifest')).json();
  const folder = Object.values(current.collections).find((c) => c.title === 'Aster');
  assert(folder?.character);
  const imageData = {
    id: 'aster-cover',
    collectionId: folder.id,
    title: 'Aster portrait',
    name: 'aster.jpg',
    src: manifest.hero.painting.src,
    width: 1000,
    height: 1500,
    published: true,
  };
  assert.equal(
    (
      await context.request.put(origin + '/api/admin/media/aster-cover', {
        headers: { Origin: origin },
        data: imageData,
      })
    ).status(),
    200,
  );
  assert.equal(
    (
      await context.request.put(origin + '/api/admin/collections/' + folder.id + '/cover', {
        headers: { Origin: origin },
        data: { coverId: 'not-in-folder' },
      })
    ).status(),
    400,
  );
  assert.equal(
    (
      await context.request.put(origin + '/api/admin/collections/' + folder.id + '/cover', {
        headers: { Origin: origin },
        data: { coverId: 'aster-cover' },
      })
    ).status(),
    200,
  );
  const publicManifest = await (await context.request.get(origin + '/api/portfolio')).json();
  assert.equal(publicManifest.collections[folder.id].cover.id, 'aster-cover');
  const section = current.sections.find((s) => s.collections.includes(folder.id));
  await publicPage.goto(origin + '/?work=' + section.id);
  const characterCard = publicPage
    .locator('.character-folder-grid .character-folder .rail-media')
    .first();
  const characterSize = await characterCard.boundingBox();
  assert(characterSize.width > characterSize.height, 'Character folder card should be landscape');
  await publicPage.screenshot({ path: '/tmp/portfolio-review/character-landscape.png' });
  await publicPage.locator('.character-folder-grid').getByRole('button', { name: /Aster/ }).click();
  await publicPage.locator('.gallery-grid').waitFor();
  assert(publicPage.url().includes(folder.id));
  await navigate('files');
  const file = await context.request.post(origin + '/api/admin/files', {
    headers: { Origin: origin },
    data: {
      title: 'Review PDF',
      url: 'https://example.com/review.pdf',
      mime: 'application/pdf',
      size: 100,
    },
  });
  assert.equal(file.status(), 201);
  const savedFile = await file.json();
  assert.equal(
    (
      await context.request.delete(origin + '/api/admin/files/' + savedFile.id, {
        headers: { Origin: origin },
      })
    ).status(),
    200,
  );
  await publicPage.goto(origin + '/');
  await publicPage.locator('.image-rail').first().waitFor();
  const logoSource = manifest.collections[Object.keys(manifest.collections)[0]].preview[0].src;
  await context.request.patch(origin + '/api/admin/settings', {
    headers: { Origin: origin },
    data: {
      headerLogo: logoSource,
      footerLogo: '',
      logoAlt: 'Review logo',
      typographyStyle: 'editorial',
    },
  });
  await publicPage.reload();
  await publicPage.locator('.portfolio-logo').first().waitFor();
  assert.equal(await publicPage.locator('.portfolio-logo').count(), 2);
  assert.equal(
    await publicPage.locator('.portfolio-logo').first().getAttribute('alt'),
    'Review logo',
  );
  assert.equal(await publicPage.locator('html').getAttribute('data-typography'), 'editorial');
  assert.equal(
    await publicPage
      .locator('.portfolio-logo')
      .first()
      .evaluate((el) => getComputedStyle(el).objectFit),
    'contain',
  );
  await context.request.patch(origin + '/api/admin/settings', {
    headers: { Origin: origin },
    data: { headerLogo: '', footerLogo: '', typographyStyle: 'current' },
  });
  await publicPage.reload();
  const rail = publicPage.locator('.image-rail').first();
  await rail.scrollIntoViewIfNeeded();
  await publicPage.mouse.move(0, 0);
  await publicPage.waitForTimeout(800);
  const moved = await rail.evaluate((el) => el.scrollLeft);
  assert(moved > 0, 'Rail should automatically move');
  await rail.hover();
  const pausedAt = await rail.evaluate((el) => el.scrollLeft);
  await publicPage.waitForTimeout(400);
  assert.equal(
    await rail.evaluate((el) => el.scrollLeft),
    pausedAt,
    'Hover should pause scrolling',
  );
  await publicPage.screenshot({
    path: '/tmp/portfolio-review/updated-desktop.png',
    fullPage: true,
  });
  await context.request.patch(origin + '/api/admin/settings', {
    headers: { Origin: origin },
    data: { heroNote: 'Good ideas\nlive here.' },
  });
  await publicPage.goto(origin + '/');
  await publicPage.evaluate(() => document.fonts.ready);
  await publicPage.waitForTimeout(500);
  assert.match(
    await publicPage.locator('.studio-outline').evaluate((el) => getComputedStyle(el).fontFamily),
    /Cormorant Garamond/,
  );
  assert.equal(
    await publicPage
      .locator('.studio-character img')
      .evaluate((el) => getComputedStyle(el).objectFit),
    'contain',
  );
  const characterFrame = await publicPage.locator('.studio-character').boundingBox();
  assert(characterFrame.width > characterFrame.height, 'Hero character frame must be landscape');
  await publicPage.screenshot({ path: '/tmp/portfolio-review/hero-desktop-new.png' });
  await publicPage.setViewportSize({ width: 390, height: 844 });
  const heroTools = publicPage.locator('[data-content=heroDisciplines]');
  assert(await heroTools.isVisible(), 'Creative tools must be visible on mobile');
  assert.match(await heroTools.innerText(), /PHOTOSHOP.*FIGMA.*CANVA/);
  await publicPage.screenshot({ path: '/tmp/portfolio-review/hero-mobile-new.png' });
  assert(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const emptyTemplate = JSON.parse(
    await readFile(new URL('../shared/creative-categories.json', import.meta.url), 'utf8'),
  );
  await database.collection('media').deleteMany({});
  await database
    .collection('content')
    .updateOne({ _id: 'manifest' }, { $set: { value: emptyTemplate } });
  await publicPage.goto(origin + '/');
  await publicPage.locator('.empty-message').first().waitFor();
  assert.equal(
    await publicPage.locator('#home-sliders .empty-message').count(),
    emptyTemplate.sections.length,
  );
  await publicPage.getByRole('link', { name: 'SNS / Photoshop', exact: true }).first().click();
  await publicPage.locator('#gallery-title').filter({ hasText: 'SNS / Photoshop' }).waitFor();
  assert(await publicPage.locator('#hero-painting').isHidden());
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
