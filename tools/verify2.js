/* 场景测试: T+1 限制 / ロスカット / 退場 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/彭/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const OUT = 'C:/Users/彭/WorkBuddy/2026-09-28-17-03-05/shots/';
const URL = 'http://127.0.0.1:8777/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });

  await p.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await p.waitForSelector('#intro:not(.hidden)');
  await p.click('#startBtn');
  await p.waitForSelector('.srow');
  await p.waitForTimeout(600);

  const t1 = await p.evaluate(() => {
    const code = 'sh600519';
    const pr = Market.price(code);
    Game.reset('replay', 1, Market.idx, {});
    UI.select(code);
    const buy = Game.buy(code, pr, 100);
    const canSellSameDay = Game.canSellShares(code);
    const sellNow = Game.sell(code, pr, 100);
    Game.stepDay(1);
    const canSellNext = Game.canSellShares(code);
    return { buyOk: buy.ok, canSellSameDay, sellMsg: sellNow.msg, sellOk: sellNow.ok, canSellNext };
  });
  console.log('T+1', JSON.stringify(t1));

  // ロスカット (维持率<100 但不破产) — 精确构造 equity=70000
  const t2 = await p.evaluate(() => {
    Game.reset('replay', 2, Market.idx, {});
    const code = 'sh600519';
    const pr = Market.price(code);
    const buy = Game.buy(code, pr, 200);
    const pos = Game.G.positions.find(x => x.code === code);
    const unreal = 70000 - Game.G.base;          // 想要的浮亏额(负)
    pos.cost = pr + (-unreal) / pos.shares;      // 精确设定成本使 equity≈7万
    Game.check();
    return { buyOk: buy.ok, equity: Math.round(Game.equity()),
      mr: Game.marginRatio() ? +Game.marginRatio().toFixed(1) : null,
      margins: Game.G.margins, ruin: Game.G.ruin };
  });
  await p.waitForTimeout(500);
  const fxLoss = await p.evaluate(() => ({
    visible: !document.querySelector('#fx').classList.contains('hidden'),
    word: document.querySelector('#fxWord').textContent
  }));
  console.log('LOSSCUT', JSON.stringify(t2), 'FX', JSON.stringify(fxLoss));
  await p.screenshot({ path: OUT + '20-losscut.png' });

  // 退場 (破产)
  const t3 = await p.evaluate(() => {
    Game.reset('replay', 25, Market.idx, {});
    const code = 'sh600519';
    const pr = Market.price(code);
    Game.buy(code, pr, 200);
    const pos = Game.G.positions.find(x => x.code === code);
    pos.cost = pr * 5;
    Game.check();
    return { buyOk: true, equity: Math.round(Game.equity()),
      mr: Game.marginRatio() ? +Game.marginRatio().toFixed(1) : null,
      ruin: Game.G.ruin, margins: Game.G.margins };
  });
  await p.waitForTimeout(500);
  const fxDead = await p.evaluate(() => ({
    visible: !document.querySelector('#fx').classList.contains('hidden'),
    word: document.querySelector('#fxWord').textContent
  }));
  console.log('RUIN', JSON.stringify(t3), 'FX', JSON.stringify(fxDead));
  await p.screenshot({ path: OUT + '21-ruin.png' });

  console.log('ERRORS:', errs.length ? errs.join(' || ') : 'none');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
