---
name: lam-phim-hoat-hinh
description: Làm phim hoạt hình AI bằng Skill-Fight cho ba thể loại — drama / truyện đạo đức có thoại, hài câm không thoại (kiểu Larva, Tom and Jerry), cảnh đánh hành động — từ nghĩ ý tưởng, viết và soát kịch bản, prompt ảnh nhân vật và bối cảnh, lập phân cảnh, sinh prompt MiniMax H3 có khoá liền mạch, render RunningHub nhiều tài khoản, kiểm clip và sửa lỗi; cảnh đánh ngắn từ một câu cho Seedance 2.0 / H3 / Veo. Dùng khi người dùng muốn nghĩ ý tưởng tập phim, viết hoặc nâng kịch bản, làm phim/clip hoạt hình từ kịch bản, tạo ảnh tài sản, viết prompt MiniMax H3 hoặc prompt cảnh đánh, render trên RunningHub, hoặc báo lỗi clip vừa render (nhân đôi nhân vật, đảo trái phải, đạo cụ sai, sai cảm xúc, đánh không chạm).
---

# Làm phim hoạt hình AI với Skill-Fight

Hai phần phối hợp:
- **MCP `skill-fight`** (máy chủ, cần license): `huong_dan`, `thong_tin_license`, `nghi_y_tuong`, `viet_kich_ban`, `soat_kich_ban`, `prompt_anh_tai_san`, `lap_phan_canh`, `soat_phan_canh`, `sinh_prompt_h3`, `tu_van_sua_loi`, `prompt_canh_danh`.
- **Bộ công cụ trên máy** (thư mục dự án, key của người dùng): `tools/image-api.mjs` (tạo ảnh), `tools/runninghub/` (render), `tools/telegram.mjs` (tuỳ chọn, báo render xong qua bot Telegram của người dùng). Cần Node ≥ 20.
  Thư mục dự án chưa có `tools/` thì chép toàn bộ nội dung `bo-cong-cu/` của plugin vào gốc dự án (từ file SKILL.md này là `../../bo-cong-cu/`: `tools/`, các file `.example.json`, `.gitignore`), không ghi đè file đã có. Đã có `tools/` nhưng `tools/PHIEN-BAN.txt` thiếu hoặc khác `../../bo-cong-cu/tools/PHIEN-BAN.txt` (plugin vừa cập nhật) thì chép đè cả thư mục `tools/` từ plugin, báo người dùng một câu; không bao giờ ghi đè các file cấu hình chứa key ở gốc dự án (`image-api.json`, `runninghub-accounts.json`, `telegram.json`). Rồi nhắc người dùng chép `image-api.example.json` thành `image-api.json`, `runninghub-accounts.example.json` thành `runninghub-accounts.json` và điền key của họ; không bao giờ in key ra.

Nếu tool `skill-fight` báo lỗi license hoặc "tạm dừng do hoạt động bất thường", dừng mọi lượt gọi `skill-fight`, không gọi lại hay đổi sang tool khác để thử, và báo nguyên văn cho người dùng (tạm dừng tự hết theo giờ ghi trong câu báo, hoặc liên hệ người bán để mở sớm).

Mọi lượt gọi tool `skill-fight` đều truyền `du_an` = tên thư mục phim (`du-an/<tên phim>`). Sau MỖI lô render hoặc lô tạo ảnh, gọi `bao_cao_ket_qua` (`loai` render/anh, `so_xong`, `so_loi`, `coin`, `usd`, `phut` đọc ở dòng "Tổng phí" và bảng KẾT QUẢ cuối `ultra-batch`); tool này chỉ gửi con số thống kê cho người bán, không tính lượt.

## Chọn thể loại

Mọi tool có tham số `the_loai`. Hỏi người dùng nếu chưa rõ:
- `drama`: drama, truyện đạo đức, hoạt hình có thoại. Mặc định.
- `hai_cam`: hài câm không thoại. `sinh_prompt_h3` thêm `phong_cach: "hai_cam"`, mỗi segment có `music` (bảng nhạc theo giây).
- `canh_danh`: cảnh đánh. Clip lẻ 15 s tới vài phút từ một câu mô tả → `prompt_canh_danh`; phim dài có cảnh đánh → quy trình dưới với `the_loai: "canh_danh"`.

