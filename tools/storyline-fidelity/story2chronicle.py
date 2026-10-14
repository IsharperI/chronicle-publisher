"""Prototype: convert an unzipped Articulate Storyline .story into a Chronicle Publisher project JSON.

Usage: python3 -I story2chronicle.py <unzipped story dir> <out.json> <report.json>
"""
import sys, os, re, json, base64, hashlib, collections, html
import xml.etree.ElementTree as ET

ROOT, OUT, REPORT = sys.argv[1], sys.argv[2], sys.argv[3]
SD = os.path.join(ROOT, 'story')
report = collections.defaultdict(collections.Counter)
notes = []

def load(p):
    return ET.parse(p).getroot()

def fid(g):
    return re.sub(r'[^A-Za-z0-9_-]', '', g or '')[:64] or None

# ---------- story-level ----------
story = load(os.path.join(SD, 'story.xml'))
rels = load(os.path.join(SD, '_rels', 'story.xml.rels'))
rel_target = {r.get('Id'): r.get('Target') for r in rels}

# media guid -> file via md5
md5_file = {}
for f in os.listdir(os.path.join(SD, 'media')):
    b = open(os.path.join(SD, 'media', f), 'rb').read()
    md5_file[hashlib.md5(b).hexdigest()] = f
MIME = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'svg': 'image/svg+xml',
        'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'mp4': 'video/mp4'}
media = {}
for m in story.find('mediaLst/mediaLst'):
    f = md5_file.get(m.findtext('md5Checksum/stream') or '')
    if f:
        media[m.get('g')] = (f, m.get('displayName'), m.tag)
uri_cache = {}
def data_uri(g):
    if g not in media: return None
    f = media[g][0]
    if f not in uri_cache:
        ext = f.rsplit('.', 1)[-1].lower()
        b = open(os.path.join(SD, 'media', f), 'rb').read()
        uri_cache[f] = f"data:{MIME.get(ext, 'application/octet-stream')};base64,{base64.b64encode(b).decode()}"
    return uri_cache[f]

# variables (user only)
variables, var_by_g = [], {}
TYPE = {'bool': 'boolean', 'num': 'number', 'text': 'text'}
for v in story.find('varLst'):
    if v.get('type') == 'builtIn' or '.' in v.get('name', ''):
        continue
    t = TYPE.get(v.get('dataType'), 'text')
    raw = v.get('val') or ''
    dv = (raw.lower() == 'true') if t == 'boolean' else (float(raw) if t == 'number' and raw else (0 if t == 'number' else raw))
    vid = fid(v.get('g'))
    variables.append({'id': vid, 'name': re.sub(r'\s+', '_', v.get('name')), 'type': t, 'defaultValue': dv})
    var_by_g[v.get('g')] = vid
report['summary']['user variables'] = len(variables)

# colours from first master
master0 = load(os.path.join(SD, 'slideMasters', 'slideMaster.xml'))
scheme = {}
for c in master0.find('clrLst'):
    hexv = c.find('.//srgbClr')
    if hexv is not None: scheme[c.tag] = '#' + hexv.get('val')
scheme.setdefault('tx1', scheme.get('dk1', '#000000')); scheme.setdefault('bg1', scheme.get('lt1', '#ffffff'))
fonts = master0.find('fonts')

def colour(el):
    if el is None: return None
    s = el.find('.//srgbClr')
    c = '#' + s.get('val') if s is not None else None
    if c is None:
        s = el.find('.//schemeClr')
        c = scheme.get(s.get('val')) if s is not None else None
    a = el.find('.//alpha')
    if c and a is not None:
        op = int(a.get('val') or 100000) / 100000
        if op < 0.999: c = c[:7] + format(round(op * 255), '02x')
    return c

def text_colour(fc):  # "lt1,00" or "#RRGGBB,00"
    if not fc: return None
    v = fc.split(',')[0]
    return v if v.startswith('#') else scheme.get(v)

