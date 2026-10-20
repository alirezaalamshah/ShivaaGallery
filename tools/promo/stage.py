"""The stage the recordings play on: an iPhone 18 Pro Max over a warm backdrop, with the story typed beneath it.

Every output frame is drawn by the browser from a timeline, so motion is perfectly smooth and the Persian
text is shaped by the browser with the site's own fonts. render() streams the frames straight into ffmpeg.
"""
import base64
import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
FONTS = (ROOT / "frontend/src/app/fonts").as_uri()
LOGO = (ROOT / "backend/media/store/logo.jpg").as_uri()
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

W, H, FPS = 1080, 1920, 30
STATUS_H, HOME_H = 54, 34          # iPhone safe areas, in points
WEB_H = 956 - STATUS_H - HOME_H    # what the recorded page gets of the 440×956 screen

# JPEG frames are full-range; phones and social apps expect TV-range BT.709, or colours shift
ENC = [
    "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", str(FPS),
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
]


@dataclass
class Video:
    key: str
    title: str
    opening: list[str]                  # story lines typed before the phone appears
    scenes: list[tuple[str, str]]       # (recorded clip, chapter name)
    ending: str                         # the last story line
    slogan: str
    gold: list[str] = field(default_factory=list)  # words typed in gold


VIDEOS = [
    Video(
        key="site",
        title="شیوا گالری - سایت",
        opening=["پنج‌شنبه عروسی است…", "و مریم هنوز لباسش را پیدا نکرده."],
        scenes=[
            ("home", "صفحه‌ی اول"),
            ("filter", "فیلتر رنگ و سایز"),
            # ("colors", "هر رنگ، عکس خودش") goes back in once every colour of a product has its own photo
            ("product", "صفحه‌ی محصول"),
            ("cart", "سبد خرید"),
            ("checkout", "تسویه‌حساب"),
            ("track", "پیگیری سفارش"),
        ],
        ending="پنج‌شنبه رسید؛ و مریم، با لباسی که دوستش دارد.",
        slogan="فروشگاه اینترنتی پوشاک زنانه",
        gold=["مریم", "شیوا گالری", "کد پیامکی", "بدون ورود"],
    ),
    Video(
        key="panel",
        title="شیوا گالری - پنل مدیریت",
        opening=["چهل سال است در خیابان شریعتی دزفول لباس می‌فروشیم.", "حالا مغازه‌مان هیچ‌وقت تعطیل نیست."],
        scenes=[
            ("dashboard", "داشبورد فروش"),
            ("orders", "سفارش‌ها"),
            ("editor", "قیمت هر رنگ و سایز"),
            ("inventory", "انبار"),
            ("settings", "تنظیمات و تخفیف"),
        ],
        ending="کرکره پایین است؛ اما فروش ادامه دارد.",
        slogan="پنل مدیریت فروشگاه، همه‌چیز در دست شما",
        gold=["مریم", "چهل سال", "سبز", "قرمز", "کرکره"],
    ),
]

