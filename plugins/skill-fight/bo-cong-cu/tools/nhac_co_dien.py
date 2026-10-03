"""Tự làm nhạc cổ điển hết bản quyền bằng nhạc cụ hài (kazoo, piano đồ chơi, sáo dọc lạc tông…) cho trò nhại (100-hai-cam/121).

Bản nhạc (tác giả mất > 70 năm) thuộc về công chúng; bản thu này do máy tổng hợp từ nốt nên cũng là của mình, không vướng bản thu của hãng.
Không tải gì: tổng hợp bằng numpy. Giai điệu chép theo trí nhớ, chỉ lấy câu ai cũng nhận ra.

Dùng:
  python -X utf8 tools/nhac_co_dien.py list
  python -X utf8 tools/nhac_co_dien.py render <bài> --out x.mp3 [--nhac-cu kazoo] [--bass tuba|none] [--bpm 120] [--den-bpm 200]
         [--lap 2] [--dai 6.5] [--tong 0] [--lac-tong] [--beats]
  python -X utf8 tools/nhac_co_dien.py beats <bài> [--bpm …] [--lap …] [--dai …]      # chỉ in mốc giây từng nốt, không ghi file
- --bpm: nhịp mỗi phách (phách = đơn vị trong bài, xem cột "phách" ở list); --den-bpm: tăng/giảm dần tới nhịp này ở cuối (Grieg nhanh dần).
- --dai: co giãn nhịp cho cả bài dài đúng N giây (bỏ qua --bpm).
- --fermata 2: nốt nhấn dài gấp 2 (giữ nốt như dàn nhạc thật) mà các nốt ngắn không chậm đi.
- --lac-tong: mỗi nốt lệch ± 40 cent + thỉnh thoảng rít (sáo học trò); --tong: dịch nửa cung.
- --beats: in mốc giây của từng nốt, nốt dài đánh dấu NHẤN — dùng để viết dòng thời gian prompt khớp nhạc, hoặc tìm độ lệch khi ghép.
Ghép vào clip: tools/ghep_nhac.py.
"""
import argparse, math, os, re, subprocess, sys
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44100

