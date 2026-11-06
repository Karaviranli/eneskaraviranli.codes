/* Vaka sayfaları: bloklar kaydırınca belirir; birkaç ajan imleci her bloğu "teslim eder",
   sayaçlar sayar, şemadaki veri paketleri akar (SVG animateMotion). */
(() => {
  const STATIC = /bot|crawl|spider|slurp|lighthouse|facebookexternalhit|whatsapp|telegram|discord|linkedin|twitter/i.test(navigator.userAgent)
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (STATIC) return;
  document.documentElement.classList.add('js');

  const layer = document.getElementById('agents');
  const COLORS = ['#38e1ff', '#ff5fa2', '#b4ff4d', '#ffd23f', '#a98bff', '#ff8a3d'];
  const agents = COLORS.map((c, i) => {
    const el = document.createElement('div');
    el.className = 'agent';
    el.innerHTML = `<svg viewBox="0 0 18 18" width="15" height="15"><path d="M2 1.5 L16 7.5 L9.2 9.2 L7 16 Z" fill="${c}" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
    layer.append(el);
    return { el, c, x: innerWidth * Math.random(), y: scrollY + innerHeight * Math.random(), tx: 0, ty: 0, job: null, next: 0 };
  });
  const jobs = [];

  function ripple(x, y, c) {
    const r = document.createElement('div');
    r.className = 'ripple'; r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.borderColor = c;
    layer.append(r); setTimeout(() => r.remove(), 600);
  }

  function countUp(b) {
    const m = b.textContent.trim().match(/^(%?)(\d+(?:[.,]\d+)?)(.*)$/);
    if (!m) return;
    const [, pre, num, post] = m, to = parseFloat(num.replace(',', '.')), dec = (num.split(/[.,]/)[1] || '').length, t0 = performance.now();
    const step = now => { const p = Math.min(1, (now - t0) / 1200), e = 1 - Math.pow(1 - p, 4); b.textContent = pre + (to * e).toFixed(dec) + post; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // blok ekrana girince bir ajan gelip "teslim eder"; 450 ms içinde gelemezse kendiliğinden belirir
  const show = el => { if (el.classList.contains('in')) return; el.classList.add('in'); el.querySelectorAll('.stats b').forEach(countUp); };
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    jobs.push(en.target);
    setTimeout(() => show(en.target), 450);
  }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach(el => io.observe(el));
  // yedek: gözlemci geç kalırsa ekrandakileri kendimiz gösterelim (hiçbir içerik gizli kalmasın)
  const sweep = () => document.querySelectorAll('.rv:not(.in)').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0) setTimeout(() => show(el), 500);
  });
  setTimeout(sweep, 300); setTimeout(sweep, 1500);
  let sweepT; addEventListener('scroll', () => { clearTimeout(sweepT); sweepT = setTimeout(sweep, 120); }, { passive: true });

  function tick(now) {
    for (const a of agents) {
      if (!a.job && jobs.length) {
        a.job = jobs.shift();
        const r = a.job.getBoundingClientRect();
        a.tx = r.left + scrollX + 12; a.ty = r.top + scrollY + 12; a.t = now;
      }
      if (a.job) {
        a.x += (a.tx - a.x) * .25; a.y += (a.ty - a.y) * .25;
        if (Math.hypot(a.tx - a.x, a.ty - a.y) < 5 || now - a.t > 420) { ripple(a.x, a.y, a.c); show(a.job); a.job = null; a.next = 0; }
      } else {
        if (now > a.next) { a.tx = innerWidth * (.06 + Math.random() * .88); a.ty = scrollY + innerHeight * (.1 + Math.random() * .8); a.next = now + 1600 + Math.random() * 2400; }
        a.x += (a.tx - a.x) * .025; a.y += (a.ty - a.y) * .025;
      }
      a.el.style.transform = `translate(${a.x}px,${a.y}px)`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