CSS = """
@font-face { font-family: Vazirmatn; font-weight: 100 900; src: url("__FONTS__/vazirmatn-arabic-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0600-06FF, U+200C-200E, U+FB50-FDFF, U+FE70-FEFC; }
@font-face { font-family: Vazirmatn; font-weight: 100 900; src: url("__FONTS__/vazirmatn-latin-wght-normal.woff2") format("woff2-variations"); }
@font-face { font-family: "Reem Kufi"; font-weight: 400 700; src: url("__FONTS__/reem-kufi-arabic-wght-normal.woff2") format("woff2-variations"); unicode-range: U+0600-06FF, U+200C-200E, U+FB50-FDFF, U+FE70-FEFC; }
@font-face { font-family: Italiana; src: url("__FONTS__/italiana-latin-400-normal.woff2") format("woff2"); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1080px; height: 1920px; overflow: hidden; background: #120e0b; }
body { font-family: Vazirmatn, sans-serif; direction: rtl; color: #F7F1E7; -webkit-font-smoothing: antialiased; }
#bg { position: absolute; inset: 0; background: radial-gradient(1100px 900px at 50% 42%, #3a2d22 0%, #1f1813 55%, #110d0a 100%); }
.bokeh { position: absolute; border-radius: 50%; will-change: transform, opacity; }
#spot { position: absolute; left: 90px; top: 260px; width: 900px; height: 1200px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(201,162,76,.30), rgba(201,162,76,.08) 60%, transparent); }
#grain { position: absolute; inset: 0; opacity: .06; background-image: radial-gradient(rgba(255,255,255,.7) 1px, transparent 1px); background-size: 5px 5px; }
#vignette { position: absolute; inset: 0; background: radial-gradient(closest-corner at 50% 45%, transparent 60%, rgba(0,0,0,.55)); }

/* the phone */
#world { position: absolute; inset: 0; perspective: 2600px; perspective-origin: 50% 40%; }
#phone { position: absolute; left: __PX__px; top: __PY__px; width: __PW__px; height: __PH__px; transform-style: preserve-3d; will-change: transform; }
#shadow { position: absolute; left: 160px; width: 760px; height: 120px; top: 1535px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0,0,0,.6), transparent); }
.metal { position: absolute; inset: 0; border-radius: __OR__px;
  background: linear-gradient(135deg, #f3dfb4 0%, #b8955c 18%, #6e5534 35%, #d9bd86 52%, #85663d 70%, #f0d9a8 86%, #8c6c42 100%);
  box-shadow: 0 50px 110px -20px rgba(0,0,0,.8), 0 0 120px rgba(201,162,76,.22); }
.metal::after { content: ""; position: absolute; inset: 2px; border-radius: __OR2__px; box-shadow: inset 0 0 0 1px rgba(255,240,210,.55), inset 0 0 6px rgba(0,0,0,.6); }
.glassrim { position: absolute; inset: __RIM__px; border-radius: __GR__px; background: #050505; }
.btn { position: absolute; width: 6px; border-radius: 3px; background: linear-gradient(90deg, #6e5534, #e6cc96, #85663d); }
#screen { position: absolute; left: __SX__px; top: __SY__px; width: __SW__px; height: __SH__px; border-radius: __SR__px; overflow: hidden; background: #000; }
#web { position: absolute; left: 0; top: __STH__px; width: __SW__px; height: __WH__px; }
#status { position: absolute; left: 0; top: 0; width: 100%; height: __STH__px; }
#homebar { position: absolute; left: 0; bottom: 0; width: 100%; height: __HH__px; }
#homebar i { position: absolute; left: 50%; bottom: 12px; width: 202px; height: 7px; margin-left: -101px; border-radius: 4px; }
#island { position: absolute; left: 50%; top: 16px; width: 139px; height: 48px; margin-left: -69.5px; border-radius: 24px; background: #000; }
#island::after { content: ""; position: absolute; right: 14px; top: 14px; width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle at 40% 40%, #2b3550, #0a0d16 60%); }
#clock { position: absolute; right: 60px; top: 24px; font-size: 25px; font-weight: 700; direction: ltr; }
#icons { position: absolute; left: 48px; top: 27px; display: flex; gap: 9px; align-items: center; direction: ltr; }
#glare { position: absolute; inset: 0; border-radius: __SR__px; pointer-events: none;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,.10) 42%, rgba(255,255,255,.02) 50%, transparent 58%); background-size: 260% 100%; }

/* words */
#chapter { position: absolute; top: 46px; left: 0; width: 100%; display: flex; justify-content: center; align-items: center; gap: 18px; color: #C9A24C; }
#chapter b { font-size: 46px; font-weight: 800; font-feature-settings: "ss01"; }
#chapter span { font-size: 34px; font-weight: 600; color: #F7F1E7; }
#chapter i { width: 54px; height: 2px; background: linear-gradient(90deg, transparent, #C9A24C, transparent); }
.cap { position: absolute; left: 70px; right: 70px; top: 1612px; height: 260px; display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 46px; line-height: 1.6; font-weight: 600; text-shadow: 0 2px 18px rgba(0,0,0,.6); }
.cap p, #story div, #oend { text-wrap: balance; }
.cap .g { color: #E2C27A; }
.caret { display: inline-block; width: 4px; height: 50px; margin-inline-start: 6px; vertical-align: -9px; border-radius: 2px; background: #C9A24C; box-shadow: 0 0 12px rgba(201,162,76,.8); }
#story { position: absolute; left: 80px; right: 80px; top: 0; height: 1920px; display: flex; flex-direction: column; justify-content: center; text-align: center; gap: 34px; }
#story div { font-size: 66px; line-height: 1.55; font-weight: 800; min-height: 103px; text-shadow: 0 4px 30px rgba(0,0,0,.6); }
#story div:nth-child(2) { font-weight: 500; font-size: 56px; color: rgba(247,241,231,.85); }
#story .g { color: #E2C27A; }

/* the closing card */
#outro { position: absolute; inset: 0; }
#outro img { position: absolute; left: 410px; top: 640px; width: 260px; height: 260px; border-radius: 50%; object-fit: cover;
  box-shadow: 0 0 0 3px #C9A24C, 0 0 0 18px rgba(201,162,76,.12), 0 30px 80px rgba(0,0,0,.55); }
#oname { position: absolute; top: 950px; left: 0; width: 100%; text-align: center; font-family: "Reem Kufi", Vazirmatn; font-size: 124px; font-weight: 700; line-height: 1.1; }
#oline { position: absolute; top: 1120px; left: 50%; height: 2px; background: linear-gradient(90deg, transparent, #C9A24C, transparent); }
#oslogan { position: absolute; top: 1160px; left: 0; width: 100%; text-align: center; font-size: 40px; color: rgba(247,241,231,.8); }
#ocredit { position: absolute; top: 1660px; left: 0; width: 100%; text-align: center; font-size: 28px; color: rgba(247,241,231,.55); }
#ocredit b { color: #C9A24C; }
#ocredit span { display: block; margin-top: 8px; direction: ltr; font-family: Italiana, serif; font-size: 32px; letter-spacing: 3px; }
#oend { position: absolute; left: 80px; right: 80px; text-align: center; font-size: 60px; line-height: 1.55; font-weight: 800; text-shadow: 0 4px 30px rgba(0,0,0,.6); }
#oend .g { color: #E2C27A; }
"""