# Mỗi bài: nốt "Tên:phách" cách nhau bằng dấu cách; R = lặng; phách mặc định 1. "|" chỉ để dễ đọc.
# bass: dòng trầm riêng (cùng đơn vị phách) hoặc "oct" = nhân giai điệu xuống một quãng tám.
BAI = {
    "beethoven5": dict(
        ten="Beethoven — Giao hưởng số 5, mở đầu (1808)", phach="móc đơn", bpm=320,
        dung="Thảm hoạ ập tới, quay đầu chậm nhìn kẻ gây chuyện, phát hiện bị ăn vụng. Ba nốt ngắn + một nốt dài = ba cú giật + một cú nhìn trừng.",
        mel="R:1 G4 G4 G4 Eb4:6 | R:2 F4 F4 F4 D4:8", bass="oct", bass_nc="strings"),
    "fur-elise": dict(
        ten="Beethoven — Für Elise (1810)", phach="móc kép", bpm=330,
        dung="Rón rén vờ ngây thơ, giả vờ không làm gì, tiệc trà điệu đà trước khi hỏng.",
        mel="E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 G#4 B4 | C5:2 R E4 E5 D#5 | "
            "E5 D#5 E5 B4 D5 C5 | A4:2 R C4 E4 A4 | B4:2 R E4 C5 B4 | A4:4", bass=None),
    "ode-to-joy": dict(
        ten="Beethoven — Giao hưởng số 9, Khúc hoan ca (1824)", phach="đen", bpm=150,
        dung="Chiến thắng giả, khoe chiến lợi phẩm, diễu hành tự hào (trước khi bị lật).",
        mel="E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2",
        bass="C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 G2:2 C3:2", bass_nc="tuba"),
    "mountain-king": dict(
        ten="Grieg — Trong cung điện vua núi (1875)", phach="móc đơn", bpm=240,
        dung="Rình mò từng bước (mỗi nốt một bước chân), rồi nhanh dần thành rượt đuổi. Dùng --lap 3 --den-bpm 520.",
        mel="B3 C#4 D4 E4 F#4 D4 F#4:2 | F4 C#4 F4:2 E4 C4 E4:2 | B3 C#4 D4 E4 F#4 D4 F#4 B4 | A4 F#4 D4 F#4 A4:4",
        bass="B2:2 F#2:2 B2:2 F#2:2 C#3:2 F#2:2 C3:2 F#2:2 B2:2 F#2:2 B2:2 F#2:2 D3:2 F#2:2 D3:2 F#2:2", bass_nc="pizz"),
    "william-tell": dict(
        ten="Rossini — Uvertura William Tell, đoạn phi ngựa (1829)", phach="móc kép", bpm=560,
        dung="Phi nước đại, rượt đuổi vòng quanh, xông lên cứu (hoặc chạy trốn).",
        mel="G4 G4 G4:2 G4 G4 G4:2 G4 G4 C5:2 D5:2 E5:2 | G4 G4 G4:2 G4 G4 G4:2 G4 G4 E5:2 D5:2 C5:2 | "
            "G4 G4 G4:2 G4 G4 G4:2 G4 G4 C5:2 D5:2 E5:2 | C5:2 E5:2 G5:4",
        bass="C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 G2:2 D3:2 G2:2 D3:2 "
             "C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:4", bass_nc="tuba"),
    "funeral-march": dict(
        ten="Chopin — Hành khúc tang lễ (1839)", phach="đen", bpm=66,
        dung="Giả chết, tiễn đưa món ăn đã mất, than khóc quá lố.",
        mel="Bb3 Bb3:0.75 Bb3:0.25 Bb3:2 | Db4:0.75 C4:0.25 C4:0.75 Bb3:0.25 Bb3:0.75 A3:0.25 Bb3",
        bass="Bb2 F2 Bb2 F2 Bb2 F2 Bb2 F2", bass_nc="tuba"),
    "canon": dict(
        ten="Pachelbel — Canon cung Rê (khoảng 1690)", phach="đen", bpm=100,
        dung="Lãng mạn, mơ mộng, cảnh đôi lứa (thay nhạc phim có bản quyền), hoàng hôn trước khi hỏng.",
        mel="F#5:2 E5:2 D5:2 C#5:2 B4:2 A4:2 B4:2 C#5:2 | D5:2 C#5:2 B4:2 A4:2 G4:2 F#4:2 G4:2 E4:2",
        bass="D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2 D3:2 A2:2 B2:2 F#2:2 G2:2 D2:2 G2:2 A2:2", bass_nc="strings"),
    "bumblebee": dict(
        ten="Rimsky-Korsakov — Chuyến bay của ong nghệ (1900)", phach="móc kép", bpm=560,
        dung="Côn trùng hoảng loạn bay loạn xạ, bị đuổi, tăng tốc điên cuồng.",
        mel="E5 D#5 D5 C#5 D5 C#5 C5 B4 | C5 B4 A#4 A4 G#4 G4 F#4 F4 | E4 F4 E4 D#4 D4 D#4 E4 F4 | E4 D#4 D4 C#4 C4 C#4 D4 D#4 | "
            "E4 D#4 D4 C#4 D4 C#4 C4 B3 | C4 C#4 D4 D#4 E4 F4 F#4 G4 | G#4 A4 A#4 B4 C5 C#5 D5 D#5 | E5:4", bass=None),
    "toccata": dict(
        ten="Bach — Toccata cung Rê thứ (khoảng 1704)", phach="đen", bpm=60,
        dung="Kẻ xấu xuất hiện, âm mưu đen tối, lâu đài ma (nhại phim kinh dị cổ).",
        mel="A5:0.12 G5:0.12 A5:2.5 R:0.5 G5:0.12 F5:0.12 E5:0.12 D5:0.12 C#5:0.5 D5:2.5 R:1 | "
            "A4:0.12 G4:0.12 A4:2.5 R:0.5 G4:0.12 F4:0.12 E4:0.12 D4:0.12 C#4:0.5 D4:3",
        bass="R:4.22 D3:3.5 R:4.22 D2:3", bass_nc="organ"),
    "bridal-chorus": dict(
        ten="Wagner — Hợp xướng cô dâu (1850)", phach="đen", bpm=76,
        dung="Đám cưới giả, tỏ tình, trao quà quá long trọng.",
        mel="C4 F4:0.75 F4:0.25 F4:2 | C4 G4:0.75 E4:0.25 F4:2 | C4 F4 Bb4:0.75 Bb4:0.25 A4 | G4 F4 E4 F4 | G4:4",
        bass="F2:2 F2:2 C3:2 F2:2 F2:2 Bb2:2 C3:2 C3:2 C3:4", bass_nc="organ"),
    "eine-kleine": dict(
        ten="Mozart — Eine kleine Nachtmusik (1787)", phach="đen", bpm=132,
        dung="Sang chảnh, điệu đà, bữa tiệc quý tộc giả (trước khi bị vấy bẩn).",
        mel="G4:1.5 D4:0.5 G4:1.5 D4:0.5 | G4:0.5 D4:0.5 G4:0.5 B4:0.5 D5:2 | C5:1.5 A4:0.5 C5:1.5 A4:0.5 | C5:0.5 A4:0.5 F#4:0.5 A4:0.5 D4:2",
        bass="G2:2 G2:2 G2:2 G2:2 D2:2 D2:2 D2:2 D2:2", bass_nc="pizz"),
    "can-can": dict(
        ten="Offenbach — Galop địa ngục (Can-can, 1858)", phach="móc đơn", bpm=300,
        dung="Nhảy múa ăn mừng lố bịch, đá chân loạn xạ, chạy vòng vòng.",
        mel="C5:2 C5 D5 F5 E5 D5 G5:2 G5:2 G5 A5 E5 F5:2 | D5:2 D5:2 D5 F5 E5 D5 C5 C6 B5 A5 G5 F5 E5 D5 | "
            "C5:2 C5 D5 F5 E5 D5 G5:2 G5:2 G5 A5 E5 F5:2 | D5:2 D5:2 D5 F5 E5 D5 C5 G5 D5 E5 C5:4",
        bass=" ".join(["C3 G3"] * 8 + ["G2 D3"] * 4 + ["C3 G3"] * 4 + ["C3 G3"] * 8 + ["G2 D3"] * 4 + ["C3 G3 C3 G3 C3 G3 C3:2"]), bass_nc="tuba"),
    "blue-danube": dict(
        ten="Johann Strauss II — Sông Danube xanh (1866)", phach="đen", bpm=170,
        dung="Trôi lơ lửng, khiêu vũ, lướt trên băng, bay (nhại cảnh vũ trụ).",
        mel="D4 D4 F#4 A4 A4:3 A5 A5:2 F#5 F#5:2 | D4 D4 F#4 A4 A4:3 A5 A5:2 G5 G5:2 | "
            "C#4 C#4 E4 B4 B4:3 B5 B5:2 G5 G5:2 | C#4 C#4 E4 B4 B4:3 B5 B5:2 F#5 F#5:2", bass=None),
    # Hiệu ứng ngắn (không phải bài nhạc): đặt ngay cú phá.
    "trombone-buon": dict(
        ten="Hiệu ứng — kèn buồn 'wah wah wah waaah'", phach="đen", bpm=100,
        dung="Thua, cam chịu, kế hoạch hỏng.", mel="D4 C#4 C4 B3:3", bass=None, nc="trombone"),
    "ta-da": dict(
        ten="Hiệu ứng — kèn 'ta-da!'", phach="móc đơn", bpm=300,
        dung="Ra mắt hoành tráng, tạo dáng (ngay trước khi hỏng).", mel="C5 G5:4", bass="C3 C3:4", nc="kazoo", bass_nc="tuba"),
    "scratch": dict(
        ten="Hiệu ứng — rít đĩa than (nhạc đang dâng bị cắt)", phach="đen", bpm=120,
        dung="Đặt đúng khung cú phá; sau đó im lặng.", mel="X:1", bass=None, nc="scratch"),
}

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name):
    m = re.fullmatch(r"([A-G])([#b]?)(-?\d)", name)
    if not m: raise ValueError(f"nốt sai: {name}")
    n = NOTE[m.group(1)] + {"#": 1, "b": -1, "": 0}[m.group(2)]
    return 12 * (int(m.group(3)) + 1) + n


