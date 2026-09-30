#!/usr/bin/env node
/**
 * check.mjs — kiểm từng tài khoản RunningHub trong runninghub-accounts.json (0 coin, chỉ đọc):
 * coin còn lại, số task đang chạy trên máy chủ, workflow Ultra có đúng cấu trúc 9 ảnh + 3 audio không.
 *
 *   node tools/runninghub/check.mjs [--accounts tk1,tk2]
 * Không bao giờ in key.
 */
import { loadAccounts, accountStatus, clean } from "./lib/accounts.mjs";
import { preflightUltra } from "./lib/ultra-h3.mjs";

const i = process.argv.indexOf("--accounts");
const accounts = loadAccounts({ only: i > 0 ? process.argv[i + 1].split(",") : undefined });
let ok = 0, cap = 0, coins = 0;
for (const a of accounts) {
  const parts = [`${a.name}: tối đa ${a.maxConcurrent} luồng`];
  let good = true;
  try { const s = await accountStatus(a.apiKey); parts.push(`coin ${s.remainCoins} + $${s.remainMoney} (~${Math.floor((s.remainCoins || 0) / 230) + Math.floor((s.remainMoney || 0) / 0.13)} clip, ${s.apiType})`, `đang chạy ${s.running}`); coins += s.remainCoins || 0; }
  catch (e) { parts.push(`KHÔNG đọc được trạng thái (${e.message})`); good = false; }
  try { const pf = await preflightUltra(a.apiKey, a.ultraWorkflowId); parts.push(`workflow ${a.ultraWorkflowId} OK (${pf.inputs} input, audio ${pf.hasAudio ? "bật" : "tắt"})`); }
  catch (e) { parts.push(`WORKFLOW LỖI: ${e.message.split("\n")[0]}`); good = false; }
  console.log(clean(parts.join(" · ")));
  if (good) { ok++; cap += a.maxConcurrent; }
}
console.log(`\n${ok}/${accounts.length} tài khoản dùng được · tổng ${cap} luồng · tổng coin ${coins}`);
process.exit(ok === accounts.length ? 0 : 1);
