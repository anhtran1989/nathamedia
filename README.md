# Skill-Fight · Natha Media

Bộ công cụ làm phim hoạt hình AI cho **Claude Code** và **Codex**, ba thể loại:

- **Drama / truyện đạo đức** có thoại
- **Hài câm** không thoại (kiểu Larva, Tom and Jerry)
- **Cảnh đánh** hành động (Seedance 2.0, MiniMax H3, Veo)

Từ ý tưởng tới clip: nghĩ ý tưởng, viết và soát kịch bản, prompt ảnh nhân vật và bối cảnh, lập phân cảnh, sinh prompt MiniMax H3 có khoá liền mạch, render RunningHub nhiều tài khoản, kiểm clip và sửa lỗi.

Cần **license key** do Natha Media cấp (dạng `sfk_…`).

## Bạn cần có

1. **Claude Code** (gói Claude Pro/Max hoặc API) **hoặc Codex** (tài khoản ChatGPT có Codex).
2. **Node.js 20 trở lên** (`node -v`).
3. **Tài khoản RunningHub** có coin (mỗi clip 10 giây khoảng 160–230 coin). Nhiều tài khoản thì render được nhiều luồng hơn.
4. **Key tạo ảnh** OpenAI-compatible có Responses API và tool `image_generation`.
5. **License key Skill-Fight.**

## Cài

**Claude Code** — chạy trong terminal:

```bash
claude plugin marketplace add anhtran1989/nathamedia
claude plugin install skill-fight@skill-fight
```

Claude Code hỏi license key lúc cài và lưu vào kho khoá an toàn của máy. Nếu không thấy hỏi (hoặc muốn đổi key): mở Claude Code, gõ `/plugin`, chọn **skill-fight** → **Configure**, dán key.

**Codex:**

```bash
codex plugin marketplace add anhtran1989/nathamedia
codex plugin add skill-fight@skill-fight
```

Rồi lưu key một lần và mở lại Codex: `setx SKILL_FIGHT_KEY sfk_...` (Windows) hoặc thêm `export SKILL_FIGHT_KEY=sfk_...` vào `~/.zshrc` / `~/.bashrc`.
Codex trên Windows cần bật sandbox để ghi file: thêm vào `~/.codex/config.toml`

```toml
[windows]
sandbox = "elevated"
```

## Dùng

Mở một thư mục làm phim, nói với agent:

- "Kiểm tra license Skill-Fight của tôi" — xem gói, thể loại, số ngày còn lại.
- "Nghĩ 5 ý tưởng tập hài câm cho nhân vật của tôi"
- "Làm phim hoạt hình từ kich-ban.md"
- "Làm cảnh đánh 30 giây: kiếm khách áo đỏ đánh bầy sói trên cầu tre"

Lần đầu, agent chép bộ công cụ (`tools/`) vào thư mục phim và nhắc bạn điền `runninghub-accounts.json` (key + ID workflow mỗi tài khoản RunningHub, sau khi import `tools/runninghub/workflows/WF_Ultra_Speed_Singularity_Minimax_AUDIO.json` vào tài khoản đó) và `image-api.json` (key tạo ảnh). Kiểm tài khoản không tốn coin: `node tools/runninghub/check.mjs`.

Key của bạn chỉ nằm trên máy bạn, không gửi đi đâu.

## Cập nhật

Luật và kỹ thuật mới nằm ở máy chủ, bạn nhận ngay mà không cần làm gì. Khi có bản plugin mới:

```bash
claude plugin marketplace update skill-fight
```

(Codex: `codex plugin marketplace upgrade`.)

## Thống kê sử dụng

Máy chủ ghi số lượt gọi công cụ, tên dự án, số clip và ảnh đã lên prompt. Sau mỗi lô render hoặc tạo ảnh, agent gửi thêm số clip/ảnh xong, số lỗi và phí RunningHub đã tiêu. **Không gửi key, prompt, kịch bản hay file của bạn.** Dữ liệu dùng để hỗ trợ và tính hạn mức.

**Chống sao chép:** máy chủ tự phát hiện yêu cầu có dấu hiệu lấy bộ luật (đòi system prompt, tài liệu nội bộ, nguyên văn luật…). Riêng các yêu cầu đó được lưu một đoạn trích ngắn trong 30 ngày để kiểm tra. Cố tình sao chép hoặc chia sẻ key sẽ bị thu hồi key, không hoàn tiền.

## Công cụ khác (không hỗ trợ chính thức)

Cursor, VS Code, Gemini CLI…: xem `CAU-HINH-CAC-IDE.md`. Cài tay trên Windows không qua plugin: `.\cai-dat.ps1 -Dich "D:\PhimCuaToi" -Claude -Codex`.

© Natha Media. Bản quyền thuộc Natha Media; license key dùng cho một người, không chia sẻ.
