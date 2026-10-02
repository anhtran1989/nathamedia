# tools/runninghub — render MiniMax H3 Ultra trên nhiều tài khoản RunningHub

Chuyển từ `D:\MCP-RunningHub\scripts` ngày 27/9/2026, để cả quy trình (kịch bản → ảnh → prompt → video) nằm trong một repo. Chỉ cần Node ≥ 20 (dùng `fetch` có sẵn), không cài thêm gói nào. Có `ffprobe` thì kiểm được audio (tìm trong PATH, biến `FFPROBE` hoặc bản WinGet).

## Chuẩn bị (mỗi tài khoản một lần)

1. Đăng nhập RunningHub bằng tài khoản đó, import `workflows/WF_Ultra_Speed_Singularity_Minimax_AUDIO.json` (9 ảnh + 3 audio), bấm Save, chép **workflow ID**.
2. Lấy API key của tài khoản.
3. Chép `runninghub-accounts.example.json` (gốc repo) thành `runninghub-accounts.json` (đã gitignore), thêm một mục cho mỗi tài khoản:
   `{ "name": "tk2", "apiKey": "…", "ultraWorkflowId": "…", "maxConcurrent": 5, "enabled": true }`
4. Kiểm (0 coin): `node tools/runninghub/check.mjs` → coin còn, số task đang chạy, workflow đúng cấu trúc.

## Dùng

```bash
# xem trước, 0 coin: preflight từng tài khoản + payload từng clip
node tools/runninghub/ultra-batch.mjs "du-an/<dự án>/takes/_yeu-cau-render-chuong-01.md" --dry

# chạy thật (nền): tổng luồng = tổng maxConcurrent các tài khoản đang bật
node tools/runninghub/ultra-batch.mjs "du-an/<dự án>/takes/_yeu-cau-render-chuong-01.md" "…chuong-02.md" --retry-oom

# chỉ vài clip / chỉ vài tài khoản / giới hạn luồng
node tools/runninghub/ultra-batch.mjs "<file>" --only C1-D2-v2,C1-D5-v2 --accounts tk1,tk2 --width 8 --retry-oom

# một clip lẻ bằng một tài khoản (config json như trong .runninghub/state/*-cfg/)
node tools/runninghub/render-clip.mjs <config.json> --account tk1
```

Theo dõi: `REQ_PREFIX=_yeu-cau-render-<tiền tố>- python -X utf8 -u tools/watch_render.py "du-an/<dự án>" <số chương>`.

## Cách chia việc và chốt an toàn

- Clip tới lượt giao cho tài khoản còn nhiều chỗ trống nhất. Số task đang chạy của từng tài khoản đếm trong mọi file state, kể cả khi có hai tiến trình `ultra-batch` chạy cùng lúc.
- Ảnh upload thuộc về key đã upload, nên mỗi clip dùng một tài khoản từ đầu tới cuối (upload → tạo task → hỏi trạng thái → tải video). Tài khoản đã dùng ghi trong state.
- Mỗi clip chạy đúng một lần. Clip đã có taskId không bao giờ gửi lại; muốn làm lại thì tạo đoạn `…-v2`. `not_created` (lỗi trước khi tạo task, 0 coin) được gửi lại ở lần chạy sau.
- `--retry-oom`: lỗi GPU hết bộ nhớ (lỗi máy chủ) chạy lại đúng 1 lần, seed mới.
- Giữ coin: đầu lô đọc coin của từng tài khoản; mỗi clip giữ trước `--coin-clip` coin (mặc định 230), xong trả lại phần thừa. Tài khoản không đủ coin không nhận clip mới; tất cả hết coin thì dừng và báo số clip chưa gửi.
- 421 QUEUE_MAXED: task chưa được tạo (0 coin) → chờ 60 s rồi gửi lại, tối đa 40 lần.
- Mạng chập chờn sau khi đã tạo task: `render-clip.mjs` vẫn hỏi trạng thái tiếp, không báo lỗi; còn mất thì `ultra-batch` tự lấy lại video theo mã task mỗi phút, tối đa 40 phút, không tạo task mới, không tốn thêm coin. Lấy tay một clip: `node tools/runninghub/lay-lai.mjs <taskId> <tài khoản> <file.mp4>` (taskId và tài khoản có trong file state).
- Dừng đưa thêm clip mới: tạo file `.runninghub/state/STOP` (task đang chạy vẫn chạy xong).
- State: `.runninghub/state/<dự án>__<tên file yêu cầu>.json` (gitignored).
- Không bao giờ in key: mọi dòng log đi qua `clean()`.

## File

| File | Việc |
|---|---|
| `ultra-batch.mjs` | chạy lô nhiều tài khoản |
| `render-clip.mjs` | một clip, một tài khoản |
| `lay-lai.mjs` | lấy lại video của task đã tạo khi mất mạng (không tạo task mới) |
| `check.mjs` | kiểm tài khoản (coin, task đang chạy, workflow) |
| `lib/accounts.mjs` | đọc `runninghub-accounts.json`, che key, trạng thái tài khoản |
| `lib/ultra-h3.mjs` | payload Ultra 9 slot, `padIndex`, audio im lặng, preflight workflow |
| `lib/silence-0.5s.mp3` | lấp ô audio trống |
| `workflows/WF_Ultra_Speed_Singularity_Minimax_AUDIO.json` | workflow để import vào mỗi tài khoản |
