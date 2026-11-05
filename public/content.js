// Render CMS content with DOM APIs: stored text is never interpreted as HTML.
(() => {
  const node = (tag, text) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function paragraphs(text) {
    const fragment = document.createDocumentFragment();
    String(text)
      .split(/\n\s*\n/)
      .filter(Boolean)
      .forEach((p) => fragment.append(node('p', p)));
    return fragment;
  }
  function apply(settings) {
    if (settings.brandSubtitle === 'VAISHNAV / VISUAL DESIGNER')
      settings.brandSubtitle += ' + PHOTOGRAPHER';
    window.portfolioSettings = settings;
    document.documentElement.dataset.typography = settings.typographyStyle || 'current';
    for (const link of document.querySelectorAll('.wordmark')) {
      const src = (link.closest('.site-footer') ? settings.footerLogo : '') || settings.headerLogo;
      let logo = link.querySelector('.portfolio-logo');
      let caption = link.querySelector('.logo-caption');
      link.classList.toggle('has-logo', !!src);
      link.querySelector('.brand-name').hidden = !!src;
      if (src) {
        if (!logo) {
          logo = node('img');
          logo.className = 'portfolio-logo';
          link.prepend(logo);
        }
        logo.src = src.startsWith('https://') ? src : '/' + src;
        logo.alt = settings.logoAlt || 'Rajneesh Vaishnav';
        if (!caption) {
          caption = node('small');
          caption.className = 'logo-caption';
          link.append(caption);
        }
        caption.textContent = settings.brandSubtitle || 'VISUAL DESIGNER + PHOTOGRAPHER';
      } else {
        logo?.remove();
        caption?.remove();
      }
    }

    for (const el of document.querySelectorAll('[data-content]')) {
      const key = el.dataset.content;
      if (typeof settings[key] === 'string') {
        if (key === 'aboutArtText') {
          el.replaceChildren();
          settings[key].split('\n').forEach((line, index) => {
            if (index) el.append(document.createElement('br'));
            el.append(node(index === 1 ? 'em' : 'span', line));
          });
        } else el.textContent = settings[key];
      }
    }
    for (const link of document.querySelectorAll('[data-contact]')) {
      const src = settings[link.dataset.contact + 'Icon'];
      let icon = link.querySelector('.custom-social-icon');
      if (src) {
        if (!icon) {
          icon = node('img');
          icon.className = 'custom-social-icon';
          icon.alt = '';
          link.prepend(icon);
        }
        icon.src = src.startsWith('https://') ? src : '/' + src;
      } else icon?.remove();
      link.querySelectorAll('svg').forEach((svg) => (svg.style.display = src ? 'none' : ''));
    }
    if (settings.pageTitle && !document.getElementById('portfolio-seo'))
      document.title = settings.pageTitle;
    if (settings.metaDescription !== undefined && !document.getElementById('portfolio-seo'))
      document.querySelector('meta[name=description]').content = settings.metaDescription;
    for (const link of document.querySelectorAll('[data-contact]')) {
      const key = link.dataset.contact,
        value = settings[key];
      if (value === undefined) continue;
      link.hidden = !value;
      if (!value) {
        link.removeAttribute('href');
        continue;
      }
      link.href =
        key === 'email'
          ? 'mailto:' + value
          : key === 'phone'
            ? 'tel:' + value.replace(/ /g, '')
            : value;
      if (['email', 'phone'].includes(key) && link.querySelector('span'))
        link.querySelector('span').textContent = value;
    }
    const image = document.getElementById('about-image');
    image.hidden = !settings.aboutImage;
    if (settings.aboutImage) {
      image.src = settings.aboutImage.startsWith('https://')
        ? settings.aboutImage
        : '/' + settings.aboutImage;
      image.alt = settings.aboutImageAlt || '';
    } else image.removeAttribute('src');
    document.querySelector('.personal-art').hidden = !!settings.aboutImage;
    if (settings.aboutSections) {
      const expanded = document.querySelector('.about-expanded');
      expanded.replaceChildren();
      for (const item of settings.aboutSections)
        expanded.append(node('h3', item.title), paragraphs(item.body));
      document.querySelector('.about-more').hidden = !settings.aboutSections.length;
    }
    if (settings.aboutFacts) {
      const facts = document.querySelector('.about-facts');
      facts.replaceChildren();
      for (const item of settings.aboutFacts) {
        const card = node('div');
        card.append(node('strong', item.title), node('span', item.body));
        facts.append(card);
      }
    }
    if (settings.services) {
      const list = document.querySelector('.service-list');
      list.replaceChildren();
      settings.services.forEach((item, i) => {
        const details = node('details');
        details.open = i === 0;
        const summary = node('summary');
        const symbol = node('b', '＋');
        symbol.setAttribute('aria-hidden', 'true');
        summary.append(
          node('span', String(i + 1).padStart(2, '0')),
          document.createTextNode(' ' + item.title + ' '),
          symbol,
        );
        details.append(summary, node('p', item.body));
        list.append(details);
      });
      const select = document.querySelector('[name=service]');
      select.replaceChildren(
        ...settings.services.map((item) => new Option(item.title, item.title)),
        new Option('A mix of services'),
      );
    }
    if (settings.processSteps) {
      const list = document.querySelector('.process-grid');
      list.replaceChildren();
      for (const item of settings.processSteps) {
        const card = node('article');
        card.append(node('span', item.label), node('h3', item.title), node('p', item.body));
        list.append(card);
      }
    }
  }
  window.applyPortfolioContent = apply;
  const seoNode = document.getElementById('portfolio-seo');
  if (seoNode) {
    const seo = JSON.parse(seoNode.textContent);
    window.applyPortfolioSEO = () => {
      const path = location.pathname.split('/').filter(Boolean);
      const params = new URLSearchParams(location.search);
      const section = path[0] === 'work' ? decodeURIComponent(path[1] || '') : params.get('work');
      const collection =
        path[0] === 'work' ? decodeURIComponent(path[2] || '') : params.get('collection');
      const meta = seo.pages[section + (collection ? '/' + collection : '')] || seo.home;
      document.title = meta.title;
      const update = (selector, value) => {
        const node = document.querySelector(selector);
        if (node) node.setAttribute('content', value);
      };
      update('meta[name=description]', meta.description);
      update('meta[name=robots]', meta.robots);
      for (const [key, value] of Object.entries({
        'og:title': meta.title,
        'og:description': meta.description,
        'og:url': meta.url,
        'og:image': meta.image,
      }))
        update('meta[property="' + key + '"]', value);
      for (const [key, value] of Object.entries({
        'twitter:title': meta.title,
        'twitter:description': meta.description,
        'twitter:image': meta.image,
      }))
        update('meta[name="' + key + '"]', value);
      document.querySelector('link[rel=canonical]').href = meta.url;
      document.getElementById('portfolio-structured-data').textContent = JSON.stringify(
        meta.schema,
      );
    };
    window.applyPortfolioSEO();
  }
  const bootstrap = document.getElementById('portfolio-settings');
  window.portfolioContentReady = (
    bootstrap
      ? Promise.resolve({ ok: true, json: async () => JSON.parse(bootstrap.textContent) })
      : fetch('/api/settings', { cache: 'no-store' })
  )
    .then((r) => {
      if (!r.ok) throw Error('Content unavailable');
      return r.json();
    })
    .then((s) => {
      apply(s);
      return s;
    })
    .catch(() => {
      console.warn('Saved content could not be loaded. Showing the default portfolio.');
      return {};
    });
})();
