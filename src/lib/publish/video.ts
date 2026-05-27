import JSZip from 'jszip';
import type { AppState, Slide, SlideElement, SlideLayer } from '@/types/course';

export type VideoStructure = 'single' | 'per-slide';
export type VideoQuality = 'low' | 'medium' | 'high';

export interface VideoExportOptions {
  structure: VideoStructure;
  quality: VideoQuality;
  captions: boolean;
  courseTitle: string;
  onProgress?: (slideIndex: number, total: number, label: string) => void;
  signal?: AbortSignal;
}

const QUALITY_HEIGHT: Record<VideoQuality, number> = { low: 480, medium: 720, high: 1080 };

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

function getAllElements(slide: Slide): SlideElement[] {
  if (slide.layers && slide.layers.length > 0) {
    return slide.layers.flatMap((l: SlideLayer) =>
      l.elements.filter((e) => !l.isHidden && !e.isHidden),
    );
  }
  return slide.elements.filter((e) => !e.isHidden);
}

function slugify(s: string): string {
  return (s || 'slide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'slide';
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface RenderContext {
  ctx: CanvasRenderingContext2D;
  outW: number;
  outH: number;
  sx: number;
  sy: number;
  imageCache: Map<string, HTMLImageElement | null>;
}

async function preloadImages(slide: Slide): Promise<Map<string, HTMLImageElement | null>> {
  const cache = new Map<string, HTMLImageElement | null>();
  const els = getAllElements(slide);
  await Promise.all(
    els.map(async (e) => {
      if (e.type === 'image' && e.src && !cache.has(e.src)) {
        cache.set(e.src, await loadImage(e.src));
      }
    }),
  );
  return cache;
}

function drawFrame(
  rc: RenderContext,
  slide: Slide,
  bgColor: string,
  bgImage: HTMLImageElement | null,
  timeSec: number,
  captionText: string | null,
) {
  const { ctx, outW, outH, sx, sy } = rc;
  ctx.fillStyle = bgColor || '#1a1a2e';
  ctx.fillRect(0, 0, outW, outH);
  if (bgImage) {
    ctx.drawImage(bgImage, 0, 0, outW, outH);
  }
  const els = getAllElements(slide);
  for (const el of els) {
    const start = el.startTime ?? 0;
    const end = start + (el.duration ?? slide.duration);
    if (timeSec < start || timeSec > end) continue;
    const x = el.x * sx;
    const y = el.y * sy;
    const w = el.width * sx;
    const h = el.height * sy;
    if (el.type === 'text') {
      const t = el as Extract<SlideElement, { type: 'text' }>;
      if (t.backgroundColor && t.backgroundColor !== 'transparent') {
        ctx.fillStyle = t.backgroundColor;
        ctx.fillRect(x, y, w, h);
      }
      ctx.fillStyle = t.textColor || '#ffffff';
      const fs = (t.fontSize || 16) * sy;
      ctx.font = `${t.fontWeight || 'normal'} ${fs}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      wrapText(ctx, t.content || '', x + 4, y + 4, w - 8, fs * 1.2);
    } else if (el.type === 'image') {
      const im = el as Extract<SlideElement, { type: 'image' }>;
      const img = rc.imageCache.get(im.src);
      if (img) ctx.drawImage(img, x, y, w, h);
    } else if (el.type === 'shape') {
      const sh = el as Extract<SlideElement, { type: 'shape' }>;
      ctx.fillStyle = sh.fillColor || '#3b82f6';
      ctx.strokeStyle = sh.borderColor || 'transparent';
      ctx.lineWidth = (sh.borderWidth || 0) * sy;
      if (sh.shapeType === 'circle') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (ctx.lineWidth > 0) ctx.stroke();
      } else {
        const r = (sh.borderRadius || 0) * sy;
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();
        if (ctx.lineWidth > 0) ctx.stroke();
      }
      if (sh.text) {
        ctx.fillStyle = sh.textColor || '#ffffff';
        const fs = (sh.fontSize || 16) * sy;
        ctx.font = `600 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sh.text, x + w / 2, y + h / 2);
        ctx.textAlign = 'start';
      }
    } else if (el.type === 'table') {
      const tb = el as Extract<SlideElement, { type: 'table' }>;
      ctx.strokeStyle = tb.borderColor || '#666';
      ctx.fillStyle = tb.textColor || '#000';
      const cw = w / tb.colCount;
      const ch = h / tb.rowCount;
      const fs = (tb.fontSize || 14) * sy;
      ctx.font = `${fs}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      for (let r = 0; r < tb.rowCount; r++) {
        for (let c = 0; c < tb.colCount; c++) {
          ctx.strokeRect(x + c * cw, y + r * ch, cw, ch);
          const txt = tb.cellData?.[r]?.[c] ?? '';
          ctx.fillText(txt, x + c * cw + 4, y + r * ch + ch / 2);
        }
      }
    }
  }
  if (captionText) {
    drawCaption(ctx, captionText, outW, outH);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(/\s+/);
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function drawCaption(ctx: CanvasRenderingContext2D, text: string, w: number, h: number) {
  const fs = Math.max(18, Math.round(h * 0.035));
  ctx.font = `600 ${fs}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const metrics = ctx.measureText(text);
  const padX = fs * 0.6;
  const padY = fs * 0.35;
  const boxW = Math.min(w - 40, metrics.width + padX * 2);
  const boxH = fs + padY * 2;
  const x = (w - boxW) / 2;
  const y = h - boxH - h * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, y + boxH / 2);
  ctx.textAlign = 'start';
}

async function recordSlide(
  slide: Slide,
  state: AppState,
  opts: VideoExportOptions,
  outW: number,
  outH: number,
  mime: string,
): Promise<Blob> {
  const canvasW = state.courseSettings.canvasDimensions.width;
  const canvasH = state.courseSettings.canvasDimensions.height;
  const sx = outW / canvasW;
  const sy = outH / canvasH;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  const imageCache = await preloadImages(slide);
  const rc: RenderContext = { ctx, outW, outH, sx, sy, imageCache };

  const bgColor = state.playerSettings.backgroundColor;
  const bgImage = state.playerSettings.backgroundImage
    ? await loadImage(state.playerSettings.backgroundImage)
    : null;

  const durationSec = Math.max(1, slide.duration || 5);
  const fps = 30;
  const stream = (canvas as HTMLCanvasElement).captureStream(fps);

  // Audio mixing
  let audioCtx: AudioContext | null = null;
  let audioEls: HTMLAudioElement[] = [];
  const audios = slide.audio || [];
  if (audios.length > 0) {
    audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    for (const a of audios) {
      const el = document.createElement('audio');
      el.src = a.src;
      el.crossOrigin = 'anonymous';
      await new Promise<void>((res) => {
        el.oncanplaythrough = () => res();
        el.onerror = () => res();
        el.load();
      });
      try {
        const src = audioCtx.createMediaElementSource(el);
        src.connect(dest);
      } catch {
        /* ignore */
      }
      audioEls.push(el);
    }
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  }

  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));
  recorder.start(100);

  // Start audios
  audioEls.forEach((el) => {
    el.currentTime = 0;
    el.play().catch(() => {});
  });

  const captions = opts.captions ? (audios[0]?.captions || []) : [];
  const startMs = performance.now();
  const totalMs = durationSec * 1000;
  let aborted = false;

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (opts.signal?.aborted) {
        aborted = true;
        resolve();
        return;
      }
      const elapsed = performance.now() - startMs;
      const t = Math.min(elapsed / 1000, durationSec);
      let captionText: string | null = null;
      if (captions.length > 0) {
        const c = captions.find((c) => t >= c.startTime && t <= c.endTime);
        if (c) captionText = c.text;
      }
      drawFrame(rc, slide, bgColor, bgImage, t, captionText);
      if (elapsed >= totalMs) {
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  await stopped;
  audioEls.forEach((el) => {
    try {
      el.pause();
    } catch {
      /* noop */
    }
  });
  if (audioCtx) await audioCtx.close().catch(() => {});

  if (aborted) throw new Error('Export cancelled');
  return new Blob(chunks, { type: mime });
}

