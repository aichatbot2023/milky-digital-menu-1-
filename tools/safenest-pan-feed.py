"""Snimak kamere koja se KREĆE, pa stane — za merenje uživo skeniranja.

Merenje na nepokretnoj slici dokazuje da ekran miruje, ali ne dokazuje da
aplikacija i dalje nalazi opasnosti dok roditelj šeta kamerom po sobi.
Ovaj snimak radi oboje: 6 s pomeranja, pa 10 s mirovanja, pa opet.

Ulaz je bilo koji 640×480 y4m (isti onaj koji se prosleđuje pregledaču kao
lažna kamera). Izlaz je njegova pomerajuća verzija.

    python3 tools/safenest-pan-feed.py ulaz.y4m izlaz.y4m [px-po-kadru]

Izmereno na ovom snimku, prosečna razlika piksela između kadrova:
    mirno 0 · 2 px/kadar ≈ 5 · 8 px/kadar ≈ 14
Prag u aplikaciji (MOTION_LEVEL) mora da stoji ispod sporog pomeranja —
prva napisana vrednost je bila iznad njega, pa pokret nije ni primećen.
"""
import sys

src = sys.argv[1] if len(sys.argv) > 1 else "kamera.y4m"
dst = sys.argv[2] if len(sys.argv) > 2 else "kamera-pan.y4m"
STEP = int(sys.argv[3]) if len(sys.argv) > 3 else 8

W, H = 640, 480
YS, CS = W * H, (W // 2) * (H // 2)
FRAME = YS + 2 * CS

f = open(src, "rb")
hdr = f.readline()
assert hdr.startswith(b"YUV4MPEG2"), hdr
assert f.readline().strip() == b"FRAME"
base = f.read(FRAME)
assert len(base) == FRAME
f.close()

def shift(plane, w, h, dx):
    out = bytearray(len(plane))
    for y in range(h):
        row = plane[y * w:(y + 1) * w]
        out[y * w:(y + 1) * w] = row[dx:] + row[:dx]
    return bytes(out)

Y = base[:YS]; U = base[YS:YS + CS]; V = base[YS + CS:]
out = open(dst, "wb")
out.write(hdr)
# 30 fps: 6 s pomeranja (2 px po kadru), 10 s mirovanja — dva puta
for _ in range(2):
    for i in range(180):
        dx = (i * STEP) % W
        out.write(b"FRAME\n")
        out.write(shift(Y, W, H, dx) + shift(U, W // 2, H // 2, dx // 2) + shift(V, W // 2, H // 2, dx // 2))
    still = shift(Y, W, H, 0) + U + V
    for _ in range(300):
        out.write(b"FRAME\n"); out.write(still)
out.close()
print("napravljeno", dst)
