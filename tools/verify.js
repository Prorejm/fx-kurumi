/* 真实浏览器冒烟测试 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/彭/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const OUT = 'C:/Users/彭/WorkBuddy/2026-09-28-17-03-05/shots/';
const URL = 'http://127.0.0.1:8777/index.html';

(async () => {
  const b = await chromium.launch({
    executablePath: EXE, headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await p.waitForSelector('#intro:not(.hidden)', { timeout: 20000 });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '01-intro.png' });
  console.log('STEP1 intro ok');

  // 选模式
  await p.click('.mode-card[data-mode="replay"]');
  await p.waitForTimeout(200);

  // 杠杆设成 5x (index 3)
  await p.evaluate(() => {
    const s = document.getElementById('introLev');
    s.value = 3; s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '02-intro-lever.png' });
  console.log('STEP2 lever=' + await p.textContent('#introLevVal'));

  // 开始
  await p.click('#startBtn');
  await p.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  await p.waitForSelector('.srow', { timeout: 10000 });
  await p.waitForTimeout(900);
  await p.screenshot({ path: OUT + '03-main.png' });
  console.log('STEP3 main rendered');

  const diag1 = await p.evaluate(() => {
    const q = s => document.querySelector(s);
    const cv = q('#kchart');
    return {
      rows: document.querySelectorAll('.srow').length,
      code: window.UI && UI.S.code,
      date: q('#dateBadge') && q('#dateBadge').textContent,
      equity: q('#sEquity') && q('#sEquity').textContent,
      avail: q('#sAvail') && q('#sAvail').textContent,
      curName: q('#curName') && q('#curName').textContent,
      curPrice: q('#curPrice') && q('#curPrice').textContent,
      canvas: cv ? cv.width + 'x' + cv.height : 'none',
      idxRows: document.querySelectorAll('.idx').length,
      lev: q('#levChip') && q('#levChip').textContent,
      mb: q('#mbVal') && q('#mbVal').textContent
    };
  });
  console.log('DIAG1', JSON.stringify(diag1));

  // 画布非空白检测
  const painted = await p.evaluate(() => {
    const cv = document.querySelector('#kchart');
    if (!cv) return 'no-canvas';
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let nz = 0;
    for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 0) nz++;
    return 'nonEmptySamples=' + nz;
  });
  console.log('CANVAS', painted);

  // 买入: 选一只非默认股票 -> 用搜索
  await p.fill('#searchInput', '宁德');
  await p.waitForTimeout(400);
  await p.click('.srow');
  await p.waitForTimeout(400);
  await p.fill('#searchInput', '');
  await p.waitForTimeout(300);

  await p.click('.qbtn[data-q="quarter"]');
  await p.waitForTimeout(200);
  const qty = await p.inputValue('#qtyInput');
  const price = await p.inputValue('#priceInput');
  console.log('TRADE try qty=' + qty + ' price=' + price + ' code=' + await p.evaluate(() => UI.S.code));

  await p.click('#buyBtn');
  await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + '04-after-buy.png' });
  const posCount = await p.textContent('#posCount');
  console.log('STEP4 posCount=' + posCount);
  console.log('TOAST', await p.textContent('#toast'));

  // 推进 8 天
  for (let i = 0; i < 8; i++) {
    await p.click('#nextDayBtn');
    await p.waitForTimeout(180);
  }
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '05-after-8days.png' });
  const diag2 = await p.evaluate(() => ({
    date: document.querySelector('#dateBadge').textContent,
    equity: document.querySelector('#sEquity').textContent,
    ret: document.querySelector('#sReturn').textContent,
    pnl: document.querySelector('#sPnl').textContent,
    mb: document.querySelector('#mbVal').textContent,
    name: document.querySelector('#curName').textContent,
    face: document.querySelector('#charAvatar svg') ? document.querySelector('#charAvatar svg').outerHTML.length : 0,
    bubble: document.querySelector('#charBubble').textContent.trim().slice(0, 40),
    logs: document.querySelectorAll('.lrow').length
  }));
  console.log('DIAG2', JSON.stringify(diag2));

  // 切换周K / 分时
  await p.click('.ctab[data-view="week"]');
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '06-week.png' });
  await p.click('.ctab[data-view="minute"]');
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT + '07-minute.png' });
  await p.click('.ctab[data-view="kline"]');
  await p.waitForTimeout(300);
  console.log('STEP5 chart tabs ok');

  // 一键平仓 -> 验证卖出链路
  await p.click('#closeAllBtn');
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + '08-closeall.png' });
  console.log('STEP6 closeAll posCount=' + await p.textContent('#posCount'));

  // 几何体检: 关键按钮是否被遮挡
  const geo = await p.evaluate(() => {
    const check = sel => {
      const e = document.querySelector(sel);
      if (!e) return sel + ':MISSING';
      const r = e.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return sel + ': ' + Math.round(r.width) + 'x' + Math.round(r.height) +
        ' hit=' + (top ? (top.id || top.className.toString().slice(0, 18)) : 'none') +
        ' blocked=' + !(top === e || (top && e.contains(top)));
    };
    return ['#buyBtn', '#sellBtn', '#nextDayBtn', '#autoBtn', '#searchInput'].map(check);
  });
  console.log('GEO', JSON.stringify(geo, null, 1));

  // 布局溢出体检
  const layout = await p.evaluate(() => {
    const r = e => { const x = e.getBoundingClientRect(); return { y: Math.round(x.y), h: Math.round(x.height), b: Math.round(x.bottom) }; };
    const rows = ['.hud', '.margin-bar', '.grid', '.bottom-row'].map(s => {
      const e = document.querySelector(s); return s + '=' + JSON.stringify(r(e));
    });
    return {
      vh: window.innerHeight,
      bodyScroll: document.body.scrollHeight,
      appH: Math.round(document.querySelector('.app').getBoundingClientRect().height),
      rows,
      ctrlOverflow: (() => {
        const c = document.querySelector('.foot-ctrl');
        return c.scrollHeight + ' vs ' + Math.round(c.getBoundingClientRect().height);
      })(),
      statsVisible: (() => {
        const s2 = document.querySelector('#statsMini');
        const b = s2.getBoundingClientRect();
        return b.bottom <= window.innerHeight && b.height > 0;
      })(),
      mbLines: Array.from(document.querySelectorAll('.mb-line')).map(e => Math.round(e.getBoundingClientRect().x - document.querySelector('.mb-track').getBoundingClientRect().x))
    };
  });
  console.log('LAYOUT', JSON.stringify(layout));

  // 杠杆弹窗
  await p.click('#leverBtn');
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + '10-levermodal.png' });
  const lvOpen = await p.evaluate(() => !document.querySelector('#levModal').classList.contains('hidden'));
  console.log('STEP8 leverModal open=' + lvOpen);
  await p.click('#levOk');
  await p.waitForTimeout(400);
  console.log('STEP8b lev applied=' + await p.textContent('#levChip'));

  // 移动端
  await p.setViewportSize({ width: 430, height: 900 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + '09-mobile.png', fullPage: false });
  console.log('STEP7 mobile ok');

  console.log('ERRORS:', errs.length ? errs.join(' || ') : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