ICONS = """
<svg width="34" height="22" viewBox="0 0 34 22"><g fill="currentColor"><rect x="0" y="14" width="6" height="8" rx="1.5"/><rect x="9" y="10" width="6" height="12" rx="1.5"/><rect x="18" y="5" width="6" height="17" rx="1.5"/><rect x="27" y="0" width="6" height="22" rx="1.5"/></g></svg>
<svg width="30" height="22" viewBox="0 0 30 22"><g fill="currentColor"><path d="M15 21.5 10.6 17a6.3 6.3 0 0 1 8.8 0Z"/><path d="M15 9.2c3.4 0 6.5 1.3 8.8 3.5l-2.4 2.4a9 9 0 0 0-12.8 0l-2.4-2.4A12.5 12.5 0 0 1 15 9.2Z"/><path d="M15 2c5.4 0 10.3 2.1 13.9 5.6l-2.4 2.4a16.3 16.3 0 0 0-23 0L1.1 7.6A19.6 19.6 0 0 1 15 2Z"/></g></svg>
<svg width="46" height="22" viewBox="0 0 46 22"><rect x="1" y="1" width="39" height="20" rx="6" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="2"/><rect x="4" y="4" width="29" height="14" rx="3.5" fill="currentColor"/><path d="M42.5 8v6c1.3-.4 2.2-1.6 2.2-3s-.9-2.6-2.2-3Z" fill="currentColor" fill-opacity=".45"/></svg>
"""

