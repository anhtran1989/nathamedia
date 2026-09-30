"""Gửi video lớn (tới 2 GB) bằng chính bot Telegram qua MTProto (Telethon), không nén, không cắt.

Bot API thường (api.telegram.org) chỉ cho bot gửi file ≤ 50 MB; đi MTProto thì bot gửi được tới 2 GB.
Cần thêm vào telegram.json (gitignored) hai trường người dùng tự lấy ở https://my.telegram.org → API development tools:
    "apiId": 1234567, "apiHash": "..."
Phiên đăng nhập bot lưu ở .telegram/bot.session (gitignored). Không bao giờ in token, apiHash.

    python -X utf8 tools/tg_big.py <file.mp4> ["chú thích"]
telegram.mjs tự gọi file này khi video > 45 MB và telegram.json có apiId, apiHash.
"""
import asyncio, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = os.path.join(ROOT, "telegram.json")
SESS = os.path.join(ROOT, ".telegram", "bot")


def probe(path):
    """(giây, rộng, cao) để Telegram phát được ngay trong chat thay vì hiện như file tải về."""
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                            "-of", "json", path], capture_output=True, text=True)
        j = json.loads(r.stdout); s = j["streams"][0]
        return int(float(j["format"]["duration"])), int(s["width"]), int(s["height"])
    except Exception:
        return 0, 0, 0


async def main(path, caption):
    from telethon import TelegramClient, events
    from telethon.tl.types import DocumentAttributeVideo, InputPeerUser
    c = json.load(open(CFG, encoding="utf-8"))
    if not c.get("apiId") or not c.get("apiHash"):
        sys.exit("telegram.json chưa có apiId, apiHash (lấy ở https://my.telegram.org → API development tools)")
    os.makedirs(os.path.dirname(SESS), exist_ok=True)
    client = TelegramClient(SESS, int(c["apiId"]), c["apiHash"])
    await client.start(bot_token=c["botToken"])
    chat = int(c["chatId"])
    try:
        peer = await client.get_input_entity(chat)
    except Exception:
        peer = InputPeerUser(chat, 0)  # bot thường được dùng access_hash 0 với người đã nhắn cho bot
    dur, w, h = probe(path)
    attrs = [DocumentAttributeVideo(duration=dur, w=w, h=h, supports_streaming=True)] if w else None
    last = [-1]

    def prog(sent, total):
        p = int(sent * 10 / total)
        if p != last[0]: last[0] = p; print(f"  tải lên {p * 10}%", flush=True)

    async def send(to):
        return await client.send_file(to, path, caption=caption[:1000], supports_streaming=True, attributes=attrs, progress_callback=prog)

    try:
        await send(peer)
    except Exception as e:
        # Bot chưa biết người nhận trong phiên MTProto: chờ người dùng nhắn một tin bất kỳ cho bot (chỉ cần một lần, phiên lưu lại).
        print(f"chưa gửi được ({type(e).__name__}); hãy nhắn một tin bất kỳ cho bot trong 180 giây…", flush=True)
        got = asyncio.get_running_loop().create_future()
        client.add_event_handler(lambda ev: got.done() or got.set_result(ev.chat_id), events.NewMessage(chats=chat))
        await asyncio.wait_for(got, 180)
        await send(await client.get_input_entity(chat))
    await client.disconnect()
    print(f"đã gửi {os.path.basename(path)} ({os.path.getsize(path) / 1048576:.0f} MB, nguyên bản)")


if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    try:
        asyncio.run(main(sys.argv[1], " ".join(sys.argv[2:])))
    except SystemExit: raise
    except Exception as e:
        sys.exit(f"LỖI Telegram MTProto: {type(e).__name__}: {str(e).replace(json.load(open(CFG, encoding='utf-8')).get('botToken', '#'), 'bot***')}")
