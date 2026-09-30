#!/usr/bin/env node
// Gửi tin nhắn / video về Telegram của người dùng qua bot riêng (Bot API).
// Cấu hình: telegram.json ở gốc repo (gitignored, mẫu telegram.example.json): { "botToken": "...", "chatId": "..." }
//   node tools/telegram.mjs ping                         → gửi tin thử
//   node tools/telegram.mjs chat-id                      → đọc chatId từ tin nhắn gần nhất bạn gửi cho bot, ghi vào telegram.json
//   node tools/telegram.mjs msg "nội dung"               → gửi tin
//   node tools/telegram.mjs video <file.mp4> ["chú thích"] → gửi video; > 45 MB: có apiId+apiHash thì gửi nguyên file qua tools/tg_big.py (tới 2 GB), chưa có thì cắt nhiều phần, không bao giờ nén
// Không bao giờ in token.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = path.join(ROOT, "telegram.json");
const LIMIT = 45 * 1024 * 1024; // giới hạn bot 50 MB; chừa 5 MB vì file sát 50 MB hay bị Gateway Timeout (29/9/2026)

function cfg() {
  if (!fs.existsSync(CFG)) throw new Error("chưa có telegram.json (chép từ telegram.example.json rồi điền botToken)");
  const c = JSON.parse(fs.readFileSync(CFG, "utf8"));
  if (!c.botToken || c.botToken.includes("DIEN_")) throw new Error("telegram.json chưa có botToken");
  return c;
}
const hide = (s) => String(s).replace(/bot\d+:[\w-]+/g, "bot***");

async function api(c, method, body) {
  const url = `https://api.telegram.org/bot${c.botToken}/${method}`;
  const r = await fetch(url, body ? { method: "POST", body } : {}); // getUpdates: GET, không body (form rỗng bị 400)
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description || r.status}`);
  return j.result;
}
// Quá giới hạn bot: cắt bản gốc thành nhiều phần bằng stream copy (không nén lại, giữ nguyên chất lượng; người dùng dặn 29/9/2026).
// Cắt ở keyframe nên độ dài từng phần xê dịch vài giây; phần nào vẫn quá giới hạn thì cắt lại ngắn hơn. Phần để cạnh bản gốc, tên thêm "-phan-NN".
function split(file) {
  const base = file.replace(/\.mp4$/i, "");
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim()) || 60;
  const size = fs.statSync(file).size;
  let seg = Math.max(20, Math.floor((dur * LIMIT * 0.85) / size));
  for (let tries = 0; tries < 4; tries++, seg = Math.max(10, Math.floor(seg * 0.7))) {
    const dir = path.dirname(file), stem = path.basename(base) + "-phan-";
    for (const f of fs.readdirSync(dir)) if (f.startsWith(stem) && f.endsWith(".mp4")) fs.unlinkSync(path.join(dir, f));
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-map", "0", "-c", "copy", "-f", "segment", "-segment_time", String(seg),
      "-reset_timestamps", "1", "-segment_format_options", "movflags=+faststart", `${base}-phan-%02d.mp4`]);
    const parts = fs.readdirSync(dir).filter((f) => f.startsWith(stem) && f.endsWith(".mp4")).sort().map((f) => path.join(dir, f));
    if (parts.every((p) => fs.statSync(p).size <= LIMIT)) return parts;
  }
  throw new Error(`không cắt được ${path.basename(file)} thành các phần dưới ${LIMIT / 1048576} MB`);
}
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) if (v != null) f.append(k, v); return f; };

export async function tgMessage(text) {
  const c = cfg(); if (!c.chatId) throw new Error("telegram.json chưa có chatId (chạy: node tools/telegram.mjs chat-id)");
  return api(c, "sendMessage", form({ chat_id: c.chatId, text }));
}
export async function tgPhoto(file, caption = "") {
  const c = cfg(); if (!c.chatId) throw new Error("telegram.json chưa có chatId (chạy: node tools/telegram.mjs chat-id)");
  const f = form({ chat_id: c.chatId, caption: caption.slice(0, 1000) });
  f.append("photo", new Blob([fs.readFileSync(file)], { type: "image/png" }), path.basename(file));
  return api(c, "sendPhoto", f);
}
export async function tgVideo(file, caption = "") {
  const c = cfg(); if (!c.chatId) throw new Error("telegram.json chưa có chatId (chạy: node tools/telegram.mjs chat-id)");
  if (fs.statSync(file).size <= LIMIT) return sendOne(c, file, caption);
  if (c.apiId && c.apiHash) { // bot đi MTProto (tools/tg_big.py): gửi nguyên file tới 2 GB, không nén, không cắt
    execFileSync("python", ["-X", "utf8", path.join(ROOT, "tools", "tg_big.py"), file, caption], { stdio: "inherit" });
    return 1;
  }
  const parts = split(file); // chưa có apiId, apiHash: gửi nhiều phần chất lượng gốc, không nén
  for (const [i, p] of parts.entries()) await sendOne(c, p, `${caption} (phần ${i + 1}/${parts.length})`.trim());
  for (const p of parts) fs.unlinkSync(p); // gửi xong xoá phần cắt, bản gốc giữ nguyên
  return parts.length;
}
async function sendOne(c, file, caption) {
  const blob = new Blob([fs.readFileSync(file)], { type: "video/mp4" });
  const f = form({ chat_id: c.chatId, caption: caption.slice(0, 1000), supports_streaming: "true" });
  f.append("video", blob, path.basename(file));
  return api(c, "sendVideo", f);
}

// Chỉ chạy dòng lệnh khi gọi thẳng file này; ultra-batch import thì không (argv của nó là file yêu cầu render).
const MAIN = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
const [cmd, ...args] = MAIN ? process.argv.slice(2) : [];
if (cmd) {
  try {
    if (cmd === "chat-id") {
      const c = cfg();
      const ups = await api(c, "getUpdates");
      const m = [...ups].reverse().find((u) => u.message?.chat?.id);
      if (!m) throw new Error("chưa thấy tin nào: mở bot trên Telegram, bấm Start hoặc gửi một tin bất kỳ, rồi chạy lại");
      c.chatId = String(m.message.chat.id);
      fs.writeFileSync(CFG, JSON.stringify(c, null, 2) + "\n");
      console.log(`đã ghi chatId của ${m.message.chat.first_name || m.message.chat.title || "bạn"} vào telegram.json`);
    } else if (cmd === "ping") { await tgMessage("Kết nối Skill-Fight ↔ Telegram OK ✅"); console.log("đã gửi tin thử"); }
    else if (cmd === "msg") { await tgMessage(args.join(" ")); console.log("đã gửi tin"); }
    else if (cmd === "photo") { await tgPhoto(args[0], args.slice(1).join(" ")); console.log("đã gửi ảnh " + path.basename(args[0])); }
    else if (cmd === "video") { const n = await tgVideo(args[0], args.slice(1).join(" ")); console.log("đã gửi video " + path.basename(args[0]) + (typeof n === "number" && n > 1 ? ` (${n} phần)` : "")); }
    else throw new Error("lệnh: ping | chat-id | msg | photo | video");
  } catch (e) { console.error("LỖI Telegram: " + hide(e.message)); process.exit(1); }
}
