"""İngilizce sürümü üretir: index.html, kavira.html, ikarus.html → en/…

Kullanım:  python tools/build_en.py
Her çeviri çiftinin kaynakta bulunduğu doğrulanır; bulunamayan olursa betik durur.
Sonda çıktıda kalan Türkçe görünür metinler listelenir (özel adlar hariç)."""
import os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import i18n_en as T  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')
SITE = 'https://eneskaraviranli.codes/'
PAGES = {
    'index.html': T.COMMON + T.INDEX_EXTRA + T.INDEX,
    'kavira.html': T.COMMON + T.CASE_NAV + T.KAVIRA,
    'ikarus.html': T.COMMON + T.CASE_NAV + T.IKARUS,
}
# Türkçe karakter içerse de çevrilmeyecek özel adlar
KEEP = ['Karaviranlı', 'İkarus', 'İKARUS', 'Façade', 'façade', 'İnceYazı', 'HalHatır', 'NöroMola', 'TÜBİTAK', 'enes-karaviranlı', '₺']


def translate(src, pairs, name):
    missing = []
    for tr, en in sorted(pairs, key=lambda p: -len(p[0])):
        if tr not in src:
            missing.append(tr[:90])
            continue
        src = src.replace(tr, en)
    if missing:
        print(f'[{name}] bulunamayan {len(missing)} çift:')
        for m in missing:
            print('   -', m)
        sys.exit(1)
    return src


def relocate(src, name):
    """en/ alt klasörüne taşınan sayfa için yolları ve dil bağlantılarını düzelt."""
    for a in ('src="js/', 'href="favicon', 'href="apple-touch-icon', 'href="case.css"'):
        src = src.replace(a, a.replace('="', '="../'))
    page = '' if name == 'index.html' else name
    src = src.replace(f'<link rel="canonical" href="{SITE}{page}">', f'<link rel="canonical" href="{SITE}en/{page}">')
    src = src.replace(f'<meta property="og:url" content="{SITE}{page}">', f'<meta property="og:url" content="{SITE}en/{page}">')
    src = src.replace('"url": "https://eneskaraviranli.codes/",\n  "name"', '"url": "https://eneskaraviranli.codes/en/",\n  "name"')
    # dil anahtarı: EN sayfada TR'ye dön
    src = re.sub(r'<a class="lang" href="en/[^"]*" hreflang="en"([^>]*)>EN</a>',
                 lambda m: f'<a class="lang" href="../{page}" hreflang="tr"{m.group(1)}>TR</a>', src)
    return src


class Text(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.out = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.skip += 1
        for k, v in attrs:
            if k in ('content', 'alt', 'aria-label', 'title') and v: self.out.append(v)
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.skip -= 1
    def handle_data(self, d):
        if not self.skip and d.strip(): self.out.append(' '.join(d.split()))


def leftovers(html):
    p = Text(); p.feed(html)
    bad = []
    for s in p.out:
        t = s
        for k in KEEP: t = t.replace(k, '')
        if re.search(r'[ğüşıöçĞÜŞİÖÇ]', t): bad.append(s)
    return bad


os.makedirs(os.path.join(ROOT, 'en'), exist_ok=True)
total_bad = 0
for name, pairs in PAGES.items():
    src = open(os.path.join(ROOT, name), encoding='utf-8').read()
    out = relocate(translate(src, pairs, name), name)
    open(os.path.join(ROOT, 'en', name), 'w', encoding='utf-8').write(out)
    bad = leftovers(out)
    total_bad += len(bad)
    print(f'en/{name}: {len(out) // 1024} KB, Türkçe kalan görünür metin: {len(bad)}')
    for b in bad[:30]:
        print('   ·', b[:110])
sys.exit(1 if total_bad else 0)
