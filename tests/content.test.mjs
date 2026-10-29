import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {sanitize, serialize, fromNotion, queryAll, notionRequest} from '../scripts/content.mjs';
import {root, downloadCover} from '../scripts/build.mjs';

const snapshot = JSON.parse(await readFile(join(root, 'public-snapshot.json'), 'utf8'));
test('public output uses an allowlist, validates links, dates and relations', () => {
  const input = structuredClone(snapshot);
  input.secret = 'private';
  input.works[0].description = 'private';
  input.lives[0].programs[0].recommender = 'private@example.com';
  const data = sanitize(input);
  assert(!JSON.stringify(data).includes('private'));
  assert.equal(data.lives[0].programs.length, 18);
  assert.equal(data.lives[0].programs.filter(p => p.url).length, 17);
  input.works[0].bilibili = 'javascript:alert(1)';
  assert.throws(() => sanitize(input), /链接/);
  input.works[0].bilibili = 'https://user:password@example.com/';
  assert.throws(() => sanitize(input), /链接/);
  input.works[0].bilibili = '';
  input.works[0].cover = '../private.txt';
  assert.throws(() => sanitize(input), /封面/);
  input.works[0].cover = '';
  input.lives[0].date = '2026-02-30';
  assert.throws(() => sanitize(input), /日期/);
  input.lives[0].date = '2026-10-28';
  input.lives[0].programs[0].workIds = ['missing'];
  assert.throws(() => sanitize(input), /关联/);
});
test('pagination reads all pages and rejects incomplete or repeating cursors', async () => {
  const bodies = [];
  const rows = await queryAll('source', async (path, body) => {
    assert.equal(path, '/data_sources/source/query');
    bodies.push(body);
    return body.start_cursor ? {results: [{id:'b'}], has_more: false} : {results: [{id:'a'}], has_more: true, next_cursor:'next'};
  });
  assert.deepEqual(rows.map(row => row.id), ['a', 'b']);
  assert.equal(bodies[1].start_cursor, 'next');
  await assert.rejects(queryAll('source', async () => ({results:[], has_more:true})), /游标/);
  await assert.rejects(queryAll('source', async () => ({results:[], has_more:true, next_cursor:'same'})), /游标/);
});
const field = (type, value) => ({type, [type]: value});
const rich = value => [{plain_text: value}];
function notionFixture() {
  return {works:[{id:'w-1',properties:{'作品名称':field('title',rich('作品')), '封面':field('files',[]),'分类':field('select',{name:'综艺'}),'更新进度':field('rich_text',rich('已完结')),'B站Reaction合集':field('url','https://example.com/collection'),'网盘Reaction链接':field('url',null)}}],lives:[{id:'l-1',properties:{'直播场次':field('title',rich('直播')),'直播日期':field('date',{start:'2026-10-28'}),'B站回放':field('url',null)}}],programs:[{id:'p-1',properties:{'视频标题':field('title',rich('节目')),'所属直播':field('relation',[{id:'l-1'}]),'关联作品':field('relation',[{id:'w-1'}]),'原视频':field('url','https://example.com/original'),'约时长（分钟）':field('number',5),'表内顺序':field('number',1),'推荐人':field('rich_text',rich('不公开'))}}]};
}
test('Notion progress supports select and legacy text fields', () => {
  const raw = notionFixture();
  assert.equal(fromNotion(raw).data.works[0].progress, '已完结');
  raw.works[0].properties['更新进度'] = field('select', {name:'更新中'});
  assert.equal(fromNotion(raw).data.works[0].progress, '更新中');
  raw.works[0].properties['更新进度'] = field('select', null);
  assert.equal(fromNotion(raw).data.works[0].progress, '');
  raw.works[0].properties['更新进度'] = field('number', 1);
  assert.throws(() => fromNotion(raw), /更新进度/);
});
test('Notion conversion requires valid schema and explicit relationships, omits private fields', () => {
  const raw = notionFixture();
  raw.works.push({...structuredClone(raw.works[0]), id:'archived', archived:true});
  const {data} = fromNotion(raw);
  assert.equal(data.works.length, 1);
  assert.deepEqual(data.lives[0].programs[0].workIds, ['w1']);
  assert(!JSON.stringify(data).includes('不公开'));
  raw.programs[0].properties['所属直播'].has_more = true;
  assert.throws(() => fromNotion(raw), /关联不完整/);
  delete raw.programs[0].properties['所属直播'].has_more;
  raw.programs[0].properties['所属直播'].relation = [{id:'unavailable'}];
  assert.throws(() => fromNotion(raw), /可用直播/);
  raw.programs[0].properties['所属直播'].relation = [{id:'l-1'}];
  delete raw.works[0].properties['B站Reaction合集'];
  assert.throws(() => fromNotion(raw), /字段/);
});
test('API retries rate limits and fails without leaking response or token', async () => {
  let calls = 0;
  const waits = [];
  const request = notionRequest('secret-token', async () => ++calls === 1 ? new Response('', {status:429,headers:{'retry-after':'1'}}) : Response.json({results:[]}), async ms => waits.push(ms));
  assert.deepEqual(await request('/test',{}), {results:[]});
  assert.deepEqual(waits,[1000]);
  const denied = notionRequest('secret-token', async () => new Response('secret-token private error', {status:403}));
  await assert.rejects(denied('/test',{}), error => /403/.test(error.message) && !/secret-token|private error/.test(error.message));
});
test('script serialization cannot terminate a script element', () => {
  const input = structuredClone(snapshot);
  input.works[0].title = '</script><img src=x onerror=alert(1)>\u2028';
  const script = serialize(sanitize(input));
  assert(!script.includes('</script>'));
  assert(!script.includes('\u2028'));
  assert(script.includes('\\u003c'));
});
test('cover downloader checks MIME and actual signature', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duodangpu-cover-'));
  await mkdir(join(dir,'media'));
  try {
    const cover = {id:'w1',url:'https://example.com/image'};
    await assert.rejects(downloadCover(cover,dir,async () => new Response('<html>',{headers:{'content-type':'image/jpeg'}})), /文件内容/);
    await assert.rejects(downloadCover(cover,dir,async () => new Response('',{headers:{'content-type':'text/html'}})), /图片/);
    await assert.rejects(downloadCover(cover,dir,async () => new Response('',{headers:{'content-type':'image/jpeg','content-length':21*1024*1024}})), /20MB/);
    const path = await downloadCover(cover,dir,async () => new Response(new Uint8Array([255,216,255,217]),{headers:{'content-type':'image/jpeg'}}));
    assert.equal(path,'media/w1.jpg');
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('failed live sync preserves the previous built site', async () => {
  const before = await readFile(join(root,'dist/data.js'),'utf8');
  const env = {...process.env};
  delete env.NOTION_TOKEN;
  const result = spawnSync(process.execPath,['scripts/build.mjs','--notion'],{cwd:root,env,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/NOTION_TOKEN/);
  assert.equal(await readFile(join(root,'dist/data.js'),'utf8'),before);
});
