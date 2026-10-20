"""The sound track: a warm, quiet piece of music written in code, with soft key clicks under the typed
story, a tick on every tap and gentle whooshes on the transitions. Nothing is sampled, so it is free to use.

Pass --music to promo.py to lay your own track under the sound effects instead.
"""
import subprocess
import wave
from pathlib import Path

import imageio_ffmpeg
import numpy as np

SR = 44100
BPM = 84
BEAT = 60 / BPM
rng = np.random.default_rng(11)

# IV – V – iii – vi in C, voiced warm and open; one chord per bar
CHORDS = [
    (41, [53, 57, 60, 64, 67]),   # Fmaj9
    (43, [55, 59, 62, 64, 69]),   # G6/9
    (40, [52, 55, 59, 62, 66]),   # Em9
    (45, [57, 60, 64, 67, 71]),   # Am9
]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n, a, r):
    """Attack, then an exponential tail."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)
    return e


def add(buf, sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= buf.shape[1] or i + len(sig) <= 0:
        return
    j = min(buf.shape[1], i + len(sig))
    s = sig[: j - i] * gain
    buf[0, i:j] += s * np.sqrt(0.5 * (1 - pan))
    buf[1, i:j] += s * np.sqrt(0.5 * (1 + pan))


# ---------------------------------------------------------------- instruments

def pad_note(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for det in (-0.07, 0, 0.06):
        f = hz(m + det)
        s += np.sin(2 * np.pi * f * t) + 0.32 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    swell = np.minimum(1, t / 1.1) * np.minimum(1, (dur - t) / 1.4).clip(0)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.23 * t)
    return s * swell * trem / 3


_pluck_cache = {}


def pluck(m, dur=2.4):
    """Karplus–Strong string, computed one period at a time."""
    key = (m, dur)
    if key in _pluck_cache:
        return _pluck_cache[key]
    n = int(dur * SR)
    p = max(2, int(round(SR / hz(m))))
    out = np.zeros(n + p + 1)
    out[:p] = rng.uniform(-1, 1, p) * np.hanning(p) * 1.4
    decay = 0.996
    for k in range(p, n, p):
        prev = out[k - p: k]
        sh = out[k - p - 1: k - 1] if k - p - 1 >= 0 else np.concatenate([[0], prev[:-1]])
        m_ = min(p, n - k)
        out[k: k + m_] = (decay * 0.5 * (prev + sh))[:m_]
    s = out[:n]
    s = s - np.convolve(s, np.ones(8) / 8, "same") * 0.3   # a little brighter
    s *= np.minimum(1, np.arange(n) / (0.002 * SR))
    _pluck_cache[key] = s
    return s


def bass_note(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * env(n, 0.01, 0.9)


def kick():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.13)


def shaker():
    n = int(0.09 * SR)
    s = rng.uniform(-1, 1, n)
    s = s - np.convolve(s, np.ones(6) / 6, "same")
    return s * env(n, 0.012, 0.022)


def bell(m):
    n = int(4.5 * SR)
    t = np.arange(n) / SR
    f = hz(m)
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 1.8), (2.76, .45, .8), (5.4, .25, .35), (8.93, .1, .18)))
    return s * np.minimum(1, t / 0.003)


def key_click():
    n = int(0.03 * SR)
    s = rng.uniform(-1, 1, n)
    s = s - np.convolve(s, np.ones(4) / 4, "same")
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * rng.uniform(170, 240) * t) * np.exp(-t / 0.008) * 0.5
    return (s * np.exp(-t / 0.004) + thump) * rng.uniform(0.55, 1.0)


def tap_tick():
    n = int(0.08 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1350 * t) * np.exp(-t / 0.012) + 0.5 * np.sin(2 * np.pi * 2700 * t) * np.exp(-t / 0.006))


def sweep(dur, f0, f1, peak=0.45):
    """Noise whose band glides from f0 to f1: a whoosh."""
    n = int(dur * SR)
    noise = rng.normal(0, 1, n + 2048)
    out = np.zeros(n + 2048)
    hop, size = 512, 2048
    win = np.hanning(size)
    freqs = np.fft.rfftfreq(size, 1 / SR)
    for i in range(0, n, hop):
        x = i / n
        fc = f0 * (f1 / f0) ** x
        band = np.exp(-0.5 * (np.log(np.maximum(freqs, 1) / fc) / 0.55) ** 2)
        seg = np.fft.irfft(np.fft.rfft(noise[i: i + size] * win) * band)
        out[i: i + size] += seg * win
    out = out[:n]
    t = np.arange(n) / n
    shape = np.where(t < peak, (t / peak) ** 2, ((1 - t) / (1 - peak)) ** 1.5)
    return out * shape / (np.abs(out).max() + 1e-9)


def reverb(x, seconds=2.6, mix=0.32):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.normal(0, 1, n) * np.exp(-t / (seconds / 6.9))
        ir = np.convolve(ir, np.ones(12) / 12, "same")      # darker tail
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum())
        size = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
        wet = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)[: x.shape[1]]
        out[ch] = x[ch] * (1 - mix) + wet * mix * 1.6
    return out


# ---------------------------------------------------------------- the piece

def music(total, rise, sink, logo):
    buf = np.zeros((2, int((total + 1) * SR)))
    bar = 4 * BEAT
    pattern = [0, 2, 1, 3, 4, 3, 1, 2]                      # chord-tone order for the 8th-note arpeggio
    b = 0
    while b * bar < logo:
        t0 = b * bar
        root, notes = CHORDS[b % 4]
        full = rise - 0.3 <= t0 < sink
        for k, m in enumerate(notes[:4]):
            add(buf, pad_note(m, bar + 1.6), t0, 0.11, pan=(k - 1.5) * 0.35)
        if t0 >= rise - bar:
            add(buf, bass_note(root, bar), t0, 0.32)
            add(buf, bass_note(root, bar / 2), t0 + 2.5 * BEAT, 0.16)
        steps = range(8) if full else range(0, 8, 2)
        for s in steps:
            m = notes[pattern[s]] + 12
            v = (0.20 if s % 2 == 0 else 0.13) * rng.uniform(0.85, 1.1)
            add(buf, pluck(m), t0 + s * BEAT / 2, v, pan=rng.uniform(-0.5, 0.5))
        if full:
            for beat in (0, 2):
                add(buf, kick(), t0 + beat * BEAT, 0.34)
            for s in range(8):
                if s % 2:
                    add(buf, shaker(), t0 + s * BEAT / 2, 0.07, pan=0.3)
        b += 1
    # the last chord rings out under the logo
    root, notes = CHORDS[0]
    for k, m in enumerate(notes):
        add(buf, pad_note(m, total - logo + 0.5), logo - 0.2, 0.12, pan=(k - 2) * 0.3)
    add(buf, bass_note(root - 12 + 12, 4), logo, 0.3)
    for k, m in enumerate((notes[0] + 12, notes[2] + 12, notes[4] + 12, notes[3] + 24)):
        add(buf, pluck(m, 3.5), logo + k * BEAT / 2, 0.18, pan=(k - 1.5) * 0.3)
    return reverb(buf)


def effects(events, total):
    buf = np.zeros((2, int((total + 1) * SR)))
    for e in events:
        k, t = e["k"], e["t"]
        if k == "key":
            add(buf, key_click(), t, 0.10, pan=rng.uniform(-0.15, 0.15))
        elif k == "tap":
            add(buf, tap_tick(), t, 0.10)
        elif k == "whoosh":
            add(buf, sweep(1.3, 300, 4200), t - 0.3, 0.16)
        elif k == "swish":
            add(buf, sweep(0.55, 900, 5200, 0.35), t - 0.2, 0.07)
        elif k == "chime":
            add(buf, bell(84), t, 0.10, pan=-0.2)
            add(buf, bell(91), t + 0.18, 0.06, pan=0.25)
    return reverb(buf, 1.2, 0.18)


def load(path: Path, total: float):
    raw = subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        capture_output=True, check=True,
    ).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).T.astype(np.float64)
    n = int((total + 1) * SR)
    x = np.pad(x, ((0, 0), (0, max(0, n - x.shape[1]))))[:, :n]
    return x / (np.abs(x).max() + 1e-9) * 0.5


def score(events, out: Path, music_file: Path | None = None):
    total = next(e["t"] for e in events if e["k"] == "end")
    marks = {e["k"]: e["t"] for e in events if e["k"] in ("chime",)}
    whooshes = [e["t"] for e in events if e["k"] == "whoosh"]
    rise, sink = whooshes[0], whooshes[-1] - 0.2
    logo = marks["chime"]
    m = load(music_file, total) if music_file else music(total, rise, sink, logo)
    mix = m + effects(events, total)
    n = int(total * SR)
    mix = mix[:, :n]
    fade_in, fade_out = int(0.6 * SR), int(2.2 * SR)
    mix[:, :fade_in] *= np.linspace(0, 1, fade_in)
    mix[:, -fade_out:] *= np.linspace(1, 0, fade_out) ** 1.6
    mix = np.tanh(mix / (np.abs(mix).max() + 1e-9) * 1.25) / np.tanh(1.25) * 0.89
    pcm = (mix.T * 32767).astype("<i2")
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
