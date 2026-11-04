// Each sidebar destination has its own URL, screen, and editing workflow.
const screenTitles = {
  dashboard: 'Overview',
  characters: 'Character folders',
  files: 'Files & uploads',
  blog: 'Journal',
  homepage: 'Homepage copy',
  general: 'Brand & SEO',
  services: 'Services',
  process: 'Working process',
  categories: 'Categories',
  collections: 'Collections',
  media: 'Media library',
  hero: 'Homepage artwork',
  profile: 'About & profile',
  contact: 'Contact & social links',
  welcome: 'Welcome message',
  inquiries: 'Enquiries',
};
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
function action(text, callback, danger = false) {
  const button = element('button', text, danger ? 'danger' : '');
  button.type = 'button';
  button.onclick = run(callback);
  return button;
}
function field(form, name, label, value = '', options) {
  const wrapper = element('label', label);
  let input;
  if (options) {
    input = document.createElement('select');
    for (const [key, title] of options) input.add(new Option(title, key));
  } else
    input = document.createElement(
      ['about', 'intro', 'note', 'subtitle', 'welcomeMessage'].includes(name)
        ? 'textarea'
        : 'input',
    );
  input.name = name;
  input.value = value;
  wrapper.append(input);
  form.append(wrapper);
  return input;
}
function formScreen(title, help, onSave) {
  const root = $('#management-view');
  root.replaceChildren();
  root.append(element('h2', title), element('p', help, 'muted'));
  const form = element('form', undefined, 'panel form-panel');
  root.append(form);
  form.onsubmit = run(async () => {
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await onSave(Object.fromEntries(new FormData(form)));
      if (form.isConnected) form.dataset.dirty = 'false';
      message('Changes saved and verified.');
    } finally {
      button.disabled = false;
    }
  });
  return form;
}
function saveButton(form) {
  const button = element('button', 'Save changes', 'primary');
  button.type = 'submit';
  form.append(button, action('Cancel', route));
}
function table(headers, rows) {
  const wrap = element('div', undefined, 'table-wrap');
  const t = document.createElement('table');
  const head = document.createElement('thead');
  const tr = document.createElement('tr');
  headers.forEach((h) => tr.append(element('th', h)));
  head.append(tr);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const r = document.createElement('tr');
    for (const value of row) {
      const cell = document.createElement('td');
      if (value instanceof Node) cell.append(value);
      else cell.textContent = value;
      r.append(cell);
    }
    body.append(r);
  }
  t.append(head, body);
  wrap.append(t);
  return wrap;
}
function buttons(...items) {
  const div = element('div', undefined, 'actions');
  div.append(...items);
  return div;
}
async function refreshManifest() {
  manifest = await api('/admin/manifest');
}
async function saveSections(sections) {
  await api('/admin/sections', { method: 'PUT', body: JSON.stringify(sections) });
  await refreshManifest();
  await route();
}
let routeVersion = 0;
async function route() {
  message('');
  const version = ++routeVersion;
  const view = location.hash.slice(1) || 'dashboard';
  if (!screenTitles[view]) {
    location.hash = 'dashboard';
    return;
  }
  $('#page-title').textContent = screenTitles[view];
  document.title = screenTitles[view] + ' · Portfolio manager';
  document.querySelectorAll('.sidebar a').forEach((a) => {
    a.classList.toggle('active', a.hash === '#' + view);
    if (a.hash === '#' + view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#media-view').hidden = view !== 'media';
  $('#editor-view').hidden = true;
  $('#inquiries-view').hidden = true;
  $('#management-view').hidden = view === 'media';
  const root = $('#management-view');
  root.replaceChildren();
  if (view === 'media') {
    syncCategoryFilter();
    await load();
    return;
  }
  root.append(element('p', 'Loading…', 'muted'));
  await refreshManifest();
  if (version !== routeVersion) return;
  const selected = $('#collection').value;
  $('#collection').replaceChildren(
    ...Object.values(manifest.collections).map((c) => new Option(c.title, c.id)),
  );
  if (manifest.collections[selected]) $('#collection').value = selected;
  root.replaceChildren();
  if (view === 'characters') {
    await renderCharactersAdmin();
    return;
  }
  if (view === 'files') {
    await renderFilesAdmin();
    return;
  }
  if (view === 'blog') {
    await renderBlogAdmin();
    return;
  }
  if (view === 'dashboard') {
    const stats = await api('/admin/stats');
    if (version !== routeVersion) return;
    const cards = element('div', undefined, 'stats');
    for (const [label, count] of [
      ['Categories', manifest.sections.length],
      ['Collections', Object.keys(manifest.collections).length],
      ['Published images', stats.published],
      ['Draft images', stats.drafts],
      ['New enquiries', stats.inquiries],
    ]) {
      const card = element('article', undefined, 'stat');
      card.append(element('span', label), element('strong', String(count)));
      cards.append(card);
    }
    root.append(cards);
    const banner = element('div', undefined, 'welcome-panel');
    banner.append(
      element('p', 'A space for everything you create.', 'eyebrow'),
      element('h2', 'Keep your portfolio moving.'),
      element(
        'p',
        'Organize collections, publish your latest work and follow up with potential clients.',
      ),
    );
    root.append(banner);
    root.append(
      buttons(
        action('Manage images', () => (location.hash = 'media')),
        action('Create a collection', () => {
          location.hash = 'collections';
        }),
        action('Read enquiries', () => (location.hash = 'inquiries')),
      ),
    );
  } else if (view === 'collections') {
    root.append(
      element(
        'p',
        'Collections group related work. Add each new collection to a category to make it visible.',
        'muted',
      ),
      action('New collection', () => collectionForm()),
    );
    root.append(
      table(
        ['Collection', 'Frame', 'Method', 'Actions'],
        Object.values(manifest.collections).map((c) => [
          c.title,
          c.frame,
          c.method,
          buttons(
            action('View images', () => {
              $('#media-category').value = '';
              $('#collection').value = c.id;
              page = 1;
              location.hash = 'media';
            }),
            action('Edit', () => collectionForm(c)),
            action(
              'Delete',
              async () => {
                if (
                  !confirm(
                    'Delete ' +
                      c.title +
                      '? Only empty collections removed from all categories can be deleted.',
                  )
                )
                  return;
                await api('/admin/collections/' + c.id, { method: 'DELETE' });
                await route();
              },
              true,
            ),
          ),
        ]),
      ),
    );
  } else if (view === 'categories') {
    root.append(
      element(
        'p',
        'Categories control the public navigation and homepage sliders. Reorder them here without editing code.',
        'muted',
      ),
      action('New category', () => categoryForm()),
    );
    root.append(
      table(
        ['Order', 'Category', 'Collections', 'Actions'],
        manifest.sections.map((s, i) => [
          String(i + 1),
          s.title,
          String(s.collections.length),
          buttons(
            action('View uploads', () => {
              $('#media-category').replaceChildren(new Option(s.title, s.id));
              $('#media-category').value = s.id;
              $('#collection').value = '';
              page = 1;
              location.hash = 'media';
            }),
            action('Edit', () => categoryForm(s)),
            action('Move up', async () => {
              if (!i) return;
              const rows = [...manifest.sections];
              [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
              await saveSections(rows);
            }),
            action('Move down', async () => {
              if (i === manifest.sections.length - 1) return;
              const rows = [...manifest.sections];
              [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
              await saveSections(rows);
            }),
            action(
              'Delete',
              async () => {
                if (
                  !confirm(
                    'Remove category ' + s.title + '? Its collections and images will be kept.',
                  )
                )
                  return;
                await saveSections(manifest.sections.filter((x) => x.id !== s.id));
              },
              true,
            ),
          ),
        ]),
      ),
    );
  } else if (view === 'hero') {
    root.append(
      element('p', 'Choose published artwork directly for each homepage position.', 'muted'),
    );
    const cards = element('div', undefined, 'hero-grid');
    for (const slot of ['product', 'painting', 'character']) {
      const card = element('article');
      card.append(element('h2', slot));
      const item = manifest.hero?.[slot];
      if (item) {
        const img = element('img');
        img.src = /^https:/.test(item.src) ? item.src : '/' + item.src;
        img.alt = item.title || slot;
        card.append(img, element('p', item.title));
      } else card.append(element('p', 'No artwork selected.'));
      card.append(
        action('Choose image', () =>
          selectLibraryImage(async (item) => {
            await api('/admin/hero/' + slot, {
              method: 'PUT',
              body: JSON.stringify({ id: item.id, collectionId: item.collectionId }),
            });
            await route();
            message('Homepage artwork saved.');
          }),
        ),
      );
      if (item)
        card.append(
          action(
            'Remove',
            async () => {
              if (!confirm('Remove this homepage artwork? The image remains in the library.'))
                return;
              await api('/admin/hero/' + slot, { method: 'DELETE' });
              await route();
            },
            true,
          ),
        );
      cards.append(card);
    }
    root.append(cards);
  } else if (
    ['homepage', 'general', 'services', 'process', 'profile', 'contact', 'welcome'].includes(view)
  ) {
    await renderContentEditor(view);
  } else if (view === 'inquiries') {
    const rows = await api('/admin/inquiries');
    if (version !== routeVersion) return;
    root.append(
      element(
        'p',
        'Latest 100 enquiries. Open a message to read the brief and update its status.',
        'muted',
      ),
    );
    if (!rows.length)
      root.append(
        element('div', 'Your inbox is clear. New portfolio enquiries will appear here.', 'empty'),
      );
    root.append(
      table(
        ['Client', 'Service', 'Received', 'Status', 'Actions'],
        rows.map((r) => [
          r.name,
          r.service,
          new Date(r.createdAt).toLocaleDateString(),
          r.status,
          buttons(
            action('Read message', () => inquiryDetail(r)),
            action(
              'Delete',
              async () => {
                if (!confirm('Permanently delete this enquiry from ' + r.name + '?')) return;
                await api('/admin/inquiries/' + r._id, { method: 'DELETE' });
                await route();
              },
              true,
            ),
          ),
        ]),
      ),
    );
  }
}
function collectionForm(c) {
  const fresh = !c;
  c = c || { id: '', title: '', folder: '', frame: 'natural', method: 'Design', note: '' };
  const form = formScreen(
    fresh ? 'New collection' : 'Edit collection',
    'Use a unique ID containing letters, numbers and hyphens.',
    async (values) => {
      if (fresh && manifest.collections[values.id])
        throw Error('That collection ID already exists.');
      await api('/admin/collections/' + encodeURIComponent(c.id || values.id), {
        method: 'PUT',
        body: JSON.stringify(values),
      });
      await refreshManifest();
      $('#collection').replaceChildren(
        ...Object.values(manifest.collections).map((x) => new Option(x.title, x.id)),
      );
      await route();
    },
  );
  for (const [key, label] of Object.entries({
    id: 'Collection ID',
    title: 'Title',
    folder: 'Source folder',
    frame: 'Image frame',
    method: 'Creative discipline',
    note: 'Description',
  })) {
    const input = field(
      form,
      key,
      label,
      c[key],
      key === 'frame'
        ? [
            ['natural', 'Natural proportions'],
            ['square', 'Square · products'],
            ['portrait', 'Portrait · paintings'],
            ['web', 'Website screenshots'],
          ]
        : undefined,
    );
    if (key === 'id') {
      input.readOnly = !fresh;
      input.pattern = '[a-zA-Z0-9_-]{1,100}';
    }
    if (['id', 'title'].includes(key)) input.required = true;
  }
  saveButton(form);
}
function categoryForm(s) {
  const fresh = !s;
  s = s || { id: '', title: '', subtitle: '', collections: [], featured: '' };
  const form = formScreen(
    fresh ? 'New category' : 'Edit category',
    'Select the collections this category contains and its featured collection.',
    async (values) => {
      const selected = [...form.querySelectorAll('[name=collectionChoice]:checked')].map(
        (x) => x.value,
      );
      const item = {
        id: values.id,
        title: values.title,
        subtitle: values.subtitle,
        collections: selected,
        featured: values.featured,
      };
      if (!selected.includes(item.featured))
        throw Error('Select at least one collection and choose a featured collection from it.');
      if (fresh && manifest.sections.some((x) => x.id === item.id))
        throw Error('That category ID already exists.');
      await saveSections(
        fresh
          ? [...manifest.sections, item]
          : manifest.sections.map((x) => (x.id === s.id ? item : x)),
      );
    },
  );
  for (const [key, label] of Object.entries({
    id: 'Category ID',
    title: 'Title',
    subtitle: 'Description',
  })) {
    const input = field(form, key, label, s[key]);
    if (key === 'id') {
      input.readOnly = !fresh;
      input.pattern = '[a-zA-Z0-9_-]{1,100}';
    }
    input.required = key !== 'subtitle';
  }
  const group = element('fieldset');
  group.append(element('legend', 'Included collections'));
  for (const c of Object.values(manifest.collections)) {
    const label = element('label', undefined, 'check-row');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.name = 'collectionChoice';
    check.value = c.id;
    check.checked = s.collections.includes(c.id);
    label.append(check, document.createTextNode(c.title));
    group.append(label);
  }
  form.append(group);
  field(
    form,
    'featured',
    'Featured collection',
    s.featured,
    Object.values(manifest.collections).map((c) => [c.id, c.title]),
  );
  saveButton(form);
}
function inquiryDetail(row) {
  const form = formScreen(
    'Enquiry from ' + row.name,
    'Review the client’s brief and track your follow-up.',
    async (values) => {
      await api('/admin/inquiries/' + row._id, {
        method: 'PATCH',
        body: JSON.stringify({ status: values.status }),
      });
      await route();
    },
  );
  for (const key of ['email', 'service', 'budget', 'timeline', 'message']) {
    form.append(element('h3', key), element('p', row[key] || 'Not provided', 'message-text'));
  }
  field(form, 'status', 'Status', row.status, [
    ['new', 'New'],
    ['read', 'Read'],
    ['archived', 'Archived'],
  ]);
  saveButton(form);
}
$('#search-media').onclick = run(async () => {
  page = 1;
  await load();
});
$('#media-search').onkeydown = (e) => {
  if (e.key === 'Enter')
    run(async () => {
      page = 1;
      await load();
    })(e);
};
window.addEventListener('hashchange', () => {
  if (!$('#workspace').hidden) run(route)();
});
start().catch((e) => message(e.message));
