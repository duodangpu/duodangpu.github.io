import {customPinyin, pinyin} from 'pinyin-pro';

// The only fields that may leave the content pipeline are listed explicitly here.
customPinyin({'甄嬛传': 'zhēn xuán zhuàn'});
export const sources = {
  works: '71db1319-0f9c-4810-8af2-092a12208e26',
  lives: 'ba72d37d-0691-48a5-9ffa-f622354b0a9d',
  programs: 'a5df2d9c-6e1e-4434-82d2-39b282df57a6'
};
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
    return {id: cleanId(work.id), title: title(work.title), category: string(work.category), progress: string(work.progress), bilibili: safeUrl(work.bilibili), drive: safeUrl(work.drive), cover};
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
  return {verifiedOn: dateOnly(input.verifiedOn), works, lives};
}
export function serialize(data) {
  const index = title => [pinyin(title, {toneType: 'none'}), pinyin(title, {pattern: 'first', toneType: 'none'})];
  const indexed = {...data, works: data.works.map(work => ({...work, searchPinyin: index(work.title)})), lives: data.lives.map(live => ({...live, searchPinyin: index(live.title), programs: live.programs.map(program => ({...program, searchPinyin: index(program.title)}))}))};
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
    return {id, title: text(required(p, '作品名称', 'title')), category: required(p, '分类', 'select').select?.name || '', progress: progress.type === 'select' ? progress.select?.name || '' : text(progress), bilibili: required(p, 'B站Reaction合集', 'url').url, drive: required(p, '网盘Reaction链接', 'url').url, cover: ''};
  });
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
export function notionRequest(token, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!token) fail('缺少 NOTION_TOKEN，无法从 Notion 同步；请在 GitHub Actions Secrets 配置。');
  return async (path, body) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetcher(`https://api.notion.com/v1${path}`, {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: AbortSignal.timeout(30000)});
      if (response.ok) return response.json();
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const delay = Number(response.headers.get('retry-after')) || 2 ** attempt;
        await wait(Math.min(Math.max(delay, 1), 30) * 1000);
      } else fail(`Notion 同步失败（HTTP ${response.status}），保留已发布版本。请检查集成权限。`);
    }
  };
}
