(async () => {
  const root = document.querySelector('#blog-content'),
    el = (tag, text) => {
      const n = document.createElement(tag);
      if (text !== undefined) n.textContent = text;
      return n;
    };
  const asset = (src) => (src.startsWith('https://') ? src : '/' + src);
  const date = (value) =>
    value
      ? new Date(value).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : '';
  try {
    const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
    if (slug) {
      document.querySelector('#journal-heading').hidden = true;
      const response = await fetch('/api/blog/' + encodeURIComponent(slug), { cache: 'no-store' });
      if (!response.ok)
        throw Error(
          response.status === 404
            ? 'This article is not available.'
            : 'The article could not load.',
        );
      const post = await response.json();
      document.title = post.title + ' · Photography Journal';
      document.querySelector('meta[name=description]').content = post.excerpt;
      root.replaceChildren();
      const article = el('article');
      article.className = 'article';
      const back = el('a', 'All journal entries');
      back.href = '/blog';
      article.append(
        back,
        el('p', date(post.publishedAt) + ' · ' + post.author),
        el('h1', post.title),
        el('p', post.excerpt),
      );
      if (post.cover) {
        const img = el('img');
        img.src = asset(post.cover);
        img.alt = post.coverAlt;
        article.append(img);
      }
      const body = el('div');
      body.className = 'article-body';
      for (const paragraph of post.body.split(/\n\s*\n/)) {
        const match = paragraph.match(/^(#{1,3})\s+(.+)$/);
        body.append(el(match ? 'h' + (match[1].length + 1) : 'p', match ? match[2] : paragraph));
      }
      article.append(body, el('p', (post.tags || []).map((x) => '#' + x).join(' ')));
      root.append(article);
    } else {
      const page = Math.max(1, parseInt(new URLSearchParams(location.search).get('page')) || 1);
      const response = await fetch('/api/blog?page=' + page, { cache: 'no-store' });
      if (!response.ok) throw Error('The journal could not load. Please try again later.');
      const data = await response.json();
      root.replaceChildren();
      root.className = 'post-grid';
      if (!data.items.length)
        root.append(el('p', 'New stories are on their way. Check back soon.'));
      for (const post of data.items) {
        const a = el('a');
        a.className = 'post-card';
        a.href = '/blog/' + post.slug;
        if (post.cover) {
          const img = el('img');
          img.src = asset(post.cover);
          img.alt = post.coverAlt;
          img.loading = 'lazy';
          a.append(img);
        } else {
          const art = el('div', 'Through the lens');
          art.className = 'cover-placeholder';
          a.append(art);
        }
        a.append(
          el('small', date(post.publishedAt)),
          el('h2', post.title),
          el('p', post.excerpt),
          el('span', 'Read story'),
        );
        root.append(a);
      }
      const nav = document.querySelector('#blog-pagination');
      for (const [label, target, show] of [
        ['Previous', page - 1, page > 1],
        ['Next', page + 1, page * 12 < data.total],
      ])
        if (show) {
          const link = el('a', label);
          link.href = '/blog?page=' + target;
          nav.append(link);
        }
    }
  } catch (error) {
    root.replaceChildren(el('p', error.message));
    const retry = el('a', 'Return to journal');
    retry.href = '/blog';
    root.append(retry);
  }
})();
