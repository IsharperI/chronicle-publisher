/**
 * Video export: plays the course into an off-screen <canvas> and records it
 * with MediaRecorder (plus slide audio) as one MP4, or one MP4 per slide
 * (zipped).
 *
 * This is a simplified, fourth renderer (see docs/ARCHITECTURE.md). It draws
 * what a learner would see with no interaction: white slides, master slide
 * elements, each slide's initially visible layers, element timing with
 * fade/fly entrance and exit animations, theme colors, multi-line and bullet
 * text, every shape type, quiz questions (unanswered) and captions.
 *
 * Recording happens in real time (MediaRecorder can't go faster), so a
 * 10-minute course takes about 10 minutes. The whole course is recorded in one
 * pass. Frames are driven by a timer rather than requestAnimationFrame, so
 * recording keeps going (at a lower frame rate) if the tab is in the background.
 */
import JSZip from 'jszip';
import type { CourseState, QuizConfig, Slide, SlideElement, SlideLayer, TextElement } from '@/types/course';
import { resolveColor } from '@/lib/themeVars';
import { isExtendedShapeType, SHAPE_SVG } from '@/lib/shapes';

type AppState = CourseState;

export type VideoStructure = 'single' | 'per-slide';
export type VideoQuality = 'low' | 'medium' | 'high';

export interface VideoExportOptions {
  structure: VideoStructure;
  quality: VideoQuality;
  captions: boolean;
  courseTitle: string;
  /** `slideIndex` may be fractional (progress through the course by time). */
  onProgress?: (slideIndex: number, total: number, label: string) => void;
  signal?: AbortSignal;
}

const QUALITY_HEIGHT: Record<VideoQuality, number> = { low: 480, medium: 720, high: 1080 };
const FPS = 30;
/** Give up waiting for an image or audio file to load after this long. */
const LOAD_TIMEOUT_MS = 8000;

function pickMime(): string | null {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

export function isMp4Supported(): boolean {
  return pickMime() !== null;
}

// ───────────────────────── timing ─────────────────────────

/**
 * How an element looks at time `t` (ms), matching the in-app preview: hidden
 * before its start and after its end, except that an element whose timeline
 * bar reaches the end of the slide stays on screen.
 * Returns null when hidden, else the opacity and horizontal offset (as a
 * fraction of the canvas width) for entrance/exit animations.
 */
export function elementAppearance(
  el: SlideElement,
  t: number,
  slideDuration: number,
): { alpha: number; dx: number } | null {
  const start = el.startTime ?? 0;
  const end = start + (el.duration ?? slideDuration);
  const lastsToEnd = end >= slideDuration;
  if (t < start) return null;
  if (!lastsToEnd && t >= end) return null;

  const inDur = el.entranceDuration ?? 500;
  if (el.animationIn !== 'none' && t < start + inDur) {
    const p = (t - start) / Math.max(1, inDur);
    if (el.animationIn === 'fade') return { alpha: p, dx: 0 };
    if (el.animationIn === 'fly-in-left') return { alpha: p, dx: -(1 - p) * 0.3 };
    if (el.animationIn === 'fly-in-right') return { alpha: p, dx: (1 - p) * 0.3 };
  }
  const outDur = el.exitDuration ?? 500;
  if (!lastsToEnd && el.animationOut !== 'none' && t >= end - outDur) {
    const p = (t - (end - outDur)) / Math.max(1, outDur);
    if (el.animationOut === 'fade') return { alpha: 1 - p, dx: 0 };
    if (el.animationOut === 'fly-out-left') return { alpha: 1 - p, dx: -p * 0.3 };
    if (el.animationOut === 'fly-out-right') return { alpha: 1 - p, dx: p * 0.3 };
  }
  return { alpha: 1, dx: 0 };
}

/** Elements a learner sees when the slide opens: visible layers only (hidden layers are lightboxes etc.). */
function slideElements(slide: Slide): SlideElement[] {
  if (slide.layers && slide.layers.length > 0) {
    return slide.layers.flatMap((l: SlideLayer) => (l.visible === false ? [] : l.elements)).filter((e) => !e.isHidden);
  }
  return slide.elements.filter((e) => !e.isHidden);
}

function masterElements(state: AppState, slide: Slide): SlideElement[] {
  if (!slide.masterId) return [];
  const master = state.masterSlides.find((m) => m.id === slide.masterId);
  return master ? slideElements(master) : [];
}

// ───────────────────────── loading ─────────────────────────

function withTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), LOAD_TIMEOUT_MS))]);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return withTimeout(
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    }),
    null,
  );
}

