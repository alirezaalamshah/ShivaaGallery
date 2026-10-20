"""Builds the store's two story-style promo videos, both played on an iPhone 18 Pro Max.

It records the real site on a phone-sized screen, then hands the recordings to stage.py,
which puts them in the phone, types the story under it and renders vertical 1080×1920 MP4s:

    شیوا گالری - سایت.mp4         a customer finds, buys and tracks a dress
    شیوا گالری - پنل مدیریت.mp4    the shop owner runs the store from the phone

Needs the backend on :8000 and the storefront on :3100 (a production build records best):

    tools\\promo\\.venv\\Scripts\\python tools\\promo\\promo.py --out "%USERPROFILE%\\Desktop"

Nothing is saved on the site: the panel scenes type into forms but never press save.
"""
import argparse
import asyncio
import base64
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

from playwright.async_api import Page, async_playwright

import sound
import stage

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(__file__).resolve().parent / "out"
SITE = os.environ.get("PROMO_SITE", "http://localhost:3100")

# The phone's screen in CSS pixels: an iPhone Pro Max is 440×956; the status bar and
# the home-indicator strip are drawn by the stage, the page gets the rest.
SCREEN = {"width": 440, "height": stage.WEB_H}
DPR = 2
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"

OVERLAY_JS = """
(() => {
  const css = `
    nextjs-portal { display: none !important; }
    * { -webkit-tap-highlight-color: transparent !important; }
    .__tap { position: fixed; z-index: 2147483647; pointer-events: none; width: 54px; height: 54px; margin: -27px 0 0 -27px;
      border-radius: 50%; background: rgba(201,162,76,.38); border: 2.5px solid rgba(255,255,255,.95);
      box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 8px 22px rgba(0,0,0,.28); animation: __tap .65s ease-out forwards; }
    @keyframes __tap { 0% { transform: scale(.35); opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }`;
  const ready = () => {
    const st = document.createElement("style");
    st.textContent = css;
    document.documentElement.appendChild(st);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", ready); else ready();
  addEventListener("pointerdown", (e) => {
    const d = document.createElement("div");
    d.className = "__tap";
    d.style.left = e.clientX + "px";
    d.style.top = e.clientY + "px";
    document.documentElement.appendChild(d);
    setTimeout(() => d.remove(), 800);
  }, true);
})();
"""


# ---------------------------------------------------------------- sessions

def django(code: str) -> str:
    backend = ROOT / "backend"
    py = backend / ".venv/Scripts/python.exe"
    if not py.exists():
        py = backend / ".venv/bin/python"
    out = subprocess.run([str(py), "manage.py", "shell", "-c", code], cwd=backend, capture_output=True, text=True, encoding="utf-8", check=True)
    return out.stdout


def open_sessions() -> dict:
    """Signs in the first staff user and the first customer, without codes or passwords."""
    code = (
        "import json\n"
        "from django.test import Client\n"
        "from django.contrib.auth import get_user_model\n"
        "U = get_user_model()\n"
        "out = {}\n"
        "for k, q in (('staff', {'is_staff': True}), ('customer', {'is_staff': False})):\n"
        "    c = Client(); c.force_login(U.objects.filter(is_active=True, **q).order_by('id').first())\n"
        "    out[k] = c.cookies['sessionid'].value\n"
        "print('SESSIONS' + json.dumps(out))\n"
    )
    line = next(l for l in django(code).splitlines() if l.startswith("SESSIONS"))
    return json.loads(line[len("SESSIONS"):])


def close_sessions(keys):
    django(f"from django.contrib.sessions.models import Session; Session.objects.filter(session_key__in={list(keys)!r}).delete()")


# ---------------------------------------------------------------- recording

