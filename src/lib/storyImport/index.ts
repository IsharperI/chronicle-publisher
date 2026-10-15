/**
 * Articulate Storyline (.story) importer.
 *
 * A .story file is a zip of XML: story/story.xml (scenes, variables, media
 * list, quiz settings), one XML file per slide (story/slides), plus slide
 * masters and layouts. This module reads it in the browser and produces a
 * Chronicle project (a LOAD_COURSE payload) and an import report listing what
 * couldn't be brought across. Callers must still run the payload through
 * sanitizeProject (lib/project.ts) before loading it.
 *
 * Mapping, in short:
 * - scenes → slide groups; slides keep their Storyline slide id (the same id
 *   the published web output uses, which lets the fidelity checker pair them)
 * - each slide layout (+ its master's objects) → a Chronicle master slide
 * - slide layers → layers (non-base layers start hidden)
 * - text boxes, shapes, lines, pictures, picture-filled shapes, video, audio
 * - object states (Hover, Selected, Visited, Disabled, Hidden, custom) with
 *   their looks, initial states, button sets, "change state" triggers,
 *   "when state changes" triggers and state conditions
 * - triggers: jump to slide/scene, show/hide layer, adjust variable, play media,
 *   exit/complete course (with variable conditions)
 * - entrance/exit fade and fly animations
 *
 * See tools/storyline-fidelity for measuring how close an import gets.
 */
import JSZip from 'jszip';
import type {
  AnimationIn, AnimationOut, CourseVariable, ElementState, ImageElement, ShapeElement, ShapeType, Slide, SlideAudio,
  SlideElement, SlideLayer, StateLook, TextElement, Trigger, TriggerCondition, VideoElement,
} from '@/types/course';
import type { ProjectLoadPayload } from '@/lib/project';
import { md5Hex } from './md5';

// ---------- report ----------

export interface ImportIssue {
  /** 'skipped' = not brought across; 'approximated' = brought across with differences. */
  kind: 'skipped' | 'approximated';
  message: string;
  count: number;
  /** Titles of the slides where it happens (first few). */
  slides: string[];
}

export interface StoryImportReport {
  title: string;
  slides: number;
  scenes: number;
  layers: number;
  masters: number;
  objects: number;
  variables: number;
  triggersConverted: number;
  issues: ImportIssue[];
}

export interface StoryImportResult {
  payload: ProjectLoadPayload;
  report: StoryImportReport;
}

class Report {
  private map = new Map<string, ImportIssue>();
  counts = { slides: 0, layers: 0, masters: 0, objects: 0, triggers: 0 };
  add(kind: ImportIssue['kind'], message: string, slide: string) {
    const key = kind + '|' + message;
    let i = this.map.get(key);
    if (!i) { i = { kind, message, count: 0, slides: [] }; this.map.set(key, i); }
    i.count++;
    if (slide && !i.slides.includes(slide) && i.slides.length < 8) i.slides.push(slide);
  }
  issues() {
    return [...this.map.values()].sort((a, b) => (a.kind === b.kind ? b.count - a.count : a.kind === 'skipped' ? -1 : 1));
  }
}

// ---------- small XML helpers (Storyline XML has no namespaces we care about) ----------

type El = Element;
const parser = () => new DOMParser();

function parseXml(text: string): Document {
  return parser().parseFromString(text.replace(/^\uFEFF/, ''), 'application/xml');
}
const kids = (el: El | null | undefined, name?: string): El[] =>
  el ? Array.from(el.children).filter((c) => !name || c.localName === name) : [];
const kid = (el: El | null | undefined, name: string): El | null => kids(el, name)[0] ?? null;
/** Follow a path of child names, e.g. q(el, 'bG', 'solidFill'). */
function q(el: El | null | undefined, ...names: string[]): El | null {
  let cur: El | null = el ?? null;
  for (const n of names) { cur = kid(cur, n); if (!cur) return null; }
  return cur;
}
const attr = (el: El | null | undefined, name: string) => el?.getAttribute(name) ?? null;
const num = (v: string | null | undefined, d = 0) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : d; };
/** Storyline durations look like "PT0.75S". */
const isoMs = (v: string | null, d: number) => { const m = /PT([\d.]+)S/.exec(v ?? ''); return m ? Math.round(parseFloat(m[1]) * 1000) : d; };
/** Chronicle ids must match /^[A-Za-z0-9_-]{1,64}$/. */
const safeId = (g: string | null | undefined, prefix = '') => (prefix + (g ?? '')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || crypto.randomUUID();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm',
};

// Storyline shape tags → Chronicle shape types.
const SHAPES: Record<string, ShapeType> = {
  rect: 'rectangle', roundRect: 'rounded-rectangle', oval: 'circle', triangle: 'triangle', rtTriangle: 'right-triangle',
  diamond: 'diamond', pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', parallelogram: 'parallelogram',
  trapezoid: 'trapezoid', plus: 'cross', rightArrow: 'arrow-right', leftArrow: 'arrow-left', upArrow: 'arrow-up',
  downArrow: 'arrow-down', leftRightArrow: 'arrow-left-right', upDownArrow: 'arrow-up-down', chevron: 'chevron-right',
  star4: 'star-4point', star5: 'star-5point', star6: 'star-6point', star8: 'star-8point',
  roundDiagCorner: 'rounded-rectangle', roundSameSideCorner: 'rounded-rectangle', round1Rect: 'rounded-rectangle',
  round2SameRect: 'rounded-rectangle', round2DiagRect: 'rounded-rectangle', snip1Rect: 'rectangle', snip2SameRect: 'rectangle',
  wedgeRectCallout: 'callout-rectangle', wedgeRoundRectCallout: 'callout-rounded', wedgeEllipseCallout: 'callout-oval',
  cloudCallout: 'thought-bubble', textBox: 'rectangle',
};
const ROUNDED = new Set(['roundRect', 'roundDiagCorner', 'roundSameSideCorner', 'round1Rect', 'round2SameRect', 'round2DiagRect']);
// Objects with no Chronicle equivalent yet, reported by friendly name.
const UNSUPPORTED: Record<string, string> = {
  freeForm: 'Freeform shapes', importedVector: 'Imported vector graphics', shapePath: 'Custom shape paths', arrow: 'Arrows',
  dblArrow: 'Double arrows', table: 'Tables', freePickOneIntr: 'Freeform pick-one questions', freePickManyIntr: 'Freeform pick-many questions',
  dragDropIntr: 'Freeform drag-and-drop questions', dragDropPnl: 'Drag-and-drop panels', rsltsIntr: 'Results interactions',
  rsltBtn: 'Result buttons', tts: 'Text-to-speech audio', webObject: 'Web objects', slider: 'Sliders', dial: 'Dials',
  scrollPanel: 'Scrolling panels', marker: 'Markers', hotspot: 'Hotspots', textEntry: 'Text entry fields', character: 'Characters',
  button: 'Built-in buttons', radioButton: 'Radio buttons', checkBox: 'Checkboxes', zoomRegion: 'Zoom regions', mouse: 'Mouse cursors',
};
const IGNORE = new Set(['group', 'linePath', 'sound', 'ph', 'btnPh']);

type Scheme = Record<string, string>;
/** Placeholder duration for objects shown until the end of the slide. */
const UNTIL_END = -1;

/** Slide length = the latest object or audio end; then "until end" objects are stretched to it. */
/**
 * Slide length: Storyline's own timeline length when the file has it (tmProps "min"), otherwise
 * the latest object or audio end. Then "until end" objects are stretched to their layer's end.
 */