## Quy trình phim nhiều clip (MiniMax H3)

0. **Ý tưởng** (khi chưa có truyện): `nghi_y_tuong` (đưa nhân vật sẵn có, khán giả, các ý đã làm để không lặp) → người dùng chọn → `viet_kich_ban` (`che_do: "viet"`). Có kịch bản rồi mà muốn nâng: `viet_kich_ban` với `che_do: "nang"`.
1. **Dự án**: tạo `du-an/<tên phim>/` với `anh-tai-san/`, `takes/<tên tập>/`. Lưu kịch bản vào `du-an/<tên phim>/kich-ban.md`, lưu bảng nhịp kèm theo. Mỗi tập một thư mục takes riêng, một tiền tố id riêng (C1, NL, TD…).
2. **Soát kịch bản**: `soat_kich_ban` (dán cả kịch bản). Sửa lỗi nghiêm trọng (hỏi người dùng khi lỗi đụng tới cốt truyện), lưu bản sửa.
3. **Tài sản** (một bộ đủ, không phải mỗi thứ một ảnh): `prompt_anh_tai_san` với CẢ kịch bản, `the_loai`, `ti_le`, `phong_cach` nếu người dùng có. Tool trả một khối ```json``` đúng định dạng `tai-san.json`: bảng thiết kế 4 góc cho nhân vật, bảng biểu cảm và ảnh trạng thái, bối cảnh chính diện cùng bộ ảnh góc (`@nguoc`, `@gan`, `@thap_len`, `@tren`, `@doc`), bản đồ `@tren_cao`, bảng đạo cụ. Phim hai nhân vật chính thường 12–20 ảnh; tool in dòng "Thiếu so với bộ tối thiểu" thì gọi lại với `ghi_chu` nêu các mục đó và `tai_san_co` là các id đã có, rồi nối items mới vào.
   - Lưu nguyên khối JSON thành `du-an/<phim>/tai-san.json` (UTF-8). Tập sau: gọi với kịch bản tập mới và `tai_san_co` = mọi `asset_id` đã có, rồi NỐI items / variants mới vào file cũ, không ghi đè. Mục có `"da_co": true` là tài sản đã có (ảnh trạng thái mới của nó): chỉ nối `variants` của mục đó vào mục cùng `asset_id` trong file cũ.
   - **Mã ảnh dùng lại cả series**: mã mới của biến thể có nhóm (`@ao_` trang phục, `@tt_` trạng thái, `@cam_` cầm đồ/vũ khí, `@chieu_` bảng động tác) và `ten` tiếng Việt có dấu; thêm ảnh bằng `python -X utf8 tools/soat_tai_san.py du-an/<phim> --them moi.json` (mã đã có mà nội dung khác thì dừng), tìm ảnh dùng lại bằng `--danh-muc` (mở `danh-muc-tai-san.html`). `image-api.mjs` báo `TRÙNG MÃ` thì đổi mã, không dùng ảnh cũ.
   - Duyệt phong cách trước: `node tools/image-api.mjs batch --project du-an/<phim> --only <nhân vật chính đầu tiên>`, xem ảnh; đạt thì chạy cả lô nền `node tools/image-api.mjs batch --project du-an/<phim> --concurrency 5` (tự chạy theo đợt: ảnh gốc trước, biến thể lấy ảnh gốc làm ref sau; ảnh đã có thì bỏ qua).
   - Ảnh cuối lô báo "chờ ảnh gốc" là do ảnh gốc của nó lỗi: tạo lại ảnh gốc rồi chạy lại lệnh batch.
   Người dùng đã có ảnh nhân vật: mô tả ảnh trong `dau_vao` (ảnh nào là ai) để tool đặt `reference_inputs`, chép ảnh vào `anh-tai-san/<id>.png` trước khi chạy batch. Xem từng ảnh trước khi dùng: đúng màu lông/tóc/mắt/trang phục, đủ 4 ô không cắt chân, bảng biểu cảm đúng nghĩa từng ô và đúng giải phẫu (con vật không mọc thêm tay), ảnh góc đúng thứ tự mốc, không chữ. Ảnh trượt: sửa prompt trong `tai-san.json`, chạy lại `--only <id> --force` một lần. Bối cảnh mới nên có ≥ 2 vật phát tiếng nhìn thấy được (máy pha, chuông cửa, đồng hồ, suối, cành cây cho chim đậu) để clip có nguồn tiếng mà gọi. Xong lô gọi `bao_cao_ket_qua` (`loai: "anh"`).
