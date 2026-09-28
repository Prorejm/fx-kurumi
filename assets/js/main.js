/* ============================================================
   main.js — 启动 / 模式配置 / 实时轮询
   ========================================================== */
(function () {
  'use strict';

  const LEV = [1, 2, 3, 5, 10, 25, 50];
  const PICK = { mode: 'replay', lev: 0, t0: false };

  const boot = document.getElementById('boot');
  const bootBar = document.getElementById('bootBar');
  const intro = document.getElementById('intro');
  const app = document.getElementById('app');

  function progress(p, txt) {
    if (bootBar) bootBar.style.width = p + '%';
    const s = document.querySelector('.boot-sub');
    if (s) s.textContent = txt;
  }

  function fail(msg) {
    boot.innerHTML = '<div class="boot-inner"><div class="boot-title">出错了</div>' +
      '<div class="boot-sub">' + msg + '</div></div>';
  }

  /* ---------- 开场弹窗 ---------- */
  function setupIntro() {
    const av = document.getElementById('introAvatar');
    const lineEl = document.getElementById('introLine');
    av.innerHTML = Char.face('greedy', { anim: 'av-bounce' });
    lineEl.innerHTML = Char.line('greeting')[0];

    const levSlider = document.getElementById('introLev');
    const levVal = document.getElementById('introLevVal');
    const t0Wrap = document.getElementById('t0Wrap');
    const t0Check = document.getElementById('t0Check');

    document.querySelectorAll('.mode-card').forEach(c => {
      c.addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(x => x.classList.remove('on'));
        c.classList.add('on');
        PICK.mode = c.dataset.mode;
        t0Wrap.classList.toggle('hidden', PICK.mode !== 'live');
        av.innerHTML = Char.face(PICK.mode === 'live' ? 'wide' : 'greedy', { anim: 'av-pop' });
        lineEl.innerHTML = PICK.mode === 'live'
          ? '真刀真枪。<b>现在的价格</b>就是真的在跳哦。'
          : '穿越回真实历史的某一天，慢慢来——也可以<b>干票大的</b>。';
      });
    });
    document.querySelector('.mode-card').click();

    const syncLev = (el, out) => {
      const v = LEV[+el.value];
      out.textContent = v + 'x';
      return v;
    };
    levSlider.addEventListener('input', () => {
      const v = syncLev(levSlider, levVal);
      av.innerHTML = Char.face(v >= 10 ? 'greedy' : (v >= 5 ? 'greedy' : 'idle'),
        { anim: v >= 10 ? 'av-shake' : 'av-pop' });
      lineEl.innerHTML = v >= 25 ? '<b>FX 模式。</b>你确定？一次反向就来一杯 overdose。'
        : v >= 10 ? '十倍……这才叫<b>交易</b>啊 ♡'
          : v >= 5 ? '还好还好，五倍只是<b>热身</b>。'
            : v > 1 ? '有点进步了嘛。不过——还能更高吧？'
              : '只用一倍？你的良心不会痛吗？';
    });
    t0Check.addEventListener('change', () => { PICK.t0 = t0Check.checked; });

    document.getElementById('startBtn').onclick = () => {
      PICK.lev = LEV[+levSlider.value];
      PICK.t0 = t0Check.checked && PICK.mode === 'live';
      start(null);
    };
    document.getElementById('continueBtn').onclick = () => {
      const sv = Game.loadSave();
      if (!sv) { UI.toast('没有找到存档', 'warn'); return; }
      start(sv);
    };
    if (!Game.hasSave()) document.getElementById('continueBtn').classList.add('hidden');
  }

  /* ---------- 启动游戏 ---------- */
  function start(save) {
    intro.classList.add('hidden');
    app.classList.remove('hidden');

    if (save) {
      Game.restore(save);
      Market.S.mode = Game.G.mode;
    } else {
      const idx = PICK.mode === 'live' ? Market.dates.length - 1 : Market.randomStart(90);
      Game.reset(PICK.mode, PICK.lev, idx, { t0: PICK.t0 });
    }
    Game.checkBadges();

    UI.bind();
    const first = Game.G.positions.length ? Game.G.positions[0].code : 'sh600519';
    UI.S.code = first;
    UI.buildWatch();
    UI.select(first);
    UI.fillPrice();
    UI.refreshAll();
    UI.tempFace(save ? 'idle' : 'eager',
      save ? '欢迎回来。账户还活着，真是奇迹。' : '好啦，开始吧。别怂。', 3200, 'av-pop');

    wireEvents();
    if (Game.G.mode === 'live') startLive();
    requestAnimationFrame(() => { UI.drawChart(); UI.drawEquity(); });
  }

  /* ---------- 游戏事件 → 表演 ---------- */
  function wireEvents() {
    Game.on((ev, d) => {
      if (ev === 'change') return;
      if (ev === 'marginCall') {
        UI.tempFace('panic', '不好了！<b>维持率 ' + d.mr.toFixed(0) + '%</b> ——要被追保了！', 3400, 'av-shake');
        UI.toast('⚠ 追加保证金：维持率 ' + d.mr.toFixed(1) + '%', 'warn');
      }
      if (ev === 'losscut') {
        const loss = (d.closed || []).reduce((s, o) => s + o.pnl, 0);
        UI.showFx('panic', 'ロスカット',
          `维持率跌破 100%，仓位被<b>强制平仓</b>。<br>
           本次强平损益 <b style="color:${loss >= 0 ? '#17a05c' : '#e6392e'}">${UI.money(loss)}</b> 元<br>
           <span style="font-size:13px">再来一次？这次记得看维持率。</span>`, '重 新 开 始');
      }
      if (ev === 'ruin') {
        UI.showFx('dead', '退 場',
          `本金归零。<br>你被市场的巨齿碾碎了。<br>
           <span style="font-size:13px">最终成就：中毒度 ${Math.round(Game.G.addic)}%</span>`, '再 来 一 局');
      }
      if (ev === 'badge') UI.toast('🏅 解锁成就：' + d.name, 'ok');
      if (ev === 'limitUp') {
        const m = Market.meta.find(x => x.code === d.code);
        UI.toast('🚀 ' + (m ? m.name : '') + ' 涨停！', 'ok');
      }
      if (ev === 'limitDown') {
        const m = Market.meta.find(x => x.code === d.code);
        UI.toast('💀 ' + (m ? m.name : '') + ' 跌停…', 'bad');
      }
      if (ev === 'leverUp') {
        UI.tempFace('greedy', '杠杆 <b>' + d.v + 'x</b>……好、好！（颤抖）', 2600, 'av-bounce');
      }
    });
    document.getElementById('fxBtn').onclick = () => location.reload();

    /* 杠杆弹窗 */
    const lvModal = document.getElementById('levModal');
    const lvSlider = document.getElementById('levSlider');
    const lvVal = document.getElementById('levVal');
    /* 打开杠杆弹窗时同步当前值 (按钮绑定在 UI.bind) */
    window.__openLevModal = () => {
      lvSlider.value = Math.max(0, LEV.indexOf(Game.G.leverage));
      lvVal.textContent = Game.G.leverage + 'x';
      lvModal.classList.remove('hidden');
    };
    lvSlider.addEventListener('input', () => { lvVal.textContent = LEV[+lvSlider.value] + 'x'; });
    document.getElementById('levOk').onclick = () => {
      const v = LEV[+lvSlider.value];
      if (v !== Game.G.leverage) {
        Game.setLeverage(v);
        UI.toast('杠杆已调整为 ' + v + 'x' + (v > 1 ? ' · 退場风险上升' : ' · 安全模式'), v > 1 ? 'warn' : 'ok');
      }
      lvModal.classList.add('hidden');
      UI.refreshAll();
    };
    lvModal.addEventListener('click', e => { if (e.target === lvModal) lvModal.classList.add('hidden'); });
  }

  /* ---------- 实时模式轮询 ---------- */
  function startLive() {
    const codes = Market.tradable.map(m => m.code);
    const tick = () => {
      Market.fetchQuotes(codes).then(n => {
        if (n > 0) {
          UI.el.liveDot.classList.remove('hidden');
          UI.updateWatch(); UI.renderPos(); UI.renderTop();
          UI.renderHud(); UI.renderFoot(); UI.drawChart();
          UI.refreshFace();
          /* 当前股票分时每轮更新一次 */
          if (UI.S.code) Market.fetchIntraday(UI.S.code).then(() => {
            if (UI.S.view === 'minute') UI.drawChart();
          });
        }
      });
    };
    tick();
    setInterval(tick, 15000);
  }

  /* ---------- 入口 ---------- */
  function boot$() {
    progress(30, '正在载入真实行情数据…');
    setTimeout(() => {
      if (!window.SNAPSHOT || !window.SNAPSHOT.d || !window.SNAPSHOT.d.length) {
        fail('行情数据包加载失败，请确认 data/snapshot.js 存在。');
        return;
      }
      try {
        const n = Market.init(window.SNAPSHOT);
        progress(80, '载入 ' + n + ' 个标的…');
        setupIntro();
        progress(100, '就绪');
        setTimeout(() => {
          boot.classList.add('hidden');
          intro.classList.remove('hidden');
        }, 220);
      } catch (e) {
        fail('初始化失败：' + e.message);
        console.error(e);
      }
    }, 60);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot$);
  else boot$();
})();