# scenes -> ordered slides
slide_files, slide_scene, slide_relid = [], {}, {}
for sc in story.find('sceneLst'):
    for sid in sc.find('sldIdLst'):
        tgt = rel_target.get(sid.text)
        if tgt:
            slide_files.append(tgt); slide_scene[tgt] = sc.get('name'); slide_relid[tgt] = sid.text[1:]
report['summary']['scenes'] = len(story.find('sceneLst'))
bank = story.find('quizMgr/bankLst')
report['summary']['question bank slides (not imported)'] = sum(len(s.find('sldIdLst')) for s in bank) if bank is not None else 0

# first pass: guid maps (slides, scenes, layers)
parsed = [(t, load(os.path.join(ROOT, t.lstrip('/')))) for t in slide_files]
slide_id_of = {s.get('g'): fid(s.get('g')) for _, s in parsed}
scene_first = {}
for sc in story.find('sceneLst'):
    ids = [rel_target.get(x.text) for x in sc.find('sldIdLst')]
    first = next((s.get('g') for t, s in parsed if t == ids[0]), None) if ids else None
    scene_first[sc.get('g')] = slide_id_of.get(first)

SHAPES = {'rect': 'rectangle', 'roundRect': 'rounded-rectangle', 'oval': 'circle', 'triangle': 'triangle',
          'rtTriangle': 'right-triangle', 'diamond': 'diamond', 'pentagon': 'pentagon', 'hexagon': 'hexagon',
          'octagon': 'octagon', 'parallelogram': 'parallelogram', 'trapezoid': 'trapezoid', 'plus': 'cross',
          'rightArrow': 'arrow-right', 'leftArrow': 'arrow-left', 'upArrow': 'arrow-up', 'downArrow': 'arrow-down',
          'chevron': 'chevron-right', 'star5': 'star-5point', 'roundDiagCorner': 'rounded-rectangle',
          'roundSameSideCorner': 'rounded-rectangle', 'snip1Rect': 'rectangle'}
SKIP = {'group', 'linePath', 'sound'}

def first_style(e):
    t = e.findtext('text') or ''
    if not t.strip(): return {}
    try:
        doc = ET.fromstring(t)
    except ET.ParseError:
        return {}
    st = doc.find('.//Span/Style')
    if st is None: return {}
    return {'size': float(st.get('FontSize') or 18), 'bold': st.get('FontIsBold') == 'True',
            'colour': text_colour(st.get('ForegroundColor')), 'heading': st.get('FontFamily') == '+major'}

def plain_text(e):
    t = e.findtext('text') or ''
    if t.strip():
        try:
            doc = ET.fromstring(t); lines = []
            for b in doc.iter('Block'):
                ls = b.find('Style/ListStyle'); bullet = ls is not None and ls.get('ListType') not in (None, 'None')
                s = ''.join(sp.get('Text', '') for sp in b.iter('Span')).rstrip('\n')
                lines.append(('• ' if bullet and s else '') + s)
            return '\n'.join(lines).strip()
        except ET.ParseError:
            pass
    return (e.findtext('plain') or '').strip()

def timing(e):
    c = e.find('tmCtxLst/*')
    if c is None: return 0, 5000
    return int(float(c.get('start') or 0)), int(float(c.get('dur') or 5000))