4. **Phân cảnh**: với từng nhóm cảnh (≤ 6 clip 10 s), `lap_phan_canh` với đoạn kịch bản, `chars` `{id: [tên, mô tả nhận dạng + trang phục, câu tả giọng "in a … voice"]}`, `locs` `{id: [tên, mô tả bố cục]}` (id trùng tên file ảnh, không đuôi .png); `locs` khai cả ảnh góc và bản đồ (`bc_bep@nguoc`, `bc_bep@tren`, `bc_trai@tren_cao`) để clip mở bằng góc nào thì ảnh 2 là ảnh góc đó, và ghi trong `ghi_chu` các bảng biểu cảm / ảnh trạng thái đang có (`nv_x@bieu_cam_cuc_dai`…) để clip có phản ứng lớn đưa chúng vào refs, `id_prefix`, `bat_dau`, `the_loai`. Lưu JSON vào `du-an/<phim>/phan-canh/<tập>-lo1.json`. Sửa các cảnh báo (nhân vật khuất khỏi dòng khung rộng, thiếu nét mặt, thiếu shot trên cao…) rồi gọi `soat_phan_canh` sau khi sửa.
5. **Prompt**: `sinh_prompt_h3` (≤ 6 clip mỗi lượt) với `chars`, `locs`, `segments` (và `axis`, `props`, `sound_beds`, `cast_others: "empty"` nếu nơi không có người ngoài, `phong_cach`), `takes_dir` = đường dẫn tuyệt đối `takes/<tên tập>`, `assets_dir` = đường dẫn tuyệt đối `anh-tai-san/`. Có giọng mẫu 3–5 s cho nhân vật (`du-an/<phim>/giong-noi/<nhân vật>.mp3`) thì thêm `voices` `{nv_x: "<đường dẫn tuyệt đối .mp3>"}`: máy chủ tự gắn giọng cho clip có thoại của nhân vật đó (tối đa 3 mỗi clip) và thêm khối `audios:` vào yêu cầu render. Lời dẫn hoặc lời nghĩ ngoài hình viết `{V:nv_x|lời}` (môi nhân vật khép). Ảnh bối cảnh ở trạng thái khác (vỡ, sau bão) khai thêm phần tử thứ 3 trong `locs`: `"partially_preserved - the same …, but …"`. **Âm thanh:** mỗi clip cần ≥ 3 tiếng gắn giây, **mỗi tiếng có nguồn thấy được trên hình ở đúng dòng đó** (chim hót trên cành, chuông cửa reo khi cửa mở, máy pha xì hơi); tiếng nền ngoài khung (chim, gà ở xa) ra gần như im. Cảnh báo "tiếng động gắn giây" của máy chủ thì sửa phân cảnh rồi sinh lại. Ghi mỗi khối `===== <id>.prompt.txt =====` thành file `<takes_dir>/<id>.prompt.txt` (UTF-8 không BOM, giữ nguyên từng ký tự) và nối các khối `YÊU CẦU RENDER ULTRA H3` vào `<takes_dir>/_yeu-cau-render-<tập>.md`.
6. **Render** (tốn coin của người dùng: ~160–230 coin hoặc ~0,13 USD mỗi clip 10 s, ~7 phút):
   - Lần đầu: `node tools/runninghub/check.mjs` (0 coin) để thấy coin, số luồng, workflow.
   - Xem trước: `node tools/runninghub/ultra-batch.mjs "<file yêu cầu>" --dry` (0 coin, in số clip mỗi tài khoản đủ coin chạy).
   - **Hỏi người dùng xác nhận coin một lần cho cả lô**, rồi chạy nền: `node tools/runninghub/ultra-batch.mjs "<file yêu cầu>" --retry-oom [--telegram]`. Tổng luồng = tổng `maxConcurrent` các tài khoản trong `runninghub-accounts.json`.
   - Mỗi clip chạy đúng một lần; không tự chạy lại clip lỗi. Dừng đưa thêm clip: tạo file `.runninghub/state/STOP`.
