---
name: lam-phim-hoat-hinh
description: Làm phim hoạt hình AI bằng Skill-Fight cho ba thể loại — drama / truyện đạo đức có thoại, hài câm không thoại (kiểu Larva, Tom and Jerry), cảnh đánh hành động — từ nghĩ ý tưởng, viết và soát kịch bản, prompt ảnh nhân vật và bối cảnh, lập phân cảnh, sinh prompt MiniMax H3 có khoá liền mạch, render RunningHub nhiều tài khoản, kiểm clip và sửa lỗi; cảnh đánh ngắn từ một câu cho Seedance 2.0 / H3 / Veo. Dùng khi người dùng muốn nghĩ ý tưởng tập phim, viết hoặc nâng kịch bản, làm phim/clip hoạt hình từ kịch bản, tạo ảnh tài sản, viết prompt MiniMax H3 hoặc prompt cảnh đánh, render trên RunningHub, hoặc báo lỗi clip vừa render (nhân đôi nhân vật, đảo trái phải, đạo cụ sai, sai cảm xúc, đánh không chạm).
---

# Làm phim hoạt hình AI với Skill-Fight

Hai phần phối hợp:
- **MCP `skill-fight`** (máy chủ, cần license): `huong_dan`, `thong_tin_license`, `nghi_y_tuong`, `viet_kich_ban`, `soat_kich_ban`, `prompt_anh_tai_san`, `lap_phan_canh`, `soat_phan_canh`, `sinh_prompt_h3`, `tu_van_sua_loi`, `prompt_canh_danh`.
- **Bộ công cụ trên máy** (thư mục dự án, key của người dùng): `tools/image-api.mjs` (tạo ảnh), `tools/runninghub/` (render), `tools/telegram.mjs` (tuỳ chọn, báo render xong qua bot Telegram của người dùng). Cần Node ≥ 20.

Nếu tool `skill-fight` báo lỗi license, dừng lại và báo nguyên văn cho người dùng.

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
3. **Tài sản**: `prompt_anh_tai_san` với kịch bản → JSON `items`. Lưu mỗi prompt thành file rồi tạo ảnh:
   `node tools/image-api.mjs resp --promptFile p.txt --out du-an/<phim>/anh-tai-san/<id>.png --size <size> [--ref du-an/<phim>/anh-tai-san/<ref>.png]`
   (biến thể và ảnh trạng thái luôn gửi ảnh gốc làm `--ref`). Người dùng đã có ảnh nhân vật thì làm bản sạch với ảnh đó làm `--ref`. Xem từng ảnh trước khi dùng: đúng màu tóc/mắt/trang phục, không chữ, không cắt chân, bối cảnh có đủ mốc trái/phải.
4. **Phân cảnh**: với từng nhóm cảnh (≤ 6 clip 10 s), `lap_phan_canh` với đoạn kịch bản, `chars` `{id: [tên, mô tả nhận dạng + trang phục, câu tả giọng "in a … voice"]}`, `locs` `{id: [tên, mô tả bố cục]}` (id trùng tên file ảnh, không đuôi .png), `id_prefix`, `bat_dau`, `the_loai`. Lưu JSON vào `du-an/<phim>/phan-canh/<tập>-lo1.json`. Sửa các cảnh báo (nhân vật khuất khỏi dòng khung rộng, thiếu nét mặt, thiếu shot trên cao…) rồi gọi `soat_phan_canh` sau khi sửa.
5. **Prompt**: `sinh_prompt_h3` (≤ 6 clip mỗi lượt) với `chars`, `locs`, `segments` (và `axis`, `props`, `sound_beds`, `cast_others: "empty"` nếu nơi không có người ngoài, `phong_cach`), `takes_dir` = đường dẫn tuyệt đối `takes/<tên tập>`, `assets_dir` = đường dẫn tuyệt đối `anh-tai-san/`. Ghi mỗi khối `===== <id>.prompt.txt =====` thành file `<takes_dir>/<id>.prompt.txt` (UTF-8 không BOM, giữ nguyên từng ký tự) và nối các khối `YÊU CẦU RENDER ULTRA H3` vào `<takes_dir>/_yeu-cau-render-<tập>.md`.
6. **Render** (tốn coin của người dùng: ~160–230 coin hoặc ~0,13 USD mỗi clip 10 s, ~7 phút):
   - Lần đầu: `node tools/runninghub/check.mjs` (0 coin) để thấy coin, số luồng, workflow.
   - Xem trước: `node tools/runninghub/ultra-batch.mjs "<file yêu cầu>" --dry` (0 coin, in số clip mỗi tài khoản đủ coin chạy).
   - **Hỏi người dùng xác nhận coin một lần cho cả lô**, rồi chạy nền: `node tools/runninghub/ultra-batch.mjs "<file yêu cầu>" --retry-oom [--telegram]`. Tổng luồng = tổng `maxConcurrent` các tài khoản trong `runninghub-accounts.json`.
   - Mỗi clip chạy đúng một lần; không tự chạy lại clip lỗi. Dừng đưa thêm clip: tạo file `.runninghub/state/STOP`.
7. **Kiểm clip**: với mỗi video, chụp 10 khung (`ffmpeg -i clip.mp4 -vf "fps=1,scale=400:-1,tile=5x2" -frames:v 1 qc.jpg`) và xem: đúng nhân vật, không thiếu hay nhân đôi nhân vật, đúng trái/phải, đúng đạo cụ, nét mặt khớp thoại, không chữ lạ, hiệu ứng nào cũng có nguồn. Thiếu nhân vật hay hiệu ứng không nguồn là clip hỏng.
8. **Sửa lỗi**: `tu_van_sua_loi` với mô tả lỗi + prompt của clip + `the_loai`, sửa segment theo câu trả lời, thêm segment id `…-v2`, sinh prompt lại chỉ cho clip đó và render file yêu cầu mới. Không ghi đè clip cũ.

## Cảnh đánh ngắn (Seedance 2.0 / H3 / Veo)

`prompt_canh_danh` với `mo_ta` (một câu: ai đánh ai, ở đâu, bao lâu), `nen_tang`, `thoi_luong_giay`, `ti_le`, `nhan_vat` (ảnh 1, ảnh 2 là ai, phe thắng). Lưu từng phần thành `prompt-canh-danh/<tên>/phan-NN.txt`. Người dùng báo phần trước thực sự kết thế nào thì gọi lại với `phan` để viết tiếp phần sau cho khớp.

## Không làm
- Không in, không commit `image-api.json`, `runninghub-accounts.json`, `telegram.json`.
- Không render khi người dùng chưa đồng ý chi coin cho lô đó.
- Không tự viết prompt H3 bằng tay thay cho `sinh_prompt_h3`, không tự chế kịch bản thay cho `viet_kich_ban` khi người dùng muốn dùng Skill-Fight.