def parse(s):
    out = []
    for tok in s.replace("|", " ").split():
        name, _, d = tok.partition(":")
        out.append((None if name in ("R", "X") else midi(name), float(d or 1), name == "X"))
    return out


def hz(m, cents=0.0):
    return 440.0 * 2 ** ((m - 69 + cents / 100) / 12)


# ---------- nhạc cụ: trả về mảng mẫu cho một nốt (tần số f, dài d giây) ----------
def env(n, a=0.01, r=0.05, sustain=1.0, decay=None):
    t = np.arange(n) / SR
    e = np.ones(n) * sustain if decay is None else np.exp(-t / decay)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na: e[:na] *= np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def osc(f, n, kind="saw", vib=0.0, vib_hz=5.5, vib_delay=0.15, glide=None):
    t = np.arange(n) / SR
    depth = vib * np.clip((t - vib_delay) / 0.2, 0, 1)
    fr = f * (1 + depth * np.sin(2 * np.pi * vib_hz * t))
    if glide is not None:  # glide: tỉ lệ tần số cuối/đầu (kèn trượt)
        fr = fr * np.linspace(1, glide, n)
    ph = np.cumsum(fr) / SR
    if kind == "sin": return np.sin(2 * np.pi * ph)
    if kind == "saw": return 2 * (ph % 1) - 1
    if kind == "sq": return np.sign(np.sin(2 * np.pi * ph))
    if kind == "pulse": return np.where(ph % 1 < 0.18, 1.0, -0.2)
    raise ValueError(kind)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi / (SR / 2), 0.99)], "band")
    return signal.lfilter(b, a, x)


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc / (SR / 2), 0.99), "low")
    return signal.lfilter(b, a, x)