function finishTimeline(layers: SlideLayer[], audio: SlideAudio[], rawEnds: Map<string, number>, declared: number[]): number {
  const base = layers[0]?.elements ?? [];
  const ends = [...base.filter((e) => e.duration < 3_600_000).map((e) => rawEnds.get(e.id) ?? e.startTime + Math.max(0, e.duration)),
    ...audio.map((a) => (a.startTime ?? 0) * 1000 + a.duration * 1000)];
  const end = Math.round(declared[0] > 0 ? declared[0] : Math.max(1000, ...ends));
  layers.forEach((l, i) => {
    const lEnd = i === 0 ? end : declared[i] > 0 ? Math.max(end, declared[i])
      : Math.max(end, ...l.elements.map((e) => rawEnds.get(e.id) ?? e.startTime + Math.max(0, e.duration)));
    for (const e of l.elements) {
      if (e.duration === UNTIL_END) e.duration = Math.max(250, lEnd - e.startTime);
    }
  });
  return end;
}
interface Ctx {
  zip: JSZip;
  media: Map<string, { file: string; name: string }>;
  dataUris: Map<string, string>;
  vars: Map<string, CourseVariable>;
  slideIdByG: Map<string, string>;
  firstSlideOfScene: Map<string, string>;
  report: Report;
  /** Timeline end (start + stored duration) of every converted object, by id; "until end" objects store the slide length. */
  rawEnds: Map<string, number>;
  /** Text defaults of layout/master placeholders, by placeholder id (slide text inherits these). */
  placeholders: Map<string, El>;
  /** Titles of slides containing question ("…Intr") objects. */
  questionSlides: Set<string>;
}

// ---------- colours, text ----------

function readScheme(master: El | null): Scheme {
  const s: Scheme = {};
  for (const c of kids(kid(master, 'clrLst'))) {
    const rgb = c.getElementsByTagName('srgbClr')[0];
    if (rgb) s[c.localName] = '#' + attr(rgb, 'val');
  }
  s.tx1 ??= s.dk1 ?? '#000000'; s.bg1 ??= s.lt1 ?? '#ffffff'; s.tx2 ??= s.dk2 ?? s.tx1; s.bg2 ??= s.lt2 ?? s.bg1;
  return s;
}

