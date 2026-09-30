#!/usr/bin/env node
/**
 * image-api.mjs — tạo ảnh tài sản qua 9Router (OpenAI-compatible, Responses API + tool image_generation).
 *
 * Cấu hình (KHÔNG để key trong repo này), tìm theo thứ tự:
 *   1. biến môi trường IMAGE_API_CONFIG (đường dẫn tới file json)
 *   2. <thư mục bộ công cụ>/image-api.json (đã gitignore, mẫu: image-api.example.json)
 *   Dạng: { "baseUrl": "https://<endpoint>/v1", "apiKey": "...", "model": "<model>" }
 *
 * Lệnh:
 *   node tools/image-api.mjs ping
 *   node tools/image-api.mjs models
 *   node tools/image-api.mjs resp  --promptFile p.txt | --prompt "..."  --out out.png [--size 1536x1024] [--ref a.png --ref b.png] [--model ...] [--timeout 600] [--keep-alpha]
 *   node tools/image-api.mjs batch --project "du-an/<dự án>" [--concurrency 5] [--only id1,id2] [--force] [--dry-run]
 *
 * `batch` đọc <project>/tai-san.json, chạy theo thứ tự: ảnh gốc nhân vật → bối cảnh → biến thể → bảng biểu cảm;
 * ảnh đã có thì bỏ qua (trừ --force); biến thể/biểu cảm tự gửi ảnh gốc làm --ref. Mỗi ảnh gọi đúng 1 lần,
 * không tự retry (mỗi lượt tính vào tài khoản ChatGPT của người dùng). Ghi nhật ký <project>/anh-tai-san/_log.jsonl.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const candidates = [process.env.IMAGE_API_CONFIG, path.join(REPO, "image-api.json")].filter(Boolean); // mẫu: image-api.example.json
const cfgPath = candidates.find((p) => fs.existsSync(p));
if (!cfgPath) {
  console.error("Không tìm thấy image-api.json. Đã tìm: " + candidates.join(" | "));
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
const H = { Authorization: `Bearer ${cfg.apiKey}` };

const arg = (name, def = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const flag = (name) => process.argv.includes(`--${name}`);
const args = (name) => process.argv.flatMap((a, i) => (a === `--${name}` && process.argv[i + 1] ? [process.argv[i + 1]] : []));

function rawRequest(method, urlString, headers, bodyObj, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlString);
    const mod = u.protocol === "https:" ? https : http;
    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const req = mod.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: payload ? { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : headers,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, text: data }));
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Không có phản hồi sau ${timeoutMs / 1000}s`)));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function ping() {
  const t0 = Date.now();
  try {
    const r = await rawRequest("GET", `${cfg.baseUrl}/models`, H, null, 8000);
    console.log(`OK HTTP ${r.status} trong ${Date.now() - t0} ms — ${cfg.baseUrl} (cấu hình: ${cfgPath})`);
  } catch (e) {
    console.error(`KHÔNG KẾT NỐI ĐƯỢC ${cfg.baseUrl}: ${e.code || e.message}. Kiểm tra máy chạy 9Router đã bật và IP trong ${cfgPath}.`);
    process.exit(1);
  }
}

async function models() {
  const r = await rawRequest("GET", `${cfg.baseUrl}/models`, H, null, 15000);
  const ids = (JSON.parse(r.text).data || []).map((m) => m.id);
  console.log(`HTTP ${r.status} — ${ids.length} models\n` + ids.join("\n"));
}

async function generate({ prompt, out, size, refs = [], model = cfg.model, timeoutSec = 600, keepAlpha = false }) {
  const tool = { type: "image_generation" };
  if (size) tool.size = size; // 1536x1024 ngang | 1024x1536 dọc | 1024x1024
  let input = prompt;
  if (refs.length) {
    const content = [{ type: "input_text", text: prompt }];
    for (const p of refs) {
      const ext = path.extname(p).slice(1).toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "jpeg" : ext || "png";
      content.push({ type: "input_image", image_url: `data:image/${mime};base64,${fs.readFileSync(p).toString("base64")}` });
    }
    input = [{ role: "user", content }];
  }
  const t0 = Date.now();
  const r = await rawRequest("POST", `${cfg.baseUrl}/responses`, H, { model, input, tools: [tool] }, timeoutSec * 1000);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 300)}`);
  const j = JSON.parse(r.text);
  const call = (j.output || []).find((o) => o.type === "image_generation_call" && o.result);
  if (!call) throw new Error("Không có image_generation_call.result: " + r.text.slice(0, 300));
  const buf = Buffer.from(call.result, "base64");
  const isPng = buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  if (!isPng && !isJpg) throw new Error("Kết quả không phải PNG/JPEG");
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, buf);
  // PNG màu RGBA (byte 25 = 6) → ảnh trả về có nền trong suốt; đổ nền xám #E8E8E8 để làm ảnh tham chiếu sạch.
  // --keep-alpha: giữ nền trong suốt (ảnh lớp chồng hậu kỳ, vd hình ký ức C5-D5).
  let flattened = false;
  if (isPng && buf[25] === 6 && !keepAlpha) {
    const py = "from PIL import Image;import sys;p=sys.argv[1];im=Image.open(p).convert('RGBA');bg=Image.new('RGBA',im.size,(232,232,232,255));bg.alpha_composite(im);bg.convert('RGB').save(p)";
    const r = spawnSync("python", ["-X", "utf8", "-c", py, out]);
    flattened = r.status === 0;
    if (!flattened) console.error(`Cảnh báo: ${out} có nền trong suốt, không đổ nền được (${String(r.stderr).slice(0, 200)})`);
  }
  return { ok: true, out, bytes: buf.length, sec: Math.round((Date.now() - t0) / 1000), model, refs: refs.length, flattened };
}

async function resp() {
  const pf = arg("promptFile");
  const prompt = pf ? fs.readFileSync(pf, "utf8").trim() : arg("prompt");
  if (!prompt) { console.error("Thiếu --prompt hoặc --promptFile"); process.exit(2); }
  const res = await generate({ prompt, out: arg("out", "api-image.png"), size: arg("size"), refs: args("ref"), model: arg("model", cfg.model), timeoutSec: Number(arg("timeout", "600")), keepAlpha: flag("keep-alpha") });
  console.log(JSON.stringify(res));
}

function sizeFor(ratio) {
  if (!ratio) return "1536x1024";
  const [w, h] = ratio.split(":").map(Number);
  return w > h ? "1536x1024" : w < h ? "1024x1536" : "1024x1024";
}

async function batch() {
  const proj = path.resolve(REPO, arg("project", ""));
  const data = JSON.parse(fs.readFileSync(path.join(proj, "tai-san.json"), "utf8"));
  const dir = path.join(proj, "anh-tai-san");
  const only = arg("only") ? arg("only").split(",") : null;
  const jobs = [];
  const items = data.items;
  for (const kind of ["nhan_vat", "boi_canh", "dao_cu"])
    for (const it of items.filter((x) => x.kind === kind))
      jobs.push({ id: it.asset_id, prompt: it.image_prompt, size: sizeFor(it.image_aspect_ratio), refs: [] });
  for (const it of items)
    for (const v of it.variants || [])
      jobs.push({ id: v.asset_id, prompt: v.image_prompt, size: sizeFor(v.image_aspect_ratio || "16:9"), refs: (v.reference_inputs || []).map((r) => path.join(dir, r + ".png")) });
  for (const it of items)
    if (it.needs_expression_sheet)
      jobs.push({ id: it.asset_id + "_bieu_cam", prompt: it.expression_sheet_prompt, size: "1536x1024", refs: [path.join(dir, it.asset_id + ".png")] });

  const log = path.join(dir, "_log.jsonl");
  fs.mkdirSync(dir, { recursive: true });
  const conc = Math.max(1, Number(arg("concurrency", "1")));
  let aborted = false;

  async function runOne(job) {
    const out = path.join(dir, job.id + ".png");
    if (fs.existsSync(out) && !flag("force")) { console.log(`bỏ qua (đã có) ${job.id}`); return; }
    if (flag("dry-run")) { console.log(`[dry-run] ${job.id} ${job.size} refs=${job.refs.length} prompt=${job.prompt.length} ký tự`); return; }
    console.log(`BẮT ĐẦU ${job.id}`);
    try {
      const res = await generate({ prompt: job.prompt, out, size: job.size, refs: job.refs });
      fs.appendFileSync(log, JSON.stringify({ id: job.id, ...res, at: new Date().toISOString() }) + "\n");
      console.log(`XONG ${job.id} (${res.sec}s, ${res.bytes} bytes)`);
    } catch (e) {
      fs.appendFileSync(log, JSON.stringify({ id: job.id, ok: false, error: e.message, at: new Date().toISOString() }) + "\n");
      console.error(`LỖI ${job.id}: ${e.message}`);
      if (/ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|Connect Timeout|Không có phản hồi/.test(e.message)) { aborted = true; console.error("Mất kết nối 9Router, dừng lô."); }
    }
  }

  // Chạy theo đợt: đợt 1 là ảnh không cần ref (nhân vật, bối cảnh); mỗi đợt sau là ảnh có đủ ref (biến thể, bảng biểu cảm,
  // rồi ảnh làm từ biến thể như bản đồ @tren_cao lấy ảnh góc làm ref). Mỗi đợt chạy `conc` luồng.
  const selected = jobs.filter((j) => !only || only.includes(j.id));
  const daLam = new Set();
  const coRef = (r) => fs.existsSync(r) || (flag("dry-run") && daLam.has(path.basename(r, ".png")));
  let conLai = selected;
  while (conLai.length) {
    const wave = conLai.filter((j) => j.refs.every(coRef));
    if (!wave.length) break;
    conLai = conLai.filter((j) => !wave.includes(j));
    let next = 0;
    const worker = async () => { while (!aborted && next < wave.length) await runOne(wave[next++]); };
    await Promise.all(Array.from({ length: Math.min(conc, wave.length) }, worker));
    if (aborted) process.exit(1);
    wave.forEach((j) => daLam.add(j.id));
  }
  for (const j of conLai) console.log(`chờ ảnh gốc ${j.id}: thiếu ${j.refs.filter((r) => !coRef(r)).map((m) => path.basename(m)).join(", ")}`);
}

const map = { ping, models, resp, batch };
const cmd = process.argv[2];
if (!map[cmd]) { console.error("Lệnh: ping | models | resp | batch"); process.exit(2); }
map[cmd]().catch((e) => { console.error("FAIL:", e.message, e.cause ? String(e.cause) : ""); process.exit(1); });
