<#
  cai-dat.ps1 — cài Skill-Fight vào một thư mục dự án (Windows PowerShell 5.1+).

  .\cai-dat.ps1 -Dich "D:\PhimCuaToi" [-Codex] [-Claude] [-MayChu "https://mcp.nathamedia.store/mcp"] [-KhongLuuKey]

  - Chép bộ công cụ (tools\image-api.mjs, tools\runninghub\, file mẫu cấu hình) vào -Dich: tools\ luôn chép đè (cài lại để cập nhật), file cấu hình đã có không bao giờ bị ghi đè.
  - Chép skill lam-phim-hoat-hinh vào -Dich\.agents\skills (Codex) và/hoặc -Dich\.claude\skills (Claude Code).
  - -Codex : thêm [mcp_servers.skill-fight] vào $env:CODEX_HOME\config.toml hoặc ~\.codex\config.toml (sao lưu trước, không trùng lặp).
  - -Claude: đăng ký MCP cho Claude Code bằng `claude mcp add` (nếu có lệnh claude); hoặc cài plugin theo README.
  - Hỏi license key một lần, lưu vào biến môi trường người dùng SKILL_FIGHT_KEY (bỏ qua bằng -KhongLuuKey).
#>
param(
  [Parameter(Mandatory = $true)][string]$Dich,
  [switch]$Codex,
  [switch]$Claude,
  [string]$MayChu = "https://mcp.nathamedia.store/mcp",
  [switch]$KhongLuuKey
)
$ErrorActionPreference = "Stop"
$Nguon = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Codex -and -not $Claude) { $Codex = $true; $Claude = $true }

# 1. Bộ công cụ
New-Item -ItemType Directory -Force $Dich | Out-Null
Get-ChildItem -Recurse -File (Join-Path $Nguon "plugins/skill-fight/bo-cong-cu") | ForEach-Object {
  $rel = $_.FullName.Substring((Join-Path $Nguon "plugins/skill-fight/bo-cong-cu").Length + 1)
  $dst = Join-Path $Dich $rel
  # tools\ là code của plugin: luôn chép đè để bản cài lại nhận bản sửa mới; file cấu hình ở gốc (key của bạn) không bao giờ bị ghi đè
  if (-not (Test-Path $dst) -or $rel -like "tools\*") { New-Item -ItemType Directory -Force (Split-Path $dst) | Out-Null; Copy-Item $_.FullName $dst }
}
foreach ($f in @("image-api", "runninghub-accounts")) {
  $real = Join-Path $Dich "$f.json"
  if (-not (Test-Path $real)) { Copy-Item (Join-Path $Dich "$f.example.json") $real; Write-Host "Đã tạo $real — mở ra điền key của bạn." }
}
Write-Host "Bộ công cụ: $Dich\tools"

# 2. Skill
$skill = Join-Path $Nguon "agents-skills\lam-phim-hoat-hinh"
if ($Codex)  { $d = Join-Path $Dich ".agents\skills\lam-phim-hoat-hinh"; New-Item -ItemType Directory -Force $d | Out-Null; Copy-Item -Force "$skill\*" $d; Write-Host "Skill Codex: $d" }
if ($Claude) { $d = Join-Path $Dich ".claude\skills\lam-phim-hoat-hinh"; New-Item -ItemType Directory -Force $d | Out-Null; Copy-Item -Force "$skill\*" $d; Write-Host "Skill Claude Code: $d" }

# 3. License key
$key = $null
if (-not $KhongLuuKey) {
  $sec = Read-Host "Nhập license key Skill-Fight (sfk_...)" -AsSecureString
  $key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if ($key -notmatch '^sfk_') { throw "Key không đúng dạng sfk_..." }
  [Environment]::SetEnvironmentVariable("SKILL_FIGHT_KEY", $key, "User")
  $env:SKILL_FIGHT_KEY = $key
  Write-Host "Đã lưu key vào biến môi trường người dùng SKILL_FIGHT_KEY (mở lại terminal/IDE để nhận)."
}

# 4. Codex
if ($Codex) {
  $home_ = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
  New-Item -ItemType Directory -Force $home_ | Out-Null
  $cfg = Join-Path $home_ "config.toml"
  $cur = if (Test-Path $cfg) { Get-Content -Raw $cfg } else { "" }
  if ($cur -match '\[mcp_servers\.skill-fight\]') { Write-Host "Codex: đã có [mcp_servers.skill-fight] trong $cfg, giữ nguyên." }
  else {
    $bak = ""; if (Test-Path $cfg) { Copy-Item $cfg "$cfg.bak-skill-fight"; $bak = " (bản cũ: config.toml.bak-skill-fight)" }
    $block = "`n[mcp_servers.skill-fight]`nurl = `"$MayChu`"`nbearer_token_env_var = `"SKILL_FIGHT_KEY`"`ntool_timeout_sec = 600`nstartup_timeout_sec = 30`ndefault_tools_approval_mode = `"approve`"`n"
    [IO.File]::AppendAllText($cfg, $block, (New-Object Text.UTF8Encoding($false)))
    Write-Host "Codex: đã thêm MCP skill-fight vào $cfg$bak."
  }
}

# 5. Claude Code
if ($Claude) {
  if (Get-Command claude -ErrorAction SilentlyContinue) {
    if ($key) { & claude mcp add --scope user --transport http skill-fight $MayChu --header "Authorization: Bearer $key" | Out-Null; Write-Host "Claude Code: đã đăng ký MCP skill-fight (scope user)." }
    else { Write-Host "Claude Code: chạy  claude mcp add --scope user --transport http skill-fight $MayChu --header `"Authorization: Bearer <key>`"" }
  } else { Write-Host "Claude Code: chưa thấy lệnh claude. Cài plugin theo README (claude plugin marketplace add … / claude plugin install skill-fight@skill-fight)." }
}
Write-Host "`nXong. Mở dự án trong Codex hoặc Claude Code và nói: 'gọi huong_dan của skill-fight'."
