(() => {
  'use strict';
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
      );
  let manifest,
    activeSection,
    activeCollection,
    collectionItems = [],
    filteredItems = [],
    query = '',
    page = 1,
    routeToken = 0,
    viewerItems = [],
    viewerIndex = 0,
    viewerCollection = null;
  const icons = {
    'chevron-left':
      '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    'chevron-right':
      '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    plus: '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  };
  const collectionCache = new Map(),
    PAGE_SIZE = 48,
    reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function galleryURL(section, collection) {
    const p = new URLSearchParams({ work: section });
    if (collection) p.set('collection', collection);
    return './?' + p;
  }
  function imageTitle(item) {
    if (item.title) return item.title;
    if (item.name === 'final.jpg') return 'Product study · Light & form';
    if (item.name === 'final2.jpg') return 'Product study · Composition';
    return item.title || item.name;
  }
  function spriteStyle(item) {
    const x = item.cell % item.cols,
      y = Math.floor(item.cell / item.cols);
    return `background-image:url('${item.sheet}');background-size:${item.cols * 100}% ${item.rows * 100}%;background-position:${item.cols === 1 ? 0 : (x / (item.cols - 1)) * 100}% ${item.rows === 1 ? 0 : (y / (item.rows - 1)) * 100}%`;
  }
  function imageMarkup(item, { full = false, eager = false } = {}) {
    if (item.type === 'archive')
      return `<div class="archive-preview" role="img" aria-label="${esc(imageTitle(item))}" style="${spriteStyle(item)}"></div>`;
    return `<img src="${esc(full || item.hd ? item.src : item.thumb || item.src)}" alt="${esc(imageTitle(item))}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  function frameFor(item, c) {
    if (c.frame === 'square')
      return {
        key: 'square',
        label: c.id === 'products' ? 'Product photographs · 1:1' : 'Square · 1:1',
        ratio: 1,
      };
    if (c.frame === 'portrait') return { key: 'portrait', label: 'Portrait · 2:3', ratio: 2 / 3 };
    if (c.frame === 'web') return { key: 'web', label: 'Full-page web designs', ratio: item.ratio };
    const r = item.ratio || 1;
    if (r > 2.3) return { key: 'wide', label: 'Wide banners', ratio: r };
    if (r >= 0.92 && r <= 1.08) return { key: 'square', label: 'Square · 1:1', ratio: 1 };
    if (r < 0.92) {
      const v = r < 0.71 ? 2 / 3 : r < 0.77 ? 3 / 4 : 4 / 5;
      return {
        key: 'portrait-' + v,
        label: 'Portrait · ' + (v === 2 / 3 ? '2:3' : v === 3 / 4 ? '3:4' : '4:5'),
        ratio: v,
      };
    }
    const formats = [
      { v: 4 / 3, l: '4:3' },
      { v: 3 / 2, l: '3:2' },
      { v: 16 / 9, l: '16:9' },
      { v: 2, l: '2:1' },
    ];
    const f = formats.reduce((a, b) => (Math.abs(b.v - r) < Math.abs(a.v - r) ? b : a));
    return { key: 'landscape-' + f.l, label: 'Landscape · ' + f.l, ratio: f.v };
  }
  async function loadCollection(id) {
    if (!collectionCache.has(id)) {
      collectionCache.set(
        id,
        fetch(manifest.collections[id].data)
          .then((r) => {
            if (!r.ok) throw Error('Collection unavailable');
            return r.json();
          })
          .catch((e) => {
            collectionCache.delete(id);
            throw e;
          }),
      );
    }
    return collectionCache.get(id);
  }
  function showError(target, message) {
    target.innerHTML = `<p class="error-message" role="alert">${esc(message)} <button class="small-button" data-retry>Try again</button></p>`;
    target.querySelector('[data-retry]').onclick = () => location.reload();
  }
  function renderNavigation() {
    const nav = $('#category-nav');
    manifest.sections.forEach((s) => {
      const a = document.createElement('a');
      a.href = galleryURL(s.id);
      a.dataset.section = s.id;
      a.textContent = s.title;
      nav.appendChild(a);
    });
  }
  function renderHero() {
    [
      ['product', '#hero-product'],
      ['painting', '#hero-painting'],
      ['character', '#hero-character'],
    ].forEach(([key, selector]) => {
      $(selector).hidden = !manifest.hero?.[key];
      if (manifest.hero?.[key])
        $(selector).innerHTML = imageMarkup(manifest.hero?.[key], { eager: true });
    });
  }
  function renderHome() {
    const container = $('#home-sliders');
    container.innerHTML = '';
    manifest.sections.forEach((s) => {
      const c = manifest.collections[s.featured];
      let previews = c.preview.map((item) => ({ item, collection: c }));
      if (s.id === 'identity' || s.id === 'manga') {
        previews = s.collections
          .slice(0, 3)
          .flatMap((id) =>
            manifest.collections[id].preview
              .slice(0, s.id === 'identity' ? 4 : 2)
              .map((item) => ({ item, collection: manifest.collections[id] })),
          )
          .slice(0, 8);
      }
      const section = document.createElement('section');
      section.className = 'slider-section';
      section.dataset.section = s.id;
      section.setAttribute('aria-label', s.title + ' slider');
      section.innerHTML = `<div class="slider-heading"><div><h3>${esc(s.title)}</h3><p>${esc(s.subtitle)}</p></div><div class="slider-tools"><a class="see-more" href="${galleryURL(s.id, c.id)}" data-section="${s.id}" data-collection="${c.id}" aria-label="See more ${esc(s.title)}">See More</a><button class="slider-arrow" data-direction="-1" aria-label="Previous ${esc(s.title)} images">${icons['chevron-left']}</button><button class="slider-arrow" data-direction="1" aria-label="Next ${esc(s.title)} images">${icons['chevron-right']}</button></div></div>`;
      const rail = document.createElement('div');
      rail.className = 'image-rail';
      rail.setAttribute('aria-label', s.title + ' selected images');
      previews.forEach(({ item, collection }) => {
        const button = document.createElement('button');
        button.className =
          'rail-item ' +
          (['square', 'portrait', 'web'].includes(collection.frame) ? collection.frame : 'natural');
        button.style.setProperty('--ratio', item.ratio || 1);
        button.setAttribute('aria-label', 'View ' + imageTitle(item));
        button.innerHTML = `<div class="rail-media">${imageMarkup(item)}</div><div class="image-caption"><span>${esc(imageTitle(item))}</span></div>`;
        button.onclick = async () => {
          try {
            const all = await loadCollection(collection.id);
            openViewer(
              all,
              all.findIndex((x) => x.id === item.id),
              collection,
            );
          } catch {
            showError(section, 'This image could not load. Please try again.');
          }
        };
        rail.appendChild(button);
      });
      section.appendChild(rail);
      const count = s.collections.reduce((n, id) => n + manifest.collections[id].count, 0);
      const footer = document.createElement('div');
      footer.className = 'rail-footer';
      footer.innerHTML = `<span>${s.id === 'archive' ? 'OPTIMIZED ARCHIVE PREVIEWS' : c.method === 'AI-assisted' ? 'AI-ASSISTED WORK' : c.method === 'Photoshop' ? 'PHOTOSHOP / DESIGN' : 'SELECTED IMAGES'}</span><span>${count.toLocaleString()} ${count === 1 ? 'IMAGE' : 'IMAGES'} IN THE FULL COLLECTION</span>`;
      section.appendChild(footer);
      container.appendChild(section);
      const buttons = section.querySelectorAll('[data-direction]');
      const sync = () => {
        buttons[0].disabled = rail.scrollLeft < 2;
        buttons[1].disabled = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2;
      };
      buttons.forEach(
        (b) =>
          (b.onclick = () => {
            rail.scrollBy({
              left:
                Number(b.dataset.direction) *
                ((rail.querySelector('.rail-item')?.getBoundingClientRect().width || 200) + 18),
              behavior: reduceMotion() ? 'instant' : 'smooth',
            });
          }),
      );
      rail.addEventListener('scroll', sync, { passive: true });
      new ResizeObserver(sync).observe(rail);
      requestAnimationFrame(sync);
    });
  }
  function navigate(section, collection, { replace = false } = {}) {
    const url = galleryURL(section, collection);
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    applyRoute(true);
  }
  function goHome(anchor = '') {
    history.pushState({}, '', './' + (anchor ? '#' + anchor : ''));
    applyRoute(true);
  }
  function scrollToElement(element, focus = false) {
    requestAnimationFrame(() => {
      const top =
        element.getBoundingClientRect().top +
        scrollY -
        document.querySelector('.site-header').getBoundingClientRect().height -
        24;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'instant' : 'smooth' });
      if (focus) element.focus({ preventScroll: true });
    });
  }
  async function applyRoute(scroll = false) {
    const token = ++routeToken,
      p = new URLSearchParams(location.search),
      s = manifest.sections.find((x) => x.id === p.get('work'));
    document.querySelectorAll('[data-section]').forEach((a) => {
      if (a.closest('#category-nav'))
        a.setAttribute('aria-current', a.dataset.section === s?.id ? 'page' : 'false');
    });
    if (!s) {
      activeSection = null;
      activeCollection = null;
      $('#home-view').hidden = false;
      $('#gallery-view').hidden = true;
      document.title =
        window.portfolioSettings?.pageTitle || 'Rajneesh Vaishnav — Design, Photography & AI';
      if (scroll) {
        const anchor = location.hash.slice(1);
        if (anchor && document.getElementById(anchor))
          scrollToElement(document.getElementById(anchor));
        else window.scrollTo({ top: 0, behavior: 'instant' });
      }
      return;
    }
    activeSection = s;
    $('#gallery-view').dataset.section = s.id;
    const id = s.collections.includes(p.get('collection')) ? p.get('collection') : s.featured;
    activeCollection = manifest.collections[id];
    query = '';
    page = 1;
    $('#gallery-search').value = '';
    $('#home-view').hidden = true;
    $('#gallery-view').hidden = false;
    $('#gallery-title').textContent = s.title;
    $('#gallery-subtitle').textContent = s.subtitle;
    document.title = s.title + ' — ' + (window.portfolioSettings?.brandName || 'Rajneesh Vaishnav');
    $('#breadcrumbs').innerHTML =
      `<a href="./#work" data-home-anchor="work">All work</a><span aria-hidden="true">/</span><span>${esc(s.title)}</span>`;
    renderCollectionPicker();
    $('#collection-method').textContent = activeCollection.method;
    $('#collection-note').textContent = activeCollection.note;
    $('#gallery-content').innerHTML =
      '<p class="loading-message" role="status">Opening the collection…</p>';
    $('#pagination').innerHTML = '';
    $('#gallery-count').textContent = '';
    if (scroll) scrollToElement($('#gallery-title'), true);
    try {
      const items = await loadCollection(id);
      if (token !== routeToken) return;
      collectionItems = items;
      renderGallery();
    } catch {
      if (token === routeToken)
        showError($('#gallery-content'), 'This collection could not load. Please try again.');
    }
  }
  function renderCollectionPicker() {
    const el = $('#collection-picker');
    el.innerHTML = '';
    if (activeSection.collections.length < 2) return;
    if (activeSection.collections.length > 6) {
      const label = document.createElement('label');
      label.className = 'character-select-label';
      label.textContent = 'Choose a character or story';
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Choose a character or story');
      activeSection.collections.forEach((id) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent =
          manifest.collections[id].title + ' (' + manifest.collections[id].count + ')';
        option.selected = id === activeCollection.id;
        select.appendChild(option);
      });
      select.onchange = () => navigate(activeSection.id, select.value);
      label.appendChild(select);
      el.appendChild(label);
    } else {
      const tabs = document.createElement('nav');
      tabs.className = 'collection-tabs';
      tabs.setAttribute('aria-label', activeSection.title + ' collections');
      activeSection.collections.forEach((id) => {
        const c = manifest.collections[id],
          a = document.createElement('a');
        a.href = galleryURL(activeSection.id, id);
        a.dataset.section = activeSection.id;
        a.dataset.collection = id;
        a.setAttribute('aria-current', id === activeCollection.id ? 'page' : 'false');
        a.textContent = c.title + ' (' + c.count + ')';
        tabs.appendChild(a);
      });
      el.appendChild(tabs);
    }
  }
  function renderGallery() {
    filteredItems = collectionItems.filter(
      (x) =>
        !query ||
        (imageTitle(x) + ' ' + x.name + ' ' + x.path + ' ' + x.group)
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    const pages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
    page = Math.min(page, pages);
    const start = (page - 1) * PAGE_SIZE,
      chunk = filteredItems.slice(start, start + PAGE_SIZE);
    $('#gallery-count').textContent = filteredItems.length
      ? `${start + 1}–${Math.min(start + PAGE_SIZE, filteredItems.length)} of ${filteredItems.length.toLocaleString()} images`
      : 'No matching images';
    const content = $('#gallery-content');
    content.innerHTML = '';
    if (!chunk.length) {
      content.innerHTML = '<p class="empty-message">No matching images. Try a different name.</p>';
      $('#pagination').innerHTML = '';
      return;
    }
    const groups = new Map();
    chunk.forEach((item, i) => {
      const format = frameFor(item, activeCollection);
      if (!groups.has(format.key)) groups.set(format.key, { format, items: [] });
      groups.get(format.key).items.push({ item, index: start + i });
    });
    groups.forEach(({ format, items }) => {
      const section = document.createElement('section');
      section.className = 'format-section';
      section.innerHTML = `<div class="format-heading"><h2>${esc(format.label)}</h2><span>${items.length} ${items.length === 1 ? 'image' : 'images'}</span></div>`;
      const grid = document.createElement('div');
      grid.className =
        'gallery-grid ' +
        (format.key.startsWith('landscape')
          ? 'landscape'
          : format.key === 'wide'
            ? 'wide'
            : format.key === 'web'
              ? 'web'
              : '');
      items.forEach(({ item, index }) => {
        const button = document.createElement('button');
        button.className = 'gallery-item';
        button.setAttribute('aria-label', 'View ' + imageTitle(item));
        button.innerHTML = `<div class="gallery-media" style="--ratio:${format.key === 'web' || format.key === 'wide' ? item.ratio : format.ratio}">${imageMarkup(item)}</div><div class="image-caption"><span>${esc(imageTitle(item))}</span></div>`;
        button.onclick = () => openViewer(filteredItems, index, activeCollection);
        grid.appendChild(button);
      });
      section.appendChild(grid);
      content.appendChild(section);
    });
    renderPagination(pages);
  }
  function renderPagination(pages) {
    const el = $('#pagination');
    el.innerHTML = '';
    if (pages < 2) return;
    const previous = document.createElement('button');
    previous.className = 'small-button';
    previous.textContent = 'Previous';
    previous.disabled = page === 1;
    previous.onclick = () => setPage(page - 1);
    const label = document.createElement('label');
    label.textContent = 'Page ';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 1;
    input.max = pages;
    input.value = page;
    input.setAttribute('aria-label', 'Go to page');
    input.onchange = () => setPage(Math.max(1, Math.min(pages, Number(input.value) || 1)));
    label.append(input, ' of ' + pages);
    const next = document.createElement('button');
    next.className = 'small-button';
    next.textContent = 'Next';
    next.disabled = page === pages;
    next.onclick = () => setPage(page + 1);
    el.append(previous, label, next);
  }
  function setPage(value) {
    page = value;
    renderGallery();
    scrollToElement($('#gallery-title'));
  }
  function openViewer(items, index, c) {
    dismissWelcome();
    if (index < 0 || !items[index]) return;
    viewerItems = items;
    viewerIndex = index;
    viewerCollection = c;
    renderViewer();
    const d = $('#image-viewer');
    if (!d.open) {
      d.showModal();
      document.body.classList.add('modal-open');
    }
    d.scrollTop = 0;
  }
  function renderViewer() {
    const item = viewerItems[viewerIndex];
    $('#viewer-collection').textContent =
      viewerCollection.title +
      ' / ' +
      (item.name.startsWith('ChatGPT') ? 'AI-assisted' : viewerCollection.method);
    $('#viewer-title').textContent = imageTitle(item);
    $('#viewer-position').textContent = viewerIndex + 1 + ' / ' + viewerItems.length;
    $('#viewer-previous').disabled = viewerIndex === 0;
    $('#viewer-next').disabled = viewerIndex === viewerItems.length - 1;
    const original = $('#viewer-original');
    original.hidden = item.type === 'archive';
    if (!original.hidden) {
      original.href = item.original || item.src;
      original.textContent = item.original ? 'Open original PDF' : 'Open full file';
    }
    const media = $('#viewer-media');
    media.innerHTML =
      item.type === 'archive'
        ? `<div class="viewer-archive" role="img" aria-label="${esc(imageTitle(item))}" style="${spriteStyle(item)}"></div>`
        : `<img class="full-image" src="${esc(item.src)}" alt="${esc(imageTitle(item))}">`;
    $('#viewer-caption').textContent =
      (item.type === 'archive' ? 'Optimized archive preview · ' : '') +
      item.name +
      (item.width ? ' · Original ' + item.width + ' × ' + item.height + ' px' : '');
    $('#image-viewer').scrollTop = 0;
  }
  $('#viewer-previous').onclick = () => {
    if (viewerIndex > 0) {
      viewerIndex--;
      renderViewer();
    }
  };
  $('#viewer-next').onclick = () => {
    if (viewerIndex < viewerItems.length - 1) {
      viewerIndex++;
      renderViewer();
    }
  };
  $('#close-viewer').onclick = () => $('#image-viewer').close();
  $('#start-project').onclick = () => {
    dismissWelcome();
    $('#brief-dialog').showModal();
    document.body.classList.add('modal-open');
  };
  $('#close-brief').onclick = () => $('#brief-dialog').close();
  document.querySelectorAll('dialog').forEach((d) => {
    d.addEventListener('close', () => {
      document.body.classList.remove('modal-open');
      if (d.id === 'image-viewer') $('#viewer-media').innerHTML = '';
    });
    d.addEventListener('click', (e) => {
      const r = d.getBoundingClientRect();
      if (
        e.target === d &&
        (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
      )
        d.close();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#image-viewer').open || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft' && viewerIndex > 0) {
      e.preventDefault();
      viewerIndex--;
      renderViewer();
    }
    if (e.key === 'ArrowRight' && viewerIndex < viewerItems.length - 1) {
      e.preventDefault();
      viewerIndex++;
      renderViewer();
    }
  });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (a.dataset.section && manifest) {
      e.preventDefault();
      navigate(a.dataset.section, a.dataset.collection);
      return;
    }
    if (a.hasAttribute('data-home')) {
      e.preventDefault();
      goHome();
      return;
    }
    if (a.dataset.homeAnchor) {
      e.preventDefault();
      goHome(a.dataset.homeAnchor);
    }
  });
  $('#gallery-search').addEventListener('input', (e) => {
    query = e.target.value;
    page = 1;
    renderGallery();
  });
  $('#project-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      button = f.querySelector('button[type=submit]'),
      status = document.getElementById('inquiry-status');
    button.disabled = true;
    status.textContent = 'Sending…';
    try {
      const body = Object.fromEntries(new FormData(f));
      const r = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || 'Please try again');
      status.textContent = 'Thank you. Your enquiry has been received.';
      f.reset();
    } catch (error) {
      status.textContent = error.message + ' You can also email me directly.';
    } finally {
      button.disabled = false;
    }
  };
  $('#year').textContent = new Date().getFullYear();
  new ResizeObserver((entries) => {
    document.documentElement.style.setProperty(
      '--header-height',
      Math.ceil(entries[0].target.getBoundingClientRect().height) + 'px',
    );
  }).observe($('.site-header'));
  window.addEventListener('popstate', () => {
    if (manifest) applyRoute(true);
  });
  fetch('/api/portfolio')
    .then((r) => {
      if (!r.ok) throw Error('Portfolio unavailable');
      return r.json();
    })
    .then((data) => {
      manifest = data;
      renderNavigation();
      renderHero();
      renderHome();
      applyRoute(false);
      if (location.hash && !location.search)
        setTimeout(() => {
          const el = document.getElementById(location.hash.slice(1));
          if (el) scrollToElement(el);
        }, 100);
    })
    .catch(() => showError($('#home-sliders'), 'The portfolio could not load. Please try again.'));
  // A non-blocking welcome card appears once per visit, never over an active viewer.
  const welcome = document.getElementById('welcome-popup');
  let welcomeCloseTimer,
    welcomeDismissed = false;
  function dismissWelcome() {
    welcomeDismissed = true;
    welcome.hidden = true;
    clearTimeout(welcomeCloseTimer);
  }
  document.getElementById('close-welcome').onclick = dismissWelcome;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismissWelcome();
  });
  function openWelcome() {
    if (welcomeDismissed) return;
    if (document.querySelector('dialog[open]')) {
      setTimeout(openWelcome, 1000);
      return;
    }
    welcome.hidden = false;
    welcomeCloseTimer = setTimeout(
      dismissWelcome,
      (window.portfolioSettings?.welcomeDuration ?? 15) * 1000,
    );
  }
  window.portfolioContentReady.then((settings) => {
    if (settings.welcomeEnabled !== false)
      setTimeout(openWelcome, (settings.welcomeDelay ?? 5) * 1000);
  });
})();
