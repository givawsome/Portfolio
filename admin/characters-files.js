async function renderCharactersAdmin() {
  const root = $('#management-view');
  root.append(
    element('h2', 'Character folders'),
    element(
      'p',
      'One folder per character. Add images through Manage images, then choose a published image as the folder cover.',
    ),
  );
  const create = element('form', undefined, 'panel form-panel');
  const name = field(create, 'title', 'Character name');
  name.required = true;
  const submit = element('button', 'Create character folder');
  submit.type = 'submit';
  create.append(submit);
  create.onsubmit = run(async () => {
    const title = name.value.trim();
    if (!title) throw Error('Enter a character name');
    const id = 'character-' + crypto.randomUUID();
    await api('/admin/collections/' + id, {
      method: 'PUT',
      body: JSON.stringify({
        title,
        character: true,
        frame: 'portrait',
        method: 'AI-assisted',
        note: 'Character studies and story images.',
        folder: title,
      }),
    });
    await refreshManifest();
    const sections = structuredClone(manifest.sections);
    let section = sections.find((s) => ['character-stories', 'manga'].includes(s.id));
    if (!section)
      sections.push({
        id: 'character-stories',
        title: 'Character Stories',
        subtitle: 'Meet the characters and explore their worlds.',
        collections: [id],
        featured: id,
      });
    else section.collections.push(id);
    await saveSections(sections);
  });
  root.append(create);
  const section = manifest.sections.find((s) => ['character-stories', 'manga'].includes(s.id));
  const folders =
    section?.collections
      .map((id) => manifest.collections[id])
      .filter((c) => c && (c.character || c.id.startsWith('manga-'))) || [];
  for (const c of folders) {
    const card = element('article', undefined, 'panel');
    card.append(element('h3', c.title));
    const media = await api('/admin/media?collectionId=' + c.id + '&page=1');
    const cover = media.items.find((x) => x.id === c.coverId) || media.items[0];
    if (cover?.src) {
      const image = element('img');
      image.className = 'asset-preview';
      image.src = cover.thumb || cover.src;
      image.alt = c.title;
      card.append(image);
    }
    card.append(element('p', media.total + ' images'));
    const uploadLabel = element('label', 'Upload images to this character');
    const upload = element('input');
    upload.type = 'file';
    upload.multiple = true;
    upload.accept = 'image/jpeg,image/png,image/webp,image/avif';
    upload.onchange = run(async () => {
      upload.disabled = true;
      try {
        let order = media.total;
        for (const file of upload.files) {
          const asset = await uploadAsset(file);
          const id = crypto.randomUUID();
          await api('/admin/media/' + id, {
            method: 'PUT',
            body: JSON.stringify({
              id,
              collectionId: c.id,
              title: file.name.replace(/\.[^.]+$/, ''),
              name: file.name,
              src: asset.secure_url,
              thumb: asset.secure_url,
              width: asset.width,
              height: asset.height,
              order: order++,
              published: true,
              type: 'image',
              group: c.title,
            }),
          });
        }
        await route();
      } finally {
        upload.disabled = false;
      }
    });
    uploadLabel.append(upload);
    card.append(uploadLabel);

    card.append(
      buttons(
        action('Manage images', () => {
          $('#collection').value = c.id;
          $('#media-category').value = section.id;
          location.hash = 'media';
        }),
        action('Choose folder cover', () =>
          selectLibraryImage(async (item) => {
            await api('/admin/collections/' + c.id + '/cover', {
              method: 'PUT',
              body: JSON.stringify({ coverId: item.id }),
            });
            await route();
          }, c.id),
        ),
        action('Rename folder', async () => {
          const title = prompt('Character name', c.title)?.trim();
          if (!title) return;
          await api('/admin/collections/' + c.id, {
            method: 'PUT',
            body: JSON.stringify({ ...c, title, character: true }),
          });
          await route();
        }),
        action(
          'Delete empty folder',
          async () => {
            if (media.total) throw Error('Remove or move the images before deleting this folder.');
            if (!confirm('Delete the empty character folder “' + c.title + '”?')) return;
            const sections = structuredClone(manifest.sections);
            const s = sections.find((s) => s.id === section.id);
            s.collections = s.collections.filter((id) => id !== c.id);
            if (!s.collections.length) throw Error('Keep at least one collection in the category.');
            if (s.featured === c.id) s.featured = s.collections[0];
            await api('/admin/sections', { method: 'PUT', body: JSON.stringify(sections) });
            await api('/admin/collections/' + c.id, { method: 'DELETE' });
            await route();
          },
          true,
        ),
      ),
    );
    root.append(card);
  }
}
async function renderFilesAdmin() {
  const root = $('#management-view');
  root.append(
    element('h2', 'Files & uploads'),
    element(
      'p',
      'Upload images or PDFs up to 15 MB. Copy a URL to use it in your portfolio. Removing a record here does not erase the source file from Cloudinary.',
    ),
  );
  const upload = element('input');
  upload.type = 'file';
  upload.accept = 'image/jpeg,image/png,image/webp,image/avif,application/pdf';
  upload.multiple = true;
  upload.setAttribute('aria-label', 'Upload images or PDFs');
  upload.onchange = run(async () => {
    upload.disabled = true;
    try {
      for (const file of upload.files) {
        const result = await uploadAsset(file, true);
        await api('/admin/files', {
          method: 'POST',
          body: JSON.stringify({
            title: file.name,
            url: result.secure_url,
            mime: file.type,
            size: file.size,
          }),
        });
      }
      await route();
    } finally {
      upload.disabled = false;
    }
  });
  root.append(upload);
  for (const file of await api('/admin/files')) {
    const card = element('article', undefined, 'panel');
    const link = element('a', file.title);
    link.href = file.url;
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(
      link,
      element('p', file.mime + ' · ' + Math.round(file.size / 1024) + ' KB'),
      buttons(
        action('Copy URL', async () => {
          await navigator.clipboard.writeText(file.url);
          message('File URL copied.');
        }),
        action(
          'Remove record',
          async () => {
            if (!confirm('Remove this file from the list?')) return;
            await api('/admin/files/' + file.id, { method: 'DELETE' });
            await route();
          },
          true,
        ),
      ),
    );
    root.append(card);
  }
}
