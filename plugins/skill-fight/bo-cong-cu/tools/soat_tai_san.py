"""Soát, thêm an toàn và lập danh mục tài sản ảnh của một dự án (tai-san.json + anh-tai-san/). 4/10/2026.

Vì sao: một series (Mo và Bấp, Gia đình Carter…) dùng lại tài sản qua nhiều tập. Mã không dấu dễ trùng nghĩa: `nv_mo@sung` (Mo bị SƯNG, tập cũ)
suýt bị dùng cho "Mo cầm SÚNG" vì script thêm tay gặp mã đã có thì lặng lẽ bỏ qua. Quy ước (thư viện 30 mục "Đặt mã"):
  - gốc: nv_<tên>, bc_<nơi>, dc_<đồ>; chỉ a-z 0-9 và gạch dưới.
  - biến thể MỚI có nhóm đứng trước: @ao_… (trang phục) · @tt_… (trạng thái kéo dài: tt_sung, tt_uot, tt_dem) · @cam_… (cầm đồ, vũ khí) ·
    @chieu_… (bảng động tác) · @bieu_cam… · góc bối cảnh chuẩn @nguoc @gan @thap_len @tren @doc @tren_cao @san. Mã cũ giữ nguyên (không đổi để khỏi hỏng tập cũ).
  - mỗi mục có "ten" tiếng Việt CÓ DẤU (hoặc name / canonical_name) và "tap" (tập/lô đầu tiên dùng).

Dùng:
  python -X utf8 tools/soat_tai_san.py "du-an/<dự án>"                     → soát, in lỗi/cảnh báo
  python -X utf8 tools/soat_tai_san.py "du-an/<dự án>" --them moi.json     → thêm mục/biến thể; mã đã có mà nội dung khác thì DỪNG
  python -X utf8 tools/soat_tai_san.py "du-an/<dự án>" --danh-muc          → ghi danh-muc-tai-san.html (ảnh thu nhỏ, mã, tên, tập)
  python -X utf8 tools/soat_tai_san.py --tat-ca                             → soát mọi dự án trong du-an/

File --them: {"items": [mục gốc mới…], "variants": {"<mã gốc>": [biến thể mới…]}} — cùng định dạng tai-san.json.
"""
import html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOC = re.compile(r"^(nv|bc|dc|mau)_[a-z0-9]+(?:_[a-z0-9]+)*$")
BIEN = re.compile(r"^[a-z0-9_]+$")
NHOM = ("ao_", "tt_", "cam_", "chieu_", "bieu_cam")
GOC_MAY = {"nguoc", "gan", "thap_len", "tren", "doc", "tren_cao", "san", "nguoc_tren_cao"}
# Hậu tố trần không dấu mang hai nghĩa trở lên: phải có nhóm (tt_sung = sưng, cam_sung = súng)
MO_HO = {"sung", "ban", "dau", "bat", "cat", "chan", "dao", "keo", "mat", "mu", "nong", "tam", "toi", "trang", "vo", "xe", "nhay", "bay", "da", "ga"}
CO_DAU = re.compile(r"[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]", re.I)


def doc(proj):
    p = os.path.join(proj, "tai-san.json")
    return p, json.load(open(p, encoding="utf-8"))


def tat_ca_muc(d):
    """[(mã, mục, mã gốc hoặc None)] cho cả gốc lẫn biến thể."""
    out = []
    for it in d.get("items", []):
        out.append((it["asset_id"], it, None))
        for v in it.get("variants", []) or []:
            out.append((v["asset_id"], v, it["asset_id"]))
    return out


def ten_cua(m):
    return m.get("ten") or m.get("name") or m.get("canonical_name") or ""


