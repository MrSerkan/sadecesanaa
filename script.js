/* ==========================================================================
   Sadece Senin İçin — an interactive short film in four scenes
   Vanilla JS · Canvas 2D · procedural 3D rose · Web Audio score
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Helpers
   * ------------------------------------------------------------------ */
  const $ = (s) => document.querySelector(s);
  const body = document.body;
  const root = document.documentElement;

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionQuery.matches;
  const onMotion = (e) => { reduced = e.matches; };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotion);
  else if (motionQuery.addListener) motionQuery.addListener(onMotion);

  /* ------------------------------------------------------------------ *
   * Copy (all visible text is Turkish)
   * ------------------------------------------------------------------ */
  const TEXT = {
    seedMsg: 'Her güzel şey küçük bir dokunuşla başlar...',
    seedHint: 'Tohuma dokun.',
    growHint: 'Filize dokun, büyüsün.',
    grow: ['Biraz sevgi...', 'Biraz mutluluk...', 'Biraz biz...', 'Tıpkı sana olan sevgim gibi...'],
    bloom: 'Şimdi çiçeğe dokun ve basılı tut...',
    resume: 'Yeniden basılı tut...',
    letter:
      'Bu çiçek sadece senin için açtı.\n' +
      'Tıpkı kalbim gibi.\n\n' +
      'Hayatıma kattığın bütün güzellikler için teşekkür ederim.\n\n' +
      'İyi ki varsın, iyi ki benimlesin.\n\n' +
      'Seni çok seviyorum, sevgilim.',
    aria: {
      seed: 'Tohuma dokun',
      grow: 'Çiçeği büyütmek için dokun. Boşluk veya Enter tuşunu da kullanabilirsin.',
      ready: 'Çiçeği açmak için basılı tut. Klavyede Boşluk veya Enter tuşunu basılı tutabilirsin.',
      reveal: 'Çiçek açtı',
    },
  };

  /* ------------------------------------------------------------------ *
   * DOM
   * ------------------------------------------------------------------ */
  const bgCanvas = $('#bg');
  const bg = bgCanvas.getContext('2d');
  const cv = $('#scene');
  const ctx = cv.getContext('2d');
  const stageEl = $('#stage');
  const msgEl = $('#message');
  const hintEl = $('#hint');
  const liveEl = $('#live');
  const ringEl = $('#ring');
  const ringProg = $('#ringProgress');
  const finaleEl = $('#finale');
  const letterEl = $('#letter');
  const letterSr = $('#letterSr');
  const replayBtn = $('#replay');
  const musicBtn = $('#music');
  const measureEl = $('#measure');
  const safeEl = $('#safe');
  const curtain = $('#curtain');

  /* ------------------------------------------------------------------ *
   * Layout & cameras
   * ------------------------------------------------------------------ */
  let W = 0, H = 0, DPR = 1;
  const safe = { t: 0, r: 0, b: 0, l: 0 };
  const STEM = 1.0;           // stem length in world units
  const HEADK = 1.32;         // rose-head size multiplier (world units)
  const HOLD_SECONDS = 4;
  const camGrow = { x: 0, y: 0, s: 1 };
  const camReveal = { x: 0, y: 0, s: 1 };
  const cam = { x: 0, y: 0, s: 1 };
  let landscape = false;

  function readSafe() {
    const cs = getComputedStyle(safeEl);
    safe.t = parseFloat(cs.paddingTop) || 0;
    safe.r = parseFloat(cs.paddingRight) || 0;
    safe.b = parseFloat(cs.paddingBottom) || 0;
    safe.l = parseFloat(cs.paddingLeft) || 0;
  }

  function resize() {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [bgCanvas, cv]) {
      c.width = Math.round(W * DPR);
      c.height = Math.round(H * DPR);
    }
    readSafe();
    landscape = W > H * 1.15;
    body.classList.toggle('landscape', landscape);
    computeCams();
    seedBackground();
    if (st.scene === 'reveal' && st.letterShown) layoutLetter();
  }

  function computeCams() {
    const s = Math.min(H * 0.48, W * 0.9, 520);
    camGrow.s = s;
    camGrow.x = W / 2;
    camGrow.y = H - Math.max(safe.b, 0) - Math.max(H * 0.1, 40);

    if (landscape) {
      const sr = Math.min(H * 0.6, W * 0.36, 520);
      camReveal.s = sr;
      camReveal.x = W * 0.29;
      camReveal.y = H * 0.36 + (STEM + 0.03) * sr;
    } else {
      const sr = s * 0.8;
      camReveal.s = sr;
      camReveal.x = W / 2;
      const headTop = 0.27 * HEADK * sr;           // approx height of bloom above stem tip
      const tipY = Math.max(safe.t + 40 + headTop, H * 0.27);
      camReveal.y = tipY + (STEM + 0.03) * sr;
    }
  }

  const w2s = (c, x, y) => ({ x: c.x + x * c.s, y: c.y - y * c.s });

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  const STAGES = [0.07, 0.25, 0.45, 0.63, 0.81, 1.0];

  const st = {
    scene: 'intro',
    time: 0,
    seedA: 0,          // seed opacity
    seedPulse: 0,
    plantT: 0,         // planting animation 0..1
    planted: false,
    plantA: 0,         // plant opacity (for fade-in after replay)
    stage: 0,
    g: 0,              // displayed growth 0..1
    gT: 0,             // target growth
    lastTap: -10,
    wob: 0,
    wobV: 0,
    holding: false,
    holdId: null,
    progress: 0,       // hold progress 0..1
    bloom: 0,          // displayed bloom 0..1
    revealT: 0,
    camMix: 0,
    letterShown: false,
    holdHaptic: 0,
    headBox: null,
    groundGlow: 0,
  };

  /* ------------------------------------------------------------------ *
   * Sprites (pre-rendered for fast particles)
   * ------------------------------------------------------------------ */
  function sprite(size, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    return c;
  }

  function heartPath(x, cx, cy, s) {
    x.beginPath();
    x.moveTo(cx, cy + s * 0.36);
    x.bezierCurveTo(cx - s * 0.6, cy - s * 0.02, cx - s * 0.42, cy - s * 0.55, cx, cy - s * 0.22);
    x.bezierCurveTo(cx + s * 0.42, cy - s * 0.55, cx + s * 0.6, cy - s * 0.02, cx, cy + s * 0.36);
    x.closePath();
  }

  const SPR = {};
  function buildSprites() {
    const glow = (inner, mid, outer) => sprite(64, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, inner);
      g.addColorStop(0.18, mid);
      g.addColorStop(0.5, outer);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    });
    SPR.pink = glow('rgba(255,245,246,1)', 'rgba(255,180,200,0.85)', 'rgba(230,100,140,0.18)');
    SPR.gold = glow('rgba(255,250,240,1)', 'rgba(255,215,190,0.85)', 'rgba(227,160,130,0.18)');
    SPR.white = glow('rgba(255,255,255,1)', 'rgba(255,235,240,0.7)', 'rgba(255,200,220,0.1)');

    SPR.bokeh = [
      ['rgba(214,90,128,0.32)', 'rgba(214,90,128,0)'],
      ['rgba(227,173,152,0.26)', 'rgba(227,173,152,0)'],
      ['rgba(124,20,51,0.45)', 'rgba(124,20,51,0)'],
    ].map(([a, b]) => sprite(128, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, a);
      g.addColorStop(0.55, a.replace(/[\d.]+\)$/, (m) => (parseFloat(m) * 0.6).toFixed(2) + ')'));
      g.addColorStop(1, b);
      x.fillStyle = g;
      x.fillRect(0, 0, s, s);
    }));

    SPR.hearts = [
      ['#ffd0da', '#e05a7d', '#8e1736'],
      ['#ffe4dc', '#e8a090', '#a4485a'],
      ['#f8b6c4', '#c2264d', '#5e0a20'],
    ].map(([a, b, c]) => sprite(64, (x, s) => {
      x.shadowColor = 'rgba(255,120,150,0.8)';
      x.shadowBlur = 10;
      heartPath(x, s / 2, s / 2 + 2, s * 0.62);
      const g = x.createLinearGradient(s * 0.3, s * 0.2, s * 0.6, s * 0.85);
      g.addColorStop(0, a); g.addColorStop(0.5, b); g.addColorStop(1, c);
      x.fillStyle = g;
      x.fill();
      x.shadowBlur = 0;
      x.strokeStyle = 'rgba(255,230,235,0.5)';
      x.lineWidth = 1;
      x.stroke();
    }));

    SPR.petals = [
      ['#2a030c', '#9e1c3d', '#e98ea3'],
      ['#3a0712', '#b82f4f', '#f3b3bf'],
      ['#22020a', '#7d1030', '#d56a85'],
      ['#43101c', '#c45470', '#f6cbd2'],
    ].map(([a, b, c]) => sprite(64, (x, s) => {
      x.beginPath();
      x.moveTo(s * 0.5, s * 0.94);
      x.bezierCurveTo(s * 0.12, s * 0.74, s * 0.04, s * 0.26, s * 0.34, s * 0.1);
      x.quadraticCurveTo(s * 0.5, s * 0.17, s * 0.66, s * 0.09);
      x.bezierCurveTo(s * 0.96, s * 0.26, s * 0.88, s * 0.74, s * 0.5, s * 0.94);
      x.closePath();
      const g = x.createRadialGradient(s * 0.5, s * 0.95, 1, s * 0.5, s * 0.5, s * 0.55);
      g.addColorStop(0, a); g.addColorStop(0.45, b); g.addColorStop(1, c);
      x.fillStyle = g;
      x.fill();
      x.save();
      x.clip();
      const h = x.createLinearGradient(s * 0.2, 0, s * 0.8, s);
      h.addColorStop(0, 'rgba(255,230,235,0.28)');
      h.addColorStop(0.5, 'rgba(255,230,235,0)');
      x.fillStyle = h;
      x.fillRect(0, 0, s, s);
      x.restore();
      x.strokeStyle = 'rgba(255,210,218,0.35)';
      x.lineWidth = 0.8;
      x.stroke();
    }));
  }

  /* ------------------------------------------------------------------ *
   * Particles
   * ------------------------------------------------------------------ */
  const parts = [];
  const ripples = [];
  const MAXP = 520;

  function addPart(p) {
    if (parts.length >= MAXP) parts.splice(0, parts.length - MAXP + 1);
    p.t = 0;
    parts.push(p);
  }

  const k = () => (reduced ? 0.3 : 1); // particle density multiplier

  function sparkles(x, y, n, opt = {}) {
    n = Math.round(n * k());
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const sp = rand(opt.minV || 20, opt.maxV || 140);
      addPart({
        kind: 'spark',
        x: x + rand(-1, 1) * (opt.spread || 6),
        y: y + rand(-1, 1) * (opt.spread || 6),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opt.lift || 30),
        drag: opt.drag || 2.2,
        grav: opt.grav != null ? opt.grav : -18,
        life: rand(0.7, opt.life || 1.8),
        size: rand(5, opt.size || 16),
        spr: Math.random() < 0.55 ? SPR.pink : Math.random() < 0.6 ? SPR.gold : SPR.white,
        tw: rand(6, 14),
      });
    }
  }

  function hearts(x, y, n, opt = {}) {
    n = Math.max(opt.min || 0, Math.round(n * k()));
    for (let i = 0; i < n; i++) {
      addPart({
        kind: 'heart',
        x: x + rand(-1, 1) * (opt.spread || 20),
        y: y + rand(-1, 1) * (opt.spread || 10),
        vx: rand(-30, 30) + (opt.vx || 0),
        vy: rand(-90, -40) * (opt.speed || 1),
        drag: 0.8,
        grav: -12,
        life: rand(1.8, opt.life || 3.2),
        size: rand(9, opt.size || 20),
        spr: SPR.hearts[(Math.random() * SPR.hearts.length) | 0],
        sway: rand(14, 34),
        ph: rand(0, TAU),
        rot: rand(-0.3, 0.3),
      });
    }
  }

  function petals(x, y, n, opt = {}) {
    n = Math.round(n * k());
    for (let i = 0; i < n; i++) {
      const a = opt.angle != null ? opt.angle + rand(-opt.cone, opt.cone) : rand(0, TAU);
      const sp = rand(opt.minV || 40, opt.maxV || 320);
      addPart({
        kind: 'petal',
        x: x + rand(-1, 1) * (opt.spread || 10),
        y: y + rand(-1, 1) * (opt.spread || 10),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        drag: opt.drag || 1.4,
        grav: opt.grav || 26,
        life: rand(3.5, opt.life || 7),
        size: rand(12, opt.size || 26),
        spr: SPR.petals[(Math.random() * SPR.petals.length) | 0],
        rot: rand(0, TAU),
        vr: rand(-2.4, 2.4),
        flip: rand(0, TAU),
        vf: rand(1.5, 4.5),
        sway: rand(10, 40),
        ph: rand(0, TAU),
      });
    }
  }

  function ripple(x, y, opt = {}) {
    ripples.push({ x, y, t: 0, life: opt.life || 1.4, r0: opt.r0 || 6, r1: opt.r1 || 120, w: opt.w || 1.6, gold: !!opt.gold });
  }

  function updateParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life || p.y < -80 || p.y > H + 80) { parts.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.grav * dt;
      let sx = 0;
      if (p.kind === 'heart') sx = Math.sin(p.t * 2.2 + p.ph) * p.sway * dt;
      if (p.kind === 'petal') {
        sx = Math.sin(p.t * 1.6 + p.ph) * p.sway * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
      }
      p.x += p.vx * dt + sx;
      p.y += p.vy * dt;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += dt;
      if (ripples[i].t > ripples[i].life) ripples.splice(i, 1);
    }
  }

  function drawSprite(c, img, x, y, size, rot, sx, sy, alpha) {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    c.globalAlpha = alpha;
    c.setTransform(DPR * cs * sx, DPR * sn * sx, -DPR * sn * sy, DPR * cs * sy, DPR * x, DPR * y);
    c.drawImage(img, -size / 2, -size / 2, size, size);
  }

  function drawParticles() {
    // petals & hearts (normal blend)
    for (const p of parts) {
      if (p.kind === 'spark') continue;
      const life = p.t / p.life;
      const a = Math.min(1, p.t * 4) * (1 - smooth(0.7, 1, life));
      if (p.kind === 'petal') {
        const fl = Math.cos(p.flip);
        drawSprite(ctx, p.spr, p.x, p.y, p.size, p.rot, 0.25 + 0.75 * Math.abs(fl), 1, a * 0.95);
      } else {
        const pop = 0.6 + 0.4 * easeOut(Math.min(1, p.t * 3));
        drawSprite(ctx, p.spr, p.x, p.y, p.size * pop, p.rot + Math.sin(p.t * 2 + p.ph) * 0.15, 1, 1, a * 0.9);
      }
    }
    // sparkles (additive)
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (p.kind !== 'spark') continue;
      const life = p.t / p.life;
      const tw = 0.65 + 0.35 * Math.sin(p.t * p.tw);
      const a = Math.min(1, p.t * 6) * (1 - life) * tw;
      drawSprite(ctx, p.spr, p.x, p.y, p.size * (1 - life * 0.5), 0, 1, 1, a);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1;
    for (const r of ripples) {
      const t = r.t / r.life;
      const e = easeOut(t);
      const rad = lerp(r.r0, r.r1, e);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.strokeStyle = r.gold ? `rgba(240,195,170,${(1 - t) * 0.7})` : `rgba(245,160,185,${(1 - t) * 0.6})`;
      ctx.lineWidth = r.w * (1 - t * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad * 0.72, 0, TAU);
      ctx.strokeStyle = `rgba(255,220,225,${(1 - t) * 0.25})`;
      ctx.lineWidth = r.w * 0.6;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ *
   * Background: stars, bokeh, drifting petals, parallax
   * ------------------------------------------------------------------ */
  const sky = { stars: [], bokeh: [], drift: [] };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };

  function seedBackground() {
    const area = W * H;
    const nStars = Math.round(clamp(area / 4200, 70, 260));
    sky.stars = [];
    for (let i = 0; i < nStars; i++) {
      sky.stars.push({
        x: Math.random() * W, y: Math.random() * H,
        s: Math.random() < 0.08 ? rand(5, 9) : rand(1.6, 4.2),
        tw: rand(0.4, 1.8), ph: rand(0, TAU), d: rand(0.2, 1),
        a: rand(0.25, 0.9),
      });
    }
    if (!sky.bokeh.length || sky._w !== W) {
      sky.bokeh = [];
      const nB = Math.round(clamp(area / 60000, 8, 18));
      for (let i = 0; i < nB; i++) {
        sky.bokeh.push({
          x: Math.random() * W, y: Math.random() * H,
          r: rand(40, 150), vx: rand(-5, 5), vy: rand(-7, -1.5),
          d: rand(0.4, 1.4), spr: SPR.bokeh[i % SPR.bokeh.length], ph: rand(0, TAU),
        });
      }
      sky.drift = [];
      const nD = Math.round(clamp(area / 90000, 5, 11));
      for (let i = 0; i < nD; i++) sky.drift.push(newDrift(true));
      sky._w = W;
    }
  }

  function newDrift(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -30,
      vx: rand(-8, 14), vy: rand(10, 26),
      rot: rand(0, TAU), vr: rand(-0.8, 0.8),
      flip: rand(0, TAU), vf: rand(0.6, 1.8),
      size: rand(10, 20), d: rand(0.5, 1.3),
      spr: SPR.petals[(Math.random() * SPR.petals.length) | 0],
      ph: rand(0, TAU),
      a: rand(0.3, 0.6),
    };
  }

  function drawBackground(dt) {
    const t = st.time;
    if (!reduced) {
      par.x += (par.tx + Math.sin(t * 0.11) * 0.25 - par.x) * (1 - Math.exp(-dt * 2));
      par.y += (par.ty + Math.cos(t * 0.09) * 0.2 - par.y) * (1 - Math.exp(-dt * 2));
    }
    const px = par.x * 14, py = par.y * 10;

    bg.setTransform(DPR, 0, 0, DPR, 0, 0);
    bg.clearRect(0, 0, W, H);
    bg.globalCompositeOperation = 'lighter';

    // bokeh
    for (const b of sky.bokeh) {
      if (!reduced) { b.x += b.vx * dt; b.y += b.vy * dt; }
      if (b.y < -b.r) { b.y = H + b.r; b.x = Math.random() * W; }
      if (b.x < -b.r) b.x = W + b.r; else if (b.x > W + b.r) b.x = -b.r;
      const a = 0.55 + 0.45 * Math.sin(t * 0.3 + b.ph);
      drawSprite(bg, b.spr, b.x + px * b.d * 1.6, b.y + py * b.d * 1.6, b.r * 2, 0, 1, 1, a * (0.7 + st.bloom * 0.3));
    }

    // stars
    for (const s of sky.stars) {
      const tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph);
      drawSprite(bg, s.s > 5 ? SPR.gold : SPR.white, s.x + px * s.d, s.y + py * s.d, s.s * 2.2, 0, 1, 1, s.a * tw);
    }
    bg.globalCompositeOperation = 'source-over';

    // floating petals
    for (let i = 0; i < sky.drift.length; i++) {
      const p = sky.drift[i];
      if (!reduced) {
        p.x += (p.vx + Math.sin(t * 0.7 + p.ph) * 12) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
      }
      if (p.y > H + 40 || p.x < -60 || p.x > W + 60) sky.drift[i] = newDrift(false);
      drawSprite(bg, p.spr, p.x + px * p.d * 2, p.y + py * p.d * 2, p.size, p.rot, 0.3 + 0.7 * Math.abs(Math.cos(p.flip)), 1, p.a);
    }
    bg.setTransform(DPR, 0, 0, DPR, 0, 0);
    bg.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * THE ROSE — procedural 3D petals, projected and painted on canvas
   * ------------------------------------------------------------------ */
  // Petal layers from the heart of the rose (k = 0) to the outer guard petals (k = 5).
  //   a0*: base tilt from vertical (c = closed bud, o = open bloom)
  //   b1*: linear bend along the petal (negative = tip leans inward)
  //   b3o: extra tip curl when open (reflexed petals)
  //   wrap: how much the petal wraps around the rose axis
  //   cup: how cupped the petal is across its width; refl: edge roll-back when open
  const LAYERS = [
    { n: 3, len: 0.105, wid: 0.085, r0: 0.003, a0c: 0.10, b1c: -0.42, a0o: 0.16, b1o: -0.42, b3o: 0.00, wrapc: 1.0, wrapo: 0.95, cupc: 0.9, cupo: 0.85, refl: 0.0 },
    { n: 4, len: 0.13, wid: 0.10, r0: 0.006, a0c: 0.18, b1c: -0.52, a0o: 0.34, b1o: -0.48, b3o: 0.00, wrapc: 1.0, wrapo: 0.85, cupc: 0.9, cupo: 0.8, refl: 0.0 },
    { n: 5, len: 0.155, wid: 0.115, r0: 0.010, a0c: 0.26, b1c: -0.6, a0o: 0.62, b1o: -0.45, b3o: 0.20, wrapc: 1.0, wrapo: 0.6, cupc: 0.85, cupo: 0.62, refl: 0.12 },
    { n: 5, len: 0.18, wid: 0.13, r0: 0.014, a0c: 0.34, b1c: -0.68, a0o: 0.92, b1o: -0.25, b3o: 0.45, wrapc: 0.95, wrapo: 0.34, cupc: 0.8, cupo: 0.45, refl: 0.35 },
    { n: 6, len: 0.2, wid: 0.145, r0: 0.018, a0c: 0.42, b1c: -0.76, a0o: 1.18, b1o: -0.05, b3o: 0.65, wrapc: 0.9, wrapo: 0.16, cupc: 0.75, cupo: 0.32, refl: 0.55 },
    { n: 6, len: 0.215, wid: 0.155, r0: 0.022, a0c: 0.5, b1c: -0.84, a0o: 1.42, b1o: 0.1, b3o: 0.8, wrapc: 0.85, wrapo: 0.06, cupc: 0.7, cupo: 0.22, refl: 0.75 },
  ];

  const PAL = {
    petalIn: [[44, 3, 13], [122, 13, 38], [184, 38, 70], [232, 120, 142]],
    petalOut: [[72, 6, 24], [158, 24, 56], [214, 66, 98], [238, 124, 148]],
    sepalIn: [[16, 30, 16], [40, 74, 40], [70, 110, 60], [104, 140, 84]],
    sepalOut: [[24, 42, 22], [54, 92, 48], [92, 132, 74], [138, 162, 104]],
  };

  const rose = [];
  (function buildRose() {
    const r = mulberry32(14022026);
    LAYERS.forEach((L, k) => {
      const off = k * 2.39996 + 0.4;
      for (let i = 0; i < L.n; i++) {
        rose.push({
          kind: 'petal', k, L,
          phi: off + (i * TAU) / L.n + (r() - 0.5) * 0.3,
          lenM: 0.92 + r() * 0.16,
          widM: 0.9 + r() * 0.2,
          delayJ: (r() - 0.5) * 0.09,
          tiltJ: (r() - 0.5) * 0.12,
          ruff: r() * TAU,
        });
      }
    });
    for (let i = 0; i < 5; i++) {
      rose.push({
        kind: 'sepal', k: -1,
        phi: (i * TAU) / 5 + 0.35 + (r() - 0.5) * 0.2,
        lenM: 0.9 + r() * 0.2, widM: 0.9 + r() * 0.2,
        delayJ: (r() - 0.5) * 0.1, tiltJ: (r() - 0.5) * 0.15, ruff: r() * TAU,
      });
    }
  })();

  // Camera tilt — we look slightly down into the rose.
  const TILT = 0.4;
  const cT = Math.cos(TILT), sT = Math.sin(TILT);
  const VIEW = [0, sT, cT];
  const LIGHT = (() => { const v = [-0.38, 0.82, 0.42]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

  const M = 16;
  const CL_R = new Float32Array(M + 1);
  const CL_Y = new Float32Array(M + 1);
  const CL_B = new Float32Array(M + 1);
  const NS = 13;                         // outline samples per side
  const U_SAMPLES = Array.from({ length: NS }, (_, i) => Math.sin((i / (NS - 1)) * Math.PI / 2));

  // Reusable per-petal render records.
  const recs = rose.map(() => ({ pts: new Float32Array(NS * 4), veins: new Float32Array(3 * 7 * 2), depth: 0, p: null }));

  function petalParams(p, bloom, sepO, time, breathe) {
    if (p.kind === 'petal') {
      const L = p.L, kk = p.k;
      const d = clamp((5 - kk) * 0.085 + p.delayJ, 0, 0.6);
      let o = easeSine(clamp((bloom - d) / (1 - d)));
      o = clamp(o + breathe * (0.4 + kk * 0.12));
      return {
        kind: 'petal', k: kk, o,
        // closed: inner petals tucked lower, outer tips curl in to a point
        len: L.len * p.lenM * lerp(0.62 + 0.076 * kk, 1, o), wid: L.wid * p.widM, r0: L.r0, y0: kk * 0.0035 * o,
        a0: lerp(L.a0c + 0.06 * kk, L.a0o, o) + p.tiltJ * (0.3 + o),
        b1: lerp(L.b1c, L.b1o, o),
        b3: lerp(-0.55 - 0.06 * kk, L.b3o, o),
        wrap: lerp(L.wrapc, L.wrapo, o),
        cup: lerp(L.cupc, L.cupo, o),
        refl: L.refl * o,
        phi: p.phi + Math.sin(time * 0.6 + p.ruff) * 0.008,
        ruff: p.ruff,
      };
    }
    const o = clamp(sepO + p.delayJ * sepO);
    return {
      kind: 'sepal', k: -1, o,
      len: 0.13 * p.lenM, wid: 0.045 * p.widM, r0: 0.018, y0: -0.006,
      a0: lerp(0.28, 1.95, o) + p.tiltJ * o,
      b1: lerp(-0.42, 0.55, o),
      b3: lerp(0, 0.5, o),
      wrap: lerp(0.75, 0.0, o),
      cup: lerp(0.55, 0.2, o),
      refl: 0,
      phi: p.phi,
      ruff: p.ruff,
    };
  }

  function centerline(P) {
    let r = P.r0, y = 0;
    const ds = P.len / M;
    for (let i = 0; i <= M; i++) {
      const u = i / M;
      CL_R[i] = r; CL_Y[i] = y; CL_B[i] = P.a0 + P.b1 * u + P.b3 * u * u * u;
      const um = (i + 0.5) / M;
      const bm = P.a0 + P.b1 * um + P.b3 * um * um * um;
      r += Math.sin(bm) * ds;
      y += Math.cos(bm) * ds;
    }
  }

  function halfWidth(kind, u) {
    if (kind === 'sepal') {
      return (0.38 + 0.62 * Math.pow(Math.sin(Math.PI * Math.min(u * 1.6, 1) * 0.5), 0.6)) * Math.pow(1 - u, 0.85);
    }
    const uc = 0.6;
    if (u < uc) return 0.16 + 0.84 * Math.pow(Math.sin((u / uc) * Math.PI / 2), 1.25);
    const q = (u - uc) / (1 - uc);
    return Math.sqrt(Math.max(0, 1 - q * q));
  }

  const tmp = { x: 0, y: 0, z: 0 };
  // 3D point on petal surface. u along the petal (0 base → 1 tip), v across (-1 … 1).
  function petalPoint(P, u, v, out) {
    const f = u * M;
    const i0 = Math.min(M - 1, Math.floor(f));
    const fr = f - i0;
    const R = CL_R[i0] + (CL_R[i0 + 1] - CL_R[i0]) * fr;
    const Y = CL_Y[i0] + (CL_Y[i0 + 1] - CL_Y[i0]) * fr;
    const B = CL_B[i0] + (CL_B[i0 + 1] - CL_B[i0]) * fr;
    const hw = halfWidth(P.kind, u) * P.wid;
    const a = v * hw;
    const nr = -Math.cos(B), ny = Math.sin(B);
    let cupAmt = P.cup * (1 - 0.35 * u) - P.refl * u * u * 1.3;
    let dd = cupAmt * v * v * hw * 0.9;
    // delicate ruffle at the rim of open petals
    if (P.kind === 'petal') dd += Math.sin(v * 5.5 + P.ruff) * 0.006 * u * u * P.o;
    const radial = R + nr * dd;
    const yy = Y + ny * dd;
    const cp = Math.cos(P.phi), sp = Math.sin(P.phi);
    const fx = radial * cp - a * sp;
    const fz = radial * sp + a * cp;
    const Rw = Math.max(radial, 0.012);
    const ang = clamp(a / Rw, -1.45, 1.45);
    const wx = Rw * Math.cos(P.phi + ang);
    const wz = Rw * Math.sin(P.phi + ang);
    out.x = fx + (wx - fx) * P.wrap;
    out.z = fz + (wz - fz) * P.wrap;
    out.y = P.y0 + yy;
    return out;
  }

  const col = (c, l) => `rgb(${Math.min(255, c[0] * l) | 0},${Math.min(255, c[1] * l) | 0},${Math.min(255, c[2] * l) | 0})`;
  const cola = (c, l, a) => `rgba(${Math.min(255, c[0] * l) | 0},${Math.min(255, c[1] * l) | 0},${Math.min(255, c[2] * l) | 0},${a})`;

  function tracePath(c, pts, n) {
    // smooth closed curve through points (midpoint quadratic)
    const lx = pts[(n - 1) * 2], ly = pts[(n - 1) * 2 + 1];
    c.beginPath();
    c.moveTo((lx + pts[0]) / 2, (ly + pts[1]) / 2);
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], y = pts[i * 2 + 1];
      const j = (i + 1) % n;
      c.quadraticCurveTo(x, y, (x + pts[j * 2]) / 2, (y + pts[j * 2 + 1]) / 2);
    }
    c.closePath();
  }

  const A = { x: 0, y: 0, z: 0 }, Bp = { x: 0, y: 0, z: 0 }, Cp = { x: 0, y: 0, z: 0 }, Dp = { x: 0, y: 0, z: 0 };

  /**
   * Draw the rose head.
   * bx,by: screen position of receptacle; rot: screen rotation; px: pixels per head unit
   */
  function drawRoseHead(bx, by, rot, px, bloom, sepO, glow) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const proj = (p, out, i) => {
      const y2 = p.y * cT - p.z * sT;
      const lx = p.x, ly = -y2;
      out[i] = bx + (lx * cr - ly * sr) * px;
      out[i + 1] = by + (lx * sr + ly * cr) * px;
    };
    const breathe = st.scene === 'reveal' ? Math.sin(st.time * 1.1) * 0.012 * (reduced ? 0 : 1) : 0;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;

    const list = [];
    for (let idx = 0; idx < rose.length; idx++) {
      const p = rose[idx];
      const P = petalParams(p, bloom, sepO, st.time, breathe);
      if (P.kind === 'sepal') P.len *= sepalRel;
      centerline(P);
      const rec = recs[idx];
      rec.P = P;
      const pts = rec.pts;
      let n = 0;
      // right edge base → tip
      for (let i = 0; i < NS; i++) { petalPoint(P, U_SAMPLES[i], 1, tmp); proj(tmp, pts, n * 2); n++; }
      // left edge tip → base
      for (let i = NS - 1; i >= 0; i--) { petalPoint(P, U_SAMPLES[i], -1, tmp); proj(tmp, pts, n * 2); n++; }
      rec.n = n;
      for (let i = 0; i < n; i++) {
        const x = pts[i * 2], y = pts[i * 2 + 1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }

      // Depth: an open flower sorts by true view depth; a closed bud sorts like
      // nested cups (outer back → inner → outer front) so inner petals stay inside.
      petalPoint(P, 0.5, 0, tmp);
      const viewD = tmp.z * cT + tmp.y * sT + (P.kind === 'sepal' ? -0.004 : 0);
      const layer = P.kind === 'sepal' ? 6 : P.k;
      const front = tmp.z;
      const cupD = front >= 0 ? 0.3 + layer * 0.05 + front : -0.3 - layer * 0.05 + front;
      const wOpen = smooth(0.2, 0.7, P.o);
      rec.depth = lerp(cupD, viewD, wOpen);

      // lighting from the surface normal
      petalPoint(P, 0.55, -0.6, A); petalPoint(P, 0.55, 0.6, Bp);
      petalPoint(P, 0.15, 0, Cp); petalPoint(P, 0.9, 0, Dp);
      const ux = Bp.x - A.x, uy = Bp.y - A.y, uz = Bp.z - A.z;
      const vx = Dp.x - Cp.x, vy = Dp.y - Cp.y, vz = Dp.z - Cp.z;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      // orient the normal toward the inner (cup) face
      const Bm = CL_B[M >> 1];
      const inr = -Math.cos(Bm), iny = Math.sin(Bm);
      const ix = inr * Math.cos(P.phi), iz = inr * Math.sin(P.phi);
      if (nx * ix + ny * iny + nz * iz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const seeInner = nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] > 0;
      const s = seeInner ? 1 : -1;
      const diff = Math.max(0, s * (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]));
      rec.inner = seeInner;
      rec.lum = 0.42 + 0.78 * diff;

      // base & tip in screen space for gradients
      petalPoint(P, 0.02, 0, tmp);
      rec.bxy = rec.bxy || new Float32Array(6);
      proj(tmp, rec.bxy, 0);
      petalPoint(P, 1, 0, tmp); proj(tmp, rec.bxy, 2);
      petalPoint(P, 0.62, 0.35, tmp); proj(tmp, rec.bxy, 4);

      // veins
      const vv = [-0.45, 0, 0.45];
      for (let j = 0; j < 3; j++) {
        for (let q = 0; q < 7; q++) {
          petalPoint(P, 0.05 + (q / 6) * 0.82, vv[j] * (0.4 + q / 12), tmp);
          proj(tmp, rec.veins, (j * 7 + q) * 2);
        }
      }
      list.push(rec);
    }
    list.sort((a, b) => a.depth - b.depth);

    st.headBox = { minX, maxX, minY, maxY, bx, by, px };

    // magical glow behind the head
    const cxg = bx + sr * -0.08 * px, cyg = by - cr * 0.08 * px;
    ctx.globalCompositeOperation = 'lighter';
    const gr = px * (0.32 + 0.45 * bloom);
    const g = ctx.createRadialGradient(cxg, cyg, 0, cxg, cyg, gr * 1.6);
    g.addColorStop(0, `rgba(255,150,175,${0.10 + 0.32 * glow})`);
    g.addColorStop(0.45, `rgba(220,70,110,${0.05 + 0.14 * glow})`);
    g.addColorStop(1, 'rgba(120,20,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cxg - gr * 1.6, cyg - gr * 1.6, gr * 3.2, gr * 3.2);
    ctx.globalCompositeOperation = 'source-over';

    // receptacle (rose hip)
    {
      const hx = bx + sr * 0.01 * px, hy = by + cr * 0.012 * px;
      const hr = 0.032 * px * (0.8 + 0.2 * sepalRel);
      const hg = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.4, hr * 0.1, hx, hy, hr * 1.2);
      hg.addColorStop(0, '#5d8a50');
      hg.addColorStop(0.6, '#2c4a2a');
      hg.addColorStop(1, '#122012');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.ellipse(hx, hy, hr * 0.95, hr * 1.1, rot, 0, TAU);
      ctx.fill();
    }

    const lw = Math.max(0.5, px * 0.0045);
    const bloomLift = 1 + bloom * 0.12 + glow * 0.06;

    for (const rec of list) {
      const P = rec.P;
      const isSepal = P.kind === 'sepal';
      const pal = isSepal ? (rec.inner ? PAL.sepalIn : PAL.sepalOut) : (rec.inner ? PAL.petalIn : PAL.petalOut);
      const layerL = isSepal ? 1 : 0.8 + 0.045 * P.k;
      const depthL = 0.84 + 0.16 * clamp((rec.depth + 0.12) / 0.24);
      const L = rec.lum * layerL * depthL * (isSepal ? 1 : bloomLift);

      tracePath(ctx, rec.pts, rec.n);

      // soft contact shadow cast onto petals behind
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(12,0,5,0.26)';
      ctx.lineWidth = Math.max(1.2, px * 0.016);
      ctx.stroke();

      const b = rec.bxy;
      let tx = b[2], ty = b[3];
      if (Math.abs(tx - b[0]) + Math.abs(ty - b[1]) < 1) ty -= 1;
      const lg = ctx.createLinearGradient(b[0], b[1], tx, ty);
      lg.addColorStop(0, col(pal[0], L * 0.9));
      lg.addColorStop(0.42, col(pal[1], L));
      lg.addColorStop(0.82, col(pal[2], L));
      lg.addColorStop(1, col(pal[3], L));
      ctx.fillStyle = lg;
      ctx.fill();

      // depth & sheen inside the petal
      ctx.save();
      ctx.clip();
      const plen = Math.hypot(tx - b[0], ty - b[1]);
      const rr = Math.max(4, plen * 0.62);
      const sg = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], rr);
      sg.addColorStop(0, isSepal ? 'rgba(5,12,5,0.55)' : 'rgba(22,0,8,0.5)');
      sg.addColorStop(1, 'rgba(22,0,8,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(b[0] - rr, b[1] - rr, rr * 2, rr * 2);
      if (!isSepal) {
        const hr = Math.max(3, plen * 0.45);
        const hg = ctx.createRadialGradient(b[4], b[5], 0, b[4], b[5], hr);
        hg.addColorStop(0, `rgba(255,170,190,${0.03 + 0.08 * rec.lum})`);
        hg.addColorStop(1, 'rgba(255,205,215,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(b[4] - hr, b[5] - hr, hr * 2, hr * 2);
      }
      // veins
      ctx.lineWidth = Math.max(0.4, px * 0.0022);
      ctx.strokeStyle = isSepal ? 'rgba(160,200,140,0.10)' : `rgba(60,0,16,${0.16 + 0.08 * (1 - rec.lum)})`;
      const vs = rec.veins;
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.moveTo(vs[j * 14], vs[j * 14 + 1]);
        for (let q = 1; q < 7; q++) ctx.lineTo(vs[j * 14 + q * 2], vs[j * 14 + q * 2 + 1]);
        ctx.stroke();
      }
      ctx.restore();

      // luminous rim
      tracePath(ctx, rec.pts, rec.n);
      ctx.lineWidth = lw;
      ctx.strokeStyle = isSepal ? `rgba(150,190,120,${0.14 * rec.lum})` : cola(pal[3], 1.08, 0.08 + 0.2 * rec.lum);
      ctx.stroke();
    }

    // inner light from the heart of the bloom
    if (bloom > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      const hx = bx + sr * -0.1 * px, hy = by - cr * 0.1 * px;
      const r2 = px * 0.16;
      const ig = ctx.createRadialGradient(hx, hy, 0, hx, hy, r2);
      ig.addColorStop(0, `rgba(255,190,200,${0.22 * bloom * (0.6 + 0.4 * glow)})`);
      ig.addColorStop(1, 'rgba(255,120,150,0)');
      ctx.fillStyle = ig;
      ctx.fillRect(hx - r2, hy - r2, r2 * 2, r2 * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  let sepalRel = 1;

  /* ------------------------------------------------------------------ *
   * Stem, thorns, leaves
   * ------------------------------------------------------------------ */
  function stemCtrl(len) {
    const t = st.time;
    const sway = (reduced ? 0 : Math.sin(t * 0.9) * 0.011 + Math.sin(t * 0.37 + 1) * 0.008) + st.wob * 0.045;
    const nod = (1 - smooth(0.2, 0.62, st.g)) * 0.2;
    return [
      { x: 0, y: 0 },
      { x: 0.055 * len, y: 0.36 * len },
      { x: -0.065 * len + sway * 0.35, y: 0.7 * len },
      { x: 0.015 * len + sway * len * 0.9 + nod * len, y: len * (1 - nod * 0.25) },
    ];
  }

  function bez(P, t) {
    const u = 1 - t;
    return {
      x: u * u * u * P[0].x + 3 * u * u * t * P[1].x + 3 * u * t * t * P[2].x + t * t * t * P[3].x,
      y: u * u * u * P[0].y + 3 * u * u * t * P[1].y + 3 * u * t * t * P[2].y + t * t * t * P[3].y,
    };
  }
  function bezD(P, t) {
    const u = 1 - t;
    return {
      x: 3 * u * u * (P[1].x - P[0].x) + 6 * u * t * (P[2].x - P[1].x) + 3 * t * t * (P[3].x - P[2].x),
      y: 3 * u * u * (P[1].y - P[0].y) + 6 * u * t * (P[2].y - P[1].y) + 3 * t * t * (P[3].y - P[2].y),
    };
  }

  const LEAVES = [
    { t: 0.3, side: -1, g0: 0.2, g1: 0.44, size: 1.0, ph: 0.3 },
    { t: 0.5, side: 1, g0: 0.38, g1: 0.62, size: 1.1, ph: 1.7 },
    { t: 0.7, side: -1, g0: 0.56, g1: 0.8, size: 0.82, ph: 3.1 },
  ];
  const THORNS = [
    { t: 0.14, side: 1 }, { t: 0.37, side: -1 }, { t: 0.58, side: 1 }, { t: 0.8, side: -1 }, { t: 0.9, side: 1 },
  ];

  function drawStem(c, cp, len) {
    const N = 30;
    const thick = (0.45 + 0.55 * smooth(0, 0.8, st.g)) * c.s;
    const left = [], right = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = bez(cp, t), d = bezD(cp, t);
      const dl = Math.hypot(d.x, d.y) || 1;
      const nx = -d.y / dl, ny = d.x / dl;
      const w = (0.0125 - 0.0055 * t) * thick / c.s * (t > 0.96 ? 1 - (t - 0.96) * 6 : 1);
      const s = w;
      left.push(w2s(c, p.x - nx * s, p.y - ny * s));
      right.push(w2s(c, p.x + nx * s, p.y + ny * s));
    }
    const base = w2s(c, 0, 0);
    const wpx = 0.0125 * thick;
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i <= N; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = N; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    const g = ctx.createLinearGradient(base.x - wpx * 1.5, 0, base.x + wpx * 1.5, 0);
    g.addColorStop(0, '#0b150c');
    g.addColorStop(0.35, '#2b4d2c');
    g.addColorStop(0.55, '#4d7a45');
    g.addColorStop(1, '#0f1d10');
    ctx.fillStyle = g;
    ctx.fill();
    // vertical tone: deeper at the base, bronze blush near the top (young growth)
    const top = w2s(c, cp[3].x, cp[3].y);
    const vg = ctx.createLinearGradient(0, base.y, 0, top.y);
    vg.addColorStop(0, 'rgba(10,2,6,0.55)');
    vg.addColorStop(0.5, 'rgba(10,2,6,0)');
    vg.addColorStop(1, 'rgba(120,40,50,0.28)');
    ctx.fillStyle = vg;
    ctx.fill();
    // rose-gold rim light
    ctx.beginPath();
    ctx.moveTo(right[2].x, right[2].y);
    for (let i = 3; i <= N - 1; i++) ctx.lineTo(right[i].x, right[i].y);
    ctx.strokeStyle = 'rgba(236,180,160,0.28)';
    ctx.lineWidth = Math.max(0.6, c.s * 0.0022);
    ctx.stroke();
  }

  function drawThorns(c, cp, len) {
    for (const th of THORNS) {
      const vis = smooth(th.t * 0.9 + 0.05, th.t * 0.9 + 0.2, len / STEM);
      if (vis <= 0) continue;
      const p = bez(cp, th.t), d = bezD(cp, th.t);
      const dl = Math.hypot(d.x, d.y) || 1;
      const tx = d.x / dl, ty = d.y / dl;
      const nx = -ty * th.side, ny = tx * th.side;
      const w = (0.0125 - 0.0055 * th.t) * (0.45 + 0.55 * smooth(0, 0.8, st.g));
      const sz = 0.02 * vis;
      const b1 = w2s(c, p.x + nx * w * 0.8 - tx * sz * 0.55, p.y + ny * w * 0.8 - ty * sz * 0.55);
      const b2 = w2s(c, p.x + nx * w * 0.8 + tx * sz * 0.45, p.y + ny * w * 0.8 + ty * sz * 0.45);
      const tip = w2s(c, p.x + nx * (w + sz * 0.9) + tx * sz * 0.7, p.y + ny * (w + sz * 0.9) + ty * sz * 0.7);
      ctx.beginPath();
      ctx.moveTo(b1.x, b1.y);
      ctx.quadraticCurveTo((b1.x + tip.x) / 2, (b1.y + tip.y) / 2 + 0.5, tip.x, tip.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.closePath();
      const g = ctx.createLinearGradient(b1.x, b1.y, tip.x, tip.y);
      g.addColorStop(0, '#2c3b22');
      g.addColorStop(0.6, '#6b2c2a');
      g.addColorStop(1, '#c78a74');
      ctx.fillStyle = g;
      ctx.fill();
    }
  }

  function leaflet(x, y, ang, len, open, mature, seed) {
    if (len < 0.5) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    const hwMax = len * 0.36;
    const young = [118, 36, 44], green = [50, 92, 50];
    const c = [lerp(young[0], green[0], mature), lerp(young[1], green[1], mature), lerp(young[2], green[2], mature)];
    const halves = [
      { s: -1, k: lerp(0.12, 1, open), L: 1.05 },   // upper (lit)
      { s: 1, k: lerp(0.04, 0.82, open), L: 0.62 },  // lower (shadow)
    ];
    const arch = -0.05 * len;
    for (const h of halves) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const N = 22;
      for (let i = 1; i <= N; i++) {
        const u = i / N;
        let hw = Math.pow(Math.sin(Math.PI * Math.min(u, 0.999)), 0.82) * (1 - 0.18 * u) * hwMax;
        if (u > 0.12 && u < 0.96) hw *= 1 - 0.1 * ((u * 10 + seed) % 1);   // serrated edge
        const my = arch * Math.sin(Math.PI * u);
        ctx.lineTo(u * len, my + h.s * hw * h.k);
      }
      for (let i = N; i >= 0; i--) {
        const u = i / N;
        ctx.lineTo(u * len, arch * Math.sin(Math.PI * u));
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, col(c, 0.55 * h.L));
      g.addColorStop(0.5, col(c, 1.0 * h.L));
      g.addColorStop(1, col(c, 1.25 * h.L));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = `rgba(230,170,150,${0.12 * h.L})`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      // veins
      ctx.strokeStyle = `rgba(190,220,160,${0.16 * h.L * open})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (let v = 1; v <= 5; v++) {
        const u = v / 6.5;
        const hw = Math.pow(Math.sin(Math.PI * u), 0.82) * hwMax * h.k * 0.8;
        const my = arch * Math.sin(Math.PI * u);
        ctx.moveTo(u * len, my);
        ctx.quadraticCurveTo(u * len + len * 0.08, my + h.s * hw * 0.5, u * len + len * 0.14, my + h.s * hw);
      }
      ctx.stroke();
    }
    // midrib
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, arch * 2, len * 0.97, 0);
    ctx.strokeStyle = 'rgba(200,225,170,0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function drawLeaves(c, cp) {
    const t = st.time;
    for (const L of LEAVES) {
      const un = easeOut(smooth(L.g0, L.g1, st.g));
      if (un <= 0.001) continue;
      const p = bez(cp, L.t), d = bezD(cp, L.t);
      const s = w2s(c, p.x, p.y);
      const stemAng = Math.atan2(-d.y, d.x);
      const sway = (reduced ? 0 : Math.sin(t * 1.1 + L.ph) * 0.05) + st.wob * 0.12;
      const ang = stemAng + L.side * (0.62 + 0.42 * un) + sway;
      const size = 0.16 * L.size * c.s * (0.2 + 0.8 * un);
      // petiole
      const pl = size * 0.5;
      const ex = s.x + Math.cos(ang) * pl, ey = s.y + Math.sin(ang) * pl;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo((s.x + ex) / 2, (s.y + ey) / 2 - pl * 0.12, ex, ey);
      ctx.strokeStyle = '#2b452a';
      ctx.lineWidth = Math.max(1, c.s * 0.0055);
      ctx.lineCap = 'round';
      ctx.stroke();
      // lateral pair, then terminal leaflet
      const lat = smooth(0.25, 1, un);
      const mx = s.x + Math.cos(ang) * pl * 0.55, my = s.y + Math.sin(ang) * pl * 0.55;
      const droop = 0.18 * un * L.side;
      leaflet(mx, my, ang - 0.85 + droop, size * 0.55 * (0.3 + 0.7 * lat), lat, un, L.ph);
      leaflet(mx, my, ang + 0.85 + droop, size * 0.55 * (0.3 + 0.7 * lat), lat, un, L.ph + 0.4);
      leaflet(ex, ey, ang + droop * 0.6, size * 0.78, un, un, L.ph + 0.8);
    }
  }

  function drawSprout(c, cp, alpha) {
    // tiny leaf-bud and baby leaves at the shoot tip, before the rosebud forms
    const tip = w2s(c, cp[3].x, cp[3].y);
    const d = bezD(cp, 1);
    const ang = Math.atan2(-d.y, d.x);
    const baby = smooth(0.02, 0.12, st.g) * (1 - smooth(0.32, 0.5, st.g));
    if (baby > 0.01) {
      const sz = c.s * 0.075 * baby;
      leaflet(tip.x, tip.y, ang - 0.75, sz, 0.8 * baby, 0.4, 0.2);
      leaflet(tip.x, tip.y, ang + 0.75, sz, 0.8 * baby, 0.4, 0.6);
    }
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(ang + Math.PI / 2);
    const r = c.s * 0.016;
    ctx.beginPath();
    ctx.moveTo(0, -r * 2.2);
    ctx.bezierCurveTo(r * 1.2, -r * 1.2, r * 1.1, r * 0.6, 0, r * 0.7);
    ctx.bezierCurveTo(-r * 1.1, r * 0.6, -r * 1.2, -r * 1.2, 0, -r * 2.2);
    const g = ctx.createLinearGradient(0, -r * 2.2, 0, r);
    g.addColorStop(0, '#a5525a');
    g.addColorStop(1, '#2f4f2e');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * Seed & ground
   * ------------------------------------------------------------------ */
  function seedPos() {
    const start = { x: W / 2, y: H * 0.5 };
    const end = w2s(camGrow, 0, 0.004);
    if (st.scene === 'planting') {
      const e = easeInOut(clamp(st.plantT));
      const arc = Math.sin(Math.PI * e) * -H * 0.05;
      return { x: lerp(start.x, end.x, e), y: lerp(start.y, end.y, e) + arc, s: lerp(1, 0.55, e) };
    }
    return { ...start, s: 1 };
  }

  function drawSeed() {
    if (st.seedA <= 0.001) return;
    const p = seedPos();
    const t = st.time;
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.1);
    const a = st.seedA;
    const sc = p.s * Math.min(1.25, Math.max(0.85, Math.min(W, H) / 420));

    ctx.globalCompositeOperation = 'lighter';
    drawSprite(ctx, SPR.pink, p.x, p.y, (150 + pulse * 40 + st.seedPulse * 160) * sc, 0, 1, 1, a * (0.45 + 0.25 * pulse));
    drawSprite(ctx, SPR.gold, p.x, p.y, 60 * sc, 0, 1, 1, a * 0.9);
    // orbiting motes
    if (!reduced) {
      for (let i = 0; i < 4; i++) {
        const ang = t * (0.7 + i * 0.13) + i * 1.7;
        const rr = (26 + i * 7) * sc;
        drawSprite(ctx, SPR.white, p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr * 0.55, 7 * sc, 0, 1, 1, a * (0.5 + 0.5 * Math.sin(t * 3 + i)));
      }
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    // the seed body — an almond of light
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(-0.45 + Math.sin(t * 0.8) * 0.06);
    const r = 8 * sc;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.5);
    ctx.bezierCurveTo(r * 1.05, -r * 0.9, r * 1.0, r * 0.9, 0, r * 1.35);
    ctx.bezierCurveTo(-r * 1.0, r * 0.9, -r * 1.05, -r * 0.9, 0, -r * 1.5);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.5, 0, 0, 0, r * 1.6);
    g.addColorStop(0, '#fff1e6');
    g.addColorStop(0.35, '#f0b9a2');
    g.addColorStop(0.75, '#b85a62');
    g.addColorStop(1, '#5a1426');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(255,170,160,0.9)';
    ctx.shadowBlur = 18 * sc;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,230,220,0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, -r * 1.1);
    ctx.quadraticCurveTo(r * 0.35, 0, -r * 0.05, r * 1.0);
    ctx.stroke();
    ctx.restore();
  }

  function drawGround(c) {
    const p = w2s(c, 0, 0);
    const a = st.groundGlow * (1 - st.camMix * 0.85);
    if (a <= 0.01) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.22);
    const r = c.s * 0.55;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(250,180,175,${0.5 * a})`);
    g.addColorStop(0.3, `rgba(200,70,110,${0.28 * a})`);
    g.addColorStop(1, 'rgba(90,10,40,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------------------ *
   * Plant composite
   * ------------------------------------------------------------------ */
  const plantInfo = { tip: { x: 0, y: 0 }, head: { x: 0, y: 0 }, px: 0, rot: 0 };

  function drawPlant(c) {
    const len = STEM * clamp(st.g / 0.86) * 1.0 + 0.012;
    const cp = stemCtrl(len);
    const a = st.plantA;
    ctx.globalAlpha = a;

    drawStem(c, cp, len);
    drawThorns(c, cp, len);
    drawLeaves(c, cp);

    const budS = st.g < 0.47 ? 0 : 0.16 + 0.84 * smooth(0.47, 1, st.g);
    const tipW = cp[3];
    const tip = w2s(c, tipW.x, tipW.y);
    const d = bezD(cp, 1);
    const rot = Math.atan2(d.x, d.y) * 0.85;
    plantInfo.tip = tip;
    plantInfo.rot = rot;

    if (budS <= 0.001) {
      drawSprout(c, cp, a);
      plantInfo.px = 0;
      plantInfo.head = { x: tip.x, y: tip.y - c.s * 0.03 };
    } else {
      if (st.g < 0.62) drawSprout(c, cp, a * (1 - smooth(0.47, 0.56, st.g)));
      const px = c.s * HEADK * budS;
      sepalRel = lerp(1.7, 1.0, smooth(0.47, 1, st.g));
      const budLoose = smooth(0.9, 1, st.g) * 0.12;
      const sepO = clamp(budLoose + st.bloom * 1.8);
      const glow = clamp(st.bloom * 0.8 + (st.holding ? 0.25 : 0) + st.camMix * 0.3);
      ctx.globalAlpha = 1;
      drawRoseHead(tip.x, tip.y, rot, px, st.bloom, sepO, glow * a);
      plantInfo.px = px;
      const hoff = 0.1 * px;
      plantInfo.head = { x: tip.x + Math.sin(rot) * hoff, y: tip.y - Math.cos(rot) * hoff };
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ *
   * Ring (press-and-hold progress)
   * ------------------------------------------------------------------ */
  let ringShownProgress = -1;
  function updateRing() {
    if (st.scene !== 'ready' && st.scene !== 'reveal') return;
    const r = camGrow.s * HEADK * 0.31 * (st.scene === 'reveal' ? lerp(1, camReveal.s / camGrow.s, st.camMix) : 1);
    const size = r * 2;
    const hx = plantInfo.head.x, hy = plantInfo.head.y;
    ringEl.style.transform = `translate3d(${(hx - r).toFixed(1)}px, ${(hy - r).toFixed(1)}px, 0) scale(${(size / 200).toFixed(4)})`;
    if (Math.abs(ringShownProgress - st.progress) > 0.001) {
      ringProg.style.strokeDashoffset = (1 - st.progress).toFixed(4);
      ringShownProgress = st.progress;
    }
    // a glowing bead at the end of the arc
    if (st.scene === 'ready' && st.progress > 0.005) {
      const ang = -Math.PI / 2 + st.progress * TAU;
      const bx = hx + Math.cos(ang) * r * 0.94, by = hy + Math.sin(ang) * r * 0.94;
      ctx.globalCompositeOperation = 'lighter';
      drawSprite(ctx, SPR.gold, bx, by, 26 + (st.holding ? 8 * Math.sin(st.time * 10) : 0), 0, 1, 1, st.holding ? 1 : 0.6);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  /* ------------------------------------------------------------------ *
   * Text
   * ------------------------------------------------------------------ */
  function setText(el, text, opts = {}) {
    clearTimeout(el._t);
    const fill = () => {
      el.classList.remove('out', 'nudge');
      el.textContent = '';
      if (!text) return;
      const wrap = document.createElement('span');
      wrap.className = 'w-wrap';
      text.split(' ').forEach((w, i, arr) => {
        const s = document.createElement('span');
        s.className = 'w';
        s.style.setProperty('--i', i);
        s.textContent = w;
        wrap.appendChild(s);
        if (i < arr.length - 1) wrap.appendChild(document.createTextNode(' '));
      });
      el.style.setProperty('--d', (opts.delay || 0) + 'ms');
      el.appendChild(wrap);
      if (opts.announce !== false) announce(text);
    };
    if (el.textContent.trim()) {
      el.classList.add('out');
      el._t = setTimeout(fill, opts.swap || 650);
    } else if (opts.delay && !text) {
      fill();
    } else {
      fill();
    }
  }

  function announce(text) {
    liveEl.textContent = '';
    setTimeout(() => { liveEl.textContent = text; }, 40);
  }

  /* ------------------------------------------------------------------ *
   * Scenes
   * ------------------------------------------------------------------ */
  function setScene(name) {
    st.scene = name;
    body.dataset.scene = name;
    const label = TEXT.aria[name];
    if (label) stageEl.setAttribute('aria-label', label);
  }

  function startIntro() {
    setScene('intro');
    curtain.classList.add('open');
    setTimeout(() => {
      setScene('seed');
      setText(msgEl, TEXT.seedMsg, { delay: 200 });
      setTimeout(() => { if (st.scene === 'seed') setText(hintEl, TEXT.seedHint, { delay: 0, announce: false }); }, reduced ? 400 : 2400);
    }, 700);
  }

  function onSeedTap(x, y, viaKey) {
    const p = seedPos();
    const hitR = Math.max(72, Math.min(W, H) * 0.16);
    if (!viaKey && Math.hypot(x - p.x, y - p.y) > hitR) {
      sparkles(x, y, 6, { maxV: 50, size: 10 });
      hintEl.classList.remove('nudge');
      void hintEl.offsetWidth;
      hintEl.classList.add('nudge');
      return;
    }
    // magical ripple — the story begins
    ripple(p.x, p.y, { r1: Math.min(W, H) * 0.6, life: 1.8, w: 2, gold: true });
    ripple(p.x, p.y, { r1: Math.min(W, H) * 0.35, life: 1.3, w: 1.2 });
    sparkles(p.x, p.y, 46, { maxV: 220, size: 18 });
    hearts(p.x, p.y, 6, { min: 2 });
    st.seedPulse = 1;
    haptic(14);
    Music.chime(0);
    setText(msgEl, '', {});
    setText(hintEl, '', {});
    setScene('planting');
    st.plantT = 0;
  }

  function finishPlanting() {
    const g = w2s(camGrow, 0, 0);
    ripple(g.x, g.y, { r1: camGrow.s * 0.5, life: 1.6, gold: true });
    sparkles(g.x, g.y, 34, { maxV: 160, lift: 60 });
    st.planted = true;
    st.plantA = 1;
    st.stage = 0;
    st.gT = STAGES[0];
    st.wobV += 1.5;
    setScene('grow');
    setTimeout(() => { if (st.scene === 'grow' && st.stage === 0) setText(hintEl, TEXT.growHint, { announce: true }); }, 700);
  }

  function onGrowTap(x, y) {
    const now = st.time;
    const cool = reduced ? 0.3 : 0.6;
    const tip = plantInfo.head;
    if (now - st.lastTap < cool || st.stage >= 5) {
      sparkles(tip.x, tip.y, 5, { maxV: 60, size: 10 });
      return;
    }
    st.lastTap = now;
    st.stage++;
    st.gT = STAGES[st.stage];
    st.wobV += (Math.random() < 0.5 ? -1 : 1) * 2.4;
    haptic(10);
    Music.chime(st.stage);

    const gy = w2s(camGrow, 0, (STAGES[st.stage] / 0.86) * STEM);
    sparkles(tip.x, (tip.y + gy.y) / 2, 30, { spread: 30, maxV: 170, lift: 50 });
    hearts(tip.x, tip.y, 6, { min: 3, spread: 30 });
    ripple(x, y, { r1: 70, life: 1.0, w: 1.2 });

    if (st.stage === 1) setText(hintEl, '', {});
    if (st.stage <= 4) setText(msgEl, TEXT.grow[st.stage - 1], {});
    else setText(msgEl, '', {});
  }

  function enterReady() {
    setScene('ready');
    body.classList.add('ring-on');
    setText(msgEl, TEXT.bloom, { delay: 100 });
    setText(hintEl, '', {});
    const h = plantInfo.head;
    sparkles(h.x, h.y, 26, { spread: 20, maxV: 120 });
  }

  function startHold(id) {
    if (st.scene !== 'ready' || st.holding) return;
    st.holding = true;
    st.holdId = id;
    body.classList.add('holding');
    if (hintEl.textContent.trim()) setText(hintEl, '', { announce: false });
    haptic(8);
    Music.swell(true);
  }

  function endHold() {
    if (!st.holding) return;
    st.holding = false;
    st.holdId = null;
    body.classList.remove('holding');
    Music.swell(false);
    if (st.scene === 'ready' && st.progress > 0 && st.progress < 1) {
      setText(hintEl, TEXT.resume, { delay: 150 });
    }
  }

  function enterReveal() {
    st.holding = false;
    body.classList.remove('holding');
    Music.swell(false);
    setScene('reveal');
    st.revealT = 0;
    st.progress = 1;
    ringProg.style.strokeDashoffset = '0';
    body.classList.add('revealed');
    setTimeout(() => body.classList.remove('ring-on'), 600);
    setText(msgEl, '', { announce: false });
    setText(hintEl, '', { announce: false });

    const h = plantInfo.head;
    haptic([18, 40, 26]);
    Music.bloom();
    ripple(h.x, h.y, { r1: Math.max(W, H) * 0.8, life: 2.4, w: 2.4, gold: true });
    ripple(h.x, h.y, { r1: Math.max(W, H) * 0.5, life: 1.8, w: 1.4 });
    sparkles(h.x, h.y, 140, { spread: 30, maxV: 420, minV: 60, drag: 1.6, life: 2.6, size: 22 });
    petals(h.x, h.y, 90, { minV: 120, maxV: 560, spread: 20, drag: 1.3, life: 8 });
    hearts(h.x, h.y, 28, { spread: 50, speed: 1.4, life: 4, size: 26, min: 8 });
    // a soft rain of petals from above
    for (let i = 0; i < Math.round(26 * k()); i++) {
      setTimeout(() => {
        petals(rand(0, W), -20, 1, { angle: Math.PI / 2, cone: 0.4, minV: 20, maxV: 60, grav: 18, drag: 0.6, life: 12 });
      }, i * 140);
    }
  }

  function layoutLetter() {
    // predicted head box in the reveal camera
    const hb = st.headBox;
    let top, width, avail;
    const btnRoom = 130;
    if (landscape) {
      width = Math.min(W * 0.44, 560);
      avail = H * 0.84 - btnRoom;
      root.style.setProperty('--letter-left', `${W * 0.71}px`);
      root.style.setProperty('--letter-top', `${H * 0.5}px`);
    } else {
      let bottom = camReveal.y - STEM * camReveal.s + 0.12 * HEADK * camReveal.s;
      if (hb && st.camMix > 0.5) bottom = Math.max(bottom, hb.maxY);
      top = bottom + 8;
      width = Math.min(W * 0.88, 560);
      avail = H - top - Math.max(safe.b, 12) - btnRoom;
      root.style.setProperty('--letter-left', `${W / 2}px`);
      root.style.setProperty('--letter-top', `${top}px`);
    }
    root.style.setProperty('--letter-width', `${width}px`);
    measureEl.style.width = width + 'px';
    measureEl.innerHTML = letterHTML(false);
    let fs = landscape ? 27 : Math.min(24, Math.max(18, W / 18));
    for (; fs > 12; fs -= 0.5) {
      measureEl.style.fontSize = fs + 'px';
      if (measureEl.offsetHeight <= avail) break;
    }
    root.style.setProperty('--letter-size', `${fs}px`);
  }

  function letterHTML(spans) {
    const paras = TEXT.letter.split('\n');
    const out = [];
    paras.forEach((line, li) => {
      if (line === '') { out.push('<span class="gap"></span>'); return; }
      const cls = li === paras.length - 1 ? ' class="last"' : '';
      const words = line.split(' ').map((w) => {
        const chars = spans ? [...w].map((ch) => `<span class="c">${ch}</span>`).join('') : w;
        return `<span class="word">${chars}</span>`;
      });
      const sp = spans ? '<span class="c"> </span>' : ' ';
      out.push(`<span${cls}>${words.join(sp)}</span>`);
      if (li < paras.length - 1 && paras[li + 1] !== '') out.push('<br>');
    });
    return out.join('');
  }

  let typeTimer = null;
  function showLetter() {
    st.letterShown = true;
    layoutLetter();
    letterEl.innerHTML = letterHTML(true);
    letterSr.textContent = TEXT.letter.replace(/\n+/g, ' ');
    finaleEl.setAttribute('aria-hidden', 'false');
    body.classList.add('letter-on');
    announce(TEXT.letter.replace(/\n+/g, ' '));

    const chars = [...letterEl.querySelectorAll('.c')];
    const lineOf = (el) => { let n = el; while (n.parentElement !== letterEl) n = n.parentElement; return n; };
    const caret = document.createElement('span');
    caret.className = 'caret';
    let i = 0;

    if (reduced) {
      chars.forEach((c) => c.classList.add('on'));
      setTimeout(afterLetter, 600);
      return;
    }

    const step = () => {
      if (st.scene !== 'reveal') return;
      if (i >= chars.length) { caret.remove(); afterLetter(); return; }
      const c = chars[i++];
      c.classList.add('on');
      c.after(caret);
      const ch = c.textContent;
      let d = 38 + Math.random() * 34;
      if (ch === ',') d = 260;
      else if (ch === '.') {
        const next = chars[i] && chars[i].textContent;
        d = next === '.' ? 160 : 520;
      }
      // pause at line ends (when the next char lives in a new line block)
      if (chars[i] && lineOf(c) !== lineOf(chars[i])) d += 380;
      typeTimer = setTimeout(step, d);
    };
    typeTimer = setTimeout(step, 400);
  }

  function afterLetter() {
    setTimeout(() => {
      if (st.scene !== 'reveal') return;
      finaleEl.classList.add('heart-on');
      const r = finaleEl.querySelector('.finale__heart').getBoundingClientRect();
      setTimeout(() => {
        if (st.scene !== 'reveal') return;
        hearts(r.left + r.width / 2, r.top + r.height / 2, 10, { spread: 14, min: 4 });
        sparkles(r.left + r.width / 2, r.top + r.height / 2, 24, { maxV: 120 });
      }, 1300);
    }, 300);
    setTimeout(() => {
      if (st.scene !== 'reveal') return;
      finaleEl.classList.add('replay-on');
      replayBtn.tabIndex = 0;
    }, 2400);
  }

  function replay() {
    if (st.scene !== 'reveal') return;
    replayBtn.tabIndex = -1;
    curtain.classList.add('fast');
    curtain.classList.remove('open');
    setTimeout(() => {
      clearTimeout(typeTimer);
      parts.length = 0;
      ripples.length = 0;
      Object.assign(st, {
        seedA: 0, seedPulse: 0, plantT: 0, planted: false, plantA: 0, stage: 0, g: 0, gT: 0,
        lastTap: -10, wob: 0, wobV: 0, holding: false, holdId: null, progress: 0, bloom: 0,
        revealT: 0, camMix: 0, letterShown: false, headBox: null, groundGlow: 0,
      });
      ringShownProgress = -1;
      ringProg.style.strokeDashoffset = '1';
      body.classList.remove('revealed', 'letter-on', 'ring-on', 'holding');
      finaleEl.classList.remove('heart-on', 'replay-on');
      finaleEl.setAttribute('aria-hidden', 'true');
      letterEl.innerHTML = '';
      letterSr.textContent = '';
      msgEl.textContent = '';
      hintEl.textContent = '';
      if (document.activeElement === replayBtn) stageEl.focus({ preventScroll: true });
      startIntro();
      setTimeout(() => curtain.classList.remove('fast'), 1000);
    }, 950);
  }

  /* ------------------------------------------------------------------ *
   * Input — touch, mouse, pen and keyboard
   * ------------------------------------------------------------------ */
  function tapAt(x, y, viaKey) {
    Music.unlock();
    if (st.scene === 'seed') onSeedTap(x, y, viaKey);
    else if (st.scene === 'grow') onGrowTap(x, y);
  }

  stageEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    if (st.scene === 'ready') {
      try { stageEl.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
      Music.unlock();
      startHold(e.pointerId);
    } else {
      tapAt(e.clientX, e.clientY, false);
    }
  });

  const release = (e) => { if (st.holding && st.holdId === e.pointerId) endHold(); };
  stageEl.addEventListener('pointerup', release);
  stageEl.addEventListener('pointercancel', release);
  stageEl.addEventListener('lostpointercapture', release);

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      par.tx = (e.clientX / W - 0.5) * 2;
      par.ty = (e.clientY / H - 0.5) * 2;
    }
  }, { passive: true });

  // block iOS callouts, magnifier, double-tap zoom & scroll on the stage
  stageEl.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  stageEl.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (e.target === stageEl || st.holding) e.preventDefault(); });
  document.addEventListener('selectstart', (e) => { if (st.scene !== 'reveal') e.preventDefault(); });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  // Keyboard works when the stage is focused, or when nothing in particular is (no click needed first).
  const keyTarget = (e) => e.target === stageEl || e.target === body || e.target === root;
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Spacebar') return;
    if (!keyTarget(e)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (st.scene === 'ready') { Music.unlock(); startHold('key'); }
    else {
      const h = st.scene === 'seed' ? seedPos() : plantInfo.head;
      tapAt(h.x, h.y, true);
    }
  });
  document.addEventListener('keyup', (e) => {
    if ((e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar') && st.holdId === 'key') endHold();
  });
  stageEl.addEventListener('blur', () => { if (st.holdId === 'key') endHold(); });
  window.addEventListener('blur', endHold);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { endHold(); Music.pause(); } else Music.resume();
  });

  replayBtn.addEventListener('click', replay);

  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  /* ------------------------------------------------------------------ *
   * Haptics (Android; iOS Safari silently ignores)
   * ------------------------------------------------------------------ */
  function haptic(p) {
    if (reduced) return;
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* noop */ }
  }

  /* ------------------------------------------------------------------ *
   * Music — a gentle music-box & string-pad score, synthesised live
   * with the Web Audio API (no audio files, nothing to license).
   * ------------------------------------------------------------------ */
  const Music = (() => {
    let ac = null, master = null, bus = null, rev = null, swellG = null;
    let on = false, timer = null, nextT = 0, step = 0;
    const BPM = 66;
    const EIGHTH = 60 / BPM / 2;
    const BAR = 6; // 6/8 lilt
    // Fmaj7 · Am7 · Dm9 · B♭maj7 · Gm7 · C6 · Fmaj7 · C(sus)
    const PROG = [
      { bass: 41, ch: [53, 57, 60, 64] },
      { bass: 45, ch: [52, 57, 60, 64] },
      { bass: 38, ch: [53, 57, 60, 64] },
      { bass: 46, ch: [53, 57, 58, 62] },
      { bass: 43, ch: [53, 55, 58, 62] },
      { bass: 48, ch: [52, 55, 57, 60] },
      { bass: 41, ch: [53, 57, 60, 64] },
      { bass: 48, ch: [53, 55, 60, 62] },
    ];
    const ARP = [0, 1, 2, 3, 2, 1, 0, 2, 3, 4, 3, 1];
    const MELODY = [ // sparse top line, one note per bar (index into chord + octave), -1 = rest
      [7, 1.0], [-1], [6, 0.9], [7, 0.8], [8, 1.0], [7, 0.8], [6, 0.9], [-1],
    ];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function init() {
      if (ac) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3;
      master.connect(comp).connect(ac.destination);

      swellG = ac.createGain();
      swellG.gain.value = 1;
      swellG.connect(master);

      bus = ac.createGain();
      bus.gain.value = 0.8;
      bus.connect(swellG);

      rev = ac.createConvolver();
      rev.buffer = impulse(3.6, 2.4);
      const wet = ac.createGain();
      wet.gain.value = 0.55;
      bus.connect(rev).connect(wet).connect(swellG);
      return true;
    }

    function impulse(sec, decay) {
      const len = Math.floor(ac.sampleRate * sec);
      const buf = ac.createBuffer(2, len, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    function bell(t, midi, vel, dest) {
      const f = mtof(midi);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      if (pan) { pan.pan.value = (Math.random() - 0.5) * 0.6; g.connect(pan).connect(dest || bus); } else g.connect(dest || bus);
      [[1, 1], [2.001, 0.28], [3.0, 0.07], [4.2, 0.035]].forEach(([mul, amp]) => {
        const o = ac.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const og = ac.createGain();
        og.gain.value = amp;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(t + 3);
      });
    }

    function pad(t, notes, dur) {
      const g = ac.createGain();
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      lp.Q.value = 0.3;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 1.8);
      g.gain.setValueAtTime(0.05, t + dur - 0.4);
      g.gain.linearRampToValueAtTime(0, t + dur + 2.2);
      g.connect(lp).connect(bus);
      notes.forEach((m) => {
        [-7, 7].forEach((det) => {
          const o = ac.createOscillator();
          o.type = 'triangle';
          o.frequency.value = mtof(m);
          o.detune.value = det;
          o.connect(g);
          o.start(t);
          o.stop(t + dur + 2.4);
        });
      });
    }

    function bass(t, m, dur) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(m);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.13, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + dur + 0.1);
    }

    function schedule() {
      while (nextT < ac.currentTime + 0.25) {
        const barIdx = Math.floor(step / (BAR * 2));          // chord lasts 2 bars
        const chord = PROG[barIdx % PROG.length];
        const inChord = step % (BAR * 2);
        if (inChord === 0) {
          pad(nextT, chord.ch, EIGHTH * BAR * 2);
          bass(nextT, chord.bass, EIGHTH * BAR * 2);
        }
        const tones = chord.ch.concat(chord.ch.map((n) => n + 12));
        const ai = ARP[inChord];
        if (Math.random() > 0.08) bell(nextT + (Math.random() - 0.5) * 0.012, tones[ai] + 12, 0.045 + Math.random() * 0.03);
        if (inChord === 0 || inChord === BAR) {
          const mel = MELODY[(barIdx * 2 + (inChord ? 1 : 0)) % MELODY.length];
          if (mel[0] >= 0) bell(nextT + 0.02, tones[mel[0] % tones.length] + 12, 0.08 * mel[1]);
        }
        nextT += EIGHTH;
        step++;
      }
    }

    function fade(to, time) {
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(to, t + time);
    }

    function start() {
      if (!init()) return false;
      if (ac.state === 'suspended') ac.resume();
      on = true;
      nextT = ac.currentTime + 0.1;
      step = 0;
      clearInterval(timer);
      timer = setInterval(schedule, 60);
      schedule();
      fade(0.9, 2.5);
      return true;
    }

    function stop() {
      on = false;
      if (!ac) return;
      fade(0, 1.2);
      clearInterval(timer);
      timer = null;
    }

    return {
      get on() { return on; },
      toggle() { return on ? (stop(), false) : start(); },
      unlock() { if (ac && ac.state === 'suspended' && on) ac.resume(); },
      pause() { if (ac && on) ac.suspend(); },
      resume() { if (ac && on) ac.resume(); },
      chime(i) {
        if (!on || !ac) return;
        const notes = [77, 81, 84, 88, 89, 93];
        const t = ac.currentTime + 0.01;
        bell(t, notes[i % notes.length], 0.12);
        bell(t + 0.11, notes[(i + 2) % notes.length] + (i > 3 ? 0 : 0), 0.07);
      },
      swell(holding) {
        if (!on || !ac) return;
        const t = ac.currentTime;
        swellG.gain.cancelScheduledValues(t);
        swellG.gain.setValueAtTime(swellG.gain.value, t);
        swellG.gain.linearRampToValueAtTime(holding ? 1.35 : 1, t + (holding ? 3.5 : 1.2));
      },
      bloom() {
        if (!on || !ac) return;
        const t = ac.currentTime + 0.02;
        [65, 69, 72, 76, 77, 81, 84, 88].forEach((m, i) => bell(t + i * 0.09, m, 0.11 - i * 0.006));
      },
    };
  })();

  musicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const playing = Music.toggle();
    musicBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
    musicBtn.setAttribute('aria-label', playing ? 'Müziği kapat' : 'Müziği aç');
  });
  musicBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  /* ------------------------------------------------------------------ *
   * Main loop
   * ------------------------------------------------------------------ */
  let last = performance.now();
  let lastBloomVar = -1;

  function update(dt, realDt) {
    st.time += dt;

    // seed fade-in & tap pulse
    if (st.scene === 'seed') st.seedA = Math.min(1, st.seedA + dt * 0.8);
    st.seedPulse = Math.max(0, st.seedPulse - dt * 1.4);

    if (st.scene === 'planting') {
      st.plantT += dt / (reduced ? 0.8 : 1.6);
      if (st.plantT > 0.85) st.seedA = Math.max(0, 1 - (st.plantT - 0.85) / 0.15);
      if (!reduced && Math.random() < 0.6) {
        const p = seedPos();
        sparkles(p.x, p.y, 1, { maxV: 20, size: 10, lift: -10, grav: 0 });
      }
      st.groundGlow = Math.min(1, st.groundGlow + dt * 0.8);
      if (st.plantT >= 1) { st.seedA = 0; finishPlanting(); }
    }

    // organic growth easing
    const kg = reduced ? 5 : 1.6;
    st.g += (st.gT - st.g) * (1 - Math.exp(-dt * kg));

    // springy wobble from each touch
    const acc = -36 * st.wob - 3.4 * st.wobV;
    st.wobV += acc * dt;
    st.wob += st.wobV * dt;

    if (st.scene === 'grow' && st.stage >= 5 && st.g > 0.975) enterReady();

    if (st.scene === 'ready') {
      if (st.holding) {
        st.progress = Math.min(1, st.progress + realDt / HOLD_SECONDS);
        // glowing motes drawn into the rose while holding
        const h = plantInfo.head;
        const rate = (8 + 46 * st.progress) * k();
        if (Math.random() < rate * dt) {
          const r = camGrow.s * HEADK * 0.31;
          const a = rand(0, TAU);
          addPart({
            kind: 'spark', x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r,
            vx: -Math.cos(a) * rand(30, 70), vy: -Math.sin(a) * rand(30, 70) - 10,
            drag: 0.6, grav: -6, life: rand(0.9, 1.6), size: rand(6, 14),
            spr: Math.random() < 0.5 ? SPR.gold : SPR.pink, tw: rand(6, 12),
          });
        }
        if (Math.random() < (1 + st.progress * 4) * dt * k()) hearts(h.x, h.y - 10, 1, { spread: 40, size: 14 });
        const q = Math.floor(st.progress * 4);
        if (q > st.holdHaptic) { st.holdHaptic = q; haptic(8 + q * 4); }
        if (st.progress >= 1) enterReveal();
      }
    }

    // bloom follows hold progress in real time
    const target = st.scene === 'reveal' ? 1 : st.progress;
    st.bloom += (target - st.bloom) * (1 - Math.exp(-dt * (st.scene === 'reveal' ? 3 : 6)));

    if (st.scene === 'reveal') {
      st.revealT += dt;
      st.camMix = easeInOut(clamp(st.revealT / (reduced ? 1.2 : 2.6)));
      if (!st.letterShown && st.revealT > (reduced ? 1.3 : 2.5)) showLetter();
      // gentle ongoing magic
      if (Math.random() < 0.7 * dt * k() * 3) {
        const h = plantInfo.head;
        sparkles(h.x + rand(-60, 60), h.y + rand(-40, 30), 1, { maxV: 20, lift: 20, size: 12 });
      }
      if (Math.random() < 0.5 * dt * k()) petals(rand(0, W), -20, 1, { angle: Math.PI / 2, cone: 0.3, minV: 15, maxV: 40, grav: 14, drag: 0.5, life: 14 });
    }

    // ambient bloom light (CSS)
    const bv = Math.round(clamp(st.bloom * 0.85 + (st.holding ? 0.15 : 0)) * 100) / 100;
    if (bv !== lastBloomVar) { root.style.setProperty('--bloom', bv); lastBloomVar = bv; }

    updateParticles(dt);
  }

  function render(dt) {
    drawBackground(dt);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    cam.x = lerp(camGrow.x, camReveal.x, st.camMix);
    cam.y = lerp(camGrow.y, camReveal.y, st.camMix);
    cam.s = lerp(camGrow.s, camReveal.s, st.camMix);

    if (st.planted || st.scene === 'planting') drawGround(cam);
    if (st.planted) drawPlant(cam);
    if (st.scene === 'seed' || st.scene === 'planting' || st.scene === 'intro') drawSeed();
    drawParticles();
    updateRing();
  }

  function frame(now) {
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, raw);
    last = now;
    update(dt, Math.min(0.25, raw)); // hold timing follows the real clock even on slow frames
    render(dt);
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  buildSprites();
  resize();
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  const go = () => startIntro();
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]).then(go);
  } else go();

  // Expose a tiny read-only view of the state for automated testing.
  Object.defineProperty(window, '__rose', {
    value: {
      get scene() { return st.scene; }, get stage() { return st.stage; },
      get progress() { return st.progress; }, get bloom() { return st.bloom; }, get g() { return st.g; },
      // test helper: jump straight to a growth / bloom state
      jump(g, p) {
        msgEl.textContent = ''; hintEl.textContent = '';
        st.planted = true; st.plantA = 1; st.seedA = 0; st.groundGlow = 1; st.stage = 5;
        st.g = st.gT = g; st.progress = st.bloom = p || 0;
        setScene(g >= 1 ? 'ready' : 'grow');
      },
    },
  });
})();