class Clip:
    """Records a page through the DevTools screencast: sharp JPEG frames with their real timing.

    While it runs, say() drops a story line at the current moment and taps are noted for the sound track,
    so the captions and clicks land exactly on the action.
    """

    current: "Clip | None" = None

    def __init__(self, page: Page, name: str):
        self.page, self.name = page, name
        self.dir = WORK / "clips" / name
        self.frames, self.lines, self.taps = [], [], []

    async def __aenter__(self):
        shutil.rmtree(self.dir, ignore_errors=True)
        self.dir.mkdir(parents=True)
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.cdp.on("Page.screencastFrame", self._frame)
        w, h = SCREEN["width"] * DPR, SCREEN["height"] * DPR
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": w, "maxHeight": h, "everyNthFrame": 1})
        await asyncio.sleep(0.4)
        Clip.current = self
        return self

    def _frame(self, ev):
        path = self.dir / f"{len(self.frames):05d}.jpg"
        path.write_bytes(base64.b64decode(ev["data"]))
        self.frames.append((path.name, ev["metadata"]["timestamp"]))
        asyncio.ensure_future(self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]}))

    def _now(self) -> float:
        return time.time() - (self.frames[0][1] if self.frames else time.time())

    def say(self, text: str):
        self.lines.append([round(self._now(), 3), text])

    def tap(self):
        self.taps.append(round(self._now(), 3))

    async def __aexit__(self, *exc):
        Clip.current = None
        end = time.time()
        await self.cdp.send("Page.stopScreencast")
        await self.cdp.detach()
        if exc[0] or not self.frames:
            return False
        t0 = self.frames[0][1]
        info = {
            "frames": [[name, round(ts - t0, 4)] for name, ts in self.frames],
            "length": round(end - t0, 3),
            "lines": self.lines,
            "taps": self.taps,
        }
        (self.dir / "clip.json").write_text(json.dumps(info, ensure_ascii=False), encoding="utf-8")
        print(f"  recorded {self.name}: {info['length']:.1f}s, {len(self.frames)} frames")
        return False


def say(text: str):
    Clip.current.say(text)


async def pause(s):
    await asyncio.sleep(s)


async def settle(page: Page):
    """Waits for the page to stop loading, without hanging on pages that keep polling."""
    try:
        await page.wait_for_load_state("networkidle", timeout=6000)
    except Exception:
        pass


async def go(page: Page, path: str):
    await page.goto(SITE + path, wait_until="load")
    await settle(page)
    await page.evaluate("document.fonts.ready")
    await pause(0.6)


async def scroll_by(page: Page, dy: int, ms: int = 1400):
    """Eased scrolling, the way a person flicks through a page."""
    await page.evaluate(
        """([dy, ms]) => new Promise((done) => {
          const y0 = scrollY, t0 = performance.now();
          const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
          const step = (now) => {
            const t = Math.min(1, (now - t0) / ms);
            scrollTo(0, y0 + dy * ease(t));
            t < 1 ? requestAnimationFrame(step) : done();
          };
          requestAnimationFrame(step);
        })""",
        [dy, ms],
    )


async def bring(page: Page, locator, ms=1000):
    """Scrolls an element to the middle of the screen."""
    box = await locator.bounding_box()
    vh = page.viewport_size["height"]
    if box and not (vh * 0.2 < box["y"] < vh * 0.7):
        await scroll_by(page, int(box["y"] - vh * 0.4), ms)
        await pause(0.25)


async def tap(page: Page, locator, scroll=True):
    locator = locator.first
    if scroll:
        await bring(page, locator)
    if Clip.current:
        Clip.current.tap()
    await locator.tap()
    await pause(0.35)


async def type_in(page: Page, locator, text: str):
    await tap(page, locator)
    await locator.first.press_sequentially(text, delay=95)
    await pause(0.3)


async def phone(browser, session: str):
    ctx = await browser.new_context(
        viewport=SCREEN, device_scale_factor=DPR, is_mobile=True, has_touch=True, locale="fa-IR", user_agent=UA,
    )
    await ctx.add_cookies([{"name": "sessionid", "value": session, "url": SITE, "httpOnly": True, "sameSite": "Lax"}])
    await ctx.add_init_script(OVERLAY_JS)
    return ctx, await ctx.new_page()


