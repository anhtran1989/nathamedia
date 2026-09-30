/**
 * accounts.mjs — đọc danh sách tài khoản RunningHub cho render nhiều luồng.
 *
 * File cấu hình (GITIGNORED, chứa key thật), tìm theo thứ tự:
 *   1. biến môi trường RUNNINGHUB_ACCOUNTS (đường dẫn file json)
 *   2. <repo>/runninghub-accounts.json
 * Dạng (xem runninghub-accounts.example.json):
 *   { "accounts": [ { "name": "tk1", "apiKey": "...", "ultraWorkflowId": "...", "maxConcurrent": 5, "enabled": true } ] }
 * - ultraWorkflowId: ID workflow Ultra H3 ĐÃ LƯU TRÊN CHÍNH tài khoản đó (import workflows/WF_Ultra_…_AUDIO.json rồi Save).
 * - maxConcurrent: số task tối đa tài khoản đó chạy cùng lúc (gói thường 5).
 * - Ảnh upload thuộc về key đã upload, nên mỗi clip upload + tạo task + hỏi trạng thái + tải về bằng CÙNG một tài khoản.
 * Không bao giờ in key: dùng clean() trước khi in bất kỳ chuỗi nào có thể chứa key.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const STATE_DIR = path.join(REPO, ".runninghub", "state");
export const BASE = "https://www.runninghub.ai";

export function accountsFile() {
  return process.env.RUNNINGHUB_ACCOUNTS || path.join(REPO, "runninghub-accounts.json");
}

/** @returns {{name:string, apiKey:string, ultraWorkflowId:string, maxConcurrent:number}[]} */
export function loadAccounts({ only } = {}) {
  const f = accountsFile();
  if (!fs.existsSync(f)) throw new Error(`Thiếu ${f} — tạo từ runninghub-accounts.example.json`);
  const all = JSON.parse(fs.readFileSync(f, "utf8")).accounts ?? [];
  const list = all
    .filter((a) => a.enabled !== false && (!only || only.includes(a.name)))
    .map((a) => ({ name: String(a.name), apiKey: String(a.apiKey ?? "").trim(), ultraWorkflowId: String(a.ultraWorkflowId ?? "").trim(), maxConcurrent: Number(a.maxConcurrent ?? 5) }));
  const bad = list.filter((a) => !a.apiKey || !a.ultraWorkflowId || !(a.maxConcurrent > 0));
  if (bad.length) throw new Error(`Tài khoản thiếu apiKey / ultraWorkflowId / maxConcurrent: ${bad.map((a) => a.name).join(", ")}`);
  if (!list.length) throw new Error(`Không có tài khoản nào đang bật trong ${f}${only ? ` (lọc: ${only.join(",")})` : ""}`);
  return list;
}

export function getAccount(name) {
  const a = loadAccounts().find((x) => x.name === name);
  if (!a) throw new Error(`Không thấy tài khoản "${name}" (hoặc đang tắt) trong ${accountsFile()}`);
  return a;
}

/** Xoá mọi key khỏi chuỗi trước khi in. */
export function clean(s) {
  let out = String(s);
  try { for (const a of loadAccounts()) if (a.apiKey) out = out.replaceAll(a.apiKey, "***KEY***"); } catch {}
  return out;
}

/** Trạng thái tài khoản (chỉ đọc, không tốn coin): số coin còn, số task đang chạy. */
export async function accountStatus(apiKey) {
  const res = await fetch(BASE + "/uc/openapi/accountStatus", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ apikey: apiKey, apiKey }),
  });
  const j = await res.json().catch(() => ({}));
  if (j?.code !== 0 || !j?.data) throw new Error(`accountStatus: ${JSON.stringify(j).slice(0, 160)}`);
  // Tài khoản SHARED trả phí bằng tiền (remainMoney, USD, ~0,125/clip 10 s); ô remainCoins của nó đứng yên, không phải số dư thật (29/9/2026).
  const apiType = j.data.apiType ?? null;
  const remainMoney = j.data.remainMoney != null ? Number(j.data.remainMoney) : null;
  const remainCoins = j.data.remainCoins != null ? Number(j.data.remainCoins) : null;
  const byMoney = apiType === "SHARED";
  return { remainCoins, remainMoney, currency: j.data.currency ?? "USD", apiType, byMoney,
           balance: byMoney ? remainMoney : remainCoins, unit: byMoney ? "USD" : "coin", running: Number(j.data.currentTaskCounts ?? 0) };
}
