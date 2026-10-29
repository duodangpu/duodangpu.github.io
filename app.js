(() => {
  const data = window.SITE_DATA || {works: [], lives: []};
  const works = data.works || [];
  const lives = [...(data.lives || [])].sort((a, b) => b.date.localeCompare(a.date));
  const grid = document.querySelector('#work-grid');
  const filters = document.querySelector('#filters');
  const search = document.querySelector('#search');
  const dialog = document.querySelector('#work-dialog');
  const searchToggle = document.querySelector('.search-toggle');
  let category = '全部';
  let opener;
  const node = (tag, cls, text) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (text != null) element.textContent = text;
    return element;
  };
  const normalized = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
  const matches = value => normalized(value).includes(normalized(search.value));
  const safeUrl = value => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  };
  const link = (label, value, cls) => {
    const href = safeUrl(value);
    if (!href) return null;
    const element = node('a', cls, label);
    element.href = href;
    element.target = '_blank';
    element.rel = 'noopener noreferrer';
    return element;
  };
  function artwork(work) {
    const frame = node('div', 'artwork');
    const fallback = node('span', 'cover-fallback', work.title);
    frame.append(fallback);
    if (/^media\/[a-zA-Z0-9._-]+$/.test(work.cover || '')) {
      const image = node('img');
      image.alt = `${work.title}封面`;
      image.loading = 'lazy';
      image.addEventListener('error', () => image.remove(), {once: true});
      image.addEventListener('load', () => fallback.hidden = true, {once: true});
      image.src = work.cover;
      frame.append(image);
    }
    return frame;
  }
  function tags(work) {
    const row = node('div', 'tags');
    if (work.category) row.append(node('span', '', work.category));
    if (work.progress) row.append(node('span', work.progress === '已完结' ? 'sage' : 'warm', work.progress));
    return row;
  }
  function showWork(work, button) {
    opener = button;
    document.querySelector('#dialog-title').textContent = work.title;
    document.querySelector('#dialog-art').replaceChildren(artwork(work));
    document.querySelector('#dialog-tags').replaceChildren(...tags(work).childNodes);
    const links = document.querySelector('#dialog-links');
    links.replaceChildren();
    for (const [label, url] of [['B站观看 ↗', work.bilibili], ['网盘观看 ↗', work.drive]]) {
      const entry = link(label, url, 'watch-link');
      if (entry) links.append(entry);
    }
    if (!links.childElementCount) links.append(node('span', 'pending', '观看入口待更新'));
    const related = document.querySelector('#related-lives');
    related.replaceChildren();
    const sessions = lives.filter(live => live.programs.some(program => program.workIds?.includes(work.id)));
    if (sessions.length) {
      const fold = node('details', 'related');
      fold.append(node('summary', '', `相关直播 · ${sessions.length}`));
      for (const live of sessions) {
        const row = node('div', 'related-session');
        row.append(node('h3', '', live.title || live.date));
        row.append(link('观看完整回放 ↗', live.replay, 'watch-link') || node('span', 'pending', '回放待更新'));
        const titles = live.programs.filter(program => program.workIds?.includes(work.id)).map(program => program.title);
        row.append(node('p', '', titles.join(' / ')));
        fold.append(row);
      }
      related.append(fold);
    }
    dialog.showModal();
    document.body.classList.add('dialog-open');
  }
  function renderWorks() {
    grid.replaceChildren();
    const found = works.filter(work => (category === '全部' || work.category === category) && matches(work.title));
    document.querySelector('#work-count').textContent = `${found.length} 部作品`;
    document.querySelector('#empty-works').hidden = found.length > 0;
    found.forEach(work => {
      const card = node('article', 'work-card');
      const button = node('button', 'card-open');
      button.type = 'button';
      button.setAttribute('aria-label', `查看 ${work.title}`);
      const body = node('div', 'card-body');
      body.append(node('h2', '', work.title), tags(work));
      button.append(artwork(work), body);
      button.addEventListener('click', () => showWork(work, button));
      card.append(button);
      grid.append(card);
    });
  }
  function renderLives() {
    const list = document.querySelector('#live-list');
    list.replaceChildren();
    let count = 0;
    const query = normalized(search.value);
    lives.forEach(live => {
      const sessionMatch = matches(`${live.title} ${live.date}`);
      const programs = (live.programs || []).filter(program => !query || sessionMatch || matches(program.title));
      if (query && !sessionMatch && !programs.length) return;
      count++;
      const item = node('details', 'live-item');
      const summary = node('summary', 'live-row');
      const name = node('span', 'live-name', live.title === `${live.date} 直播` ? '直播' : live.title || '直播');
      const total = live.programs?.length || 0;
      name.append(node('small', '', `${query && !sessionMatch ? `${programs.length} / ${total}` : total} 个节目 · ${safeUrl(live.replay) ? '回放已更新' : '回放待更新'}`));
      const date = node('time', 'date', live.date.replaceAll('-', '.'));
      date.dateTime = live.date;
      const arrow = node('span', 'arrow');
      arrow.setAttribute('aria-hidden', 'true');
      summary.append(date, name, arrow);
      const content = node('div', 'live-content');
      content.append(link('观看完整回放 ↗', live.replay, 'watch-link') || node('span', 'pending', '回放待更新'));
      const programList = node('ol', 'programs');
      programs.forEach(program => {
        const row = node('li', 'program');
        row.append(node('span', 'program-title', program.title));
        row.append(link('原视频 ↗', program.url, 'program-link') || node('span', 'pending', '原视频待补'));
        programList.append(row);
      });
      content.append(programList);
      item.append(summary, content);
      list.append(item);
    });
    document.querySelector('#live-count').textContent = `${count} 场`;
    document.querySelector('#empty-live').hidden = count > 0;
  }
  const categories = ['全部', ...new Set(works.map(work => work.category).filter(Boolean))];
  categories.forEach(name => {
    const button = node('button', name === category ? 'active' : '', name);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(name === category));
    button.addEventListener('click', () => {
      category = name;
      for (const item of filters.children) {
        const selected = item === button;
        item.classList.toggle('active', selected);
        item.setAttribute('aria-pressed', String(selected));
      }
      renderWorks();
    });
    filters.append(button);
  });
  search.addEventListener('input', () => { renderWorks(); renderLives(); });
  searchToggle.addEventListener('click', () => {
    const expanded = searchToggle.getAttribute('aria-expanded') !== 'true';
    searchToggle.setAttribute('aria-expanded', String(expanded));
    document.querySelector('header').classList.toggle('search-open', expanded);
    if (expanded) search.focus();
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && searchToggle.getAttribute('aria-expanded') === 'true') {
      searchToggle.setAttribute('aria-expanded', 'false');
      document.querySelector('header').classList.remove('search-open');
      searchToggle.focus();
    }
  });
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    opener?.focus();
  });
  const updateNavigation = () => {
    for (const item of document.querySelectorAll('nav a')) {
      const active = item.hash === (location.hash === '#live' ? '#live' : '#works');
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'location');
      else item.removeAttribute('aria-current');
    }
  };
  window.addEventListener('hashchange', updateNavigation);
  updateNavigation();
  renderWorks();
  renderLives();
})();
