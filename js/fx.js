/* Sinematik kaydırma efektleri: kayan dev yazı bantları, hero paralaksı, portre eğimi,
   sayaçlar, kaydırma çubuğu ve manyetik butonlar. Ajanların inşa animasyonuyla çakışmasın diye
   yalnız "built" olmuş öğelere dokunur. */
(() => {
  const STATIC = window.__STATIC || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ---- sayaçlar: öğe inşa edilince 0'dan say ---- */
  const COUNT_SEL = '.stat b, .fstats b, .mstrip b';
  function countUp(b) {
    const m = b.textContent.trim().match(/^(%?)(\d+(?:[.,]\d+)?)(.*)$/);
    if (!m || b.dataset.counted) return;
    b.dataset.counted = 1;
    const [, pre, num, post] = m, to = parseFloat(num.replace(',', '.')), dec = (num.split(/[.,]/)[1] || '').length;
    if (STATIC) return;
    const t0 = performance.now(), ms = 1300;
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 4);
      b.textContent = pre + (to * e).toFixed(dec) + post;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  document.querySelectorAll('[data-b]').forEach(host => {
    const nums = host.querySelectorAll(COUNT_SEL);
    if (!nums.length) return;
    const go = () => nums.forEach(countUp);
    if (host.classList.contains('built')) go();
    else new MutationObserver((_, o) => { if (host.classList.contains('built')) { o.disconnect(); go(); } })
      .observe(host, { attributes: true, attributeFilter: ['class'] });
  });
  // "Tekrar oynat" sayaçları sıfırlasın
  const rp = document.getElementById('replay');
  if (rp) rp.addEventListener('click', () => document.querySelectorAll(COUNT_SEL).forEach(b => { delete b.dataset.counted; }));

  if (STATIC) return;

  /* ---- kayan bantlar ---- */
  const bands = [...document.querySelectorAll('.marquee')].map(m => {
    const track = m.querySelector('.mq-track');
    const html = track.innerHTML;
    track.innerHTML = html + html + html + html; // kesintisiz döngü için çoğalt
    return { m, track, x: 0, dir: +m.dataset.dir || 1, w: 0 };
  });
  const measure = () => bands.forEach(b => { b.w = b.track.scrollWidth / 4; });
  measure(); addEventListener('resize', measure);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(measure);

  /* ---- kaydırma çubuğu ---- */
  const bar = document.getElementById('scrollbar');

  /* ---- hero paralaksı + portre eğimi ---- */
  const giant = document.querySelector('.giant'), card = document.querySelector('.portrait');
  let tiltX = 0, tiltY = 0, tx = 0, ty = 0;
  if (card) {
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      tx = ((e.clientY - r.top) / r.height - .5) * -10;
      ty = ((e.clientX - r.left) / r.width - .5) * 12;
    });
    card.addEventListener('pointerleave', () => { tx = 0; ty = 0; });
  }

  let lastY = scrollY, vel = 0;
  function frame() {
    const y = scrollY, dy = y - lastY; lastY = y;
    vel += (dy - vel) * .15;
    // bantlar: sabit hız + kaydırma hızına göre ivme
    for (const b of bands) {
      if (!b.w) continue;
      b.x -= (0.6 + Math.abs(vel) * .35) * b.dir * (vel < 0 ? -1 : 1);
      if (b.x <= -b.w) b.x += b.w; if (b.x > 0) b.x -= b.w;
      b.track.style.transform = `translate3d(${b.x}px,0,0)`;
    }
    if (bar) { const max = root.scrollHeight - innerHeight; bar.style.width = (max > 0 ? y / max * 100 : 0) + '%'; }
    // hero: dev yazı kaydırmayla büyüyüp uzaklaşır (yalnız inşa bittiyse)
    if (giant && giant.classList.contains('built') && !giant.__drag && root.classList.contains('boot-done')) {
      const p = Math.min(1, y / innerHeight);
      giant.style.transform = `translateX(-50%) translateY(${y * .32}px) scale(${1 + p * .18})`;
      giant.style.opacity = String(1 - p * .85);
    }
    if (card && card.classList.contains('built') && !card.__drag && root.classList.contains('boot-done')) {
      tiltX += (tx - tiltX) * .1; tiltY += (ty - tiltY) * .1;
      card.style.transform = `perspective(900px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) translateY(${(-scrollY * .06).toFixed(1)}px)`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // tekrar oynatılırken paralaks stillerini bırak (ajanlar transform'u yönetsin)
  if (rp) rp.addEventListener('click', () => { [giant, card].forEach(el => { if (el) { el.style.transform = ''; el.style.opacity = ''; } }); });

  /* ---- manyetik butonlar ---- */
  document.querySelectorAll('.btn, .copy, .k-go, .gcs-btn').forEach(el => {
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .22}px,${(e.clientY - r.top - r.height / 2) * .3}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
})();
