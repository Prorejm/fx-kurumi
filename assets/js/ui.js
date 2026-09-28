/* ============================================================
   ui.js — 视图渲染 / 交互
   ========================================================== */
window.UI = (function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const el = {};
  const S = {
    code: '', view: 'kline', bars: 90, offset: 0,
    sort: 'chg', filter: '', rows: {}, posRows: {},
    tempFace: null, faceTimer: 0, lastFace: '', layout: null,
    auto: null, curBarsCache: null, zone: 'A', direction: 'long'
  };

  function num(v, d) { return (+v || 0).toFixed(d === undefined ? 2 : d); }
  function money(n, long) {
    if (!isFinite(n)) return '--';
    const a = Math.abs(n);
    if (long || a < 10000) return (n < 0 ? '-' : '') + '¥' + Math.round(a).toLocaleString('en-US');
    return (n < 0 ? '-' : '') + '¥' + (a / 10000).toFixed(2) + '万';
  }
  function cls(v) { return v > 0 ? 'up' : (v < 0 ? 'down' : 'flat'); }
  function pct(v) { return (v >= 0 ? '+' : '') + num(v, 2) + '%'; }

  function cache() {
    ['app', 'intro', 'boot', 'bootBar', 'sEquity', 'sReturn', 'sAvail', 'sMktVal', 'sPnl',
      'charAvatar', 'charBubble', 'introAvatar', 'introLine', 'modeBadge', 'dateBadge', 'liveDot',
      'mbVal', 'mbFill', 'levChip', 'marginBar', 'debtChip', 'cashChip', 'stockList', 'posList', 'logList', 'badges',
      'curName', 'curCode', 'curPrice', 'curChg', 'curOpen', 'curHigh', 'curLow', 'curPrev', 'curTurn',
      'indexStrip', 'kchart', 'equityChart', 'crosshair', 'priceInput', 'qtyInput',
      'calcAmt', 'calcFee', 'calcMargin', 'buyBtn', 'sellBtn', 'buySub', 'sellSub',
      'searchInput', 'sortBtn', 'nextDayBtn', 'next5Btn', 'autoBtn', 'leverBtn', 'restartBtn',
      'closeAllBtn', 'clearLog', 'posCount', 'addFill', 'addTxt', 'statsMini', 'toast',
      'fx', 'fxAvatar', 'fxWord', 'fxSub', 'fxBtn', 'startBtn', 'continueBtn',
      'introLev', 'introLevVal', 'levModal', 'levSlider', 'levVal', 'levOk',
      'loanBtn', 'loanModal', 'loanTabs', 'loanBody',
      'lbBtn', 'lbModal', 'lbBody', 'lbRecord', 'lbClear',
      'lawBtn', 'lawModal', 'lawBody'
    ].forEach(id => { el[id] = document.getElementById(id); });
    el.chartWrap = $('.chart-wrap');
    el.crosshair = document.getElementById('crosshair');
  }

  /* ---------------- Toast ---------------- */
  let toastT = 0;
  function toast(msg, kind) {
    const t = el.toast; if (!t) return;
    t.innerHTML = msg;
    t.className = 'toast show ' + (kind || '');
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.className = 'toast ' + (kind || ''); }, 2400);
  }

  /* ---------------- 表情 ---------------- */
  function setFace(state, lineHtml, anim) {
    if (!el.charAvatar) return;
    el.charAvatar.innerHTML = Char.face(state, { anim: anim || '' });
    if (lineHtml) el.charBubble.innerHTML = '<div class="bubble"><p>' + lineHtml + '</p></div>';
    S.lastFace = state;
  }
  function tempFace(state, lineHtml, ms, anim) {
    S.tempFace = { state, line: lineHtml, anim };
    clearTimeout(S.faceTimer);
    S.faceTimer = setTimeout(() => { S.tempFace = null; refreshFace(); }, ms || 2600);
    refreshFace();
  }
  function refreshFace(force) {
    const s = Game.summary();
    if (S.tempFace) { setFace(S.tempFace.state, S.tempFace.line, S.tempFace.anim); return; }
    if (s.ruin) { setFace('dead', Game.G._lastWords || Char.lineForState('dead'), 'av-shake'); return; }
    const st = Char.mood(s);
    setFace(st, Char.lineForState(st),
      st === 'panic' ? 'av-shake'
        : (st === 'broken' || st === 'dead') ? 'av-shake'
          : st === 'greedy' ? 'av-bounce' : '');
  }

  /* ---------------- 股票池 ---------------- */
  function buildWatch() {
    S.rows = {};
    el.stockList.innerHTML = '';
    const q = S.filter.trim().toLowerCase();
    let list = Market.tradable;
    if (S.zone && S.zone !== 'ALL') list = list.filter(m => m.zone === S.zone);
    if (q) list = list.filter(m =>
      m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) ||
      (m.ind || '').toLowerCase().includes(q));
    const arr = list.map(m => {
      const b = Market.bar(m.code);
      const c = Market.chg(m.code);
      return { m, b, c };
    });
    arr.sort((a, b) => {
      if (S.sort === 'chg') return b.c.pct - a.c.pct;
      if (S.sort === 'price') return (b.b ? b.b.c : 0) - (a.b ? a.b.c : 0);
      if (S.sort === 'name') return a.m.name.localeCompare(b.m.name, 'zh');
      return a.m.code.localeCompare(b.m.code);
    });
    if (!arr.length) {
      el.stockList.innerHTML = '<div class="empty">没有匹配的股票<br>试试搜「茅台」「银行」</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    arr.forEach(x => {
      const d = document.createElement('div');
      d.className = 'srow' + (x.m.code === S.code ? ' on' : '');
      d.dataset.code = x.m.code;
      d.innerHTML = `<div class="nm"><b>${x.m.name}</b><i>${x.m.code.slice(2)} · ${x.m.ind}</i></div>
        <div class="pv"><b data-p>—</b><span data-c>—</span></div>`;
      S.rows[x.m.code] = { node: d, p: d.querySelector('[data-p]'), c: d.querySelector('[data-c]') };
      frag.appendChild(d);
    });
    el.stockList.appendChild(frag);
    updateWatch();
  }

  function updateWatch() {
    for (const code in S.rows) {
      const r = S.rows[code];
      const b = Market.bar(code), c = Market.chg(code);
      if (!b) continue;
      const k = cls(c.pct);
      r.p.textContent = num(b.c);
      r.p.className = k;
      r.c.textContent = (c.abs >= 0 ? '+' : '') + num(c.abs) + ' ' + pct(c.pct);
      r.c.className = k;
    }
    renderIndexStrip();
  }

  function renderIndexStrip() {
    if (!el.indexStrip) return;
    const idxs = Market.meta.filter(m => !m.tradable);
    el.indexStrip.innerHTML = idxs.slice(0, 4).map(m => {
      const b = Market.bar(m.code), c = Market.chg(m.code);
      if (!b) return '';
      return `<div class="idx">${m.name}<b class="${cls(c.pct)}">${num(b.c, 1)}</b>
        <span class="${cls(c.pct)}">${pct(c.pct)}</span></div>`;
    }).join('');
  }

  /* ---------------- 持仓 ---------------- */
  function renderPos() {
    if (!Game.G.positions.length) {
      el.posList.innerHTML = '<div class="empty">空仓。<br>空仓也是一种操作。</div>';
      el.posCount.textContent = '0';
      return;
    }
    el.posCount.textContent = String(Game.G.positions.length);
    el.posList.innerHTML = Game.G.positions.map(p => {
      const meta = Market.meta.find(m => m.code === p.code) || { name: p.code, ind: '' };
      const pr = Market.price(p.code);
      const mv = pr * p.shares, cost = p.cost * p.shares;
      const pnl = (p.side === 'short') ? (p.cost - pr) * p.shares : (pr - p.cost) * p.shares;
      const r = cost ? pnl / cost * 100 : 0;
      const can = Game.canSellShares(p.code);
      const sideTag = `<i class="side-tag ${p.side}">${p.side === 'short' ? '空' : '多'}</i>`;
      return `<div class="prow ${p.code === S.code ? 'on' : ''}" data-code="${p.code}">
        <div class="r1"><b>${meta.name}</b>${sideTag}<em>${p.shares}股${can < p.shares ? ' (T+1冻结)' : ''}</em>
          <span class="${cls(pnl)}">${pct(r)}</span></div>
        <div class="r2">
          <div><span>成本</span><b>${num(p.cost)}</b></div>
          <div><span>现价</span><b class="${cls(pr - p.cost)}">${num(pr)}</b></div>
          <div><span>市值</span><b>${money(mv)}</b></div>
          <div><span>盈亏</span><b class="${cls(pnl)}">${pnl >= 0 ? '+' : '-'}${money(Math.abs(pnl))}</b></div>
        </div></div>`;
    }).join('');
  }

  function renderLog() {
    if (!Game.G.log.length) {
      el.logList.innerHTML = '<div class="empty">还没有任何操作记录</div>';
      return;
    }
    el.logList.innerHTML = Game.G.log.slice(0, 60).map(l => {
      const day = (l.day || '').slice(5);
      let c = '';
      if (l.kind === '买入') c = 'up';
      else if (l.kind === '卖出') c = l.cls === 'up' ? 'up' : 'down';
      else if (l.kind === '割肉' || l.kind === '强制平仓') c = 'down';
      else if (l.kind === '系统') c = 'up';
      else if (l.kind === '成就') c = 'up';
      return `<div class="lrow"><time>${day}</time><div><em class="${c}">${l.kind}</em>
        ${l.name ? l.name + ' ' : ''}${l.text}</div></div>`;
    }).join('');
  }

  /* ---------------- 顶栏报价 ---------------- */
  function renderTop() {
    if (!S.code) return;
    const meta = Market.meta.find(m => m.code === S.code) || {};
    const b = Market.bar(S.code);
    if (!b) return;
    const c = Market.chg(S.code);
    const lim = Game.limits(S.code);
    el.curName.textContent = meta.name || S.code;
    el.curCode.textContent = S.code + ' · ' + (meta.ind || '');
    el.curPrice.textContent = num(b.c);
    el.curPrice.className = cls(c.pct);
    el.curChg.innerHTML = `<span class="${cls(c.pct)}">${c.abs >= 0 ? '+' : ''}${num(c.abs)} ${pct(c.pct)}</span>`;
    el.curOpen.textContent = num(b.o); el.curHigh.textContent = num(b.h);
    el.curLow.textContent = num(b.l); el.curPrev.textContent = num(lim.pc);
    const q = Market.S.quotes[S.code];
    el.curTurn.textContent = q && q.turn ? num(q.turn) + '%' : (Market.S.mode === 'live' ? '--' : '—');
    const posDiv = Game.pos(S.code);
    el.sellSub.textContent = '可卖 ' + (posDiv ? Game.canSellShares(S.code) : 0) + ' 股';
  }

  /* ---------------- HUD ---------------- */
  function renderHud() {
    const s = Game.summary();
    el.sEquity.textContent = money(s.equity, true);
    el.sEquity.className = 'stat-v ' + cls(s.returnPct);
    el.sReturn.textContent = pct(s.returnPct);
    el.sReturn.className = 'stat-v ' + cls(s.returnPct);
    el.sAvail.textContent = money(s.avail);
    el.sMktVal.textContent = money(s.mv);
    el.sPnl.textContent = (s.unrealized >= 0 ? '+' : '-') + money(Math.abs(s.unrealized));
    el.sPnl.className = 'stat-v ' + cls(s.unrealized);
    el.dateBadge.textContent = Market.date() + ' · 第 ' + (Market.idx - Game.G.startIdx + 1) + ' 天';
    el.modeBadge.textContent = Game.G.mode === 'live' ? '实盘同步' : '历史回放';

    /* 维持率 */
    const L = Game.G.leverage;
    el.levChip.textContent = '杠杆 ' + L + 'x';
    if (L <= 1 || s.marginRatio === null) {
      el.mbVal.textContent = '∞';
      el.mbFill.style.width = '100%';
      el.mbFill.className = 'mb-fill';
    } else {
      const r = Math.max(0, Math.min(500, s.marginRatio));
      el.mbVal.textContent = r.toFixed(1) + '%';
      el.mbFill.style.width = (r / 500 * 100) + '%';
      el.mbFill.className = 'mb-fill ' + (r <= 100 ? 'danger' : (r <= 160 ? 'warn' : ''));
    }
    /* 可买/可卖副标题 */
    el.buySub.textContent = '可用 ' + money(s.avail);
    const p = Game.pos(S.code);
    el.sellSub.textContent = '可卖 ' + (p ? Game.canSellShares(S.code) : 0) + ' 股';

    /* 质押负债 / 民间借贷 / 信用 / 现金理财 */
    if (el.debtChip) {
      const parts = [];
      if (s.debtTotal > 0) parts.push('负债 ' + money(s.debtTotal) +
        ' · 日息 ' + money(s.debtTotal * (s.loanRate / 252)));
      if (s.illDebt > 0) parts.push('⚠民间借贷 ' + money(s.illDebt));
      if (s.civDebt > 0) parts.push('信贷/亲友 ' + money(s.civDebt));
      if (s.creditBad) parts.push('失信 ' + Math.round(s.credit) + '分');
      if (parts.length) {
        el.debtChip.classList.remove('hidden');
        el.debtChip.classList.toggle('danger-chip', s.illDebt > 0 || s.civDebt > 0 || s.creditBad);
        el.debtChip.textContent = parts.join(' | ');
      } else el.debtChip.classList.add('hidden');
    }
    if (el.cashChip) {
      if (s.cashFund) {
        el.cashChip.classList.remove('hidden');
        el.cashChip.textContent = '理财 ON · 日息 ' + money(Math.max(0, s.avail) * (0.02 / 252));
      } else el.cashChip.classList.add('hidden');
    }
  }

  function renderFoot() {
    /* 中毒度 + 成就 */
    const a = Math.round(Game.G.addic);
    if (el.addFill) el.addFill.style.width = a + '%';
    if (el.addTxt) el.addTxt.textContent = '中毒度 ' + a + '%';
    if (el.badges) {
      el.badges.innerHTML = Game.BADGES.map(b =>
        `<span class="bg-chip ${Game.G.badges[b.id] ? 'got' : ''}" title="${Game.G.badges[b.id] ? '已解锁' : '未解锁'}">${b.name}</span>`
      ).join('');
    }
    const s = Game.summary();
    const winRate = (Game.G.wins + Game.G.losses) ? (Game.G.wins / (Game.G.wins + Game.G.losses) * 100).toFixed(0) : '--';
    if (el.statsMini) {
      el.statsMini.innerHTML =
        `已交易 <b>${Game.G.totalBuys + Game.G.totalSells}</b> 次 · 胜率 <b>${winRate}%</b><br>
         最大回撤 <b>${num(Game.G.maxDrawdown, 1)}%</b> · 强平 <b>${Game.G.margins}</b> 次`;
    }
    /* 战绩曲线 */
    drawEquity();
  }

  function drawEquity() {
    const h = Game.G.history;
    if (!h || h.length < 2) { ChartKit.equity(el.equityChart, null); return; }
    const base = h[0].bench || 1;
    ChartKit.equity(el.equityChart,
      h.map(x => x.eq),
      h.map(x => (x.bench / base) * (Game.G.base)),
      h.map(x => x.d));
  }

  /* ---------------- 图表 ---------------- */
  function chartData() {
    if (S.view === 'week') return Market.agg(S.code, 'week', S.bars, Market.idx - S.offset);
    const all = Market.series(S.code, S.bars + 60, Market.idx - S.offset);
    return all.slice(-S.bars);
  }

  function drawChart() {
    if (!S.code) return;
    const p = Game.pos(S.code);
    if (S.view === 'minute') {
      if (Market.S.mode === 'live') {
        const id = Market.S.intraday[S.code];
        if (id && id.length) {
          ChartKit.minute(el.kchart, id.map(x => ({ p: x.p, v: x.v })), Market.prevClose(S.code));
          return;
        }
      }
      const r = Market.restored(S.code, Market.idx);
      if (r) { ChartKit.minute(el.kchart, r.pts, r.prevClose, '当日走势 (开高低收还原)'); return; }
      ChartKit.minute(el.kchart, null, 0, '暂无分时数据');
      return;
    }
    const bars = chartData();
    const opts = { showMA: true, cross: S.cross, costLine: p ? p.cost : null };
    S.layout = ChartKit.candles(el.kchart, bars, opts);
    S.layoutBars = bars;
  }

  function handleCross(e) {
    if (!S.layout || S.view === 'minute') { el.crosshair.classList.add('hidden'); return; }
    const rect = el.kchart.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const L = S.layout;
    const i = Math.round((x - L.padL) / L.step - 0.5);
    const bars = S.layoutBars || [];
    if (i < 0 || i >= bars.length) { el.crosshair.classList.add('hidden'); S.cross = null; drawChart(); return; }
    S.cross = { index: i };
    el.crosshair.classList.remove('hidden');
    el.crosshair.style.left = (L.X(i)) + 'px';
    el.crosshair.style.top = '0px';
    el.crosshair.style.height = rect.height + 'px';
    el.crosshair.style.borderBottom = 'none';
    const b = bars[i];
    el.crosshair.innerHTML = `<div class="box" style="left:${L.X(i) > rect.width / 2 ? '-132px' : '8px'};top:10px">
      日期 ${b.d}<br>开 ${num(b.o)} 高 ${num(b.h)}<br>低 ${num(b.l)} 收 ${num(b.c)}<br>
      量 ${ChartKit.kvol(b.v)}<br>
      <span style="color:#e8912b">MA5 ${b.ma5 ? num(b.ma5) : '--'}</span>
    </div>`;
    drawChart();
  }

  /* ---------------- 交易面板 ---------------- */
  function syncCalc() {
    const price = parseFloat(el.priceInput.value) || 0;
    const qty = parseInt(el.qtyInput.value, 10) || 0;
    const amt = price * qty;
    el.calcAmt.textContent = money(amt, true);
    el.calcFee.textContent = money(Game.buyFee(amt, S.code), true);
    el.calcMargin.textContent = money(amt / Math.max(1, Game.G.leverage), true);
  }

  function fillPrice() {
    if (!S.code) return;
    const b = Market.bar(S.code);
    if (b) el.priceInput.value = b.c.toFixed(2);
    syncCalc();
  }

  function maxBuyable() {
    const s = Game.summary();
    const price = parseFloat(el.priceInput.value) || 0;
    if (price <= 0) return 0;
    const feeGuess = 0.001;
    let cash = s.avail * Game.G.leverage / (1 + Game.G.leverage * feeGuess * 0.1);
    if (Game.G.leverage <= 1) cash = (s.avail - 5) / (1 + 0.00035);
    return Math.floor(cash / price / 100) * 100;
  }

  function doBuy() {
    const price = parseFloat(el.priceInput.value) || 0;
    const qty = parseInt(el.qtyInput.value, 10) || 0;
    const r = Game.buy(S.code, price, qty, S.direction);
    toast(r.msg, r.ok ? 'ok' : 'bad');
    if (r.ok) {
      if (S.direction === 'short')
        tempFace('greedy', '空单开好了！跌下来就是利润～', 2200, 'av-pop');
      else
        tempFace('eager', '买进了！这只是开始……', 2200, 'av-pop');
      Game.checkBadges();
    }
    refreshAll();
  }
  function doSell() {
    const price = parseFloat(el.priceInput.value) || 0;
    const qty = parseInt(el.qtyInput.value, 10) || 0;
    const r = Game.sell(S.code, price, qty);
    toast(r.msg, r.cls);
    if (r.ok) {
      const t = Game.G.trades[Game.G.trades.length - 1];
      const won = t && t.pnl >= 0;
      const shortClose = t && t.side === 'S_CLOSE';
      tempFace(won ? 'happy' : 'sad',
        won ? (shortClose ? '空单收割成功！这波跌得漂亮～' : '赚到了！这个感觉……还想再来一次♪')
            : '呜呜……本金又少了一块……',
        2400, won ? 'av-pop' : 'av-shake');
      Game.checkBadges();
    }
    refreshAll();
  }

  function updateDirUI() {
    document.querySelectorAll('.dtab').forEach(t => {
      t.classList.toggle('active', t.dataset.dir === S.direction);
    });
    const bl = el.buyBtn && el.buyBtn.querySelector('.buy-label');
    const sl = el.sellBtn && el.sellBtn.querySelector('.sell-label');
    if (S.direction === 'short') {
      if (bl) bl.textContent = '卖 空 开 仓';
      if (sl) sl.textContent = '买 回 平 仓';
    } else {
      if (bl) bl.textContent = '买 入';
      if (sl) sl.textContent = '卖 出';
    }
  }

  /* ---------------- 全量刷新 ---------------- */
  let rafPending = false;
  function refreshAll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      updateWatch();
      renderPos(); renderLog(); renderTop(); renderHud(); renderFoot();
      drawChart(); syncCalc(); refreshFace();
    });
  }

  function select(code) {
    S.code = code;
    S.offset = 0;
    Object.keys(S.rows).forEach(c => {
      S.rows[c].node.classList.toggle('on', c === code);
    });
    if (S.rows[code] && S.rows[code].node.scrollIntoView) {
      S.rows[code].node.scrollIntoView({ block: 'nearest' });
    }
    fillPrice();
    renderTop(); drawChart();
    const b = Market.bar(code);
    if (b) el.priceInput.value = b.c.toFixed(2);
    el.qtyInput.value = 0;
    syncCalc();
  }

  /* ---------------- 退場演出 ---------------- */
  function showFx(face, word, sub, btnTxt) {
    el.fxAvatar.innerHTML = Char.face(face, { anim: 'av-shake' });
    el.fxWord.textContent = word;
    el.fxSub.innerHTML = sub;
    el.fxBtn.textContent = btnTxt || '重 新 开 始';
    el.fx.classList.remove('hidden');
  }
  function hideFx() { el.fx.classList.add('hidden'); }

  /* ================= 融资 · 信用 · 借贷中心 ================= */
  let loanTab = 'credit';
  function openModal(id) { const m = el[id]; if (m) m.classList.remove('hidden'); }
  function closeModal(id) { const m = el[id]; if (m) m.classList.add('hidden'); }

  const pctOf = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';

  function civRow(l, i) {
    return `<div class="ill-row">
      <span>${l.icon} ${l.name}${l.overdue ? ' <em class="od">已逾期</em>' : ''}</span>
      <b class="${l.overdue ? 'down' : ''}">${money(l.owed)}</b>
      <input class="civRepayAmt" data-i="${i}" type="number" step="1000" value="0" placeholder="还款">
      <button class="btn btn-ghost sm civRepay" data-i="${i}">还款</button></div>`;
  }

  function renderLoan() {
    if (!el.loanBody) return;
    const s = Game.summary();
    document.querySelectorAll('.ltab').forEach(t => t.classList.toggle('active', t.dataset.lt === loanTab));
    let h = '';

    if (loanTab === 'credit') {
      const c = Math.round(s.credit);
      const band = c >= 700 ? 'good' : (c >= Game.CREDIT_BAD ? 'mid' : 'bad');
      const bandTxt = band === 'good' ? '良好' : band === 'mid' ? '一般' : '失信';
      h += `<div class="credit-card ${band}">
        <div class="cc-score"><span>信用分</span><b>${c}</b><em>${bandTxt}</em>
          <div class="cc-bar"><i style="width:${Math.max(0, Math.min(100, (c - 300) / 5.5))}%"></i></div>
        </div>
        <div class="cc-meta">
          <div><span>正规负债(质押+抵押)</span><b class="${s.debtTotal > 0 ? 'down' : ''}">${money(s.debtTotal)}</b></div>
          <div><span>可质押额度</span><b>${money(s.loanAvail)}</b></div>
          <div><span>资产可抵押额度</span><b>${money(s.mortAvail)}</b></div>
          <div><span>民间借贷欠款</span><b class="${s.illDebt > 0 ? 'down' : ''}">${money(s.illDebt)}</b></div>
          <div><span>消费信贷欠款</span><b class="${s.civDebt > 0 ? 'down' : ''}">${money(s.civDebt)}</b></div>
          <div><span>总负债</span><b class="${s.totalDebt > 0 ? 'down' : ''}">${money(s.totalDebt)}</b></div>
          <div><span>人情 / 关系</span><b class="${s.relation < 40 ? 'down' : ''}">${Math.round(s.relation)}</b></div>
          <div><span>累计被催收</span><b class="${Game.G.illCollected > 0 ? 'down' : ''}">${Game.G.illCollected} 次</b></div>
          <div><span>当前杠杆</span><b>${Game.G.leverage}x</b></div>
        </div>
      </div>`;
      const cb = Game.creditBlocked();
      if (cb) h += `<div class="warn-bar big">⚠ 高消费限制已生效<span>${cb}</span></div>`;
      h += `<div class="mini-note">信用分低于 ${Game.CREDIT_BAD} 触发失信惩戒：无法新开仓、无法新增借款。按时还款、降低负债率可逐步修复（负债清零时每日 +1）。</div>`;
    }

    if (loanTab === 'bank') {
      const rate = (Game.LOAN_RATE * 100).toFixed(0);
      h += `<div class="loan-sec">
        <div class="ls-hd">质押贷款 <span class="tag">正规 · 券商两融</span></div>
        <div class="ls-desc">以持仓市值质押借入现金，年化约 ${rate}%，按日计息。负债 ÷ 持仓市值低于 100% 将被强制平仓还贷。</div>
        <div class="ls-row">
          <div><span>可贷额度</span><b>${money(s.loanAvail)}</b></div>
          <div><span>当前负债</span><b>${money(s.debtTotal)}</b></div>
          <div><span>持仓市值</span><b>${money(s.mv)}</b></div>
        </div>
        <div class="ls-input">
          <input id="loanAmt" type="number" step="10000" value="0" placeholder="金额（元）">
          <button class="btn btn-primary sm" id="loanDoPledge">借入</button>
          <button class="btn btn-ghost sm" id="loanDoRepay">还款</button>
        </div>
      </div>
      <div class="loan-sec">
        <div class="ls-hd">现金理财 <span class="tag ${s.cashFund ? 'on' : ''}">${s.cashFund ? '已开启' : '已关闭'}</span></div>
        <div class="ls-desc">闲置资金自动买入货币基金，年化约 ${(Game.FUND_RATE * 100).toFixed(0)}%，按日计息，随时可用。</div>
        <button class="btn ${s.cashFund ? 'btn-ghost' : 'btn-primary'} sm" id="loanToggleFund">${s.cashFund ? '关闭理财' : '开启理财'}</button>
      </div>`;
    }

    if (loanTab === 'asset') {
      h += `<div class="mini-note">固定资产抵押：抵押率 ${(Game.MORT_LTV * 100).toFixed(0)}%，年化 ${(Game.MORT_RATE * 100).toFixed(0)}%。抵押金额计入总负债，利息按日累计。抵押资产在失信/极端催收下可能被强制处置。</div>`;
      (s.assets || []).forEach(a => {
        const avail = Math.max(0, a.value * Game.MORT_LTV - a.mort);
        h += `<div class="asset-card">
          <div class="ac-hd">${a.icon} ${a.name}</div>
          <div class="ac-meta"><span>估值 ${money(a.value, true)}</span><span>已抵押 ${money(a.mort)}</span><span>可抵押 <b>${money(avail)}</b></span></div>
          <div class="ls-input">
            <input class="assetAmt" data-id="${a.id}" type="number" step="10000" value="0" placeholder="金额（元）">
            <button class="btn btn-primary sm assetMort" data-id="${a.id}">抵押借入</button>
            <button class="btn btn-ghost sm assetRedeem" data-id="${a.id}">赎楼还款</button>
          </div></div>`;
      });
    }

    if (loanTab === 'consumer') {
      h += `<div class="mini-note">持牌消费信贷：合法，但年化普遍 16%–18%。花呗有免息期，借呗随借随还，信用卡取现按月复利且无免息期。逾期会<b>上报征信</b>。</div>`;
      Game.CONSUMER_CREDIT.forEach(p => {
        const apr = (p.compound ? (Math.pow(1 + p.daily, 365) - 1) : p.daily * 365) * 100;
        h += `<div class="cc-card">
          <div class="ic-hd">${p.icon} ${p.name} <span class="ic-apr">年化≈${apr.toFixed(1)}%</span></div>
          <div class="ic-desc">${p.desc}</div>
          <div class="ic-law">⚖ ${p.law}</div>
          <div class="ls-input">
            <input class="civAmt" data-id="${p.id}" type="number" step="1000" value="0" placeholder="金额（上限 ${money(p.limit)}）">
            <button class="btn btn-primary sm civDo" data-id="${p.id}">借入</button>
          </div></div>`;
      });
      const mine = (s.civLoans || []).map((l, i) => ({ l, i })).filter(x => x.l.kind === 'consumer');
      if (mine.length) {
        h += `<div class="loan-sec"><div class="ls-hd">我的消费信贷欠款</div>`;
        mine.forEach(x => { h += civRow(x.l, x.i); });
        h += `<div class="mini-note">按时还款可修复征信；逾期扣信用分并影响后续借贷。</div></div>`;
      }
    }

    if (loanTab === 'friend') {
      const rel = Math.round(s.relation);
      const rc = rel >= 70 ? 'good' : rel >= 40 ? 'mid' : 'bad';
      h += `<div class="credit-card ${rc}">
        <div class="cc-score"><span>人情 / 关系</span><b>${rel}</b>
          <em>${rel >= 70 ? '铁哥们' : rel >= 40 ? '一般' : '快凉了'}</em>
          <div class="cc-bar"><i style="width:${Math.max(0, Math.min(100, rel))}%"></i></div></div>
        <div class="mini-note" style="margin:0">亲友借款不收利息，但每拖一天都在消耗人情。按时还款——关系会更铁。</div>
      </div>`;
      Game.FRIEND_LOANS.forEach(p => {
        h += `<div class="friend-card">
          <div class="ic-hd">${p.icon} ${p.name} <span class="ic-apr">无息 · 人情 ${p.trust}</span></div>
          <div class="ic-desc">${p.desc}</div>
          <div class="ic-law">⚖ ${p.law}</div>
          <div class="ls-input">
            <input class="civAmt" data-id="${p.id}" type="number" step="1000" value="0" placeholder="金额（上限 ${money(p.limit)}）">
            <button class="btn btn-primary sm civDo" data-id="${p.id}">开口借</button>
          </div></div>`;
      });
      const mine2 = (s.civLoans || []).map((l, i) => ({ l, i })).filter(x => x.l.kind === 'friend');
      if (mine2.length) {
        h += `<div class="loan-sec"><div class="ls-hd">欠亲友的钱</div>`;
        mine2.forEach(x => { h += civRow(x.l, x.i); });
        h += `<div class="mini-note">亲友的钱最好借也最难还——还的是情分。趁早还，别把关系拖没了。</div></div>`;
      }
    }

    if (loanTab === 'ill') {
      h += `<div class="warn-bar big">⚠ 以下为<b>非法 / 不受法律保护</b>的借贷产品，仅作普法演示<span>年化远超一年期 LPR 四倍（约 13.8%）。“砍头息”“利滚利”“爆通讯录”均属违法，请勿在现实中触碰。</span></div>`;
      Game.ILLEGAL_LOANS.forEach(p => {
        const apr = (p.compound ? (Math.pow(1 + p.daily, 365) - 1) : p.daily * 365) * 100;
        h += `<div class="ill-card">
          <div class="ic-hd">${p.icon} ${p.name} <span class="ic-apr">年化≈${apr.toFixed(0)}%</span></div>
          <div class="ic-desc">${p.desc}</div>
          <div class="ic-law">⚖ ${p.law}</div>
          <div class="ls-input">
            <input class="illAmt" data-id="${p.id}" type="number" step="10000" value="0" placeholder="想借多少">
            <button class="btn btn-ill sm illDo" data-id="${p.id}">我要借 ⚠</button>
          </div></div>`;
      });
      if (s.illLoans && s.illLoans.length) {
        h += `<div class="loan-sec"><div class="ls-hd">我的民间借贷欠款</div>`;
        s.illLoans.forEach((l, i) => {
          h += `<div class="ill-row">
            <span>${l.icon} ${l.name}${l.overdue ? ' <em class="od">已逾期</em>' : ''}</span>
            <b class="down">${money(l.owed)}</b>
            <input class="illRepayAmt" data-i="${i}" type="number" step="10000" value="0" placeholder="还款">
            <button class="btn btn-ghost sm illRepay" data-i="${i}">还款</button></div>`;
        });
        h += `<div class="mini-note">欠款按日累加，逾期触发催收：短信轰炸 → 爆通讯录 → 上门并强制处置财产。及时还款、尽快上岸是唯一出路。</div></div>`;
      }
    }
    el.loanBody.innerHTML = h;
    bindLoanBody();
  }

  function bindLoanBody() {
    const q = id => el.loanBody.querySelector('#' + id);
    const g = id => q(id);
    if (g('loanDoPledge')) g('loanDoPledge').onclick = () => {
      const r = Game.pledge(+g('loanAmt').value || 0); toast(r.msg, r.ok ? 'ok' : 'bad');
      if (r.ok) { renderLoan(); refreshAll(); }
    };
    if (g('loanDoRepay')) g('loanDoRepay').onclick = () => {
      const r = Game.repay(+g('loanAmt').value || 0); toast(r.msg, r.ok ? 'ok' : 'bad');
      if (r.ok) { renderLoan(); refreshAll(); }
    };
    if (g('loanToggleFund')) g('loanToggleFund').onclick = () => { Game.setCashFund(!Game.G.cashFund); renderLoan(); refreshAll(); };

    el.loanBody.querySelectorAll('.assetMort').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      const inp = el.loanBody.querySelector('.assetAmt[data-id="' + id + '"]');
      const r = Game.mortgage(id, +inp.value || 0); toast(r.msg, r.ok ? 'ok' : 'bad');
      if (r.ok) { renderLoan(); refreshAll(); }
    });
    el.loanBody.querySelectorAll('.assetRedeem').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      const inp = el.loanBody.querySelector('.assetAmt[data-id="' + id + '"]');
      const r = Game.redeem(id, +inp.value || 0); toast(r.msg, r.ok ? 'ok' : 'bad');
      if (r.ok) { renderLoan(); refreshAll(); }
    });
    el.loanBody.querySelectorAll('.illDo').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      const p = Game.ILLEGAL_LOANS.find(x => x.id === id);
      const inp = el.loanBody.querySelector('.illAmt[data-id="' + id + '"]');
      if (!window.confirm('⚠ 这是违法借贷！\n\n' + p.desc + '\n\n法律提示：' + p.law + '\n\n本作仅为普法演示，确定要借吗？')) return;
      const r = Game.borrowIllegal(id, +inp.value || 0); toast(r.msg, r.ok ? 'warn' : 'bad');
      if (r.ok) { tempFace('panic', '别借啊……这种东西会连本带利吃掉你的。', 3200, 'av-shake'); renderLoan(); refreshAll(); }
    });
    el.loanBody.querySelectorAll('.illRepay').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      const inp = el.loanBody.querySelector('.illRepayAmt[data-i="' + i + '"]');
      const r = Game.repayIllegal(i, +inp.value || 0); toast(r.msg, r.ok ? 'ok' : 'bad');
      if (r.ok) { renderLoan(); refreshAll(); }
    });
    /* 花呗/借呗/信用卡 + 亲友借款 */
    el.loanBody.querySelectorAll('.civDo').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      const inp = el.loanBody.querySelector('.civAmt[data-id="' + id + '"]');
      const r = Game.borrowCivil(id, +inp.value || 0); toast(r.msg, r.ok ? 'ok' : 'bad');
      if (r.ok) { renderLoan(); refreshAll(); }
    });
    el.loanBody.querySelectorAll('.civRepay').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      const inp = el.loanBody.querySelector('.civRepayAmt[data-i="' + i + '"]');
      const r = Game.repayCivil(i, +inp.value || 0); toast(r.msg, r.ok ? 'ok' : 'bad');
      if (r.ok) { renderLoan(); refreshAll(); }
    });
  }

  function openLoanModal() { openModal('loanModal'); renderLoan(); refreshAll(); }

  /* ================= 排行榜 ================= */
  function renderLb() {
    if (!el.lbBody) return;
    const list = Game.getLeaderboard();
    const s = Game.summary();
    let h = `<div class="lb-self">本次：收益率 <b class="${cls(s.returnPct)}">${pctOf(s.returnPct)}</b>
      · 净资产 ${money(s.equity, true)} · ${Game.G.mode === 'live' ? '实盘同步' : '历史回放'} · 杠杆 ${Game.G.leverage}x</div>`;
    if (!list.length) h += `<div class="empty">还没有任何记录。<br>点「记录本次成绩」上榜。</div>`;
    else {
      h += `<div class="lb-table">`;
      list.forEach((e, i) => {
        const mc = e.ret > 0 ? 'up' : (e.ret < 0 ? 'down' : 'flat');
        const rk = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
        h += `<div class="lb-row ${e.name === '你' ? 'me' : ''}">
          <span class="rk">${rk}</span><b>${e.name}</b>
          <span class="${mc}">${(e.ret >= 0 ? '+' : '') + e.ret.toFixed(2)}%</span>
          <em>${money(e.equity, true)} · ${e.lev}x · ${e.days}天 · ${e.date}</em></div>`;
      });
      h += `</div>`;
    }
    el.lbBody.innerHTML = h;
  }
  function openLbModal() { openModal('lbModal'); renderLb(); }

  /* ================= 金融普法 ================= */
  function renderLaw() {
    if (!el.lawBody) return;
    let h = `<div class="law-warn">⚖ 非法借贷的法律定性（本作仅为演示，切勿模仿）</div>`;
    Game.ILLEGAL_LOANS.forEach(p => {
      h += `<div class="law-card ill"><b>${p.icon} ${p.name}</b><p>${p.law}</p></div>`;
    });
    h += `<div class="law-warn">📖 金融法律常识</div><div class="law-grid">`;
    (Game.LEGAL_TIPS || []).forEach(t => { h += `<div class="law-card"><b>${t.t}</b><p>${t.b}</p></div>`; });
    h += `</div>`;
    el.lawBody.innerHTML = h;
  }
  function openLawModal() { openModal('lawModal'); renderLaw(); }

  function bind(map) {
    cache();
    /* 列表点击 */
    el.stockList.addEventListener('click', e => {
      const row = e.target.closest('.srow');
      if (row) select(row.dataset.code);
    });
    el.posList.addEventListener('click', e => {
      const row = e.target.closest('.prow');
      if (row) select(row.dataset.code);
    });
    el.searchInput.addEventListener('input', e => { S.filter = e.target.value; buildWatch(); });
    el.sortBtn.addEventListener('click', () => {
      const order = ['chg', 'price', 'name', 'code'];
      S.sort = order[(order.indexOf(S.sort) + 1) % order.length];
      buildWatch();
      toast('排序：' + { chg: '涨幅', price: '价格', name: '名称', code: '代码' }[S.sort]);
    });
    /* 图表切换 */
    document.querySelectorAll('.ctab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.ctab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        S.view = t.dataset.view;
        drawChart();
      });
    });
    /* 十字光标 */
    el.chartWrap.addEventListener('mousemove', handleCross);
    el.chartWrap.addEventListener('mouseleave', () => {
      el.crosshair.classList.add('hidden'); S.cross = null; drawChart();
    });
    /* 缩放 */
    el.chartWrap.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.deltaY < 0) S.bars = Math.max(24, S.bars - 8);
      else S.bars = Math.min(300, S.bars + 8);
      drawChart();
    }, { passive: false });

    /* 交易输入 */
    document.getElementById('priceMinus').onclick = () => {
      el.priceInput.value = (Math.max(0.01, (+el.priceInput.value || 0) - 0.01)).toFixed(2); syncCalc();
    };
    document.getElementById('pricePlus').onclick = () => {
      el.priceInput.value = ((+el.priceInput.value || 0) + 0.01).toFixed(2); syncCalc();
    };
    document.getElementById('qtyMinus').onclick = () => {
      el.qtyInput.value = Math.max(0, (+el.qtyInput.value || 0) - 100); syncCalc();
    };
    document.getElementById('qtyPlus').onclick = () => {
      el.qtyInput.value = (+el.qtyInput.value || 0) + 100; syncCalc();
    };
    document.getElementById('priceMkt').onclick = fillPrice;
    el.priceInput.addEventListener('input', syncCalc);
    el.qtyInput.addEventListener('input', syncCalc);

    document.querySelectorAll('.qbtn').forEach(b => {
      b.addEventListener('click', () => {
        const q = b.dataset.q;
        if (q === 'clear') { el.qtyInput.value = 0; syncCalc(); return; }
        const mb = maxBuyable();
        const el2 = el.qtyInput;
        if (q === 'all') el2.value = mb;
        if (q === 'half') el2.value = Math.floor(mb / 2 / 100) * 100;
        if (q === 'third') el2.value = Math.floor(mb / 3 / 100) * 100;
        if (q === 'quarter') el2.value = Math.floor(mb / 4 / 100) * 100;
        syncCalc();
      });
    });

    el.buyBtn.onclick = doBuy;
    el.sellBtn.onclick = doSell;
    el.closeAllBtn.onclick = () => {
      if (!Game.G.positions.length) { toast('现在是空仓'); return; }
      const out = Game.closeAll();
      toast('全部平仓，合计 ' + money(out.reduce((s, o) => s + o.pnl, 0)) + ' 元', 'warn');
      tempFace('zen', '一刀切了个干净。', 2400);
      refreshAll();
    };
    el.clearLog.onclick = () => { Game.clearLog(); renderLog(); };

    /* 时间机器 */
    el.nextDayBtn.onclick = () => advance(1);
    el.next5Btn.onclick = () => advance(5);
    el.autoBtn.onclick = () => {
      if (S.auto) { clearInterval(S.auto); S.auto = null; el.autoBtn.textContent = '自动 ▶'; }
      else {
        S.auto = setInterval(() => advance(1), 900);
        el.autoBtn.textContent = '暂停 ‖';
      }
    };
    el.leverBtn.onclick = () => {
      if (window.__openLevModal) window.__openLevModal();
      else el.levModal.classList.remove('hidden');
    };
    el.restartBtn.onclick = () => location.reload();

    /* 分区标签 */
    document.querySelectorAll('.ztab').forEach(t => {
      t.addEventListener('click', () => {
        S.zone = t.dataset.zone;
        document.querySelectorAll('.ztab').forEach(x => x.classList.toggle('active', x === t));
        buildWatch();
      });
    });
    /* 多空切换 */
    document.querySelectorAll('.dtab').forEach(t => {
      t.addEventListener('click', () => {
        S.direction = t.dataset.dir;
        updateDirUI();
      });
    });
    updateDirUI();

    /* 融资 / 借贷 / 排行榜 / 普法 弹窗 */
    el.loanBtn.onclick = openLoanModal;
    document.querySelectorAll('.ltab').forEach(t => t.onclick = () => { loanTab = t.dataset.lt; renderLoan(); });
    el.lbBtn.onclick = openLbModal;
    if (el.lbRecord) el.lbRecord.onclick = () => { Game.recordRun('你'); renderLb(); toast('已记录本次成绩', 'ok'); };
    if (el.lbClear) el.lbClear.onclick = () => { Game.clearLeaderboard(); renderLb(); toast('排行榜已清空', 'warn'); };
    el.lawBtn.onclick = openLawModal;
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(b.dataset.close));
    ['loanModal', 'lbModal', 'lawModal'].forEach(id => {
      const m = el[id]; if (m) m.addEventListener('click', e => { if (e.target === m) closeModal(id); });
    });

    window.addEventListener('resize', () => { drawChart(); drawEquity(); });
    return map;
  }

  function advance(n) {
    if (Game.G.mode === 'live') { toast('实盘模式下时间是真实流动的', 'warn'); return; }
    const moved = Game.stepDay(n);
    if (!moved) {
      toast('已经走到数据尽头，游戏结束', 'warn');
      const s = Game.summary();
      if (!Game.G._recorded) { Game.G._recorded = true; Game.recordRun('你'); }
      Game.G._lastWords = Char.lineForState('zen');
      showFx(s.returnPct >= 0 ? 'smug' : 'broken',
        '结 算',
        `最终净资产 <b>${money(s.equity, true)}</b>　收益率 <b>${pct(s.returnPct)}</b><br>
         同期沪深300 ${pct((Market.benchLevel(Market.idx) / (Market.benchLevel(Game.G.startIdx) || 1) - 1) * 100)}<br>
         强平 ${Game.G.margins} 次 · 中毒度 ${Math.round(Game.G.addic)}%`, '再来一局');
      return;
    }
    Game.checkBadges();
    refreshAll();
    /* 异动提示 */
    const list = Game.G.positions.map(p => {
      const c = Market.chg(p.code);
      const meta = Market.meta.find(m => m.code === p.code);
      return { r: c.pct, name: meta ? meta.name : p.code };
    }).sort((a, b) => b.r - a.r);
    if (list.length) {
      const top = list[0], bad = list[list.length - 1];
      if (top.r >= 9.5) toast('🚀 ' + top.name + ' 涨停 ' + pct(top.r), 'ok');
      else if (bad.r <= -9.5) toast('💀 ' + bad.name + ' 跌停 ' + pct(bad.r), 'bad');
      else if (top.r >= 5) toast(top.name + ' ' + pct(top.r) + '，要不要加仓？', 'ok');
      else if (bad.r <= -6) toast(bad.name + ' ' + pct(bad.r) + '…还扛得住吗？', 'bad');
    }
  }

  return {
    bind, toast, refreshAll, select, buildWatch, updateWatch, renderPos, renderLog,
    renderTop, renderHud, renderFoot, drawChart, drawEquity, setFace, tempFace,
    refreshFace, showFx, hideFx, syncCalc, fillPrice, S, el, money, pct, cls, num,
    openLoanModal, openLbModal, openLawModal, renderLoan, renderLb, renderLaw, closeModal
  };
})();
