import {customPinyin, pinyin} from 'pinyin-pro';

// The only fields that may leave the content pipeline are listed explicitly here.
customPinyin({'甄嬛传': 'zhēn xuán zhuàn'});
export const sources = {
  works: '66246c87-6826-4ddd-9871-c070164ecb87',
  lives: 'ba72d37d-0691-48a5-9ffa-f622354b0a9d',
  programs: 'a5df2d9c-6e1e-4434-82d2-39b282df57a6'
};
export const aboutPage = '40807982-2892-81cb-b7ed-cce000e01baa';
export const cleanId = value => String(value || '').replaceAll('-', '');
const text = field => (field?.title || field?.rich_text || []).map(part => part.plain_text ?? part.text?.content ?? '').join('');
const fail = message => { throw new Error(message); };
export function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Report the field, never the raw URL or signed query. */ }
  return fail('内容含有无效的网页链接');
}
const string = value => typeof value === 'string' ? value : '';
function title(value) {
  if (!string(value).trim()) fail('内容缺少标题');
  return value.trim();
}
function unique(items, name) {
  if (items.some(item => !item.id) || new Set(items.map(item => item.id)).size !== items.length) fail(`${name} ID 缺失或重复`);
}
function dateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('直播日期无效');
  return value;
}
export function sanitize(input) {
  if (!Array.isArray(input.works) || !Array.isArray(input.lives) || !input.works.length) fail('作品与直播数据结构不完整');
  const works = input.works.map(work => {
    const cover = string(work.cover);
    if (cover && !/^media\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(cover)) fail('封面必须是本地 media 文件');
    return {id: cleanId(work.id), title: title(work.title), category: string(work.category), progress: string(work.progress), bilibili: safeUrl(work.bilibili), drive: safeUrl(work.drive), cover, videos: (work.videos || []).map(video => ({title: title(video.title), url: safeUrl(video.url)}))};
  });
  unique(works, '作品');
  const workIds = new Set(works.map(work => work.id));
  const lives = input.lives.map(live => {
    if (!Array.isArray(live.programs)) fail('节目列表缺失');
    return {id: cleanId(live.id), title: title(live.title), date: dateOnly(live.date), replay: safeUrl(live.replay), programs: live.programs.map(program => {
      const related = [...new Set((program.workIds || []).map(cleanId))];
      if (related.some(id => !workIds.has(id))) fail('节目关联了不存在的作品');
      const minutes = program.minutes;
      const order = program.order;
      if (minutes != null && (!Number.isFinite(minutes) || minutes < 0)) fail('节目时长无效');
      if (order != null && (!Number.isFinite(order) || order < 0)) fail('节目顺序无效');
      return {id: cleanId(program.id), title: title(program.title), url: safeUrl(program.url), minutes: minutes ?? null, order: order ?? null, workIds: related};
    }).sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || a.id.localeCompare(b.id))};
  }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  unique(lives, '直播');
  unique(lives.flatMap(live => live.programs), '节目');
  const rawAbout = input.about;
  let about = null;
  if (rawAbout) {
    const qr = string(rawAbout.qr);
    if (qr && !/^media\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(qr)) fail('QQ群图片必须是本地 media 文件');
    const localImage = value => { const path = string(value); if (path && !/^media\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(path)) fail('图片必须是本地 media 文件'); return path; };
    about = {intro: string(rawAbout.intro), letter: (rawAbout.letter || []).map(string), groupUrl: safeUrl(rawAbout.groupUrl), qr, donations: (rawAbout.donations || []).map(localImage), accounts: (rawAbout.accounts || []).map(account => ({name:string(account.name), platform:['B站', '小红书'].includes(account.platform) ? account.platform : '', url:safeUrl(account.url), role:string(account.role), avatar:localImage(account.avatar)}))};
  }
  return {verifiedOn: dateOnly(input.verifiedOn), works, lives, about};
}
export function parseWorkVideos(blocks) {
  let inVideos = false;
  const videos = [];
  for (const block of blocks) {
    if (['heading_1', 'heading_2', 'heading_3'].includes(block.type)) {
      inVideos = text(block[block.type]).trim() === '视频列表';
      continue;
    }
    if (!inVideos || !['bulleted_list_item', 'numbered_list_item'].includes(block.type)) continue;
    const field = block[block.type];
    const urls = [...new Set((field.rich_text || []).map(part => part.href || part.text?.link?.url).filter(Boolean))];
    if (urls.length !== 1) fail('作品视频列表的每一项需要一个视频链接');
    videos.push({title: title(text(field)), url: safeUrl(urls[0])});
  }
  return videos;
}
export function parseAbout(blocks) {
  const about = {intro:'', letter:[], groupUrl:'', qr:'', donations:[], accounts:[]};
  let section = '';
  let account = null;
  let qrUrl = '';
  const avatarUrls = [];
  const donationUrls = [];
  for (const block of blocks) {
    if (['heading_1', 'heading_2', 'heading_3'].includes(block.type)) {
      section = text(block[block.type]).trim();
      const platform = section.match(/^(B站|小红书)账号(?:[一二三四五六七八九十]+|\d+)$/)?.[1];
      account = platform ? {name:'', platform, url:'', role:'', avatar:''} : null;
      if (account) { about.accounts.push(account); avatarUrls.push(''); }
      continue;
    }
    if (block.type === 'image' && section === 'QQ群') {
      if (qrUrl) fail('关于我们包含多张QQ群图片，请只保留一张');
      qrUrl = safeUrl(block.image?.[block.image.type]?.url);
      if (!qrUrl.startsWith('https://')) fail('QQ群图片必须为 HTTPS 图片');
    }
    if (block.type === 'image' && (account || section === '打赏')) {
      const url = safeUrl(block.image?.[block.image.type]?.url);
      if (!url.startsWith('https://')) fail('关于我们的图片必须为 HTTPS 图片');
      if (account) { if (avatarUrls[avatarUrls.length - 1]) fail('每个账号只能有一张头像'); avatarUrls[avatarUrls.length - 1] = url; }
      else { if (donationUrls.length >= 2) fail('打赏最多支持两张二维码'); donationUrls.push(url); }
    }
    if (block.type !== 'paragraph') continue;
    const pieces = block.paragraph.rich_text || [];
    const line = text(block.paragraph);
    if (section === '给观众的一封信' && line.trim()) about.letter.push(line);
    const value = label => line.startsWith(label + '：') ? line.slice(label.length + 1).trim() : null;
    const linkedValue = label => value(label) === null ? null : (pieces.find(part => part.href)?.href || value(label));
    if (section === '简介' && value('简介内容') !== null) about.intro = value('简介内容');
    if (section === 'QQ群' && linkedValue('加入链接') !== null) about.groupUrl = safeUrl(linkedValue('加入链接'));
    if (account) {
      if (value('账号名称') !== null) account.name = value('账号名称');
      if (value('账号角色') !== null) account.role = value('账号角色');
      if (linkedValue('主页链接') !== null) account.url = safeUrl(linkedValue('主页链接'));
    }
  }
  return {about, qrUrl, avatarUrls, donationUrls};
}
export function serialize(data) {
  const index = title => ({searchPinyin: [pinyin(title, {toneType: 'none'}), pinyin(title, {pattern: 'first', toneType: 'none'})], searchTokens: pinyin(title, {toneType: 'none', type: 'array'})});
  const indexed = {...data, works: data.works.map(work => ({...work, ...index(work.title)})), lives: data.lives.map(live => ({...live, ...index(live.title), programs: live.programs.map(program => ({...program, ...index(program.title)}))}))};
  return `window.SITE_DATA = ${JSON.stringify(indexed).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')};\n`;
}
const required = (properties, name, type) => {
  const field = properties?.[name];
  if (field?.type !== type) fail(`Notion 字段 ${name} 应为 ${type}`);
  return field;
};
const active = pages => pages.filter(page => !page.archived && !page.in_trash);
function relations(field) {
  if (!field) return [];
  if (field.type !== 'relation' || field.has_more) fail('Notion 关联不完整，停止发布');
  return field.relation.map(item => cleanId(item.id));
}
export function fromNotion(raw) {
  const covers = [];
  const works = active(raw.works).map(page => {
    const p = page.properties;
    const id = cleanId(page.id);
    const files = required(p, '封面', 'files').files;
    if (files[0]) {
      const file = files[0];
      const url = safeUrl(file[file.type]?.url);
      if (!url.startsWith('https://')) fail('Notion 封面必须为 HTTPS 图片');
      covers.push({id, url});
    }
    const progress = p['更新进度'];
    if (!progress || !['select', 'rich_text'].includes(progress.type)) fail('Notion 字段 更新进度 应为 select 或 rich_text');
    const number = p['作品编号'];
    if (number && number.type !== 'unique_id') fail('Notion 字段 作品编号 应为 unique_id');
    const numberValue = number?.unique_id?.number ?? null;
    if (numberValue !== null && (!Number.isSafeInteger(numberValue) || numberValue < 0)) fail('作品编号无效');
    return {id, title: text(required(p, '作品名称', 'title')), category: required(p, '分类', 'select').select?.name || '', progress: progress.type === 'select' ? progress.select?.name || '' : text(progress), bilibili: required(p, 'B站Reaction合集', 'url').url, drive: required(p, '网盘Reaction链接', 'url').url, cover: '', number: numberValue};
  });
  works.sort((a, b) => (b.number ?? -Infinity) - (a.number ?? -Infinity));
  const lives = active(raw.lives).map(page => {
    const p = page.properties;
    return {id: cleanId(page.id), title: text(required(p, '直播场次', 'title')), date: required(p, '直播日期', 'date').date?.start?.slice(0, 10), replay: required(p, 'B站回放', 'url').url, programs: []};
  });
  const byId = new Map(lives.map(live => [live.id, live]));
  for (const page of active(raw.programs)) {
    const p = page.properties;
    const parents = relations(required(p, '所属直播', 'relation'));
    if (parents.length !== 1 || !byId.has(parents[0])) fail('节目必须关联一场可用直播');
    byId.get(parents[0]).programs.push({id: cleanId(page.id), title: text(required(p, '视频标题', 'title')), url: required(p, '原视频', 'url').url, minutes: required(p, '约时长（分钟）', 'number').number, order: required(p, '表内顺序', 'number').number, workIds: relations(p['关联作品'])});
  }
  return {data: sanitize({verifiedOn: new Date().toISOString().slice(0, 10), works, lives}), covers};
}
export async function queryAll(id, request) {
  const rows = [];
  const seen = new Set();
  let cursor;
  do {
    const page = await request(`/data_sources/${id}/query`, {page_size: 100, ...(cursor ? {start_cursor: cursor} : {})});
    if (!Array.isArray(page.results)) fail('Notion 返回格式无效');
    rows.push(...page.results);
    if (page.has_more && (!page.next_cursor || seen.has(page.next_cursor))) fail('Notion 分页游标缺失或重复');
    cursor = page.has_more ? page.next_cursor : null;
    seen.add(cursor);
  } while (cursor);
  return rows;
}
export async function getAllBlocks(id, request) {
  const blocks = [];
  const seen = new Set();
  let cursor;
  do {
    const page = await request(`/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(page.results)) fail('Notion 页面格式无效');
    blocks.push(...page.results);
    if (page.has_more && (!page.next_cursor || seen.has(page.next_cursor))) fail('Notion 页面分页游标缺失或重复');
    cursor = page.has_more ? page.next_cursor : null;
    seen.add(cursor);
  } while (cursor);
  return blocks;
}
export function notionRequest(token, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!token) fail('缺少 NOTION_TOKEN，无法从 Notion 同步；请在 GitHub Actions Secrets 配置。');
  return async (path, body) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetcher(`https://api.notion.com/v1${path}`, {method: body === undefined ? 'GET' : 'POST', headers: {Authorization: `Bearer ${token}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)}), signal: AbortSignal.timeout(30000)});
      if (response.ok) return response.json();
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const delay = Number(response.headers.get('retry-after')) || 2 ** attempt;
        await wait(Math.min(Math.max(delay, 1), 30) * 1000);
      } else fail(`Notion 同步失败（HTTP ${response.status}），保留已发布版本。请检查集成权限。`);
    }
  };
}