def soat(proj, in_ra=True):
    p, d = doc(proj)
    loi, canh = [], []
    muc = tat_ca_muc(d)
    dem = {}
    for ma, m, goc in muc:
        dem[ma] = dem.get(ma, 0) + 1
    for ma, n in dem.items():
        if n > 1: loi.append(f"TRÙNG MÃ {ma}: có {n} mục")
    for ma, m, goc in muc:
        if goc is None:
            # mục chứa không có ảnh (gom biến thể của nhiều nhân vật: bien_the_tap2, mau_dh_*) là cấu trúc cũ hợp lệ
            if not GOC.match(ma): (canh if not m.get("image_prompt") else loi).append(f"{ma}: mã gốc sai khuôn (nv_/bc_/dc_/mau_ + chữ thường, số, gạch dưới)")
            continue
        base, _, hau = ma.partition("@")
        if base != goc and GOC.match(goc): canh.append(f"{ma}: biến thể nằm dưới {goc} nhưng mã gốc là {base} (cấu trúc cũ)")
        if not hau: continue  # ảnh gốc khai trong mục chứa
        if not BIEN.match(hau): loi.append(f"{ma}: hậu tố sai khuôn")
        moi = bool(m.get("tap")) or m.get("quy_uoc") == 2  # mục thêm theo quy ước mới
        co_nhom = hau.startswith(NHOM) or hau in GOC_MAY or hau.startswith(("tren_cao", "nguoc"))
        if hau in MO_HO: canh.append(f"{ma}: hậu tố '{hau}' không dấu có nhiều nghĩa — mục mới dùng nhóm (tt_{hau} / cam_{hau}…)")
        if moi and not co_nhom: loi.append(f"{ma}: biến thể mới phải có nhóm ({', '.join(NHOM)}) hoặc góc máy chuẩn")
    for ma, m, goc in muc:
        t = ten_cua(m)
        if not t: canh.append(f"{ma}: thiếu tên tiếng Việt (ten)")
        elif m.get("tap") and not CO_DAU.search(t): canh.append(f"{ma}: tên '{t}' không có dấu")
    anh = os.path.join(proj, "anh-tai-san")
    co = {f[:-4] for f in os.listdir(anh) if f.endswith(".png")} if os.path.isdir(anh) else set()
    ma_set = set(dem)
    for ma in sorted(ma_set - co):
        canh.append(f"{ma}: chưa có ảnh")
    thua = sorted(co - ma_set)
    if thua: canh.append(f"{len(thua)} ảnh không có trong tai-san.json: {', '.join(thua[:12])}{' …' if len(thua) > 12 else ''}")
    if in_ra:
        print(f"== {os.path.relpath(proj, ROOT)}: {len(muc)} mục, {len(co)} ảnh · {len(loi)} lỗi · {len(canh)} cảnh báo")
        for x in loi: print("  LỖI  " + x)
        for x in canh[:40]: print("  ⚠    " + x)
        if len(canh) > 40: print(f"  … và {len(canh) - 40} cảnh báo nữa")
    return loi, canh


def them(proj, file_moi):
    """Thêm mục gốc và biến thể. Mã đã có: cùng prompt thì bỏ qua, khác prompt thì DỪNG (không ghi gì)."""
    p, d = doc(proj)
    moi = json.load(open(file_moi, encoding="utf-8"))
    cu = {ma: m for ma, m, _ in tat_ca_muc(d)}
    loi, them_n, bo_qua = [], 0, 0
    def kiem(m, goc=None):
        ma = m["asset_id"]
        if not ten_cua(m) or not CO_DAU.search(ten_cua(m)): loi.append(f"{ma}: cần 'ten' tiếng Việt có dấu")
        if not m.get("tap"): loi.append(f"{ma}: cần 'tap' (tập/lô đầu tiên dùng)")
        if goc:
            hau = ma.partition("@")[2]
            if not (hau.startswith(NHOM) or hau in GOC_MAY): loi.append(f"{ma}: biến thể mới phải có nhóm {NHOM} hoặc góc máy chuẩn")
            if ma.partition("@")[0] != goc: loi.append(f"{ma}: mã gốc không khớp {goc}")
        elif not GOC.match(ma): loi.append(f"{ma}: mã gốc sai khuôn")
        if ma in cu:
            if (cu[ma].get("image_prompt") or "").strip() != (m.get("image_prompt") or "").strip():
                loi.append(f"{ma}: MÃ ĐÃ CÓ với nội dung khác ('{ten_cua(cu[ma])}') — đặt mã khác")
            return False
        return True
    ghi_goc = [m for m in moi.get("items", []) if kiem(m)]
    ghi_bien = {}
    for goc, vs in (moi.get("variants") or {}).items():
        if goc not in cu and goc not in {m["asset_id"] for m in ghi_goc}: loi.append(f"{goc}: mã gốc chưa có"); continue
        ghi_bien[goc] = [v for v in vs if kiem(v, goc)]
    if loi:
        print("KHÔNG THÊM GÌ, sửa trước:"); [print("  LỖI  " + x) for x in loi]; sys.exit(1)
    for m in ghi_goc: m.setdefault("quy_uoc", 2); d["items"].append(m); them_n += 1
    for it in d["items"]:
        for v in ghi_bien.get(it["asset_id"], []):
            v.setdefault("quy_uoc", 2); it.setdefault("variants", []).append(v); them_n += 1
    bo_qua = sum(len(v) for v in (moi.get("variants") or {}).values()) + len(moi.get("items", [])) - them_n
    json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"đã thêm {them_n} mục, bỏ qua {bo_qua} mục đã có (cùng nội dung)")