def ks(f, n, damp=0.996):  # Karplus-Strong: dây gảy
    p = max(2, int(SR / f)); buf = np.random.uniform(-1, 1, p); out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = damp * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out


def note(nc, f, d, i=0, lac=False):
    n = max(1, int(d * SR)); rng = np.random.default_rng(i * 7919 + int(f))
    if nc == "kazoo":
        x = osc(f, n, "saw", vib=0.012, vib_hz=6.5, vib_delay=0.05)
        x = bp(x, 500, 2600) * 1.6 + 0.12 * bp(rng.uniform(-1, 1, n), 1500, 4000)
        x = np.tanh(2.2 * x) * env(n, 0.02, 0.04)
    elif nc == "toy-piano":
        t = np.arange(n) / SR
        x = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / dd) for k, a, dd in ((1, 1, .45), (2.76, .5, .18), (5.4, .3, .08), (8.9, .15, .04)))
        x = x * env(n, 0.002, 0.03, decay=None)
    elif nc == "sao":  # sáo thiếc / sáo dọc
        x = osc(f, n, "sin", vib=0.008, vib_hz=5.2, vib_delay=0.18) + 0.18 * osc(2 * f, n, "sin") + 0.06 * osc(3 * f, n, "sin")
        x = x + 0.05 * bp(rng.uniform(-1, 1, n), f * 1.5, f * 4)
        if lac and rng.random() < 0.2:  # rít
            m = min(n, int(0.08 * SR)); x[:m] += 0.6 * np.sin(2 * np.pi * f * 2.02 * np.arange(m) / SR)
        x = x * env(n, 0.03, 0.05)
    elif nc == "pizz":
        x = ks(f, n, 0.993) * env(n, 0.001, 0.02)
    elif nc == "tuba":
        x = lp(osc(f, n, "sq") * 0.6 + osc(f, n, "saw") * 0.4, f * 4) * 1.4 * env(n, 0.04, 0.06)
    elif nc == "bassoon":
        x = lp(osc(f, n, "pulse", vib=0.004), 1400) * env(n, 0.03, 0.05)
    elif nc == "organ":
        x = sum(a * osc(f * k, n, "sin") for k, a in ((0.5, .5), (1, 1), (2, .6), (3, .3), (4, .35), (8, .15))) * 0.5 * env(n, 0.01, 0.08)
    elif nc == "glock":
        t = np.arange(n) / SR
        x = (np.sin(2 * np.pi * 2 * f * t) + .4 * np.sin(2 * np.pi * 2 * f * 2.76 * t) * np.exp(-t / .1)) * np.exp(-t / .6) * env(n, 0.001, 0.02)
    elif nc == "strings":
        x = sum(osc(f * (1 + c), n, "saw", vib=0.004, vib_hz=5 + c * 300) for c in (-0.004, 0, 0.005))
        x = lp(x, 2500) * 0.45 * env(n, 0.12, 0.15)
    elif nc == "trombone":  # nốt cuối trượt xuống + rung "wah"
        wob = 1 + 0.5 * (np.sin(2 * np.pi * 5 * np.arange(n) / SR) > 0)
        x = lp(osc(f, n, "saw", glide=0.94 if d > 1 else 1.0), 900) * wob * env(n, 0.05, 0.12)
    elif nc == "scratch":
        t = np.arange(n) / SR; dur = min(d, 0.45)
        fr = 1800 * np.exp(-t / 0.12) + 120
        x = np.sin(2 * np.pi * np.cumsum(fr) / SR) * 0.5 + bp(rng.uniform(-1, 1, n), 600, 5000) * 0.8
        x = x * (t < dur) * np.exp(-t / 0.2)
    else:
        raise ValueError(f"nhạc cụ lạ: {nc}")
    return x


