/* İkarus YKİ simülatörü — İHA yer kontrol istasyonunun tarayıcıda çalışan küçük bir kopyası.
   Harita + birincil uçuş göstergesi (PFD) + telemetri + MAVLink benzeri log.
   Ajanlar rotaya nokta ekler; ziyaretçi haritaya tıklayabilir, MANUEL'de klavyeyle uçurabilir,
   KİLİTLEN ile hedefi 5 sn kamera konisinde tutarak kilitlenmeyi dener. */
(() => {
  const root = document.getElementById('gcs');
  if (!root) return;
  const mapC = document.getElementById('gcs-map'), pfdC = document.getElementById('gcs-pfd');
  const mctx = mapC.getContext('2d'), pctx = pfdC.getContext('2d');
  const logEl = document.getElementById('gcs-log'), toast = document.getElementById('gcs-toast');
  const T = k => root.querySelector(`[data-t="${k}"]`);
  const btns = [...root.querySelectorAll('[data-mode]')];
  const STATIC = window.__STATIC || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // iki dil: sayfanın lang değerine göre
  const EN = document.documentElement.lang === 'en';
  const L = EN
    ? { OTONOM: 'AUTO', MANUEL: 'MANUAL', 'KİLİT': 'LOCK', RTL: 'RTL', track: 'TRACKING', manual: 'MANUAL · turn with ← → / A D',
        lockOk: '✓ LOCK-ON CONFIRMED', lowBat: '⚠ LOW BATTERY · RETURNING', time: 'time', swapped: 'battery swapped', returning: 'returning to launch',
        hb: 'link established', loaded: 'mission loaded', home: 'H · HOME', N: 'N', lat: 'N', lon: 'E', kmh: 'km/h', lockLbl: 'LOCK',
        dirs: { 0: 'N', 90: 'E', 180: 'S', 270: 'W' } }
    : { OTONOM: 'OTONOM', MANUEL: 'MANUEL', 'KİLİT': 'KİLİT', RTL: 'RTL', track: 'TAKİP EDİLİYOR', manual: 'MANUEL · ← → / A D ile dön',
        lockOk: '✓ KİLİTLENME BAŞARILI', lowBat: '⚠ BATARYA DÜŞÜK · EVE DÖN', time: 'süre', swapped: 'batarya değiştirildi', returning: 'eve dönülüyor',
        hb: 'bağlantı kuruldu', loaded: 'görev yüklendi', home: 'H · EV', N: 'K', lat: 'K', lon: 'D', kmh: 'km/s', lockLbl: 'KİLİT',
        dirs: { 0: 'K', 90: 'D', 180: 'G', 270: 'B' } };

  const WORLD = { w: 2400, h: 1500 };            // metre
  const HOME = { x: 360, y: 1180 };
  const LAT0 = 41.2867, LON0 = 36.3313;            // Samsun
  const SIM = 2.4;                                 // simülasyon hızı çarpanı
  const LOCK_S = 5;                                // kilitlenme süresi (sn)
  const D2R = Math.PI / 180;

  const st = {
    x: HOME.x, y: HOME.y, hdg: -0.7, spd: 22, alt: 120, tAlt: 120, roll: 0, pitch: 0, rate: 0,
    bat: 100, mode: 'OTONOM', trail: [], wp: [{ x: 820, y: 860 }, { x: 1480, y: 470 }, { x: 2020, y: 880 }, { x: 1320, y: 1230 }],
    wpi: 0, lock: null, lockT: 0, seq: 0, sats: 14, link: 98,
  };
  const targets = [0, 1, 2].map(i => ({ id: i + 1, x: 950 + i * 520, y: 330 + (i % 2) * 520, h: Math.random() * 6.28, v: 12 + Math.random() * 6 }));
  const keys = {};
  let visible = false, last = 0, logT = 0, agentT = 0, altT = 0, trailT = 0;
  let MW = 0, MH = 0, PW = 0, PH = 0, dpr = 1, sc = 1, ox = 0, oy = 0;

  // basit arazi: birkaç tepe için eş yükselti eğrileri (bir kez hesaplanır)
  const hills = [[700, 520, 5], [1650, 1050, 4], [1950, 330, 3], [420, 380, 3], [1200, 760, 2]].map(([cx, cy, n]) => {
    const rings = [];
    for (let k = 1; k <= n; k++) {
      const pts = [], r0 = k * 70, ph = Math.random() * 6;
      for (let a = 0; a <= 64; a++) {
        const t = a / 64 * Math.PI * 2;
        const r = r0 * (1 + .18 * Math.sin(3 * t + ph) + .1 * Math.sin(5 * t + ph * 2));
        pts.push([cx + Math.cos(t) * r * 1.25, cy + Math.sin(t) * r]);
      }
      rings.push(pts);
    }
    return rings;
  });

  /* ---- boyutlar ---- */
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const mr = mapC.getBoundingClientRect(), pr = pfdC.getBoundingClientRect();
    MW = mr.width; MH = mr.height; PW = pr.width; PH = pr.height;
    mapC.width = MW * dpr; mapC.height = MH * dpr; pfdC.width = PW * dpr; pfdC.height = PH * dpr;
    sc = Math.min(MW / WORLD.w, MH / WORLD.h);
    ox = (MW - WORLD.w * sc) / 2; oy = (MH - WORLD.h * sc) / 2;
  }
  const W2S = (x, y) => [ox + x * sc, oy + y * sc];
  const S2W = (x, y) => [(x - ox) / sc, (y - oy) / sc];

  /* ---- yardımcılar ---- */
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hdgDeg = () => ((st.hdg / D2R) + 90 + 360) % 360;
  const latlon = () => {
    const lat = LAT0 - (st.y - HOME.y) / 111320;
    const lon = LON0 + (st.x - HOME.x) / (111320 * Math.cos(lat * D2R));
    return [lat.toFixed(5), lon.toFixed(5)];
  };
  function steerTo(tx, ty, gain = 1.7) {
    const d = wrap(Math.atan2(ty - st.y, tx - st.x) - st.hdg);
    return Math.max(-.55, Math.min(.55, d * gain));
  }
  function log(cls, txt) {
    st.seq = (st.seq + 1) % 10000;
    const line = document.createElement('div');
    line.innerHTML = `<span class="d">#${String(st.seq).padStart(4, '0')}</span> <span class="${cls}">${txt}</span>`;
    logEl.append(line);
    while (logEl.children.length > 10) logEl.firstChild.remove();
  }
  let toastTimer;
  function say(txt, ok) {
    toast.textContent = txt; toast.classList.toggle('ok', !!ok); toast.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), 1800);
  }
  function setMode(m) {
    if (m === 'KİLİT') {
      // kameraya en yakın hedefi seç
      let best = null, bd = 1e9;
      for (const t of targets) { const d = dist(st, t); if (d < bd) { bd = d; best = t; } }
      st.lock = best; st.lockT = 0;
      log('w', `CMD_DO_SET_ROI target=H-${best.id} dist=${bd.toFixed(0)}m`);
      say(EN ? `${L.track} H-${best.id}` : `H-${best.id} ${L.track}`);
    } else st.lock = null;
    if (m === 'RTL') log('w', 'CMD_NAV_RETURN_TO_LAUNCH');
    if (m === 'MANUEL') say(L.manual);
    st.mode = m;
    btns.forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  }
  function addWp(p) {
    st.wp.push({ x: Math.max(80, Math.min(WORLD.w - 80, p.x)), y: Math.max(80, Math.min(WORLD.h - 80, p.y)) });
    if (st.wp.length > 7) { st.wp.shift(); st.wpi = Math.max(0, st.wpi - 1); }
    log('k', `MISSION_ITEM seq=${st.wp.length - 1} x=${p.x.toFixed(0)} y=${p.y.toFixed(0)} alt=${st.tAlt}`);
  }

  /* ---- fizik ---- */
  function update(dt, now) {
    let rate = 0;
    if (st.mode === 'OTONOM' && st.wp.length) {
      const w = st.wp[st.wpi % st.wp.length];
      rate = steerTo(w.x, w.y);
      if (dist(st, w) < 55) { log('g', `MISSION_ITEM_REACHED seq=${st.wpi % st.wp.length}`); st.wpi = (st.wpi + 1) % st.wp.length; }
    } else if (st.mode === 'MANUEL') {
      rate = (keys.ArrowLeft || keys.a ? -.5 : 0) + (keys.ArrowRight || keys.d ? .5 : 0);
      if (keys.ArrowUp || keys.w) st.tAlt = Math.min(300, st.tAlt + 40 * dt);
      if (keys.ArrowDown || keys.s) st.tAlt = Math.max(40, st.tAlt - 40 * dt);
    } else if (st.mode === 'KİLİT' && st.lock) {
      const t = st.lock;
      rate = steerTo(t.x, t.y, 2.2);
      const ang = Math.abs(wrap(Math.atan2(t.y - st.y, t.x - st.x) - st.hdg)), d = dist(st, t);
      if (ang < 22 * D2R && d < 460) st.lockT += dt; else st.lockT = Math.max(0, st.lockT - dt * 1.5);
      if (st.lockT >= LOCK_S) {
        log('g', `LOCK_OK target=H-${t.id} ${L.time}=${LOCK_S.toFixed(1)}s`);
        say(`${L.lockOk} · H-${t.id}`, true);
        t.x = Math.random() < .5 ? 160 : WORLD.w - 160; t.y = 200 + Math.random() * (WORLD.h - 400);
        setMode('OTONOM');
      }
    } else if (st.mode === 'RTL') {
      rate = steerTo(HOME.x, HOME.y);
      if (dist(st, HOME) < 70) {
        if (st.bat < 30) { st.bat = 100; log('g', `SYS_STATUS ${L.swapped} · 100%`); }
        setMode('OTONOM');
      }
    }
    // sınırlar
    if (st.x < 60 || st.x > WORLD.w - 60 || st.y < 60 || st.y > WORLD.h - 60) rate = steerTo(WORLD.w / 2, WORLD.h / 2, 2.4);
    st.rate += (rate - st.rate) * Math.min(1, dt * 3);
    st.hdg = wrap(st.hdg + st.rate * dt * SIM * .6);
    st.x += Math.cos(st.hdg) * st.spd * dt * SIM;
    st.y += Math.sin(st.hdg) * st.spd * dt * SIM;
    if (now - altT > 7000 && st.mode === 'OTONOM') { st.tAlt = 90 + Math.round(Math.random() * 7) * 10; altT = now; }
    const climb = (st.tAlt - st.alt) * .5;
    st.alt += climb * dt;
    st.roll += (st.rate * 62 - st.roll) * Math.min(1, dt * 4);
    st.pitch += (Math.max(-12, Math.min(12, climb * .6)) - st.pitch) * Math.min(1, dt * 3);
    st.spd += ((st.mode === 'KİLİT' ? 27 : 22) + Math.sin(now * .0007) * 1.2 - st.spd) * Math.min(1, dt);
    st.bat = Math.max(0, st.bat - dt * .22);
    if (st.bat < 18 && st.mode !== 'RTL') { log('r', `BATTERY_LOW · ${L.returning}`); say(L.lowBat); setMode('RTL'); }
    st.sats = 13 + ((now / 4000 | 0) % 3); st.link = 96 + ((now / 2500 | 0) % 4);
    if (now - trailT > 120) { st.trail.push([st.x, st.y]); if (st.trail.length > 140) st.trail.shift(); trailT = now; }
    // hedef dronlar
    for (const t of targets) {
      t.h += (Math.sin(now * .0006 + t.id * 2) * .6) * dt;
      t.x += Math.cos(t.h) * t.v * dt * SIM; t.y += Math.sin(t.h) * t.v * dt * SIM;
      if (t.x < 100 || t.x > WORLD.w - 100 || t.y < 100 || t.y > WORLD.h - 100) t.h = Math.atan2(WORLD.h / 2 - t.y, WORLD.w / 2 - t.x);
    }
  }

  /* ---- harita ---- */
  function drawMap(now) {
    const c = mctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#070a0d'; c.fillRect(0, 0, MW, MH);
    // ızgara
    for (let g = 0; g <= WORLD.w; g += 100) {
      const [x] = W2S(g, 0); c.strokeStyle = g % 500 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.08)';
      c.beginPath(); c.moveTo(x, oy); c.lineTo(x, oy + WORLD.h * sc); c.stroke();
    }
    for (let g = 0; g <= WORLD.h; g += 100) {
      const [, y] = W2S(0, g); c.strokeStyle = g % 500 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.08)';
      c.beginPath(); c.moveTo(ox, y); c.lineTo(ox + WORLD.w * sc, y); c.stroke();
    }
    // eş yükselti eğrileri
    c.lineWidth = 1;
    hills.forEach(rings => rings.forEach((pts, k) => {
      c.strokeStyle = `rgba(62,162,255,${.07 + k * .025})`;
      c.beginPath(); pts.forEach(([x, y], i) => { const [sx, sy] = W2S(x, y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); }); c.stroke();
    }));
    // pist + ev
    const [hx, hy] = W2S(HOME.x, HOME.y);
    c.save(); c.translate(hx, hy); c.rotate(-.7);
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(-46, -6, 92, 12);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.setLineDash([5, 5]); c.beginPath(); c.moveTo(-40, 0); c.lineTo(40, 0); c.stroke(); c.setLineDash([]);
    c.restore();
    c.fillStyle = '#3dff8f'; c.font = '700 10px JetBrains Mono, monospace'; c.fillText(L.home, hx + 10, hy + 18);
    // rota
    if (st.wp.length) {
      c.strokeStyle = 'rgba(62,162,255,.55)'; c.setLineDash([6, 6]); c.lineWidth = 1.3;
      c.beginPath();
      const [dx, dy] = W2S(st.x, st.y); c.moveTo(dx, dy);
      for (let k = 0; k < st.wp.length; k++) { const w = st.wp[(st.wpi + k) % st.wp.length]; const [x, y] = W2S(w.x, w.y); c.lineTo(x, y); }
      c.stroke(); c.setLineDash([]);
      st.wp.forEach((w, k) => {
        const [x, y] = W2S(w.x, w.y), on = k === st.wpi % st.wp.length && st.mode === 'OTONOM';
        c.beginPath(); c.arc(x, y, 9, 0, 6.29);
        c.fillStyle = on ? '#3ea2ff' : '#0b1621'; c.fill();
        c.strokeStyle = '#3ea2ff'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = on ? '#001426' : '#cfe8ff'; c.font = '700 10px JetBrains Mono, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(k + 1, x, y + .5);
      });
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }
    // iz
    for (let k = 1; k < st.trail.length; k++) {
      const [x1, y1] = W2S(...st.trail[k - 1]), [x2, y2] = W2S(...st.trail[k]);
      c.strokeStyle = `rgba(255,61,61,${k / st.trail.length * .8})`; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
    // kamera konisi (kilit modunda)
    const [px, py] = W2S(st.x, st.y);
    if (st.mode === 'KİLİT') {
      c.fillStyle = 'rgba(255,61,61,.1)'; c.beginPath(); c.moveTo(px, py);
      c.arc(px, py, 460 * sc, st.hdg - 22 * D2R, st.hdg + 22 * D2R); c.closePath(); c.fill();
    }
    // hedefler
    for (const t of targets) {
      const [x, y] = W2S(t.x, t.y), locked = st.lock === t;
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4);
      c.fillStyle = locked ? '#ff3d3d' : 'rgba(255,61,61,.75)'; c.fillRect(-5, -5, 10, 10); c.restore();
      c.fillStyle = 'rgba(255,140,140,.9)'; c.font = '700 9px JetBrains Mono, monospace'; c.fillText(`H-${t.id}`, x + 9, y - 7);
      if (locked) {
        const s = 18 + 10 * (1 - st.lockT / LOCK_S) + Math.sin(now * .02) * 1.5;
        c.strokeStyle = st.lockT > 0 ? '#ff3d3d' : 'rgba(255,61,61,.5)'; c.lineWidth = 2;
        for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          c.beginPath(); c.moveTo(x + ax * s, y + ay * s + -ay * 7); c.lineTo(x + ax * s, y + ay * s); c.lineTo(x + ax * s + -ax * 7, y + ay * s); c.stroke();
        }
        c.beginPath(); c.arc(x, y, s + 8, -Math.PI / 2, -Math.PI / 2 + st.lockT / LOCK_S * Math.PI * 2);
        c.strokeStyle = '#ffd23f'; c.lineWidth = 2.5; c.stroke();
        c.fillStyle = '#ffd23f'; c.font = '700 10px JetBrains Mono, monospace';
        c.fillText(`${L.lockLbl} ${st.lockT.toFixed(1)}/${LOCK_S}s`, x + s + 12, y + 4);
      }
    }
    // İHA
    c.save(); c.translate(px, py); c.rotate(st.hdg + Math.PI / 2);
    c.shadowColor = 'rgba(255,255,255,.6)'; c.shadowBlur = 10;
    c.fillStyle = '#fff'; c.strokeStyle = '#e3262d'; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -13); c.lineTo(2.5, -4); c.lineTo(14, 2); c.lineTo(14, 5); c.lineTo(2.5, 2); c.lineTo(2, 9);
    c.lineTo(6, 12); c.lineTo(6, 14); c.lineTo(0, 12.5); c.lineTo(-6, 14); c.lineTo(-6, 12); c.lineTo(-2, 9);
    c.lineTo(-2.5, 2); c.lineTo(-14, 5); c.lineTo(-14, 2); c.lineTo(-2.5, -4); c.closePath();
    c.fill(); c.stroke(); c.restore();
    c.fillStyle = '#fff'; c.font = '700 10px JetBrains Mono, monospace'; c.fillText('İKARUS-1', px + 16, py - 12);
    // pusula + ölçek + koordinat
    c.fillStyle = 'rgba(255,255,255,.7)'; c.font = '700 11px JetBrains Mono, monospace'; c.textAlign = 'center';
    c.fillText(L.N, MW - 22, 22); c.beginPath(); c.moveTo(MW - 22, 28); c.lineTo(MW - 27, 42); c.lineTo(MW - 17, 42); c.closePath(); c.fill();
    c.textAlign = 'left';
    const bar = 200 * sc;
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(14, MH - 16); c.lineTo(14 + bar, MH - 16); c.stroke();
    c.font = '500 9px JetBrains Mono, monospace'; c.fillText('200 m', 14, MH - 22);
    const [la, lo] = latlon();
    c.textAlign = 'right'; c.fillStyle = 'rgba(207,232,255,.7)'; c.fillText(`${la}°${L.lat}  ${lo}°${L.lon}`, MW - 12, MH - 12); c.textAlign = 'left';
  }

  /* ---- birincil uçuş göstergesi ---- */
  function drawPfd() {
    const c = pctx, cx = PW / 2, cy = PH / 2 - 8, ppd = PH / 50;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    c.beginPath(); c.rect(0, 0, PW, PH); c.clip();
    c.translate(cx, cy); c.rotate(-st.roll * D2R); c.translate(0, st.pitch * ppd);
    const big = Math.max(PW, PH) * 2;
    const sky = c.createLinearGradient(0, -big / 2, 0, 0); sky.addColorStop(0, '#071a2e'); sky.addColorStop(1, '#1d4f7d');
    c.fillStyle = sky; c.fillRect(-big, -big, big * 2, big);
    const gr = c.createLinearGradient(0, 0, 0, big / 2); gr.addColorStop(0, '#5a3418'); gr.addColorStop(1, '#2a1607');
    c.fillStyle = gr; c.fillRect(-big, 0, big * 2, big);
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-big, 0); c.lineTo(big, 0); c.stroke();
    c.font = '600 9px JetBrains Mono, monospace'; c.fillStyle = '#fff'; c.lineWidth = 1;
    for (let p = -30; p <= 30; p += 5) {
      if (!p) continue;
      const y = -p * ppd, w = p % 10 ? 14 : 28;
      c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke();
      if (!(p % 10)) { c.fillText(Math.abs(p), w + 4, y + 3); c.fillText(Math.abs(p), -w - 16, y + 3); }
    }
    c.restore();
    // yatış yayı
    c.save(); c.translate(cx, cy); c.strokeStyle = '#fff'; c.lineWidth = 1.2;
    const R = Math.min(PW, PH) * .38;
    c.beginPath(); c.arc(0, 0, R, -Math.PI * 5 / 6, -Math.PI / 6); c.stroke();
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const t = (a - 90) * D2R, l = a % 30 ? 6 : 11;
      c.beginPath(); c.moveTo(Math.cos(t) * R, Math.sin(t) * R); c.lineTo(Math.cos(t) * (R + l), Math.sin(t) * (R + l)); c.stroke();
    }
    c.rotate(-st.roll * D2R); c.fillStyle = '#ffd23f';
    c.beginPath(); c.moveTo(0, -R + 2); c.lineTo(-6, -R + 12); c.lineTo(6, -R + 12); c.closePath(); c.fill();
    c.restore();
    // uçak sembolü
    c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.beginPath();
    c.moveTo(cx - 46, cy); c.lineTo(cx - 16, cy); c.lineTo(cx - 8, cy + 8); c.moveTo(cx + 46, cy); c.lineTo(cx + 16, cy); c.lineTo(cx + 8, cy + 8); c.stroke();
    c.fillStyle = '#ffd23f'; c.fillRect(cx - 2, cy - 2, 4, 4);
    // hız ve irtifa şeritleri
    const tape = (x, val, step, unit, left) => {
      c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(x, 10, 46, PH - 52);
      c.save(); c.beginPath(); c.rect(x, 10, 46, PH - 52); c.clip();
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.fillStyle = '#fff'; c.font = '500 9px JetBrains Mono, monospace'; c.lineWidth = 1;
      const pxPer = 3.2;
      for (let v = Math.floor((val - 40) / step) * step; v <= val + 40; v += step) {
        const y = cy - (v - val) * pxPer;
        c.beginPath(); c.moveTo(left ? x + 46 : x, y); c.lineTo(left ? x + 38 : x + 8, y); c.stroke();
        if (v % (step * 2) === 0) c.fillText(v, left ? x + 6 : x + 12, y + 3);
      }
      c.restore();
      c.fillStyle = '#000'; c.strokeStyle = '#3ea2ff'; c.lineWidth = 1.5;
      c.fillRect(x - 2, cy - 11, 50, 22); c.strokeRect(x - 2, cy - 11, 50, 22);
      c.fillStyle = '#fff'; c.font = '700 12px JetBrains Mono, monospace'; c.fillText(Math.round(val), x + 6, cy + 4);
      c.fillStyle = '#7f98ad'; c.font = '500 8px JetBrains Mono, monospace'; c.fillText(unit, x + 6, PH - 46);
    };
    tape(8, st.spd * 3.6, 5, L.kmh, true);
    tape(PW - 54, st.alt, 10, 'm', false);
    // pusula şeridi
    const hy = PH - 30, h = hdgDeg();
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, hy, PW, 30);
    c.save(); c.beginPath(); c.rect(0, hy, PW, 30); c.clip();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.fillStyle = '#fff'; c.font = '600 9px JetBrains Mono, monospace'; c.textAlign = 'center';
    const names = L.dirs;
    for (let d = Math.floor((h - 60) / 5) * 5; d <= h + 60; d += 5) {
      const x = cx + (d - h) * 3.4, dd = ((d % 360) + 360) % 360;
      c.beginPath(); c.moveTo(x, hy); c.lineTo(x, hy + (dd % 15 ? 5 : 9)); c.stroke();
      if (!(dd % 30)) c.fillText(names[dd] || dd, x, hy + 21);
    }
    c.restore(); c.textAlign = 'left';
    c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(cx, hy + 1); c.lineTo(cx - 5, hy - 6); c.lineTo(cx + 5, hy - 6); c.closePath(); c.fill();
    // mod etiketi
    c.font = '700 10px JetBrains Mono, monospace';
    c.fillStyle = st.mode === 'KİLİT' ? '#ff3d3d' : '#3dff8f'; c.fillText(L[st.mode], 62, 24);
    c.fillStyle = '#cfe8ff'; c.textAlign = 'right'; c.fillText(`${Math.round(h).toString().padStart(3, '0')}°`, PW - 62, 24); c.textAlign = 'left';
  }

  /* ---- telemetri + log ---- */
  function telemetry(now) {
    T('mod').textContent = L[st.mode];
    T('hiz').textContent = `${(st.spd * 3.6).toFixed(0)} ${L.kmh}`;
    T('alt').textContent = `${st.alt.toFixed(0)} m`;
    T('bat').textContent = `${st.bat.toFixed(0)}%`;
    T('bat').style.color = st.bat < 25 ? '#ff6b6b' : '';
    T('gps').textContent = `3D · ${st.sats}`;
    T('wp').textContent = st.wp.length ? `${(st.wpi % st.wp.length) + 1}/${st.wp.length}` : '—';
    if (now - logT > 420) {
      logT = now;
      const [la, lo] = latlon(), k = (now / 420 | 0) % 4;
      if (k === 0) log('k', `ATTITUDE roll=${st.roll.toFixed(1)} pitch=${st.pitch.toFixed(1)} yaw=${hdgDeg().toFixed(1)}`);
      else if (k === 1) log('k', `GLOBAL_POSITION_INT lat=${la} lon=${lo} alt=${st.alt.toFixed(1)}`);
      else if (k === 2) log('k', `VFR_HUD airspeed=${st.spd.toFixed(1)} heading=${hdgDeg().toFixed(0)} throttle=${(55 + st.rate * 30).toFixed(0)}`);
      else log('d', `HEARTBEAT type=FIXED_WING mode=${L[st.mode]} bat=${st.bat.toFixed(0)}% link=${st.link}%`);
    }
  }

  /* ---- ajanlar rota çizer ---- */
  function agentWaypoint(now) {
    if (now - agentT < 3400 || st.mode !== 'OTONOM' || !window.agentJob) return;
    agentT = now;
    const p = { x: 200 + Math.random() * (WORLD.w - 400), y: 160 + Math.random() * (WORLD.h - 320) };
    window.agentJob(() => {
      const r = mapC.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return null;
      const [sx, sy] = W2S(p.x, p.y);
      return { x: r.left + scrollX + sx, y: r.top + scrollY + sy };
    }, () => addWp(p));
  }

  /* ---- döngü ---- */
  function loop(now) {
    requestAnimationFrame(loop);
    if (!visible || !MW) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
    update(dt, now);
    drawMap(now); drawPfd(); telemetry(now); agentWaypoint(now);
  }

  /* ---- etkileşim ---- */
  mapC.addEventListener('click', e => {
    const r = mapC.getBoundingClientRect(), [x, y] = S2W(e.clientX - r.left, e.clientY - r.top);
    if (x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) return;
    addWp({ x, y }); if (st.mode !== 'OTONOM' && st.mode !== 'MANUEL') setMode('OTONOM');
  });
  btns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  addEventListener('keydown', e => {
    if (!visible || st.mode !== 'MANUEL') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'].includes(k)) { keys[k] = true; e.preventDefault(); }
  });
  addEventListener('keyup', e => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });

  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) size(); }).observe(root);
  if ('ResizeObserver' in window) new ResizeObserver(size).observe(root);
  log('g', `HEARTBEAT ${L.hb} · İKARUS-1 · MAVLink v2`);
  log('k', `MISSION_COUNT 4 · ${L.loaded}`);
  if (STATIC) { size(); update(0, 0); drawMap(0); drawPfd(); telemetry(0); return; }
  requestAnimationFrame(loop);
})();
