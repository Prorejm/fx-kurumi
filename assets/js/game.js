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
  const LOAN_LTV = 0.7;          // 质押率 70%
  const LOAN_RATE = 0.06;        // 质押贷款年化利率 6%
  const FUND_RATE = 0.02;        // 现金理财(货币基金)年化 2%
  const MORT_LTV = 0.6;          // 固定资产抵押率 60%
  const MORT_RATE = 0.04;        // 固定资产抵押年化 4%
  const CREDIT_START = 750;      // 初始信用分
  const CREDIT_BAD = 600;        // 失信阈值
  const SAVE_KEY = 'kurumi_save_v1';
  const LB_KEY = 'kurumi_lb_v1';

  /* ---------------- 固定资产 (可用于信用抵押) ---------------- */
  // value 为单位: 元; mort 为已抵押金额
  function defaultAssets() {
    return [
      { id: 'house', name: '名下住房', icon: '🏠', value: 2000000, mort: 0 },
      { id: 'shop', name: '投资商铺', icon: '🏪', value: 800000, mort: 0 },
      { id: 'car', name: '代步座驾', icon: '🚗', value: 200000, mort: 0 }
    ];
  }

  /* ---------------- 金融普法卡片 (依据我国现行法规) ---------------- */
  const LEGAL_TIPS = [
    { t: '融资融券的合法边界', b: '证券信用交易（融资融券）只能由取得证监会业务资格的证券公司开展。向不特定对象提供“场外配资”、代客操盘承诺保收益，属于非法证券活动，不受法律保护。本作里的杠杆仅为模拟。' },
    { t: '民间借贷利率司法保护上限', b: '根据《最高人民法院关于审理民间借贷案件适用法律若干问题的规定》，借贷利率超过合同成立时一年期 LPR 四倍的部分，法院不予支持。当前约在 13% 上下。游戏内质押贷款 6%、资产抵押 4% 均在法律保护区间内。' },
    { t: '失信被执行人高消费限制', b: '《最高人民法院关于限制被执行人高消费及有关消费的若干规定》：被纳入失信名单后，不得乘坐飞机、高铁一等座以上、不得在星级酒店消费、不得购买不动产、不得旅游度假等。游戏中信用分跌破阈值即触发“高消费限制”，无法再借新钱、无法新开仓。' },
    { t: '股票交易税费', b: 'A 股卖出单边征收印花税（现行 0.05%），佣金双边不超过成交额的 0.03%（最低 5 元），沪市过户费双边万 0.1。买入不收印花税。本作已按此标准计费。' },
    { t: '维持担保比例', b: '券商融资的维持担保比例 = 总资产 ÷ 总负债。低于 130% 会被要求追加担保物，低于 100% 将被强制平仓。本作质押贷款以持仓市值 70% 为额度、负债/市值低于 100% 即强平还贷。' },
    { t: '个人征信', b: '依据《征信业管理条例》，不良信贷记录会进入金融信用信息基础数据库，影响房贷、车贷与信用卡。按时还款、控制负债率，是维护信用的根本。' },
    { t: '非法集资与诈骗识别', b: '凡是“保本保收益”“拉人头返利”“境外平台高杠杆”多半是非法集资或诈骗。《防范和处置非法集资条例》明确予以打击。记住：收益与风险永远成正比。' },
    { t: '基金与理财不是存款', b: '公募基金、ETF、银行理财均不承诺保本保收益，净值会波动。购买前须做风险测评（风险适当性管理）。游戏内所有“理财”标的均为模拟净值，仅供学习。' },
    { t: '期货交易风险更高', b: '期货采用保证金交易且双向开仓，杠杆远高于股票，价格波动可在日内让本金归零。普通投资者参与前应充分认知杠杆与到期交割风险。' },
    { t: '“砍头息”违法，本金按实付认定', b: '《民法典》第670条：借款的利息不得预先在本金中扣除；预先扣除的，应当按实际借款数额返还并计算利息。借条写1万、到手7千的“砍头息”，法律上你只欠7千。' },
    { t: '“套路贷”是刑事犯罪', b: '以非法占有为目的，假借民间借贷之名，通过虚增债务、恶意垒高金额、制造违约、暴力或软暴力索债的，构成诈骗、敲诈勒索、非法拘禁等罪。遇到“套路贷”应立即报警。' },
    { t: '暴力催收 / 软暴力催收违法', b: '《刑法》第293条之一催收非法债务罪：以暴力、胁迫、限制人身自由、侵入住宅、恐吓跟踪骚扰等方式催收高利放贷等非法债务的，可处三年以下有期徒刑。爆通讯录、短信轰炸均属违法。' },
    { t: '网贷乱象与合规红线', b: '监管部门明令禁止“无场景现金贷”、诱导过度借贷、向无还款能力人群放贷，禁止违规收取高额砍头息与罚息。《网络小额贷款业务管理暂行办法》对杠杆率、利率、催收均有约束。' },
    { t: '花呗 / 借呗 / 信用卡都上征信', b: '花呗、借呗由持牌消费金融机构提供，信用卡取现属银行业务，均会向央行征信系统报送。逾期记录保存 5 年，影响房贷、车贷、就业与高消费。免息期一过，日息 0.05%（年化约 18%）并不便宜。' },
    { t: '亲友借贷：人情也是债', b: '向同学、朋友、亲戚借款属于自然人之间借贷，受《民法典》保护。虽多无息，但“欠钱不还”伤的是关系。金额较大建议出具借条、写明还款日期；无约定利息视为无息，约定利息不得超过一年期 LPR 四倍。' }
  ];

  /* ---------------- 非正规借贷 (仅供普法教育, 演示其危害) ---------------- */
  // 这些产品在法律上属于非法/不受保护范畴, 游戏内开放仅为让人「安全地体验一次陷阱」
  const ILLEGAL_LOANS = [
    {
      id: 'shark', name: '高利贷 · 砍头息', icon: '🩸', cut: 0.30, daily: 0.005, compound: false,
      term: 0,
      desc: '借 1 万，先扣 3000 “手续费”，到手只有 7000，但欠条写的还是 1 万。日息 0.5%，年化约 182%。',
      law: '年化远超一年期 LPR 四倍（约 13.8%），超出部分法院不予支持；“砍头息”依《民法典》第670条按实付本金认定。暴力催收可构成催收非法债务罪。'
    },
    {
      id: 'compound', name: '复利贷 · 利滚利', icon: '🌀', cut: 0.10, daily: 0.003, compound: true,
      term: 0,
      desc: '利息计入本金再计息，日息 0.3% 复利滚动。今天借 1 万，一年后可能变成还不起的天文数字。',
      law: '“利滚利”超出 LPR 四倍的部分不受法律保护（最高法民间借贷司法解释）。以复利方式虚增债务，是“套路贷”的典型手法。'
    },
    {
      id: 'payday', name: '网贷 · 现金贷', icon: '📱', cut: 0.20, daily: 0.002, compound: false,
      term: 14,
      desc: '7–14 天超短期，砍头息 20% + 逾期高额罚息。一旦逾期就“爆通讯录”，骚扰你所有亲友。',
      law: '禁止违规砍头息、高额罚息；爆通讯录、短信轰炸属于“软暴力催收”，依《刑法》第293条之一可能构成催收非法债务罪。'
    }
  ];

  /* ---------------- 持牌消费信贷 (合法但成本高昂) ---------------- */
  const CONSUMER_CREDIT = [
    {
      id: 'huabei', name: '花呗', icon: '🪷', cut: 0, daily: 0.0005, compound: false, term: 40, limit: 50000,
      desc: '先消费后还款，最长免息期约 40 天；逾期按日息 0.05%（年化约 18.25%）计息，并上报征信。',
      law: '花呗由持牌消费金融机构/小额贷款公司提供，属合法消费信贷。逾期会影响个人征信并可能被催收。理性消费、按时还款。'
    },
    {
      id: 'jiebei', name: '借呗', icon: '💰', cut: 0, daily: 0.00045, compound: false, term: 30, limit: 200000,
      desc: '现金贷，按日计息、随借随还，日息约 0.045%（年化约 16.4%），额度因人而异。',
      law: '借呗为持牌机构产品，合法但成本不低；逾期计罚息并影响征信。“以贷养贷”只会越陷越深。'
    },
    {
      id: 'card', name: '信用卡取现', icon: '💳', cut: 0.01, daily: 0.0005, compound: true, term: 30, limit: 100000,
      desc: '信用卡取现：一次性手续费约 1%，利息日息 0.05% 且按月复利，没有免息期。',
      law: '信用卡取现是银行合规业务，但成本高、按月复利；逾期影响征信，恶意透支长期不还可能构成信用卡诈骗罪。'
    }
  ];

  /* ---------------- 亲友借贷 (无息, 但人情最贵) ---------------- */
  const FRIEND_LOANS = [
    {
      id: 'classmate', name: '找同学借', icon: '🎓', cut: 0, daily: 0, compound: false, term: 30, trust: 8, limit: 50000,
      desc: '跟关系不错的同学开口。不收利息，但最好约定归还时间——人情比利息更贵。',
      law: '亲友间借款属自然人之间的民间借贷，受《民法典》保护。建议出具借条、写明金额与归还日期，避免日后纠纷。'
    },
    {
      id: 'friend', name: '找朋友借', icon: '🍻', cut: 0, daily: 0, compound: false, term: 45, trust: 12, limit: 100000,
      desc: '朋友是最后的流动资金。借了不还，朋友也就没了。',
      law: '自然人之间的借款合同自提供借款时生效；可约定利息（不得超过合同成立时一年期 LPR 四倍），无约定视为无息。'
    },
    {
      id: 'relative', name: '找亲戚借', icon: '🏮', cut: 0, daily: 0, compound: false, term: 60, trust: 20, limit: 300000,
      desc: '亲戚的钱最好借也最难还——因为还的是情分。往后每次家庭聚会都会被提起。',
      law: '亲属间借贷同样受法律保护。金额较大时建议书面约定，既保护债权，也维护亲情。'
    }
  ];

  const G = {
    base: BASE, realized: 0, leverage: 1, mode: 'replay',
    positions: [], trades: [], history: [], log: [],
    startIdx: 0, tradeDays: {}, addic: 0, badges: {},
    margins: 0, warned: false, ruin: false, dead: false,
    peakEquity: BASE, maxDrawdown: 0, dayTrades: 0, totalBuys: 0, totalSells: 0,
    wins: 0, losses: 0, listeners: [],
    debt: 0, debtInterest: 0, cashFund: false, loanWarned: false, _recorded: false,
    credit: CREDIT_START, assets: defaultAssets(),
    illLoans: [], illStage: 0, illCollected: 0,
    civLoans: [], relation: 100, relationWarned: false
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
    return G.positions.reduce((s, p) => {
      const diff = (p.side === 'short')
        ? (p.cost - Market.price(p.code))
        : (Market.price(p.code) - p.cost);
      return s + diff * p.shares;
    }, 0);
  }
  function debtTotal() { return G.debt + G.debtInterest; }
  function illTotal() { return G.illLoans.reduce((s, l) => s + l.owed, 0); }
  function civTotal() { return G.civLoans.reduce((s, l) => s + l.owed, 0); }
  function totalDebt() { return debtTotal() + illTotal() + civTotal(); }
  function equity() {
    return G.base + G.realized + unrealized() - debtTotal() - illTotal() - civTotal();
  }
  function usedMargin() {
    const L = Math.max(1, G.leverage);
    return G.positions.reduce((s, p) => s + Market.price(p.code) * p.shares / L, 0);
  }
  function loanAvail() { return Math.max(0, marketValue() * LOAN_LTV - debtTotal()); }
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
      ruin: G.ruin, base: G.base, realized: G.realized,
      debt: G.debt, debtInterest: G.debtInterest, debtTotal: debtTotal(),
      loanAvail: loanAvail(), cashFund: G.cashFund, loanRate: G.loanRate || LOAN_RATE,
      credit: G.credit, mortAvail: mortAvail(), assets: G.assets,
      creditBad: creditBlocked() !== null,
      illDebt: illTotal(), illLoans: G.illLoans, illStage: G.illStage,
      civDebt: civTotal(), civLoans: G.civLoans, relation: G.relation,
      totalDebt: totalDebt()
    };
  }

  /* ---------------- 涨跌停 ---------------- */
  function limits(code) {
    const meta = Market.S.meta.find(m => m.code === code);
    const pc = Market.prevClose(code);
    if (!pc) return { up: Infinity, down: 0, pc: 0, pct: meta ? meta.limitPct : 10 };
    const q = Market.S.quotes[code];
    if (Market.S.mode === 'live' && q && q.limitUp > 0) return { up: q.limitUp, down: q.limitDown, pc, pct: meta ? meta.limitPct : 10 };
    const pct = meta ? meta.limitPct : 10;
    if (pct <= 0) return { up: Infinity, down: 0, pc, pct: 0 };
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

  /* ---------------- 开仓路由 ---------------- */
  function buy(code, price, shares, side) {
    side = side || 'long';
    const cb = creditBlocked();
    if (cb) return ok(false, cb);
    const p = pos(code);
    if (p && p.shares > 0 && p.side !== side) {
      return ok(false, side === 'short' ? '你已持有多单，请先平仓再开空' : '你已持有空单，请先平仓再开多');
    }
    return side === 'short' ? openShort(code, price, shares) : buyLong(code, price, shares);
  }

  function buyLong(code, price, shares) {
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
        code, shares, cost: (amount + fee) / shares, side: 'long',
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

  function openShort(code, price, shares) {
    const meta = Market.S.meta.find(m => m.code === code);
    if (!meta || !meta.tradable) return ok(false, '指数不可交易');
    shares = Math.floor(shares / 100) * 100;
    if (shares < 100) return ok(false, '最小交易单位为 100 股');
    const bar = Market.bar(code);
    if (!bar) return ok(false, '无行情数据');
    const lim = limits(code);
    if (price > lim.up + 1e-6) return ok(false, '涨停板上开不了空（没人接盘）');
    if (price < lim.down - 1e-6) return ok(false, '跌停板上开不了空');
    if (price > bar.h + 1e-6) return ok(false, '当日最高价 ' + bar.h.toFixed(2) + '，挂太高没成交');

    const amount = price * shares;
    const fee = buyFee(amount, code);  // 融券卖出: 佣金+过户, 无印花税
    const need = amount / G.leverage + fee;
    if (need > avail() + 1e-6) {
      return ok(false, G.leverage > 1
        ? '保证金不足 (需 ' + money(amount / G.leverage + fee) + ')'
        : '可用资金不足 (需 ' + money(need) + ')');
    }

    const existing = pos(code);
    if (existing) {
      const total = existing.shares + shares;
      existing.cost = (existing.cost * existing.shares + amount - fee) / total;
      existing.shares = total;
      existing.buyDays = existing.buyDays || [];
      if (existing.buyDays.indexOf(Market.date()) < 0) existing.buyDays.push(Market.date());
      existing.lastBuyIdx = Market.idx;
    } else {
      G.positions.push({
        code, shares, cost: (amount - fee) / shares, side: 'short',
        openIdx: Market.idx, buyDays: [Market.date()], lastBuyIdx: Market.idx
      });
    }
    G.realized -= fee;
    G.totalBuys++;
    G.addic = Math.min(100, G.addic + 2.4);
    if (G.leverage >= 5) G.addic = Math.min(100, G.addic + 2);
    log('开空', code, meta.name, shares + '股 @' + price.toFixed(2), 'down');
    G.trades.push({ side: 'S_OPEN', code, name: meta.name, price, shares, fee, day: Market.date(), idx: Market.idx });
    award('first_short');
    if (G.leverage >= 10) award('high_roller');
    checkTday();
    after();
    return ok(true, '开空成交 ' + meta.name + ' ' + shares + ' 股');
  }

  function sell(code, price, shares) {
    const p = pos(code);
    if (!p || p.shares <= 0) return ok(false, '你还没持有这只股票');
    return (p.side === 'short') ? coverShort(code, price, shares) : sellLong(code, price, shares);
  }

  function sellLong(code, price, shares) {
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

  function coverShort(code, price, shares) {
    const meta = Market.S.meta.find(m => m.code === code);
    const p = pos(code);
    if (!p) return ok(false, '你还没持有这只股票');
    const can = canSellShares(code);
    if (can <= 0) return ok(false, 'T+1 规则：今天开的空明天才能平');
    shares = Math.floor(shares / 100) * 100;
    if (shares < 100) return ok(false, '平仓数量至少 100 股');
    shares = Math.min(shares, can, p.shares);
    const bar = Market.bar(code);
    const lim = limits(code);
    if (price < lim.down - 1e-6) return ok(false, '跌停板买不回来…今天平不掉');
    if (price > lim.up + 1e-6) return ok(false, '高于涨停价，委托无效');
    if (bar && price > bar.h + 1e-6) return ok(false, '当日最高价 ' + bar.h.toFixed(2) + '，挂太高没成交');

    const amount = price * shares;
    const fee = buyFee(amount, code);  // 买券还券: 佣金+过户, 无印花税
    const costAll = p.cost * shares;
    const pnl = (costAll - amount) - fee;
    G.realized += pnl;
    p.shares -= shares;
    if (p.shares <= 0) G.positions = G.positions.filter(x => x.code !== code);
    G.totalSells++;
    if (pnl > 0) { G.wins++; G.addic = Math.min(100, G.addic + 1.2); award('short_win'); }
    else { G.losses++; G.addic = Math.max(0, G.addic - 1.5); }
    if (pnl / costAll > 0.3) award('big_win');
    log(pnl >= 0 ? '平空' : '空单止损', code, meta ? meta.name : code,
      shares + '股 @' + price.toFixed(2) + ' 盈亏' + (pnl >= 0 ? '+' : '') + money(pnl), pnl >= 0 ? 'up' : 'down');
    G.trades.push({ side: 'S_CLOSE', code, name: meta ? meta.name : code, price, shares, fee, pnl, day: Market.date(), idx: Market.idx });
    after();
    return ok(true, (pnl >= 0 ? '空单了结 +' : '空单止损 ') + money(pnl), pnl >= 0 ? 'ok' : 'bad');
  }

  function closeAll(reason) {
    if (!G.positions.length) return [];
    const list = G.positions.slice();
    const out = [];
    list.forEach(p => {
      const price = Market.price(p.code);
      const shares = p.shares;
      const amount = price * shares;
      const fee = (p.side === 'short' ? buyFee : sellFee)(amount, p.code);
      const pnl = (p.side === 'short')
        ? (p.cost * shares - amount - fee)
        : (amount - p.cost * shares - fee);
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
    if (realN > 0) { accrueInterest(realN); G.dayTrades = 0; snapshotHistory(); check(); emitDay(); }
    return realN;
  }

  function accrueInterest(days) {
    days = days || 1;
    // 现金理财: 闲钱投货币基金, 按日计息 (~2% 年化)
    if (G.cashFund) {
      const idle = Math.max(0, avail());
      if (idle > 0) G.realized += idle * (FUND_RATE / 252) * days;
    }
    // 质押贷款: 按日计息 (年化 LOAN_RATE)
    if (G.debt > 0) {
      G.debtInterest += G.debt * ((G.loanRate || LOAN_RATE) / 252) * days;
    }
    accrueIllegal(days);
    accrueCivil(days);
    creditTick(days);
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
        updateCredit(-40);
        emit('losscut', { mr, closed: out });
      }
    }

    if (G.debt > 0) checkLoan();
    checkCollect();
    checkCivil();

    if (eq <= G.base * 0.05) {
      G.ruin = true; G.dead = true;
      award('gameover');
      updateCredit(-100);
      emit('ruin', {});
    }
  }

  /* 质押贷款: 以维持担保比例监控, 跌破则强制平仓还贷 */
  function checkLoan() {
    const mv = marketValue();
    const ratio = debtTotal() > 0 ? mv / debtTotal() : Infinity;
    if (ratio < 1.0) {
      const closed = forceRepay();
      G.margins++;
      award('loan_blown');
      emit('loancut', { ratio, closed });
      log('系统', '', '融资', '质押维持率 ' + (ratio * 100).toFixed(0) + '% < 100%，强制平仓还贷', 'warn');
    } else if (ratio < 1.3) {
      if (!G.loanWarned) {
        G.loanWarned = true;
        log('系统', '', '融资', '质押维持率 ' + (ratio * 100).toFixed(0) + '% ⚠ 请及时还款', 'warn');
        emit('loanWarn', { ratio });
      }
    } else G.loanWarned = false;
  }

  function forceRepay() {
    const out = closeAll('loan');
    const pay = Math.min(debtTotal(), Math.max(0, G.realized));
    G.realized -= pay;
    G.debt = Math.max(0, G.debt - pay);
    if (G.debt <= 0) { G.debt = 0; G.debtInterest = 0; }
    updateCredit(-60);
    return out;
  }

  /* ---------------- 质押贷款 (实时抵押借现金) ---------------- */
  function pledge(amount) {
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入借款金额');
    const cb = creditBlocked();
    if (cb) return ok(false, cb);
    if (amount > loanAvail() + 1e-6) return ok(false, '可质押额度不足 (当前可贷 ' + money(loanAvail()) + ')');
    G.realized += amount;   // 现金入账
    G.debt += amount;
    G.addic = Math.min(100, G.addic + 1);
    log('融资', '', '质押贷款', '借入 ' + money(amount) + ' (年化 ' + ((G.loanRate || LOAN_RATE) * 100).toFixed(0) + '%)', 'up');
    award('first_loan');
    updateCredit(-3);
    after();
    return ok(true, '已借入 ' + money(amount));
  }
  function repay(amount) {
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入还款金额');
    const pay = Math.min(amount, debtTotal());
    if (pay <= 0) return ok(false, '当前无负债');
    G.realized -= pay;
    G.debt = Math.max(0, G.debt - pay);
    if (G.debt <= 0) G.debtInterest = 0;
    log('融资', '', '还款', '偿还 ' + money(pay), 'down');
    after();
    return ok(true, '已偿还 ' + money(pay));
  }
  function setCashFund(v) { G.cashFund = !!v; save(); emit('change', {}); }

  /* ---------------- 信用分 ---------------- */
  // 信用分 < CREDIT_BAD 触发「高消费限制」：不能再借新钱、不能再新开仓
  function creditBlocked() {
    if (G.credit < CREDIT_BAD) return '信用分 ' + Math.round(G.credit) + ' 已跌破阈值 ' + CREDIT_BAD +
      '，触发高消费限制：无法新开仓、无法新增借款。请先还款修复信用。';
    return null;
  }
  function updateCredit(delta) {
    G.credit = Math.max(300, Math.min(CREDIT_START + 50, G.credit + delta));
    G.credit = Math.round(G.credit * 10) / 10;
    if (G.credit < CREDIT_BAD) award('credit_bad');
    save();
  }
  function creditTick(days) {
    days = days || 1;
    for (let i = 0; i < days; i++) {
      if (debtTotal() <= 0) G.credit = Math.min(CREDIT_START, G.credit + 1);
      else {
        const r = debtTotal() / Math.max(1, equity());
        if (r > 0.6) G.credit = Math.max(300, G.credit - 1);
        else G.credit = Math.min(CREDIT_START, G.credit + 0.5);
      }
    }
    G.credit = Math.round(G.credit * 10) / 10;
  }

  /* ---------------- 固定资产信用抵押 ---------------- */
  function mortAvail() {
    return G.assets.reduce((s, a) => s + Math.max(0, a.value * MORT_LTV - a.mort), 0);
  }
  function mortgage(assetId, amount) {
    const cb = creditBlocked();
    if (cb) return ok(false, cb);
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入借款金额');
    const a = G.assets.find(x => x.id === assetId);
    if (!a) return ok(false, '未找到该资产');
    const maxMort = Math.floor(a.value * MORT_LTV - a.mort);
    if (amount > maxMort + 1) return ok(false, '该资产可抵押额度不足 (当前可贷 ' + money(maxMort) + ')');
    G.realized += amount;     // 现金入账
    G.debt += amount;
    a.mort += amount;
    updateCredit(-2);
    log('融资', '', '资产抵押', a.icon + a.name + ' 抵押借入 ' + money(amount) +
      ' (年化 ' + (MORT_RATE * 100).toFixed(0) + '%)', 'up');
    award('first_mort');
    after();
    return ok(true, '已用「' + a.name + '」抵押借入 ' + money(amount));
  }
  function redeem(assetId, amount) {
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入还款金额');
    const a = G.assets.find(x => x.id === assetId);
    if (!a) return ok(false, '未找到该资产');
    if (a.mort <= 0) return ok(false, '该资产没有抵押负债');
    const pay = Math.min(amount, a.mort, debtTotal());
    if (pay <= 0) return ok(false, '当前无负债');
    G.realized -= pay;
    G.debt = Math.max(0, G.debt - pay);
    if (G.debt <= 0) { G.debt = 0; G.debtInterest = 0; }
    a.mort = Math.max(0, a.mort - pay);
    log('融资', '', '资产赎楼', '偿还 ' + a.icon + a.name + ' 抵押 ' + money(pay), 'down');
    // 还款修复信用
    if (debtTotal() <= 0) updateCredit(3);
    after();
    return ok(true, '已偿还「' + a.name + '」抵押 ' + money(pay));
  }

  /* ---------------- 非正规借贷: 高利贷 / 复利贷 / 网贷 (普法演示) ---------------- */
  function illProduct(pid) { return ILLEGAL_LOANS.find(p => p.id === pid); }

  function borrowIllegal(pid, amount) {
    const p = illProduct(pid);
    if (!p) return ok(false, '未知的借贷产品');
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入借款金额');
    if (amount > 500000) return ok(false, '单笔民间借贷最多 50 万（模拟上限）');
    const cut = amount * p.cut;
    const net = amount - cut;
    G.realized += net;                 // 实际到手 (砍头息先扣)
    G.illLoans.push({
      id: pid, name: p.name, icon: p.icon, principal: amount,
      owed: amount, daily: p.daily, compound: p.compound,
      startDay: Market.idx, term: p.term, overdue: false
    });
    G.addic = Math.min(100, G.addic + 4);
    updateCredit(-8);
    log('借贷', '', p.name, '名义借 ' + money(amount) + '，砍头息扣 ' + money(cut) +
      '，实际到手 ' + money(net), 'warn');
    award('first_ill');
    emit('illBorrow', { product: p });
    after();
    return ok(true, '到手 ' + money(net) + '（砍头息 ' + money(cut) + '，欠条 ' + money(amount) + '）');
  }

  function repayIllegal(index, amount) {
    const l = G.illLoans[index];
    if (!l) return ok(false, '未找到该笔借款');
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入还款金额');
    const pay = Math.min(amount, l.owed, Math.max(0, avail()));
    if (pay <= 0) return ok(false, '可用资金不足，先卖出持仓筹钱吧');
    G.realized -= pay;
    l.owed = Math.max(0, l.owed - pay);
    const cleared = l.owed <= 0.5;
    if (cleared) G.illLoans.splice(index, 1);
    log('借贷', '', '还款', '偿还 ' + l.name + ' ' + money(pay) + (cleared ? ' · 已结清' : ''), 'down');
    if (!G.illLoans.length) { G.illStage = 0; updateCredit(6); award('ill_cleared'); }
    after();
    return ok(true, (cleared ? '已结清 ' : '已还款 ') + money(pay));
  }

  function accrueIllegal(days) {
    days = days || 1;
    G.illLoans.forEach(l => {
      if (l.compound) l.owed = l.owed * Math.pow(1 + l.daily, days);
      else l.owed = l.owed * (1 + l.daily * days);
      if (l.term > 0 && (Market.idx - l.startDay) > l.term) l.overdue = true;
    });
  }

  /* 催收: 逾期 / 金额升级 → 短信轰炸 → 爆通讯录 → 上门 & 强制处置财产 */
  function checkCollect() {
    if (!G.illLoans.length) return;
    const anyOverdue = G.illLoans.some(l => l.overdue);
    const total = illTotal();
    let stage = 0;
    if (anyOverdue || total > G.base * 0.5) stage = 1;
    if (anyOverdue && total > G.base * 1.2) stage = 2;
    if (total > G.base * 3) stage = 3;
    if (stage <= G.illStage) return;
    G.illStage = stage;
    G.illCollected++;
    updateCredit(-15 * stage);
    if (stage === 1) {
      log('催收', '', '威胁', '【短信轰炸】“欠债还钱天经地义”——一天几十条催收短信涌进来', 'warn');
    } else if (stage === 2) {
      log('催收', '', '爆通讯录', '【爆通讯录】催收电话打给你所有亲友、同事、领导，社会性死亡', 'warn');
    } else if (stage === 3) {
      log('催收', '', '上门', '【上门/暴力催收】对方上门堵人、限制人身自由——这已涉嫌犯罪', 'warn');
      let short = illTotal();
      G.assets.forEach(a => {
        if (short > 0 && a.value - a.mort > 0) {
          const take = Math.min(a.value - a.mort, short);
          a.mort += take; short -= take;
          log('催收', '', '处置资产', a.icon + a.name + ' 被强制处置抵债 ' + money(take), 'warn');
        }
      });
      if (short > 0) {
        G.illLoans = [];
        G.ruin = true; G.dead = true;
        award('gameover');
        emit('ruin', { viaIll: true });
      }
    }
    emit('collect', { stage });
  }

  /* ---------------- 持牌消费信贷 & 亲友借贷 ---------------- */
  function civProduct(pid) {
    return CONSUMER_CREDIT.find(p => p.id === pid) || FRIEND_LOANS.find(p => p.id === pid) || null;
  }
  function borrowCivil(pid, amount) {
    const p = civProduct(pid);
    if (!p) return ok(false, '未知的借款产品');
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入借款金额');
    if (amount > p.limit) return ok(false, p.name + ' 单笔最多 ' + money(p.limit));
    const isFriend = FRIEND_LOANS.indexOf(p) >= 0;
    if (isFriend) {
      if (G.relation <= 0) return ok(false, '亲友已不愿再借钱给你（人情耗尽）。先把欠的还上吧。');
      if (G.relation < 20) return ok(false, '人情所剩无几（' + Math.round(G.relation) + '），没人愿意再借了。');
    }
    const cut = amount * p.cut;
    const net = amount - cut;
    G.realized += net;
    G.civLoans.push({
      kind: isFriend ? 'friend' : 'consumer', id: pid, name: p.name, icon: p.icon,
      principal: amount, owed: amount, daily: p.daily, compound: !!p.compound,
      term: p.term || 0, trust: p.trust || 0, startDay: Market.idx,
      overdue: false, penalized: false
    });
    if (isFriend) { G.relation = Math.max(0, G.relation - 2); award('first_friend'); }
    else { updateCredit(-2); award('first_credit'); }
    log('借贷', '', p.name,
      (isFriend ? '开口借到 ' : '借入 ') + money(amount) + (cut > 0 ? '（手续费 ' + money(cut) + '）' : ''),
      isFriend ? 'warn' : 'up');
    emit('civBorrow', { product: p });
    after();
    return ok(true, '到手 ' + money(net) + (cut > 0 ? '（手续费 ' + money(cut) + '，欠 ' + money(amount) + '）' : ''));
  }
  function repayCivil(index, amount) {
    const l = G.civLoans[index];
    if (!l) return ok(false, '未找到该笔借款');
    amount = Math.floor(amount);
    if (amount <= 0) return ok(false, '请输入还款金额');
    const pay = Math.min(amount, l.owed, Math.max(0, avail()));
    if (pay <= 0) return ok(false, '可用资金不足，先卖出持仓筹钱吧');
    G.realized -= pay;
    l.owed = Math.max(0, l.owed - pay);
    const cleared = l.owed <= 0.5;
    if (cleared) G.civLoans.splice(index, 1);
    if (cleared) {
      if (l.kind === 'friend') {
        if (!l.overdue) G.relation = Math.min(100, G.relation + l.trust);
        award('friend_paid');
        log('借贷', '', '有借有还', '还清 ' + l.name + ' ' + money(pay) +
          (l.overdue ? '（曾逾期，人情未回补）' : '，人情 +' + l.trust), 'down');
      } else {
        updateCredit(2);
        log('借贷', '', '还款', '结清 ' + l.name + ' ' + money(pay), 'down');
      }
    } else {
      log('借贷', '', '还款', '偿还 ' + l.name + ' ' + money(pay), 'down');
    }
    after();
    return ok(true, (cleared ? '已结清 ' : '已还款 ') + money(pay));
  }
  function accrueCivil(days) {
    days = days || 1;
    G.civLoans.forEach(l => {
      if (l.kind === 'friend') {
        if (l.term > 0 && (Market.idx - l.startDay) > l.term) l.overdue = true;
        return;
      }
      if (l.compound) l.owed = l.owed * Math.pow(1 + l.daily, days);
      else l.owed = l.owed * (1 + l.daily * days);
      if (l.term > 0 && (Market.idx - l.startDay) > l.term) l.overdue = true;
    });
  }
  /* 消费信贷逾期 → 征信受损; 亲友借款逾期 → 人情受损 */
  function checkCivil() {
    if (!G.civLoans.length) { G.relationWarned = false; return; }
    G.civLoans.forEach(l => {
      if (!l.overdue || l.penalized) return;
      l.penalized = true;
      if (l.kind === 'consumer') {
        updateCredit(-20);
        log('征信', '', '逾期', l.name + ' 逾期未还，征信记录受损（信用分 -20）', 'warn');
        emit('civOverdue', { kind: 'consumer', name: l.name });
      } else {
        G.relation = Math.max(0, G.relation - l.trust);
        log('人情', '', '催还', '借了「' + l.name + '」的钱逾期未还，对方在群里 @ 了你（人情 -' + l.trust + '）', 'warn');
        emit('civOverdue', { kind: 'friend', name: l.name });
        if (G.relation <= 0 && !G.relationWarned) {
          G.relationWarned = true;
          log('人情', '', '众叛亲离', '该还的都没还，亲友圈已经没人愿意理你了。', 'warn');
          award('relation_bad');
        }
      }
    });
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
    { id: 'addicted', name: '中毒100%' },
    { id: 'first_short', name: '初次做空' },
    { id: 'short_win', name: '空头和了' },
    { id: 'first_loan', name: '融资初体验' },
    { id: 'first_mort', name: '抵押借款' },
    { id: 'loan_blown', name: '质押爆仓' },
    { id: 'credit_bad', name: '失信名单' },
    { id: 'first_ill', name: '借了高利贷' },
    { id: 'ill_cleared', name: '上岸成功' },
    { id: 'first_credit', name: '用上花呗' },
    { id: 'first_friend', name: '开口借钱' },
    { id: 'friend_paid', name: '有借有还' },
    { id: 'relation_bad', name: '众叛亲离' }
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
        debt: G.debt, debtInterest: G.debtInterest, cashFund: G.cashFund,
        credit: G.credit, assets: G.assets,
        illLoans: G.illLoans, illStage: G.illStage, illCollected: G.illCollected,
        civLoans: G.civLoans, relation: G.relation,
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
    G.positions = (sv.positions || []).map(p => Object.assign({ side: 'long' }, p));
    G.history = sv.history || [];
    G.startIdx = sv.startIdx; G.addic = sv.addic || 0; G.badges = sv.badges || {};
    G.margins = sv.margins || 0; G.ruin = !!sv.ruin; G.dead = !!sv.dead;
    G.peakEquity = sv.peakEquity || sv.base; G.maxDrawdown = sv.maxDrawdown || 0;
    G.wins = sv.wins || 0; G.losses = sv.losses || 0;
    G.totalBuys = sv.totalBuys || 0; G.totalSells = sv.totalSells || 0;
    G.trades = sv.trades || []; G.log = sv.log || [];
    G.mode = sv.mode || 'replay';
    G.debt = sv.debt || 0; G.debtInterest = sv.debtInterest || 0;
    G.cashFund = !!sv.cashFund; G.loanWarned = false; G._recorded = false;
    G.credit = (sv.credit !== undefined) ? sv.credit : CREDIT_START;
    G.assets = sv.assets || defaultAssets();
    G.illLoans = sv.illLoans || []; G.illStage = sv.illStage || 0;
    G.illCollected = sv.illCollected || 0;
    G.civLoans = sv.civLoans || [];
    G.relation = (sv.relation !== undefined) ? sv.relation : 100;
    G.relationWarned = false;
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
    G.debt = 0; G.debtInterest = 0; G.cashFund = false; G.loanWarned = false; G._recorded = false;
    G.credit = CREDIT_START; G.assets = defaultAssets();
    G.illLoans = []; G.illStage = 0; G.illCollected = 0;
    G.civLoans = []; G.relation = 100; G.relationWarned = false;
    G.mode = mode || 'replay';
    Market.setIdx(startIdx);
    Market.S.mode = mode;
    G.startIdx = startIdx;
    G.t0 = !!opt.t0;
    snapshotHistory();
    save();
  }

  /* ---------------- 排行榜 (localStorage + 对手) ---------------- */
  function recordRun(name) {
    try {
      const s = summary();
      const entry = {
        name: (name || '你').slice(0, 12), ret: +(s.returnPct).toFixed(2),
        equity: Math.round(s.equity), mode: G.mode, lev: G.leverage,
        zone: (G.positions[0] && Market.meta.find(m => m.code === G.positions[0].code) || {}).zone || 'A',
        days: (Market.idx - G.startIdx + 1), date: new Date().toISOString().slice(0, 10)
      };
      const raw = localStorage.getItem(LB_KEY);
      let arr = raw ? JSON.parse(raw) : [];
      arr.push(entry);
      arr.sort((a, b) => b.ret - a.ret);
      arr = arr.slice(0, 50);
      localStorage.setItem(LB_KEY, JSON.stringify(arr));
      return entry;
    } catch (e) { return null; }
  }
  function getLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch (e) { return []; }
  }
  function clearLeaderboard() { try { localStorage.removeItem(LB_KEY); } catch (e) { } }

  function on(fn) { G.listeners.push(fn); }

  return {
    G, buy, sell, closeAll, stepDay, summary, setLeverage, reset, restore,
    save, loadSave, hasSave, clearSave, save_key: SAVE_KEY,
    pos, canSellShares, sellable, limits, on, log, clearLog, award, checkBadges, check,
    buyFee, sellFee, marketValue, unrealized, equity, avail, marginRatio, usedMargin,
    loanAvail, debtTotal, pledge, repay, setCashFund, recordRun, getLeaderboard, clearLeaderboard,
    mortgage, redeem, mortAvail, creditBlocked, updateCredit, illTotal,
    borrowIllegal, repayIllegal,
    borrowCivil, repayCivil, civTotal, totalDebt,
    money, emit, BASE, BADGES, LOAN_RATE, FUND_RATE,
    MORT_RATE, MORT_LTV, CREDIT_START, CREDIT_BAD, LEGAL_TIPS, ILLEGAL_LOANS,
    CONSUMER_CREDIT, FRIEND_LOANS
  };
})();
