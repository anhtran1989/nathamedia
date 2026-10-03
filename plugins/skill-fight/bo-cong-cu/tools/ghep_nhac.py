"""Đặt nhạc (file có sẵn hoặc bài cổ điển tự tổng hợp) vào clip đúng giây, nhạc tự nhỏ xuống khi có tiếng động (100-hai-cam/121 mục 4).

Dùng:
  python -X utf8 tools/ghep_nhac.py <video.mp4> --out <ra.mp4> --cue "<khoá=giá trị,…>" [--cue …] [--duck 4] [--goc 1.0]
  python -X utf8 tools/ghep_nhac.py <video.mp4> --cat-canh [--nguong 0.25]      # in giây các cú cắt/giật máy để căn nhạc
  python -X utf8 tools/ghep_nhac.py <video.mp4> --moc                            # cú cắt + đỉnh chuyển động + tiếng động (bước chân, va) theo giây
Mỗi --cue là một đoạn nhạc:
  file=<đường dẫn>        nhạc có sẵn (mp3/wav…), HOẶC
  bai=<tên>               bài trong tools/nhac_co_dien.py (kèm bpm=, den_bpm=, lap=, dai=, nhac_cu=, bass=, tong=, fermata=, lac_tong=1)
  t=<giây>                chỗ bắt đầu trong clip (bắt buộc)
  den=<giây>              cắt cụt ở giây này của clip (cú phá: nhạc tắt cái rụp); không có thì chạy hết bài
  tu=<giây>               bỏ qua bao nhiêu giây đầu của đoạn nhạc
  vol=<0..2>              âm lượng (mặc định 0.8); fade=<giây> tắt dần ở cuối (mặc định 0.03 = cụt)
--duck: nhạc nhỏ xuống bao nhiêu lần khi tiếng gốc to (mặc định 4; 1 = không nhỏ); --goc: âm lượng tiếng gốc của clip.
Hình giữ nguyên (copy luồng), chỉ làm lại tiếng.
"""
import argparse, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS_BAI = {"bpm": "--bpm", "den_bpm": "--den-bpm", "lap": "--lap", "dai": "--dai", "nhac_cu": "--nhac-cu", "bass": "--bass", "tong": "--tong", "fermata": "--fermata"}


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path],
                       capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    return float(j["format"]["duration"]), any(s["codec_type"] == "audio" for s in j["streams"])


def parse_cue(s):
    d = {}
    for part in s.split(","):
        k, _, v = part.partition("=")
        d[k.strip()] = v.strip()
    if "t" not in d or not ("file" in d or "bai" in d):
        sys.exit(f"cue thiếu t= hoặc file=/bai=: {s}")
    return d


def make_bai(c, tmp, i):
    out = os.path.join(tmp, f"cue{i}.wav")
    cmd = [sys.executable, "-X", "utf8", os.path.join(HERE, "nhac_co_dien.py"), "render", c["bai"], "--out", out]
    for k, flag in KEYS_BAI.items():
        if k in c: cmd += [flag, c[k]]
    if c.get("lac_tong") in ("1", "true"): cmd.append("--lac-tong")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-500:])
    return out


