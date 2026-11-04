// Content screens use the same field definitions and defaults as the public renderer.
async function uploadAsset(file, allowDocument = false) {
  if (
    !file ||
    ![
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      ...(allowDocument ? ['application/pdf'] : []),
    ].includes(file.type) ||
    file.size > 15 * 1024 * 1024
  )
    throw Error('Choose a JPG, PNG, WebP or AVIF under 15 MB.');
  const signed = await api('/admin/upload-signature', { method: 'POST' });
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signed.apiKey);
  body.append('signature', signed.signature);
  for (const [key, value] of Object.entries(signed.params)) body.append(key, value);
  const response = await fetch(
    'https://api.cloudinary.com/v1_1/' + signed.cloudName + '/auto/upload',
    { method: 'POST', body },
  );
  const result = await response.json();
  if (!response.ok) throw Error(result.error?.message || 'Upload failed');
  return result;
}
async function selectLibraryImage(onChoose, collectionId) {
  const dialog = element('dialog');
  dialog.className = 'asset-picker';
  const heading = element('h2', 'Choose an existing image');
  const collection = document.createElement('select');
  for (const c of Object.values(manifest.collections)) collection.add(new Option(c.title, c.id));
  if (collectionId) {
    collection.value = collectionId;
    collection.disabled = true;
  }
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search image title';
  search.setAttribute('aria-label', 'Search image title');
  const results = element('div', undefined, 'picker-grid');
  let current = 1,
    total = 0;
  const status = element('p');
  status.setAttribute('role', 'status');
  const previous = action('Previous', async () => {
    current--;
    await loadPicker();
  });
  const next = action('Next', async () => {
    current++;
    await loadPicker();
  });
  async function loadPicker() {
    try {
      status.textContent = 'Loading…';
      const rows = await api(
        '/admin/media?collectionId=' +
          collection.value +
          '&q=' +
          encodeURIComponent(search.value) +
          '&page=' +
          current +
          '&status=published',
      );
      total = rows.total;
      results.replaceChildren();
      for (const item of rows.items.filter((x) => x.type === 'image')) {
        const button = action(item.title, async () => {
          await onChoose(item);
          dialog.close();
        });
        const image = element('img');
        image.src = /^https:/.test(item.thumb || item.src)
          ? item.thumb || item.src
          : '/' + (item.thumb || item.src);
        image.alt = item.title;
        button.prepend(image);
        results.append(button);
      }
      status.textContent =
        'Page ' +
        current +
        ' · ' +
        total +
        ' published entries' +
        (!results.children.length ? ' · No standalone images on this page.' : '');
      previous.disabled = current === 1;
      next.disabled = current * 48 >= total;
    } catch (error) {
      status.textContent = error.message;
    }
  }
  collection.onchange = () => {
    current = 1;
    loadPicker();
  };
  search.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      current = 1;
      loadPicker();
    }
  };
  dialog.append(
    heading,
    action('Close', () => dialog.close()),
    collection,
    search,
    action('Search', () => {
      current = 1;
      return loadPicker();
    }),
    status,
    results,
    buttons(previous, next),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  await loadPicker();
}
async function renderContentEditor(view) {
  const [config, settings] = await Promise.all([api('/content-config'), api('/admin/settings')]);
  if ((location.hash.slice(1) || 'dashboard') !== view) return;
  const fields = config.fields.filter((f) => f.group === view),
    lists = config.lists.filter((f) => f.group === view);
  const form = formScreen(
    screenTitles[view],
    'Edit the complete section below. Save changes, then open the portfolio to verify the result.',
    async () => {
      const values = {};
      for (const spec of fields) {
        const input = form.elements[spec.key];
        values[spec.key] =
          spec.type === 'boolean'
            ? input.checked
            : spec.type === 'number'
              ? Number(input.value)
              : input.value;
      }
      for (const list of lists) {
        values[list.key] = [...form.querySelectorAll(`[data-list="${list.key}"] .repeat-row`)].map(
          (row) =>
            Object.fromEntries(
              Object.keys(list.columns).map((key) => [
                key,
                row.querySelector(`[data-column="${key}"]`).value,
              ]),
            ),
        );
      }
      await api('/admin/settings', { method: 'PATCH', body: JSON.stringify(values) });
      const saved = await api('/admin/settings');
      for (const [key, value] of Object.entries(values))
        if (JSON.stringify(saved[key]) !== JSON.stringify(value))
          throw Error('Save verification failed for ' + key + '. Please reload and try again.');
      form.dataset.dirty = 'false';
      message('Saved and verified. Reload the public portfolio to see the changes.');
    },
  );
  form.addEventListener('input', () => (form.dataset.dirty = 'true'));
  for (const spec of fields) {
    const input = field(form, spec.key, spec.label, settings[spec.key] ?? spec.default);
    if (spec.type === 'textarea' && input.tagName !== 'TEXTAREA') {
      const text = document.createElement('textarea');
      text.name = spec.key;
      text.value = settings[spec.key] ?? spec.default;
      input.replaceWith(text);
    }
    if (spec.type === 'select') {
      const select = document.createElement('select');
      select.name = spec.key;
      for (const [value, label] of Object.entries(spec.options)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      }
      select.value = settings[spec.key] ?? spec.default;
      input.replaceWith(select);
    }
    if (spec.help) form.append(element('p', spec.help, 'muted'));
    const target = form.elements[spec.key];
    if (spec.type === 'boolean') {
      target.type = 'checkbox';
      target.checked = settings[spec.key] ?? spec.default;
    } else if (spec.type === 'number') {
      target.type = 'number';
      target.min = spec.min;
      target.max = spec.max;
      target.required = true;
    } else {
      target.maxLength = spec.max || 2000;
      if (['email', 'url'].includes(spec.type)) target.type = spec.type;
    }
    if (spec.type === 'asset') {
      const preview = element('img');
      preview.className = 'asset-preview';
      const refresh = () => {
        preview.hidden = !target.value;
        if (target.value)
          preview.src = target.value.startsWith('https://') ? target.value : '/' + target.value;
      };
      target.addEventListener('input', refresh);
      refresh();
      form.append(preview);
      const upload = document.createElement('input');
      upload.type = 'file';
      upload.accept = 'image/jpeg,image/png,image/webp,image/avif';
      upload.setAttribute('aria-label', 'Upload ' + spec.label);
      upload.onchange = run(async () => {
        const submit = form.querySelector('[type=submit]');
        submit.disabled = true;
        try {
          const result = await uploadAsset(upload.files[0]);
          target.value = result.secure_url;
          form.dataset.dirty = 'true';
          refresh();
          message('Uploaded. Save changes to publish this image.');
        } finally {
          submit.disabled = false;
        }
      });
      form.append(
        buttons(
          action('Choose from library', () =>
            selectLibraryImage((item) => {
              target.value = item.src;
              form.dataset.dirty = 'true';
              refresh();
            }),
          ),
          action('Remove image / use default', () => {
            target.value = '';
            form.dataset.dirty = 'true';
            refresh();
          }),
        ),
        upload,
        element(
          'p',
          'Choose a library image, paste an HTTPS URL, or upload a file. Save changes to publish; removing it restores the default.',
          'muted',
        ),
      );
    }
  }
  for (const list of lists) {
    const section = element('section', undefined, 'repeater');
    section.dataset.list = list.key;
    section.append(element('h3', list.label));
    const rows = element('div');
    section.append(rows);
    function addRow(item = {}) {
      const row = element('div', undefined, 'repeat-row');
      for (const [key, label] of Object.entries(list.columns)) {
        const wrapper = element('label', label);
        const input = element(key === 'body' ? 'textarea' : 'input');
        input.dataset.column = key;
        input.value = item[key] || '';
        input.maxLength = key === 'body' ? 6000 : 200;
        wrapper.append(input);
        row.append(wrapper);
      }
      row.append(
        buttons(
          action('Move up', () => {
            if (row.previousElementSibling) rows.insertBefore(row, row.previousElementSibling);
            form.dataset.dirty = 'true';
          }),
          action('Move down', () => {
            if (row.nextElementSibling) rows.insertBefore(row.nextElementSibling, row);
            form.dataset.dirty = 'true';
          }),
          action(
            'Remove',
            () => {
              row.remove();
              form.dataset.dirty = 'true';
            },
            true,
          ),
        ),
      );
      rows.append(row);
    }
    (settings[list.key] ?? list.default).forEach(addRow);
    section.append(
      action('Add item', () => {
        if (rows.children.length >= 30) throw Error('Maximum 30 items.');
        addRow();
        form.dataset.dirty = 'true';
      }),
    );
    form.append(section);
  }
  saveButton(form);
  const preview = document.createElement('a');
  preview.href =
    '/' +
    ({ profile: '#about', services: '#services', contact: '#contact', process: '#about' }[view] ||
      '');
  preview.target = '_blank';
  preview.rel = 'noopener';
  preview.textContent = 'Open portfolio preview';
  preview.className = 'preview-link';
  form.append(preview);
}
window.addEventListener('beforeunload', (event) => {
  if (document.querySelector('form[data-dirty=true]')) {
    event.preventDefault();
    event.returnValue = '';
  }
});