/** Extended shapes are SVG markup; rasterize each one once at its final colors. */
function shapeSvgUrl(el: Extract<SlideElement, { type: 'shape' }>, themeColors: string[]): string | null {
  const fill = resolveColor(el.fillColor, themeColors, '#3b82f6');
  const stroke = resolveColor(el.borderColor, themeColors, 'transparent');
  let inner: string | null = null;
  if (el.shapeType === 'triangle') {
    inner = `<polygon points="50,5 95,95 5,95" fill="${fill}" stroke="${stroke}" stroke-width="${(el.borderWidth || 0) * 2}" vector-effect="non-scaling-stroke"/>`;
  } else if (isExtendedShapeType(el.shapeType)) {
    inner = SHAPE_SVG[el.shapeType]
      .replace(/\{fill\}/g, fill)
      .replace(/\{stroke\}/g, stroke)
      .replace(/\{strokeWidth\}/g, String(el.borderWidth || 0));
  }
  if (!inner) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" width="${Math.max(1, Math.round(el.width))}" height="${Math.max(1, Math.round(el.height))}" overflow="visible">${inner}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Preload every image (and rasterized shape) the given slides need, keyed by src or element id. */
async function preloadAssets(state: AppState, slides: Slide[]): Promise<Map<string, HTMLImageElement | null>> {
  const cache = new Map<string, HTMLImageElement | null>();
  const jobs: Promise<void>[] = [];
  const themeColors = state.courseSettings.themeColors;
  for (const slide of slides) {
    for (const el of [...masterElements(state, slide), ...slideElements(slide)]) {
      if (el.type === 'image' && el.src && !cache.has(el.src)) {
        cache.set(el.src, null);
        jobs.push(loadImage(el.src).then((img) => void cache.set(el.src, img)));
      } else if (el.type === 'shape') {
        const url = shapeSvgUrl(el, themeColors);
        if (url && !cache.has('shape:' + el.id)) {
          cache.set('shape:' + el.id, null);
          jobs.push(loadImage(url).then((img) => void cache.set('shape:' + el.id, img)));
        }
      }
    }
  }
  await Promise.all(jobs);
  return cache;
}

// ───────────────────────── drawing ─────────────────────────

interface RenderContext {
  ctx: CanvasRenderingContext2D;
  outW: number;
  outH: number;
  sx: number;
  sy: number;
  font: string;
  headingFont: string;
  themeColors: string[];
  assets: Map<string, HTMLImageElement | null>;
}

const color = (rc: RenderContext, v: string | undefined, fallback: string) => resolveColor(v, rc.themeColors, fallback);

/** Wrap one paragraph to a width; returns the lines. */
function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  lines.push(line);
  return lines;
}

/**
 * Draw multi-line text at the top-left of a box. Honors "\n" line breaks and
 * gives "• " bullet lines a hanging indent (like TextLines.tsx). Returns the
 * height used.
 */
function drawTextBlock(ctx: CanvasRenderingContext2D, content: string, x: number, y: number, maxW: number, lineH: number): number {
  let yy = y;
  for (const raw of content.split('\n')) {
    if (raw.startsWith('• ')) {
      const indent = ctx.measureText('• ').width;
      const lines = wrapLine(ctx, raw.slice(2), maxW - indent);
      ctx.fillText('•', x, yy);
      for (const l of lines) {
        ctx.fillText(l, x + indent, yy);
        yy += lineH;
      }
    } else {
      for (const l of wrapLine(ctx, raw, maxW)) {
        ctx.fillText(l, x, yy);
        yy += lineH;
      }
    }
  }
  return yy - y;
}

