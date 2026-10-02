// Lấy lại video của task đã tạo nhưng bị mất kết nối khi hỏi trạng thái (mạng tới runninghub.ai chập chờn).
//   node tools/runninghub/lay-lai.mjs <taskId> <tên tài khoản> <file .mp4 ra>
// Chỉ hỏi trạng thái và tải về bằng đúng tài khoản đã tạo task; không tạo task mới, không tốn coin.
import fs from "node:fs";
import { BASE, getAccount, clean } from "./lib/accounts.mjs";

const [taskId, accName, out] = process.argv.slice(2);
if (!taskId || !accName || !out) { console.error("dùng: node tools/runninghub/lay-lai.mjs <taskId> <tài khoản> <out.mp4>"); process.exit(1); }
const key = getAccount(accName).apiKey;
const afetch = async (u, o = {}) => { for (let a = 1; ; a++) { try { return await fetch(u, { ...o, signal: AbortSignal.timeout(30000) }); } catch (e) { if (a >= 6) throw e; await new Promise((r) => setTimeout(r, 10000 * a)); } } };
const post = (ep, body) => afetch(BASE + ep, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ apiKey: key, ...body }) }).then((r) => r.json());
const d = (await post("/task/openapi/status", { taskId }))?.data;
const st = typeof d === "string" ? d : String(d?.taskStatus ?? "UNKNOWN");
console.log(taskId, "trạng thái:", st);
if (st !== "SUCCESS") process.exit(st === "FAILED" ? 2 : 3);
const j = await post("/task/openapi/outputs", { taskId });
const arr = Array.isArray(j?.data) ? j.data : (j?.data?.outputs ?? []);
const v = arr.find((x) => /\.mp4/i.test(x.fileUrl ?? "")) ?? arr[0];
if (!v?.fileUrl) { console.log(clean("không có file ra: " + JSON.stringify(j).slice(0, 300))); process.exit(4); }
const res = await afetch(v.fileUrl);
fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
console.log("đã tải", out, fs.statSync(out).size, "byte", v.consumeCoins ? `· ${v.consumeCoins} coin` : "");
