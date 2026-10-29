const assert = require('node:assert/strict');
const path = require('node:path');
const {mkdirSync} = require('node:fs');
const {chromium} = require('playwright');
const output = path.join(__dirname, '../test-results');
mkdirSync(output, {recursive:true});
(async () => {
  const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    for (const width of [1440,390]) {
      const page = await browser.newPage({viewport:{width,height:width===1440?1000:844}, reducedMotion:'reduce'});
      const errors = [];
      page.on('pageerror', error=>errors.push(error.message));
      const response = await page.goto('https://xiaomishuai.github.io/duodangpu/',{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      assert.equal(await page.locator('.work-card').count(),4);
      assert.equal(await page.locator('#live-list details[open]').count(),0);
      assert.equal(await page.locator('.program-link:visible').count(),0);
      for (const img of await page.locator('.work-card img').all()) await img.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>[...document.querySelectorAll('.work-card img')].every(img=>img.complete&&img.naturalWidth>0));
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(output,`online-${width}.png`),fullPage:true});
      if (width===390) await page.getByRole('button',{name:'搜索',exact:true}).click();
      await page.getByRole('searchbox').fill('张杰');
      assert.equal(await page.locator('#live-list details[open]').count(),0);
      assert.equal(await page.locator('.program-link:visible').count(),0);
      assert.match(await page.locator('.live-row').innerText(),/3 \/ 18/);
      await page.screenshot({path:path.join(output,`online-search-collapsed-${width}.png`),fullPage:true});
      await page.locator('.live-row').click();
      assert.equal(await page.locator('.program-link:visible').count(),3);
      assert.equal(await page.locator('.live-content .watch-link').count(),0);
      await page.locator('.live-row').click();
      assert.equal(await page.locator('.program-link:visible').count(),0);
      await page.getByRole('searchbox').fill('');
      await page.locator('.card-open').first().click();
      assert.equal(await page.getByRole('link',{name:'B站观看 ↗'}).getAttribute('href'),'https://www.bilibili.com/video/BV1QWtz6TEU3');
      await page.keyboard.press('Escape');
      assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
      assert.deepEqual(errors,[]);
      console.log(`ONLINE ${width}px: HTTP200, 4 covers, collapsed default/search, click-to-expand 3 programs, real Bilibili entry and layout passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