async def record_store(browser, session: str, only=None):
    ctx, page = await phone(browser, session)
    want = lambda n: not only or n in only  # noqa: E731

    if want("home"):
        await go(page, "/")
        async with Clip(page, "home"):
            await pause(0.3)
            say("شیوا گالری را باز می‌کند؛ همان مغازه‌ی چهل‌ساله‌ی دزفول، حالا در گوشی‌اش.")
            await pause(3.4)
            await scroll_by(page, 640, 1500)
            say("مدل‌های تازه، حراجی‌ها و دسته‌ها، همه در یک نگاه.")
            await pause(1.0)
            for _ in range(3):
                await scroll_by(page, 620, 1500)
                await pause(0.9)

    if want("filter"):
        await go(page, "/shop")
        async with Clip(page, "filter"):
            await pause(0.4)
            say("دنبال رنگ و سایز خودش است.")
            await pause(1.0)
            await tap(page, page.locator('button[aria-controls="filters"]'))
            await pause(0.8)
            await tap(page, page.locator("#filters fieldset").nth(1).locator("button").nth(1))
            await pause(0.5)
            await tap(page, page.locator('#filters button[type="submit"]'))
            say("یک لمس، و فقط همان‌هایی می‌مانند که به کارش می‌آیند.")
            await settle(page)
            await pause(1.4)
            await scroll_by(page, 420, 1300)
            await pause(1.6)

    if want("colors"):
        await go(page, "/c/" + "شلوار")
        card = page.locator("article", has=page.locator('a[href*="راسته"]'))
        async with Clip(page, "colors"):
            await pause(0.4)
            say("این شلوار، به چه رنگی؟")
            await pause(0.6)
            for name in ("کرم", "مشکی", "کرم"):
                await tap(page, card.locator(f'button[aria-label="{name}"]'), scroll=False)
                await pause(1.3)
            say("هر رنگی را لمس کند، عکس همان رنگ را می‌بیند.")
            await tap(page, card.locator("a").first, scroll=False)
            await settle(page)
            await pause(1.4)
            await tap(page, page.locator('[role="radiogroup"][aria-label="رنگ"] button[aria-label="مشکی"]'))
            await pause(2.2)

    if want("product") or want("cart") or want("checkout"):
        await go(page, "/p/" + "مانتو-اداری-بلند-نسیم")
    if want("product"):
        async with Clip(page, "product"):
            await pause(0.3)
            say("دلش پیش این مانتو می‌ماند. عکس‌ها را ورق می‌زند…")
            await pause(4.6)  # one automatic slide
            await scroll_by(page, 330, 1200)
            await pause(0.4)
            say("و سایزش را با جدول سانتی‌متری پیدا می‌کند؛ بدون حدس.")
            await tap(page, page.locator('[role="radiogroup"][aria-label="سایز"] button:not([aria-label*="ناموجود"])').nth(1))
            await pause(0.8)
            await tap(page, page.locator('button[aria-controls="guide"]'))
            await pause(0.8)
            await scroll_by(page, 300, 1100)
            await pause(2.2)

    if want("cart") or want("checkout"):
        if not want("product"):
            await tap(page, page.locator('[role="radiogroup"][aria-label="سایز"] button:not([aria-label*="ناموجود"])').nth(1))
    if want("cart"):
        async with Clip(page, "cart"):
            await pause(0.4)
            say("همین است. یک لمس، و به سبد رفت.")
            await pause(0.8)
            await tap(page, page.get_by_role("button", name="افزودن به سبد"))
            await pause(1.8)
            await tap(page, page.locator('nav[aria-label="ناوبری پایین"] a[href="/cart"]'))
            await settle(page)
            await pause(1.0)
            say("یکی هم برای خواهرش.")
            await pause(0.9)
            await tap(page, page.locator('button[aria-label="یکی بیشتر"]'))
            await pause(1.8)

    if want("checkout"):
        if not want("cart"):
            await tap(page, page.get_by_role("button", name="افزودن به سبد"))
            await pause(2)  # the item lands in the cart when its fly-in animation ends
            await go(page, "/cart")
        async with Clip(page, "checkout"):
            await pause(0.4)
            say("ورود با کد پیامکی؛ بدون رمز و بدون دردسر.")
            await tap(page, page.locator('a[href="/checkout"]'))
            await settle(page)
            await pause(2.4)
            await scroll_by(page, 330, 1400)
            say("آدرس، روش ارسال و کد تخفیف، همه در یک صفحه.")
            await pause(0.8)
            ship = page.locator('label:has(input[name="shipping"]:not([disabled]))')
            if await ship.count():
                await tap(page, ship.nth(min(1, await ship.count() - 1)))
            await pause(0.8)
            await scroll_by(page, 260, 1300)
            await pause(2.2)

    if want("track"):
        await go(page, "/track")
        async with Clip(page, "track"):
            await pause(0.4)
            say("فردا صبح: سفارشم کجاست؟")
            await pause(0.8)
            await type_in(page, page.locator("#track-number"), "305896")
            say("فقط شماره‌ی سفارش و موبایل؛ بدون ورود.")
            await type_in(page, page.locator("#track-phone"), "09121234567")
            await tap(page, page.locator('button[type="submit"]'))
            await settle(page)
            await pause(1.6)
            await scroll_by(page, 300, 1300)
            await pause(2.0)

    await ctx.close()