JS = r"""
const C = __CONFIG__;
const FPS = __FPS__, CPS = 21, FADE = 0.45;
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const out = (x) => 1 - Math.pow(1 - clamp(x), 3);
const back = (x) => { x = clamp(x); const c = 1.5; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const fa = (s) => String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
const chars = (s) => Array.from(s);

// ---------------------------------------------------------------- timeline
let T = {}, events = [];

function typingTime(text, cps) { return chars(text).length / cps; }

function goldMask(text) {
  const cs = chars(text), mask = cs.map(() => false), joined = cs.join("");
  for (const w of C.gold) {
    let i = joined.indexOf(w);
    while (i >= 0) {
      const a = chars(joined.slice(0, i)).length, n = chars(w).length;
      for (let k = a; k < a + n; k++) mask[k] = true;
      i = joined.indexOf(w, i + w.length);
    }
  }
  return mask;
}

function html(text, n, caret) {
  const cs = chars(text).slice(0, n), mask = goldMask(text);
  let s = "", cur = null;
  cs.forEach((ch, i) => {
    if (mask[i] !== cur) { if (cur !== null) s += "</span>"; s += `<span class="${mask[i] ? "g" : ""}">`; cur = mask[i]; }
    s += ch.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  });
  if (cur !== null) s += "</span>";
  if (caret) s += '<i class="caret"></i>';
  return s;
}

function keys(t0, text, cps) {
  chars(text).forEach((ch, i) => { if (ch !== " " && ch !== "‌") events.push({ t: t0 + i / cps, k: "key" }); });
}

function init() {
  let t = 0.5;
  // opening lines, typed one after another
  T.story = [];
  for (const line of C.opening) {
    T.story.push({ t, text: line, cps: CPS * 0.85 });
    keys(t, line, CPS * 0.85);
    t += typingTime(line, CPS * 0.85) + 0.7;
  }
  T.rise = t + 0.6;                 // the phone rises as the opening lines lift away
  events.push({ t: T.rise, k: "whoosh" });
  t = T.rise + 1.5;

  T.scenes = [];
  T.captions = [];
  C.scenes.forEach((sc, i) => {
    const s = { ...sc, t0: t, t1: t + sc.length, n: i + 1 };
    T.scenes.push(s);
    if (i > 0) events.push({ t, k: "swish" });
    for (const tp of sc.taps) events.push({ t: t + tp, k: "tap" });
    sc.lines.forEach(([lt, text]) => T.captions.push({ t: t + lt + 0.15, text }));
    t = s.t1;
  });
  // each caption types fast enough to rest a moment before the next one replaces it
  T.captions.forEach((c, i) => {
    const next = i + 1 < T.captions.length ? T.captions[i + 1].t : t + 2;
    c.end = next;
    c.cps = Math.max(CPS, chars(c.text).length / Math.max(0.6, next - c.t - 1.3));
    keys(c.t, c.text, c.cps);
  });

  T.sink = t;                        // the phone leaves
  events.push({ t: T.sink + 0.2, k: "whoosh" });
  T.ending = T.sink + 1.1;
  keys(T.ending, C.ending, CPS * 0.85);
  T.logo = T.ending + typingTime(C.ending, CPS * 0.85) + 1.2;
  events.push({ t: T.logo, k: "chime" });
  T.total = T.logo + 4.6;
  events.sort((a, b) => a.t - b.t);
  return { frames: Math.round(T.total * FPS), events, total: T.total };
}

// ---------------------------------------------------------------- frames of the recordings
const cache = new Map();
function image(url) {
  let p = cache.get(url);
  if (!p) {
    const im = new Image();
    im.src = url;
    p = im.decode().then(() => im);
    cache.set(url, p);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
  }
  return p;
}

function frameAt(sc, local) {
  const f = sc.frames;
  let lo = 0, hi = f.length - 1;
  local = clamp(local, 0, sc.length);
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (f[mid][1] <= local) lo = mid; else hi = mid - 1; }
  return sc.dir + "/" + f[lo][0];
}

const web = $("web"), g = web.getContext("2d");
const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
probe.canvas.width = 40; probe.canvas.height = 2;

function sample(im, y) {
  probe.drawImage(im, 0, y, im.width, 2, 0, 0, 40, 2);
  const d = probe.getImageData(0, 0, 40, 2).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return [r / n, gg / n, b / n];
}

function paintBar(el, rgb, ink) {
  el.style.background = `rgb(${rgb.map(Math.round).join(",")})`;
  const light = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 140;
  if (ink) ink.style.color = light ? "#111" : "#fff";
  return light;
}

async function drawScreen(t) {
  // which scene is on screen, and the one it dissolves from
  let i = T.scenes.findIndex((s) => t < s.t1);
  if (t < T.scenes[0].t0) i = 0;
  if (i < 0) i = T.scenes.length - 1;
  const sc = T.scenes[i];
  const cur = await image(frameAt(sc, t - sc.t0));
  const mix = i > 0 ? clamp((t - sc.t0) / FADE) : 1;
  g.globalAlpha = 1;
  if (mix < 1) {
    const prev = T.scenes[i - 1];
    g.drawImage(await image(frameAt(prev, prev.length)), 0, 0, web.width, web.height);
    g.globalAlpha = ease(mix);
  }
  g.drawImage(cur, 0, 0, web.width, web.height);
  g.globalAlpha = 1;
  const top = sample(web, 0), bottom = sample(web, web.height - 2);
  paintBar($("status"), top, $("status"));
  const light = paintBar($("homebar"), bottom);
  $("homebar").firstChild.style.background = light ? "rgba(0,0,0,.85)" : "rgba(255,255,255,.9)";
  return sc;
}

// ---------------------------------------------------------------- words
function caption(t) {
  const a = $("capA"), b = $("capB");
  let i = -1;
  for (let k = 0; k < T.captions.length; k++) if (t >= T.captions[k].t) i = k;
  const hide = t > T.sink ? clamp((t - T.sink) / 0.35) : 0;
  if (i < 0) { a.style.opacity = 0; b.style.opacity = 0; return; }
  const c = T.captions[i];
  const local = t - c.t;
  const n = Math.floor(local * c.cps) + 1;
  const total = chars(c.text).length;
  const typing = n < total;
  const blink = typing || (local - total / c.cps < 1.4 && Math.floor(t * 2.2) % 2 === 0);
  a.innerHTML = `<p>${html(c.text, Math.min(n, total), blink)}</p>`;  // one line box, so spaces at word joins survive
  a.style.opacity = 1 - hide;
  a.style.transform = "none";
  // the previous line drifts up and fades as the new one starts
  if (i > 0 && local < 0.4) {
    const p = T.captions[i - 1], k = clamp(local / 0.22);
    b.innerHTML = `<p>${html(p.text, chars(p.text).length, false)}</p>`;
    b.style.opacity = 1 - out(k);
    b.style.transform = `translateY(${-36 * out(k)}px)`;
    a.style.opacity = out((local - 0.18) / 0.22) * (1 - hide);
  } else b.style.opacity = 0;
}

function chapter(t) {
  const el = $("chapter");
  if (t < T.scenes[0].t0 - 0.6 || t > T.sink + 0.4) { el.style.opacity = 0; return; }
  let sc = T.scenes[0];
  for (const s of T.scenes) if (t >= s.t0 - 0.2) sc = s;
  const k = out((t - sc.t0 + 0.2) / 0.6);
  const leave = t > T.sink ? clamp((t - T.sink) / 0.4) : 0;
  el.innerHTML = `<i></i><b>${fa(String(sc.n).padStart(2, "0"))}</b><span>${sc.chapter}</span><i></i>`;
  el.style.opacity = k * (1 - leave);
  el.style.transform = `translateY(${(1 - k) * 26}px)`;
}

function story(t) {
  const el = $("story");
  const lift = clamp((t - T.rise + 0.3) / 0.9);
  el.style.opacity = 1 - out(lift);
  el.style.transform = `translateY(${-140 * ease(lift)}px)`;
  el.innerHTML = T.story.map((s) => {
    const n = clamp(Math.floor((t - s.t) * s.cps) + 1, 0, chars(s.text).length);
    const done = n >= chars(s.text).length;
    const last = s === T.story.findLast((x) => t >= x.t);
    return `<div>${t >= s.t ? html(s.text, n, last && (!done || Math.floor(t * 2.2) % 2 === 0)) : ""}</div>`;
  }).join("");
}

function outro(t) {
  const o = $("outro");
  if (t < T.ending - 0.1) { o.style.opacity = 0; return; }
  o.style.opacity = 1;
  const e = $("oend");
  const n = clamp(Math.floor((t - T.ending) * CPS * 0.85) + 1, 0, chars(C.ending).length);
  const done = n >= chars(C.ending).length;
  const up = ease((t - T.logo + 0.4) / 1.0);
  e.innerHTML = html(C.ending, n, !done || (t < T.logo && Math.floor(t * 2.2) % 2 === 0));
  e.style.top = `${860 - 560 * up}px`;
  e.style.fontSize = `${60 - 12 * up}px`;
  e.style.opacity = 1 - 0.25 * up;
  const lg = clamp((t - T.logo) / 1.0);
  const img = o.querySelector("img");
  img.style.opacity = out(lg * 1.6);
  img.style.transform = `scale(${0.6 + 0.4 * back(lg)}) rotate(${-8 * (1 - out(lg))}deg)`;
  const rise = (el, d) => { const k = out((t - T.logo - d) / 0.9); el.style.opacity = k; el.style.transform = `translateY(${(1 - k) * 40}px)`; };
  rise($("oname"), 0.35);
  rise($("oslogan"), 0.9);
  rise($("ocredit"), 1.4);
  const w = 560 * out((t - T.logo - 0.7) / 1.1);
  $("oline").style.width = `${w}px`;
  $("oline").style.marginLeft = `${-w / 2}px`;
}

// ---------------------------------------------------------------- the phone and the backdrop
function phone(t) {
  const p = $("phone");
  const rise = ease((t - T.rise) / 1.5);
  const sink = ease((t - T.sink) / 1.1);
  const ty = 1500 * (1 - rise) + 1300 * sink + 9 * Math.sin(t * 2 * Math.PI / 6.5);
  const ry = -24 * (1 - rise) + 16 * sink + 3.2 * Math.sin(t * 2 * Math.PI / 11);
  const rx = 16 * (1 - rise) - 10 * sink + 1.4 * Math.sin(t * 2 * Math.PI / 8 + 1);
  const rz = 4 * (1 - rise) - 3 * sink;
  p.style.transform = `translateY(${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;
  p.style.opacity = rise > 0 ? 1 - sink : 0;
  $("glare").style.backgroundPosition = `${50 + ry * 6}% 0`;
  $("shadow").style.opacity = 0.9 * rise * (1 - sink);
  $("shadow").style.transform = `scaleX(${1 + 0.04 * Math.sin(t * 2 * Math.PI / 6.5)})`;
}

const bokeh = [];
function backdrop(t) {
  bokeh.forEach((b) => {
    const x = b.x + b.ax * Math.sin(t / b.p + b.ph), y = b.y + b.ay * Math.cos(t / b.p * 0.8 + b.ph);
    b.el.style.transform = `translate(${x}px, ${y}px)`;
    b.el.style.opacity = b.o * (0.75 + 0.25 * Math.sin(t / (b.p * 0.6) + b.ph));
  });
  $("spot").style.opacity = 0.65 + 0.35 * Math.sin(t / 2.4);
}

function setup() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    const el = document.createElement("div");
    el.className = "bokeh";
    const r = 120 + rnd() * 260;
    el.style.width = el.style.height = `${r}px`;
    el.style.left = el.style.top = `${-r / 2}px`;
    el.style.background = `radial-gradient(circle, rgba(226,194,122,${0.10 + rnd() * 0.12}), transparent 68%)`;
    $("bg").appendChild(el);
    bokeh.push({ el, x: rnd() * 1080, y: rnd() * 1920, ax: 40 + rnd() * 90, ay: 50 + rnd() * 120, p: 3 + rnd() * 5, ph: rnd() * 6, o: 0.6 + rnd() * 0.4 });
  }
  const now = new Date(2026, 9, 23, 9, 41);
  $("clock").textContent = fa(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`);
}

async function draw(i) {
  const t = i / FPS;
  backdrop(t);
  story(t);
  if (t >= T.rise - 0.1 && t < T.sink + 1.3) await drawScreen(t);
  phone(t);
  chapter(t);
  caption(t);
  outro(t);
}

setup();
"""


