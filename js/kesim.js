/* Kavira kesim optimizasyonu demosu.
   Ölçüden parça listesi çıkarır, parçaları 6 m profil boylarına "first-fit decreasing" ile yerleştirir.
   Ajanlar her parçayı listeden alıp boy üzerindeki yerine taşır. Formüller gösterim amaçlı sadeleştirilmiştir. */
(() => {
  const form = document.getElementById('k-form');
  if (!form) return;
  const $ = id => document.getElementById(id);
  const barsEl = $('k-bars'), legendEl = $('k-legend'), errEl = $('k-err');
  const K = k => document.querySelector(`[data-k="${k}"]`);
  const STATIC = window.__STATIC || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const STOCK = 6000, KERF = 4;
  const EN = document.documentElement.lang === 'en';
  const W_ = EN
    ? { kasaY: 'Frame horizontal', kasaD: 'Frame vertical', kanatY: 'Sash horizontal', kanatD: 'Sash vertical', dikme: 'Post', kayit: 'Top / bottom rail',
        citaY: 'Bead horizontal', citaD: 'Bead vertical', bar: 'BAR', fire: 'waste', eW: 'Width must be 400–6000 mm.', eH: 'Height must be 400–3500 mm.', eN: 'Quantity must be 1–20.' }
    : { kasaY: 'Kasa yatay', kasaD: 'Kasa dikey', kanatY: 'Kanat yatay', kanatD: 'Kanat dikey', dikme: 'Dikme', kayit: 'Alt / üst kayıt',
        citaY: 'Çıta yatay', citaD: 'Çıta dikey', bar: 'BOY', fire: 'fire', eW: 'Genişlik 400–6000 mm olmalı.', eH: 'Yükseklik 400–3500 mm olmalı.', eN: 'Adet 1–20 olmalı.' };
  const COLORS = ['#ff3d3d', '#3ea2ff', '#ffd23f', '#4dffc3', '#a98bff'];

  // sistem → parça listesi [ad, ölçü(mm), adet]
  const SYS = {
    surme: (W, H) => [[W_.kasaY, W, 2], [W_.kasaD, H, 2], [W_.kanatY, Math.round(W / 2 + 25), 4], [W_.kanatD, H - 45, 4]],
    giyotin: (W, H) => [[W_.dikme, H, 2], [W_.kayit, W, 2], [W_.kanatY, W - 50, 6], [W_.kanatD, Math.round(H / 3 + 20), 6]],
    sabit: (W, H) => [[W_.kasaY, W, 2], [W_.kasaD, H, 2], [W_.citaY, W - 60, 2], [W_.citaD, H - 60, 2]],
  };

  function plan(sys, W, H, n) {
    const types = SYS[sys](W, H);
    const pieces = [];
    types.forEach(([ad, len, adet], ci) => { for (let i = 0; i < adet * n; i++) pieces.push({ ad, len, ci }); });
    pieces.sort((a, b) => b.len - a.len);
    const bars = [];
    for (const p of pieces) {
      let bar = bars.find(b => b.used + (b.items.length ? KERF : 0) + p.len <= STOCK);
      if (!bar) { bar = { used: 0, items: [] }; bars.push(bar); }
      if (bar.items.length) bar.used += KERF;
      p.at = bar.used; bar.used += p.len; bar.items.push(p);
    }
    const net = pieces.reduce((s, p) => s + p.len, 0);
    const fire = bars.length * STOCK - net;
    return { types, pieces, bars, net, fire };
  }

  function countTo(el, to, fmt, ms = 700) {
    const from = parseFloat(el.dataset.v || '0'), t0 = performance.now();
    el.dataset.v = to;
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    STATIC ? (el.textContent = fmt(to)) : requestAnimationFrame(step);
  }

  let runId = 0;
  function run() {
    const sys = $('k-sis').value, W = +$('k-w').value, H = +$('k-h').value, n = +$('k-n').value;
    errEl.textContent = '';
    if (!(W >= 400 && W <= 6000)) return (errEl.textContent = W_.eW);
    if (!(H >= 400 && H <= 3500)) return (errEl.textContent = W_.eH);
    if (!(n >= 1 && n <= 20)) return (errEl.textContent = W_.eN);
    const r = plan(sys, W, H, n), id = ++runId;

    countTo(K('boy'), r.bars.length, v => Math.round(v));
    countTo(K('parca'), r.pieces.length, v => Math.round(v));
    countTo(K('fire'), r.fire / (r.bars.length * STOCK) * 100, v => '%' + v.toFixed(1));
    countTo(K('metre'), r.net / 1000, v => v.toFixed(1));

    legendEl.innerHTML = r.types.map(([ad, len, adet], ci) =>
      `<span><i style="background:${COLORS[ci]}"></i>${ad} · ${len} mm × ${adet * n}</span>`).join('');

    barsEl.innerHTML = '';
    const els = [];
    r.bars.forEach((b, bi) => {
      const wrap = document.createElement('div');
      const fire = STOCK - b.used;
      wrap.innerHTML = `<div class="kbar-h"><span>${W_.bar} ${bi + 1} · ${STOCK} mm</span><span>${W_.fire} ${fire} mm</span></div><div class="kbar-t"></div>`;
      const track = wrap.lastChild;
      b.items.forEach(p => {
        const d = document.createElement('div');
        d.className = 'kp pend';
        d.style.left = (p.at / STOCK * 100) + '%';
        d.style.width = (p.len / STOCK * 100) + '%';
        d.style.background = COLORS[p.ci];
        d.title = `${p.ad} · ${p.len} mm`;
        d.textContent = p.len;
        track.append(d); els.push(d);
      });
      barsEl.append(wrap);
    });

    // ajanlar parçaları sırayla yerine taşısın; çok parça varsa geri kalanı hızlıca belirsin
    els.forEach((d, k) => {
      const show = () => { if (id === runId) d.classList.remove('pend'); };
      if (STATIC) return show();
      if (k < 36 && window.agentJob) {
        setTimeout(() => window.agentJob(() => {
          const rr = d.getBoundingClientRect();
          if (rr.bottom < 0 || rr.top > innerHeight) return null;
          return { x: rr.left + scrollX + rr.width / 2, y: rr.top + scrollY + rr.height / 2 };
        }, show), k * 45);
        setTimeout(show, 4500 + k * 30); // ajan gelmezse yine de görünsün
      } else setTimeout(show, 600 + k * 25);
    });
  }

  form.addEventListener('submit', e => { e.preventDefault(); run(); });
  // bölüm inşa edilince ilk planı kendisi çıkarsın
  const out = document.querySelector('.k-out');
  const start = () => { if (!out.dataset.ran) { out.dataset.ran = 1; setTimeout(run, 500); } };
  if (out.classList.contains('built') || !document.documentElement.classList.contains('js')) start();
  else new MutationObserver((m, o) => { if (out.classList.contains('built')) { o.disconnect(); start(); } }).observe(out, { attributes: true, attributeFilter: ['class'] });
})();
