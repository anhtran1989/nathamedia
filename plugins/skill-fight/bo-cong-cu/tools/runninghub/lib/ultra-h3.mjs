import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ultra-h3.mjs — chuẩn gửi task cho workflow Ultra Speed Singularity MiniMax H3 (WF_ULTRA bên dưới).
 *
 * Mọi script render qua workflow này nên dựng payload bằng buildUltraPayload() và gọi
 * preflightUltra() trước khi create, để:
 *  - luôn ép khung hình (node 252) — workspace có thể đang để 9:16 từ dự án khác;
 *  - lấp đủ 9 slot ảnh: slot không dùng mà để trống sẽ nạp "example.png" làm ref rác;
 *  - ảnh xếp LIỀN nhau theo thứ tự <Picture 1..n> → số Picture trong prompt khớp đúng slot;
 *  - chặn sớm khi workspace còn bật node video/audio rỗng hoặc vượt giới hạn 12 input.
 *
 * Slot: ref_image_0..8 ← node 51, 49, 331, 43, 19, 23, 199, 200, 201.
 * Audio: ref_audio_0..2 ← node 48, 14, 15 (đang BẬT sẵn trong WF_ULTRA từ 2026-09-25) — tối đa 3 file, tổng ≤ 15 s.
 *   Khi ô audio bật, MỌI task phải điền đủ 3 ô: ô không dùng lấp bằng silence-0.5s.mp3
 *   (không lặp audio thật → tránh nhân đôi giọng). preflightUltra() trả hasAudio để biết có cần lấp.
 * Node khác: 263.text = prompt · 259.value = thời lượng (s) · 332.steps · 256.noise_seed · 252.aspect_ratio.
 */

export const WF_ULTRA = "2103312463949598721"; // chỉ là mặc định dự phòng; mỗi tài khoản khai ultraWorkflowId của mình trong runninghub-accounts.json
export const SLOT_NODES = ["51", "49", "331", "43", "19", "23", "199", "200", "201"];
export const AUDIO_NODES = ["48", "14", "15"];
export const MAX_AUDIO_SEC = 15; // ghi chú workflow: audio refs tổng ≤ 15 s
export const SILENCE_FILE = fileURLToPath(new URL("./silence-0.5s.mp3", import.meta.url));
const SILENCE_SEC = 0.5;
export const ASPECTS = {
  "16:9": "16:9 (Widescreen)",
  "9:16": "9:16 (Portrait Widescreen)",
};
const MAX_INPUTS = 12; // ghi chú trong workflow: ảnh + video + audio cộng lại ≤ 12

const BASE = "https://www.runninghub.ai";

/** Thời lượng (giây) của file audio, đo bằng ffprobe. */
/** ffprobe: biến FFPROBE → ffprobe trong PATH → bản WinGet (máy Windows của dự án). */
export function ffprobePath() {
  if (process.env.FFPROBE) return process.env.FFPROBE;
  try { execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return "ffprobe"; } catch {}
  const root = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  for (const pkg of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    const dir = path.join(root, pkg);
    for (const sub of fs.statSync(dir).isDirectory() ? fs.readdirSync(dir) : []) {
      const f = path.join(dir, sub, "bin", "ffprobe.exe");
      if (fs.existsSync(f)) return f;
    }
  }
  throw new Error("ultra-h3: không tìm thấy ffprobe (đặt biến FFPROBE)");
}

