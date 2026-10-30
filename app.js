(() => {
  if (location.hash === '#about') { location.replace('about.html'); return; }
  const data = window.SITE_DATA || {works: [], lives: []};
  const works = data.works || [];
  const lives = [...(data.lives || [])].sort((a, b) => b.date.localeCompare(a.date));
  const grid = document.querySelector('#work-grid');
  const filters = document.querySelector('#filters');
  const search = document.querySelector('#search');
  const dialog = document.querySelector('#work-dialog');
  const liveDialog = document.querySelector('#live-dialog');
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
  const matches = (value, pinyin = []) => {
    const query = normalized(search.value);
    const compact = query.replace(/\s+/g, '');
    return normalized(value).includes(query) || (compact && pinyin.some(item => normalized(item).replace(/\s+/g, '').includes(compact)));
  };
  function highlight(element, value, tokens = []) {
    const chars = Array.from(value);
    const query = normalized(search.value);
    if (!query) { element.textContent = value; return; }
    const compact = query.replace(/\s+/g, '');
    let matched = new Set();
    function find(parts, needle) {
      let combined = '';
      const positions = [];
      parts.forEach((part, index) => {
        for (const char of normalized(part).replace(/\s+/g, '')) { combined += char; positions.push(index); }
      });
      const start = combined.indexOf(needle);
      return start < 0 ? new Set() : new Set(positions.slice(start, start + needle.length));
    }
    matched = find(chars, compact);
    if (!matched.size && tokens.length === chars.length) {
      matched = find(tokens, compact);
      if (!matched.size) matched = find(tokens.map(token => Array.from(token)[0] || ''), compact);
    }
    chars.forEach((char, index) => {
      if (matched.has(index)) element.append(node('mark', '', char));
      else element.append(document.createTextNode(char));
    });
  }
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
  function artwork(work, eager = false) {
    const frame = node('div', 'artwork');
    const fallback = node('span', 'cover-fallback', work.title);
    frame.append(fallback);
    if (/^media\/[a-zA-Z0-9._-]+$/.test(work.cover || '')) {
      const image = node('img');
      image.alt = `${work.title}封面`;
      image.loading = eager ? 'eager' : 'lazy';
      image.decoding = 'async';
      if (eager) image.fetchPriority = 'high';
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
    if (!links.childElementCount && !work.videos?.length) links.append(node('span', 'pending', '观看入口待更新'));
    const related = document.querySelector('#related-lives');
    related.replaceChildren();
    if (work.videos?.length) {
      const fold = node('details', 'live-programs');
      fold.append(node('summary', '', `视频列表 · ${work.videos.length}`));
      const list = node('ol', 'programs');
      for (const video of work.videos) {
        const row = node('li', 'program');
        row.append(node('span', 'program-title', video.title));
        row.append(link('B站观看 ↗', video.url, 'program-link') || node('span', 'pending', '链接待更新'));
        list.append(row);
      }
      fold.append(list);
      related.append(fold);
    }
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
    const found = works.filter(work => (category === '全部' || work.category === category) && matches(work.title, work.searchPinyin));
    document.querySelector('#work-count').textContent = `${found.length} 部作品`;
    document.querySelector('#empty-works').hidden = found.length > 0;
    found.forEach((work, index) => {
      const card = node('article', 'work-card');
      const button = node('button', 'card-open');
      button.type = 'button';
      button.setAttribute('aria-label', `查看 ${work.title}`);
      const body = node('div', 'card-body');
      const title = node('h2');
      highlight(title, work.title, work.searchTokens);
      body.append(title, tags(work));
      button.append(artwork(work, index < 4), body);
      button.addEventListener('click', () => showWork(work, button));
      card.append(button);
      grid.append(card);
    });
  }
  function showLive(live, button, programs = live.programs || []) {
    opener = button;
    document.querySelector('#live-dialog-title').textContent = live.title || `${live.date} 直播`;
    document.querySelector('#live-dialog-link').replaceChildren(link('观看完整回放 ↗', live.replay, 'watch-link') || node('span', 'pending', '回放待更新'));
    const fold = liveDialog.querySelector('.live-programs');
    fold.open = false;
    fold.querySelector('summary').textContent = `节目单 · ${programs.length}`;
    const programList = document.querySelector('#live-programs');
    programList.replaceChildren();
    programs.forEach(program => {
      const row = node('li', 'program');
      row.append(node('span', 'program-title', program.title));
      row.append(link('原视频 ↗', program.url, 'program-link') || node('span', 'pending', '原视频待补'));
      programList.append(row);
    });
    liveDialog.showModal();
    document.body.classList.add('dialog-open');
  }
  function renderLives() {
    const list = document.querySelector('#live-list');
    list.replaceChildren();
    let count = 0;
    const query = normalized(search.value);
    lives.forEach(live => {
      const sessionMatch = matches(`${live.title} ${live.date}`, live.searchPinyin);
      const programs = (live.programs || []).filter(program => !query || sessionMatch || matches(program.title, program.searchPinyin));
      if (query && !sessionMatch && !programs.length) return;
      count++;
      const matchedPrograms = query ? (live.programs || []).filter(program => matches(program.title, program.searchPinyin)) : [];
      if (matchedPrograms.length) {
        const group = node('section', 'search-live-group');
        const header = node('div', 'search-live-header');
        const heading = node('h3', 'search-live-date');
        const details = node('button', 'search-live-detail', live.title || `${live.date} 直播`);
        details.type = 'button';
        details.addEventListener('click', () => showLive(live, details));
        heading.append(details);
        header.append(heading, link('观看完整回放 ↗', live.replay, 'program-link') || node('span', 'pending', '回放待更新'));
        group.append(header);
        matchedPrograms.forEach(program => {
          const row = node('div', 'search-program');
          const title = node('span', 'program-title');
          highlight(title, program.title, program.searchTokens);
          row.append(title);
          const actions = node('span', 'search-program-links');
          const original = link('原视频 ↗', program.url, 'program-link');
          if (original) actions.append(original);
          if (!original) actions.append(node('span', 'pending', '原视频待补'));
          row.append(actions);
          group.append(row);
        });
        list.append(group);
        return;
      }
      const item = node('article', 'live-card');
      const button = node('button', 'card-open live-card-button');
      button.type = 'button';
      button.setAttribute('aria-label', `查看 ${live.title || live.date}`);
      const date = node('span', 'live-date', live.date.replaceAll('-', '.'));
      const body = node('div', 'live-card-body');
      const name = node('h3');
      highlight(name, live.title || `${live.date} 直播`, live.searchTokens);
      const total = live.programs?.length || 0;
      const labels = node('div', 'tags');
      labels.append(node('span', '', query && !sessionMatch ? `${programs.length} 个匹配` : `${total} 个节目`), node('span', safeUrl(live.replay) ? 'sage' : 'warm', safeUrl(live.replay) ? '回放已更新' : '回放待更新'));
      body.append(name, labels);
      const arrow = node('span', 'live-card-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
      button.append(date, body, arrow);
      button.addEventListener('click', () => showLive(live, button, programs));
      item.append(button);
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
  for (const panel of [dialog, liveDialog]) {
    panel.querySelector('.close').addEventListener('click', () => panel.close());
    panel.addEventListener('click', event => {
      if (event.target !== panel) return;
      const rect = panel.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) panel.close();
    });
    panel.addEventListener('close', () => {
      document.body.classList.remove('dialog-open');
      opener?.focus();
    });
  }
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
