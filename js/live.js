/* Canlı ziyaretçi imleçleri: siteye aynı anda giren gerçek kişilerin imleçleri ajanların yanında görünür.
   Konum "bölüm numarası + 0..1 oran" olarak gönderilir; böylece farklı ekran boyutlarında da doğru yere düşer.
   Kişisel veri gönderilmez; sunucu yalnızca rastgele bir kimlik verir. */
(() => {
  if (window.__STATIC || matchMedia('(prefers-reduced-motion: reduce)').matches || !('WebSocket' in window)) return;
  const URL = 'wss://canli.eneskaraviranli.codes/ws';
  const EN = document.documentElement.lang === 'en';
  const COLORS = ['#ffffff', '#ff9ec4', '#9fe870', '#ffe066', '#c3a6ff', '#ffb072', '#7fffd4', '#8fd3ff'];
  const layer = document.getElementById('agents');
  const sections = [...document.querySelectorAll('[data-sec]')];
  const peers = new Map();
  let ws = null, me = null, tries = 0, lastSend = 0, lastX = -1, lastY = -1, count = 1;

  /* ---- durum çubuğunda "N kişi burada" ---- */
  const status = document.getElementById('status');
  const badge = document.createElement('span');
  badge.className = 'st-live'; badge.hidden = true;
  if (status) status.insertBefore(badge, document.getElementById('replay'));
  function setCount(n) {
    count = n;
    badge.hidden = n < 2;
    badge.textContent = EN ? `● ${n} here now` : `● ${n} kişi burada`;
  }

  /* ---- konum ↔ bölüm oranı ---- */
  function encode(clientX, clientY) {
    const docY = clientY + scrollY;
    for (let i = 0; i < sections.length; i++) {
      const r = sections[i].getBoundingClientRect(), top = r.top + scrollY;
      if (docY >= top && docY <= top + r.height) return { s: i, x: clientX / innerWidth, y: (docY - top) / Math.max(1, r.height) };
    }
    return null;
  }
  function decode(s, x, y) {
    const sec = sections[s]; if (!sec) return null;
    const r = sec.getBoundingClientRect();
    return { x: x * innerWidth, y: r.top + scrollY + y * r.height };
  }

  /* ---- uzak imleçler ---- */
  function peer(id, c) {
    let p = peers.get(id);
    if (!p) {
      const el = document.createElement('div');
      el.className = 'peer';
      const col = COLORS[c % COLORS.length];
      el.innerHTML = `<svg viewBox="0 0 18 18" width="17" height="17"><path d="M2 1.5 L16 7.5 L9.2 9.2 L7 16 Z" fill="${col}" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg><em style="background:${col}">${EN ? 'visitor' : 'ziyaretçi'} · ${id}</em>`;
      layer.append(el);
      p = { el, x: -100, y: -100, tx: -100, ty: -100, seen: performance.now(), col };
      peers.set(id, p);
    }
    p.seen = performance.now();
    return p;
  }
  function drop(id) { const p = peers.get(id); if (p) { p.el.remove(); peers.delete(id); } }
  function ripple(x, y, col) {
    const r = document.createElement('div');
    r.className = 'ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.borderColor = col;
    layer.append(r); setTimeout(() => r.remove(), 600);
  }

  function tick(now) {
    for (const [id, p] of peers) {
      if (now - p.seen > 12000) { drop(id); continue; } // sessiz kalan imleç kaybolur
      p.x += (p.tx - p.x) * .25; p.y += (p.ty - p.y) * .25;
      p.el.style.transform = `translate(${p.x}px,${p.y}px)`;
      p.el.style.opacity = now - p.seen > 8000 ? '.35' : '1';
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  /* ---- bağlantı ---- */
  function connect() {
    try { ws = new WebSocket(URL); } catch (e) { return; }
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'hi') { me = m.id; tries = 0; setCount(m.n); }
      else if (m.t === 'n') setCount(m.n);
      else if (m.t === 'bye') { drop(m.id); setCount(m.n); }
      else if ((m.t === 'm' || m.t === 'c') && m.id !== me) {
        const pos = decode(m.s, m.x, m.y); if (!pos) return;
        const p = peer(m.id, m.c);
        if (p.x < -50) { p.x = pos.x; p.y = pos.y; }
        p.tx = pos.x; p.ty = pos.y;
        if (m.t === 'c') ripple(pos.x, pos.y, p.col);
      }
    };
    ws.onclose = () => {
      peers.forEach((_, id) => drop(id)); setCount(1);
      if (tries++ < 6) setTimeout(connect, Math.min(30000, 2000 * 2 ** tries));
    };
  }

  function send(t, e) {
    if (!ws || ws.readyState !== 1 || document.hidden) return;
    const p = encode(e.clientX, e.clientY); if (!p) return;
    ws.send(JSON.stringify({ t, s: p.s, x: +p.x.toFixed(4), y: +p.y.toFixed(4) }));
  }
  addEventListener('pointermove', e => {
    const now = performance.now();
    if (now - lastSend < 70 || (Math.abs(e.clientX - lastX) < 2 && Math.abs(e.clientY - lastY) < 2)) return;
    lastSend = now; lastX = e.clientX; lastY = e.clientY;
    send('m', e);
  }, { passive: true });
  addEventListener('pointerdown', e => send('c', e), { passive: true });

  // açılış animasyonunu bozmasın: biraz sonra bağlan
  setTimeout(connect, 2500);
})();