def page_html(config: dict) -> str:
    s = 636 / 440                              # screen pixels per point
    sw, sh = 636, round(956 * s)
    bezel, metal = 11, 8
    pw, ph = sw + 2 * (bezel + metal), sh + 2 * (bezel + metal)
    px, py = (W - pw) // 2, 150
    sr = round(55 * s)
    sub = {
        "__FONTS__": FONTS, "__PX__": px, "__PY__": py, "__PW__": pw, "__PH__": ph,
        "__OR__": sr + bezel + metal, "__OR2__": sr + bezel + metal - 2, "__RIM__": metal, "__GR__": sr + bezel,
        "__SX__": bezel + metal, "__SY__": bezel + metal, "__SW__": sw, "__SH__": sh, "__SR__": sr,
        "__STH__": round(STATUS_H * s), "__WH__": sh - round(STATUS_H * s) - round(HOME_H * s), "__HH__": round(HOME_H * s),
    }
    css = CSS
    for k, v in sub.items():
        css = css.replace(k, str(v))
    m = metal
    buttons = (
        f'<div class="btn" style="left:-4px;top:{round(ph * .19)}px;height:62px"></div>'      # action button
        f'<div class="btn" style="left:-4px;top:{round(ph * .27)}px;height:104px"></div>'     # volume up
        f'<div class="btn" style="left:-4px;top:{round(ph * .36)}px;height:104px"></div>'     # volume down
        f'<div class="btn" style="right:-4px;top:{round(ph * .30)}px;height:150px"></div>'    # side button
        f'<div class="btn" style="right:-3px;top:{round(ph * .62)}px;height:88px;opacity:.8"></div>'  # camera control
    )
    js = JS.replace("__CONFIG__", json.dumps(config, ensure_ascii=False)).replace("__FPS__", str(FPS))
    return f"""<!doctype html><html lang="fa"><head><meta charset="utf-8"><style>{css}</style></head><body>
<div id="bg"><div id="spot"></div></div><div id="grain"></div>
<div id="story"></div>
<div id="world"><div id="shadow"></div><div id="phone">
  {buttons}<div class="metal"></div><div class="glassrim"></div>
  <div id="screen">
    <canvas id="web" width="{440 * 2}" height="{WEB_H * 2}" style="width:{sw}px;height:{sub['__WH__']}px"></canvas>
    <div id="status"><div id="clock"></div><div id="icons">{ICONS}</div></div>
    <div id="homebar"><i></i></div>
    <div id="island"></div><div id="glare"></div>
  </div>
</div></div>
<div id="chapter"></div><div class="cap" id="capB"></div><div class="cap" id="capA"></div>
<div id="outro"><div id="oend"></div><img src="{LOGO}"><div id="oname">شیوا گالری</div><div id="oline"></div>
  <div id="oslogan">{config['slogan']}</div><div id="ocredit">طراحی و توسعه: <b>هوشیوا</b><span>houshiva.ir</span></div></div>
<div id="vignette"></div>
<script>{js}</script></body></html>"""