7. **Kiểm clip, hai lớp, trước khi ghép** (nhìn tổng thể là sót lỗi: bóng nằm sai chỗ, dấu tay sai, cầu tụt giữa hai clip đều nằm sẵn trong ảnh kiểm):
   - Đủ clip của tập thì chạy `python tools/soat_noi_clip.py "du-an/<phim>/takes/<tập>"` (chỉ cần ffmpeg; tự lấy bản `-vN` mới nhất). Ra `_qc/<id>.jpg` (2 khung/giây mỗi clip), `_qc/_noi.jpg` (mỗi hàng: khung cuối clip trước | khung đầu clip sau) và `_qc/_tong-1s.jpg` (1 khung/giây, mỗi clip một hàng).
   - **Từng clip, đi hết bảng kiểm**: (1) nhân vật đủ, không thừa, không nhân đôi; (2) giải phẫu đúng (đếm mắt, chân, tay, cánh); (3) **từng đạo cụ** ở đúng chỗ ở mọi khung, kể cả khung cận; (4) hậu quả nào cũng có nguyên nhân thấy được; (5) **kết quả đúng kịch bản** (ai thắng, dấu tay, điểm số); (6) **mốc cố định** (cầu, cửa, bàn) giữ độ cao và vị trí; (7) trạng thái (ướt, vỡ, sưng) đúng sổ. Nghi chỗ nào thì soi dày 4–8 khung/giây chỗ đó.
   - **Từng chỗ nối** trên `_noi.jpg`: ai ở phía nào, vật ở đâu, trạng thái và mốc cố định có khớp giữa hai clip không.
   - Dòng nào trượt là clip trượt: nói thẳng với người dùng, sửa theo bước 8 hoặc cắt phần lỗi khi ghép nếu lỗi nằm gọn ở đầu hay cuối clip. Cảnh có hai tầng xa nhau (người trên cầu, người dưới nước) mà cả hai phải to rõ thì model kéo hai tầng lại gần: tách thành hai cú máy thay vì thêm chữ.
8. **Sửa lỗi**: `tu_van_sua_loi` với mô tả lỗi + prompt của clip + `the_loai`, sửa segment theo câu trả lời, thêm segment id `…-v2`, sinh prompt lại chỉ cho clip đó và render file yêu cầu mới. Không ghi đè clip cũ.

9. **Ghép phim** (tự ghép bằng ffmpeg): hình và tiếng của MỖI đoạn phải dài đúng bằng nhau trước khi nối (cắt hình đúng N khung, đệm/cắt tiếng đúng N/24 s); nối bằng concat với `-c:v copy -c:a aac` hoặc thêm `-af aresample=async=1`, không `-c copy` cho tiếng. Nối `-c copy` khi tiếng mỗi clip dài hơn hình vài phần trăm giây thì Telegram, CapCut, YouTube làm tiếng trễ dần (60 clip trễ vài giây ở cuối phim). Soát: `ffprobe -show_entries stream=codec_type,duration <phim.mp4>`, hình và tiếng chênh ≤ 0,05 s.

## Nhảy hài, trang phục hài và nhạc cổ điển