NHAC_CU = ["kazoo", "toy-piano", "sao", "pizz", "tuba", "bassoon", "organ", "glock", "strings", "trombone"]


def timeline(notes, bpm0, bpm1, lap):
    """Trả về [(midi, bắt đầu s, dài s, là_X)] khi nhịp đổi tuyến tính từ bpm0 tới bpm1 theo phách."""
    seq = notes * lap
    total = sum(d for _, d, _ in seq)
    def sec(b):
        if abs(bpm1 - bpm0) < 1e-6: return 60 * b / bpm0
        k = (bpm1 - bpm0) / total
        return 60 / k * math.log((bpm0 + k * b) / bpm0)
    out, b = [], 0.0
    for m, d, x in seq:
        s0, s1 = sec(b), sec(b + d); out.append((m, s0, s1 - s0, x)); b += d
    return out, sec(total)


def render(key, a):
    B = BAI[key]
    mel = parse(B["mel"])
    if getattr(a, "fermata", None):  # kéo dài nốt nhấn (dài ≥ 1,8 lần trung vị) cho khớp cảnh giữ hình
        med = float(np.median([d for m, d, x in mel if m is not None]))
        mel = [(m, d * a.fermata if m is not None and d >= 1.8 * med else d, x) for m, d, x in mel]
    bpm0 = a.bpm or B["bpm"]; bpm1 = a.den_bpm or bpm0
    if a.dai:  # co giãn cho đúng độ dài
        _, L = timeline(mel, bpm0, bpm1, a.lap); f = L / a.dai; bpm0, bpm1 = bpm0 * f, bpm1 * f
    tl, L = timeline(mel, bpm0, bpm1, a.lap)
    nc = a.nhac_cu or B.get("nc", "kazoo")
    x = np.zeros(int((L + 1.2) * SR))
    for i, (m, s, d, isx) in enumerate(tl):
        if m is None and not isx: continue
        cents = float(np.random.default_rng(i).uniform(-40, 40)) if a.lac_tong else 0.0
        y = note(nc, 1.0 if isx else hz(m + a.tong, cents), d * (1.0 if isx else 0.95) + (0.25 if nc in ("toy-piano", "glock", "pizz") else 0), i, a.lac_tong)
        j = int(s * SR); y = y[: len(x) - j]; x[j: j + len(y)] += y * 0.55
    bass = B.get("bass"); bnc = a.bass or B.get("bass_nc", "tuba")
    if bass and bnc != "none":
        bl = [(None if m is None else m - 12, d, xx) for m, d, xx in mel] if bass == "oct" else parse(bass)
        btl, _ = timeline(bl, bpm0 * sum(d for _, d, _ in bl) / sum(d for _, d, _ in mel) if bass != "oct" else bpm0,
                          bpm1 * sum(d for _, d, _ in bl) / sum(d for _, d, _ in mel) if bass != "oct" else bpm1, a.lap)
        for i, (m, s, d, _) in enumerate(btl):
            if m is None: continue
            y = note(bnc, hz(m + a.tong), d * 0.9 + (0.2 if bnc == "pizz" else 0), 1000 + i)
            j = int(s * SR); y = y[: len(x) - j]; x[j: j + len(y)] += y * 0.35
    x = x[: int((L + 0.6) * SR)]
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89
    return x, tl, L, (bpm0, bpm1)


