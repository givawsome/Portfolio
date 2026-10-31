import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { JSDOM } from 'jsdom';
import { contentDefaults, config } from '../server/content.js';
import { settings } from '../server/schemas.js';
test('every content default validates and unknown/unsafe fields are rejected', () => {
  assert(settings.safeParse(contentDefaults).success);
  assert(!settings.safeParse({ aboutImage: 'javascript:alert(1)' }).success);
  assert(!settings.safeParse({ linkedin: 'javascript:alert(1)' }).success);
  assert(!settings.safeParse({ unknownSetting: 'silently discarded' }).success);
  assert(!settings.safeParse({ welcomeDelay: -1 }).success);
  assert(settings.safeParse({ aboutImage: '', aboutSections: [], instagram: '' }).success);
});
test('public content renders complete About, lists, images and clearing values safely', async () => {
  const dom = new JSDOM(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), {
    url: 'http://localhost:3000/',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  w.fetch = async () => ({ ok: true, json: async () => structuredClone(contentDefaults) });
  try {
    runInContext(
      await readFile(new URL('../public/content.js', import.meta.url), 'utf8'),
      dom.getInternalVMContext(),
    );
    await w.portfolioContentReady;
    for (const spec of config.fields.filter((x) => x.selector)) {
      assert(
        w.document.querySelector(`[data-content="${spec.key}"]`),
        spec.key + ' has a renderer',
      );
    }
    const changed = {
      ...contentDefaults,
      about: 'Updated biography',
      aboutCurrent: 'Current work',
      intro: 'New intro',
      aboutImage: 'media/example.avif',
      aboutImageAlt: 'New portrait',
      aboutSections: [{ title: 'Experience', body: 'First paragraph\n\nSecond paragraph' }],
      services: [{ title: 'New service', body: 'Service details' }],
      processSteps: [],
      instagram: '',
      heroNote: '<script>unsafe</script>',
    };
    w.applyPortfolioContent(changed);
    assert.equal(w.document.querySelector('[data-content=about]').textContent, 'Updated biography');
    assert.equal(w.document.querySelector('#about-image').hidden, false);
    assert.equal(w.document.querySelector('#about-image').alt, 'New portrait');
    assert.equal(w.document.querySelectorAll('.about-expanded p').length, 2);
    assert.equal(w.document.querySelectorAll('.service-list details').length, 1);
    assert.equal(w.document.querySelector('[name=service]').options[0].text, 'New service');
    assert.equal(w.document.querySelectorAll('.process-grid article').length, 0);
    assert(w.document.querySelector('[data-contact=instagram]').hidden);
    assert.equal(w.document.querySelector('.studio-note script'), null);
    w.applyPortfolioContent({ ...changed, aboutImage: '', aboutSections: [] });
    assert(w.document.querySelector('#about-image').hidden);
    assert.equal(w.document.querySelector('.personal-art').hidden, false);
    assert(w.document.querySelector('.about-more').hidden);
  } finally {
    w.close();
  }
});
