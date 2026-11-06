"""eneskaraviranli.codes — canlı ziyaretçi imleçleri için küçük WebSocket yayın sunucusu.

Kişisel veri tutmaz, hiçbir şey diske yazmaz: her bağlantıya rastgele kısa bir kimlik ve renk verir,
imleç konumlarını (bölüm numarası + 0..1 arası oran) yalnızca o an sitede olan diğer ziyaretçilere iletir.
Sınırlar: en çok 150 bağlantı, mesaj başına 256 bayt, kişi başına saniyede 30 mesaj, yalnız sitenin kaynağı.
"""
import asyncio
import json
import os
import secrets
import time

from websockets.asyncio.server import broadcast, serve

HOST = '127.0.0.1'
PORT = int(os.environ.get('PORT', '8790'))
ORIGINS = ['https://eneskaraviranli.codes', 'https://www.eneskaraviranli.codes', 'http://localhost:5517']
MAX_CLIENTS = 150
MAX_MSG = 256
RATE = 30  # mesaj / saniye / bağlantı

clients = {}  # ws -> durum


def others(ws):
    return [w for w in clients if w is not ws]


def num(v, lo=0.0, hi=1.0):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi


async def handler(ws):
    if len(clients) >= MAX_CLIENTS:
        await ws.close(1013, 'dolu')
        return
    cid, color = secrets.token_hex(2), secrets.randbelow(8)
    clients[ws] = {'win': time.monotonic(), 'cnt': 0}
    await ws.send(json.dumps({'t': 'hi', 'id': cid, 'c': color, 'n': len(clients)}))
    broadcast(others(ws), json.dumps({'t': 'n', 'n': len(clients)}))
    try:
        async for raw in ws:
            if not isinstance(raw, str) or len(raw) > MAX_MSG:
                continue
            st, now = clients[ws], time.monotonic()
            if now - st['win'] >= 1:
                st['win'], st['cnt'] = now, 0
            st['cnt'] += 1
            if st['cnt'] > RATE:
                continue  # hız sınırı: fazlası sessizce düşer
            try:
                m = json.loads(raw)
            except ValueError:
                continue
            if not isinstance(m, dict):
                continue
            kind, s = m.get('t'), m.get('s')
            if kind in ('m', 'c') and isinstance(s, int) and 0 <= s < 50 and num(m.get('x')) and num(m.get('y')):
                broadcast(others(ws), json.dumps({'t': kind, 'id': cid, 'c': color, 's': s,
                                                  'x': round(m['x'], 4), 'y': round(m['y'], 4)}))
    finally:
        clients.pop(ws, None)
        broadcast(list(clients), json.dumps({'t': 'bye', 'id': cid, 'n': len(clients)}))


async def main():
    async with serve(handler, HOST, PORT, origins=ORIGINS, max_size=MAX_MSG * 2,
                     ping_interval=20, ping_timeout=20, server_header=None):
        await asyncio.get_running_loop().create_future()


if __name__ == '__main__':
    asyncio.run(main())
