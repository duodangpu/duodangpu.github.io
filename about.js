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
    const link = externalLink('关注 ↗', account.url);
    if (!account.name || !link) continue;
    const row = element('div', 'about-account');
    const identity = element('div', 'about-identity');
    identity.append(element('strong', '', account.name));
    if (account.role) identity.append(element('span', '', account.role));
    row.append(identity, link);
    document.querySelector('#about-accounts').append(row);
    hasContent = true;
  }
  const qrPath = /^media\/[a-zA-Z0-9._-]+$/.test(about?.qr || '') ? about.qr : '';
  const groupLink = externalLink('加入 ↗', about?.groupUrl);
  if (qrPath || groupLink) {
    const group = document.querySelector('#about-group');
    const info = element('div', 'about-group-info');
    info.append(element('h2', '', 'QQ群'));
    info.append(groupLink || element('span', 'pending', '扫码加入'));
    group.append(info);
    if (qrPath) {
      const qr = element('img', 'about-qr');
      qr.src = qrPath; qr.alt = 'QQ群二维码'; qr.width = 160; qr.height = 160;
      group.append(qr);
    }
    hasContent = true;
  }
  document.querySelector('#about-empty').hidden = hasContent;
})();
