"""앱 아이콘(icon-192.png, icon-512.png)을 코드로 그려서 만든다.

외부 라이브러리 없이 표준 라이브러리(zlib)만 사용한다.
게임 속 1P 비행기와 같은 모양(render.js의 drawJet)을 크게 그린다.
maskable(둥근 모양으로 잘림) 아이콘도 되도록 배경을 꽉 채우고, 비행기는 가운데 안전 영역 안에 둔다.

실행: python tools/make_icons.py   (저장 위치: web/icons/)
"""
import os
import struct
import zlib

BG_TOP = (7, 11, 31)
BG_BOTTOM = (22, 34, 77)
BODY = (77, 163, 255)
WING = (42, 111, 209)
COCKPIT = (223, 244, 255)
FLAME = (255, 179, 71)

# render.js drawJet 좌표 (단위: 비행기 좌표, 위쪽이 -y)
WING_POLY = [(-17, 9), (0, -4), (17, 9), (15, 13), (0, 8), (-15, 13)]
TAIL_POLY = [(-7, 14), (0, 9), (7, 14), (0, 13)]
BODY_POLY = [(0, -19), (5, -7), (5, 13), (-5, 13), (-5, -7)]
FLAME_POLY = [(-4, 12), (0, 23), (4, 12)]
COCKPIT_ELLIPSE = (0, -6, 2.6, 5)  # cx, cy, rx, ry

SS = 3  # 가장자리를 부드럽게: 한 픽셀을 3×3으로 나눠 평균


def inside(poly, x, y):
    """점이 다각형 안에 있는지 (ray casting)"""
    c = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def color_at(u, v, size):
    """이미지 좌표(u, v) → 색"""
    # 비행기 좌표로 변환: 높이 약 42단위를 아이콘의 56%로
    scale = size * 0.56 / 42
    x = (u - size / 2) / scale
    y = (v - size / 2) / scale + 2
    cx, cy, rx, ry = COCKPIT_ELLIPSE
    if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
        return COCKPIT
    if inside(BODY_POLY, x, y):
        return BODY
    if inside(WING_POLY, x, y) or inside(TAIL_POLY, x, y):
        return WING
    if inside(FLAME_POLY, x, y):
        return FLAME
    t = v / size
    return tuple(round(BG_TOP[k] + (BG_BOTTOM[k] - BG_TOP[k]) * t) for k in range(3))


def render(size):
    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG 필터 없음
        for px in range(size):
            acc = [0, 0, 0]
            for sy in range(SS):
                for sx in range(SS):
                    c = color_at(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, size)
                    acc[0] += c[0]
                    acc[1] += c[1]
                    acc[2] += c[2]
            row += bytes(round(a / (SS * SS)) for a in acc)
        rows.append(bytes(row))
    return b''.join(rows)


def write_png(path, size):
    def chunk(kind, data):
        body = kind + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    raw = render(size)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))  # 8비트 RGB
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'web', 'icons')
    os.makedirs(out, exist_ok=True)
    for s in (192, 512):
        p = os.path.join(out, f'icon-{s}.png')
        write_png(p, s)
        print('저장:', os.path.normpath(p))
