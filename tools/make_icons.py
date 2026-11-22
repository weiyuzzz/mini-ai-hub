# -*- coding: utf-8 -*-
"""Mini AI Hub — 应用图标生成器（纯标准库，无需 PIL）。

绘制内容：深色渐变圆角矩形 + 薄荷绿“中心节点 + 卫星节点”Hub 图形。
先按 4 倍超采样光栅化，再盒式降采样抗锯齿，最后编码为 PNG。

用法：python tools/make_icons.py
输出：frontend/icons/apple-touch-icon-152.png / apple-touch-icon-76.png / favicon-32.png
"""

import os
import struct
import zlib

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(BASE_DIR, 'frontend', 'icons')

BG_TOP = (0x1C, 0x2A, 0x35)
BG_BOTTOM = (0x0E, 0x16, 0x1D)
MINT = (0x9D, 0xE6, 0xC8)
MINT_DIM = (0x6F, 0xB8, 0x9C)   # 卫星节点（稍暗）

SS = 4  # 超采样倍数


def lerp(a, b, t):
    return a + (b - a) * t


def blend(base, over, alpha):
    return tuple(lerp(base[i], over[i], alpha) for i in range(3))


def sd_round_rect(px, py, cx, cy, half, radius):
    """圆角矩形 SDF（负值在内部）。"""
    dx = abs(px - cx) - (half - radius)
    dy = abs(py - cy) - (half - radius)
    out_x = max(dx, 0.0)
    out_y = max(dy, 0.0)
    outside = (out_x * out_x + out_y * out_y) ** 0.5
    inside = min(max(dx, dy), 0.0)
    return outside + inside - radius


def sd_circle(px, py, cx, cy, r):
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5 - r


def sd_segment(px, py, ax, ay, bx, by):
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    denom = abx * abx + aby * aby
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (apx * abx + apy * aby) / denom))
    dx = apx - abx * t
    dy = apy - aby * t
    return (dx * dx + dy * dy) ** 0.5


def draw_point(u, v, size):
    """u, v ∈ [0,1)，返回该像素的 RGB。"""
    x, y = u * size, v * size

    # 背景：垂直渐变圆角矩形
    bg = blend(BG_BOTTOM, BG_TOP, 1.0 - v)
    corner = size * 0.2237
    if sd_round_rect(x, y, size / 2.0, size / 2.0, size / 2.0, corner) > 0:
        return (0, 0, 0)  # 圆角外透明（转 RGB 时用背景色替代，iOS 会自己裁圆角）

    # 图形几何（比例坐标）
    cx, cy = 0.5, 0.5
    cr = 0.115
    sats = [(0.305, 0.295), (0.695, 0.295), (0.5, 0.775)]
    sr = 0.063
    lw = 0.042

    # 连接线（中心圆边缘 → 卫星圆边缘）
    for sx, sy in sats:
        dx, dy = sx - cx, sy - cy
        d = (dx * dx + dy * dy) ** 0.5
        ax = (cx + dx / d * cr) * size
        ay = (cy + dy / d * cr) * size
        bx = (sx - dx / d * sr) * size
        by = (sy - dy / d * sr) * size
        if sd_segment(x, y, ax, ay, bx, by) <= lw / 2.0 * size:
            return blend(bg, MINT, 0.88)

    # 中心节点
    if sd_circle(x, y, cx * size, cy * size, cr * size) <= 0:
        return MINT

    # 卫星节点
    for sx, sy in sats:
        if sd_circle(x, y, sx * size, sy * size, sr * size) <= 0:
            return blend(bg, MINT_DIM, 1.0)

    return bg


def render(size):
    big = size * SS
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    rgb = draw_point((px * SS + sx + 0.5) / big,
                                     (py * SS + sy + 0.5) / big, big)
                    r += rgb[0]
                    g += rgb[1]
                    b += rgb[2]
            n = SS * SS
            row.append(int(r / n + 0.5))
            row.append(int(g / n + 0.5))
            row.append(int(b / n + 0.5))
        rows.append(bytes(row))
    return bytes(b''.join(rows))


def encode_png(size, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    scan = b''.join(b'\x00' + raw[i * size * 3:(i + 1) * size * 3] for i in range(size))
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', ihdr) +
            chunk(b'IDAT', zlib.compress(scan, 9)) +
            chunk(b'IEND', b''))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size, name in ((152, 'apple-touch-icon-152.png'),
                       (76, 'apple-touch-icon-76.png'),
                       (32, 'favicon-32.png')):
        print('render %dx%d …' % (size, size))
        raw = render(size)
        path = os.path.join(OUT_DIR, name)
        with open(path, 'wb') as f:
            f.write(encode_png(size, raw))
        print('  ->', path)
    print('done')


if __name__ == '__main__':
    main()