// --- colour maths for theme-colour variants ---
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, sat, l];
}
function hslToHex(h: number, sat: number, l: number): string {
  const f = (p: number, q: number, t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
  const [r, g, b] = sat === 0 ? [l, l, l] : [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  return '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
}
/**
 * Storyline's colour picker offers five lighter/darker variants of each theme
 * colour (stored as <grad val="6…10">), worked out like Office's: luminance is
 * scaled (and offset) depending on how light the base colour is.
 */
function themeVariant(hex: string, grad: number): string {
  const i = grad - 6;
  if (i < 0 || i > 4) return hex;
  const [h, sat, l] = hexToHsl(hex);
  const steps: [number, number][] = l < 0.2 ? [[0.1, 0.9], [0.25, 0.75], [0.5, 0.5], [0.75, 0.25], [0.9, 0.1]]
    : l > 0.8 ? [[0.95, 0], [0.85, 0], [0.75, 0], [0.65, 0], [0.5, 0]]
    : [[0.2, 0.8], [0.4, 0.6], [0.6, 0.4], [0.75, 0], [0.5, 0]];
  const [mod, off] = steps[i];
  return hslToHex(h, sat, Math.min(1, l * mod + off));
}
/** Mix towards white (tint) or black (shade); val is in 1/1000 of a percent of the original colour kept. */
function mix(hex: string, toward: number, keep: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => Math.round(v * keep + toward * (1 - keep)).toString(16).padStart(2, '0')).join('');
}

/** Colour of a fill/line element (solidFill, solidLine…), with transparency as #rrggbbaa. */
function colourOf(el: El | null, scheme: Scheme): string | null {
  if (!el) return null;
  const rgb = el.getElementsByTagName('srgbClr')[0];
  const sch = el.getElementsByTagName('schemeClr')[0];
  let c = rgb ? '#' + attr(rgb, 'val') : sch ? scheme[attr(sch, 'val') ?? ''] ?? null : null;
  const holder = (rgb ?? sch)?.parentElement;
  if (c && holder) {
    const grad = kid(holder, 'grad'), tint = kid(holder, 'tint'), shade = kid(holder, 'shade');
    if (grad) c = themeVariant(c, num(attr(grad, 'val')));
    if (tint) c = mix(c, 255, num(attr(tint, 'val'), 100000) / 100000);
    if (shade) c = mix(c, 0, num(attr(shade, 'val'), 100000) / 100000);
  }
  const a = el.getElementsByTagName('alpha')[0];
  if (c && a) {
    const op = num(attr(a, 'val'), 100000) / 100000;
    if (op < 0.999) c = c.slice(0, 7) + Math.round(Math.max(0, op) * 255).toString(16).padStart(2, '0');
  }
  return c;
}
/** A shape's fill: solid, or the first stop of a gradient. */
function fillOf(el: El, scheme: Scheme): string | null {
  const bG = kid(el, 'bG');
  const solid = kid(bG, 'solidFill');
  if (solid) return colourOf(solid, scheme);
  const grad = kid(bG, 'gradFill');
  if (grad) return colourOf(grad.getElementsByTagName('stop')[0] ?? null, scheme);
  return null;
}
/** Text colour like "lt1,00" or "#464653,00". */
function textColour(v: string | null, scheme: Scheme): string | null {
  if (!v) return null;
  const c = v.split(',')[0];
  return c.startsWith('#') ? c : scheme[c] ?? null;
}

interface TextInfo { text: string; size: number; bold: boolean; colour: string | null; heading: boolean; centred: boolean }

/** Storyline font sizes are points at its design scale; on a 1280×720 stage they render 16/9 larger in px. */
const FONT_SCALE = 16 / 9;

interface ParsedText { lines: string[]; first: El | null; centred: boolean }

function parseRichText(raw: string): ParsedText {
  const lines: string[] = [];
  let first: El | null = null;
  let centred = false;
  if (raw.trim()) {
    const doc = parseXml(raw);
    for (const block of Array.from(doc.getElementsByTagName('Block'))) {
      const ls = q(block, 'Style', 'ListStyle');
      const bullet = !!ls && (attr(ls, 'ListType') ?? 'None') !== 'None';
      if (lines.length === 0 && attr(q(block, 'Style'), 'Justification') === 'Center') centred = true;
      const spans = Array.from(block.getElementsByTagName('Span'));
      first ??= spans.find((sp) => (attr(sp, 'Text') ?? '').trim()) ?? null;
      const line = spans.map((sp) => attr(sp, 'Text') ?? '').join('').replace(/\n$/, '');
      lines.push(bullet && line ? '• ' + line : line);
    }
  }
  return { lines, first, centred };
}

function readText(el: El, scheme: Scheme, placeholders?: Map<string, El>): TextInfo | null {
  // "text" holds what the author set; "fmtText" has every style resolved (text can
  // leave sizes and colours to inherited defaults). Use the author's value where set.
  const own = parseRichText(kid(el, 'text')?.textContent ?? '');
  const fmt = parseRichText(kid(el, 'fmtText')?.textContent ?? '');
  const lines = own.lines.join('').trim() ? own.lines : fmt.lines;
  let text = lines.join('\n').trim();
  if (!text) text = (kid(el, 'plain')?.textContent ?? '').trim();
  if (!text) return null;
  const a = own.first ? kid(own.first, 'Style') : null;
  const b = fmt.first ? kid(fmt.first, 'Style') : null;
  const style = (name: string) => attr(a, name) ?? attr(b, name);
  // Text in a placeholder inherits the layout placeholder's defaults.
  const defs = placeholders?.get(attr(kid(el, 'ph'), 'g') ?? '') ?? null;
  const defColour = defs ? colourOf(kid(defs, 'foreClr'), scheme) : null;
  return {
    text,
    size: Math.round(num(style('FontSize') ?? attr(defs, 'sz'), 18) * FONT_SCALE),
    bold: (style('FontIsBold') ?? (attr(defs, 'style')?.includes('Bold') ? 'True' : null)) === 'True',
    colour: textColour(style('ForegroundColor'), scheme) ?? defColour,
    heading: (style('FontFamily') ?? attr(defs, 'font')) === '+major',
    centred: own.centred || fmt.centred,
  };
}

// ---------- media ----------

async function mediaUri(ctx: Ctx, assetG: string | null): Promise<string | null> {
  if (!assetG) return null;
  const m = ctx.media.get(assetG);
  if (!m) return null;
  const cached = ctx.dataUris.get(m.file);
  if (cached) return cached;
  const bytes = await ctx.zip.file(m.file)!.async('uint8array');
  const ext = m.file.split('.').pop()!.toLowerCase();
  const uri = `data:${MIME[ext] ?? 'application/octet-stream'};base64,${toBase64(bytes)}`;
  ctx.dataUris.set(m.file, uri);
  return uri;
}

// ---------- animations ----------

function animations(el: El): Pick<SlideElement, 'animationIn' | 'animationOut' | 'entranceDuration' | 'exitDuration'> & { approx: string[] } {
  const approx: string[] = [];
  const side: Record<string, string> = { l: 'left', r: 'right', t: 'top', b: 'bottom' };
  const pick = (node: El | null, dirIn: boolean): [AnimationIn | AnimationOut, number] => {
    const fx = kids(node)[0];
    if (!fx) return ['none', 500];
    const dur = isoMs(attr(fx, 'dur'), 500);
    const name = fx.localName;
    if (name === 'fade') return ['fade', dur];
    if (name === 'fly' || name === 'float') {
      const d = side[attr(fx, 'dir') ?? ''] ?? 'bottom';
      return [(dirIn ? `fly-in-${d}` : `fly-out-${d}`) as AnimationIn | AnimationOut, dur];
    }
    if (name === 'wipe') {
      // "wd" is the side the wipe starts from: entering from the left reveals left to right;
      // leaving from the right hides right to left (so it wipes towards the left).
      const d = side[attr(fx, 'wd') ?? attr(fx, 'dir') ?? ''] ?? 'left';
      const opposite: Record<string, string> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
      return [(dirIn ? `wipe-from-${d}` : `wipe-to-${opposite[d]}`) as AnimationIn | AnimationOut, dur];
    }
    if (name === 'split') return ['split', dur];
    if (name === 'zoom' || name === 'grow' || name === 'shrink') return ['zoom', dur];
    approx.push(`${name[0].toUpperCase() + name.slice(1)} animations (played as a fade)`);
    return ['fade', dur];
  };
  const [ai, ed] = pick(q(el, 'animEffect', 'entr'), true);
  const [ao, xd] = pick(q(el, 'animEffect', 'exit'), false);
  return { animationIn: ai as AnimationIn, animationOut: ao as AnimationOut, entranceDuration: ed, exitDuration: xd, approx };
}

// ---------- triggers ----------

const EVENTS: Record<string, string> = {
  OnClick: 'onClick', OnMouseHover: 'onHover', OnStart: 'timelineStart', OnEnd: 'timelineEnd',
  OnStateChange: 'stateChange', OnTimelineEvent: 'atTime',
};
const ACTION_NAMES: Record<string, string> = {
  changeShapeState: 'Change state', submitInteraction: 'Submit interaction', Move: 'Move along motion path',
  showSubSlide: 'Show layer', hideSubSlide: 'Hide layer', jumpToSlide: 'Jump to slide', jumpToScene: 'Jump to scene',
  adjustVar: 'Adjust variable', playMedia: 'Play media', pauseMedia: 'Pause media', stopMedia: 'Stop media',
  exeJavaScript: 'Execute JavaScript', lightboxSlide: 'Lightbox slide', closeLightbox: 'Close lightbox',
  submitResults: 'Submit results', reviewResults: 'Review results', resetResults: 'Reset results',
};
const EVENT_NAMES: Record<string, string> = {
  OnDrop: 'when dropped',
  OnNextButtonClick: 'when Next is clicked', OnEntersSlide: 'when slide begins', OnKeyPress: 'when a key is pressed',
  OnVarChange: 'when a variable changes', OnVariableValueChange: 'when a variable changes', OnHoverOut: 'when hover ends',
};

/** Convert one Storyline trigger, or return why it can't be. */
function convertTrigger(t: El, ctx: Ctx, layerIds: Map<string, string>, ownLayer: string, nextSlideId: string): Trigger | string {
  const d = kid(t, 'data');
  const ev = attr(d, 'event') ?? '', act = attr(d, 'action') ?? '', sub = attr(d, 'actSubType');
  const actName = ACTION_NAMES[act] ?? act;
  if (ev === 'OnNextButtonClick' || ev === 'OnPrevButtonClick') {
    if (act === 'jumpToSlide' || act === 'jumpToScene') return '';  // player Next/Prev: Chronicle's own navigation
  }
  const event = EVENTS[ev];
  if (!event) return `${actName} ${EVENT_NAMES[ev] ?? ev}`;
  const out: Trigger = { event, action: '', targetId: '' };
  const shape = kid(d, 'shape');
  if (event === 'stateChange') {
    const ids = kids(kid(shape, 'stateLst'), 'g').map((g) => safeId(g.textContent));
    const state = attr(shape, 'stateName');
    if (!ids.length || !state) return `${actName} when state changes (no objects to watch)`;
    out.stateWatch = {
      ids, state,
      ...(attr(shape, 'statesNot') && attr(shape, 'statesNot') !== 'are' ? { not: true } : {}),
      ...(attr(shape, 'stateInclude') === 'any' ? { any: true } : {}),
    };
  } else if (event === 'atTime') {
    out.time = isoMs(attr(kid(d, 'other'), 'time'), 0) / 1000;
  }
  if (act === 'changeShapeState') {
    // Without a target object, the trigger changes the player's Next button (e.g. disabled until all are visited).
    if (!attr(shape, 'setStateG')) return `Change state of the player's Next button`;
    out.action = 'changeState';
    out.targetId = safeId(attr(shape, 'setStateG'));
    out.state = attr(shape, 'setStateName') || 'Normal';
  } else if (act === 'jumpToSlide') {
    if (sub === 'prev') return 'Jump to previous slide';
    out.action = 'jumpToSlide';
    out.targetId = sub === 'next' ? nextSlideId : ctx.slideIdByG.get(attr(kid(d, 'slide'), 'jumpG') ?? '') ?? '';
  } else if (act === 'jumpToScene') {
    out.action = 'jumpToSlide';
    out.targetId = ctx.firstSlideOfScene.get(attr(kid(d, 'scene'), 'jumpG') ?? '') ?? '';
  } else if (act === 'showSubSlide') {
    out.action = 'showLayer';
    out.targetId = layerIds.get(attr(kid(d, 'sldLayer'), 'showG') ?? '') ?? '';
  } else if (act === 'hideSubSlide') {
    out.action = 'hideLayer';
    out.targetId = sub === 'me' ? ownLayer : layerIds.get(attr(kid(d, 'sldLayer'), 'hideG') ?? '') ?? '';
  } else if (act === 'adjustVar') {
    const o = kid(d, 'other');
    const v = ctx.vars.get(attr(o, 'varG') ?? attr(d, 'varG') ?? '');
    if (!v) return 'Adjust a built-in variable';
    out.action = 'adjustVariable';
    out.variableId = v.id;
    const op = attr(o, 'op');
    if (v.type === 'boolean') out.variableOperator = op === 'not' ? 'toggle' : attr(o, 'boolVal') === 'True' ? 'setTrue' : 'setFalse';
    else if (v.type === 'number') {
      out.variableOperator = ({ add: 'add', sub: 'subtract', mult: 'multiply', div: 'divide' } as Record<string, string>)[op ?? ''] ?? 'setNumber';
      out.variableValue = num(attr(o, 'dblVal'));
    } else { out.variableOperator = op === 'add' ? 'append' : 'setText'; out.variableValue = attr(o, 'varVal1') ?? ''; }
  } else if (act === 'exitProject') out.action = 'exitCourse';
  else if (act === 'CompleteCourse') out.action = 'completeCourse';
  else return actName;
  if (!out.targetId && ['jumpToSlide', 'showLayer', 'hideLayer'].includes(out.action)) return `${actName} (target not found)`;

  const conds: TriggerCondition[] = [];
  for (const c of kids(kid(t, 'condLst'), 'trigCond')) {
    if (attr(c, 'andOr') === 'or') return `${actName} with "or" conditions`;
    if (attr(c, 'dataType') === 'state') {
      const ss = kid(c, 'shapeState');
      const op = attr(ss, 'op') === 'noteq' ? 'notEquals' : attr(ss, 'op') === 'eq' ? 'equals' : null;
      if (!attr(ss, 'shapeG') || !attr(ss, 'name') || !op) return `${actName} with an unsupported state condition`;
      conds.push({ variableId: '', elementId: safeId(attr(ss, 'shapeG')), operator: op, state: attr(ss, 'name')!, value: '' });
      continue;
    }
    const v = ctx.vars.get(attr(c, 'varG') ?? '');
    if (!v) return `${actName} that depends on a built-in variable`;
    const op = ({ eq: 'equals', neq: 'notEquals', gt: 'greaterThan', lt: 'lessThan', gte: 'greaterThanOrEqual', lte: 'lessThanOrEqual' } as Record<string, string>)[attr(c, 'op') ?? ''];
    if (!op) return `${actName} with an unsupported condition`;
    const value = v.type === 'boolean' ? attr(c, 'boolVal') === 'True' : v.type === 'number' ? num(attr(c, 'floatVal1')) : attr(c, 'strVal1') ?? '';
    conds.push({ variableId: v.id, operator: op, value });
  }
  if (conds.length) out.conditions = conds;
  return out;
}

// ---------- objects ----------

interface Convert { scheme: Scheme; slideTitle: string; layerIds: Map<string, string>; ownLayer: string; nextSlideId: string }

/** Objects of one shape list, in stacking order (bottom first), with group members placed where their group is. */
function stackingOrder(list: El | null): El[] {
  const all = kids(list).filter((e) => attr(e, 'g'));
  const present = new Set(all.map((e) => attr(e, 'g')!));
  const byParent = new Map<string, El[]>();
  const top: El[] = [];
  for (const e of all) {
    const p = attr(e, 'parentG');
    if (p && present.has(p)) { if (!byParent.has(p)) byParent.set(p, []); byParent.get(p)!.push(e); } else top.push(e);
  }
  const z = (e: El) => num(attr(e, 'zOrder'), 0);
  const out: El[] = [];
  const visit = (e: El) => {
    out.push(e);
    (byParent.get(attr(e, 'g')!) ?? []).sort((a, b) => z(a) - z(b)).forEach(visit);
  };
  top.sort((a, b) => z(a) - z(b)).forEach(visit);
  return out;
}

/**
 * Each state stores a full copy of the object (the child named by the state's
 * defG) plus any objects added to that state, positioned relative to the object.
 */
function stateCopy(st: El): { copy: El | null; extras: El[] } {
  const all = kids(kid(st, 'shapeLst'));
  const copy = all.find((c) => attr(c, 'g') && attr(c, 'g') === attr(st, 'defG')) ?? all[0] ?? null;
  return { copy, extras: all.filter((c) => c !== copy) };
}

/** The look of an object in a given state. */
function stateShape(el: El, name: string): El | null {
  for (const s of kids(kid(el, 'stateLst'), 'state')) {
    if (attr(s, 'name') === name) { const { copy } = stateCopy(s); if (copy) return copy; }
  }
  return null;
}

/** The look properties Chronicle keeps for one copy of an object (its Normal look or a state's). */
async function lookOfCopy(copy: El, el: SlideElement, ctx: Ctx, cv: Convert): Promise<StateLook> {
  if (el.type === 'image') {
    const ag = attr(q(copy, 'bG', 'picFill'), 'assetG') ?? (copy.localName === 'pic' || copy.localName === 'svgimage' ? attr(copy, 'assetG') : null);
    const src = ag ? await mediaUri(ctx, ag) : null;
    return src ? { src } : {};
  }
  const text = readText(copy, cv.scheme, ctx.placeholders);
  const fill = fillOf(copy, cv.scheme);
  if (el.type === 'text') {
    return {
      backgroundColor: fill ?? 'transparent',
      ...(text ? { content: text.text, textColor: text.colour ?? '#000000', fontSize: text.size, fontWeight: text.bold ? '700' : '400' } : {}),
    };
  }
  if (el.type === 'shape') {
    const line = q(copy, 'bG', 'solidLine');
    return {
      fillColor: fill ?? 'transparent',
      borderColor: colourOf(line, cv.scheme) ?? 'transparent',
      borderWidth: line ? Math.max(1, Math.round(num(attr(q(copy, 'bG', 'lineStyle'), 'w'), 1))) : 0,
      ...(text ? { text: text.text, textColor: text.colour ?? '#000000', fontSize: text.size } : {}),
    };
  }
  return {};
}

/**
 * Storyline states → Chronicle states. Each Storyline state is a full copy of
 * the object; Chronicle keeps only what differs from the Normal state.
 * `looks` = false keeps just the state names (objects whose look Chronicle
 * draws differently, e.g. lines), so Hidden/Disabled and triggers still work.
 */
async function addStates<T extends SlideElement>(e: El, el: T, looks: boolean, ctx: Ctx, cv: Convert): Promise<T> {
  const states: ElementState[] = [];
  const normalCopy = stateShape(e, 'Normal') ?? e;
  const normal = looks ? await lookOfCopy(normalCopy, el, ctx, cv) : {};
  for (const st of kids(kid(e, 'stateLst'), 'state')) {
    const name = (attr(st, 'name') ?? '').trim();
    if (!name || name === 'Normal' || states.some((x) => x.name === name)) continue;
    const { copy } = stateCopy(st);
    const look: StateLook = {};
    if (looks && copy) {
      const full = await lookOfCopy(copy, el, ctx, cv);
      for (const [k, v] of Object.entries(full)) {
        if (v !== (normal as Record<string, unknown>)[k]) (look as Record<string, unknown>)[k] = v;
      }
    }
    states.push({ name, look });
  }
  const init = (attr(e, 'initState') ?? '').trim();
  if (init && init !== 'Normal' && !states.some((x) => x.name === init)) states.push({ name: init, look: {} });
  if (!states.length) return el;
  const set = (attr(e, 'grpId') ?? '').trim();
  return {
    ...el,
    states,
    ...(init && init !== 'Normal' ? { initialState: init } : {}),
    ...(set && states.some((x) => x.name === 'Selected') ? { buttonSet: set.slice(0, 40) } : {}),
  };
}

/** An object's own time window on its timeline; "show until end" objects end at Infinity. */
function ownWindow(e: El): { start: number; end: number } {
  const tm = kids(kid(e, 'tmCtxLst'))[0];
  const start = Math.round(num(attr(tm, 'start')));
  const untilEnd = attr(tm, 'untilEnd') === 'true' || attr(tm, 'alwysShw') === 'true';
  return { start, end: untilEnd ? Infinity : start + Math.round(num(attr(tm, 'dur'), 5000)) };
}

/**
 * Objects placed inside an object's states (e.g. a tick shown in its Selected
 * state, an icon on a button). Storyline keeps a copy in every state that has
 * it, positioned relative to the object; identical copies become one Chronicle
 * object listing those states. They follow the object's timing and show only
 * while it's drawn in one of them. `below` go under the object, `above` over it.
 */
async function stateChildren(e: El, parent: SlideElement, ctx: Ctx, cv: Convert): Promise<{ below: SlideElement[]; above: SlideElement[] }> {
  const byKey = new Map<string, { el: SlideElement; below: boolean }>();
  const loc = kid(e, 'loc');
  const ox = Math.min(num(attr(loc, 'l')), num(attr(loc, 'r'))), oy = Math.min(num(attr(loc, 't')), num(attr(loc, 'b')));
  for (const st of kids(kid(e, 'stateLst'), 'state')) {
    const name = (attr(st, 'name') ?? '').trim();
    const { copy, extras } = stateCopy(st);
    if (!name || !extras.length) continue;
    const copyZ = num(attr(copy, 'zOrder'), 0);
    for (const x of extras) {
      const holder = e.ownerDocument.createElement('shapeLst');
      holder.appendChild(x.cloneNode(true));
      for (const child of await convertObjects(holder, ctx, cv)) {
        const placed = {
          ...child, x: child.x + Math.round(ox), y: child.y + Math.round(oy),
          startTime: parent.startTime, duration: parent.duration,
          animationIn: parent.animationIn, animationOut: parent.animationOut,
          entranceDuration: parent.entranceDuration, exitDuration: parent.exitDuration,
        } as SlideElement;
        const { id: _id, ...look } = placed;
        void _id;
        const key = JSON.stringify(look);
        const seen = byKey.get(key);
        if (seen) { if (!seen.el.stateParent!.states.includes(name)) seen.el.stateParent!.states.push(name); continue; }
        placed.stateParent = { id: parent.id, states: [name] };
        const end = ctx.rawEnds.get(parent.id);
        if (end != null) ctx.rawEnds.set(placed.id, end);
        byKey.set(key, { el: placed, below: num(attr(x, 'zOrder'), 0) < copyZ });
      }
    }
  }
  const list = [...byKey.values()];
  return { below: list.filter((c) => c.below).map((c) => c.el), above: list.filter((c) => !c.below).map((c) => c.el) };
}

async function convertObjects(list: El | null, ctx: Ctx, cv: Convert): Promise<SlideElement[]> {
  const els: SlideElement[] = [];
  const rep = (kind: ImportIssue['kind'], msg: string) => ctx.report.add(kind, msg, cv.slideTitle);
  // Groups' animations apply to their members.
  const byG = new Map(kids(list).filter((x) => attr(x, 'g')).map((x) => [attr(x, 'g')!, x] as const));
  const groupsOf = (e: El): El[] => {
    const out: El[] = [];
    for (let p = byG.get(attr(e, 'parentG') ?? ''); p && !out.includes(p); p = byG.get(attr(p, 'parentG') ?? '')) out.push(p);
    return out;
  };
  for (const e of stackingOrder(list)) {
    const tag = e.localName;
    if (IGNORE.has(tag)) {
      if (tag === 'linePath') rep('skipped', 'Motion paths');
      continue;
    }
    const loc = kid(e, 'loc');
    if (!loc) continue;
    const l = num(attr(loc, 'l')), t = num(attr(loc, 't')), r = num(attr(loc, 'r')), b = num(attr(loc, 'b'));
    const tm = kids(kid(e, 'tmCtxLst'))[0];
    // Grouped objects keep their own timing: in the published output a group simply shows while its
    // members do (the group's own timing in the file can be stale). They do play the group's animations.
    const own = ownWindow(e);
    const { start, end } = own;
    const anim = animations(e);
    anim.approx.forEach((m) => rep('approximated', m));
    for (const g of groupsOf(e)) {
      const ga = animations(g);
      if (anim.animationIn === 'none' && ga.animationIn !== 'none') {
        anim.animationIn = ga.animationIn; anim.entranceDuration = ga.entranceDuration; ga.approx.forEach((m) => rep('approximated', m));
      }
      if (anim.animationOut === 'none' && ga.animationOut !== 'none') { anim.animationOut = ga.animationOut; anim.exitDuration = ga.exitDuration; }
    }
    const base = {
      id: safeId(attr(e, 'g')),
      x: Math.round(Math.min(l, r)), y: Math.round(Math.min(t, b)),
      width: Math.max(1, Math.round(Math.abs(r - l))), height: Math.max(1, Math.round(Math.abs(b - t))),
      startTime: start,
      // "Show until end" objects are stretched to the slide's end once it's known (see finishTimeline).
      duration: end === Infinity ? UNTIL_END : end - start,
      triggers: [] as Trigger[],
      animationIn: anim.animationIn, animationOut: anim.animationOut, entranceDuration: anim.entranceDuration, exitDuration: anim.exitDuration,
    };
    ctx.rawEnds.set(base.id, own.start + Math.round(num(attr(tm, 'dur'), 0)));
    if (num(attr(e, 'rot'), -1) > 0 && num(attr(e, 'rot')) % 360 !== 0) rep('approximated', 'Rotated objects (shown unrotated)');
    /** Adds the object's states (and initial state, button set) to the converted element. */
    const withStates = async <T extends SlideElement>(el: T, looks = true): Promise<T> => addStates(e, el, looks, ctx, cv);
    /** Adds the converted element with its states, then any objects placed inside its states. */
    const push = async (el: SlideElement, looks = true) => {
      const inner = looks ? await stateChildren(e, el, ctx, cv) : { below: [], above: [] };
      els.push(...inner.below, await withStates(el, looks), ...inner.above);
    };
    for (const trg of kids(kid(e, 'trigLst'), 'trig')) {
      const res = convertTrigger(trg, ctx, cv.layerIds, cv.ownLayer, cv.nextSlideId);
      if (typeof res === 'string') { if (res) rep('skipped', `Trigger: ${res}`); }
      else { base.triggers.push(res); ctx.report.counts.triggers++; }
    }

    const table = kid(e, 'table');
    if (table) {
      const rows = kids(kid(table, 'rows'), 'tableRow');
      const nCols = kids(kid(table, 'columns'), 'tableColumn').length;
      if (rows.length && nCols && rows.length <= 50 && nCols <= 20) {
        let size = 0, colour: string | null = null;
        const cellData = rows.map((row) => {
          const cells = kids(kid(row, 'cells'), 'tableCell');
          return Array.from({ length: nCols }, (_, c) => {
            const parsed = parseRichText(attr(cells[c], 'text') ?? '');
            const st = parsed.first ? kid(parsed.first, 'Style') : null;
            if (!size && attr(st, 'FontSize')) size = num(attr(st, 'FontSize'));
            // Body text colour (the header row is often white-on-colour; Chronicle tables have a white background).
            if (row === rows[rows.length - 1] && !colour && parsed.lines.join('').trim()) colour = textColour(attr(st, 'ForegroundColor'), cv.scheme);
            return parsed.lines.join('\n').trim();
          });
        });
        await push({
          ...base, type: 'table', rowCount: rows.length, colCount: nCols, cellData,
          ...(size ? { fontSize: Math.round(size * FONT_SCALE) } : {}), ...(colour ? { textColor: colour } : {}),
        } as SlideElement, false);
        rep('approximated', 'Tables (cell colours and column widths not kept)');
        continue;
      }
    }
    if (tag === 'pic' || tag === 'svgimage') {
      const src = await mediaUri(ctx, attr(e, 'assetG'));
      if (!src) { rep('skipped', 'Pictures whose file is missing from the .story'); continue; }
      const img: ImageElement = { ...base, type: 'image', src, alt: attr(e, 'altText') ?? ctx.media.get(attr(e, 'assetG')!)?.name ?? '', fit: 'fill' };
      await push(img);
      continue;
    }
    if (tag === 'video') {
      const src = await mediaUri(ctx, attr(e, 'assetG'));
      if (!src) { rep('skipped', 'Videos whose file is missing from the .story'); continue; }
      await push({ ...base, type: 'video', src, controls: true, autoplay: false } as VideoElement, false);
      continue;
    }
    if (tag === 'line') {
      const lw = Math.max(1, Math.round(num(attr(q(e, 'bG', 'lineStyle'), 'w'), 2)));
      const colour = colourOf(q(e, 'bG', 'solidLine'), cv.scheme) ?? '#000000';
      const horizontal = Math.abs(b - t) < 1, vertical = Math.abs(r - l) < 1;
      if (!horizontal && !vertical) { rep('skipped', 'Diagonal lines'); continue; }
      await push({
        ...base, type: 'shape', shapeType: 'rectangle', fillColor: colour, borderColor: colour, borderWidth: 0, borderRadius: 0,
        ...(horizontal ? { y: Math.round(t - lw / 2), height: lw } : { x: Math.round(l - lw / 2), width: lw }),
      } as ShapeElement, false);
      if (q(e, 'bG', 'lineStyle', 'arrow', 'end') && attr(q(e, 'bG', 'lineStyle', 'arrow', 'end'), 'type') !== 'none'
        && attr(q(e, 'bG', 'lineStyle', 'arrow', 'end'), 'type') !== 'def') rep('approximated', 'Arrowheads on lines');
      continue;
    }
    if (tag === 'textBox' || SHAPES[tag]) {
      const look = stateShape(e, 'Normal') ?? e;
      // The shape drawn is the Normal state's (the object's own tag can differ, e.g. after "change shape").
      const shapeTag = look !== e && (SHAPES[look.localName] || look.localName === 'textBox') ? look.localName : tag;
      const text = readText(look, cv.scheme, ctx.placeholders) ?? readText(e, cv.scheme, ctx.placeholders);
      // Picture-filled shapes (e.g. photos in rounded frames) become pictures.
      const picFill = q(look, 'bG', 'picFill') ?? q(e, 'bG', 'picFill');
      if (picFill) {
        const src = await mediaUri(ctx, attr(picFill, 'assetG'));
        if (src) {
          await push({ ...base, type: 'image', src, alt: '', fit: 'cover', ...(ROUNDED.has(shapeTag) ? { borderRadius: Math.round(Math.min(base.width, base.height) * 0.12) } : {}) } as ImageElement);
          if (shapeTag !== 'rect' && !ROUNDED.has(shapeTag)) rep('approximated', 'Pictures inside non-rectangular shapes (shown as rectangles)');
          if (text) rep('skipped', 'Text on picture-filled shapes');
          continue;
        }
      }
      if (text && /%[A-Za-z_][\w.]*%/.test(text.text)) rep('approximated', 'Text that shows a variable\'s value (shows the variable name)');
      const fill = fillOf(look, cv.scheme);
      if (shapeTag === 'textBox' || (!fill && text && !q(look, 'bG', 'solidLine'))) {
        if (!text) continue;
        // Storyline lets text spill out of its box; Chronicle clips it, so make the box tall enough.
        const lineCount = text.text.split('\n').length;
        const minH = Math.ceil(lineCount * text.size * 1.25 + 16);
        if (base.height < minH) { if (attr(e, 'vertAlign') === 'b') base.y -= minH - base.height; else if (attr(e, 'vertAlign') === 'm') base.y -= Math.round((minH - base.height) / 2); base.height = minH; }
        const te: TextElement = {
          ...base, type: 'text', content: text.text, fontSize: text.size, fontWeight: text.bold ? '700' : '400',
          textColor: text.colour ?? '#000000', backgroundColor: fill ?? 'transparent',
          ...(text.heading ? { fontRole: 'heading' as const } : {}),
        };
        await push(te);
        continue;
      }
      const line = q(look, 'bG', 'solidLine');
      const se: ShapeElement = {
        ...base, type: 'shape', shapeType: SHAPES[shapeTag], fillColor: fill ?? 'transparent',
        borderColor: colourOf(line, cv.scheme) ?? 'transparent',
        borderWidth: line ? Math.max(1, Math.round(num(attr(q(look, 'bG', 'lineStyle'), 'w'), 1))) : 0,
        ...(shapeTag === 'rect' || shapeTag === 'textBox' || shapeTag.startsWith('snip') ? { borderRadius: 0 } : {}),
        ...(ROUNDED.has(shapeTag) ? { borderRadius: Math.round(Math.min(base.width, base.height) * 0.15) } : {}),
      };
      if (text) { se.text = text.text; se.textColor = text.colour ?? '#000000'; se.fontSize = text.size; }
      if (shapeTag !== 'rect' && shapeTag !== 'roundRect' && ROUNDED.has(shapeTag)) rep('approximated', 'Shapes with only some corners rounded (all corners rounded)');
      await push(se);
      continue;
    }
    if (/Intr$/.test(tag)) ctx.questionSlides.add(cv.slideTitle);
    rep('skipped', UNSUPPORTED[tag] ?? `Other objects (${tag})`);
  }
  return els;
}

/** The audio clips (sound objects) in a shape list, with their start times. */
async function readAudio(list: El | null, ctx: Ctx): Promise<SlideAudio[]> {
  const out: SlideAudio[] = [];
  for (const snd of kids(list, 'sound')) {
    const src = await mediaUri(ctx, attr(snd, 'assetG'));
    if (!src) continue;
    const tm = kids(kid(snd, 'tmCtxLst'))[0];
    const start = num(attr(tm, 'start')) / 1000;
    out.push({
      id: safeId(attr(snd, 'g')), name: ctx.media.get(attr(snd, 'assetG')!)?.name ?? 'Audio', src,
      duration: num(attr(tm, 'dur')) / 1000, ...(start > 0 ? { startTime: start } : {}), captions: [],
    });
  }
  return out;
}

/** A background fill (slide, layout or master) as a full-size object, or null. */
async function backgroundObject(owner: El, ctx: Ctx, scheme: Scheme, w: number, h: number, id: string): Promise<SlideElement | null> {
  const bg = kid(owner, 'bg');
  if (!bg) return null;
  const common = { id, x: 0, y: 0, width: w, height: h, startTime: 0, duration: 3_600_000, triggers: [], animationIn: 'none' as const, animationOut: 'none' as const, entranceDuration: 0, exitDuration: 0, isLocked: true };
  const pic = kid(bg, 'picFill');
  if (pic) {
    const src = await mediaUri(ctx, attr(pic, 'assetG'));
    if (src) return { ...common, type: 'image', src, alt: '', fit: 'cover' } as ImageElement;
  }
  const solid = kid(bg, 'solidFill');
  const grad = kid(bg, 'gradFill');
  const c = solid ? colourOf(solid, scheme) : grad ? colourOf(grad.getElementsByTagName('stop')[0] ?? null, scheme) : null;
  if (!c) return null;
  return { ...common, type: 'shape', shapeType: 'rectangle', fillColor: c, borderColor: c, borderWidth: 0, borderRadius: 0 } as ShapeElement;
}

// ---------- main ----------

const FONT_MAP: Record<string, string> = {
  inter: 'Inter, sans-serif', arial: 'Arial, sans-serif', helvetica: 'Helvetica, sans-serif', georgia: 'Georgia, serif',
  'times new roman': 'Times New Roman, serif', verdana: 'Verdana, sans-serif', tahoma: 'Tahoma, sans-serif',
  'trebuchet ms': 'Trebuchet MS, sans-serif', roboto: 'Roboto, sans-serif', 'segoe ui': 'Segoe UI, sans-serif', calibri: 'Calibri, sans-serif',
  'courier new': 'Courier New, monospace',
};

export async function importStory(data: Blob | ArrayBuffer | Uint8Array, onProgress?: (done: number, total: number) => void): Promise<StoryImportResult> {
  const zip = await JSZip.loadAsync(data);
  const read = async (p: string) => { const f = zip.file(p.replace(/^\//, '')); if (!f) throw new Error(`Missing ${p} — is this a Storyline .story file?`); return parseXml(await f.async('string')).documentElement; };
  const rels = async (p: string) => {
    const f = zip.file(p.replace(/^\//, ''));
    const m = new Map<string, { target: string; type: string }>();
    if (f) for (const r of kids(parseXml(await f.async('string')).documentElement)) m.set(attr(r, 'Id')!, { target: attr(r, 'Target')!, type: attr(r, 'Type')! });
    return m;
  };
  const story = await read('story/story.xml');
  const storyRels = await rels('story/_rels/story.xml.rels');
  const report = new Report();

  // media: match story.xml entries to zip files by MD5
  const byMd5 = new Map<string, string>();
  const mediaFiles = Object.keys(zip.files).filter((n) => n.startsWith('story/media/') && !zip.files[n].dir);
  for (const n of mediaFiles) byMd5.set(md5Hex(await zip.file(n)!.async('uint8array')), n);
  const media = new Map<string, { file: string; name: string }>();
  for (const m of kids(q(story, 'mediaLst', 'mediaLst'))) {
    const file = byMd5.get((m.getElementsByTagName('stream')[0]?.textContent ?? '').trim().toLowerCase());
    if (file) media.set(attr(m, 'g')!, { file, name: attr(m, 'displayName') ?? '' });
  }

  // variables (user variables only; built-in ones like Player.* and quiz ones are skipped)
  const vars = new Map<string, CourseVariable>();
  for (const v of kids(kid(story, 'varLst'), 'var')) {
    const name = attr(v, 'name') ?? '';
    if (attr(v, 'type') === 'builtIn' || name.includes('.')) continue;
    const type = attr(v, 'dataType') === 'bool' ? 'boolean' : attr(v, 'dataType') === 'num' ? 'number' : 'text';
    const raw = attr(v, 'val') ?? '';
    vars.set(attr(v, 'g')!, {
      id: safeId(attr(v, 'g')), name: name.replace(/\s+/g, '_'), type,
      defaultValue: type === 'boolean' ? raw.toLowerCase() === 'true' : type === 'number' ? num(raw) : raw,
    });
  }

  // slides in scene order
  interface SlideRef { file: string; webId: string; scene: string; sceneG: string; el?: El }
  const refs: SlideRef[] = [];
  for (const sc of kids(kid(story, 'sceneLst'), 'scene')) {
    for (const id of kids(kid(sc, 'sldIdLst'))) {
      const rel = storyRels.get(id.textContent ?? '');
      if (rel) refs.push({ file: rel.target, webId: (id.textContent ?? '').replace(/^R/, ''), scene: attr(sc, 'name') ?? '', sceneG: attr(sc, 'g') ?? '' });
    }
  }
  if (!refs.length) throw new Error('No slides found in this .story file');
  for (const r of refs) r.el = await read(r.file);
  const slideIdByG = new Map<string, string>();
  const firstSlideOfScene = new Map<string, string>();
  for (const r of refs) {
    slideIdByG.set(attr(r.el!, 'g')!, safeId(r.webId));
    if (!firstSlideOfScene.has(r.sceneG)) firstSlideOfScene.set(r.sceneG, safeId(r.webId));
  }
  const ctx: Ctx = { zip, media, dataUris: new Map(), vars, slideIdByG, firstSlideOfScene, report, questionSlides: new Set(), rawEnds: new Map(), placeholders: new Map() };
  const bankSlides = kids(q(story, 'quizMgr', 'bankLst'), 'scene').reduce((n, s) => n + kids(kid(s, 'sldIdLst')).length, 0);
  for (let i = 0; i < bankSlides; i++) report.add('skipped', 'Question bank slides', '');

  // masters and layouts
  const masters = new Map<string, { el: El; scheme: Scheme }>();  // by master g
  const layoutByInternalG = new Map<string, { el: El; master: string }>();
  for (const n of Object.keys(zip.files).filter((f) => /^story\/slideMasters\/[^/]+\.xml$/.test(f))) {
    const m = await read(n);
    masters.set(attr(m, 'g')!, { el: m, scheme: readScheme(m) });
    for (const d of Array.from(m.getElementsByTagName('defaults'))) if (d.parentElement && attr(d.parentElement, 'g')) ctx.placeholders.set(attr(d.parentElement, 'g')!, d);
    const mr = await rels(n.replace('slideMasters/', 'slideMasters/_rels/') + '.rels');
    for (const lid of kids(kid(m, 'layoutIdLst'))) {
      const rel = mr.get(lid.textContent ?? '');
      if (!rel) continue;
      const layout = await read(rel.target);
      for (const d of Array.from(layout.getElementsByTagName('defaults'))) if (d.parentElement && attr(d.parentElement, 'g')) ctx.placeholders.set(attr(d.parentElement, 'g')!, d);
      layoutByInternalG.set(attr(layout, 'internalG') ?? attr(layout, 'g')!, { el: layout, master: attr(m, 'g')! });
    }
  }
  const firstMaster = [...masters.values()][0];
  const defaultScheme = firstMaster?.scheme ?? {};

  // story size
  const sizeEl = refs[0].el!.getElementsByTagName('sldSz')[0];
  const W = Math.round(num(attr(sizeEl, 'w'), 1280)) || 1280, H = Math.round(num(attr(sizeEl, 'h'), 720)) || 720;

  const masterSlides: Slide[] = [];
  const masterIdForLayout = new Map<string, string>();
  /** Has its own background fill (otherwise it shows the layout's/master's). */
  const hasBg = (el: El) => !!kid(el, 'bg') && kids(kid(el, 'bg')).some((c) => ['solidFill', 'gradFill', 'picFill'].includes(c.localName));
  /**
   * The Chronicle master for a slide: its layout's objects on top of the
   * master's, over the background. Master objects draw beneath slide objects,
   * so a slide with its own background gets its own variant of the master.
   */
  async function masterFor(layoutG: string | null, slide: El): Promise<{ id?: string; scheme: Scheme }> {
    const lay = layoutG ? layoutByInternalG.get(layoutG) : undefined;
    if (!lay) return { scheme: defaultScheme };
    const m = masters.get(lay.master)!;
    const ownBg = hasBg(slide) ? new XMLSerializer().serializeToString(kid(slide, 'bg')!) : '';
    const key = layoutG + '|' + ownBg;
    let id = masterIdForLayout.get(key);
    if (!id) {
      const variant = [...masterIdForLayout.keys()].filter((k) => k.startsWith(layoutG + '|')).length;
      id = safeId(layoutG, 'layout-').slice(0, 56) + (variant ? `-v${variant}` : '');
      masterIdForLayout.set(key, id);
      const title = ((attr(lay.el, 'name') || attr(m.el, 'name') || 'Layout') + (variant ? ` (${variant + 1})` : '')).slice(0, 30);
      const cv: Convert = { scheme: m.scheme, slideTitle: `Master: ${title}`, layerIds: new Map(), ownLayer: '', nextSlideId: '' };
      const bg = (ownBg ? await backgroundObject(slide, ctx, m.scheme, W, H, `${id}-sbg`) : null)
        ?? (await backgroundObject(lay.el, ctx, m.scheme, W, H, `${id}-bg`)) ?? (await backgroundObject(m.el, ctx, m.scheme, W, H, `${id}-mbg`));
      const elements = [
        ...(bg ? [bg] : []),
        ...(await convertObjects(kid(m.el, 'shapeLst'), ctx, cv)),
        ...(await convertObjects(kid(lay.el, 'shapeLst'), ctx, cv)),
      ].map((el) => ({ ...el, id: safeId(el.id, `${id.slice(0, 24)}-`), triggers: [], startTime: 0, duration: 3_600_000, animationIn: 'none' as const, animationOut: 'none' as const }));
      // Master objects stay on screen for the whole slide, whatever its length.
      masterSlides.push({ id, title, elements, duration: 5000, layers: [{ id: `${id}-base`, name: 'Base Layer', visible: true, locked: false, elements }] });
      report.counts.masters++;
    }
    return { id, scheme: m.scheme };
  }

  const slides: Slide[] = [];
  for (const [i, r] of refs.entries()) {
    onProgress?.(i, refs.length);
    const s = r.el!;
    const id = safeId(r.webId);
    const title = (attr(s, 'name') || `Slide ${i + 1}`).trim();
    const { id: masterId, scheme } = await masterFor(attr(s, 'layoutG'), s);
    const layerEls = kids(kid(s, 'sldLayerLst'), 'sldLayer');
    const layerIds = new Map(layerEls.map((l) => [attr(l, 'g')!, safeId(attr(l, 'g'))] as const));
    const nextSlideId = refs[i + 1] ? safeId(refs[i + 1].webId) : '';
    const cv = (ownLayer: string): Convert => ({ scheme, slideTitle: title, layerIds, ownLayer, nextSlideId });

    // Without a master, the slide's own background goes at the bottom of the slide.
    const bg = masterId ? null : await backgroundObject(s, ctx, scheme, W, H, `${id}-bg`);
    const baseEls = [...(bg ? [bg] : []), ...(await convertObjects(kid(s, 'shapeLst'), ctx, cv('')))];
    const layers: SlideLayer[] = [{ id: `${id}-base`, name: 'Base Layer', visible: true, locked: false, elements: baseEls }];
    for (const l of layerEls) {
      const lid = layerIds.get(attr(l, 'g')!)!;
      const layerElements = await convertObjects(kid(l, 'shapeLst'), ctx, cv(lid));
      // Layer triggers go on the layer's first object (Chronicle triggers belong to objects); "when the
      // timeline starts" on a layer's object runs each time the layer is shown. Chronicle layers have no
      // timeline of their own, so "when it ends / reaches a time" can't be kept.
      for (const trg of kids(kid(l, 'trigLst'), 'trig')) {
        const res = convertTrigger(trg, ctx, layerIds, lid, nextSlideId);
        if (typeof res === 'string') { if (res) report.add('skipped', `Trigger: ${res}`, title); }
        else if (res.event === 'timelineEnd' || res.event === 'atTime') report.add('skipped', "Layer triggers that run when the layer's timeline ends or reaches a time", title);
        else if (!layerElements.length) report.add('skipped', 'Triggers on empty layers', title);
        else { layerElements[0].triggers.push(res); report.counts.triggers++; }
      }
      layers.push({ id: lid, name: (attr(l, 'name') || 'Layer').trim(), visible: false, locked: false, elements: layerElements });
      report.counts.layers++;
      // Layer audio starts relative to when the layer is shown (each Storyline layer has its own timeline).
      const layerAudio = await readAudio(kid(l, 'shapeLst'), ctx);
      if (layerAudio.length) layers[layers.length - 1].audio = layerAudio;
    }
    // Slide triggers go on the slide's first object (Chronicle triggers belong to objects), or on
    // an invisible hotspot when the slide has none.
    for (const trg of kids(kid(s, 'trigLst'), 'trig')) {
      const res = convertTrigger(trg, ctx, layerIds, '', nextSlideId);
      if (typeof res === 'string') { if (res) report.add('skipped', `Trigger: ${res}`, title); continue; }
      if (!baseEls.length) {
        baseEls.push({
          id: `${id}-triggers`, type: 'hotspot', x: 0, y: 0, width: 1, height: 1, startTime: 0, duration: UNTIL_END, triggers: [],
          animationIn: 'none', animationOut: 'none', entranceDuration: 0, exitDuration: 0,
        });
      }
      baseEls[0].triggers.push(res);
      report.counts.triggers++;
    }
    // Audio on the base layer, at its start time on the slide's timeline.
    const audio = await readAudio(kid(s, 'shapeLst'), ctx);
    if (kid(s, 'questionLst') || ctx.questionSlides.has(title)) {
      report.add('approximated', 'Question slides (content imported, scoring not yet)', title);
    }
    const timelineLength = (el: El) => Math.round(num(attr(kid(el, 'tmProps'), 'min'), 0));
    const duration = finishTimeline(layers, audio, ctx.rawEnds, [timelineLength(s), ...layerEls.map(timelineLength)]);
    const notes = (kid(s, 'note')?.textContent ?? '').trim();
    slides.push({
      id, title: title.slice(0, 30), group: r.scene || undefined, masterId,
      elements: layers.flatMap((l) => l.elements), layers, audio, duration,
      ...(notes ? { notes } : {}), advanceMode: 'manual',
    });
    report.counts.slides++;
    report.counts.objects += layers.reduce((n, l) => n + l.elements.length, 0);
  }
  onProgress?.(refs.length, refs.length);

  // fonts, colours, title
  const fonts = kid(firstMaster?.el, 'fonts');
  const font = (name: string | null) => FONT_MAP[(name ?? '').toLowerCase()];
  // The course title lives in the player settings (playerProps.xml).
  let title = '';
  const pp = zip.file('story/playerProps.xml');
  if (pp) {
    const m = /<option name="title_text" value="([^"]*)"/.exec(await pp.async('string'));
    if (m) title = parseXml(`<t>${m[1]}</t>`).documentElement.textContent?.trim() ?? '';
  }
  const s = defaultScheme;
  const payload: ProjectLoadPayload = {
    slides,
    masterSlides,
    variables: [...vars.values()],
    courseSettings: {
      canvasDimensions: { width: W, height: H },
      themeColors: [s.accent1, s.accent2, s.accent3, s.accent4, s.dk1, s.lt1].map((c) => c ?? '#888888'),
      ...(font(attr(fonts, 'minor')) ? { bodyFont: font(attr(fonts, 'minor')) } : {}),
      ...(font(attr(fonts, 'major')) ? { headingFont: font(attr(fonts, 'major')) } : {}),
    },
    ...(title ? { playerSettings: { courseTitle: title } } : {}),
  };
  for (const n of [attr(fonts, 'minor'), attr(fonts, 'major')]) if (n && !font(n)) report.add('approximated', `Font "${n}" (replaced with the default font)`, '');
  return {
    payload,
    report: {
      title, slides: report.counts.slides, scenes: kids(kid(story, 'sceneLst'), 'scene').length, layers: report.counts.layers,
      masters: report.counts.masters, objects: report.counts.objects, variables: vars.size, triggersConverted: report.counts.triggers,
      issues: report.issues(),
    },
  };
}

