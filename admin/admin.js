const $ = (s) => document.querySelector(s);
let manifest,
  page = 1,
  currentItem;
async function api(url, options = {}) {
  const response = await fetch('/api' + url, {
    ...options,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      'The server returned an unexpected response. Restart npm run dev and reload this page.',
    );
  }
  if (!response.ok) {
    if (response.status === 401) {
      document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close());
      $('#logout').hidden = true;
      $('#workspace').hidden = true;
      $('#login').hidden = false;
    }
    const detail = data.issues
      ?.map((issue) => (issue.path.join('.') || 'Form') + ': ' + issue.message)
      .join('\n');
    throw Error(detail || data.error || 'Request failed');
  }
  return data;
}
function message(text) {
  $('#status').textContent = text;
  if ($('#image-status')) $('#image-status').textContent = text;
}
function run(fn) {
  return async (e) => {
    e?.preventDefault();
    try {
      await fn(e);
    } catch (error) {
      message(error.message);
    }
  };
}
$('#login').onsubmit = run(async () => {
  await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify(Object.fromEntries(new FormData($('#login')))),
  });
  $('#login').reset();
  await start();
});
$('#logout').onclick = run(async () => {
  await api('/auth/logout', { method: 'POST' });
  location.reload();
});
async function start() {
  await api('/auth/me');
  const health = await api('/health');
  if (health.version !== 'content-admin-v2')
    throw Error(
      'Your server is still running an older version. Stop it with Ctrl+C, run npm run dev again, then reload this page.',
    );
  manifest = await api('/admin/manifest');
  $('#login').hidden = true;
  $('#workspace').hidden = false;
  $('#logout').hidden = false;
  const selected = $('#collection').value;
  $('#collection').replaceChildren(
    ...Object.values(manifest.collections).map((c) => new Option(c.title, c.id)),
  );
  if (manifest.collections[selected]) $('#collection').value = selected;
  await route();
  message('Your portfolio is connected.');
}
let mediaLoadVersion = 0;
async function load() {
  const loadVersion = ++mediaLoadVersion;
  if (!Object.keys(manifest.collections).length) {
    $('#grid').textContent = 'Create a collection first.';
    return;
  }
  const result = await api(
    '/admin/media?categoryId=' +
      encodeURIComponent($('#media-category').value) +
      '&collectionId=' +
      encodeURIComponent($('#collection').value) +
      '&page=' +
      page +
      '&q=' +
      encodeURIComponent($('#media-search').value) +
      '&status=' +
      $('#media-status').value,
  );
  if (loadVersion !== mediaLoadVersion) return;
  $('#grid').replaceChildren();
  if (result.total > 0 && page > Math.ceil(result.total / 48)) {
    page = Math.ceil(result.total / 48);
    return load();
  }
  if (!result.items.length) $('#grid').textContent = 'No images match this collection and filter.';
  for (const item of result.items) {
    const card = document.createElement('article');
    const img = document.createElement(item.type === 'archive' ? 'div' : 'img');
    if (item.type === 'archive') {
      const x = item.cell % item.cols,
        y = Math.floor(item.cell / item.cols);
      img.className = 'archive-thumb';
      img.style.backgroundImage = 'url(/' + item.sheet + ')';
      img.style.backgroundSize = item.cols * 100 + '% ' + item.rows * 100 + '%';
      img.style.backgroundPosition =
        (item.cols === 1 ? 0 : (x / (item.cols - 1)) * 100) +
        '% ' +
        (item.rows === 1 ? 0 : (y / (item.rows - 1)) * 100) +
        '%';
    }
    if (item.src || item.thumb) {
      img.src = '/' + (item.thumb || item.src);
      if ((item.thumb || item.src).startsWith('https://')) img.src = item.thumb || item.src;
    }
    img.alt = item.title;
    img.loading = 'lazy';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const status = document.createElement('p');
    status.textContent = (item.published ? 'Published' : 'Draft') + ' · Order ' + item.order;
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.onclick = () => openImage(item);
    const toggle = document.createElement('button');
    toggle.textContent = item.published ? 'Unpublish' : 'Publish';
    toggle.onclick = run(async () => {
      await api('/admin/media/' + item.id, {
        method: 'PUT',
        body: JSON.stringify({ ...item, published: !item.published }),
      });
      await load();
    });
    if (item.type === 'archive') img.alt = 'Archive contact sheet · ' + item.title;
    const terms = document.createElement('p');
    terms.textContent = (item.tags || []).join(' · ');
    card.append(img, title, status, terms, edit, toggle);
    const remove = document.createElement('button');
    remove.textContent = 'Delete';
    remove.className = 'danger';
    remove.onclick = run(async () => {
      if (!confirm('Delete ' + item.title + ' from the portfolio?')) return;
      await api('/admin/media/' + item.collectionId + '/' + item.id, { method: 'DELETE' });
      await load();
    });
    card.append(remove);
    $('#grid').append(card);
  }
  $('#count').textContent = result.total + ' images';
  $('#page').textContent = 'Page ' + page;
  $('#previous').disabled = page === 1;
  $('#next').disabled = page * 48 >= result.total;
}
$('#collection').onchange = run(async () => {
  page = 1;
  await load();
});
$('#previous').onclick = run(async () => {
  page--;
  await load();
});
$('#next').onclick = run(async () => {
  page++;
  await load();
});
function openImage(item) {
  if (!item && !$('#collection').value) {
    message('Choose a collection before adding an image.');
    return;
  }
  currentItem = item || {
    id: crypto.randomUUID(),
    collectionId: $('#collection').value,
    type: 'image',
    width: 1000,
    height: 1000,
    order: 0,
    published: false,
    group: '',
    folder: '',
    path: '',
  };
  const form = $('#image-form');
  form.reset();
  $('#image-status').textContent = '';
  $('#hero-slot').value = '';
  for (const key of ['title', 'name', 'src', 'thumb', 'width', 'height', 'order'])
    form.elements[key].value =
      currentItem[key] ?? (key === 'width' || key === 'height' ? 1000 : '');
  for (const key of ['tags', 'keywords'])
    form.elements[key].value = (currentItem[key] || []).join(', ');
  form.elements.alt.value = currentItem.alt || '';
  form.elements.published.checked = currentItem.published;
  form.elements.src.required = currentItem.type !== 'archive';
  form.elements.src.disabled = currentItem.type === 'archive';
  $('#upload').disabled = currentItem.type === 'archive';
  $('#delete-image').hidden = !item;
  $('#image-dialog').showModal();
}
$('#add-image').onclick = () => openImage();
$('#close-dialog').onclick = () => $('#image-dialog').close();
$('#image-form').onsubmit = run(async () => {
  const values = Object.fromEntries(new FormData($('#image-form')));
  const body = {
    ...currentItem,
    ...Object.fromEntries(['title', 'name', 'src', 'thumb'].map((k) => [k, values[k]])),
    tags: parseTerms(values.tags),
    keywords: parseTerms(values.keywords),
    alt: values.alt,
    width: Number(values.width),
    height: Number(values.height),
    order: Number(values.order),
    published: $('#image-form').elements.published.checked,
  };
  if (!body.thumb) delete body.thumb;
  if (body.type === 'archive') delete body.src;
  else if (currentItem.src !== body.src && (!body.thumb || body.thumb === currentItem.thumb))
    body.thumb = body.src;
  await api('/admin/media/' + body.id, { method: 'PUT', body: JSON.stringify(body) });
  $('#image-dialog').close();
  await load();
  message('Image saved.');
});
$('#delete-image').onclick = run(async () => {
  if (
    !confirm(
      'Remove this image from the portfolio? The stored original will remain in your media account.',
    )
  )
    return;
  await api('/admin/media/' + currentItem.collectionId + '/' + currentItem.id, {
    method: 'DELETE',
  });
  $('#image-dialog').close();
  await load();
});
$('#upload').onchange = run(async () => {
  const submit = $('#image-form').querySelector('button:not([type])');
  submit.disabled = true;
  try {
    message('Uploading…');
    const file = $('#upload').files[0];
    const data = await uploadAsset(file);
    const f = $('#image-form');
    f.elements.src.value = data.secure_url;
    f.elements.thumb.value = data.secure_url;
    f.elements.name.value = file.name;
    f.elements.width.value = data.width;
    f.elements.height.value = data.height;
    message('Uploaded. Save the image to publish your changes.');
  } finally {
    submit.disabled = false;
  }
});
$('#set-hero').onclick = run(async () => {
  const slot = $('#hero-slot').value;
  if (!slot) throw Error('Select a hero position first.');
  await api('/admin/hero/' + slot, {
    method: 'PUT',
    body: JSON.stringify({ id: currentItem.id, collectionId: currentItem.collectionId }),
  });
  message('Hero updated.');
});

function parseTerms(text) {
  return [
    ...new Set(
      String(text || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}
function syncCategoryFilter() {
  const selected = $('#media-category').value,
    collection = $('#collection').value;
  $('#media-category').replaceChildren(
    new Option('All categories', ''),
    ...manifest.sections.map((s) => new Option(s.title, s.id)),
  );
  $('#media-category').value = selected;
  const category = manifest.sections.find((s) => s.id === selected);
  const available = category
    ? category.collections.map((id) => manifest.collections[id]).filter(Boolean)
    : Object.values(manifest.collections);
  $('#collection').replaceChildren(
    new Option('All collections', ''),
    ...available.map((c) => new Option(c.title, c.id)),
  );
  if (available.some((c) => c.id === collection)) $('#collection').value = collection;
}
$('#media-category').onchange = run(async () => {
  page = 1;
  $('#collection').value = '';
  syncCategoryFilter();
  await load();
});
