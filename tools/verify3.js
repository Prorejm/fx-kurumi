/* 综合验收: 分区 / 做空 / 融资质押 / 资产抵押 / 信用&高消限制 / 非法借贷&催收 / 排行榜 / 普法 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/彭/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const OUT = 'C:/Users/彭/WorkBuddy/2026-09-28-17-03-05/shots/';
const URL = 'http://127.0.0.1:8777/index.html';

const log = (k, v) => console.log(k.padEnd(12), typeof v === 'string' ? v : JSON.stringify(v));

(async () => {
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  p.on('dialog', d => d.accept());

  await p.goto(URL, { waitUntil: 'load', timeout: 40000 });
  await p.waitForSelector('#intro:not(.hidden)');
  await p.click('#startBtn');
  await p.waitForSelector('.srow');
  await p.waitForTimeout(700);

  /* --- 0. 标的总量 & 分区 --- */
  const meta = await p.evaluate(() => {
    const byZone = {};
    Market.meta.forEach(m => { byZone[m.zone] = (byZone[m.zone] || 0) + 1; });
    return { total: Market.meta.length, tradable: Market.tradable.length, byZone };
  });
  log('META', meta);

  const zones = ['A', 'HK', 'US', 'FX', 'FD'];
  for (const z of zones) {
    await p.click(`.ztab[data-zone="${z}"]`);
    await p.waitForTimeout(250);
    const c = await p.evaluate(() => ({
      rows: document.querySelectorAll('.srow').length,
      first: document.querySelector('.srow .nm b') ? document.querySelector('.srow .nm b').textContent : '',
      zone: UI.S.zone
    }));
    log('ZONE-' + z, c);
  }
  await p.click('.ztab[data-zone="A"]');
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '30-zones.png' });

  /* --- 1. 做空 --- */
  await p.click('.dtab[data-dir="short"]');
  await p.waitForTimeout(200);
  const lbl = await p.textContent('#buyBtn .buy-label');
  log('SHORT-LBL', lbl);
  const tShort = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const code = 'sh600519';
    const pr = Market.price(code);
    const open = Game.buy(code, pr, 200, 'short');
    const pos = Game.G.positions.find(x => x.code === code);
    const step = Game.stepDay(10);
    const cover = Game.sell(code, Market.price(code), 200);
    return {
      openOk: open.ok, side: pos ? pos.side : null, shares: pos ? pos.shares : 0,
      stepped: step, coverOk: cover.ok, coverMsg: cover.msg,
      badge: !!Game.G.badges.first_short
    };
  });
  log('SHORT', tShort);
  await p.click('.dtab[data-dir="long"]');
  await p.waitForTimeout(150);

  /* --- 2. 融资质押 --- */
  await p.click('#loanBtn');
  await p.waitForSelector('#loanModal:not(.hidden)');
  await p.click('.ltab[data-lt="bank"]');
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '31-loan-bank.png' });
  const tPledge = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    // 先建仓以产生质押额度
    Game.buy('sh600519', Market.price('sh600519'), 500);
    return { mv: Math.round(Game.marketValue()), loanAvail: Math.round(Game.loanAvail()) };
  });
  log('PLEDGE-PRE', tPledge);
  await p.click('.ltab[data-lt="bank"]');
  await p.waitForTimeout(150);
  await p.fill('#loanAmt', '50000');
  await p.click('#loanDoPledge');
  await p.waitForTimeout(300);
  const tPledge2 = await p.evaluate(() => ({ debt: Math.round(Game.debtTotal()) }));
  log('PLEDGE', tPledge2);
  // 开启现金理财
  await p.click('#loanToggleFund');
  await p.waitForTimeout(200);
  log('FUND', await p.evaluate(() => Game.G.cashFund));

  /* --- 3. 资产抵押 --- */
  await p.click('.ltab[data-lt="asset"]');
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '32-loan-asset.png' });
  const tMort = await p.evaluate(() => {
    const r = Game.mortgage('house', 300000);
    const a = Game.G.assets.find(x => x.id === 'house');
    return { ok: r.ok, msg: r.msg, houseMort: a.mort, debt: Math.round(Game.debtTotal()),
      mortAvail: Math.round(Game.mortAvail()), badge: !!Game.G.badges.first_mort };
  });
  log('MORTGAGE', tMort);

  /* --- 4. 信用 & 高消费限制 --- */
  const tCredit = await p.evaluate(() => {
    const before = Game.G.credit;
    Game.G.credit = 520;                       // 强制失信
    const blocked = Game.creditBlocked();
    const buy = Game.buy('sh600519', Market.price('sh600519'), 100);
    const loan = Game.pledge(10000);
    return { before, now: Game.G.credit, blocked: !!blocked, blockedMsg: blocked,
      buyBlocked: !buy.ok, buyMsg: buy.msg, loanBlocked: !loan.ok };
  });
  log('CREDIT', tCredit);
  await p.click('.ltab[data-lt="credit"]');
  await p.waitForTimeout(200);
  await p.screenshot({ path: OUT + '33-credit.png' });

  /* --- 5. 非法借贷 + 催收 --- */
  await p.click('.ltab[data-lt="ill"]');
  await p.waitForTimeout(250);
  await p.screenshot({ path: OUT + '34-ill-loans.png' });
  const tIll = await p.evaluate(() => {
    Game.G.credit = 750;
    const r = Game.borrowIllegal('shark', 100000);
    const l = Game.G.illLoans[0];
    const got = Math.round(Game.G.realized - 0);   // 简化
    return { ok: r.ok, msg: r.msg, count: Game.G.illLoans.length,
      owed: l ? Math.round(l.owed) : 0, badge: !!Game.G.badges.first_ill };
  });
  log('ILL-BORROW', tIll);
  const tIllGrow = await p.evaluate(() => {
    const before = Game.G.illLoans[0].owed;
    Game.stepDay(30);
    const after = Game.G.illLoans[0].owed;
    return { before: Math.round(before), after: Math.round(after),
      grew: after > before, collected: Game.G.illCollected, stage: Game.G.illStage };
  });
  log('ILL-GROWTH', tIllGrow);
  // 触发催收升级 (逾期 + 大额 → stage 2)
  const tCollect = await p.evaluate(() => {
    const l = Game.G.illLoans[0];
    l.owed = Game.G.base * 1.4; l.overdue = true;
    Game.check();
    const s1 = { stage: Game.G.illStage, collected: Game.G.illCollected, ruin: Game.G.ruin };
    // 复原: 清掉这笔超大欠款与破产状态, 关闭演出层
    l.owed = 200000; l.overdue = false;
    Game.G.ruin = false; Game.G.dead = false;
    UI.hideFx();
    return s1;
  });
  log('COLLECT', tCollect);
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + '35-collect.png' });
  await p.evaluate(() => UI.hideFx());
  // 还款 (干净状态下: 借 5万 → 部分还 2万 → 结清)
  const tRepay = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const b1 = Game.borrowIllegal('shark', 50000);
    const r1 = Game.repayIllegal(0, 20000);
    const owed1 = Game.G.illLoans[0] ? Math.round(Game.G.illLoans[0].owed) : 0;
    Game.G.illLoans[0].owed = 1000;
    const r2 = Game.repayIllegal(0, 1000);
    return { borrow: b1.ok, repayPartial: r1.ok, owed1,
      cleared: Game.G.illLoans.length === 0, repayAll: r2.ok,
      badge: !!Game.G.badges.ill_cleared, credit: Math.round(Game.G.credit) };
  });
  log('ILL-REPAY', tRepay);

  /* --- 6. 排行榜 --- */
  await p.evaluate(() => { UI.closeModal('loanModal'); UI.hideFx(); });
  await p.waitForTimeout(200);
  const tLb = await p.evaluate(() => {
    Game.recordRun('你');
    const l = Game.getLeaderboard();
    return { n: l.length, top: l[0] ? l[0].ret : null };
  });
  await p.click('#lbBtn');
  await p.waitForSelector('#lbModal:not(.hidden)');
  await p.waitForTimeout(250);
  const lbRows = await p.evaluate(() => document.querySelectorAll('.lb-row').length);
  log('LB', { ...tLb, rows: lbRows });
  await p.screenshot({ path: OUT + '36-leaderboard.png' });

  /* --- 7. 普法 --- */
  await p.evaluate(() => UI.closeModal('lbModal'));
  await p.waitForTimeout(200);
  await p.click('#lawBtn');
  await p.waitForSelector('#lawModal:not(.hidden)');
  await p.waitForTimeout(250);
  const tLaw = await p.evaluate(() => ({
    cards: document.querySelectorAll('#lawBody .law-card').length,
    illCards: document.querySelectorAll('#lawBody .law-card.ill').length,
    tips: Game.LEGAL_TIPS.length, prods: Game.ILLEGAL_LOANS.length
  }));
  log('LAW', tLaw);
  await p.screenshot({ path: OUT + '37-law.png' });

  console.log('\nERRORS:', errs.length ? errs.join(' || ') : 'none');
  await b.close();
  process.exit(errs.length ? 2 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