export function audioSeconds(file) {
  const out = execFileSync(ffprobePath(), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const sec = Number(out.trim());
  if (!Number.isFinite(sec)) throw new Error(`ultra-h3: không đo được thời lượng audio ${file}`);
  return sec;
}

/** Kiểm tra danh sách file audio (đường dẫn local): 1–3 file, tổng kể cả ô im lặng ≤ 15 s. */
export function checkAudioBudget(files) {
  if (!Array.isArray(files) || files.length === 0) throw new Error("ultra-h3: audios rỗng");
  if (files.length > AUDIO_NODES.length) throw new Error(`ultra-h3: ${files.length} audio > ${AUDIO_NODES.length} ô`);
  const secs = files.map(audioSeconds);
  const total = secs.reduce((a, b) => a + b, 0) + (AUDIO_NODES.length - files.length) * SILENCE_SEC;
  if (total > MAX_AUDIO_SEC) throw new Error(`ultra-h3: tổng audio ${total.toFixed(2)} s > ${MAX_AUDIO_SEC} s (${secs.map((x) => x.toFixed(2)).join(" + ")}) — cắt ngắn mẫu giọng`);
  return { secs, total };
}

/**
 * @param {object} o
 * @param {(string|undefined)[]} o.refs  fileName đã upload, theo thứ tự Picture 1..n (tối đa 9).
 *                                       Phần tử undefined (lỗ) cũng được lấp như slot trống.
 * @param {number} [o.padIndex]          ảnh dùng để lấp slot trống (mặc định: ảnh thứ 2 = bối cảnh,
 *                                       nếu chỉ có 1 ảnh thì dùng ảnh đó). Tránh lấp bằng ảnh có nhân vật.
 * @param {string} [o.padNoteAnchor]      chèn ghi chú ảnh trùng vào cuối dòng chứa chuỗi này (mặc định: nối cuối prompt)
 * @param {string} o.prompt
 * @param {string} [o.aspect="16:9"]     "16:9" | "9:16" | chuỗi gốc của ResolutionSelector
 * @param {number|string} [o.duration=10]
 * @param {number|string} [o.steps=6]
 * @param {number|string} [o.seed]       mặc định: ngẫu nhiên
 * @param {boolean} [o.audioOn]         workflow đang bật ô audio (lấy từ preflightUltra().hasAudio) → luôn điền đủ 3 ô
 * @param {string[]} [o.audios]          fileName audio đã upload, theo thứ tự <Audio 1..n> (tối đa 3)
 * @param {string} [o.silence]           fileName đã upload của SILENCE_FILE, bắt buộc khi audioOn và audios < 3
 * @returns {{ nodeInfoList: object[], prompt: string, slots: string[] }}
 */
export function buildUltraPayload({ refs, padIndex, padNoteAnchor, prompt, aspect = "16:9", duration = 10, steps = 6, seed, audioOn = false, audios = [], silence }) {
  if (!Array.isArray(refs) || refs.length === 0) throw new Error("ultra-h3: cần ít nhất 1 ảnh ref");
  if (refs.length > SLOT_NODES.length) throw new Error(`ultra-h3: ${refs.length} ảnh > ${SLOT_NODES.length} slot`);
  if (!prompt?.trim()) throw new Error("ultra-h3: prompt rỗng");
  const aspectValue = ASPECTS[aspect] ?? aspect;

  const used = refs.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  if (used.length === 0) throw new Error("ultra-h3: tất cả ref đều trống");
  const pad = padIndex ?? (refs[1] ? 1 : used[0]);
  if (!refs[pad]) throw new Error(`ultra-h3: padIndex ${pad} không có ảnh`);

  const slots = SLOT_NODES.map((_, i) => refs[i] ?? refs[pad]);
  const padded = SLOT_NODES.map((_, i) => i).filter((i) => !refs[i]);

  let finalPrompt = prompt.trim();
  if (padded.length) {
    const list = padded.map((i) => `<Picture ${i + 1}>`).join(", ");
    const note = `${list} ${padded.length > 1 ? "are exact duplicates" : "is an exact duplicate"} of <Picture ${pad + 1}>; treat ${padded.length > 1 ? "them" : "it"} only as extra reference for that same image, not as new people, objects or places.`;
    // padNoteAnchor: chèn ghi chú vào cuối dòng đầu tiên chứa chuỗi này (vd "<Subject 3>" trong subject_definitions)
    const lines = finalPrompt.split("\n");
    const at = padNoteAnchor ? lines.findIndex((l) => l.includes(padNoteAnchor)) : -1;
    if (at >= 0) { lines[at] = `${lines[at].trimEnd()} ${note}`; finalPrompt = lines.join("\n"); }
    else finalPrompt += `\n${note}`;
  }

  const nodeInfoList = SLOT_NODES.map((nodeId, i) => ({ nodeId, fieldName: "image", fieldValue: slots[i] }));
  nodeInfoList.push(
    { nodeId: "263", fieldName: "text", fieldValue: finalPrompt },
    { nodeId: "259", fieldName: "value", fieldValue: String(duration) },
    { nodeId: "332", fieldName: "steps", fieldValue: String(steps) },
    { nodeId: "256", fieldName: "noise_seed", fieldValue: String(seed ?? Math.floor(Math.random() * 1e12)) },
    { nodeId: "252", fieldName: "aspect_ratio", fieldValue: aspectValue },
  );
  if (audios.length && !audioOn) throw new Error("ultra-h3: có audio nhưng workflow chưa bật ô audio (48/14/15)");
  if (audioOn) {
    if (audios.length > AUDIO_NODES.length) throw new Error(`ultra-h3: ${audios.length} audio > ${AUDIO_NODES.length} ô`);
    if (audios.length < AUDIO_NODES.length && !silence) throw new Error("ultra-h3: thiếu file im lặng để lấp ô audio trống");
    AUDIO_NODES.forEach((nodeId, i) => nodeInfoList.push({ nodeId, fieldName: "audio", fieldValue: audios[i] ?? silence }));
  }
  return { nodeInfoList, prompt: finalPrompt, slots };
}

/**
 * Đọc bản API của workflow đang lưu trên RunningHub (không tốn coin) và kiểm tra:
 * đủ 9 LoadImage đúng slot, có node 252, không còn video/audio rỗng, tổng input ≤ 12.
 * Ném lỗi kèm hướng dẫn sửa nếu không đạt.
 */
export async function preflightUltra(apiKey, workflowId = WF_ULTRA, { audio = false } = {}) {
  // audio=true: task này có audio → bắt buộc workflow bật đủ 3 ô audio.
  const res = await fetch(BASE + "/api/openapi/getJsonApiFormat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ apiKey, workflowId }),
  });
  const j = await res.json();
  if (j?.code !== 0 || !j?.data?.prompt) throw new Error(`preflight: không đọc được workflow — ${JSON.stringify(j).slice(0, 200)}`);
  const g = JSON.parse(j.data.prompt);

  const problems = [];
  for (const id of SLOT_NODES) {
    if (g[id]?.class_type !== "LoadImage") problems.push(`node ${id} không phải LoadImage đang bật (có thể bị bypass)`);
  }
  const r2v = Object.values(g).find((n) => n.class_type === "MiniMaxH3ReferenceToVideo")?.inputs ?? {};
  SLOT_NODES.forEach((id, i) => {
    const src = r2v[`ref_images.ref_image_${i}`]?.[0];
    if (g[id]?.class_type === "LoadImage" && String(src) !== id) problems.push(`ref_image_${i} đang nối từ node ${src ?? "(trống)"}, phải là ${id}`);
  });
  if (g["252"]?.class_type !== "ResolutionSelector") problems.push("thiếu node 252 ResolutionSelector");
  for (const id of ["263", "259", "332", "256"]) if (!g[id]) problems.push(`thiếu node ${id}`);

  const audioOnNodes = AUDIO_NODES.filter((id) => g[id]?.class_type === "LoadAudio");
  const hasAudio = audioOnNodes.length === AUDIO_NODES.length;
  if (audioOnNodes.length && !hasAudio) problems.push(`chỉ bật ${audioOnNodes.join(", ")} — ô audio phải bật đủ cả 48, 14, 15 hoặc tắt cả 3`);
  if (audio && !audioOnNodes.length) problems.push("task có audio nhưng workflow đang tắt ô audio 48/14/15");
  if (hasAudio) {
    AUDIO_NODES.forEach((id, i) => {
      if (String(r2v[`ref_audios.ref_audio_${i}`]?.[0]) !== id) problems.push(`ref_audio_${i} phải nối từ node ${id}`);
    });
  }

  const inputs = Object.entries(g).filter(([, n]) => ["LoadImage", "VHS_LoadVideo", "LoadAudio"].includes(n.class_type));
  const emptyMedia = inputs.filter(([, n]) =>
    (n.class_type === "VHS_LoadVideo" && !n.inputs?.video) || (n.class_type === "LoadAudio" && (!n.inputs?.audio || n.inputs.audio === "None")),
  ).filter(([id]) => !(hasAudio && AUDIO_NODES.includes(id))); // ô audio bật đủ: luôn được ghi đè khi gửi (audio thật hoặc im lặng)
  if (emptyMedia.length) problems.push(`node video/audio rỗng đang bật: ${emptyMedia.map(([id]) => id).join(", ")}`);
  if (inputs.length > MAX_INPUTS) problems.push(`${inputs.length} input đang bật > giới hạn ${MAX_INPUTS}`);

  if (problems.length) {
    const fixes = [];
    const offSlots = SLOT_NODES.filter((id) => g[id]?.class_type !== "LoadImage");
    if (offSlots.length) fixes.push(`bật lại (Ctrl+B / Mode → Always) LoadImage ${offSlots.join(", ")} và nối đúng ref_image slot`);
    if (emptyMedia.length || inputs.length > MAX_INPUTS) fixes.push(`bypass (Ctrl+B) node video/audio ${emptyMedia.map(([id]) => id).join(", ") || "đang thừa"}`);
    fixes.push("Save — hoặc import nguyên tools/runninghub/workflows/WF_Ultra_Speed_Singularity_Minimax_AUDIO.json (9 ảnh + 3 audio bật) rồi Save, lấy workflow ID mới ghi vào runninghub-accounts.json");
    throw new Error("preflight Ultra H3 KHÔNG ĐẠT:\n - " + problems.join("\n - ") + "\nSửa trên web: " + fixes.join(" → "));
  }
  return { nodes: Object.keys(g).length, inputs: inputs.length, hasAudio, savedAspect: g["252"].inputs?.aspect_ratio };
}