def danh_muc(proj):
    p, d = doc(proj)
    ten_du_an = os.path.basename(os.path.normpath(proj))
    loai = {"nv": "Nhân vật", "bc": "Bối cảnh", "dc": "Đạo cụ"}
    nhom = {}
    for it in d.get("items", []):
        nhom.setdefault(it["asset_id"][:2], []).append(it)
    def the(m):
        ma = m["asset_id"]; f = f"anh-tai-san/{ma}.png"
        co = os.path.exists(os.path.join(proj, f))
        img = f'<img loading="lazy" src="{html.escape(f)}" alt="">' if co else '<div class="trong">chưa có ảnh</div>'
        tap = f'<span class="tap">{html.escape(str(m["tap"]))}</span>' if m.get("tap") else ""
        return (f'<figure data-q="{html.escape((ma + " " + ten_cua(m)).lower())}">{img}<figcaption><code>{html.escape(ma)}</code>'
                f'<span>{html.escape(ten_cua(m))}</span>{tap}</figcaption></figure>')
    khoi = []
    for k in ("nv", "bc", "dc"):
        for it in nhom.get(k, []):
            cards = the(it) + "".join(the(v) for v in it.get("variants", []) or [])
            khoi.append(f'<section class="k-{k}"><h2>{loai[k]} · {html.escape(ten_cua(it) or it["asset_id"])} <small>{1 + len(it.get("variants", []) or [])} ảnh</small></h2><div class="luoi">{cards}</div></section>')
    page = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Danh mục tài sản · {html.escape(ten_du_an)}</title><style>
:root{{--bg:#f6f5f2;--fg:#1d1d1b;--mut:#6b6a66;--card:#fff;--bd:#e3e1dc;--ac:#c2410c}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151514;--fg:#ecebe8;--mut:#9a9893;--card:#1f1f1d;--bd:#33322f;--ac:#fb923c}}}}
body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}} header{{position:sticky;top:0;background:var(--bg);padding:12px 16px;border-bottom:1px solid var(--bd);z-index:1}}
h1{{font-size:18px;margin:0 0 8px}} input{{width:100%;max-width:420px;padding:8px 10px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--fg)}}
main{{padding:8px 16px 40px}} h2{{font-size:15px;margin:22px 0 8px}} h2 small{{color:var(--mut);font-weight:400}}
.luoi{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}}
figure{{margin:0;background:var(--card);border:1px solid var(--bd);border-radius:10px;overflow:hidden}} img,.trong{{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#ddd}}
.trong{{display:grid;place-items:center;color:var(--mut)}} figcaption{{padding:6px 8px;display:flex;flex-direction:column;gap:2px}}
code{{color:var(--ac);font-size:12px;word-break:break-all}} .tap{{color:var(--mut);font-size:12px}} .an{{display:none}}
</style></head><body><header><h1>Danh mục tài sản · {html.escape(ten_du_an)}</h1>
<input id="q" placeholder="Tìm theo mã hoặc tên (vd: hula, giáp, sưng)…" aria-label="Tìm"></header><main>{''.join(khoi)}</main>
<script>const q=document.getElementById('q');q.oninput=()=>{{const s=q.value.trim().toLowerCase();document.querySelectorAll('figure').forEach(f=>f.classList.toggle('an',!!s&&!f.dataset.q.includes(s)));
document.querySelectorAll('section').forEach(x=>x.classList.toggle('an',!!s&&!x.querySelector('figure:not(.an)')))}}</script></body></html>"""
    out = os.path.join(proj, "danh-muc-tai-san.html")
    open(out, "w", encoding="utf-8").write(page)
    print("ok", out)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(0)
    if a[0] == "--tat-ca":
        tong = 0
        for x in sorted(os.listdir(os.path.join(ROOT, "du-an"))):
            pj = os.path.join(ROOT, "du-an", x)
            if os.path.exists(os.path.join(pj, "tai-san.json")): tong += len(soat(pj)[0])
        sys.exit(1 if tong else 0)
    proj = a[0] if os.path.isabs(a[0]) else os.path.join(ROOT, a[0])
    if "--them" in a: them(proj, a[a.index("--them") + 1])
    elif "--danh-muc" in a: danh_muc(proj)
    else: sys.exit(1 if soat(proj)[0] else 0)
