/* ============================================================
 * character.js — 原创角色「韭留美」表演系统
 * 参数化 SVG 颜艺 + 台词库，状态由账户表现实时驱动
 * ========================================================== */
window.Char = (function () {
  'use strict';

  const INK = '#191318';
  const SKIN = '#ffdcbe';
  const SKIN_D = '#efb592';
  const HAIR = '#2c2338';
  const HAIR_HI = '#4a3d5c';
  const BLUSH = '#ff8f8f';
  const WHITE = '#fffdf5';

  /* ---------- 眼睛 ---------- */
  function eyes(kind) {
    const L = 92, R = 148, Y = 128;
    switch (kind) {
      case 'round':   // 普通
        return `
        <g class="eyes">
          <ellipse cx="${L}" cy="${Y}" rx="16" ry="19" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <ellipse cx="${R}" cy="${Y}" rx="16" ry="19" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${L}" cy="${Y + 1}" r="8.5" fill="${INK}"/>
          <circle cx="${R}" cy="${Y + 1}" r="8.5" fill="${INK}"/>
          <circle cx="${L - 3}" cy="${Y - 3}" r="3.2" fill="#fff"/>
          <circle cx="${R - 3}" cy="${Y - 3}" r="3.2" fill="#fff"/>
          <path d="M76 112 Q92 104 108 112" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M132 112 Q148 104 164 112" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
        </g>`;
      case 'shiny':   // 星星眼 · 来钱了
        return `
        <g class="eyes">
          <circle cx="${L}" cy="${Y}" r="18" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${R}" cy="${Y}" r="18" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          ${star(L, Y, 13, '#ffcf3f')}${star(R, Y, 13, '#ffcf3f')}
          <path d="M76 112 Q92 102 108 112" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M132 112 Q148 102 164 112" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>
        </g>`;
      case 'wide':    // 瞪眼 · 上头了
        return `
        <g class="eyes">
          <circle cx="${L}" cy="${Y}" r="21" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${R}" cy="${Y}" r="21" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${L}" cy="${Y}" r="13" fill="${INK}"/>
          <circle cx="${R}" cy="${Y}" r="13" fill="${INK}"/>
          <circle cx="${L}" cy="${Y}" r="6" fill="#c0392b"/>
          <circle cx="${R}" cy="${Y}" r="6" fill="#c0392b"/>
          <circle cx="${L - 6}" cy="${Y - 7}" r="3.5" fill="#fff"/>
          <circle cx="${R - 6}" cy="${Y - 7}" r="3.5" fill="#fff"/>
        </g>`;
      case 'crazy':   // 疯狂 · 缩小瞳孔 + 放射线
        return `
        <g class="eyes">
          ${radial(L, Y)}${radial(R, Y)}
          <circle cx="${L}" cy="${Y}" r="20" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${R}" cy="${Y}" r="20" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${L}" cy="${Y}" r="4" fill="${INK}"/>
          <circle cx="${R}" cy="${Y}" r="4" fill="${INK}"/>
        </g>`;
      case 'swirl':   // 崩坏漩涡
        return `
        <g class="eyes">
          <circle cx="${L}" cy="${Y}" r="19" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${R}" cy="${Y}" r="19" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          ${spiral(L, Y)}${spiral(R, Y)}
        </g>`;
      case 'cross':   // 晕厥
        return `
        <g class="eyes">
          <path d="M80 117 L104 141 M104 117 L80 141" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
          <path d="M136 117 L160 141 M160 117 L136 141" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
        </g>`;
      case 'dead':    // 退場 · 空洞
        return `
        <g class="eyes">
          <ellipse cx="${L}" cy="${Y}" rx="16" ry="19" fill="#e8e2e8" stroke="${INK}" stroke-width="3.5"/>
          <ellipse cx="${R}" cy="${Y}" rx="16" ry="19" fill="#e8e2e8" stroke="${INK}" stroke-width="3.5"/>
          <ellipse cx="${L}" cy="${Y + 2}" rx="8" ry="10" fill="#5b5060"/>
          <ellipse cx="${R}" cy="${Y + 2}" rx="8" ry="10" fill="#5b5060"/>
          <path d="M70 150 Q92 176 114 150" stroke="${INK}" stroke-width="2.5" fill="none"/>
          <path d="M126 150 Q148 176 170 150" stroke="${INK}" stroke-width="2.5" fill="none"/>
        </g>`;
      case 'tear':    // 痛哭
        return `
        <g class="eyes">
          <path d="M76 122 Q92 106 108 122 Q92 136 76 122Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <path d="M132 122 Q148 106 164 122 Q148 136 132 122Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="${L}" cy="122" r="7" fill="${INK}"/>
          <circle cx="${R}" cy="122" r="7" fill="${INK}"/>
          <path class="fx-drop" d="M86 134 q-6 22 0 30 q6 -8 0 -30Z" fill="#5cc8f5" stroke="${INK}" stroke-width="2"/>
          <path class="fx-drop" d="M154 138 q-5 18 0 26 q5 -8 0 -26Z" fill="#5cc8f5" stroke="${INK}" stroke-width="2"/>
        </g>`;
      case 'half':    // 半闭 · 得意
        return `
        <g class="eyes">
          <path d="M74 128 Q92 112 110 128 Q92 134 74 128Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <path d="M130 128 Q148 112 166 128 Q148 134 130 128Z" fill="${WHITE}" stroke="${INK}" stroke-width="3.5"/>
          <circle cx="92" cy="126" r="6" fill="${INK}"/>
          <circle cx="148" cy="126" r="6" fill="${INK}"/>
        </g>`;
      case 'zen':     // 贤者模式
        return `
        <g class="eyes">
          <path d="M74 130 Q92 138 110 130" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M130 130 Q148 138 166 130" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
        </g>`;
      case 'small':
        return `
        <g class="eyes">
          <circle cx="${L}" cy="${Y}" r="7" fill="${INK}"/>
          <circle cx="${R}" cy="${Y}" r="7" fill="${INK}"/>
        </g>`;
      default: return eyes('round');
    }
  }

  function star(cx, cy, r, fill) {
    let pts = [];
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="2"/>`;
  }

  function spiral(cx, cy) {
    let d = `M${cx} ${cy}`;
    for (let i = 0; i < 40; i++) {
      const a = i * 0.42, r = i * 0.42;
      d += ` L${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    }
    return `<path d="${d}" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
  }

  function radial(cx, cy) {
    let s = '';
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI / 6) * i;
      s += `<path d="M${(cx + Math.cos(a) * 13).toFixed(1)} ${(cy + Math.sin(a) * 13).toFixed(1)}
             L${(cx + Math.cos(a) * 20).toFixed(1)} ${(cy + Math.sin(a) * 20).toFixed(1)}"
             stroke="${INK}" stroke-width="2"/>`;
    }
    return s;
  }

  /* ---------- 嘴 ---------- */
  function mouth(kind) {
    const X = 120, Y = 172;
    switch (kind) {
      case 'smile':
        return `<path d="M104 172 Q120 184 136 172" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      case 'grin':
        return `<path d="M100 168 Q120 172 140 168 Q136 190 120 190 Q104 190 100 168Z" fill="${INK}"/>
                <path d="M112 186 Q120 192 128 186 Z" fill="${BLUSH}"/>`;
      case 'drool':
        return `<path d="M100 166 Q120 170 140 166 Q136 192 120 192 Q104 192 100 166Z" fill="${INK}"/>
                <path d="M112 188 Q120 194 128 188 Z" fill="${BLUSH}"/>
                <path class="fx-drop" d="M100 184 q-8 26 0 34 q8 -8 0 -34Z" fill="#a8e6f0" stroke="${INK}" stroke-width="2"/>`;
      case 'flat':
        return `<path d="M106 174 L134 174" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
      case 'frown':
        return `<path d="M104 180 Q120 168 136 180" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      case 'open':
        return `<ellipse cx="${X}" cy="${Y + 2}" rx="15" ry="17" fill="${INK}"/>
                <ellipse cx="${X}" cy="${Y + 8}" rx="9" ry="8" fill="#c0392b"/>`;
      case 'wavy':
        return `<path d="M100 174 q6 -7 12 0 q6 7 12 0 q6 -7 12 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      case 'zigzag':
        return `<path d="M102 170 L112 182 L122 170 L132 182 L140 172" stroke="${INK}" stroke-width="4" fill="none" stroke-linejoin="round"/>`;
      default: return mouth('smile');
    }
  }

  /* ---------- 眉毛 ---------- */
  function brows(kind) {
    switch (kind) {
      case 'normal':
        return `<path d="M76 104 Q92 96 108 102" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
                <path d="M132 102 Q148 96 164 104" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
      case 'up':
        return `<path d="M76 108 Q92 94 108 98" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
                <path d="M132 98 Q148 94 164 108" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
      case 'angry':
        return `<path d="M76 100 L108 110" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
                <path d="M164 100 L132 110" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      case 'worry':
        return `<path d="M76 96 Q92 104 108 100" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
                <path d="M132 100 Q148 104 164 96" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
      case 'flat':
        return `<path d="M76 100 L108 102 M132 102 L164 100" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
      default: return '';
    }
  }

  /* ---------- 特效层 ---------- */
  function fx(list) {
    let s = '';
    (list || []).forEach(f => {
      if (f === 'blush')
        s += `<ellipse cx="70" cy="150" rx="13" ry="8" fill="${BLUSH}" opacity=".65"/>
              <ellipse cx="170" cy="150" rx="13" ry="8" fill="${BLUSH}" opacity=".65"/>`;
      if (f === 'dark')   // 黑眼圈 / 阴影
        s += `<g opacity=".5">
                <ellipse cx="92" cy="142" rx="17" ry="6" fill="#8a6a8a"/>
                <ellipse cx="148" cy="142" rx="17" ry="6" fill="#8a6a8a"/>
              </g>`;
      if (f === 'shade')  // 脸部排线阴影
        s += `<g opacity=".22" stroke="${INK}" stroke-width="2">
                ${Array.from({ length: 14 }, (_, i) =>
                  `<path d="M${58 + i * 9} 92 L${38 + i * 9} 210"/>`).join('')}
              </g>`;
      if (f === 'vein')
        s += `<g fill="none" stroke="#d9413c" stroke-width="3">
                <path d="M186 66 l14 0 m-7 -7 l0 14 m-8 -8 l16 0"/>
                <path d="M40 78 l12 0 m-6 -6 l0 12"/>
              </g>`;
      if (f === 'sweat')
        s += `<path class="fx-drop" d="M186 108 q-7 24 0 32 q7 -8 0 -32Z" fill="#a8e6f0" stroke="${INK}" stroke-width="2.5"/>`;
      if (f === 'sparkle')
        s += `<g class="fx-spin">${star(46, 78, 9, '#ffcf3f')}${star(196, 62, 7, '#ffcf3f')}${star(200, 120, 6, '#fff')}</g>`;
      if (f === 'lines')  // 背景集中线
        s += `<g opacity=".35" stroke="${INK}" stroke-width="3">
                ${Array.from({ length: 18 }, (_, i) => {
                  const a = (Math.PI * 2 / 18) * i;
                  return `<path d="M${(120 + Math.cos(a) * 95).toFixed(1)} ${(120 + Math.sin(a) * 95).toFixed(1)}
                           L${(120 + Math.cos(a) * 128).toFixed(1)} ${(120 + Math.sin(a) * 128).toFixed(1)}"/>`;
                }).join('')}
              </g>`;
    });
    return s;
  }

  /* ---------- 状态表 ---------- */
  const FACES = {
    idle:    { eyes: 'round', mouth: 'smile', brows: 'normal', fx: [] },
    happy:   { eyes: 'shiny', mouth: 'grin',  brows: 'up',     fx: ['sparkle'] },
    eager:   { eyes: 'wide',  mouth: 'drool', brows: 'up',     fx: ['blush'] },
    greedy:  { eyes: 'crazy', mouth: 'drool', brows: 'up',     fx: ['blush', 'sparkle'] },
    worry:   { eyes: 'round', mouth: 'flat',  brows: 'worry',  fx: ['sweat'] },
    panic:   { eyes: 'cross', mouth: 'wavy',  brows: 'worry',  fx: ['sweat', 'vein'] },
    sad:     { eyes: 'tear',  mouth: 'zigzag',brows: 'worry',  fx: ['dark'] },
    broken:  { eyes: 'swirl', mouth: 'open',  brows: 'flat',   fx: ['dark', 'shade', 'vein'] },
    dead:    { eyes: 'dead',  mouth: 'flat',  brows: 'flat',   fx: ['shade', 'lines'] },
    zen:     { eyes: 'zen',   mouth: 'flat',  brows: 'flat',   fx: [] },
    smug:    { eyes: 'half',  mouth: 'grin',  brows: 'up',     fx: [] },
    angry:   { eyes: 'wide',  mouth: 'zigzag',brows: 'angry',  fx: ['vein'] },
    think:   { eyes: 'small', mouth: 'flat',  brows: 'normal', fx: [] }
  };

  /* ---------- 组装 SVG ---------- */
  function face(name, opt) {
    const f = FACES[name] || FACES.idle;
    opt = opt || {};
    return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg"
             class="av-svg ${opt.anim || ''}">
      ${fx(f.fx)}
      <!-- 肩膀 + 制服 -->
      <path d="M48 240 Q52 206 92 197 L148 197 Q188 206 192 240 Z"
            fill="#46579b" stroke="${INK}" stroke-width="4"/>
      <path d="M70 240 Q76 214 96 203" stroke="#fff" stroke-width="3" fill="none" opacity=".38"/>
      <path d="M96 197 L120 226 L144 197" fill="#fffdf5" stroke="${INK}" stroke-width="4"/>
      <path d="M120 226 L120 240" stroke="${INK}" stroke-width="4"/>
      <!-- 脖子 -->
      <path d="M107 182 L107 202 M133 182 L133 202" stroke="${SKIN_D}" stroke-width="15" stroke-linecap="round"/>
      <!-- 后发(外扩) -->
      <path d="M34 150 Q22 26 120 16 Q218 26 206 150 Q202 86 178 66
               Q142 44 120 44 Q98 44 62 66 Q38 86 34 150 Z"
            fill="${HAIR}" stroke="${INK}" stroke-width="4"/>
      <!-- 脸 -->
      <ellipse cx="120" cy="134" rx="71" ry="75" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>
      <!-- 两侧垂发 -->
      <path d="M39 116 Q28 176 50 214 Q64 174 60 122 Z"
            fill="${HAIR}" stroke="${INK}" stroke-width="4"/>
      <path d="M201 116 Q212 176 190 214 Q176 174 180 122 Z"
            fill="${HAIR}" stroke="${INK}" stroke-width="4"/>
      <!-- 刘海 -->
      <path d="M47 126 Q43 50 120 42 Q197 50 193 126
               Q185 90 164 80 Q148 100 130 86 Q116 74 98 92 Q78 108 58 86 Q50 104 47 126 Z"
            fill="${HAIR}" stroke="${INK}" stroke-width="4"/>
      <!-- 呆毛 -->
      <path d="M120 42 Q126 14 148 8" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle cx="150" cy="7" r="6" fill="${HAIR}" stroke="${INK}" stroke-width="3"/>
      <!-- 高光 -->
      <path d="M76 70 Q98 58 120 62" stroke="${HAIR_HI}" stroke-width="6" fill="none"
            opacity=".5" stroke-linecap="round"/>
      ${brows(f.brows)}
      ${eyes(f.eyes)}
      ${mouth(f.mouth)}
    </svg>`;
  }

  /* ---------- 台词库 ---------- */
  const LINES = {
    greeting: ['老实赚钱…很<b>枯燥</b>吧？', '慢慢变富？听着就想打瞌睡。', '我们要的是——<b>一波带走</b>。'],
    idle: ['今天也是适合下手的一天。', '先看看盘子再说……', '嗯——这只……好像有点意思？'],
    happy: ['赚到了赚到了！还要更多！', '你看吧，我说什么来着♪', '这点盈利只是开始而已～'],
    eager: ['还不够……远远<b>不够</b>！', '要不要干脆<b>梭哈</b>一把？', '再加一点，再加一点点……♡'],
    greedy: ['<b>更多！更多！！</b>', '杠杆，给我拉满！', '这种程度的波动，根本不算什么！', '还要更多！！还要——'],
    worry: ['只是回调，对吧？是回调吧……（汗）', '没问题的，还没到我害怕的程度。', '再跌一点点我就……'],
    panic: ['追加！快追加保证金！！', '维、维持率！维持率在掉！', '不是我的错，是市场的错！！'],
    sad: ['呜……我的本金……', '怎么会这样……明明刚才还是赚的……', '我不玩了……（小声）'],
    broken: ['已经……没什么可以失去的了……', '啊哈哈哈……哈哈哈……', '到底是哪里……出了错……'],
    dead: ['<b>退 場</b>', '资金归零。恭喜，你毕业了。', '这就是结局。欢迎回来，现实世界。'],
    zen: ['时间……停止了。', '耐心才是唯一的alpha。', '什么都不做，也是一种操作。'],
    blowup: ['维持率跌破 100%——', '<b>ロスカット</b>执行完毕。', '账户已被强制平仓。'],
    restart: ['再来一次吧。这次一定……', '历史会重演，但你会操作得更好，对吧？'],
    leverUp: ['杠杆往上？<b>很好。</b>', '这才是我认识的你！', '越高越爽——代价？代价以后再说。'],
    leverDown: ['欸……保守了？', '稳健是好事。（但真的很无聊）'],
    t1: ['T+1，今天买的明天才能卖哦～', '想做T+0？那是梦里才有的事。'],
    limitUp: ['<b>涨停！</b>这种时候就要追，不是吗？', '封死了……早知道多买点！'],
    limitDown: ['跌停。卖不掉了。', '一字跌停里的滋味，如何？']
  };

  function line(key) {
    const arr = LINES[key] || LINES.idle;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* 依据账户表现推导情绪状态 */
  function mood(acc) {
    if (acc.ruin) return 'dead';
    if (acc.leverage > 1) {
      if (acc.marginRatio !== null && acc.marginRatio <= 130) return 'panic';
      if (acc.marginRatio !== null && acc.marginRatio <= 200) return 'worry';
    }
    const r = acc.returnPct;
    if (acc.realizedToday > 0 || (acc.unrealizedPct > 8)) return 'greedy';
    if (r >= 20) return 'greedy';
    if (r >= 8) return 'happy';
    if (r >= 2) return 'smug';
    if (r <= -25) return 'broken';
    if (r <= -12) return 'sad';
    if (r <= -5) return 'worry';
    return 'idle';
  }

  function lineForState(state) {
    if (LINES[state]) return line(state);
    if (state === 'smug') return line('happy');
    return line('idle');
  }

  return { face, FACES, line, lineForState, mood, star, starRaw: star };
})();
