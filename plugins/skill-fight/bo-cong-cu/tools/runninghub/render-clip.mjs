#!/usr/bin/env node
/**
 * render-clip.mjs — gửi 1 clip lên workflow Ultra H3 bằng MỘT tài khoản, chờ xong, tải video về.
 * (chuyển từ D:\MCP-RunningHub\scripts\test-multiref.mjs, 27/9/2026; thêm --account)
 *
 *   node tools/runninghub/render-clip.mjs <config.json> --account tk1
 *   DRY_RUN=1 → preflight + in payload, không upload, không tạo task, 0 coin.
 *
 * config: {
 *   "refs": ["nv.png", "bc.png", ...],   // theo thứ tự <Picture 1..n>, tối đa 9
 *   "prompt": "file.prompt.txt", "out": "out.mp4",
 *   "aspect": "16:9" | "9:16", "duration": 10, "steps": 6, "seed": "…",
 *   "padIndex": 1, "padNoteAnchor": "<Subject 2> is …",
 *   "audios": ["giong.mp3"],             // tuỳ chọn, tối đa 3, tổng ≤ 15 s
 *   "workflowId": "…"                    // tuỳ chọn; mặc định ultraWorkflowId của tài khoản
 * }
 * In ra: "task <id>" khi tạo được task, "DONE → <out> · <coins> coins · <phút> min" khi xong.
 * 421 / QUEUE_MAXED: task CHƯA được tạo (0 coin) → chờ 60 s rồi gửi lại, tối đa 40 lần.
 */
import fs from "node:fs";
import path from "node:path";
import { SLOT_NODES, AUDIO_NODES, SILENCE_FILE, buildUltraPayload, preflightUltra, checkAudioBudget } from "./lib/ultra-h3.mjs";
import { getAccount, clean, BASE } from "./lib/accounts.mjs";

const argv = process.argv.slice(2);
const CONFIG = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--account");
const accName = argv[argv.indexOf("--account") + 1];
if (!CONFIG || !argv.includes("--account") || !accName) { console.error("dùng: node tools/runninghub/render-clip.mjs <config.json> --account <tên>"); process.exit(1); }
const acc = getAccount(accName);
const key = acc.apiKey;
const DRY_RUN = process.env.DRY_RUN === "1";
const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const audioFiles = cfg.audios ?? [];
const WITH_AUDIO = audioFiles.length > 0;
const WF = cfg.workflowId || acc.ultraWorkflowId;
const die = (msg, code = 1) => { console.error(clean(msg)); process.exit(code); };

// Mạng tới runninghub.ai hay chập chờn (2/10/2026: hai lô báo FAILED cả 10 clip dù task trên máy chủ vẫn xong): mỗi lần gọi có hạn 60 s,
// lỗi mạng thì thử lại; vòng hỏi trạng thái không bao giờ chết vì mạng, chỉ kết thúc khi task xong/lỗi thật hoặc quá hạn.
const afetch = async (u, o = {}, lan = 3) => { for (let a = 1; ; a++) { try { return await fetch(u, { ...o, signal: AbortSignal.timeout(60000) }); } catch (e) { if (a >= lan) throw e; await new Promise((r) => setTimeout(r, 20000 * a)); } } };
const LOST = 5; // mã thoát: task đã tạo nhưng mất mạng, ultra-batch tự lấy lại bằng lay-lai.mjs
async function uploadFile(p, tag, fileType = "image") {
  const bytes = new Uint8Array(fs.readFileSync(p));
  const ext = fileType === "image" ? ".png" : path.extname(p).toLowerCase();
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: fileType }), `api/mref_${tag}_${Date.now()}${ext}`);
  form.append("fileType", fileType);
  form.append("apiKey", key);
  const res = await afetch(BASE + "/task/openapi/upload", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const j = await res.json();
  const fi = j.data?.fileInfo ?? j.data?.fileName ?? j.data?.file;
  if (!(j.code === 200 || j.code === 0) || !fi) throw new Error(clean(`upload fail: ${JSON.stringify(j).slice(0, 200)}`));
  return String(fi);
}
const post = (ep, body) => afetch(BASE + ep, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ apiKey: key, ...body }) }).then((r) => r.json());
async function status(taskId) {
  const d = (await post("/task/openapi/status", { taskId }))?.data;
  return typeof d === "string" ? d : String(d?.taskStatus ?? "UNKNOWN");
}
async function outputs(taskId) {
  const j = await post("/task/openapi/outputs", { taskId });
  return Array.isArray(j?.data) ? j.data : (Array.isArray(j?.data?.outputs) ? j.data.outputs : []);
}

