const app = document.querySelector('#app');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shows = (window.SHOW_DATA || []).filter(show => show.published);
function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function cover(show, className = '') {
  const url = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(show.cover || '') ? show.cover : safeUrl(show.cover);
  return `<div class="cover ${className}">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(show.title)}封面" loading="lazy" onerror="this.hidden=true">` : ''}<span class="cover-fallback">暂无封面</span></div>`;
}
function render() {
  let id = '';
  if (location.hash.startsWith('#/')) { try { id = decodeURIComponent(location.hash.slice(2)); } catch { id = location.hash.slice(2); } }
  const show = shows.find(item => item.id === id);
  if (id && !show) { app.innerHTML = '<section class="empty"><h1>没有找到这部剧</h1><a href="#/">返回片单</a></section>'; return; }
  if (show) {
    const links = [['bilibili','bilibiliStatus','B站观看 Reaction','前往 Reaction 视频合集'],['drive','driveStatus','网盘观看 Reaction','打开 Reaction 网盘链接']].map(([key,status,title,sub]) => {
      const url = safeUrl(show[key]);
      return url && (!show[status] || show[status] === 'available') ? `<a class="link-row" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span><strong>${title}</strong><small>${sub}</small></span><span class="arrow">↗</span></a>` : '';
    }).join('');
    app.innerHTML = `<div class="detail-wrap"><a class="back" href="#/">← 返回全部资源</a><section class="detail">${cover(show,'detail-cover')}<div class="detail-info"><h1>${escapeHtml(show.title)}</h1><p>分类：${escapeHtml(show.category || '其他')}</p><p>更新进度：${escapeHtml(show.progress || '待更新')}</p><p class="description">${escapeHtml(show.description || '暂无简介')}</p><h2>观看方式</h2><div class="links">${links || '<p class="no-links">暂无可用链接</p>'}</div></div></section></div>`;
    return;
  }
  const categories = ['影视剧', '电影', '综艺', '动漫', '其他'];
  app.innerHTML = `<div class="library"><h1>Reaction 视频资源</h1><label for="search">搜索作品名称</label><input id="search" type="search" placeholder="输入作品名称"><nav class="category-nav" aria-label="资源分类">${categories.map((category,index) => `<a href="#category-${index}">${category}</a>`).join('')}</nav><div id="results"></div></div>`;
  const draw = () => { const query = document.querySelector('#search').value.trim().toLocaleLowerCase(); document.querySelector('#results').innerHTML = categories.map((category,index) => { const items = shows.filter(item => { const type = ['剧情', '剧集', '电视剧'].includes(item.category) ? '影视剧' : item.category; return (category === '其他' ? !categories.slice(0,4).includes(type) : type === category) && String(item.title || '').toLocaleLowerCase().includes(query); }); return `<section class="category" id="category-${index}"><h2>${category} <small>${items.length}</small></h2>${items.length ? `<div class="grid">${items.map(item => `<a class="show-card" href="#/${encodeURIComponent(item.id)}">${cover(item)}<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.progress || '进度待更新')}</p></a>`).join('')}</div>` : `<p class="no-links">${query ? '没有匹配的内容' : '暂无内容'}</p>`}</section>`; }).join(''); };
  document.querySelector('#search').addEventListener('input', draw);
  draw();
}
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#category-')) render(); });
render();
