/* 验收: 花呗/借呗/信用卡 消费信贷 + 亲友借款 + 人情/征信逾期 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/彭/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const OUT = 'C:/Users/彭/WorkBuddy/2026-09-28-17-03-05/shots/';
const URL = 'http://127.0.0.1:8777/index.html';
const log = (k, v) => console.log(k.padEnd(14), typeof v === 'string' ? v : JSON.stringify(v));

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
  await p.waitForTimeout(600);

  /* --- 消费信贷 tab --- */
  await p.click('#loanBtn');
  await p.waitForSelector('#loanModal:not(.hidden)');
  await p.click('.ltab[data-lt="consumer"]');
  await p.waitForTimeout(250);
  const ccCards = await p.evaluate(() => document.querySelectorAll('#loanBody .cc-card').length);
  log('CC-CARDS', ccCards);
  await p.screenshot({ path: OUT + '40-consumer.png' });

  /* --- 花呗借钱 + 计息 --- */
  const tHb = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const c0 = Game.G.credit;
    const r = Game.borrowCivil('huabei', 50000);
    const l = Game.G.civLoans[0];
    const bonus = !!Game.G.badges.first_credit;
    Game.stepDay(30);
    return { ok: r.ok, msg: r.msg, kind: l ? l.kind : null,
      owedStart: 50000, owedAfter30: l ? Math.round(l.owed) : 0,
      creditDelta: +(Game.G.credit - c0).toFixed(1), bonus };
  });
  log('HUABEI', tHb);

  /* --- 信用卡取现 (含手续费+复利) --- */
  const tCard = await p.evaluate(() => {
    const r = Game.borrowCivil('card', 30000);
    const l = Game.G.civLoans.find(x => x.id === 'card');
    return { ok: r.ok, msg: r.msg, owed: l ? Math.round(l.owed) : 0, cutPct: 0.01 };
  });
  log('CARD', tCard);

  /* --- 消费信贷逾期 → 征信受损 --- */
  const tCivOd = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    Game.borrowCivil('jiebei', 100000);       // term 30
    Game.G.credit = 700;
    Game.stepDay(35);                          // 逾期
    return { overdue: Game.G.civLoans[0].overdue, credit: Math.round(Game.G.credit) };
  });
  log('CIV-OVERDUE', tCivOd);

  /* --- 亲友借款: 借入 / 人情 / 逾期 --- */
  await p.click('.ltab[data-lt="friend"]');
  await p.waitForTimeout(250);
  const fCards = await p.evaluate(() => document.querySelectorAll('#loanBody .friend-card').length);
  log('FRIEND-CARDS', fCards);
  await p.screenshot({ path: OUT + '41-friend.png' });

  const tFriend = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const r = Game.borrowCivil('classmate', 30000);   // trust 8, term 30
    const rel1 = Game.G.relation;
    Game.stepDay(35);
    const rel2 = Game.G.relation;
    return { ok: r.ok, msg: r.msg, relAfterBorrow: rel1, relAfterOverdue: rel2,
      overdue: Game.G.civLoans[0].overdue, bonus: !!Game.G.badges.first_friend };
  });
  log('FRIEND', tFriend);

  /* --- 按时还款 → 人情回补 --- */
  const tFriendOk = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    Game.borrowCivil('relative', 100000);      // trust 20
    const rel1 = Game.G.relation;
    const r = Game.repayCivil(0, 100000);
    return { repayOk: r.ok, relBefore: rel1, relAfter: Game.G.relation,
      cleared: Game.G.civLoans.length === 0, bonus: !!Game.G.badges.friend_paid };
  });
  log('FRIEND-REPAY', tFriendOk);

  /* --- 人情耗尽 → 借不到 --- */
  const tRelBlock = await p.evaluate(() => {
    Game.G.relation = 10;
    const r = Game.borrowCivil('friend', 5000);
    return { ok: r.ok, msg: r.msg };
  });
  log('REL-BLOCK', tRelBlock);

  /* --- 普法卡片数量 --- */
  await p.evaluate(() => UI.closeModal('loanModal'));
  await p.click('#lawBtn');
  await p.waitForSelector('#lawModal:not(.hidden)');
  await p.waitForTimeout(250);
  const tLaw = await p.evaluate(() => ({
    cards: document.querySelectorAll('#lawBody .law-card').length,
    tips: Game.LEGAL_TIPS.length, prods: Game.ILLEGAL_LOANS.length
  }));
  log('LAW', tLaw);

  console.log('\nERRORS:', errs.length ? errs.join(' || ') : 'none');
  await b.close();
  process.exit(errs.length ? 2 : 0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