const prompt = fs.readFileSync(cfg.prompt, "utf8").replace(/^\uFEFF/, "").trim();
const refFiles = [];
for (const r of cfg.refs) {
  if (Array.isArray(r)) {                       // kiểu cũ [node, file] → quy về vị trí slot của node
    const i = SLOT_NODES.indexOf(String(r[0]));
    if (i < 0) die(`node ${r[0]} không phải slot ảnh (${SLOT_NODES.join(",")})`);
    refFiles[i] = r[1];
  } else refFiles.push(r);
}
if (WITH_AUDIO) {
  const { secs, total } = checkAudioBudget(audioFiles);
  audioFiles.forEach((f, i) => console.log(`Audio ${i + 1} (node ${AUDIO_NODES[i]}) ← ${path.basename(f)} · ${secs[i].toFixed(2)} s`));
  console.log(`tổng audio (kể cả ô im lặng) ${total.toFixed(2)} s`);
}
let audioOn = true;
try {
  const pf = await preflightUltra(key, WF, { audio: WITH_AUDIO });
  audioOn = pf.hasAudio;
  console.log(`[${acc.name}] preflight OK — workflow ${WF}, ${pf.inputs} input, ô audio ${pf.hasAudio ? "bật" : "tắt"}, khung đang lưu "${pf.savedAspect}"`);
} catch (e) {
  if (!DRY_RUN) die(`[${acc.name}] ${e.message}`, 3);
  console.warn(clean(`[DRY_RUN][${acc.name}] ${e.message}\n`));
}
const refs = [];
for (let i = 0; i < refFiles.length; i++) {
  if (!refFiles[i]) continue;
  refs[i] = DRY_RUN ? path.basename(refFiles[i]) : await uploadFile(refFiles[i], `s${i}`);
  console.log(`Picture ${i + 1} (node ${SLOT_NODES[i]}) ← ${path.basename(refFiles[i])}`);
}
const audios = [];
for (let i = 0; i < audioFiles.length; i++) audios.push(DRY_RUN ? path.basename(audioFiles[i]) : await uploadFile(audioFiles[i], `a${i}`, "audio"));
const silence = audioOn && audioFiles.length < AUDIO_NODES.length
  ? (DRY_RUN ? path.basename(SILENCE_FILE) : await uploadFile(SILENCE_FILE, "silence", "audio"))
  : undefined;
const { nodeInfoList } = buildUltraPayload({
  refs, padIndex: cfg.padIndex, padNoteAnchor: cfg.padNoteAnchor, prompt, aspect: cfg.aspect ?? "16:9",
  duration: cfg.duration ?? 10, steps: cfg.steps ?? 6, seed: cfg.seed, audioOn, audios, silence,
});
if (DRY_RUN) {
  for (const n of nodeInfoList) console.log(`  ${n.nodeId}.${n.fieldName} = ${String(n.fieldValue).replace(/\s+/g, " ").slice(0, 110)}`);
  process.exit(0);
}
let taskId = null;
for (let attempt = 1; !taskId; attempt++) {
  const cj = await post("/task/openapi/create", { workflowId: WF, nodeInfoList, instanceType: "plus" });
  taskId = cj?.data?.taskId ?? cj?.taskId ?? null;
  if (taskId) break;
  if ((cj?.code === 421 || /QUEUE_MAXED/i.test(String(cj?.msg ?? ""))) && attempt < 40) {
    console.log(`[${acc.name}] hàng đợi đầy (421) — chờ 60s, lần ${attempt}`);
    await new Promise((r) => setTimeout(r, 60000));
    continue;
  }
  die(`create fail: ${JSON.stringify(cj).slice(0, 300)}`);
}
console.log(`task ${taskId} — [${acc.name}] rendering (${refs.filter(Boolean).length} refs, ${cfg.aspect ?? "16:9"})...`);
const t0 = Date.now();
let st = "QUEUED";
let matMang = 0;
while (Date.now() - t0 < 45 * 60 * 1000) {
  await new Promise((r) => setTimeout(r, 20000));
  try { st = await status(String(taskId)); }
  catch (e) { matMang++; console.log(`[${acc.name}] mất mạng khi hỏi trạng thái (lần ${matMang}: ${e.cause?.code ?? e.message}), hỏi tiếp`); continue; }
  if (st === "SUCCESS" || st === "FAILED" || st === "CANCELED") break;
}
if (st !== "SUCCESS" && st !== "FAILED" && st !== "CANCELED") die(`LOST task ${taskId}: quá 45 phút chưa biết kết quả (${st})`, LOST);
if (st !== "SUCCESS") die(`render ended ${st}`);
let url = null, coins = "? coins";
for (let a = 0; a < 10 && !url; a++) {
  if (a) await new Promise((r) => setTimeout(r, 15000 + 5000 * a));
  let outs = [];
  try { outs = await outputs(String(taskId)); } catch (e) { console.log(`[${acc.name}] mất mạng khi lấy output (lần ${a + 1}), thử lại`); continue; }
  url = outs[0]?.fileUrl ?? null;
  const o = outs[0] ?? {};
  coins = o.consumeCoins != null ? `${o.consumeCoins} coins` : o.consumeMoney != null ? `${o.consumeMoney} USD` : "? coins";
}
if (!url) die(`LOST task ${taskId}: SUCCESS nhưng chưa lấy được output url`, LOST);
let r2;
try { r2 = await afetch(url, {}, 8); } catch (e) { die(`LOST task ${taskId}: SUCCESS nhưng tải video lỗi mạng`, LOST); }
fs.mkdirSync(path.dirname(cfg.out), { recursive: true });
fs.writeFileSync(cfg.out, Buffer.from(await r2.arrayBuffer()));
console.log(`DONE → ${cfg.out} · ${coins} · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
