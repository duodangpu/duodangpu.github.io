import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../visits.js', import.meta.url), 'utf8');

async function run(hostname, fetcher) {
  const label = {hidden: true, textContent: ''};
  vm.runInNewContext(script, {location: {hostname}, document: {getElementById: () => label}, fetch: fetcher});
  await new Promise(resolve => setImmediate(resolve));
  return label;
}

test('production displays the returned visit count', async () => {
  let calls = 0;
  const label = await run('duodangpu.github.io', async (url, options) => {
    calls++;
    assert.match(url, /duodangpu-website-views\/up$/);
    assert.equal(options.credentials, 'omit');
    return {ok: true, json: async () => ({data: {up_count: 1234}})};
  });
  assert.equal(calls, 1);
  assert.equal(label.textContent, '· 累计访问 1,234 次');
  assert.equal(label.hidden, false);
});

test('failure and invalid responses leave the count hidden', async () => {
  for (const fetcher of [async () => { throw Error('offline'); }, async () => ({ok: false}), async () => ({ok: true, json: async () => ({data: {up_count: 'bad'}})})]) {
    assert.equal((await run('duodangpu.github.io', fetcher)).hidden, true);
  }
});

test('local previews never call the counter', async () => {
  let called = false;
  await run('127.0.0.1', () => { called = true; });
  assert.equal(called, false);
});

test('both pages load the shared counter', async () => {
  for (const file of ['index.html', 'about.html']) {
    const html = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /id="visit-count" hidden/);
    assert.match(html, /src="visits\.js" defer/);
  }
});
