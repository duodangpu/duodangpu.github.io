import {mkdir, mkdtemp, readFile, writeFile, copyFile, rename, rm} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join, resolve} from 'node:path';
import {sanitize, serialize, sources, fromNotion, notionRequest, queryAll} from './content.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'};
export async function downloadCover(cover, directory, fetcher = fetch) {
  const response = await fetcher(cover.url, {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`封面下载失败（HTTP ${response.status}）`);
  const ext = types[response.headers.get('content-type')?.split(';')[0].toLowerCase()];
  if (!ext) throw Error('封面不是受支持的图片');
  const max = 20 * 1024 * 1024;
  if (Number(response.headers.get('content-length')) > max) throw Error('封面超过 20MB');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > max) throw Error('封面超过 20MB');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const valid = ext === 'jpg' ? bytes[0] === 0xff && bytes[1] === 0xd8 : ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ext === 'webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' : /^GIF8[79]a/.test(bytes.toString('ascii', 0, 6));
  if (!valid) throw Error('封面文件内容与图片格式不符');
  const path = `media/${cover.id}.${ext}`;
  await writeFile(join(directory, path), bytes);
  return path;
}
export async function build({notion = false} = {}) {
  let data, covers;
  // Fetch and validate before touching the last successful artifact.
  if (notion) {
    const request = notionRequest(process.env.NOTION_TOKEN);
    const entries = await Promise.all(Object.entries(sources).map(async ([key, id]) => [key, await queryAll(id, request)]));
    ({data, covers} = fromNotion(Object.fromEntries(entries)));
  } else data = sanitize(JSON.parse(await readFile(join(root, 'public-snapshot.json'), 'utf8')));
  const staging = await mkdtemp(join(root, '.build-'));
  try {
    await mkdir(join(staging, 'media'));
    for (const file of ['index.html', 'app.js', 'style.css', 'icon.svg']) await copyFile(join(root, file), join(staging, file));
    if (notion) {
      for (const cover of covers) data.works.find(work => work.id === cover.id).cover = await downloadCover(cover, staging);
    } else {
      for (const work of data.works) if (work.cover) await copyFile(join(root, work.cover), join(staging, work.cover));
    }
    await writeFile(join(staging, 'data.js'), serialize(sanitize(data)));
    await writeFile(join(staging, '.nojekyll'), '');
    // These paths are fixed children of this repository; never accept a user supplied deletion path.
    const output = join(root, 'dist');
    const backup = join(root, '.build-previous');
    await rm(backup, {recursive: true, force: true});
    let previous = false;
    try { await rename(output, backup); previous = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(staging, output); } catch (error) { if (previous) await rename(backup, output); throw error; }
    await rm(backup, {recursive: true, force: true});
    console.log(`构建完成（${notion ? 'Notion 实时读取' : `已核对快照 ${data.verifiedOn}`}）：${data.works.length} 部作品 / ${data.lives.length} 场直播 / ${data.lives.reduce((n, live) => n + live.programs.length, 0)} 个节目 → dist/`);
  } finally { await rm(staging, {recursive: true, force: true}); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).some(arg => arg !== '--notion')) throw Error('仅支持 --notion 参数');
  await build({notion: process.argv.includes('--notion')});
}
