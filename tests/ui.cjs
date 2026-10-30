const assert = require('node:assert/strict');
const {readFileSync, mkdirSync} = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const results = path.join(root, 'test-results');
mkdirSync(results, {recursive: true});
const content = readFileSync(path.join(root,'dist/data.js'),'utf8');
const data = JSON.parse(content.slice('window.SITE_DATA = '.length).trim().replace(/;$/, ''));
const url = 'http://127.0.0.1:18777/';
const server = spawn(process.execPath,['scripts/preview.mjs'],{cwd:root,env:{...process.env,PORT:'18777'},stdio:'pipe'});
server.stderr.on('data', chunk => process.stderr.write(chunk));

(async () => {
  let browser;
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (attempt === 39) throw Error('Preview server did not start');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({viewport:{width,height:width > 650 ? 1000 : 844},reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url, {waitUntil:'networkidle'});
      await page.evaluate(() => scrollTo(0, 400));
      assert.equal(await page.locator('header').evaluate(el => Math.round(el.getBoundingClientRect().top)), 0);
      assert(await page.getByRole('link',{name:'关于我们'}).isVisible());
      assert.match(await page.locator('footer').innerText(), /多多想当当/);
      assert.doesNotMatch(await page.locator('body').innerText(), /小老头|探险家/);
      assert.equal(await page.locator('#work-grid .work-card').count(), data.works.length);
      assert.equal(await page.locator('.card-body p').count(), 0);
      assert.equal(await page.locator('#live-list .live-card').count(), data.lives.length);
      assert(!await page.locator('#live-dialog').isVisible());
      const category = data.works[0].category;
      if (category) {
        await page.getByRole('button',{name:category,exact:true}).click();
        assert.equal(await page.locator('#work-grid .work-card').count(),data.works.filter(work=>work.category===category).length);
      }
      await page.getByRole('button',{name:'全部',exact:true}).click();
      if (width < 651) await page.getByRole('button',{name:'搜索',exact:true}).click();
      const search = page.getByRole('searchbox');
      await search.fill(' 张杰 ');
      const expected = data.lives.flatMap(live=>live.programs).filter(program=>program.title.includes('张杰')).length;
      const matchingLives = data.lives.filter(live=>live.programs.some(program=>program.title.includes('张杰'))).length;
      assert.equal(await page.locator('#live-list .search-live-group').count(),matchingLives);
      assert.equal(await page.locator('#live-list .search-program').count(),expected);
      for (const query of ['zhangjie', 'zj', 'zhang jie']) {
        await search.fill(query);
        assert.equal(await page.locator('#live-list .search-live-group').count(),matchingLives);
        assert((await page.locator('#live-list .search-program').count()) >= expected);
        const zhangjie = page.locator('#live-list .search-program').filter({hasText:'张杰'}).first();
        assert.equal(await zhangjie.locator('mark').allTextContents().then(parts=>parts.join('')), '张杰');
      }
      if (matchingLives) {
        assert(await page.locator('#live-list .search-program').first().isVisible());
        assert.equal(await page.locator('#live-list .search-program').filter({hasText:'张杰'}).first().locator('a').innerText(), '原视频 ↗');
      }
      await search.fill('zhenxuanzhuan');
      if (data.works.some(work=>work.title==='甄嬛传')) assert.equal(await page.locator('.work-card:not(.live-card)').count(), 1);
      if (data.lives.length) {
        await search.fill(data.lives[0].date);
        const sameDate = data.lives.filter(live=>live.date===data.lives[0].date);
        assert.equal(await page.locator('#live-list .live-card').count(),sameDate.length);
        await page.locator('#live-list .card-open').first().click();
        assert.equal(await page.locator('#live-programs .program').count(),sameDate[0].programs.length);
        assert.equal(await page.locator('#live-programs .program a').count(),sameDate[0].programs.filter(p=>p.url).length);
        assert.equal(await page.locator('#live-dialog-link .watch-link').count(),sameDate[0].replay ? 1 : 0);
        await page.keyboard.press('Escape');
      }
      await search.fill('完全不存在的内容__empty__');
      assert(await page.locator('#empty-works').isVisible());
      assert(await page.locator('#empty-live').isVisible());
      await search.fill('');
      assert.equal(await page.locator('#live-list .live-card').count(), data.lives.length);
      if (width < 651) {
        await search.press('Escape');
        assert.equal(await page.getByRole('button',{name:'搜索',exact:true}).getAttribute('aria-expanded'),'false');
      }
      const card = page.locator('#work-grid .card-open').first();
      await card.click();
      assert(await page.locator('#work-dialog').isVisible());
      const first = data.works[0];
      assert.equal(await page.locator('#dialog-title').innerText(),first.title);
      assert.equal(await page.locator('#dialog-links a').count(),[first.bilibili,first.drive].filter(Boolean).length);
      if (first.bilibili) assert.equal(await page.getByRole('link',{name:'B站观看 ↗',exact:true}).getAttribute('href'),first.bilibili);
      await page.keyboard.press('Escape');
      assert(await card.evaluate(element=>element===document.activeElement));
      await card.click();
      await page.locator('#work-dialog').getByRole('button',{name:'关闭',exact:true}).click();
      await page.getByRole('link',{name:'直播回放',exact:true}).click();
      await page.waitForFunction(() => document.querySelector('nav a[href="#live"]').getAttribute('aria-current') === 'location');
      assert.equal(await page.getByRole('link',{name:'直播回放',exact:true}).getAttribute('aria-current'),'location');
      assert(await page.locator('#live').evaluate(el => el.getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom));
      if (data.lives.length) {
        await page.locator('#live-list .card-open').first().click();
        assert(await page.locator('#live-dialog').isVisible());
        await page.locator('#live-dialog .close').click();
      }
      await page.getByRole('link',{name:'作品',exact:true}).click();
      for (const image of await page.locator('.work-card img').all()) await image.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.querySelectorAll('.work-card img')].every(image=>image.complete&&image.naturalWidth>0));
      await page.evaluate(()=>scrollTo(0,0));
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
      assert(!await page.locator('.card-body').evaluateAll(items=>items.some(item=>item.scrollWidth>item.clientWidth)));
      await page.screenshot({path:path.join(results,`home-${width}.png`),fullPage:true});
      if (width===390) {
        await card.click();
        await page.screenshot({path:path.join(results,'detail-mobile.png')});
        await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'搜索',exact:true}).click();
        await search.fill('张杰');
        await page.screenshot({path:path.join(results,'search-mobile.png'),fullPage:true});
      }
      assert.deepEqual(errors,[]);
      console.log(`${width}px: categories, search, real links, replay state, dialog/focus, images and layout passed`);
      await page.close();
    }
    // Data states that are not currently present in the public Notion records.
    const fixture = await browser.newPage({viewport:{width:320,height:740}});
    const title = '<img src=x onerror=alert(1)> 很长很长的中文标题用于确认换行';
    const mock = {works:[{id:'w',title,category:'综艺',progress:'已完结',cover:'media/missing.jpg',bilibili:'javascript:alert(1)',drive:'https://example.com/collection',videos:[{title:'第一首歌',url:'https://example.com/song'}]}],lives:[{id:'l',title:'测试直播',date:'2026-10-28',replay:'https://example.com/reaction',programs:[{title:'相关节目',url:'https://example.com/original',workIds:['w']}]}],about:{intro:'一起看',letter:['第一段','第二段'],donations:['media/a.png','media/b.png'],qr:'media/missing.png',groupUrl:'',accounts:[{name:'测试账号',role:'账号简介',url:'https://example.com/profile',avatar:'media/avatar.png'}]}};
    mock.about.accounts[0].platform = '小红书';
    const sortedPage = await browser.newPage({viewport:{width:390,height:844}});
    const sortedMock = {...mock,lives:[mock.lives[0],{...mock.lives[0],id:'new',date:'2026-10-29',title:'新直播'}]};
    await sortedPage.route('**/data.js',route=>route.fulfill({contentType:'application/javascript',body:`window.SITE_DATA=${JSON.stringify(sortedMock)};`}));
    await sortedPage.goto(url,{waitUntil:'networkidle'});
    assert.deepEqual(await sortedPage.locator('.live-date').allTextContents(),['2026.10.29','2026.10.28']);
    assert(!await sortedPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
    await sortedPage.screenshot({path:path.join(results,'live-stacked-mobile.png'),fullPage:true});
    await sortedPage.close();
    for (const width of [1440, 390, 320]) {
      const aboutPage = await browser.newPage({viewport:{width,height:844}});
      await aboutPage.route('**/data.js',route=>route.fulfill({contentType:'application/javascript',body:`window.SITE_DATA=${JSON.stringify(mock)};`}));
      await aboutPage.goto(url,{waitUntil:'networkidle'});
      await aboutPage.getByRole('link',{name:'关于我们'}).click();
      assert.match(aboutPage.url(), /about\.html$/);
      assert.equal(await aboutPage.locator('#about-intro').innerText(),'一起看');
      assert.equal(await aboutPage.locator('.about-avatar').getAttribute('src'),'media/avatar.png');
      assert.equal(await aboutPage.locator('.account-platform').innerText(),'小红书');
      await aboutPage.getByRole('button',{name:'我们的初心'}).click();
      assert(await aboutPage.locator('#letter-dialog').isVisible());
      assert.equal(await aboutPage.locator('#letter-content p').count(),2);
      assert.equal(await aboutPage.locator('#letter-title').innerText(),'我们的初心');
      assert.equal(await aboutPage.locator('.letter-salutation').innerText(),'亲爱的朋友：');
      await aboutPage.locator('#letter-title').click();
      assert(await aboutPage.locator('#letter-dialog').isVisible());
      await aboutPage.screenshot({path:path.join(results,`letter-${width}.png`)});
      await aboutPage.keyboard.press('Escape');
      assert(!await aboutPage.locator('#letter-dialog').isVisible());
      assert(!await aboutPage.locator('#about-donation .about-qr').first().isVisible());
      assert.equal(await aboutPage.locator('.donation-icon').innerText(),'🧧');
      await aboutPage.locator('#about-donation summary').click();
      assert.equal(await aboutPage.locator('#about-donation .about-qr:visible').count(),2);
      for (const n of [1, 2]) {
        const trigger = aboutPage.getByRole('button',{name:`放大打赏二维码 ${n}`});
        await trigger.click();
        assert(await aboutPage.locator('#qr-dialog').isVisible());
        assert.equal(await aboutPage.locator('#qr-full').getAttribute('src'), n === 1 ? 'media/a.png' : 'media/b.png');
        assert.equal(await aboutPage.locator('#qr-original').getAttribute('href'), n === 1 ? 'media/a.png' : 'media/b.png');
        await aboutPage.locator('#qr-title').click();
        assert(await aboutPage.locator('#qr-dialog').isVisible());
        await aboutPage.locator('#qr-dialog .close').click();
        assert(await trigger.evaluate(el => document.activeElement === el));
      }
      assert.equal(await aboutPage.getByRole('link',{name:'访问 测试账号 的主页'}).getAttribute('href'),'https://example.com/profile');
      assert.equal(await aboutPage.getByRole('link',{name:'访问 测试账号 的主页'}).getAttribute('rel'),'noopener noreferrer');
      assert.equal(await aboutPage.locator('#about-group .about-qr').getAttribute('alt'),'QQ群二维码');
      assert(!await aboutPage.locator('#about-group .about-qr').isVisible());
      await aboutPage.locator('#about-group .about-group-summary').click();
      assert(await aboutPage.locator('#about-group .about-qr').isVisible());
      await aboutPage.getByRole('button',{name:'放大QQ群二维码'}).click();
      assert.equal(await aboutPage.locator('#qr-full').getAttribute('src'),'media/missing.png');
      await aboutPage.keyboard.press('Escape');
      assert(!await aboutPage.locator('#qr-dialog').isVisible());
      await aboutPage.getByRole('button',{name:'放大QQ群二维码'}).click();
      await aboutPage.mouse.click(5, 400);
      assert(!await aboutPage.locator('#qr-dialog').isVisible());
      await aboutPage.locator('#about-group .about-group-summary').click();
      assert(!await aboutPage.locator('#about-group .about-qr').isVisible());
      assert(!await aboutPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
      await aboutPage.screenshot({path:path.join(results,`about-${width}.png`),fullPage:true});
      await aboutPage.getByRole('link',{name:'直播回放'}).click();
      assert.match(aboutPage.url(), /index\.html#live$/);
      await aboutPage.goto(`${url}#about`,{waitUntil:'networkidle'});
      await aboutPage.waitForURL('**/about.html');
      await aboutPage.close();
    }
    await fixture.route('**/data.js',route=>route.fulfill({contentType:'application/javascript',body:`window.SITE_DATA=${JSON.stringify(mock)};`}));
    await fixture.goto(url,{waitUntil:'networkidle'});
    await fixture.waitForFunction(()=>document.querySelectorAll('.work-card img').length===0);
    assert(await fixture.locator('.cover-fallback').isVisible());
    assert.equal(await fixture.locator('h2 img').count(),0);
    await fixture.locator('#work-grid .card-open').click();
    assert.equal(await fixture.locator('#dialog-links a').count(),1);
    assert(!await fixture.getByText('第一首歌').isVisible());
    await fixture.getByText('视频列表 · 1').click();
    assert(await fixture.getByText('第一首歌').isVisible());
    assert.equal(await fixture.locator('#related-lives .program-link').getAttribute('href'),'https://example.com/song');
    assert.equal(await fixture.getByRole('link',{name:'网盘观看 ↗'}).getAttribute('rel'),'noopener noreferrer');
    assert(!await fixture.locator('.related').evaluate(element=>element.open));
    await fixture.locator('.related summary').click();
    assert.equal(await fixture.locator('.related .watch-link').getAttribute('href'),'https://example.com/reaction');
    assert(!await fixture.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
    await fixture.locator('#work-dialog .close').click();
    for (const width of [320, 390]) {
      await fixture.setViewportSize({width, height: 700});
      await fixture.locator('#work-grid .card-open').click();
      await fixture.getByText('视频列表 · 1').click();
      const bounds = await fixture.locator('#work-dialog').boundingBox();
      assert(bounds.x >= 23 && width - bounds.x - bounds.width >= 23);
      assert(bounds.y >= 59 && 700 - bounds.y - bounds.height >= 59);
      await fixture.locator('#work-dialog').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const closeBounds = await fixture.locator('#work-dialog .close').boundingBox();
      assert(closeBounds.y >= bounds.y && closeBounds.y + closeBounds.height <= bounds.y + bounds.height);
      await fixture.screenshot({path:path.join(results, `work-dialog-${width}.png`)});
      await fixture.mouse.click(5, 350);
      assert(!await fixture.locator('#work-dialog').isVisible());
    }
    await fixture.setViewportSize({width:390,height:844});
    await fixture.getByRole('button',{name:'搜索',exact:true}).click();
    await fixture.getByRole('searchbox').fill('相关节目');
    assert.equal(await fixture.locator('.search-program a').count(),1);
    assert.equal(await fixture.getByRole('link',{name:'观看完整回放 ↗'}).getAttribute('href'),'https://example.com/reaction');
    assert.equal(await fixture.getByRole('link',{name:'原视频 ↗'}).getAttribute('href'),'https://example.com/original');
    await fixture.getByRole('button',{name:'测试直播'}).click();
    assert.equal(await fixture.locator('#live-dialog-title').innerText(),'测试直播');
    await fixture.keyboard.press('Escape');
    assert(!await fixture.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
    console.log('Missing cover, XSS text, unsafe URL, long title and collapsed related replays passed');
    await fixture.close();
  } finally { if (browser) await browser.close(); server.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
