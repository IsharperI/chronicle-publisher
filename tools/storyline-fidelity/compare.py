"""Score how closely Chronicle reproduces each Storyline slide, and build a side-by-side HTML report.

Usage: python3 compare.py <storyline capture dir> <chronicle capture dir> <mapping.json> <out dir> [course name]
Pass '-' for mapping.json when Chronicle slides keep their Storyline slide ids (the in-app importer does);
otherwise it maps Chronicle slide id -> Storyline slide id.

Each pair of screenshots is scored 0-100: 60% structural similarity (layout, shapes, text blocks;
greyscale SSIM) + 40% colour closeness (mean colour difference). Both images are compared at 640x360.
- Layout score: the pair captured just before the slide ends.
- Timing score: the average of the pairs captured at 25%, 50% and 75% of the slide's timeline, which
  shows whether things appear and disappear when they should (when the captures include those moments).
"""
import sys, os, json, base64, io, html
import numpy as np
from PIL import Image, ImageChops
from skimage.metrics import structural_similarity

sl_dir, ch_dir, mapping_file, out_dir = sys.argv[1:5]
course = sys.argv[5] if len(sys.argv) > 5 else 'Course'
os.makedirs(out_dir, exist_ok=True)
SIZE = (640, 360)

sl = json.load(open(os.path.join(sl_dir, 'manifest.json')))
ch = json.load(open(os.path.join(ch_dir, 'manifest.json')))
mapping = json.load(open(mapping_file)) if mapping_file != '-' else {}
ch_by_sl = {mapping.get(c['id'], c['id']): c for c in ch}

def load(p):
    return Image.open(p).convert('RGB').resize(SIZE, Image.LANCZOS)

def score(a, b):
    ga, gb = np.asarray(a.convert('L'), dtype=np.float64), np.asarray(b.convert('L'), dtype=np.float64)
    ssim = structural_similarity(ga, gb, data_range=255)
    diff = np.abs(np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64)).mean() / 255
    return max(0.0, 0.6 * ssim + 0.4 * (1 - diff)) * 100

def heat(a, b):
    d = np.asarray(ImageChops.difference(a, b).convert('L'), dtype=np.float64)
    d = np.clip(d * 3, 0, 255).astype(np.uint8)
    base = np.asarray(a.convert('L'), dtype=np.float64) * 0.35 + 140
    rgb = np.stack([np.clip(base + d, 0, 255), base - d * 0.4, base - d * 0.4], -1).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgb)

def uri(img):
    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=72)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

def moments(entry):
    return {m['t']: m for m in entry.get('shots', []) if not m.get('end')}

rows, scores, timings = [], [], []
for s in sl:
    c = ch_by_sl.get(s['id'])
    a = load(os.path.join(sl_dir, s['file']))
    if c is None:
        rows.append({'n': s['index'], 'title': s['title'], 'storyline_id': s['id'], 'score': None, 'timing': None,
                     'sl': uri(a), 'ch': None, 'diff': None, 'moments': []})
        continue
    b = load(os.path.join(ch_dir, c['file']))
    sc = round(score(a, b), 1)
    scores.append(sc)
    mine, theirs = moments(c), moments(s)
    strip = []
    for t in sorted(set(mine) & set(theirs)):
        ma, mb = load(os.path.join(sl_dir, theirs[t]['file'])), load(os.path.join(ch_dir, mine[t]['file']))
        strip.append({'t': t, 'score': round(score(ma, mb), 1), 'sl': uri(ma.resize((320, 180))), 'ch': uri(mb.resize((320, 180)))})
    timing = round(sum(m['score'] for m in strip) / len(strip), 1) if strip else None
    if timing is not None: timings.append(timing)
    rows.append({'n': s['index'], 'title': s['title'], 'storyline_id': s['id'], 'chronicle_id': c['id'], 'score': sc, 'timing': timing,
                 'sl': uri(a), 'ch': uri(b), 'diff': uri(heat(a, b)), 'moments': strip})

avg = round(sum(scores) / len(scores), 1) if scores else 0
timing_avg = round(sum(timings) / len(timings), 1) if timings else None
missing = sum(1 for r in rows if r['score'] is None)
json.dump({'course': course, 'average': avg, 'timing_average': timing_avg, 'matched': len(scores), 'not_imported': missing,
           'slides': [{**{k: r[k] for k in ('n', 'title', 'storyline_id', 'score', 'timing')},
                       'moments': [{'t': m['t'], 'score': m['score']} for m in r['moments']]} for r in rows]},
          open(os.path.join(out_dir, 'scores.json'), 'w'), indent=1)

def band(v):
    if v is None: return 'none'
    return 'good' if v >= 85 else ('ok' if v >= 70 else 'bad')

cards = []
for r in rows:
    sc = '—' if r['score'] is None else f"{r['score']:.0f}"
    tc = '' if r['timing'] is None else f"<span class=\"tscore {band(r['timing'])}\" title=\"Timing score\">⏱ {r['timing']:.0f}</span>"
    imgs = f'<figure><img src="{r["sl"]}" alt=""><figcaption>Storyline (end of slide)</figcaption></figure>'
    if r['ch']:
        imgs += f'<figure><img src="{r["ch"]}" alt=""><figcaption>Chronicle (end of slide)</figcaption></figure>'
        imgs += f'<figure class="diff"><img src="{r["diff"]}" alt=""><figcaption>Differences</figcaption></figure>'
    else:
        imgs += '<figure class="missing"><div>Not imported</div><figcaption>Chronicle</figcaption></figure>'
    strip = ''.join(f'''<div class="moment {band(m['score'])}"><div class="pair"><img src="{m['sl']}" alt="" title="Storyline"><img src="{m['ch']}" alt="" title="Chronicle"></div>
<span>{m['t'] / 1000:.1f}s · <b>{m['score']:.0f}</b></span></div>''' for m in r['moments'])
    if strip: strip = f'<div class="moments"><span class="mlabel">During the slide (Storyline left, Chronicle right)</span><div class="mrow">{strip}</div></div>'
    cards.append(f'''<article class="slide {band(r['score'])}" data-score="{-1 if r['score'] is None else r['score']}" data-timing="{-1 if r['timing'] is None else r['timing']}" data-n="{r['n']}">
<header><span class="num">{r['n']:02d}</span><span class="title">{html.escape(r['title'] or 'Untitled')}</span>{tc}<span class="score" title="Layout score">{sc}</span></header>
<div class="imgs">{imgs}</div>{strip}</article>''')