/** Centered multi-line text (shape labels, quiz cards). */
function drawCenteredText(ctx: CanvasRenderingContext2D, content: string, cx: number, cy: number, maxW: number, lineH: number) {
  const lines = content.split('\n').flatMap((p) => wrapLine(ctx, p, maxW));
  const top = cy - (lines.length * lineH) / 2 + lineH / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lineH));
  ctx.textAlign = 'start';
  ctx.textBaseline = 'top';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawElement(rc: RenderContext, el: SlideElement, alpha: number, dx: number) {
  const { ctx, sx, sy } = rc;
  const x = el.x * sx + dx * rc.outW;
  const y = el.y * sy;
  const w = el.width * sx;
  const h = el.height * sy;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.textBaseline = 'top';

  if (el.type === 'text') {
    const bg = color(rc, el.backgroundColor, 'transparent');
    if (bg && bg !== 'transparent') {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, w, h);
    }
    const fs = (el.fontSize || 16) * sy;
    ctx.font = `${el.fontWeight || 'normal'} ${fs}px ${(el as TextElement).fontRole === 'heading' ? rc.headingFont : rc.font}`;
    ctx.fillStyle = color(rc, el.textColor, '#000000');
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const pad = 8 * sy;
    drawTextBlock(ctx, el.content || '', x + pad, y + pad, w - pad * 2, fs * 1.25);
  } else if (el.type === 'image') {
    const img = rc.assets.get(el.src);
    if (img) {
      // object-fit: contain, like the editor.
      const scale = Math.min(w / img.width, h / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    }
  } else if (el.type === 'shape') {
    const raster = rc.assets.get('shape:' + el.id);
    if (raster) {
      ctx.drawImage(raster, x, y, w, h);
    } else {
      ctx.fillStyle = color(rc, el.fillColor, '#3b82f6');
      ctx.strokeStyle = color(rc, el.borderColor, 'transparent');
      ctx.lineWidth = (el.borderWidth || 0) * sy;
      if (el.shapeType === 'circle') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      } else {
        roundRect(ctx, x, y, w, h, (el.borderRadius ?? 4) * sy);
      }
      ctx.fill();
      if (ctx.lineWidth > 0) ctx.stroke();
    }
    if (el.text) {
      const fs = (el.fontSize || 16) * sy;
      ctx.font = `${fs}px ${rc.font}`;
      ctx.fillStyle = color(rc, el.textColor, '#000000');
      drawCenteredText(ctx, el.text, x + w / 2, y + h / 2, w - 8 * sx, fs * 1.25);
    }
  } else if (el.type === 'table') {
    const cw = w / el.colCount;
    const ch = h / el.rowCount;
    const fs = (el.fontSize || 14) * sy;
    ctx.strokeStyle = color(rc, el.borderColor, '#94a3b8');
    ctx.fillStyle = color(rc, el.textColor, '#000000');
    ctx.font = `${fs}px ${rc.font}`;
    ctx.textBaseline = 'middle';
    for (let r = 0; r < el.rowCount; r++) {
      for (let c = 0; c < el.colCount; c++) {
        ctx.strokeRect(x + c * cw, y + r * ch, cw, ch);
        ctx.fillText(el.cellData?.[r]?.[c] ?? '', x + c * cw + 4 * sx, y + r * ch + ch / 2, cw - 8 * sx);
      }
    }
  } else if (el.type === 'checkbox') {
    const fs = (el.fontSize || 16) * sy;
    const box = fs;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = Math.max(1, 1.5 * sy);
    ctx.strokeRect(x, y + (h - box) / 2, box, box);
    ctx.fillStyle = color(rc, el.textColor, '#000000');
    ctx.font = `${fs}px ${rc.font}`;
    ctx.textBaseline = 'middle';
    ctx.fillText(el.label || '', x + box + 8 * sx, y + h / 2, w - box - 8 * sx);
  } else if (el.type === 'video') {
    ctx.fillStyle = '#111827';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.min(w, h) * 0.25}px ${rc.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶', x + w / 2, y + h / 2);
  }
  // Hotspots are invisible.
  ctx.restore();
}

