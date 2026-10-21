"""Create EditFlow's original, deterministic 48 kHz mono PCM sound pack.

Every sample is synthesized here; no third-party recordings or model weights.
Run from any working directory. The WAVs are included in the release zip.
"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 48000
OUT = Path(__file__).resolve().parents[1] / 'uxp' / 'assets' / 'sfx'


def noise(seed):
    rng = random.Random(seed)
    return lambda: rng.uniform(-1.0, 1.0)


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def envelope(t, dur, attack=.008, release=.12):
    return smooth(t / attack) * smooth((dur - t) / release)


def render(name, dur, func):
    OUT.mkdir(parents=True, exist_ok=True)
    samples = [func(i / RATE) * envelope(i / RATE, dur)
               for i in range(int(dur * RATE))]
    peak = max(abs(x) for x in samples)
    gain = 0.68 / peak if peak else 0
    pcm = b''.join(struct.pack('<h', max(-32767, min(32767, round(x * gain * 32767))))
                   for x in samples)
    with wave.open(str(OUT / (name + '.wav')), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm)
    return len(pcm)


def main():
    n = noise(9301)
    specs = [
        ('air-sweep', .56, lambda t: n() * (0.08 + .82 * math.sin(math.pi * t / .56) ** 2)
         + .18 * math.sin(2 * math.pi * (180 * t + 380 * t * t))),
        ('deep-hit', .72, lambda t: .9 * math.exp(-8 * t) * math.sin(2 * math.pi * (78 * t - 22 * t * t))
         + .23 * math.exp(-32 * t) * n()),
        ('bright-pop', .25, lambda t: .7 * math.exp(-26 * t) * math.sin(2 * math.pi * (310 * t - 130 * t * t))
         + .23 * math.exp(-43 * t) * n()),
        ('soft-click', .15, lambda t: math.exp(-66 * t) * (.64 * n() + .36 * math.sin(2 * math.pi * 760 * t))),
        ('rise', 1.25, lambda t: (t / 1.25) ** 1.6 * (.43 * n()
         + .57 * math.sin(2 * math.pi * (130 * t + 260 * t * t)))),
        ('bass-pulse', .45, lambda t: math.exp(-10 * t) * (math.sin(2 * math.pi * (95 * t - 62 * t * t))
         + .2 * math.sin(2 * math.pi * 2 * 95 * t))),
        ('signal-tone', .52, lambda t: (1 if t < .20 or t > .27 else 0) *
         (.65 * math.sin(2 * math.pi * 740 * t) + .23 * math.sin(2 * math.pi * 1110 * t))),
        ('shutter', .32, lambda t: (math.exp(-145 * t) + .8 * math.exp(-145 * max(0, t - .095)) * (t >= .095))
         * (.5 * n() + .5 * math.sin(2 * math.pi * 1250 * t))),
    ]
    for name, duration, func in specs:
        print(name, render(name, duration, func), 'bytes')


if __name__ == '__main__':
    main()
