"""Audio correlation alignment; never edits source files."""
from __future__ import annotations
import math, tempfile
from pathlib import Path
import numpy as np
from .core import media_path, run

SAMPLE_RATE=8000
HOP=160  # 20ms comparison envelope
MAX_ANALYSIS_SECONDS=150

def _envelope(path, start, ffmpeg, cancel):
    # Short bounded mono PCM decode. Decoding source audio does not transcode video.
    with tempfile.TemporaryDirectory(prefix='ef-sync-') as td:
        raw=Path(td)/'mono.f32'
        run([ffmpeg,'-nostdin','-hide_banner','-v','error', '-ss',str(start),'-i',str(path),
             '-vn','-map','0:a:0','-t',str(MAX_ANALYSIS_SECONDS),'-ar',str(SAMPLE_RATE),
             '-ac','1','-f','f32le','-y',str(raw)],cancel)
        pcm=np.fromfile(str(raw),dtype='<f4')
    if pcm.size< SAMPLE_RATE*4: raise ValueError('Audio too short to synchronize')
    pcm=np.nan_to_num(pcm)
    # Fast speech-activity envelope robust to different microphones / gain.
    n=pcm.size//HOP
    blocks=pcm[:n*HOP].reshape(n,HOP)
    energy=np.sqrt(np.maximum(np.mean(blocks*blocks,axis=1),1e-12))
    env=np.log1p(50*energy)
    smooth=np.convolve(env,np.ones(5)/5,mode='same')
    # Remove broad trends and normalise energy profile.
    smooth-=np.convolve(smooth,np.ones(101)/101,mode='same')
    smooth-=smooth.mean()
    sd=float(smooth.std())
    if sd < 0.003: raise ValueError('Insufficient changing audio for reliable synchronization')
    return smooth/sd

def estimate(camera_path,mic_path,camera_in,mic_in,ffmpeg='ffmpeg',cancel=None):
    camera=media_path(camera_path);mic=media_path(mic_path)
    camera_in=float(camera_in);mic_in=float(mic_in)
    if not all(math.isfinite(x) and x>=0 for x in (camera_in,mic_in)):
        raise ValueError('Invalid source in-points')
    a=_envelope(camera,camera_in,ffmpeg,cancel)
    b=_envelope(mic,mic_in,ffmpeg,cancel)
    # Cross correlation across +/- 30 seconds; q = mic sample index - camera index.
    # Uses convolution to avoid O(n^2) work for long recordings.
    length=len(a)+len(b)-1
    nfft=1<<(length-1).bit_length()
    full=np.fft.irfft(np.fft.rfft(b,nfft)*np.fft.rfft(a[::-1],nfft),nfft)[:length]
    lags=np.arange(-(len(a)-1),len(b))
    limit=int(30*SAMPLE_RATE/HOP)
    allowed=np.flatnonzero(np.abs(lags)<=limit)
    # Normalize for overlap and suppress short matches.
    sum_a=np.r_[0,np.cumsum(a*a)]
    sum_b=np.r_[0,np.cumsum(b*b)]
    scores=[]
    for idx in allowed:
        lag=int(lags[idx]); a0=max(0,-lag); b0=max(0,lag)
        count=min(len(a)-a0,len(b)-b0)
        if count<10*SAMPLE_RATE/HOP:
            scores.append(-1);continue
        power=(sum_a[a0+count]-sum_a[a0])*(sum_b[b0+count]-sum_b[b0])
        scores.append(float(full[idx]/math.sqrt(max(power,1e-12))))
    scores=np.asarray(scores)
    index=int(np.argmax(scores)); peak=float(scores[index]); lag=int(lags[allowed[index]])
    # background score to detect multiple plausible alignments
    exclude=abs(lags[allowed]-lag)>int(1.0*SAMPLE_RATE/HOP)
    alternative=float(np.max(scores[exclude])) if np.any(exclude) else 0
    seconds=lag*HOP/SAMPLE_RATE
    # For a matched event camera time = camera_in + t; mic time = mic_in + t + seconds.
    # Moving mic to camera start + (mic_in - camera_in - seconds) aligns both events.
    shift=mic_in-camera_in-seconds
    return {'shift_seconds':round(shift,4),'correlation':round(peak,4),
            'alternative_correlation':round(alternative,4),
            'confidence':'high' if peak>=.42 and peak-alternative>=.08 else 'low',
            'window_seconds':MAX_ANALYSIS_SECONDS,'lag_seconds':round(seconds,4)}