def convert_trigger(t, layer_ids, owner):
    d = t.find('data'); ev, act, sub = d.get('event'), d.get('action'), d.get('actSubType')
    EV = {'OnClick': 'onClick', 'OnMouseHover': 'onHover', 'OnStart': 'timelineStart', 'OnEnd': 'timelineEnd'}
    out = {'event': EV.get(ev), 'targetId': ''}
    if act == 'jumpToSlide':
        if sub in ('next', 'prev') and ev == 'OnNextButtonClick':
            return None, 'player Next/Prev (handled by Chronicle navigation)'
        if sub == 'prev': return None, 'jump to previous slide'
        out['action'] = 'jumpToSlide'
        tg = d.find('slide').get('jumpG')
        out['targetId'] = slide_id_of.get(tg, '__next__' if sub == 'next' else '')
    elif act == 'jumpToScene':
        out['action'] = 'jumpToSlide'
        out['targetId'] = scene_first.get(d.find('scene').get('jumpG') or '', '')
    elif act == 'showSubSlide':
        out['action'] = 'showLayer'; out['targetId'] = layer_ids.get(d.find('sldLayer').get('showG'), '')
    elif act == 'hideSubSlide':
        out['action'] = 'hideLayer'
        out['targetId'] = owner if sub == 'me' else layer_ids.get(d.find('sldLayer').get('hideG') or '', '')
    elif act == 'adjustVar':
        o = d.find('other'); vid = var_by_g.get(o.get('varG') or d.get('varG') or '')
        if not vid: return None, 'adjust built-in/unknown variable'
        out.update(action='adjustVariable', variableId=vid)
        op = o.get('op'); typ = next((v['type'] for v in variables if v['id'] == vid), 'text')
        if typ == 'boolean':
            out['variableOperator'] = 'toggle' if op == 'not' else ('setTrue' if o.get('boolVal') == 'True' else 'setFalse')
        elif typ == 'number':
            out['variableOperator'] = {'add': 'add', 'sub': 'subtract', 'mult': 'multiply', 'div': 'divide'}.get(op, 'setNumber')
            out['variableValue'] = float(o.get('dblVal') or 0)
        else:
            out['variableOperator'] = 'setText'; out['variableValue'] = o.get('varVal1') or ''
    elif act == 'exitProject': out['action'] = 'exitCourse'
    elif act == 'CompleteCourse': out['action'] = 'completeCourse'
    elif act == 'playMedia': out['action'] = 'playMedia'
    else:
        return None, f'{act} ({ev})'
    if not out['event']:
        return None, f'event {ev} ({act})'
    conds = []
    for c in t.findall('condLst/trigCond'):
        if c.get('dataType') == 'state':
            return None, f'{act} gated on object state'
        vid = var_by_g.get(c.get('varG'))
        if not vid: return None, f'{act} gated on built-in variable'
        op = {'eq': 'equals', 'neq': 'notEquals', 'gt': 'greaterThan', 'lt': 'lessThan', 'gte': 'greaterThanOrEqual', 'lte': 'lessThanOrEqual'}.get(c.get('op'))
        if not op: return None, f'condition op {c.get("op")}'
        typ = next(v['type'] for v in variables if v['id'] == vid)
        val = (c.get('boolVal') == 'True') if typ == 'boolean' else (float(c.get('floatVal1') or 0) if typ == 'number' else c.get('strVal1') or '')
        conds.append({'variableId': vid, 'operator': op, 'value': val})
    if conds: out['conditions'] = conds
    return out, None