page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Import Fidelity Report</title>
<style>
:root{{--bg:#f4f5f7;--card:#fff;--ink:#1d2330;--muted:#667085;--line:#e3e6ec;--good:#1f8f5f;--ok:#b7791f;--bad:#c53030;--none:#8a94a6}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#12151b;--card:#1b2029;--ink:#e8ebf1;--muted:#98a2b3;--line:#2a313d}}}}
:root[data-theme="dark"]{{--bg:#12151b;--card:#1b2029;--ink:#e8ebf1;--muted:#98a2b3;--line:#2a313d}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}}
main{{max-width:1400px;margin:0 auto;padding:24px 16px 64px}}
h1{{font-size:22px;margin:0 0 4px}}.sub{{color:var(--muted);margin:0 0 20px}}
.stats{{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}}.stat{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:120px}}
.stat b{{display:block;font-size:24px;font-variant-numeric:tabular-nums}}.stat span{{color:var(--muted);font-size:13px}}
.bar{{display:flex;gap:8px;align-items:center;margin:0 0 16px;flex-wrap:wrap}}button{{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:8px;padding:6px 12px;cursor:pointer}}button[aria-pressed=true]{{border-color:var(--ink)}}
.slide{{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--none);border-radius:10px;margin-bottom:14px;overflow:hidden}}
.slide.good{{border-left-color:var(--good)}}.slide.ok{{border-left-color:var(--ok)}}.slide.bad{{border-left-color:var(--bad)}}
.slide header{{display:flex;gap:10px;align-items:baseline;padding:10px 14px}}.num{{color:var(--muted);font-variant-numeric:tabular-nums}}.title{{flex:1;font-weight:600;min-width:0;overflow-wrap:anywhere}}
.score{{font-weight:700;font-size:20px;font-variant-numeric:tabular-nums}}.good .score{{color:var(--good)}}.ok .score{{color:var(--ok)}}.bad .score{{color:var(--bad)}}.none .score{{color:var(--none)}}
.imgs{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 14px 14px}}
figure{{margin:0}}figure img{{width:100%;display:block;border:1px solid var(--line);border-radius:4px}}figcaption{{color:var(--muted);font-size:12px;margin-top:4px}}
.tscore{{font-weight:600;font-variant-numeric:tabular-nums;color:var(--muted)}}.tscore.good{{color:var(--good)}}.tscore.ok{{color:var(--ok)}}.tscore.bad{{color:var(--bad)}}
.moments{{padding:0 14px 14px}}.mlabel{{display:block;color:var(--muted);font-size:12px;margin-bottom:6px}}
.mrow{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}}
.moment{{border:1px solid var(--line);border-radius:6px;padding:6px;font-size:12px;color:var(--muted)}}.moment.bad{{border-color:var(--bad)}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px}}.pair img{{width:100%;display:block;border-radius:3px}}
.missing div{{aspect-ratio:16/9;display:grid;place-items:center;border:1px dashed var(--line);border-radius:4px;color:var(--muted)}}
@media (max-width:760px){{.imgs{{grid-template-columns:1fr}}}}
</style></head><body><main>
<h1>{html.escape(course)}: import fidelity</h1>
<p class="sub">Each Storyline slide (published output) next to the same slide imported into Chronicle, out of 100. Layout compares the end of each slide; timing (⏱) compares moments during it.</p>
<div class="stats"><div class="stat"><b>{avg}</b><span>Layout score</span></div><div class="stat"><b>{timing_avg if timing_avg is not None else '—'}</b><span>Timing score</span></div><div class="stat"><b>{len(scores)}</b><span>Slides compared</span></div>
<div class="stat"><b>{missing}</b><span>Not imported</span></div><div class="stat"><b>{sum(1 for v in scores if v >= 85)}</b><span>Score 85+</span></div></div>
<div class="bar"><button data-sort="n" aria-pressed="true">Slide order</button><button data-sort="score" aria-pressed="false">Worst layout</button><button data-sort="timing" aria-pressed="false">Worst timing</button></div>
<section id="list">{''.join(cards)}</section></main>
<script>
const list=document.getElementById('list');
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{{
  document.querySelectorAll('[data-sort]').forEach(x=>x.setAttribute('aria-pressed',x===b));
  const k=b.dataset.sort,v=e=>{{const x=+e.dataset[k];return x<0?1e9:x}};[...list.children].sort((a,c)=>k==='n'?a.dataset.n-c.dataset.n:v(a)-v(c)).forEach(e=>list.appendChild(e));
}}));
</script></body></html>'''
open(os.path.join(out_dir, 'report.html'), 'w').write(page)
print(json.dumps({'layout': avg, 'timing': timing_avg, 'matched': len(scores), 'not_imported': missing}))
