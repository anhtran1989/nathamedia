#!/usr/bin/env node
/**
 * ultra-batch.mjs — chạy các lô "YÊU CẦU RENDER ULTRA H3" (file .md do tools/build_h3_prompts.py sinh ra)
 * trên NHIỀU tài khoản RunningHub cùng lúc. (chuyển từ D:\MCP-RunningHub\scripts\ultra-batch.mjs, 27/9/2026)
 *
 *   node tools/runninghub/ultra-batch.mjs <yeu-cau.md> [yeu-cau-2.md ...] [--only C1-D2,C1-D5] [--accounts tk1,tk2]
 *        [--width N] [--retry-oom] [--dry]
 *
 * - Tài khoản đọc từ runninghub-accounts.json (lib/accounts.mjs). Mỗi tài khoản chạy tối đa maxConcurrent task;
 *   tổng luồng = tổng maxConcurrent (hoặc --width nếu nhỏ hơn). Clip tới lượt giao cho tài khoản còn nhiều chỗ trống nhất.
 * - Đếm task đang chạy của từng tài khoản trong MỌI file state (kể cả tiến trình ultra-batch khác) → không vượt giới hạn.
 * - State: <repo>/.runninghub/state/<dự án>__<tên file yêu cầu>.json (tên dự án = thư mục chứa takes/),
 *   nên hai phim dùng cùng tên file yêu cầu không bao giờ đè nhau. Mỗi clip ghi account đã dùng.
 * - Clip đã có taskId (xong hoặc lỗi) KHÔNG bao giờ chạy lại — muốn chạy lại thì tạo đoạn -v2 mới.
 *   not_created (lỗi trước khi tạo task, 0 coin) thì lần chạy sau được gửi lại.
 * - --retry-oom: lỗi GPU hết bộ nhớ (lỗi máy chủ) → tự chạy lại ĐÚNG 1 lần, seed mới.
 * - Dừng: tạo file .runninghub/state/STOP → không đưa thêm clip mới; task đang chạy vẫn chạy xong.
 * - --dry: preflight workflow của từng tài khoản + in payload từng clip (0 coin).
 * - Giữ coin: đầu lô đọc coin còn của từng tài khoản; mỗi clip giao đi giữ trước --coin-clip coin (mặc định 230),
 *   xong thì trả lại phần thừa theo coin thật. Tài khoản không đủ cho một clip thì không nhận clip mới;
 *   mọi tài khoản đều hết coin thì dừng đưa clip và báo số clip chưa gửi.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadAccounts, clean, STATE_DIR, BASE, accountStatus } from "./lib/accounts.mjs";
import { preflightUltra } from "./lib/ultra-h3.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const OPTS_WITH_VALUE = ["--only", "--width", "--accounts", "--coin-clip"];
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const reqFiles = args.filter((a, i) => !a.startsWith("--") && !OPTS_WITH_VALUE.includes(args[i - 1]));
if (!reqFiles.length) { console.error("dùng: node tools/runninghub/ultra-batch.mjs <yeu-cau.md> [...] [--only id,id] [--accounts tk1,tk2] [--width N] [--retry-oom] [--telegram] [--dry]"); process.exit(1); }
const ONLY = opt("--only")?.split(",").map((s) => s.trim());
const DRY = args.includes("--dry");
const RETRY_OOM = args.includes("--retry-oom");
// Telegram (tuỳ chọn): --telegram hoặc telegram.json có "autoSend": true → clip xong/lỗi gửi tin ngắn, cuối lô gửi tổng kết. Lỗi Telegram không chặn render.
const TG_CFG = path.join(HERE, "..", "..", "telegram.json");
const TG = !args.includes("--dry") && (args.includes("--telegram") || (() => { try { return JSON.parse(fs.readFileSync(TG_CFG, "utf8")).autoSend === true; } catch { return false; } })());
const tg = TG ? await import("../telegram.mjs") : null;
const tgSafe = async (fn) => { if (!tg) return; try { await fn(); } catch (e) { console.log("Telegram: " + String(e.message).replace(/bot\d+:[\w-]+/g, "bot***")); } };
const ACCOUNTS = loadAccounts({ only: opt("--accounts")?.split(",").map((s) => s.trim()) });
const CAPACITY = ACCOUNTS.reduce((n, a) => n + a.maxConcurrent, 0);
const WIDTH = Math.min(Number(opt("--width") ?? CAPACITY), CAPACITY);
fs.mkdirSync(STATE_DIR, { recursive: true });
const STOP_FILE = path.join(STATE_DIR, "STOP");
const keyOf = (name) => ACCOUNTS.find((a) => a.name === name)?.apiKey;

/* ---- coin: đọc số dư đầu lô, giữ trước COIN_CLIP cho mỗi clip đang chạy ---- */
const COIN_CLIP = Number(opt("--coin-clip") ?? 230);
const MONEY_CLIP = Number(opt("--money-clip") ?? 0.13); // tài khoản SHARED: giữ trước tiền (USD) mỗi clip
const UNIT = {}, RESERVE = {};
const budget = {}; // số CLIP còn chạy được của từng tài khoản = coin/COIN_CLIP + tiền/MONEY_CLIP (dùng cả RH coin lẫn $; NaN = không đọc được → không chặn)
for (const a of ACCOUNTS) {
  let st = null;
  try { st = await accountStatus(a.apiKey); budget[a.name] = Math.floor((st.remainCoins || 0) / COIN_CLIP) + Math.floor((st.remainMoney || 0) / MONEY_CLIP + 1e-9); } catch { budget[a.name] = NaN; }
  RESERVE[a.name] = 1;
  console.log(`[${a.name}] ${st ? `coin ${st.remainCoins} + $${st.remainMoney}` : "? (không đọc được, không chặn)"} · đủ khoảng ${Number.isNaN(budget[a.name]) ? "?" : budget[a.name]} clip (${COIN_CLIP} coin hoặc $${MONEY_CLIP} mỗi clip)`);
}
const affordable = (a) => !(budget[a.name] < RESERVE[a.name]);
let inflight = 0;