/** Quiz slides have no elements; draw the question card as a learner first sees it. */
function drawQuizCard(rc: RenderContext, quiz: QuizConfig) {
  const { ctx, outW, outH, sy } = rc;
  const cardW = outW * 0.62;
  const fs = 22 * sy;
  const optFs = 17 * sy;
  ctx.font = `600 ${fs}px ${rc.font}`;
  const qLines = wrapLine(ctx, quiz.question || '', cardW - 48 * sy);
  const options: string[] =
    quiz.questionType === 'multiple-choice'
      ? (quiz.choices ?? []).map((c) => c.text)
      : quiz.questionType === 'dnd-matching'
        ? (quiz.pairs ?? []).map((p) => `${p.left}  →  ?`)
        : (quiz.sortItems ?? []).map((i) => i.text);
  const optH = optFs * 2.2;
  const cardH = 48 * sy + qLines.length * fs * 1.3 + 16 * sy + options.length * (optH + 8 * sy) + 24 * sy;
  const cx = (outW - cardW) / 2;
  const cy = Math.max(16 * sy, (outH - cardH) / 2);
  ctx.save();
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, outW, outH);
  ctx.shadowColor = 'rgba(0,0,0,0.12)';
  ctx.shadowBlur = 24 * sy;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, cx, cy, cardW, cardH, 12 * sy);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 ${fs}px ${rc.font}`;
  ctx.textBaseline = 'top';
  let yy = cy + 24 * sy;
  for (const l of qLines) {
    ctx.fillText(l, cx + 24 * sy, yy);
    yy += fs * 1.3;
  }
  yy += 16 * sy;
  ctx.font = `${optFs}px ${rc.font}`;
  for (const o of options) {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = Math.max(1, sy);
    roundRect(ctx, cx + 24 * sy, yy, cardW - 48 * sy, optH, 8 * sy);
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    ctx.fillText(o, cx + 40 * sy, yy + optH / 2, cardW - 80 * sy);
    ctx.textBaseline = 'top';
    yy += optH + 8 * sy;
  }
}

function drawCaption(rc: RenderContext, text: string) {
  const { ctx, outW, outH } = rc;
  const fs = Math.max(16, Math.round(outH * 0.034));
  ctx.save();
  ctx.font = `600 ${fs}px ${rc.font}`;
  const lines = wrapLine(ctx, text, outW * 0.8);
  const lineH = fs * 1.3;
  const boxW = Math.min(outW - 40, Math.max(...lines.map((l) => ctx.measureText(l).width)) + fs * 1.2);
  const boxH = lines.length * lineH + fs * 0.7;
  const x = (outW - boxW) / 2;
  const y = outH - boxH - outH * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  roundRect(ctx, x, y, boxW, boxH, fs * 0.3);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, outW / 2, y + fs * 0.35 + i * lineH));
  ctx.restore();
}

/** Paint one frame of a slide at time `t` (ms from the slide's start). */
function drawFrame(rc: RenderContext, state: AppState, slide: Slide, t: number, captionText: string | null) {
  const { ctx, outW, outH } = rc;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff'; // slides are white, like the editor and exported player
  ctx.fillRect(0, 0, outW, outH);
  const dur = slide.duration || 5000;
  if (slide.slideType === 'quiz' && slide.quiz) {
    drawQuizCard(rc, slide.quiz);
  } else if (slide.slideType === 'results') {
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 ${36 * rc.sy}px ${rc.font}`;
    drawCenteredText(ctx, 'Results', outW / 2, outH / 2, outW * 0.8, 44 * rc.sy);
  }
  for (const el of [...masterElements(state, slide), ...slideElements(slide)]) {
    const look = elementAppearance(el, t, dur);
    if (look) drawElement(rc, el, look.alpha, look.dx);
  }
  if (captionText) drawCaption(rc, captionText);
}

// ───────────────────────── recording ─────────────────────────

function captionAt(slide: Slide, tSec: number): string | null {
  for (const a of slide.audio ?? []) {
    const c = a.captions?.find((c) => tSec >= c.startTime && tSec < c.endTime);
    if (c) return c.text;
  }
  return null;
}

function formatTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Record the given slides back to back into one video blob, in real time.
 * `progress` receives elapsed and total milliseconds plus the slide index.
 */
