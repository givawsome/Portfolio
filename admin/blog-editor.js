let blogPage = 1;
async function renderBlogAdmin() {
  const result = await api('/admin/posts?page=' + blogPage);
  if (location.hash !== '#blog') return;
  const root = $('#management-view');
  root.replaceChildren(
    element(
      'p',
      'Photography, graphic design and AI design articles. Drafts stay private.',
      'muted',
    ),
    action('New article', () => editPost()),
  );
  if (!result.items.length)
    root.append(element('p', 'No articles yet. Write your first story.', 'empty'));
  root.append(
    table(
      ['Title', 'Topic', 'Status', 'Updated', 'Actions'],
      result.items.map((post) => [
        post.title,
        {
          photography: 'Photography',
          'graphic-design': 'Graphic design',
          'ai-design': 'AI design',
        }[post.category || 'photography'],
        post.published ? 'Published' : 'Draft',
        new Date(post.updatedAt).toLocaleDateString(),
        buttons(
          action('Edit', () => editPost(post)),
          action('Preview', () => previewPost(post)),
          action(
            'Delete',
            async () => {
              if (!confirm('Permanently delete ' + post.title + '?')) return;
              await api('/admin/posts/' + post.id, { method: 'DELETE' });
              await renderBlogAdmin();
            },
            true,
          ),
        ),
      ]),
    ),
  );
  const previous = action('Previous', async () => {
      blogPage--;
      await renderBlogAdmin();
    }),
    next = action('Next', async () => {
      blogPage++;
      await renderBlogAdmin();
    });
  previous.disabled = blogPage === 1;
  next.disabled = blogPage * 30 >= result.total;
  root.append(buttons(previous, element('span', 'Page ' + blogPage), next));
}
function previewPost(post) {
  const dialog = element('dialog');
  dialog.className = 'post-preview';
  dialog.append(
    action('Close', () => dialog.close()),
    element('h1', post.title),
    element('p', post.excerpt),
  );
  const content = element('div');
  renderPostBody(content, post.body);
  dialog.append(content);
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
function renderPostBody(container, body) {
  container.replaceChildren();
  for (const paragraph of body.split(/\n\s*\n/)) {
    const match = paragraph.match(/^(#{1,3})\s+(.+)$/);
    container.append(
      element(match ? 'h' + (match[1].length + 1) : 'p', match ? match[2] : paragraph),
    );
  }
}
function editPost(post = {}) {
  const form = formScreen(
    post.id ? 'Edit article' : 'New article',
    'Use blank lines for paragraphs and # / ## for headings. HTML is displayed as text.',
    async (values) => {
      const body = {
        category: values.category,
        title: values.title,
        slug: values.slug,
        excerpt: values.excerpt,
        body: values.body,
        author: values.author,
        cover: values.cover,
        coverAlt: values.coverAlt,
        coverCredit: values.coverCredit,
        tags: parseTerms(values.tags),
        published: form.elements.published.checked,
      };
      await api('/admin/posts' + (post.id ? '/' + post.id : ''), {
        method: post.id ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      await renderBlogAdmin();
    },
  );
  for (const [key, label] of Object.entries({
    title: 'Title',
    slug: 'URL slug',
    author: 'Author',
    excerpt: 'Short description',
    cover: 'Cover image URL',
    coverAlt: 'Cover description',
    coverCredit: 'Cover credit / AI disclosure (optional)',
    tags: 'Tags (comma separated)',
    body: 'Article content',
  })) {
    const input = field(
      form,
      key,
      label,
      key === 'tags'
        ? (post.tags || []).join(', ')
        : (post[key] ?? (key === 'author' ? 'Rajneesh Vaishnav' : '')),
    );
    if (['body', 'excerpt'].includes(key)) {
      const text = element('textarea');
      text.name = key;
      text.value = post[key] || '';
      text.rows = key === 'body' ? 18 : 3;
      input.replaceWith(text);
    }
    form.elements[key].required = ['title', 'slug', 'author', 'body'].includes(key);
  }
  const categoryInput = field(form, 'category', 'Topic');
  const categorySelect = element('select');
  categorySelect.name = 'category';
  for (const [value, label] of Object.entries({
    photography: 'Photography',
    'graphic-design': 'Graphic design',
    'ai-design': 'AI design',
  }))
    categorySelect.append(new Option(label, value));
  categorySelect.value = post.category || 'photography';
  categoryInput.replaceWith(categorySelect);
  form.elements.slug.pattern = '[a-z0-9]+(-[a-z0-9]+)*';
  let slugEdited = !!post.id;
  form.elements.slug.addEventListener('input', () => {
    slugEdited = true;
  });
  form.elements.title.addEventListener('input', () => {
    if (!slugEdited)
      form.elements.slug.value = form.elements.title.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
  });
  const published = field(form, 'published', 'Published');
  published.type = 'checkbox';
  published.checked = post.published || false;
  const imagePreview = element('img');
  imagePreview.className = 'asset-preview';
  const refresh = () => {
    const src = form.elements.cover.value;
    imagePreview.hidden = !src;
    if (src) imagePreview.src = src.startsWith('https:') ? src : '/' + src;
  };
  refresh();
  form.elements.cover.oninput = refresh;
  form.append(
    imagePreview,
    action('Choose cover from library', () =>
      selectLibraryImage((item) => {
        form.elements.cover.value = item.src;
        refresh();
      }),
    ),
  );
  const upload = element('input');
  upload.type = 'file';
  upload.accept = 'image/jpeg,image/png,image/webp,image/avif';
  upload.setAttribute('aria-label', 'Upload article cover');
  upload.onchange = run(async () => {
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      form.elements.cover.value = (await uploadAsset(upload.files[0])).secure_url;
      refresh();
    } finally {
      button.disabled = false;
    }
  });
  form.append(upload);
  saveButton(form);
  form.append(
    action('Preview unsaved article', () =>
      previewPost({
        title: form.elements.title.value,
        excerpt: form.elements.excerpt.value,
        body: form.elements.body.value,
      }),
    ),
  );
}
