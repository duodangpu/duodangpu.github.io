import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {root} from './build.mjs';

const directory = resolve(root, 'dist');
const mime = {'.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.jpg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml'};
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const file = resolve(directory, '.' + decodeURIComponent(url.pathname));
    if (file !== directory && !file.startsWith(directory + sep)) throw Error('Invalid path');
    const target = (await stat(file)).isDirectory() ? resolve(file, 'index.html') : file;
    response.writeHead(200, {'Content-Type': mime[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
    response.end(await readFile(target));
  } catch { response.writeHead(404); response.end('Not found'); }
});
const port = Number(process.env.PORT || 8777);
server.listen(port, '127.0.0.1', () => console.log(`多当铺预览：http://127.0.0.1:${port}/`));
