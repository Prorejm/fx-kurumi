/* ============================================================
   game.js — 模拟撮合 / 账户 / 杠杆与退場
   现货规则: T+1 / 涨跌停 / 佣金最低5元 / 卖出印花税 / 沪市过户费
   杠杆规则: 维持担保比例 < 100% 触发ロスカット(强制平仓)
   ========================================================== */
window.Game = (function () {
  'use strict';

  const BASE = 1000000;          // 初始本金
  const FEE_RATE = 0.00025;      // 佣金 万2.5
  const FEE_MIN = 5;
  const TAX_RATE = 0.0005;       // 印花税 千0.5 (卖出)
  const TRANSFER_RATE = 0.00001; // 过户费 十万分之一(沪市, 双边)
  const SAVE_KEY = 'kurumi_save_v1';

  const G = {
    base: BASE, realized: 0, leverage: 1, mode: 'replay',
    positions: [], trades: [], history: [], log: [],
    startIdx: 0, tradeDays: {}, addic: 0, badges: {},
    margins: 0, warned: false, ruin: false, dead: false,
    peakEquity: BASE, maxDrawdown: 0, dayTrades: 0, totalBuys: 0, totalSells: 0,
    wins: 0, losses: 0, listeners: []
  };

  const emit = (ev, data) => G.listeners.forEach(f => f(ev, data || {}));

  /* ---------------- 费用 ---------------- */
  function buyFee(amount, code) {
    let f = Math.max(FEE_MIN, amount * FEE_RATE);
    if (code && code.indexOf('sh') === 0) f += amount * TRANSFER_RATE;
    return f;
  }
  function sellFee(amount, code) {
    let f = Math.max(FEE_MIN, amount * FEE_RATE);
    f += amount * TAX_RATE;
    if (code && code.indexOf('sh') === 0) f += amount * TRANSFER_RATE;
    return f;
  }

  /* ---------------- 账户派生量 ---------------- */
  function marketValue() {
    return G.positions.reduce((s, p) => s + Market.price(p.code) * p.shares, 0);
  }
  function unrealized() {
    return G.positions.reduce((s, p) => s + (Market.price(p.code) - p.cost) * p.shares, 0);
  }
  function equity() { return G.base + G.realized + unrealized(); }
  function usedMargin() {
    const L = Math.max(1, G.leverage);
    return G.positions.reduce((s, p) => s + Market.price(p.code) * p.shares / L, 0);
  }
  function avail() { return equity() - usedMargin(); }
  function marginRatio() {
    const m = usedMargin();
    if (m <= 0.0001) return null;
    return equity() / m * 100;
  }

  function summary() {
    const eq = equity(), mv = marketValue(), un = unrealized();
    const cost = G.positions.reduce((s, p) => s + p.cost * p.shares, 0);
    return {
      equity: eq, avail: avail(), mv, unrealized: un,
      returnPct: (eq - G.base) / G.base * 100,
      unrealizedPct: cost ? un / cost * 100 : 0,
      marginRatio: marginRatio(), leverage: G.leverage,
      ruin: G.ruin, base: G.base, realized: G.realized
    };
  }

  /* ---------------- 涨跌停 ---------------- */
  function limits(code) {
    const meta = Market.S.meta.find(m => m.code === code);
    const pc = Market.prevClose(code);
    if (!pc) return { up: Infinity, down: 0, pc: 0, pct: 10 };
    const q = Market.S.quotes[code];
    if (Market.S.mode === 'live' && q && q.limitUp > 0) return { up: q.limitUp, down: q.limitDown, pc, pct: meta ? meta.limitPct : 10 };
    const pct = meta ? meta.limitPct : 10;
    const up = Math.round(pc * (1 + pct / 100) * 100) / 100;
    const down = Math.round(pc * (1 - pct / 100) * 100) / 100;
    return { up, down, pc, pct };
  }

  /* ---------------- 交易 ---------------- */
  function pos(code) { return G.positions.find(p => p.code === code); }

  function sellable(code) {
    const p = pos(code); if (!p) return 0;
    const day = Market.date();
    if (G.mode === 'live') return (p.buyDays && p.buyDays.includes(day)) ? 0 : p.shares;
    return p.shares; // 回放模式: 当日买入次日可售 -> 用 openIdx 判定
  }

  function canSellShares(code) {
    const p = pos(code); if (!p) return 0;
    if (G.t0) return p.shares;                       // 已解除 T+1
    if (G.mode === 'live') {
      return (p.buyDays && p.buyDays.indexOf(Market.date()) >= 0) ? 0 : p.shares;
    }
    return (p.lastBuyIdx !== undefined && p.lastBuyIdx >= Market.idx) ? 0 : p.shares;
  }

  function buy(code, price, shares) {
    const meta = Market.S.meta.find(m => m.code === code);
    if (!meta || !meta.tradable) return ok(false, '指数不可交易');
    shares = Math.floor(shares / 100) * 100;
    if (shares < 100) return ok(false, '最小交易单位为 100 股');
    const bar = Market.bar(code);
    if (!bar) return ok(false, '无行情数据');
    const lim = limits(code);
    if (price > lim.up + 1e-6) return ok(false, '涨停板上买不到…排队也不一定能成交');
    if (price < lim.down - 1e-6) return ok(false, '低于跌停价，委托无效');
    if (price < bar.l - 1e-6) return ok(false, '当日最低价 ' + bar.l.toFixed(2) + '，你的限价挂得太低没成交');

    const amount = price * shares;
    const fee = buyFee(amount, code);
    const need = amount / G.leverage + fee;
    if (need > avail() + 1e-6) {
      return ok(false, G.leverage > 1
        ? '保证金不足 (需 ' + money(amount / G.leverage + fee) + ')'
        : '可用资金不足 (需 ' + money(need) + ')');
    }

    const existing = pos(code);
    if (existing) {
      const total = existing.shares + shares;
      existing.cost = (existing.cost * existing.shares + amount + fee) / total;
      existing.shares = total;
      existing.buyDays = existing.buyDays || [];
      if (existing.buyDays.indexOf(Market.date()) < 0) existing.buyDays.push(Market.date());
      existing.lastBuyIdx = Market.idx;
    } else {
      G.positions.push({
        code, shares, cost: (amount + fee) / shares,
        openIdx: Market.idx, buyDays: [Market.date()], lastBuyIdx: Market.idx
      });
    }
    G.realized -= fee;
    G.totalBuys++;
    G.addic = Math.min(100, G.addic + 2.2);
    if (G.leverage >= 5) G.addic = Math.min(100, G.addic + 2);
    log('买入', code, meta.name, shares + '股 @' + price.toFixed(2), 'up');
    G.trades.push({ side: 'B', code, name: meta.name, price, shares, fee, day: Market.date(), idx: Market.idx });
    award('first_trade');
    if (G.leverage >= 10) award('high_roller');
    if (G.positions.length >= 5) award('diversified');
    checkTday();
    after();
    return ok(true, '买入成交 ' + meta.name + ' ' + shares + ' 股');
  }

  function sell(code, price, shares) {
    const meta = Market.S.meta.find(m => m.code === code);
    const p = pos(code);
    if (!p) return ok(false, '你还没持有这只股票');
    const can = canSellShares(code);
    if (can <= 0) return ok(false, 'T+1 规则：今天买入的明天才能卖');
    shares = Math.floor(shares / 100) * 100;
    if (shares < 100) return ok(false, '卖出数量至少 100 股');
    shares = Math.min(shares, can, p.shares);
    const bar = Market.bar(code);
    const lim = limits(code);
    if (price < lim.down - 1e-6) return ok(false, '跌停板砸不出来…今天卖不掉');
    if (price > lim.up + 1e-6) return ok(false, '高于涨停价，委托无效');
    if (bar && price > bar.h + 1e-6) return ok(false, '当日最高价 ' + bar.h.toFixed(2) + '，挂得太高没成交');

    const amount = price * shares;
    const fee = sellFee(amount, code);
    const costAll = p.cost * shares;
    const pnl = amount - costAll - fee;
    G.realized += pnl;
    p.shares -= shares;
    if (p.shares <= 0) G.positions = G.positions.filter(x => x.code !== code);
    G.totalSells++;
    if (pnl > 0) { G.wins++; G.addic = Math.min(100, G.addic + 1.2); }
    else { G.losses++; G.addic = Math.max(0, G.addic - 1.5); }
    if (pnl / costAll > 0.3) award('big_win');
    log(pnl >= 0 ? '卖出' : '割肉', code, meta ? meta.name : code,
      shares + '股 @' + price.toFixed(2) + ' 盈亏' + (pnl >= 0 ? '+' : '') + money(pnl), pnl >= 0 ? 'up' : 'down');
    G.trades.push({ side: 'S', code, name: meta ? meta.name : code, price, shares, fee, pnl, day: Market.date(), idx: Market.idx });
    after();
    return ok(true, (pnl >= 0 ? '盈利了结 +' : '止损离场 ') + money(pnl), pnl >= 0 ? 'ok' : 'bad');
  }

  function closeAll(reason) {
    if (!G.positions.length) return [];
    const list = G.positions.slice();
    const out = [];
    list.forEach(p => {
      const price = Market.price(p.code);
      const shares = p.shares;
      const amount = price * shares;
      const fee = sellFee(amount, p.code);
      const pnl = amount - p.cost * shares - fee;
      G.realized += pnl;
      out.push({ code: p.code, shares, price, pnl });
      const meta = Market.S.meta.find(m => m.code === p.code);
      log(reason === 'cut' ? '强制平仓' : '卖出', p.code, meta ? meta.name : p.code,
        shares + '股 @' + price.toFixed(2) + ' 盈亏' + (pnl >= 0 ? '+' : '') + money(pnl), 'down');
    });
    G.positions = [];
    G.losses++;
    after();
    return out;
  }

  /* ---------------- 每日结算 ---------------- */
  function stepDay(n) {
    n = n || 1;
    const realN = Market.next(n);
    if (realN > 0) { G.dayTrades = 0; snapshotHistory(); check(); emitDay(); }
    return realN;
  }

  function snapshotHistory() {
    const i = Market.idx;
    if (G.history.length && G.history[G.history.length - 1].i === i) {
      G.history[G.history.length - 1].eq = equity();
      return;
    }
    G.history.push({ i, eq: equity(), bench: Market.benchLevel(i) });
  }

  function emitDay() {
    /* 检查持仓事件 */
    G.positions.forEach(p => {
      const c = Market.chg(p.code);
      if (c.pct >= 9.8) award('first_limit'), emit('limitUp', { code: p.code });
      if (c.pct <= -9.8) award('first_limit_down'), emit('limitDown', { code: p.code });
    });
  }

  /* 维持率检查 → 追加保证金 → 强制平仓 */
  function check() {
    const mr = marginRatio();
    const eq = equity();
    G.peakEquity = Math.max(G.peakEquity, eq);
    G.maxDrawdown = Math.max(G.maxDrawdown, (G.peakEquity - eq) / G.peakEquity * 100);

    if (G.leverage > 1 && mr !== null) {
      if (mr <= 130) {
        award('margin_call');
        if (!G.warned || mr <= 115) {
          G.warned = true;
          log('系统', '', '维持率', '维持担保比例 ' + mr.toFixed(1) + '% ⚠ 請尽快追加保证金', 'warn');
          emit('marginCall', { mr });
        }
      } else if (mr > 180) G.warned = false;

      if (mr <= 100) {
        const out = closeAll('cut');
        G.margins++;
        award('blown');
        emit('losscut', { mr, closed: out });
      }
    }
    if (eq <= G.base * 0.05) {
      G.ruin = true; G.dead = true;
      award('gameover');
      emit('ruin', {});
    }
  }

  function checkTday() {
    if (G.mode === 'live') return;
  }

  function after() {
    snapshotHistory();
    check();
    save();
    emit('change', {});
  }

  /* ---------------- 成就 ---------------- */
  const BADGES = [
    { id: 'first_trade', name: '第一手' },
    { id: 'first_limit', name: '抓到涨停' },
    { id: 'first_limit_down', name: '吃到跌停' },
    { id: 'big_win', name: '单笔+30%' },
    { id: 'diversified', name: '撒网5只' },
    { id: 'high_roller', name: '十倍赌徒' },
    { id: 'margin_call', name: '追加保证金' },
    { id: 'blown', name: '被强平过' },
    { id: 'gameover', name: '退 場' },
    { id: 'patient', name: '拿满60天' },
    { id: 'double', name: '资金翻倍' },
    { id: 'addicted', name: '中毒100%' }
  ];
  function award(id) {
    if (G.badges[id]) return;
    G.badges[id] = 1;
    const b = BADGES.find(x => x.id === id);
    if (b) { log('成就', '', '解锁', b.name, 'achv'); emit('badge', { name: b.name }); }
  }
  function checkBadges() {
    if (equity() >= G.base * 2) award('double');
    if (G.addic >= 99.5) award('addicted');
    G.positions.forEach(p => {
      if (Market.idx - p.openIdx >= 60) award('patient');
    });
  }

  /* ---------------- 日志 ---------------- */
  function log(kind, code, name, text, cls) {
    G.log.unshift({ kind, code, name, text, cls, day: Market.date(), t: Date.now() });
    if (G.log.length > 160) G.log.length = 160;
  }
  function clearLog() { G.log = []; save(); emit('change', {}); }

  function money(n) {
    const s = Math.abs(n) >= 10000 ? (n / 10000).toFixed(2) + '万' : n.toFixed(0);
    return (n >= 0 ? '' : '-') + s.replace('-', '');
  }
  function ok(v, msg, cls) { return { ok: v, msg, cls: cls || (v ? 'ok' : 'bad') }; }

  /* ---------------- 杠杆 ---------------- */
  function setLeverage(v) {
    const old = G.leverage;
    G.leverage = v;
    if (v > old) {
      G.addic = Math.min(100, G.addic + (v - old) * 1.6);
      emit('leverUp', { v });
    } else emit('leverDown', { v });
    check(); after();
  }

  /* ---------------- 存档 ---------------- */
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        base: G.base, realized: G.realized, leverage: G.leverage, mode: G.mode,
        positions: G.positions, history: G.history, startIdx: G.startIdx,
        addic: G.addic, badges: G.badges, margins: G.margins, ruin: G.ruin,
        dead: G.dead, peakEquity: G.peakEquity, maxDrawdown: G.maxDrawdown,
        wins: G.wins, losses: G.losses, totalBuys: G.totalBuys, totalSells: G.totalSells,
        trades: G.trades.slice(-120), log: G.log.slice(0, 60),
        idx: Market.idx, utime: Date.now()
      }));
    } catch (e) { }
  }
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function hasSave() { return !!loadSave(); }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } }

  function restore(sv) {
    if (!sv) return false;
    G.base = sv.base; G.realized = sv.realized; G.leverage = sv.leverage;
    G.positions = sv.positions || []; G.history = sv.history || [];
    G.startIdx = sv.startIdx; G.addic = sv.addic || 0; G.badges = sv.badges || {};
    G.margins = sv.margins || 0; G.ruin = !!sv.ruin; G.dead = !!sv.dead;
    G.peakEquity = sv.peakEquity || sv.base; G.maxDrawdown = sv.maxDrawdown || 0;
    G.wins = sv.wins || 0; G.losses = sv.losses || 0;
    G.totalBuys = sv.totalBuys || 0; G.totalSells = sv.totalSells || 0;
    G.trades = sv.trades || []; G.log = sv.log || [];
    G.mode = sv.mode || 'replay';
    if (sv.idx !== undefined) Market.setIdx(sv.idx);
    return true;
  }

  function reset(mode, leverage, startIdx, opt) {
    opt = opt || {};
    G.base = BASE; G.realized = 0; G.leverage = leverage || 1;
    G.positions = []; G.trades = []; G.log = []; G.history = [];
    G.addic = 0; G.badges = {}; G.margins = 0; G.ruin = false; G.dead = false;
    G.peakEquity = BASE; G.maxDrawdown = 0; G.wins = 0; G.losses = 0;
    G.totalBuys = 0; G.totalSells = 0; G.warned = false; G.dayTrades = 0;
    G.mode = mode || 'replay';
    Market.setIdx(startIdx);
    Market.S.mode = mode;
    G.startIdx = startIdx;
    G.t0 = !!opt.t0;
    snapshotHistory();
    save();
  }

  function on(fn) { G.listeners.push(fn); }

  return {
    G, buy, sell, closeAll, stepDay, summary, setLeverage, reset, restore,
    save, loadSave, hasSave, clearSave, save_key: SAVE_KEY,
    pos, canSellShares, sellable, limits, on, log, clearLog, award, checkBadges, check,
    buyFee, sellFee, marketValue, unrealized, equity, avail, marginRatio, usedMargin,
    money, emit, BASE, BADGES
  };
})();