def print_beats(tl, L, bpms, key):
    ds = [d for m, _, d, x in tl if m is not None or x]
    med = float(np.median(ds)) if ds else 1
    print(f"# {BAI[key]['ten']} · dài {L:.2f} s · nhịp {bpms[0]:.0f}→{bpms[1]:.0f} phách/phút")
    for m, s, d, x in tl:
        if m is None and not x: continue
        name = "X" if x else f"{['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][m % 12]}{m // 12 - 1}"
        print(f"{s:7.2f}s  {name:4s} dài {d:.2f}s" + ("   ← NHẤN" if d >= 1.8 * med else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lenh", choices=["list", "render", "beats"])
    ap.add_argument("bai", nargs="?")
    ap.add_argument("--out"); ap.add_argument("--nhac-cu", choices=NHAC_CU); ap.add_argument("--bass", choices=NHAC_CU + ["none"])
    ap.add_argument("--bpm", type=float); ap.add_argument("--den-bpm", type=float); ap.add_argument("--lap", type=int, default=1)
    ap.add_argument("--dai", type=float); ap.add_argument("--tong", type=int, default=0); ap.add_argument("--lac-tong", action="store_true")
    ap.add_argument("--beats", action="store_true"); ap.add_argument("--fermata", type=float)
    a = ap.parse_args()
    if a.lenh == "list":
        for k, B in BAI.items():
            print(f"{k:14s} {B['ten']}  [phách: {B['phach']}, nhịp gốc {B['bpm']}]\n{'':14s} → {B['dung']}")
        print("\nNhạc cụ: " + ", ".join(NHAC_CU)); return
    if a.bai not in BAI: sys.exit(f"không có bài '{a.bai}'; xem: list")
    x, tl, L, bpms = render(a.bai, a)
    if a.lenh == "beats" or a.beats: print_beats(tl, L, bpms, a.bai)
    if a.lenh == "beats": return
    if not a.out: sys.exit("thiếu --out")
    out = os.path.abspath(a.out); os.makedirs(os.path.dirname(out), exist_ok=True)
    wav = out if out.lower().endswith(".wav") else out + ".tmp.wav"
    wavfile.write(wav, SR, (x * 32767).astype(np.int16))
    if wav != out:
        r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-b:a", "192k", out], capture_output=True, text=True)
        os.remove(wav)
        if r.returncode: sys.exit(r.stderr[-400:])
    print(f"OK {out} ({L:.2f} s)")


if __name__ == "__main__":
    main()