// Gọi lay-lai.mjs: 0 = đã tải, 2 = task FAILED thật, khác = chưa xong / vẫn mất mạng.
const layLai = (task, accName, out) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(HERE, "lay-lai.mjs"), task, accName, out]);
  let s = ""; p.stdout.on("data", (d) => (s += d)); p.stderr.on("data", (d) => (s += d));
  p.on("close", (code) => resolve({ code, coins: s.match(/· (\d+(?:\.\d+)?) coin/)?.[1] ?? null }));
});

async function failReason(taskId, accName) {
  const key = keyOf(accName);
  if (!key || !taskId) return null;
  try {
    const res = await fetch(BASE + "/task/openapi/outputs", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ apiKey: key, taskId }),
    });
    const r = (await res.json())?.data?.failedReason;
    return r ? clean(`${r.exception_type ?? "?"} @ ${r.node_name ?? "?"}: ${String(r.exception_message ?? "").slice(0, 160)}`) : null;
  } catch { return null; }
}

/* ---- đọc file yêu cầu ---- */
const field = (b, k) => b.match(new RegExp(`^${k}:\\s*(.+?)\\s*(?:#.*)?$`, "m"))?.[1];
const list = (b, k) => {
  const m = b.match(new RegExp(`^${k}[^\\n]*:\\s*\\n((?:\\s+\\d+\\.\\s+.+\\n?)+)`, "m"));
  return m ? m[1].split("\n").map((l) => l.match(/^\s+\d+\.\s+(.+?)\s*(?:\(.*\))?\s*$/)?.[1]).filter(Boolean) : [];
};
function parseFile(reqFile) {
  const abs = path.resolve(reqFile);
  const text = fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
  const base = path.basename(abs, ".md");
  // Tên dự án = thư mục chứa takes/ (file yêu cầu có thể nằm ở takes/ hoặc takes/<lô>/; 29/9/2026 sửa: trước đây lấy nhầm tên "takes").
  let dir = path.dirname(abs);
  while (path.basename(dir).toLowerCase() !== "takes" && path.dirname(dir) !== dir) dir = path.dirname(dir);
  if (path.basename(dir).toLowerCase() !== "takes") dir = path.dirname(abs);
  const project = path.basename(path.dirname(dir)).replace(/[^\p{L}\p{N}_.-]+/gu, "-");
  const stem = `${project}__${base}`;
  // chuyển file state tên cũ "takes__<file>.json" sang tên mới, để clip đã gửi không bị gửi lại
  const legacy = path.join(STATE_DIR, `takes__${base}.json`), fresh = path.join(STATE_DIR, stem + ".json");
  if (project !== "takes" && fs.existsSync(legacy) && !fs.existsSync(fresh)) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.renameSync(legacy, fresh); }
  const blocks = text.split(/^(?=YÊU CẦU RENDER ULTRA H3:)/m).filter((b) => b.startsWith("YÊU CẦU RENDER ULTRA H3:"));
  return blocks.map((b) => {
    const out = field(b, "out");
    return {
      id: path.basename(out ?? "", ".mp4"),
      file: base,
      stateFile: path.join(STATE_DIR, stem + ".json"),
      cfgDir: path.join(STATE_DIR, stem + "-cfg"),
      title: b.split("\n")[0].replace("YÊU CẦU RENDER ULTRA H3:", "").trim(),
      cfg: {
        refs: list(b, "refs"), audios: list(b, "audios"), prompt: field(b, "prompt_file"), out,
        aspect: field(b, "aspect"), duration: Number(field(b, "duration") ?? 10), steps: Number(field(b, "steps") ?? 6),
        padIndex: field(b, "padIndex") !== undefined ? Number(field(b, "padIndex")) : undefined,
        padNoteAnchor: field(b, "padNoteAnchor"),
        seed: /^\d+$/.test(field(b, "seed") ?? "") ? field(b, "seed") : String(Math.floor(Math.random() * 1e12)),
        workflowId: field(b, "workflowId"), // tuỳ chọn, ép workflow khác (bình thường để trống: dùng ultraWorkflowId của tài khoản)
      },
    };
  }).filter((c) => !ONLY || ONLY.includes(c.id));
}
const clips = reqFiles.flatMap(parseFile);

