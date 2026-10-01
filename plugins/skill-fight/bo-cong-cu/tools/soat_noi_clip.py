# Soát logic sau render (bài học tập 11 Mo và Bấp, 30/9–1/10/2026, `100-hai-cam/108` mục 3b–3c, C67–C69, luật 51 `san-xuat-nhanh`).
# Làm ảnh kiểm cho một thư mục tập, chọn bản -vN mới nhất của mỗi clip (giống script ghép). Chỉ cần ffmpeg, không cần thư viện Python nào.
#   _qc/<id>.jpg        2 khung/giây, lưới 5x4: soát từng clip theo bảng kiểm (nhân vật, giải phẫu, đạo cụ, nguyên nhân, kết quả, mốc, trạng thái)
#   _qc/_noi.jpg        mỗi hàng một chỗ nối: khung CUỐI clip trước (trái) | khung ĐẦU clip sau (phải), theo thứ tự clip in ra màn hình;
#                       soát ai ở đâu, vật ở đâu, trạng thái ướt/vỡ/sưng, và mốc cố định (cầu so với miệng ống tre, đỉnh bờ, cửa)
#   _qc/_tong-1s.jpg    1 khung/giây, mỗi clip một hàng: dò một mốc xuyên cả tập (độ cao, vị trí đạo cụ, màu trời)
# Chạy (đường dẫn tương đối tính từ thư mục đang đứng):
#   python tools/soat_noi_clip.py "du-an/<phim>/takes/<tập>" [--ids BA1,BA2,...] [--only-noi]
# Không có --ids thì lấy mọi <id>.mp4 / <id>-vN.mp4 trong thư mục, xếp theo số trong id.
import glob, os, re, shutil, subprocess, sys, tempfile

FF = shutil.which("ffmpeg") or (glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\*\*\bin\ffmpeg.exe")) or ["ffmpeg"])[0]

def run(args):
    subprocess.run([FF, "-v", "error", "-y"] + args, check=True)

def pick_clips(d, ids=None):
    base = {}
    for p in glob.glob(os.path.join(d, "*.mp4")):
        m = re.match(r"^(.*?)(?:-v(\d+))?$", os.path.basename(p)[:-4])
        b, n = m.group(1), int(m.group(2) or 1)
        if b.startswith("_"): continue
        if b not in base or n > base[b][1]: base[b] = (os.path.basename(p)[:-4], n)
    keys = ids or sorted(base, key=lambda k: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", k)])
    miss = [k for k in keys if k not in base]
    if miss: sys.exit("Thiếu clip: " + ", ".join(miss))
    return [base[k][0] for k in keys]

def stack(files, out, how):
    """Ghép ảnh cùng cỡ bằng ffmpeg (hstack/vstack)."""
    if len(files) == 1: shutil.copy(files[0], out); return
    args = []
    for f in files: args += ["-i", f]
    run(args + ["-filter_complex", "".join(f"[{i}:v]" for i in range(len(files))) + f"{how}=inputs={len(files)}", "-frames:v", "1", out])

def main():
    a = sys.argv[1:]
    if not a or a[0].startswith("--"): sys.exit("Cách chạy: python tools/soat_noi_clip.py \"du-an/<phim>/takes/<tập>\" [--ids A1,A2] [--only-noi]")
    d = os.path.abspath(a[0])
    if not os.path.isdir(d): sys.exit("Không thấy thư mục: " + d)
    ids = a[a.index("--ids") + 1].split(",") if "--ids" in a else None
    q = os.path.join(d, "_qc"); os.makedirs(q, exist_ok=True)
    clips = pick_clips(d, ids)
    tmp = tempfile.mkdtemp()
    print("Clip theo thứ tự:", ", ".join(clips))
    first, last, rows = {}, {}, []
    for v in clips:
        src = os.path.join(d, v + ".mp4")
        if "--only-noi" not in a:
            run(["-i", src, "-vf", "fps=2,scale=384:-1,tile=5x4", "-frames:v", "1", os.path.join(q, v + ".jpg")])
            r = os.path.join(tmp, v + "-row.png")
            run(["-i", src, "-vf", "fps=1,scale=256:144,tile=10x1", "-frames:v", "1", r]); rows.append(r)
        f0, f1 = os.path.join(tmp, v + "-a.png"), os.path.join(tmp, v + "-z.png")
        run(["-i", src, "-vf", "select=eq(n\\,0),scale=640:360", "-frames:v", "1", f0])
        run(["-sseof", "-0.1", "-i", src, "-vf", "scale=640:360", "-update", "1", "-frames:v", "1", f1])
        first[v], last[v] = f0, f1
    pairs = list(zip(clips, clips[1:]))
    if pairs:
        rr = []
        for i, (x, y) in enumerate(pairs):
            o = os.path.join(tmp, f"pair{i:02d}.png"); stack([last[x], first[y]], o, "hstack"); rr.append(o)
            print(f"  nối hàng {i + 1}: {x} cuối | {y} đầu")
        stack(rr, os.path.join(q, "_noi.jpg"), "vstack"); print("ok", os.path.join(q, "_noi.jpg"))
    if rows:
        stack(rows, os.path.join(q, "_tong-1s.jpg"), "vstack"); print("ok", os.path.join(q, "_tong-1s.jpg"), "(mỗi hàng một clip, theo thứ tự trên)")
    shutil.rmtree(tmp, ignore_errors=True)
    print("Soát từng clip theo bảng kiểm (nhân vật, giải phẫu, từng đạo cụ kể cả khung cận, nguyên nhân, kết quả đúng kịch bản, mốc cố định, "
          "trạng thái) rồi soát từng chỗ nối. Dòng nào trượt là clip trượt: làm -v2 hoặc cắt khi ghép, rồi mới ghép.")

if __name__ == "__main__":
    main()
