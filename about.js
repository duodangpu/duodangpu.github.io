(() => {
  const about = window.SITE_DATA?.about;
  const validUrl = value => {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
  };
  const element = (tag, className, value) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (value) result.textContent = value;
    return result;
  };
  const externalLink = (label, url) => {
    const href = validUrl(url);
    if (!href) return null;
    const result = element('a', 'watch-link', label);
    result.href = href; result.target = '_blank'; result.rel = 'noopener noreferrer';
    return result;
  };
  let hasContent = false;
  if (about?.intro) {
    const intro = document.querySelector('#about-intro');
    intro.textContent = about.intro; intro.hidden = false; hasContent = true;
  }
  for (const account of about?.accounts || []) {
    const link = externalLink('', account.url);
    if (!account.name || !link) continue;
    link.className = 'about-account';
    link.setAttribute('aria-label', `访问 ${account.name} 的主页`);
    const avatar = element('img', 'about-avatar');
    avatar.src = /^media\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(account.avatar || '') ? account.avatar : 'brand-icon.png?v=2'; avatar.alt = ''; avatar.width = 48; avatar.height = 48;
    const identity = element('div', 'about-identity');
    identity.append(element('strong', '', account.name));
    if (account.role) identity.append(element('span', '', account.role));
    const arrow = element('span', 'about-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
    link.append(avatar, identity, arrow);
    document.querySelector('#about-accounts').append(link);
    hasContent = true;
  }
  const letter = (about?.letter || []).filter(p => typeof p === 'string' && p.trim());
  if (letter.length) {
    const button = document.querySelector('#letter-open');
    const dialog = document.querySelector('#letter-dialog');
    document.querySelector('#letter-content').replaceChildren(...letter.map(p => element('p', '', p)));
    button.hidden = false;
    button.addEventListener('click', () => { dialog.showModal(); document.body.classList.add('dialog-open'); });
    dialog.querySelector('.close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); button.focus(); });
    hasContent = true;
  }
  const donations = (about?.donations || []).filter(path => /^media\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(path));
  if (donations.length) {
    const fold = element('details', 'about-group-fold');
    const summary = element('summary', 'about-group-summary');
    const badge = element('span', 'about-group-icon', '♥'); badge.setAttribute('aria-hidden', 'true');
    const info = element('div', 'about-group-info'); info.append(element('h2', '', '支持我们'));
    const arrow = element('span', 'about-arrow', '＋'); arrow.setAttribute('aria-hidden', 'true');
    summary.append(badge, info, arrow);
    const content = element('div', 'about-group-content');
    donations.forEach((path, i) => { const img = element('img', 'about-qr'); img.src = path; img.alt = `打赏二维码 ${i + 1}`; img.width = 160; img.height = 160; content.append(img); });
    fold.append(summary, content); document.querySelector('#about-donation').append(fold); hasContent = true;
  }
  const qrPath = /^media\/[a-zA-Z0-9._-]+$/.test(about?.qr || '') ? about.qr : '';
  const groupLink = externalLink('加入 ↗', about?.groupUrl);
  if (qrPath || groupLink) {
    const group = document.querySelector('#about-group');
    const info = element('div', 'about-group-info');
    info.append(element('h2', '', '加入 QQ 群'));
    const badge = element('span', 'about-group-icon', 'QQ'); badge.setAttribute('aria-hidden', 'true');
    const fold = element('details', 'about-group-fold');
    const summary = element('summary', 'about-group-summary');
    const arrow = element('span', 'about-arrow', '＋'); arrow.setAttribute('aria-hidden', 'true');
    summary.append(badge, info, arrow); fold.append(summary);
    const content = element('div', 'about-group-content');
    if (qrPath) {
      const qr = element('img', 'about-qr');
      qr.src = qrPath; qr.alt = 'QQ群二维码'; qr.width = 160; qr.height = 160;
      content.append(qr);
    }
    if (groupLink) { groupLink.textContent = '加入 QQ 群 ↗'; content.append(groupLink); }
    fold.append(content); group.append(fold);
    hasContent = true;
  }
  document.querySelector('#about-empty').hidden = hasContent;
})();