async function concatBlobs(blobs: Blob[], outW: number, outH: number, mime: string): Promise<Blob> {
  if (blobs.length === 1) return blobs[0];
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d')!;
  const stream = (canvas as HTMLCanvasElement).captureStream(30);

  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));
  recorder.start(100);

  for (const blob of blobs) {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = url;
    video.muted = false;
    video.crossOrigin = 'anonymous';
    await new Promise<void>((res) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => res();
    });
    try {
      const srcNode = audioCtx.createMediaElementSource(video);
      srcNode.connect(dest);
    } catch {
      /* noop */
    }
    await video.play().catch(() => {});
    await new Promise<void>((res) => {
      const draw = () => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(video, 0, 0, outW, outH);
        if (!video.ended && !video.paused) requestAnimationFrame(draw);
        else res();
      };
      video.onended = () => res();
      requestAnimationFrame(draw);
    });
    URL.revokeObjectURL(url);
  }

  recorder.stop();
  await stopped;
  await audioCtx.close().catch(() => {});
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

export async function exportToVideo(state: AppState, opts: VideoExportOptions): Promise<void> {
  const mime = pickMime();
  if (!mime) {
    throw new Error('MP4 export is not supported in this browser. Please use Chrome or Edge.');
  }
  const outH = QUALITY_HEIGHT[opts.quality];
  const aspect = state.courseSettings.canvasDimensions.width / state.courseSettings.canvasDimensions.height;
  const outW = Math.round(outH * aspect / 2) * 2;

  const slides = state.slides;
  const slideBlobs: Blob[] = [];
  for (let i = 0; i < slides.length; i++) {
    if (opts.signal?.aborted) throw new Error('Export cancelled');
    opts.onProgress?.(i, slides.length, `Processing slide ${i + 1} of ${slides.length}…`);
    const blob = await recordSlide(slides[i], state, opts, outW, outH, mime);
    slideBlobs.push(blob);
  }

  const safeTitle = slugify(opts.courseTitle);
  if (opts.structure === 'per-slide') {
    opts.onProgress?.(slides.length, slides.length, 'Packaging zip…');
    const zip = new JSZip();
    slides.forEach((s, i) => {
      const name = `${String(i + 1).padStart(2, '0')}-${slugify(s.title || `slide-${i + 1}`)}.mp4`;
      zip.file(name, slideBlobs[i]);
    });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    download(zipBlob, `${safeTitle}-videos.zip`);
  } else {
    opts.onProgress?.(slides.length, slides.length, 'Stitching final video…');
    const final = await concatBlobs(slideBlobs, outW, outH, mime);
    download(final, `${safeTitle}.mp4`);
  }
}