def convert_shapes(shape_lst, layer_ids, slide_report, owner_layer):
    els = []
    for e in shape_lst:
        tag = e.tag
        report['object types seen'][tag] += 1
        if tag in SKIP: continue
        loc = e.find('loc')
        if loc is None: continue
        l, t_, r, b = (float(loc.get(k)) for k in 'ltrb')
        start, dur = timing(e)
        base = {'id': fid(e.get('g')), 'x': round(l), 'y': round(t_), 'width': max(1, round(r - l)), 'height': max(1, round(b - t_)),
                'startTime': start, 'duration': dur, 'triggers': [], 'animationIn': 'none', 'animationOut': 'none',
                'entranceDuration': 500, 'exitDuration': 500}
        if e.find('animEffect/fade') is not None or e.find('.//entr/fade') is not None: base['animationIn'] = 'fade'
        states = [s.get('name') for s in e.findall('stateLst/state')]
        extra = [s for s in states if s not in ('Normal', 'Hover', 'Visited', 'Disabled', 'Down', 'Selected')]
        if extra: report['lost: custom object states'][', '.join(extra)[:60]] += 1
        if e.get('initState') == 'Hidden' or e.get('state') == 'hidden': base['isHidden'] = True
        for trg in e.findall('trigLst/trig'):
            ct, why = convert_trigger(trg, layer_ids, owner_layer)
            if ct: base['triggers'].append(ct); report['triggers']['converted'] += 1
            else: report['lost: triggers'][why] += 1
        if tag == 'line':
            lw = float((e.find('bG/lineStyle').get('w') if e.find('bG/lineStyle') is not None else 2) or 2)
            x0, x1 = sorted((l, r)); y0, y1 = sorted((t_, b))
            if abs(x1 - x0) < 1 or abs(y1 - y0) < 1:
                base.update(x=round(x0), y=round(y0 - (lw / 2 if abs(y1 - y0) < 1 else 0)),
                            width=max(1, round(x1 - x0) or round(lw)), height=max(1, round(y1 - y0) or round(lw)))
                if abs(x1 - x0) < 1: base['x'] = round(x0 - lw / 2)
                c = colour(e.find('bG/solidLine')) or '#000000'
                els.append({**base, 'type': 'shape', 'shapeType': 'rectangle', 'fillColor': c, 'borderColor': c, 'borderWidth': 0})
            else:
                report['lost: unsupported objects']['diagonal line'] += 1
            continue
        if tag in ('pic', 'svgimage'):
            src = data_uri(e.get('assetG'))
            if not src: report['lost: other']['image with missing media'] += 1; continue
            els.append({**base, 'type': 'image', 'src': src, 'alt': e.get('altText') or media.get(e.get('assetG'), ('', ''))[1] or ''})
        elif tag == 'video':
            src = data_uri(e.get('assetG'))
            els.append({**base, 'type': 'video', 'src': src or '', 'controls': True, 'autoplay': False})
        elif tag == 'textBox' or tag in SHAPES:
            # Each Storyline state is a mini-slide; the Normal state's shape holds the real look and label.
            def state_shape(name):
                for stt in e.findall('stateLst/state'):
                    if stt.get('name') == name and stt.find('shapeLst') is not None and len(stt.find('shapeLst')):
                        return stt.find('shapeLst')[0]
                return None
            _n = state_shape('Normal'); look = _n if _n is not None else e
            txt = plain_text(look) or plain_text(e); st = first_style(look) or first_style(e)
            fill = colour(look.find('bG/solidFill')) if look.find('bG/solidFill') is not None else None
            hov = state_shape('Hover')
            hover_fill = colour(hov.find('bG/solidFill')) if hov is not None and hov.find('bG/solidFill') is not None else None
            if hover_fill and hover_fill != fill: base['hoverFillColor'] = hover_fill; report['mapped']['Hover state -> hover colour'] += 1
            if tag == 'textBox' or (fill is None and txt):
                if not txt: continue
                els.append({**base, 'type': 'text', 'content': txt, 'fontSize': round(st.get('size', 18)),
                            'fontWeight': '700' if st.get('bold') else '400', 'textColor': st.get('colour') or '#000000',
                            'backgroundColor': fill or 'transparent', **({'fontRole': 'heading'} if st.get('heading') else {})})
            else:
                line = e.find('bG/solidLine')
                el = {**base, 'type': 'shape', 'shapeType': SHAPES.get(tag, 'rectangle'), 'fillColor': fill or 'transparent',
                      'borderColor': colour(line) or '#000000', 'borderWidth': 1 if line is not None else 0}
                if txt: el.update(text=txt, textColor=st.get('colour') or '#000000', fontSize=round(st.get('size', 16)))
                if tag == 'roundRect': el['borderRadius'] = 12
                els.append(el)
        else:
            report['lost: unsupported objects'][tag] += 1
            slide_report['unsupported'] += 1
    return els

