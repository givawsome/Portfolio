import test from 'node:test';
import { runInContext } from 'node:vm';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import config from '../shared/content-config.json' with { type: 'json' };
import { contentDefaults } from '../server/content.js';

test('admin sidebar destinations and form workflows render independently', async () => {
  const html = await readFile(new URL('../admin/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:3000/admin/', runScripts: 'outside-only' });
  const w = dom.window;
  const manifest = {
    sections: [
      {
        id: 'products',
        title: 'Products',
        subtitle: 'Product work',
        collections: ['products'],
        featured: 'products',
      },
    ],
    collections: {
      products: {
        id: 'products',
        title: 'Products',
        folder: '',
        frame: 'square',
        method: 'Photography',
        note: '',
      },
    },
    hero: {},
  };
  w.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.includes('/health')
        ? { version: 'content-admin-v2' }
        : url.includes('/content-config')
          ? config
          : url.includes('/settings')
            ? contentDefaults
            : url.includes('/manifest')
              ? structuredClone(manifest)
              : url.includes('/media?')
                ? { items: [], total: 0 }
                : url.includes('/stats')
                  ? { published: 3, drafts: 1, inquiries: 0 }
                  : url.includes('/inquiries')
                    ? []
                    : {},
  });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  for (const file of ['admin.js', 'content-editor.js', 'management.js'])
    runInContext(
      await readFile(new URL('../admin/' + file, import.meta.url), 'utf8'),
      dom.getInternalVMContext(),
    );
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(w.document.querySelector('#workspace').hidden, false);
    const routes = [
      'dashboard',
      'categories',
      'collections',
      'media',
      'hero',
      'profile',
      'contact',
      'welcome',
      'inquiries',
      'homepage',
      'general',
      'services',
      'process',
    ];
    for (const route of routes) {
      w.history.replaceState(null, '', '#' + route);
      await w.route();
      assert.equal(w.document.querySelector('[aria-current=page]').hash, '#' + route);
      assert.equal(w.document.querySelector('#media-view').hidden, route !== 'media');
      assert.equal(w.document.querySelector('#management-view').hidden, route === 'media');
    }
    w.history.replaceState(null, '', '#categories');
    await w.route();
    w.categoryForm();
    assert(w.document.querySelector('input[name=collectionChoice]'));
    assert(w.document.querySelector('select[name=featured]'));
    assert(!w.document.querySelector('textarea[name=json]'));
    w.collectionForm();
    assert(w.document.querySelector('select[name=frame]'));
    assert.equal(w.document.querySelector('input[name=id]').readOnly, false);
    w.history.replaceState(null, '', '#profile');
    await w.route();
    assert(w.document.querySelector('textarea[name=about]'));
    assert(!w.document.querySelector('#management-view input[name=email]'));
    w.history.replaceState(null, '', '#contact');
    await w.route();
    assert(w.document.querySelector('#management-view input[name=email]'));
  } finally {
    w.close();
  }
});