async def record_panel(browser, session: str, only=None):
    ctx, page = await phone(browser, session)
    want = lambda n: not only or n in only  # noqa: E731

    async def nav(href: str):
        """Slides the menu row to the item first, the way a thumb would, then taps it."""
        item = page.locator(f'aside a[href="{href}"]').first
        await item.evaluate("el => el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })")
        await pause(0.7)
        await tap(page, item, scroll=False)

    if want("dashboard"):
        await go(page, "/panel")
        async with Clip(page, "dashboard"):
            await pause(0.4)
            say("صبح، با یک چای: فروش هفته و سفارش‌های باز، روی گوشی.")
            await pause(3.2)
            await scroll_by(page, 520, 1600)
            say("و رنگ و سایزهایی که تمام شده‌اند، پیش از آنکه مشتری سراغشان را بگیرد.")
            await pause(1.6)
            await scroll_by(page, 360, 1300)
            await pause(2.0)

    if want("orders"):
        await go(page, "/panel")
        async with Clip(page, "orders"):
            await pause(0.4)
            say("سفارش مریم رسیده.")
            await nav("/panel/orders")
            await page.locator("tbody tr").first.wait_for()  # the panel keeps polling, so it never goes network-idle
            await pause(1.4)
            await tap(page, page.locator("tbody tr").first)
            await page.get_by_text("مشتری و تحویل").wait_for()
            await pause(1.4)
            await scroll_by(page, 560, 1500)
            say("بسته‌بندی می‌شود، کد رهگیری می‌گیرد و مریم خودش پیگیری می‌کند.")
            await pause(0.5)
            await type_in(page, page.get_by_placeholder("مثلاً کد پست یا تیپاکس"), "9384 6120 5571")
            await pause(2.0)

    if want("editor"):
        await go(page, "/panel/products")
        async with Clip(page, "editor"):
            await pause(0.4)
            say("شلوار راسته حراج بخورد؟")
            await pause(0.6)
            await tap(page, page.locator("tr", has_text="راسته"))
            await settle(page)
            await pause(1.0)
            await bring(page, page.get_by_text("قیمت هر رنگ و سایز (تومان)"), 1500)
            say("قیمت و حراج هر رنگ و سایز، جدا از هم.")
            await pause(0.8)
            await type_in(page, page.locator("#p-bulk-price"), "1890000")
            await tap(page, page.get_by_role("button", name="اعمال روی همه").first, scroll=False)
            await pause(1.0)
            await type_in(page, page.locator("#p-bulk-sale"), "1590000")
            await tap(page, page.get_by_role("button", name="اعمال روی همه").nth(1), scroll=False)
            await pause(2.2)

    if want("inventory"):
        await go(page, "/panel")
        async with Clip(page, "inventory"):
            await pause(0.4)
            say("هر ورود و خروج انبار، با دلیلش ثبت می‌شود.")
            await nav("/panel/inventory")
            await settle(page)
            await pause(1.8)
            say("سبز برای ورود کالا، قرمز برای خروج.")
            await scroll_by(page, 420, 1500)
            await pause(1.2)
            await scroll_by(page, 420, 1500)
            await pause(1.6)

    if want("settings"):
        await go(page, "/panel")
        async with Clip(page, "settings"):
            await pause(0.4)
            say("رنگ‌ها، لوگو، ارسال و مرجوعی را خودمان تنظیم می‌کنیم.")
            await nav("/panel/settings")
            await settle(page)
            await pause(1.4)
            await scroll_by(page, 700, 1800)
            await pause(0.8)
            say("کد تخفیف برای عید؟ چند ثانیه کار است.")
            await nav("/panel/discounts")
            await settle(page)
            await pause(2.4)

    await ctx.close()


# ---------------------------------------------------------------- main

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=WORK, help="folder for the finished videos")
    ap.add_argument("--music", type=Path, help="a music track to use instead of the built-in one")
    ap.add_argument("--skip-record", action="store_true", help="reuse the last recordings")
    ap.add_argument("--only", nargs="*", help="re-record only these scenes")
    ap.add_argument("--video", choices=[v.key for v in stage.VIDEOS], help="render only this video")
    args = ap.parse_args()
    WORK.mkdir(exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel="chrome", headless=True, args=["--force-color-profile=srgb", "--hide-scrollbars", "--lang=fa-IR"])
        if not args.skip_record:
            keys = open_sessions()
            try:
                print("recording the storefront…")
                await record_store(browser, keys["customer"], args.only)
                print("recording the panel…")
                await record_panel(browser, keys["staff"], args.only)
            finally:
                close_sessions(keys.values())
        await browser.close()

        # file:// pages may read the recorded frames, so the status bar can match each screen's colour
        browser = await pw.chromium.launch(channel="chrome", headless=True, args=["--force-color-profile=srgb", "--allow-file-access-from-files"])
        args.out.mkdir(parents=True, exist_ok=True)
        for video in stage.VIDEOS:
            if args.video and video.key != args.video:
                continue
            print(f"rendering {video.title}…")
            silent = WORK / f"{video.key}.mp4"
            events = await stage.render(browser, video, WORK, silent)
            audio = WORK / f"{video.key}.wav"
            sound.score(events, audio, music_file=args.music)
            out = args.out / f"{video.title}.mp4"
            stage.mux(silent, audio, out)
            print(f"  {out}")
        await browser.close()
    print("done:", args.out)


if __name__ == "__main__":
    asyncio.run(main())