/* ---- kiểm tra trước khi chạy bất cứ gì ---- */
const errs = [];
for (const c of clips) {
  const { cfg } = c;
  if (!c.id) errs.push(`[${c.title}] thiếu out`);
  if (!cfg.aspect) errs.push(`[${c.id}] thiếu aspect`);
  if (!cfg.refs.length) errs.push(`[${c.id}] không có refs`);
  for (const f of [...cfg.refs, ...cfg.audios, cfg.prompt]) if (!f || !fs.existsSync(f)) errs.push(`[${c.id}] không thấy file: ${f}`);
  if (cfg.prompt && fs.existsSync(cfg.prompt) && cfg.padNoteAnchor && !fs.readFileSync(cfg.prompt, "utf8").includes(cfg.padNoteAnchor))
    errs.push(`[${c.id}] prompt không có dòng padNoteAnchor "${cfg.padNoteAnchor}"`);
  if (cfg.audios.length === 0) delete cfg.audios;
}
const ids = clips.map((c) => c.id);
const dup = ids.filter((x, k) => ids.indexOf(x) !== k);
if (dup.length) errs.push(`trùng id clip: ${[...new Set(dup)].join(", ")}`);
if (!clips.length) errs.push("không có clip nào (kiểm tra --only)");
if (errs.length) { console.error("Yêu cầu chưa hợp lệ, KHÔNG chạy:\n - " + errs.join("\n - ")); process.exit(1); }

/* ---- state: đọc lại từ đĩa mỗi lần ghi để không đè tiến trình khác ---- */
const readState = (f) => { try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; } catch { return {}; } };
function setState(c, patch) {
  const st = readState(c.stateFile);
  st[c.id] = { ...(st[c.id] ?? {}), ...patch };
  fs.writeFileSync(c.stateFile, JSON.stringify(st, null, 2));
}
function runningByAccount() {
  const n = Object.fromEntries(ACCOUNTS.map((a) => [a.name, 0]));
  for (const f of fs.readdirSync(STATE_DIR)) {
    if (!f.endsWith(".json")) continue;
    for (const v of Object.values(readState(path.join(STATE_DIR, f)))) if (v?.status === "running" && v.account in n) n[v.account]++;
  }
  return n;
}
/** Tài khoản còn nhiều chỗ trống nhất, hoặc null nếu hết chỗ / chạm --width. */
function pickAccount() {
  const run = runningByAccount();
  const total = Object.values(run).reduce((a, b) => a + b, 0);
  if (total >= WIDTH) return null;
  let best = null, bestFree = 0;
  for (const a of ACCOUNTS) { const free = a.maxConcurrent - run[a.name]; if (free > bestFree && affordable(a)) { best = a; bestFree = free; } }
  return best;
}

/* ---- dry: kiểm workflow từng tài khoản trước ---- */
if (DRY) {
  let bad = 0;
  for (const a of ACCOUNTS) {
    try { const pf = await preflightUltra(a.apiKey, a.ultraWorkflowId); console.log(`[${a.name}] preflight OK — workflow ${a.ultraWorkflowId}, ${pf.inputs} input, audio ${pf.hasAudio ? "bật" : "tắt"}, tối đa ${a.maxConcurrent} luồng`); }
    catch (e) { bad++; console.log(clean(`[${a.name}] PREFLIGHT LỖI — ${e.message}`)); }
  }
  if (bad) console.log(`${bad}/${ACCOUNTS.length} tài khoản lỗi preflight — sửa trước khi chạy thật.`);
}

