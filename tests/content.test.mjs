import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import sharp from 'sharp';
import {sanitize, serialize, fromNotion, parseAbout, parseWorkVideos, queryAll, getAllBlocks, notionRequest} from '../scripts/content.mjs';
import {root, downloadCover} from '../scripts/build.mjs';

const snapshot = JSON.parse(await readFile(join(root, 'public-snapshot.json'), 'utf8'));
test('series reads only explicit video list with one safe link per item', () => {
  const rich = (content, url) => [{plain_text: content, href: url}];
  const heading = content => ({type:'heading_2', heading_2:{rich_text:rich(content)}});
  const item = (content, url) => ({type:'bulleted_list_item', bulleted_list_item:{rich_text:rich(content,url)}});
  assert.deepEqual(parseWorkVideos([item('private','https://example.com/private'), heading('视频列表'), item('歌曲','https://example.com/video'), heading('备注'), item('private','https://example.com/private')]), [{title:'歌曲',url:'https://example.com/video'}]);
  assert.throws(() => parseWorkVideos([heading('视频列表'),item('歌曲','javascript:alert(1)')]), /链接/);
  assert.throws(() => parseWorkVideos([heading('视频列表'),item('歌曲')]), /链接/);
});
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
test('about page only exposes named sections and validates links', async () => {
  const heading = value => ({type:'heading_2',heading_2:{rich_text:rich(value)}});
  const paragraph = value => ({type:'paragraph',paragraph:{rich_text:rich(value)}});
  const blocks = [heading('简介'),paragraph('简介内容：一起看'),heading('QQ群'),paragraph('加入链接：'),{type:'image',image:{type:'file',file:{url:'https://example.com/temporary'}}},heading('B站账号一'),paragraph('账号名称：多多'),paragraph('主页链接：https://example.com/profile'),paragraph('账号角色：大号'),heading('其他'),paragraph('私密内容')];
  const result = parseAbout(blocks);
  assert.equal(result.about.intro,'一起看');
  assert.equal(result.about.accounts[0].url,'https://example.com/profile');
  const more = parseAbout([heading('B站账号1'),paragraph('账号名称：一'),paragraph('主页链接：https://example.com/1'),heading('B站账号3'),paragraph('账号名称：三'),paragraph('主页链接：https://example.com/3'),heading('小红书账号1'),paragraph('账号名称：小红书'),paragraph('主页链接：https://example.com/xhs'),heading('私人账号'),paragraph('账号名称：不公开')]);
  assert.deepEqual(more.about.accounts.map(account => account.name), ['一', '三', '小红书']);
  assert.deepEqual(more.about.accounts.map(account => account.platform), ['B站', 'B站', '小红书']);
  const image = url => ({type:'image', image:{type:'file',file:{url}}});
  const extended = parseAbout([heading('给观众的一封信'),paragraph('第一段'),paragraph('第二段'),heading('B站账号1'),paragraph('账号名称：一'),image('https://example.com/avatar.png'),heading('打赏'),image('https://example.com/a.png'),image('https://example.com/b.png')]);
  assert.deepEqual(extended.about.letter, ['第一段', '第二段']);
  assert.deepEqual(extended.avatarUrls, ['https://example.com/avatar.png']);
  assert.deepEqual(extended.donationUrls, ['https://example.com/a.png', 'https://example.com/b.png']);
  assert.throws(() => parseAbout([heading('打赏'),image('https://example.com/a.png'),image('https://example.com/b.png'),image('https://example.com/c.png')]), /两张/);
  assert.equal(result.qrUrl,'https://example.com/temporary');
  assert(!JSON.stringify(result.about).includes('私密内容'));
  assert.throws(() => parseAbout([heading('QQ群'),paragraph('加入链接：javascript:alert(1)')]), /链接/);
  const requests = [];
  const pages = await getAllBlocks('about', async path => { requests.push(path); return requests.length === 1 ? {results:[blocks[0]],has_more:true,next_cursor:'next'} : {results:[blocks[1]],has_more:false}; });
  assert.equal(pages.length,2);
  assert.match(requests[1],/start_cursor=next/);
});
function notionFixture() {
  return {works:[{id:'w-1',properties:{'作品名称':field('title',rich('作品')), '封面':field('files',[]),'分类':field('select',{name:'综艺'}),'更新进度':field('rich_text',rich('已完结')),'B站Reaction合集':field('url','https://example.com/collection'),'网盘Reaction链接':field('url',null)}}],lives:[{id:'l-1',properties:{'直播场次':field('title',rich('直播')),'直播日期':field('date',{start:'2026-10-28'}),'B站回放':field('url',null)}}],programs:[{id:'p-1',properties:{'视频标题':field('title',rich('节目')),'所属直播':field('relation',[{id:'l-1'}]),'关联作品':field('relation',[{id:'w-1'}]),'原视频':field('url','https://example.com/original'),'约时长（分钟）':field('number',5),'表内顺序':field('number',1),'推荐人':field('rich_text',rich('不公开'))}}]};
}
test('works follow automatically assigned number descending with unspecified entries last', () => {
  const raw = notionFixture();
  const later = structuredClone(raw.works[0]); later.id = 'w-2'; later.properties['作品编号'] = field('unique_id', {number:20,prefix:null});
  const first = structuredClone(raw.works[0]); first.id = 'w-3'; first.properties['作品编号'] = field('unique_id', {number:1,prefix:null});
  raw.works.push(later, first);
  assert.deepEqual(fromNotion(raw).data.works.map(w => w.id), ['w2', 'w3', 'w1']);
});
test('new works appear first by automatic number without a manual sort field', () => {
  const raw = notionFixture();
  raw.works[0].properties['作品编号'] = field('unique_id', {number: 20});
  const older = structuredClone(raw.works[0]); older.id = 'w-2'; older.properties['作品编号'] = field('unique_id', {number: 1});
  const newer = structuredClone(raw.works[0]); newer.id = 'w-3'; newer.properties['作品编号'] = field('unique_id', {number: 21});
  raw.works.push(older, newer);
  assert.deepEqual(fromNotion(raw).data.works.map(w => w.id), ['w3', 'w1', 'w2']);
});
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
test('public search index includes full pinyin and initials', () => {
  const input = structuredClone(snapshot);
  input.works[0].title = '甄嬛传';
  input.lives[0].programs[0].title = '张杰';
  const data = JSON.parse(serialize(sanitize(input)).slice('window.SITE_DATA = '.length).trim().replace(/;$/, ''));
  assert.deepEqual(data.works[0].searchPinyin, ['zhen xuan zhuan', 'z x z']);
  assert.deepEqual(data.lives[0].programs[0].searchPinyin, ['zhang jie', 'z j']);
});
test('cover downloader checks MIME and actual signature', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'duodangpu-cover-'));
  await mkdir(join(dir,'media'));
  try {
    const cover = {id:'w1',url:'https://example.com/image'};
    await assert.rejects(downloadCover(cover,dir,async () => new Response('<html>',{headers:{'content-type':'image/jpeg'}})), /文件内容/);
    await assert.rejects(downloadCover(cover,dir,async () => new Response('',{headers:{'content-type':'text/html'}})), /图片/);
    await assert.rejects(downloadCover(cover,dir,async () => new Response('',{headers:{'content-type':'image/jpeg','content-length':21*1024*1024}})), /20MB/);
    const input = await sharp({create:{width:1400,height:1000,channels:3,background:'#b5d2c2'}}).jpeg().toBuffer();
    const path = await downloadCover(cover,dir,async () => new Response(input,{headers:{'content-type':'image/jpeg'}}));
    assert.match(path, /^media\/[a-f0-9]{24}\.webp$/);
    const metadata = await sharp(await readFile(join(dir,path))).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 960);
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
