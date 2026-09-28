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
    auto: null, curBarsCache: null
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
      'mbVal', 'mbFill', 'levChip', 'marginBar', 'stockList', 'posList', 'logList', 'badges',
      'curName', 'curCode', 'curPrice', 'curChg', 'curOpen', 'curHigh', 'curLow', 'curPrev', 'curTurn',
      'indexStrip', 'kchart', 'equityChart', 'crosshair', 'priceInput', 'qtyInput',
      'calcAmt', 'calcFee', 'calcMargin', 'buyBtn', 'sellBtn', 'buySub', 'sellSub',
      'searchInput', 'sortBtn', 'nextDayBtn', 'next5Btn', 'autoBtn', 'leverBtn', 'restartBtn',
      'closeAllBtn', 'clearLog', 'posCount', 'addFill', 'addTxt', 'statsMini', 'toast',
      'fx', 'fxAvatar', 'fxWord', 'fxSub', 'fxBtn', 'startBtn', 'continueBtn',
      'introLev', 'introLevVal', 'levModal', 'levSlider', 'levVal', 'levOk'
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
      const pnl = mv - cost, r = cost ? pnl / cost * 100 : 0;
      const can = Game.canSellShares(p.code);
      return `<div class="prow ${p.code === S.code ? 'on' : ''}" data-code="${p.code}">
        <div class="r1"><b>${meta.name}</b><em>${p.shares}股${can < p.shares ? ' (T+1冻结)' : ''}</em>
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
    const r = Game.buy(S.code, price, qty);
    toast(r.msg, r.ok ? 'ok' : 'bad');
    if (r.ok) {
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
      tempFace(won ? 'happy' : 'sad',
        won ? '赚到了！这个感觉……还想再来一次♪' : '呜呜……本金又少了一块……',
        2400, won ? 'av-pop' : 'av-shake');
      Game.checkBadges();
    }
    refreshAll();
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

    window.addEventListener('resize', () => { drawChart(); drawEquity(); });
    return map;
  }

  function advance(n) {
    if (Game.G.mode === 'live') { toast('实盘模式下时间是真实流动的', 'warn'); return; }
    const moved = Game.stepDay(n);
    if (!moved) {
      toast('已经走到数据尽头，游戏结束', 'warn');
      const s = Game.summary();
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
    refreshFace, showFx, hideFx, syncCalc, fillPrice, S, el, money, pct, cls, num
  };
})();