def config_for(video: Video, work: Path) -> dict:
    scenes = []
    for name, chapter in video.scenes:
        d = work / "clips" / name
        info = json.loads((d / "clip.json").read_text(encoding="utf-8"))
        scenes.append({"chapter": chapter, "dir": d.as_uri(), **info})
    return {"opening": video.opening, "ending": video.ending, "slogan": video.slogan, "gold": video.gold, "scenes": scenes}


async def render(browser, video: Video, work: Path, out: Path) -> list[dict]:
    """Draws the video frame by frame into a silent MP4 and returns the moments the sound track should mark."""
    f = work / "html" / f"stage_{video.key}.html"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(page_html(config_for(video, work)), encoding="utf-8")
    page = await browser.new_page(viewport={"width": W, "height": H})
    await page.goto(f.as_uri())
    await page.evaluate("document.fonts.ready")
    info = await page.evaluate("init()")
    cdp = await page.context.new_cdp_session(page)
    enc = subprocess.Popen(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "mjpeg", "-i", "-", *ENC, str(out)],
        stdin=subprocess.PIPE,
    )
    n = info["frames"]
    for i in range(n):
        await page.evaluate("i => draw(i)", i)
        shot = await cdp.send("Page.captureScreenshot", {"format": "jpeg", "quality": 94, "optimizeForSpeed": False})
        enc.stdin.write(base64.b64decode(shot["data"]))
        if i % (FPS * 10) == 0:
            print(f"  {i / FPS:4.0f}s / {info['total']:.0f}s")
    enc.stdin.close()
    if enc.wait():
        raise RuntimeError("ffmpeg failed")
    await page.close()
    info["events"].append({"t": info["total"], "k": "end"})
    return info["events"]


def mux(video: Path, audio: Path, out: Path):
    subprocess.run(
        [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-i", str(audio),
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)],
        check=True,
    )