def cat_canh(video, nguong):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", video, "-vf", f"select='gt(scene,{nguong})',showinfo", "-f", "null", "-"],
                       capture_output=True, text=True)
    ts = [float(x) for x in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    print(f"{len(ts)} cú cắt/giật (ngưỡng {nguong}):", " ".join(f"{t:.2f}" for t in ts))


def moc(video):
    """Mốc để căn nhạc: đỉnh chuyển động hình (giật máy, cắt, lao đi) và chỗ tiếng động bật lên (bước chân, va chạm)."""
    import numpy as np
    w, h = 160, 90
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"scale={w}:{h},format=gray", "-f", "rawvideo", "-"], capture_output=True)
    fr = np.frombuffer(r.stdout, np.uint8).reshape(-1, h, w).astype(float)
    fps = len(fr) / probe(video)[0]
    d = np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))
    cuts = [(i + 1) / fps for i, v in enumerate(d) if v > 45]
    peaks = [(i + 1) / fps for i in range(1, len(d) - 1) if d[i] > 12 and d[i] >= d[i - 1] and d[i] >= d[i + 1] and d[i] <= 45]
    still = [(i + 1) / fps for i, v in enumerate(d) if v < 1.0]
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True)
    x = np.frombuffer(r.stdout, np.int16).astype(float) / 32768; hop = 80
    db = 20 * np.log10(np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)]) + 1e-6)
    on = []
    for i in range(3, len(db)):
        if db[i] - db[i - 3] > 9 and db[i] > -40 and (not on or i * hop / 8000 - on[-1] > 0.15): on.append(i * hop / 8000)
    def runs(ts):  # gộp các khung đứng yên liền nhau thành đoạn
        out = []
        for t in ts:
            if out and t - out[-1][1] < 0.1: out[-1][1] = t
            else: out.append([t, t])
        return [f"{a:.2f}–{b:.2f}" for a, b in out if b - a >= 0.4]
    print("cắt cảnh      :", " ".join(f"{t:.2f}" for t in cuts) or "—")
    print("đỉnh chuyển động:", " ".join(f"{t:.2f}" for t in peaks) or "—")
    print("đứng hình     :", " ".join(runs(still)) or "—")
    print("tiếng bật lên :", " ".join(f"{t:.2f}" for t in on) or "—")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video"); ap.add_argument("--out"); ap.add_argument("--cue", action="append", default=[])
    ap.add_argument("--duck", type=float, default=4.0); ap.add_argument("--goc", type=float, default=1.0)
    ap.add_argument("--cat-canh", action="store_true"); ap.add_argument("--moc", action="store_true"); ap.add_argument("--nguong", type=float, default=0.25)
    a = ap.parse_args()
    if a.cat_canh: return cat_canh(a.video, a.nguong)
    if a.moc: return moc(a.video)
    if not a.out or not a.cue: sys.exit("cần --out và ít nhất một --cue")
    dur, has_audio = probe(a.video)
    tmp = tempfile.mkdtemp(prefix="ghep_nhac_")
    inputs, chains = ["-i", a.video], []
    for i, raw in enumerate(a.cue, 1):
        c = parse_cue(raw)
        src = c["file"] if "file" in c else make_bai(c, tmp, i)
        mlen, _ = probe(src)
        t, tu = float(c["t"]), float(c.get("tu", 0))
        ln = min(mlen - tu, (float(c["den"]) - t) if "den" in c else mlen - tu, dur - t)
        if ln <= 0: sys.exit(f"cue {i} nằm ngoài clip: {raw}")
        fade = min(float(c.get("fade", 0.03)), ln)
        ms = int(round(t * 1000))
        inputs += ["-i", src]
        chains.append(f"[{i}:a]atrim=start={tu}:end={tu + ln},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo,"
                      f"afade=t=out:st={max(0, ln - fade):.3f}:d={fade:.3f},volume={c.get('vol', '0.8')},adelay={ms}|{ms}[m{i}]")
        print(f"cue {i}: {os.path.basename(src)} từ {t:.2f}s tới {t + ln:.2f}s")
    n = len(a.cue)
    mix = "".join(f"[m{i}]" for i in range(1, n + 1))
    chains.append(f"{mix}amix=inputs={n}:normalize=0:duration=longest,apad=whole_dur={dur:.3f}[mus]")
    if has_audio:
        chains.append(f"[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume={a.goc},asplit[o1][o2]")
        if a.duck > 1:
            chains.append(f"[mus][o1]sidechaincompress=threshold=0.04:ratio={a.duck}:attack=5:release=300[md]")
        else:
            chains.append("[mus]anull[md]"); chains.append("[o1]anullsink")
        chains.append("[o2][md]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[aout]")
    else:
        chains.append(f"[mus]atrim=end={dur:.3f},alimiter=limit=0.95[aout]")
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[aout]",
           "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f"{dur:.3f}", a.out]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.exit(r.stderr[-1500:])
    print("OK", a.out)


if __name__ == "__main__":
    main()
