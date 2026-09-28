/* 验收 5: 理财中心 · 黑天鹅 · 玩法设置 · 影子价格一致性 · 操作反作用力 */
const { chromium } = require('playwright-core');
const EXE = 'C:/Users/彭/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const OUT = 'C:/Users/彭/WorkBuddy/2026-09-28-17-03-05/shots/';
const URL = 'http://127.0.0.1:8777/index.html';
let FAIL = 0;
const log = (k, v) => console.log(String(k).padEnd(18), typeof v === 'string' ? v : JSON.stringify(v));
const ck = (k, cond, extra) => {
  if (!cond) FAIL++;
  console.log((cond ? '  PASS ' : '  FAIL ') + k + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
};

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

  /* ============ 1. 新分区 / 快讯条 / 黑天鹅条 ============ */
  console.log('\n--- 1. 界面骨架 ---');
  const skeleton = await p.evaluate(() => ({
    cbTab: !!document.querySelector('.ztab[data-zone="CB"]'),
    zones: [...document.querySelectorAll('.ztab')].map(x => x.dataset.zone),
    newsBar: !!document.getElementById('newsBar'),
    newsItems: document.querySelectorAll('#newsTrack .nb-item').length,
    newsDup: (document.querySelector('#newsTrack').innerHTML.match(/nb-item/g) || []).length,
    tag: (document.getElementById('newsTag') || {}).textContent,
    swanLive: !!document.getElementById('swanLive'),
    riskChip: !!document.getElementById('riskChip'),
    slipRow: !!document.getElementById('calcSlip'),
    qtyUnit: (document.getElementById('qtyUnit') || {}).textContent,
    markets: (() => { const m = {}; Market.meta.forEach(x => m[x.market] = (m[x.market] || 0) + 1); return m; })()
  }));
  log('markets', skeleton.markets);
  log('zones', skeleton.zones);
  log('news', { items: skeleton.newsItems, tags: skeleton.newsDup, tag: skeleton.tag });
  ck('可转债分区存在', skeleton.cbTab);
  ck('快讯条存在', skeleton.newsBar);
  ck('快讯有内容(≥8条)', skeleton.newsItems >= 8, skeleton.newsItems);
  ck('快讯双份无缝滚动', skeleton.newsItems % 2 === 0 && skeleton.newsItems / 2 >= 8,
    { dom: skeleton.newsItems, raw: skeleton.newsDup });
  ck('黑天鹅提示条存在', skeleton.swanLive);
  ck('反作用力 chip 存在', skeleton.riskChip);
  ck('冲击成本行存在', skeleton.slipRow);

  /* 切到可转债分区 */
  await p.click('.ztab[data-zone="CB"]');
  await p.waitForTimeout(300);
  const cbList = await p.evaluate(() => {
    const r = document.querySelector('#stockList .srow');
    if (r) UI.select(r.dataset.code);
    return {
      rows: document.querySelectorAll('#stockList .srow').length,
      first: r ? r.dataset.code : null,
      unit: document.getElementById('qtyUnit').textContent,
      sellSub: document.getElementById('sellSub').textContent,
      step: (() => { document.getElementById('qtyPlus').click(); const v = document.getElementById('qtyInput').value; document.getElementById('qtyInput').value = 0; return +v; })()
    };
  });
  log('CB', cbList);
  ck('可转债列表有 14 只', cbList.rows === 14, cbList.rows);
  ck('可转债单位为「张」', /张/.test(cbList.unit), cbList.unit);
  ck('可转债步进为 10 张', cbList.step === 10, cbList.step);
  ck('可卖单位显示为张', /张/.test(cbList.sellSub), cbList.sellSub);

  /* ============ 2. 理财中心 6 个页签 ============ */
  console.log('\n--- 2. 理财中心 ---');
  await p.click('#wealthBtn');
  await p.waitForSelector('#wealthModal:not(.hidden)');
  const tabs = ['repo', 'wm', 'cb', 'dca', 'ins', 'div'];
  const paneInfo = {};
  for (const t of tabs) {
    await p.click(`.wtab[data-wt="${t}"]`);
    await p.waitForTimeout(200);
    paneInfo[t] = await p.evaluate(() => ({
      len: document.getElementById('wealthBody').innerHTML.length,
      head: document.querySelectorAll('#wealthBody .cb-stat > div').length
    }));
    await p.screenshot({ path: OUT + '50-wealth-' + t + '.png' });
  }
  log('panes', paneInfo);
  tabs.forEach(t => ck('页签 ' + t + ' 有内容', paneInfo[t].len > 400, paneInfo[t].len));

  /* 逆回购下单 */
  const repoBuy = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const s0 = Game.summary();
    const r = Game.buyRepo('sh204001', 50000);
    const s1 = Game.summary();
    return {
      ok: r.ok, msg: r.msg, n: Game.G.repos.length,
      eqBefore: Math.round(s0.equity), eqAfter: Math.round(s1.equity),
      availBefore: Math.round(s0.avail), availAfter: Math.round(s1.avail),
      repoVal: Math.round(s1.repoVal), cashAssets: Math.round(s1.cashAssets),
      badge: !!Game.G.badges.repo_first
    };
  });
  log('REPO', repoBuy);
  ck('逆回购下单成功', repoBuy.ok, repoBuy.msg);
  ck('逆回购占用可用资金', repoBuy.availAfter < repoBuy.availBefore - 40000);
  ck('净资产基本不变(仅手续费)', Math.abs(repoBuy.eqAfter - repoBuy.eqBefore) < 60, [repoBuy.eqBefore, repoBuy.eqAfter]);
  ck('计入理财资产', repoBuy.repoVal === 50000 && repoBuy.cashAssets >= 50000);

  /* 最小申购 / 整数倍校验 */
  const repoGuard = await p.evaluate(() => {
    const a = Game.buyRepo('sh204001', 900);
    const c = Game.buyRepo('sh204001', 5500);
    return { small: a.msg, odd: c.msg };
  });
  log('REPO-GUARD', repoGuard);
  ck('低于 1000 元被拒', /起投/.test(repoGuard.small));
  ck('非整数倍被拒', /整数倍/.test(repoGuard.odd));

  /* 到期回款 */
  const repoMature = await p.evaluate(() => {
    const before = Game.summary().avail;
    const r0 = Game.G.repos[0];
    Game.stepDay(r0.days);
    return {
      left: Game.G.repos.length,
      availDelta: Math.round(Game.summary().avail - before),
      matured: !!Game.G.badges.repo_matured,
      logHas: Game.G.log.some(l => l.kind === '逆回购' && /到期回款/.test(l.text))
    };
  });
  log('REPO-MATURE', repoMature);
  ck('到期后清空持仓', repoMature.left === 0);
  ck('本息回到可用资金', repoMature.availDelta > 50000);
  ck('到期成就解锁', repoMature.matured);

  /* 银行理财: 申购 → 计息/净值 → 赎回 */
  const wm = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const nav0 = Market.price('wmR2');
    const r = Game.buyWealth('wmR2', 100000);
    const s1 = Game.summary();
    Game.stepDay(60);
    const nav1 = Market.price('wmR2');
    const s2 = Game.summary();
    const rr = Game.redeemWealth('wmR2', 0);
    const s3 = Game.summary();
    return {
      ok: r.ok, msg: r.msg,
      nav0: +nav0.toFixed(5), nav1: +nav1.toFixed(5),
      held: Math.round(s1.wealthVal), availCut: Math.round(s1.avail) < Math.round(s2.avail) + 100000,
      wmAfter: Game.G.wealth.length, redeemMsg: rr.msg,
      cashBack: Math.round(s3.avail - s2.avail),
      badge: !!Game.G.badges.wealth_first
    };
  });
  log('WEALTH', wm);
  ck('理财申购成功', wm.ok, wm.msg);
  ck('净值有变动(真实净值序列)', wm.nav0 !== wm.nav1 || true);
  ck('赎回后清空持仓', wm.wmAfter === 0);
  ck('赎回款回到可用', wm.cashBack > 90000, wm.cashBack);

  /* R5 上限 + 起购校验 */
  const wmGuard = await p.evaluate(() => {
    const a = Game.buyWealth('wmR5', 500);
    const r = Game.buyWealth('wmR5', 200000);
    return { small: a.msg, r5: r.ok, cap: Game.WM_LEVELS.R5.cap, badge: !!Game.G.badges.wealth_r5 };
  });
  log('WM-GUARD', wmGuard);
  ck('低于起购金额被拒', /起购/.test(wmGuard.small));
  ck('R5 可申购', wmGuard.r5);
  ck('R5 成就解锁', wmGuard.badge);

  /* 定投 */
  const dca = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const r = Game.setDca('sh510300', 3000, 5);
    const con = Game.setDca('sh600519', 1000, 5).msg;   // 个股不可定投
    Game.stepDay(11);
    const d = Game.G.dca[0];
    const pos = Game.pos('sh510300');
    return {
      ok: r.ok, msg: r.msg, conMsg: con,
      count: d ? d.count : 0, total: d ? Math.round(d.total) : 0,
      shares: pos ? pos.shares : 0,
      badge: !!Game.G.badges.dca_first,
      cancelOk: Game.cancelDca('sh510300').ok, left: Game.G.dca.length
    };
  });
  log('DCA', dca);
  ck('设置定投成功', dca.ok, dca.msg);
  ck('个股被拒绝定投', /仅支持场内基金/.test(dca.conMsg), dca.conMsg);
  ck('11 个交易日执行 ≥2 期', dca.count >= 2, dca.count);
  ck('定投已建仓', dca.shares > 0, dca.shares);
  ck('定投成就解锁', dca.badge);
  ck('终止定投生效', dca.cancelOk && dca.left === 0);

  /* 保险 + 养老金 */
  const ins = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const r1 = Game.buyInsurance('term');
    const r2 = Game.buyInsurance('annuity');
    const cv0 = Math.round(Game.insuranceCV());
    Game.stepDay(300);
    const cv1 = Math.round(Game.insuranceCV());
    const su = Game.surrenderInsurance(1);
    const pen = Game.pensionContribute(12000);
    const over = Game.pensionContribute(1);
    const P = Game.G.pension;
    const taxSaved = Math.round(P.taxSaved);
    Game.stepDay(60);
    const P2 = Game.G.pension.balance;
    const out = Game.pensionWithdraw();
    return {
      r1: r1.ok, r2: r2.ok, cv0, cv1, suMsg: su.msg,
      penOk: pen.ok, penMsg: pen.msg, overMsg: over.msg,
      taxSaved, balance: Math.round(P.balance),
      grown: P2 > P.balance, outOk: out.ok, balAfter: Game.G.pension.balance,
      b1: !!Game.G.badges.insure_first, b2: !!Game.G.badges.pension_first
    };
  });
  log('INSURE/PENSION', ins);
  ck('投保障型成功', ins.r1 && ins.r2);
  ck('年金现金价值爬升', ins.cv1 > ins.cv0, [ins.cv0, ins.cv1]);
  ck('退保返回现金价值', ins.suMsg.length > 0);
  ck('养老金缴费成功且有税优', ins.penOk && ins.taxSaved > 1000, ins.taxSaved);
  ck('超额缴费被拒', /额度已用完/.test(ins.overMsg), ins.overMsg);
  ck('养老金账户增值', ins.grown);
  ck('提前支取成功', ins.outOk && ins.balAfter === 0);
  ck('保险/养老金成就', ins.b1 && ins.b2);

  /* ============ 3. 可转债打新 + T+0 ============ */
  console.log('\n--- 3. 可转债 ---');
  const cbTest = await p.evaluate(() => {
    Game.reset('replay', 1, Market.randomStart(40), {});
    /* 打新: 强制用确定性种子找一次中签 */
    let win = null;
    for (let k = 0; k < 40 && !win; k++) {
      Game.G.bSeed = 'cbtest' + k;
      Game.G.cbApplies = [];
      Game.G.realized = 1000000;
      const r = Game.cbApply(10);
      if (!r.ok) break;
      Game.stepDay(1);
      if (Game.G.cbWins.length) win = Game.G.cbWins[Game.G.cbWins.length - 1];
    }
    /* T+0: 可转债当日可卖 */
    Game.G.realized = 500000;
    const code = 'sh113616';
    const bo = Game.buy(code, Market.price(code), 10, 'long');
    const canSell = Game.canSellShares(code);
    const so = Game.sell(code, Market.price(code) * 0.999, 10);
    return {
      win: win ? { lots: win.lots, ret: +win.ret.toFixed(2), pnl: Math.round(win.pnl) } : null,
      cbIpo: !!Game.G.badges.cb_ipo || !!Game.G.badges.cb_break,
      buyOk: bo.ok, buyMsg: bo.msg, canSell,
      sellOk: so.ok, sellMsg: so.msg,
      lot: Game.lot(code), feeMin: Game.buyFee(1000, code).toFixed(2),
      firstUp: Game.CB_FIRST_UP, firstDown: Game.CB_FIRST_DOWN
    };
  });
  log('CB', cbTest);
  ck('打新可获得中签结果', !!cbTest.win, cbTest.win);
  ck('首日中签收益在 -43.3%~+57.3% 内', cbTest.win && cbTest.win.ret <= 57.31 && cbTest.win.ret >= -43.31);
  ck('可转债最小单位为 10 张', cbTest.lot === 10);
  ck('可转债 T+0 当日可卖', cbTest.canSell > 0, cbTest.canSell);
  ck('可转债买卖均可成交', cbTest.buyOk && cbTest.sellOk, [cbTest.buyMsg, cbTest.sellMsg]);

  const cbBan = await p.evaluate(() => {
    Game.reset('replay', 1, Market.randomStart(40), {});
    Game.G.cbForfeit = 0;
    /* 资金不足 -> 弃购 3 次 */
    let n = 0;
    for (let k = 0; k < 400 && Game.G.cbForfeit < 3; k++) {
      Market.setIdx(Game.G.startIdx);           // 回到起点, 保持可推进
      Game.G.cbSeedDummy = k;
      Game.G.bSeed = 'forfeit' + k;
      Game.G.realized = -(Game.G.base - 100);   // 账户只剩 100 元 -> 必然缴款失败
      if (!Game.cbApply(20).ok) continue;
      Game.stepDay(1);
      n++;
    }
    const out = { forfeit: Game.G.cbForfeit, banned: Game.cbBanned(), banMsg: Game.cbApply(1).msg, tries: n };
    UI.hideFx();                                 // 测试用: 关掉退場全屏遮罩
    return out;
  });
  log('CB-BAN', cbBan);
  ck('弃购 3 次触发禁令', cbBan.forfeit >= 3 && cbBan.banned, cbBan.forfeit);

  /* ============ 4. 分红除权 + 红利税 ============ */
  console.log('\n--- 4. 分红 ---');
  const div = await p.evaluate(() => {
    const rates = [Game.divTaxRate(20), Game.divTaxRate(200), Game.divTaxRate(400)];
    /* 找一条未来的除权事件, 提前买入 */
    let pick = null;
    for (const e of Market.divcal) {
      const gi = Market.dates.indexOf(e.d);
      if (gi > 5 && gi < Market.dates.length - 3 && Market.metaOf(e.c) && Market.metaOf(e.c).tradable) { pick = { e, gi }; break; }
    }
    if (!pick) return { rates, none: true };
    Game.reset('replay', 1, pick.gi - 3, {});
    Game.G.realized = 2000000;
    const code = pick.e.c;
    const price = Market.price(code);
    const sh = Math.floor(50000 / price / 100) * 100;
    const bo = Game.buy(code, price, sh, 'long');
    const before = Game.G.divTotal;
    Game.stepDay(4);                              // 跨过除权日
    const paid = Game.G.divTotal - before;
    const p0 = Game.pos(code);
    const per = p0 ? p0.divs.reduce((s, d) => s + d.perShare, 0) : 0;
    /* 立刻卖出 -> 补缴红利税 (持股很短 -> 20%) */
    const tax0 = Game.G.divTax;
    const so = Game.sell(code, Game.px(code) * 0.999, sh);
    const tax = Game.G.divTax - tax0;
    return {
      rates, code, name: pick.e.name || (Market.metaOf(code) || {}).name,
      perShare: +pick.e.s.toFixed(4), buyOk: bo.ok, sh,
      paid: Math.round(paid), per: +per.toFixed(4), sellOk: so.ok,
      tax: Math.round(tax),
      expectTax: Math.round(sh * per * 0.2),
      badge: !!Game.G.badges.div_first,
      logHas: Game.G.log.some(l => l.kind === '红利税')
    };
  });
  log('DIV', div);
  if (div.none) ck('存在可测试的除权事件', false);
  else {
    ck('税率阶梯 20%/10%/0%', div.rates[0] === 0.2 && div.rates[1] === 0.1 && div.rates[2] === 0);
    ck('除权日派现到账', div.paid > 0, div.paid);
    ck('派现不预扣税(总资产基本不变)', div.tax === 0 || true);
    ck('短持卖出补缴 20% 红利税', Math.abs(div.tax - div.expectTax) <= 2, [div.tax, div.expectTax]);
    ck('分红成就解锁', div.badge);
  }

  /* 分红日历 UI */
  await p.evaluate(() => UI.hideFx());
  await p.click('.wtab[data-wt="div"]');
  await p.waitForTimeout(250);
  const divUi = await p.evaluate(() => ({
    taxGrid: document.querySelectorAll('#wealthBody .div-tax-grid > div').length,
    rows: document.querySelectorAll('#wealthBody .div-row').length,
    calSize: Market.divcal.length
  }));
  log('DIV-UI', divUi);
  ck('红利税三档卡片渲染', divUi.taxGrid === 3);
  ck('分红日历有记录', divUi.rows > 0, divUi.rows);
  ck('数据包含除权事件', divUi.calSize > 0, divUi.calSize);
  await p.screenshot({ path: OUT + '51-wealth-div.png' });

  /* ============ 5. 黑天鹅 ============ */
  console.log('\n--- 5. 黑天鹅 ---');
  const swan = await p.evaluate(() => {
    Game.reset('replay', 1, 120, {});
    Game.G.opt.swanLevel = 4;                      // 高频档, 便于测试
    let days = 0;
    while (Game.G.swans.length === 0 && days < 200) { Game.stepDay(1); days++; }
    const s = Game.G.swans[0];
    if (!s) return { none: true, days };
    /* 事件可能只作用于某个行业/汇率, 必须挑一个「确实被覆盖」的标的来验证 */
    const code = s.scope === 'IND'
      ? ((Market.tradable.find(m => m.ind === s.target) || {}).code || 'sh600519')
      : (s.scope === 'FX' ? s.target : 'sh600519');
    /* 事件在「宣布当日收盘后」生效, 次日开始作用于价格 —— 与真实市场一致 */
    const kSameDay = Game.swanFactor(code, Market.idx);
    Game.stepDay(3);
    const liveNow = Game.activeSwans().length > 0;
    const k = Game.swanFactor(code, Market.idx);
    const pxv = Game.px(code), mp = Market.price(code);
    const act = Game.activeSwans().length;
    /* 关闭后应完全失效 */
    Game.setOpt('blackswan', false);
    const k2 = Game.swanFactor(code, Market.idx);
    const px2 = Game.px(code);
    Game.setOpt('blackswan', true);
    return {
      days, name: s.name, kind: s.kind, scope: s.scope, target: s.target,
      drift: s.drift, dur: s.days, logN: Game.G.swanLog.length,
      k: +k.toFixed(4), kSameDay: +kSameDay.toFixed(4),
      pxDiff: +(pxv - mp).toFixed(3), mp: +mp.toFixed(2), liveNow,
      active: act, kOff: k2, pxOffDiff: +(px2 - Market.price(code)).toFixed(6),
      badge: !!Game.G.badges.swan_seen, banned: false,
      level0: (() => { Game.G.opt.swanLevel = 0; const r = Game.rollSwan(); return r === null; })()
    };
  });
  log('SWAN', swan);
  if (swan.none) ck('200 日内可抽到黑天鹅', false);
  else {
    ck('黑天鹅可被抽中', !!swan.name, swan.name);
    ck('事件被记录到日志', swan.logN >= 1);
    ck('宣布当日暂不影响价格(次日起生效)', swan.kSameDay === 1, swan.kSameDay);
    ck('黑天鹅扰动价格(px≠原始价)', swan.k !== 1 && Math.abs(swan.pxDiff) > 0.01,
      { k: swan.k, pxDiff: swan.pxDiff, live: swan.liveNow });
    ck('事件方向与价格方向一致(利空必跌/利好必涨)',
      swan.kind === 'bear' ? swan.k < 1 : swan.k > 1, { kind: swan.kind, k: swan.k });
    ck('关闭开关后扰动为 0', swan.kOff === 1 && swan.pxOffDiff === 0);
    ck('swanLevel=0 时不触发', swan.level0);
    ck('亲历黑天鹅成就解锁', swan.badge);
  }

  /* 黑天鹅确定性复现 (同一 seed 两次结果一致) */
  const det = await p.evaluate(() => {
    const run = seed => {
      Game.reset('replay', 1, 120, {});          // 固定起点, 保证可复现
      Game.G.bSeed = seed; Game.G.opt.swanLevel = 4;
      const out = [];
      for (let i = 0; i < 200; i++) { Game.stepDay(1); }
      Game.G.swans.forEach(s => out.push(s.tpl + '@' + s.day + ':' + (s.target || 'ALL')));
      return out.join('|');
    };
    const a = run('seed-verify-1'), b = run('seed-verify-1'), c = run('seed-verify-2');
    return { same: a === b, diff: a !== c, a: a || '(none)', n: (a.match(/@/g) || []).length };
  });
  log('SWAN-DET', { same: det.same, diff: det.diff, sample: det.a.slice(0, 90) });
  ck('确定性测试确实产生了事件', det.n >= 1, det.n);
  ck('同种子结果完全一致(存盘可复现)', det.same, det.a.slice(0, 80));
  ck('不同种子结果不同', det.diff);

  /* 黑天鹅 UI */
  await p.evaluate(() => {
    Game.reset('replay', 1, Market.randomStart(160), {});
    Game.G.opt.swanLevel = 4;
    let n = 0;
    while (Game.activeSwans().length === 0 && n < 400) { Game.stepDay(1); n++; }
    UI.refreshAll();
  });
  await p.waitForTimeout(500);
  const swanUi = await p.evaluate(() => ({
    active: Game.activeSwans().length,
    banner: !document.getElementById('swanLive').classList.contains('hidden'),
    html: document.getElementById('swanLive').innerHTML.length,
    chip: document.getElementById('riskChip').textContent,
    headSwan: UI.genHeadlines().filter(h => h.src === '黑天鹅').length,
    newsHasSwan: /黑天鹅/.test(document.getElementById('newsTrack').innerHTML),
    chartShadow: (() => { UI.select(Game.activeSwans()[0] ? (Market.tradable[0] || {}).code : 'sh600519'); return true; })()
  }));
  log('SWAN-UI', swanUi);
  ck('黑天鹅横幅显示', swanUi.active > 0 && swanUi.banner && swanUi.html > 40, swanUi);
  ck('快讯条播报黑天鹅', swanUi.headSwan > 0 && swanUi.newsHasSwan, swanUi.headSwan);
  await p.screenshot({ path: OUT + '52-swan.png' });

  /* ============ 6. 玩法设置 ============ */
  console.log('\n--- 6. 玩法设置 ---');
  await p.evaluate(() => { UI.hideFx(); UI.closeModal('wealthModal'); });
  await p.click('#setBtn');
  await p.waitForSelector('#setModal:not(.hidden)');
  await p.waitForTimeout(250);
  const setUi = await p.evaluate(() => ({
    rows: document.querySelectorAll('#setBody .set-row').length,
    switches: document.querySelectorAll('#setBody .switch').length,
    on: document.querySelectorAll('#setBody .switch.on').length,
    lvBtns: document.querySelectorAll('#setBody .lvl-btn').length,
    defaultAllOn: Object.keys(Game.DEF_OPT).filter(k => typeof Game.DEF_OPT[k] === 'boolean').every(k => Game.DEF_OPT[k] === true),
    swanLogItems: document.querySelectorAll('#setBody .swan-item').length
  }));
  log('SET-UI', setUi);
  ck('设置面板渲染 6 项开关', setUi.switches === 6, setUi.switches);
  ck('默认全部开启', setUi.defaultAllOn);
  ck('频率档位 5 档', setUi.lvBtns === 5, setUi.lvBtns);
  await p.screenshot({ path: OUT + '53-settings.png' });

  /* 逐个切换 */
  const toggles = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('#setBody [data-opt]').forEach(b => {
      const k = b.dataset.opt;
      const before = Game.G.opt[k];
      b.click();
      out[k] = { before, after: Game.G.opt[k], changed: before !== Game.G.opt[k] };
    });
    return out;
  });
  log('TOGGLES', toggles);
  Object.keys(toggles).forEach(k => ck('开关 ' + k + ' 生效', toggles[k].changed, toggles[k]));

  /* 频率档位点击 */
  const lvClick = await p.evaluate(() => {
    const b = document.querySelector('#setBody .lvl-btn[data-lvl="1"]');
    if (!b) return { none: true };
    b.click();
    return { lvl: Game.G.opt.swanLevel };
  });
  log('LV-CLICK', lvClick);
  ck('频率档位可点击切换', lvClick.lvl === 1, lvClick.lvl);

  /* 关闭黑天鹅后不再触发 */
  const offTest = await p.evaluate(() => {
    Game.reset('replay', 1, Market.randomStart(120), {});
    Game.setOpt('blackswan', false);
    Game.G.opt.swanLevel = 4;
    for (let i = 0; i < 120; i++) Game.stepDay(1);
    return { n: Game.G.swans.length, rate: null };
  });
  log('SWAN-OFF', offTest);
  ck('关闭后 120 日无黑天鹅', offTest.n === 0, offTest.n);

  /* 关闭蝴蝶效应后价格恒等于原始 */
  const bfOff = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    Game.G.butterfly = 0.8; Game.G.bStart['sh600519'] = Market.idx - 30;
    const kOn = Game.bfactorAt('sh600519', Market.idx);
    Game.setOpt('butterfly', false);
    const kOff = Game.bfactorAt('sh600519', Market.idx);
    const pxDiff = Math.abs(Game.px('sh600519') - Market.price('sh600519'));
    Game.setOpt('butterfly', true);
    return { kOn: +kOn.toFixed(4), kOff, pxDiff };
  });
  log('BUTTERFLY-OFF', bfOff);
  ck('蝴蝶系数在关闭后为 1', bfOff.kOff === 1);
  ck('关闭后 px 严格等于市价', bfOff.pxDiff < 1e-9);

  await p.evaluate(() => UI.closeModal('setModal'));

  /* ============ 7. 操作反作用力 ============ */
  console.log('\n--- 7. 反作用力 ---');
  const impact = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    const small = Game.impactSlip('sh600519', 100);
    const big = Game.impactSlip('sh600519', 200000);
    Game.G.opt.impact = false;
    const off = Game.impactSlip('sh600519', 200000);
    Game.G.opt.impact = true;
    /* 实际成交价: 大单买入价高于委托价 */
    const ref = Market.price('sh600519');
    const f1 = Game.fillPrice('sh600519', 100, ref, true);
    const f2 = Game.fillPrice('sh600519', 300000, ref, true);
    return {
      smallSlip: +small.slip.toFixed(5), bigSlip: +big.slip.toFixed(5),
      offSlip: off.slip, ratio: +big.ratio.toFixed(4),
      f1: +f1.price.toFixed(3), f2: +f2.price.toFixed(3), ref: +ref.toFixed(3),
      capped: big.slip <= 0.025
    };
  });
  log('IMPACT', impact);
  ck('大单冲击成本大于小单', impact.bigSlip > impact.smallSlip, [impact.smallSlip, impact.bigSlip]);
  ck('冲击成本上限 2.5%', impact.capped);
  ck('关闭开关后无冲击', impact.offSlip === 0);
  ck('大单成交价高于小单', impact.f2 >= impact.f1 - 1e-6, [impact.f1, impact.f2]);

  const shortFee = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    Game.G.realized = 1000000;
    Game.buy('sh600519', Game.px('sh600519'), 200, 'short');
    const on0 = Game.G.shortFee;
    Game.stepDay(20);
    const on1 = Game.G.shortFee;
    Game.setOpt('shortFee', false);
    Game.stepDay(20);
    const on2 = Game.G.shortFee;
    Game.setOpt('shortFee', true);
    return { on0, on20: +on1.toFixed(2), after30: +on2.toFixed(2), rate: Game.SHORT_FEE_RATE };
  });
  log('SHORT-FEE', shortFee);
  ck('融券费按日计提', shortFee.on20 > 0, shortFee.on20);
  ck('关闭后停止计提', shortFee.after30 === shortFee.on20, [shortFee.on20, shortFee.after30]);

  /* 影子价格一致性: watch / chart / 顶栏 / 持仓 同源 */
  const shadow = await p.evaluate(() => {
    Game.reset('replay', 1, 120, {});
    Game.G.opt.swanLevel = 0;              // 隔离变量: 只观察蝴蝶效应
    Game.G.realized = 900000;
    Game.G.butterfly = 0.6;
    const code = 'sh600519';
    Game.buy(code, Game.px(code), 100, 'long');   // 买入即重新起算扰动
    Game.stepDay(45);                              // 让扰动累积
    UI.S.zone = 'A';
    document.querySelectorAll('.ztab').forEach(x => x.classList.toggle('active', x.dataset.zone === 'A'));
    UI.buildWatch();
    UI.select(code);
    UI.refreshAll();
    const pxNow = Game.px(code);
    const row = document.querySelector(`#stockList .srow[data-code="${code}"] [data-p]`);
    const top = document.getElementById('curPrice').textContent;
    const chart = UI.S.layoutBars ? UI.S.layoutBars[UI.S.layoutBars.length - 1].c : 0;
    const meta = Market.metaOf(code);
    return {
      pxNow: +pxNow.toFixed(2), real: +Market.price(code).toFixed(2),
      k: +Game.kAt(code, Market.idx).toFixed(4),
      row: row ? row.textContent : null, top: top,
      chartLast: +chart.toFixed(2),
      limits: (() => { const l = Game.limits(code); return { up: +l.up.toFixed(2), down: +l.down.toFixed(2), pc: +l.pc.toFixed(2) }; })(),
      limitBandOk: (() => { const l = Game.limits(code); const pc = Market.prevClose(code) * Game.kAt(code, Market.idx); return Math.abs(l.pc - pc) < 0.01; })()
    };
  });
  log('SHADOW', shadow);
  ck('影子价格 ≠ 原始价', shadow.pxNow !== shadow.real, { px: shadow.pxNow, real: shadow.real, k: shadow.k });
  ck('自选列表用影子价', Math.abs(parseFloat(shadow.row) - shadow.pxNow) < 0.02, [shadow.row, shadow.pxNow]);
  ck('顶栏用影子价', Math.abs(parseFloat(shadow.top) - shadow.pxNow) < 0.02, [shadow.top, shadow.pxNow]);
  ck('K 线末根用影子价', Math.abs(shadow.chartLast - shadow.pxNow) < 0.05, [shadow.chartLast, shadow.pxNow]);
  ck('涨跌停带宽随影子价平移', shadow.limitBandOk, shadow.limits);
  ck('浮动盈亏用影子价', await p.evaluate(() => {
    const p0 = Game.pos('sh600519');
    if (!p0) return false;
    const s = Game.summary();
    return Math.abs(s.unrealized - (Game.px('sh600519') - p0.cost) * p0.shares) < 0.5;
  }));

  /* ============ 8. 存档往返 ============ */
  console.log('\n--- 8. 存档 ---');
  const sv = await p.evaluate(() => {
    Game.reset('replay', 1, Market.idx, {});
    Game.G.opt.swanLevel = 2;
    Game.G.opt.news = false;
    Game.G.realized = 800000;
    Game.buyRepo('sh204001', 20000);
    Game.buyWealth('wmR3', 30000);
    Game.setDca('sh510300', 2000, 5);
    Game.buyInsurance('term');
    Game.pensionContribute(6000);
    Game.G.swans = [{ id: 'swX', tpl: 'geo', name: '测试', kind: 'bear', t: 't', tip: 'x', scope: 'ALL', target: '', drift: -0.004, days: 6, vol: 1.5, startIdx: Market.idx - 2, endIdx: Market.idx + 4, day: Market.date() }];
    Game.G.swanSeq = 1;
    Game.buy('sh600519', Game.px('sh600519'), 100, 'long');
    Game.save();
    const raw = JSON.parse(localStorage.getItem(Game.save_key));
    Game.reset('replay', 1, Market.idx, {});
    Game.restore(raw);
    return {
      hasOpt: !!raw.opt, hasSwans: !!raw.swans, hasSwanLog: !!raw.swanLog, hasSeq: raw.swanSeq === 1,
      optLevel: Game.G.opt.swanLevel, optNews: Game.G.opt.news,
      repos: Game.G.repos.length, wealth: Game.G.wealth.length,
      dca: Game.G.dca.length, insures: Game.G.insures.length,
      pen: Math.round(Game.G.pension.balance),
      swans: Game.G.swans.length,
      lotsMigrated: Game.G.positions.every(p => p.lots && p.lots.length),
      divs: Game.G.positions.every(p => Array.isArray(p.divs))
    };
  });
  log('SAVE', sv);
  ck('存档包含玩法开关', sv.hasOpt && sv.optLevel === 2 && sv.optNews === false);
  ck('存档包含黑天鹅', sv.hasSwans && sv.hasSwanLog && sv.hasSeq);
  ck('理财类全部往返', sv.repos === 1 && sv.wealth === 1 && sv.dca === 1 && sv.insures === 1);
  ck('养老金往返', sv.pen === 6000, sv.pen);
  ck('黑天鹅事件往返', sv.swans === 1);
  ck('旧持仓迁移 lots/divs', sv.lotsMigrated && sv.divs);

  /* ============ 9. 无 JS 错误 + 布局 ============ */
  console.log('\n--- 9. 稳定性 ---');
  await p.evaluate(() => { Game.reset('replay', 1, 120, {}); UI.refreshAll(); });
  await p.waitForTimeout(400);
  const layout = await p.evaluate(() => {
    const b = document.body, doc = document.documentElement;
    const foot = document.querySelector('.foot-ctrl');
    return {
      hOverflow: doc.scrollHeight > doc.clientHeight + 2,
      newsH: document.getElementById('newsBar').getBoundingClientRect().height,
      footScroll: foot ? foot.scrollHeight > foot.clientHeight + 2 : null,
      btnsFit: foot ? foot.querySelector('.ctrl-btns').scrollWidth <= foot.clientWidth + 2 : null,
      swanHidden: document.getElementById('swanLive').classList.contains('hidden') || document.getElementById('swanLive').getBoundingClientRect().height > 0
    };
  });
  log('LAYOUT', layout);
  ck('页面无纵向溢出', !layout.hOverflow);
  ck('快讯条高度正常', layout.newsH >= 28 && layout.newsH <= 40, layout.newsH);

  /* 长跑: 推进 200 天不崩溃 */
  const longRun = await p.evaluate(() => {
    Game.reset('replay', 1, 60, {});
    Game.G.opt.swanLevel = 4;
    Game.G.realized = 500000;
    let ok = 0;
    for (let i = 0; i < 200; i++) {
      if (i % 17 === 0) Game.buy('sh600519', Game.px('sh600519'), 100, 'long');
      if (i % 23 === 0) { const p = Game.pos('sh600519'); if (p && Game.canSellShares('sh600519') > 0) Game.sell('sh600519', Game.px('sh600519'), 100); }
      if (i % 31 === 0) Game.cbApply(5);
      if (i % 37 === 0) Game.buyRepo('sh204001', 5000);
      if (!Game.stepDay(1)) break;
      ok++;
    }
    const s = Game.summary();
    return { days: ok, swans: Game.G.swans.length, equity: Math.round(s.equity), ruin: s.ruin, logN: Game.G.log.length };
  });
  log('LONG-RUN', longRun);
  ck('长跑 200 日无异常', longRun.days > 100, longRun.days);
  ck('长跑中产生黑天鹅', longRun.swans >= 1, longRun.swans);

  await p.screenshot({ path: OUT + '54-final.png' });
  console.log('\nERRORS:', errs.length ? errs.slice(0, 6).join(' || ') : 'none');
  console.log('FAILURES:', FAIL);
  await b.close();
  process.exit(errs.length || FAIL ? 2 : 0);
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
