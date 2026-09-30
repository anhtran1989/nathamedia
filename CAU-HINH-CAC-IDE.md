# Cài Skill-Fight vào IDE / agent của bạn

Bạn cần: **URL máy chủ** `https://mcp.nathamedia.store/mcp` và **license key** `sfk_…` (Natha Media gửi riêng).
Giữ key như mật khẩu; đặt vào biến môi trường `SKILL_FIGHT_KEY` nếu IDE hỗ trợ, đừng dán thẳng vào file đưa lên git.

Sau khi cài, hỏi agent: *"gọi huong_dan của skill-fight"* để kiểm kết nối.
Hướng dẫn quy trình nằm ngay trong mô tả các tool, nên client nào cũng đọc được. Muốn agent tự làm theo quy trình thì chép thêm skill `agents-skills/lam-phim-hoat-hinh/` vào thư mục skill của client (xem cột "Skill").

## Codex (khuyên dùng: plugin)

```bash
codex plugin marketplace add <owner>/<repo phát hành>
codex plugin add skill-fight@skill-fight
setx SKILL_FIGHT_KEY sfk_...
```

Mở lại Codex sau khi `setx`. Plugin đã có sẵn tự duyệt tool và thời gian chờ 900 s; dòng Codex trong bảng dưới chỉ dành cho cài tay.

## Claude Code (khuyên dùng)

```bash
claude plugin marketplace add <URL repo phát hành>
claude plugin install skill-fight@skill-fight
```

Khi cài, Claude Code hỏi license key và lưu vào kho khoá an toàn. Muốn cài tay, không qua plugin:

```bash
claude mcp add --transport http skill-fight https://mcp.nathamedia.store/mcp --header "Authorization: Bearer sfk_..."
```

## Các client khác (tra cứu 27/9/2026)

| Client | File cấu hình | Đoạn tối thiểu | Skill |
|---|---|---|---|
| **Google Antigravity** | `~/.gemini/config/mcp_config.json` hoặc `.agents/mcp_config.json` | `{"mcpServers":{"skill-fight":{"serverUrl":"https://mcp.nathamedia.store/mcp","headers":{"Authorization":"Bearer sfk_..."}}}}` (phải là `serverUrl`) | `.agents/skills/` |
| **DeepSeek Harness (dsh)** | YAML plugin | `- id: skill-fight` · `name: '@deepseek-ai/dsh-mcp-client'` · `config: {serverName: skill-fight, transport: streamable-http, url: https://mcp.nathamedia.store/mcp, headers: {Authorization: 'Bearer sfk_...'}}` | chỉ đọc tool (bản preview) |
| **Cursor** | `.cursor/mcp.json` | `{"mcpServers":{"skill-fight":{"url":"https://mcp.nathamedia.store/mcp","headers":{"Authorization":"Bearer ${env:SKILL_FIGHT_KEY}"}}}}` | `.cursor/skills/` hoặc rules |
| **VS Code (Copilot agent)** | `.vscode/mcp.json` | `{"inputs":[{"type":"promptString","id":"sfk","password":true,"description":"License Skill-Fight"}],"servers":{"skill-fight":{"type":"http","url":"https://mcp.nathamedia.store/mcp","headers":{"Authorization":"Bearer ${input:sfk}"}}}}` | `.github/skills/` hoặc AGENTS.md |
| **OpenAI Codex CLI / IDE** | `~/.codex/config.toml` | `[mcp_servers.skill-fight]` · `url = "https://mcp.nathamedia.store/mcp"` · `bearer_token_env_var = "SKILL_FIGHT_KEY"` · `tool_timeout_sec = 600` (mặc định 60 s, không đủ cho `lap_phan_canh`) · `default_tools_approval_mode = "approve"` (các tool đều chỉ đọc; thiếu dòng này thì chế độ `codex exec` báo "requires approval") | `.agents/skills/` |
| **Gemini CLI** | `~/.gemini/settings.json` | `{"mcpServers":{"skill-fight":{"httpUrl":"https://mcp.nathamedia.store/mcp","headers":{"Authorization":"Bearer $SKILL_FIGHT_KEY"}}}}` (dùng `httpUrl`, không dùng `url`) | `.gemini/skills/` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `{"mcpServers":{"skill-fight":{"serverUrl":"https://mcp.nathamedia.store/mcp","headers":{"Authorization":"Bearer ${env:SKILL_FIGHT_KEY}"}}}}` | `.windsurf/rules` |
| **Cline** | `cline_mcp_settings.json` | `{"mcpServers":{"skill-fight":{"type":"streamableHttp","url":"https://mcp.nathamedia.store/mcp","headers":{"Authorization":"Bearer sfk_..."}}}}` (bắt buộc `"type":"streamableHttp"`) | `.clinerules/` |
| **Roo Code** | `.roo/mcp.json` | `{"mcpServers":{"skill-fight":{"type":"streamable-http","url":"https://mcp.nathamedia.store/mcp","headers":{"Authorization":"Bearer ${env:SKILL_FIGHT_KEY}"}}}}` | `.roo/rules/` |

**Chưa dùng được:** claude.ai và Claude Desktop (Connectors) chỉ nhận OAuth, header tĩnh mới có ở bản beta cho tổ chức. Muốn bán cho nhóm khách này thì máy chủ phải thêm OAuth.

## Lỗi thường gặp

- `Thiếu license key` / `License key không hợp lệ`: kiểm tra header `Authorization: Bearer sfk_…` (không có dấu cách thừa).
- `License … đã hết hạn ngày …`: liên hệ để gia hạn.
- `Đã dùng hết … lượt hôm nay`: hạn mức theo ngày của gói, sang ngày mới tự mở lại.
