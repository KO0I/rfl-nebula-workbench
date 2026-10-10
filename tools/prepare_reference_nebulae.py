"""Build deterministic volume data from the four supplied reference photographs.

Run with an upload directory argument. Originals are preserved; generated data
separates compact stars from cloud color and assigns artistic, not measured,
depth. Requires Pillow, numpy and scipy.
"""
import json
import shutil
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import median_filter, gaussian_filter, maximum_filter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist/references'
OUT.mkdir(exist_ok=True)
PRESETS = [
    ('rose-lagoon', 'Rose Lagoon', 'IMG_3701.jpeg', 0),
    ('golden-pillar', 'Golden Pillar', 'IMG_3700.jpeg', 1),
    ('amber-filaments', 'Amber Filaments', 'IMG_3699.jpeg', 2),
    ('crimson-outflow', 'Crimson Outflow', 'IMG_3698.jpeg', 3),
]
manifest = {}
for key, label, name, profile in PRESETS:
    original = Path(sys.argv[1]) / name
    shutil.copyfile(original, OUT / f'{key}.jpeg')
    im = Image.open(original).convert('RGB')
    im.thumbnail((512, 512), Image.Resampling.LANCZOS)
    w, h = im.size
    rgb = np.asarray(im, dtype=np.float32) / 255
    rgba = np.concatenate([rgb, np.ones((h, w, 1))], axis=2)
    (OUT / f'{key}.rgba').write_bytes(np.uint8(np.rint(rgba*255)).tobytes())
    # Suppress point sources without blurring the large cloud filaments.
    base = median_filter(rgb, size=(5, 5, 1))
    residual = np.maximum(0, rgb-base)
    peak = residual.max(axis=2)
    mask = np.clip((peak-.025)/.13, 0, 1)[..., None]
    gas = rgb*(1-mask) + base*mask
    lum = gaussian_filter(gas.max(axis=2), 2)
    yy, xx = np.mgrid[0:h, 0:w]; u=xx/(w-1); v=yy/(h-1)
    r, g, b = np.moveaxis(gas, -1, 0)
    # Profiles follow the reference's cavity, pillar, flowing veil, or outflow.
    if profile == 0:
        center = .10 + .24*np.sin(u*5)*np.cos(v*4) + .15*(r-b)
        thickness = .20 + .30*lum
    elif profile == 1:
        center = -.24*(r-b) + .16*np.sin(v*7) + .12*(u-.5)
        thickness = .13 + .32*np.clip((r-b)*2+lum*.4, 0, 1)
    elif profile == 2:
        center = .23*np.sin(v*8+u*3) + .20*(b-r)
        thickness = .10 + .25*lum
    else:
        center = .20*(u-.5) + .22*(b-r) + .09*np.sin(v*7)
        thickness = .14 + .33*lum
    # Cloud opacity excludes the near-black sky. Dust lanes remain dark cuts.
    column = np.clip((lum-.025)*1.9, 0, 1)
    maps = np.stack([column, (center+.6)/1.2, (thickness-.06)/.60, np.ones_like(lum)], axis=2)
    (OUT/f'{key}-depth.rgba').write_bytes(np.uint8(np.rint(np.clip(maps,0,1)*255)).tobytes())
    cloud = np.concatenate([gas, np.ones((h,w,1))], axis=2)
    (OUT/f'{key}-cloud.rgba').write_bytes(np.uint8(np.rint(cloud*255)).tobytes())
    candidates = np.argwhere((peak == maximum_filter(peak, size=7)) & (peak > .10))
    candidates = sorted(candidates, key=lambda p: float(peak[tuple(p)]), reverse=True)[:64]
    stars=[]
    sx=2.2*w/max(w,h); sy=2.2*h/max(w,h)
    for i, (y,x) in enumerate(candidates):
        strength=float(peak[y,x]); color=rgb[y,x].copy()
        color=color/max(float(color.max()),.01)*(.30+strength*.70)
        stars.append([(float(x)+.5)/w*sx-sx/2, sy/2-(float(y)+.5)/h*sy,
                      -.72+(i%13)/13*.27, 0, 0, 0, 1, *map(float,color), float(i)*.71])
    preview_w=round(w/max(w,h)*256); preview_h=round(h/max(w,h)*256)
    manifest[key]={'label':label,'image':f'references/{key}.jpeg','pixels':f'references/{key}.rgba',
        'width':w,'height':h,'reference':True,'cloud':f'references/{key}-cloud.rgba',
        'depth':f'references/{key}-depth.rgba','stars':stars,'previewWidth':preview_w,
        'previewHeight':preview_h,'zoom':1.65,'spikes':profile!=0,
        'sourceFile':name,'profile':profile}
    print(key, w, h, len(stars), 'stars')
(ROOT/'dist/reference-presets.js').write_text('// Reproducible data: tools/prepare_reference_nebulae.py\n'
    +'globalThis.NEBULA_REFERENCE_PRESETS = Object.freeze('+json.dumps(manifest,indent=2)+');\n')
