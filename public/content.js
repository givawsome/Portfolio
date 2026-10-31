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
    window.portfolioSettings = settings;
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
    if (settings.pageTitle) document.title = settings.pageTitle;
    if (settings.metaDescription !== undefined)
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
  window.portfolioContentReady = fetch('/api/settings', { cache: 'no-store' })
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