const todo = clips.filter((c) => {
  if (DRY) return true;
  const s = readState(c.stateFile)[c.id];
  if (s?.taskId || s?.status === "running" || s?.status === "done") { console.log(`[${c.id}] đã gửi trước đó (${s.status}${s.account ? ", " + s.account : ""}) — bỏ qua`); return false; }
  return true;
});
console.log(`${todo.length}/${clips.length} clip · ${ACCOUNTS.length} tài khoản (${ACCOUNTS.map((a) => `${a.name}×${a.maxConcurrent}`).join(", ")}) · tối đa ${DRY ? 1 : WIDTH} task cùng lúc${DRY ? " · DRY_RUN" : ""}`);

function runOne(c, acc) {
  fs.mkdirSync(c.cfgDir, { recursive: true });
  const cfgPath = path.join(c.cfgDir, `${c.id}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(c.cfg, null, 2));
  if (!DRY) { setState(c, { status: "running", account: acc.name, seed: c.cfg.seed, out: c.cfg.out, started: new Date().toISOString() }); budget[acc.name] -= RESERVE[acc.name]; inflight++; }
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(HERE, "render-clip.mjs"), cfgPath, "--account", acc.name], { env: { ...process.env, ...(DRY ? { DRY_RUN: "1" } : {}) } });
    let log = "";
    const onData = (d) => { log += d; for (const l of String(d).split("\n")) if (l.trim() && !/Assertion|async.c/.test(l)) console.log(clean(`[${c.id}] ${l}`)); };
    p.stdout.on("data", onData); p.stderr.on("data", onData);
    p.on("close", async (code) => {
      if (DRY) return resolve();
      const task = log.match(/task (\d+)/)?.[1] ?? null;
      let done = log.match(/DONE → .+ · (\S+) (coins|USD) · ([\d.]+) min/);
      let status = code === 0 && done ? "done" : task ? "failed" : "not_created"; // not_created = 0 coin, được gửi lại
      inflight--;
      // Mất mạng sau khi đã tạo task (mã 5 hoặc lỗi fetch): task trên máy chủ vẫn chạy → hỏi lại bằng lay-lai.mjs mỗi phút, tối đa 40 phút (2/10/2026)
      if (status === "failed" && (code === 5 || /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|TimeoutError|aborted/i.test(log))) {
        console.log(`[${c.id}] mất mạng khi theo dõi task ${task}, lấy lại theo mã task (không tạo task mới)`);
        const t1 = Date.now();
        for (let lan = 1; lan <= 40; lan++) {
          const r = await layLai(task, acc.name, c.cfg.out);
          if (r.code === 0) { status = "done"; done = [null, r.coins ?? "?", "coins", ((Date.now() - t1) / 60000).toFixed(1)]; console.log(`[${c.id}] lấy lại được: ${r.coins ?? "?"} coin`); break; }
          if (r.code === 2) { console.log(`[${c.id}] task báo FAILED thật`); break; }
          await new Promise((res) => setTimeout(res, 60000));
        }
      }
            if (status === "not_created") budget[acc.name] += RESERVE[acc.name];                                   // chưa tạo task: không mất coin
      const reason = status === "failed" ? await failReason(task, acc.name) : null;
      const broke = status === "not_created" && /NOT_ENOUGH_BALANCE|"code":605/.test(log);
      if (broke) { budget[acc.name] = 0; console.log(`[${c.id}] ${acc.name} hết tiền thật (605, không tốn gì) → chuyển clip sang tài khoản khác`); }
      if (status === "failed") console.log(`[${c.id}] FAILED task ${task} (${acc.name}) — ${reason ?? "không rõ lý do"}`);
      setState(c, {
        status, taskId: task, coins: done?.[1] ?? null, unit: done?.[2] ?? null, minutes: done?.[3] ?? null,
        error: code === 0 ? null : clean(log.split("\n").filter((l) => l.trim() && !/Assertion|^\s+at /.test(l)).slice(-3).join(" | ")),
        failReason: reason, finished: new Date().toISOString(),
      });
      if (status === "done") await tgSafe(() => tg.tgVideo(c.cfg.out, `✅ ${c.id} xong · ${path.basename(c.file)} · ${done[1]} ${done[2]} · ${done[3]} phút`));
      else await tgSafe(() => tg.tgMessage(`❌ ${c.id} ${status}${reason ? " — " + reason : ""} · ${path.basename(c.file)}`));
      resolve({ status, task, reason, broke });
    });
  });
}

async function runClip(c, acc) {
  let r = await runOne(c, acc);
  while (!DRY && r?.broke) { // tài khoản báo hết tiền: đưa clip sang tài khoản khác, không bỏ clip
    let acc2 = null;
    while (!(acc2 = pickAccount())) {
      if (!ACCOUNTS.some(affordable)) { console.log(`[${c.id}] mọi tài khoản đã hết coin và $ → clip này chưa chạy`); return; }
      await sleep(20000);
    }
    r = await runOne(c, acc2);
  }
  if (DRY || !RETRY_OOM || r?.status !== "failed" || !/OutOfMemory/i.test(r.reason ?? "")) return;
  const first = readState(c.stateFile)[c.id];
  console.log(`[${c.id}] lỗi GPU hết bộ nhớ → chạy lại 1 lần`);
  c.cfg.seed = String(Math.floor(Math.random() * 1e12));
  let acc2 = null;
  while (!(acc2 = pickAccount())) {
    if (!ACCOUNTS.some(affordable)) { console.log(`[${c.id}] không tài khoản nào còn coin hoặc $ để chạy lại`); return; }
    await sleep(20000);
  }
  await runOne(c, acc2);
  setState(c, { attempts: [{ taskId: first.taskId, account: first.account, seed: first.seed, failReason: first.failReason }] });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let next = 0, stopped = false;
async function worker(w) {
  await sleep(w * 1500); // lệch pha để hai worker không chọn cùng một chỗ trống
  while (next < todo.length) {
    let acc = ACCOUNTS[w % ACCOUNTS.length];
    if (!DRY) {
      while (!(acc = pickAccount()) && !fs.existsSync(STOP_FILE)) {
        if (!ACCOUNTS.some(affordable) && inflight === 0) {
          if (!stopped) console.log(`HẾT COIN VÀ $ — mọi tài khoản không đủ cho một clip; ${todo.length - next} clip chưa gửi (nạp rồi chạy lại lệnh, clip đã xong tự bỏ qua)`);
          stopped = true; return;
        }
        await sleep(20000);
      }
      if (fs.existsSync(STOP_FILE)) { if (!stopped) console.log("STOP — không đưa thêm clip mới"); stopped = true; return; }
      if (next >= todo.length) return;
    }
    const c = todo[next++];
    if (DRY) { // mô phỏng chia clip theo coin: chỉ tài khoản còn đủ coin mới nhận
      const ok = ACCOUNTS.filter(affordable);
      if (!ok.length) { console.log(`[${c.id}] DRY: không tài khoản nào còn coin hoặc $ → clip này sẽ không được gửi`); continue; }
      acc = ok[(next - 1) % ok.length]; budget[acc.name] -= RESERVE[acc.name];
    }
    await runClip(c, acc);
  }
}
await Promise.all(Array.from({ length: DRY ? 1 : Math.min(WIDTH, todo.length) }, (_, w) => worker(w)));

if (!DRY) {
  console.log("\n=== KẾT QUẢ ===");
  let coins = 0, money = 0;
  for (const c of clips) {
    const s = readState(c.stateFile)[c.id] ?? {};
    if (s.status === "done") { if (s.unit === "USD") money += Number(s.coins) || 0; else coins += Number(s.coins) || 0; }
    console.log(`${c.file} · ${c.id} | ${s.status ?? "chưa chạy"} | ${s.account ?? "-"} | task ${s.taskId ?? "-"} | ${s.coins ?? "-"} ${s.unit ?? "coins"} | ${s.minutes ?? "-"} min | seed ${s.seed ?? "-"} | ${s.status === "done" ? s.out : s.error ?? ""}`);
  }
  console.log(`Tổng phí các clip xong trong lô: ${coins} coin · $${money.toFixed(3)}`);
  const left = [];
  for (const a of ACCOUNTS) { try { const s = await accountStatus(a.apiKey); left.push(`${a.name.split("@")[0]}: ${s.byMoney ? "$" + s.remainMoney + " (~" + Math.floor(s.remainMoney / MONEY_CLIP) + " clip)" : s.remainCoins + " coin (~" + Math.floor(s.remainCoins / COIN_CLIP) + " clip)"}`); } catch { left.push(`${a.name.split("@")[0]}: ?`); } }
  console.log("Số dư còn: " + left.join(" · "));
  const nDone = clips.filter((c) => readState(c.stateFile)[c.id]?.status === "done").length;
  await tgSafe(() => tg.tgMessage(`🎬 Lô render xong: ${nDone}/${clips.length} clip · phí ${coins} coin + $${money.toFixed(3)}\nSố dư còn:\n${left.join("\n")}\n${reqFiles.map((f) => path.basename(f)).join("\n")}`));
}