Đoạn nhảy hài làm vui không khí (lắc mông, lớp aerobic Latin, đá chân hàng ngang, robot, thi nhảy, bị bắt gặp khi đang nhảy một mình). Máy chủ đã có luật cho việc này ở mọi bước:
- Khi viết hoặc nâng kịch bản, ghi trong `ghi_chu` của `viet_kich_ban` ví dụ "thêm 1–2 đoạn nhảy hài ở chỗ vui", hoặc nêu điệu nhảy, người nhảy. Trang phục hài (gáo dừa, vỏ sò, váy cỏ, vòng hoa) cũng nêu ở đây; `prompt_anh_tai_san` sẽ thêm ảnh biến thể `@hula`. Đồ che ngực hài chỉ dành cho nhân vật nam ngố, ông, con vật, côn trùng, và đeo ngoài áo.
- `lap_phan_canh` và `sinh_prompt_h3` tự viết cảnh nhảy theo luật (mỗi động tác một dòng, khung toàn thân, người lệch nhịp làm ngược hướng). Không đặt tên điệu nhảy, tên bài hát, tên thương hiệu trong prompt.
- **Nhạc cổ điển hết bản quyền ghép sau** (Can-can, Danube xanh, Beethoven, Rossini, Grieg…), cần Python có `numpy`, `scipy` (`pip install numpy scipy`) và ffmpeg:
  - Xem danh sách bài: `python -X utf8 tools/nhac_co_dien.py list`
  - Đo mốc chuyển động của clip: `python -X utf8 tools/ghep_nhac.py <clip.mp4> --moc`
  - Ghép: `python -X utf8 tools/ghep_nhac.py <clip.mp4> --out <ra.mp4> --cue "bai=can-can,bpm=240,t=0.2,den=7.6,nhac_cu=kazoo" --cue "bai=ta-da,t=8.0"`. Đặt nhạc theo hình: nốt nhấn rơi vào đỉnh chuyển động đo được. Clip định ghép nhạc sau thì báo `lap_phan_canh` là clip "tắt nhạc".

## Cảnh đánh ngắn (Seedance 2.0 / H3 / Veo)

`prompt_canh_danh` với `mo_ta` (một câu: ai đánh ai, ở đâu, bao lâu, **phong cách**: võ thuật, tu tiên kiếm khí, hay siêu năng lực kiểu đấm vỡ núi; máy chủ chọn cách dựng đòn theo đó), `nen_tang`, `thoi_luong_giay`, `ti_le`, `nhan_vat` (ảnh 1, ảnh 2 là ai, phe thắng). Lưu từng phần thành `prompt-canh-danh/<tên>/phan-NN.txt`. Người dùng báo phần trước thực sự kết thế nào thì gọi lại với `phan` để viết tiếp phần sau cho khớp.

## Góp ý cho Natha Media (tool `gop_y`)

Đề nghị gửi góp ý khi: một lỗi clip lặp lại dù đã làm theo `tu_van_sua_loi`; người dùng tìm ra cách viết prompt / kịch bản tốt hơn; hoặc **đã sửa một lỗi và render lại thành công** (giá trị nhất — gửi kèm prompt trước và sau, `ket_qua: "da_render_ok"`).
**Luôn hỏi trước**: "Gửi góp ý này cho Natha Media để cải thiện bộ công cụ không?". Chỉ gửi khi người dùng đồng ý, chỉ gửi phần họ cho phép; bỏ key, đường dẫn máy, tên thật. Góp ý được duyệt sẽ thành luật mới cho mọi người; không tính lượt.

Sở thích riêng của người dùng (phong cách, nhân vật hay dùng, cách đặt tên) thì ghi vào `du-an/<tên phim>/ghi-nho.md` trong thư mục của họ và đọc lại ở lần sau — không gửi đi.

## Không làm
- Không in, không commit `image-api.json`, `runninghub-accounts.json`, `telegram.json`.
- Không render khi người dùng chưa đồng ý chi coin cho lô đó.
- Không tự viết prompt H3 bằng tay thay cho `sinh_prompt_h3`, không tự chế kịch bản thay cho `viet_kich_ban` khi người dùng muốn dùng Skill-Fight.