slides, mapping = [], {}
for tgt, s in parsed:
    sr = collections.Counter()
    sid = slide_id_of[s.get('g')]
    layer_ids = {l.get('g'): fid(l.get('g')) for l in (s.find('sldLayerLst') if s.find('sldLayerLst') is not None else [])}
    base_els = convert_shapes(s.find('shapeLst'), layer_ids, sr, '')
    layers = [{'id': f'{sid[:50]}-base', 'name': 'Base Layer', 'visible': True, 'locked': False, 'elements': base_els}]
    for l in (s.find('sldLayerLst') if s.find('sldLayerLst') is not None else []):
        lid = layer_ids[l.get('g')]
        layers.append({'id': lid, 'name': l.get('name') or 'Layer', 'visible': False, 'locked': False,
                       'elements': convert_shapes(l.find('shapeLst'), layer_ids, sr, lid)})
        report['summary']['layers'] += 1
    for trg in s.findall('trigLst/trig'):
        ct, why = convert_trigger(trg, layer_ids, '')
        if ct: report['lost: triggers']['slide-level trigger ' + ct['action'] + ' (no element to attach to)'] += 1
        elif why: report['lost: triggers'][why] += 1
    # resolve '__next__'
    mapping[sid] = slide_relid[tgt]
    slide = {'id': sid, 'title': (s.get('name') or '')[:30], 'group': slide_scene[tgt], 'elements': [], 'layers': layers,
             'duration': int(float((s.find('tmCtxLst/*').get('dur') if s.find('tmCtxLst/*') is not None else 5000) or 5000)),
             'notes': (s.findtext('note') or '').strip() or None, 'audio': [], 'advanceMode': 'manual'}
    for snd in s.findall('shapeLst/sound'):
        if snd.get('assetG') in media:
            c = snd.find('tmCtxLst/*')
            slide['audio'].append({'id': fid(snd.get('g')), 'name': media[snd.get('assetG')][1], 'src': data_uri(snd.get('assetG')),
                                   'duration': float(c.get('dur') or 0) / 1000 if c is not None else 0, 'captions': []})
            report['summary']['slide audio imported'] += 1
    for L in (s.find('sldLayerLst') if s.find('sldLayerLst') is not None else []):
        report['lost: other']['audio on a layer'] += len(L.findall('shapeLst/sound'))
    if s.find('questionLst') is not None or any(e.tag.endswith('Intr') for e in s.iter()):
        report['quiz/interaction slides (content imported, scoring not)'][slide['title']] += 1
    report['summary']['slides'] += 1
    report['summary']['elements imported'] += sum(len(L['elements']) for L in layers)
    slides.append(slide)

# Slide length = the end of the latest base-layer object or slide audio (Storyline's own slide timeline).
for s in slides:
    ends = [e['startTime'] + e['duration'] for e in s['layers'][0]['elements']] + [a['duration'] * 1000 for a in s['audio']]
    s['duration'] = int(max(ends + [s['duration'] or 0, 1000]))

ids = [s['id'] for s in slides]
for i, s in enumerate(slides):
    for L in s['layers']:
        for el in L['elements']:
            for t in el['triggers']:
                if t['targetId'] == '__next__': t['targetId'] = ids[i + 1] if i + 1 < len(ids) else ''

# canvas size from first slide's elements' sldSz
sz = parsed[0][1].find('.//sldSz')
W, H = (int(sz.get('w')), int(sz.get('h'))) if sz is not None else (1280, 720)
project = {'slides': slides, 'masterSlides': [], 'variables': variables,
           'playerSettings': {'courseTitle': (story.find('.//prop') is not None and 'Imported Storyline course') or ''},
           'courseSettings': {'canvasDimensions': {'width': W, 'height': H},
                              'themeColors': [scheme.get(k, '#888888') for k in ('accent1', 'accent2', 'accent3', 'accent4', 'dk1', 'lt1')],
                              'transition': {'type': 'fade', 'duration': 1, 'color': '#000000'},
                              'headingFont': fonts.get('major') if fonts is not None else None,
                              'bodyFont': fonts.get('minor') if fonts is not None else None}}
json.dump(project, open(OUT, 'w'))
if len(sys.argv) > 4: json.dump(mapping, open(sys.argv[4], 'w'), indent=1)
json.dump({k: dict(v) for k, v in report.items()}, open(REPORT, 'w'), indent=1)
print(json.dumps({k: dict(v.most_common(12)) for k, v in report.items()}, indent=1))
print('size MB', round(os.path.getsize(OUT) / 1e6, 1))
