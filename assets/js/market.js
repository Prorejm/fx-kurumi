/* ============================================================
   market.js — 行情引擎
   离线: data/snapshot.js 内置真实历史
   在线: 腾讯财经 qt.gtimg.cn (实时) / ifzq.gtimg.cn (分时·日线)
   两个通道均为跨域开放接口, 无需 Key
   ========================================================== */
window.Market = (function () {
  'use strict';

  const RT_URL = 'https://qt.gtimg.cn/q=';
  const MIN_URL = 'https://web.ifzq.gtimg.cn/appstock/app/minute/query?code=';
  const DAY_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=';

  const S = {
    meta: [], dates: [], series: {}, bench: 'sh000300',
    idx: 0, mode: 'replay',
    quotes: {},        // code -> 实时快照
    intraday: {},      // code -> [{t,p,v}]
    startIdx: 0,
    online: false, lastTickAt: 0
  };

  function dec(buf) {
    try { return new TextDecoder('gbk').decode(buf); } catch (e) { /* fall */ }
    try { return new TextDecoder('gb18030').decode(buf); } catch (e) { /* fall */ }
    return new TextDecoder('utf-8').decode(buf);
  }

  function get(url, asBuf) {
    return fetch(url, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return asBuf ? r.arrayBuffer() : r.text();
    });
  }

  /* ---------- 初始化 ---------- */
  function init(snap) {
    S.meta = snap.m.map(a => ({
      code: a[0], name: a[1], ind: a[2],
      market: a[3], limitPct: a[4],
      tradable: a[3] !== 'index'
    })).filter(s => !S.seen_(s.code));
    S.dates = snap.d;
    S.series = snap.s;
    S.idx = snap.d.length - 1;
    S.startIdx = S.idx;
    return S.meta.length;
  }

  const seen = {};
  S.seen_ = function (c) { if (seen[c]) return true; seen[c] = 1; return false; };

  /* ---------- 基础取数 ---------- */
  function raw(code, i) {
    const arr = S.series[code];
    if (!arr) return null;
    const b = i * 5;
    if (b + 4 >= arr.length) return null;
    return {
      d: S.dates[i], o: arr[b] / 100, h: arr[b + 1] / 100,
      l: arr[b + 2] / 100, c: arr[b + 3] / 100, v: arr[b + 4]
    };
  }

  /* 当前 bar (实时覆盖最后一根) */
  function bar(code, i) {
    i = (i === undefined) ? S.idx : i;
    const b = raw(code, i);
    if (!b) return null;
    if (i === S.idx) {
      const q = S.quotes[code];
      if (q && S.mode === 'live' && q.p > 0) {
        return {
          d: b.d, o: q.o > 0 ? q.o : b.o, h: Math.max(q.h, q.p),
          l: q.l > 0 ? Math.min(q.l, q.p) : Math.min(b.l, q.p),
          c: q.p, v: q.v > 0 ? q.v : b.v,
          _rt: true
        };
      }
    }
    return b;
  }

  function prevClose(code, i) {
    i = (i === undefined) ? S.idx : i;
    const p = raw(code, i - 1);
    if (p) return p.c;
    return bar(code, i) ? bar(code, i).o : 0;
  }

  function price(code) {
    const b = bar(code);
    return b ? b.c : 0;
  }

  function chg(code) {
    const b = bar(code); if (!b) return { abs: 0, pct: 0 };
    const pc = prevClose(code) || b.o;
    return { abs: b.c - pc, pct: pc ? (b.c - pc) / pc * 100 : 0 };
  }

  /* ---------- 序列 + 均线 ---------- */
  function series(code, count, end) {
    end = end === undefined ? S.idx : Math.min(end, S.idx);
    count = count || 120;
    const start = Math.max(0, end - count + 1);
    const out = [];
    // 多取 20 根用于计算 MA
    const pad = Math.max(0, start - 20);
    const tmp = [];
    for (let i = pad; i <= end; i++) {
      const b = raw(code, i);
      if (b) tmp.push(b);
    }
    for (let i = 0; i < tmp.length; i++) {
      const b = Object.assign({}, tmp[i]);
      const ma = (n) => {
        if (i < n - 1) return null;
        let s = 0;
        for (let k = 0; k < n; k++) s += tmp[i - k].c;
        return s / n;
      };
      b.ma5 = ma(5); b.ma10 = ma(10); b.ma20 = ma(20);
      out.push(b);
    }
    return out.slice(-(end - Math.max(start, pad) + 1));
  }

  /* 周/月 K 聚合 */
  function agg(code, unit, count, end) {
    end = end === undefined ? S.idx : end;
    const d = series(code, unit === 'week' ? (count + 1) * 5 : (count + 1) * 20, end);
    const out = [];
    let cur = null, curKey = '';
    for (const b of d) {
      const dt = new Date(b.d + 'T00:00:00');
      let key;
      if (unit === 'week') {
        const dow = (dt.getDay() + 6) % 7;
        const monday = new Date(dt); monday.setDate(dt.getDate() - dow);
        key = monday.toISOString().slice(0, 10);
      } else key = b.d.slice(0, 7);
      if (key !== curKey) {
        if (cur) out.push(cur);
        cur = { d: key, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
        curKey = key;
      } else {
        cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l);
        cur.c = b.c; cur.v += b.v;
      }
    }
    if (cur) out.push(cur);
    return out.slice(-count);
  }

  /* ---------- 时间推进 ---------- */
  function next(n) {
    n = n || 1;
    const old = S.idx;
    S.idx = Math.min(S.dates.length - 1, S.idx + n);
    return S.idx - old;
  }
  function canNext() { return S.idx < S.dates.length - 1; }
  function date(i) { return S.dates[i === undefined ? S.idx : i] || ''; }

  function randomStart(minAhead) {
    minAhead = minAhead || 90;
    const max = S.dates.length - 1 - minAhead;
    const min = 30;
    if (max <= min) return min;
    return Math.floor(min + Math.random() * (max - min));
  }

  function setIdx(i) { S.idx = Math.max(0, Math.min(S.dates.length - 1, i | 0)); }

  /* ---------- 在线: 实时报价 ---------- */
  function chunk(a, n) {
    const r = [];
    for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n));
    return r;
  }

  function fetchQuotes(codes) {
    if (!codes || !codes.length) return Promise.resolve(0);
    const jobs = chunk(codes, 40).map(part =>
      get(RT_URL + part.join(','), true).then(buf => {
        const txt = dec(buf);
        let n = 0;
        txt.split(';').forEach(line => {
          const m = line.match(/v_([a-zA-Z0-9]+)="([^"]*)"/);
          if (!m) return;
          const f = m[2].split('~');
          if (f.length < 40) return;
          const code = m[1];
          const num = v => { const x = parseFloat(v); return isFinite(x) ? x : 0; };
          const q = {
            name: f[1], p: num(f[3]), pc: num(f[4]), o: num(f[5]),
            v: num(f[6]) * 100, amount: num(f[37]) * 10000,
            time: f[30], chg: num(f[31]), chgPct: num(f[32]),
            h: num(f[33]), l: num(f[34]), turn: num(f[38]),
            pe: num(f[39]), amp: num(f[43]), fcap: num(f[44]), cap: num(f[45]),
            pb: num(f[46]), limitUp: num(f[47]), limitDown: num(f[48]), at: Date.now()
          };
          if (q.p > 0) { S.quotes[code] = q; n++; }
        });
        return n;
      }).catch(() => 0)
    );
    return Promise.all(jobs).then(rs => {
      const t = rs.reduce((a, b) => a + b, 0);
      if (t > 0) { S.online = true; S.lastTickAt = Date.now(); }
      return t;
    });
  }

  /* ---------- 在线: 当日分时 ---------- */
  function fetchIntraday(code) {
    return get(MIN_URL + code).then(txt => {
      const j = JSON.parse(txt);
      const node = j && j.data && j.data[code];
      const rows = node && node.data && node.data.data;
      if (!rows || !rows.length) return null;
      let acc = 0;
      const out = rows.map(r => {
        const p = r.trim().split(/\s+/);
        const v = parseFloat(p[2]) || 0;
        const delta = v - acc; acc = v;
        return { t: p[0], p: parseFloat(p[1]), v: Math.max(0, delta) };
      }).filter(x => isFinite(x.p));
      if (out.length) { S.intraday[code] = out; S.online = true; }
      return out;
    }).catch(() => null);
  }

  /* ---------- 离线: 由 OHLC 还原当日分时走势 ---------- */
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }
  function restored(code, i) {
    i = i === undefined ? S.idx : i;
    const b = raw(code, i);
    if (!b) return null;
    const pc = prevClose(code, i) || b.o;
    const rnd = hashSeed(code + b.d);
    const N = 48;
    const pts = [];
    /* 决定 high/low 出现顺序: 收盘强则先压后拉 */
    const upDay = b.c >= b.o;
    const iLow = 10 + Math.floor(rnd * 16);
    const iHigh = 26 + Math.floor((1 - rnd) * 14);
    const path = [];
    for (let k = 0; k <= N; k++) path.push(0);
    const setPeak = (idx, val) => {
      idx = Math.max(1, Math.min(N - 1, idx));
      for (let k = 0; k <= N; k++) {
        const w = Math.max(0, 1 - Math.abs(k - idx) / 9);
        path[k] += (val - (b.o * .5 + b.c * .5)) * w * w;
      }
    };
    setPeak(iLow, b.l); setPeak(iHigh, b.h);
    if (!upDay) { /* 高开低走则把高点前移 */ }
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      let p = b.o + (b.c - b.o) * t;
      p += path[k] * 0.85;
      p *= 1 + Math.sin(k * 1.7 + rnd * 6) * 0.0016;
      p = Math.max(b.l, Math.min(b.h, p));
      const base = Math.max(1, Math.abs(b.v) / N);
      pts.push({ t: '--', p: p, v: Math.round(base * (0.5 + Math.abs(Math.sin(k * 2.3 + rnd * 9)) * 1.2)) });
    }
    pts[0].p = b.o;
    pts[N].p = b.c;
    return { pts, prevClose: pc };
  }

  /* ---------- 在线: 补齐最新日线 ---------- */
  function fetchDaily(code, n) {
    n = n || 30;
    return get(DAY_URL + code + ',day,,,' + n + ',').then(txt => {
      const j = JSON.parse(txt);
      const node = j && j.data && j.data[code];
      const rows = node && (node.day || node.qfqday);
      if (!rows || !rows.length) return 0;
      const map = {};
      rows.forEach(r => { map[r[0]] = r; });
      const arr = S.series[code]; if (!arr) return 0;
      let added = 0;
      rows.forEach(r => {
        let i = S.dates.indexOf(r[0]);
        if (i < 0) i = S.dates.length;  // 新交易日 -> 追加
        // 逐日写入(只处理数据集尾部)
        if (i >= S.dates.length - 1 || true) {
          const b = i * 5;
          for (let k = arr.length; k <= b + 4; k++) arr[k] = 0;
          arr[b] = Math.round(parseFloat(r[1]) * 100);
          arr[b + 1] = Math.round(parseFloat(r[3]) * 100);
          arr[b + 2] = Math.round(parseFloat(r[4]) * 100);
          arr[b + 3] = Math.round(parseFloat(r[2]) * 100);
          arr[b + 4] = Math.round(parseFloat(r[5]));
        }
      });
      return ++added;
    }).catch(() => 0);
  }

  function benchLevel(i) {
    const b = raw(S.bench, i === undefined ? S.idx : i);
    return b ? b.c : 0;
  }

  return {
    S, init, raw, bar, prevClose, price, chg, series, agg,
    next, canNext, date, randomStart, setIdx,
    fetchQuotes, fetchIntraday, fetchDaily, restored, benchLevel,
    get meta() { return S.meta; },
    get dates() { return S.dates; },
    get idx() { return S.idx; },
    get tradable() { return S.meta.filter(m => m.tradable); }
  };
})();