async function recordSlides(
  state: AppState,
  slides: Slide[],
  opts: VideoExportOptions,
  outW: number,
  outH: number,
  mime: string,
  progress: (elapsedMs: number, slideIndex: number) => void,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  const rc: RenderContext = {
    ctx,
    outW,
    outH,
    sx: outW / state.courseSettings.canvasDimensions.width,
    sy: outH / state.courseSettings.canvasDimensions.height,
    font: state.courseSettings.bodyFont || state.playerSettings.fontFamily || 'system-ui, sans-serif',
    headingFont: state.courseSettings.headingFont || state.courseSettings.bodyFont || state.playerSettings.fontFamily || 'system-ui, sans-serif',
    themeColors: state.courseSettings.themeColors,
    assets: await preloadAssets(state, slides),
  };

  const stream = canvas.captureStream(FPS);
  const audioCtx = new AudioContext();
  await audioCtx.resume().catch(() => {});
  const dest = audioCtx.createMediaStreamDestination();
  // Keep the audio track fed with silence for the whole recording. If no slide
  // audio is playing, an idle track makes the recorder stop writing video after
  // a second or two, cutting the video short.
  const silence = audioCtx.createOscillator();
  const mute = audioCtx.createGain();
  mute.gain.value = 0;
  silence.connect(mute).connect(dest);
  silence.start();
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));
  drawFrame(rc, state, slides[0], 0, null);
  recorder.start(250);

  let aborted = false;
  let elapsedBefore = 0;
  try {
    for (let i = 0; i < slides.length && !aborted; i++) {
      const slide = slides[i];
      const durMs = Math.max(1000, slide.duration || 5000);

      // Load this slide's audio and route it into the recording (not the speakers).
      const audioEls: HTMLAudioElement[] = [];
      for (const a of slide.audio ?? []) {
        if (!a.src) continue;
        const el = document.createElement('audio');
        el.src = a.src;
        await withTimeout(
          new Promise<void>((res) => {
            el.oncanplaythrough = () => res();
            el.onerror = () => res();
            el.load();
          }),
          undefined,
        );
        try {
          audioCtx.createMediaElementSource(el).connect(dest);
          audioEls.push(el);
        } catch {
          /* unsupported source: skip its audio */
        }
      }
      audioEls.forEach((el) => {
        el.currentTime = 0;
        el.play().catch(() => {});
      });

      // A timer (not requestAnimationFrame) so recording continues if the tab is hidden.
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const tick = () => {
          if (opts.signal?.aborted) {
            aborted = true;
            resolve();
            return;
          }
          const t = Math.min(performance.now() - start, durMs);
          drawFrame(rc, state, slide, t, opts.captions ? captionAt(slide, t / 1000) : null);
          progress(elapsedBefore + t, i);
          if (t >= durMs) resolve();
          else setTimeout(tick, 1000 / FPS);
        };
        tick();
      });
      audioEls.forEach((el) => {
        try {
          el.pause();
        } catch {
          /* noop */
        }
      });
      elapsedBefore += durMs;
    }
  } finally {
    recorder.stop();
    await stopped;
    silence.stop();
    stream.getTracks().forEach((t) => t.stop());
    await audioCtx.close().catch(() => {});
  }
  if (aborted) throw new Error('Export cancelled');
  return new Blob(chunks, { type: mime });
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function slugify(s: string): string {
  return (s || 'slide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'slide';
}

export async function exportToVideo(state: AppState, opts: VideoExportOptions): Promise<void> {
  const mime = pickMime();
  if (!mime) {
    throw new Error('MP4 export is not supported in this browser. Please use Chrome or Edge.');
  }
  const slides = state.slides;
  if (!slides.length) throw new Error('This course has no slides.');
  const outH = QUALITY_HEIGHT[opts.quality];
  const aspect = state.courseSettings.canvasDimensions.width / state.courseSettings.canvasDimensions.height;
  const outW = Math.round((outH * aspect) / 2) * 2;

  const durations = slides.map((s) => Math.max(1000, s.duration || 5000));
  const totalMs = durations.reduce((a, b) => a + b, 0);
  const report = (doneMs: number, slideIndex: number) => {
    const label = `Recording slide ${slideIndex + 1} of ${slides.length}: ${formatTime(doneMs)} of ${formatTime(totalMs)} (plays in real time; keep this tab open)`;
    opts.onProgress?.((doneMs / totalMs) * slides.length, slides.length, label);
  };

  const safeTitle = slugify(opts.courseTitle);
  if (opts.structure === 'per-slide') {
    const zip = new JSZip();
    let doneBefore = 0;
    for (let i = 0; i < slides.length; i++) {
      if (opts.signal?.aborted) throw new Error('Export cancelled');
      const blob = await recordSlides(state, [slides[i]], opts, outW, outH, mime, (ms) => report(doneBefore + ms, i));
      zip.file(`${String(i + 1).padStart(2, '0')}-${slugify(slides[i].title || `slide-${i + 1}`)}.mp4`, blob);
      doneBefore += durations[i];
    }
    opts.onProgress?.(slides.length, slides.length, 'Packaging zip…');
    download(await zip.generateAsync({ type: 'blob' }), `${safeTitle}-videos.zip`);
  } else {
    const blob = await recordSlides(state, slides, opts, outW, outH, mime, report);
    opts.onProgress?.(slides.length, slides.length, 'Saving video…');
    download(blob, `${safeTitle}.mp4`);
  }
}
