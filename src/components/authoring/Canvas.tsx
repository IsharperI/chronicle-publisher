import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Rnd } from 'react-rnd';
import { useCourse } from '@/context/CourseContext';
import type { SlideElement, TextElement, ShapeElement, AnimationIn, AnimationOut, TableElement, Slide, QuizConfig, QuizChoice, QuizMatchPair, QuizSortItem } from '@/types/course';
import { resolveQuizStyle, type ResolvedQuizStyle } from '@/lib/quizTemplates';
import { themeVarStyle } from '@/lib/themeVars';
import { MotionPathLayer } from './MotionPathLayer';
import { motionPathOffset } from '@/lib/motionPath';

function getAnimInClass(anim: AnimationIn): string {
  switch (anim) {
    case 'fade': return 'anim-fade-in';
    case 'fly-in-left': return 'anim-fly-in-left';
    case 'fly-in-right': return 'anim-fly-in-right';
    default: return '';
  }
}

function getAnimOutClass(anim: AnimationOut): string {
  switch (anim) {
    case 'fade': return 'anim-fade-out';
    case 'fly-out-left': return 'anim-fly-out-left';
    case 'fly-out-right': return 'anim-fly-out-right';
    default: return '';
  }
}

function getAnimationPhase(el: SlideElement, playheadTime: number): 'before' | 'entering' | 'visible' | 'exiting' | 'after' {
  const end = el.startTime + el.duration;
  const entranceDur = el.entranceDuration ?? 500;
  const exitDur = el.exitDuration ?? 500;
  if (playheadTime < el.startTime) return 'before';
  if (playheadTime < el.startTime + entranceDur && el.animationIn !== 'none') return 'entering';
  if (playheadTime < end - exitDur) return 'visible';
  if (playheadTime < end && el.animationOut !== 'none') return 'exiting';
  if (playheadTime >= end) return 'after';
  return 'visible';
}

function ShapeText({ se, isPreview }: { se: ShapeElement; isPreview?: boolean }) {
  if (!se.text) return null;
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        overflow: 'hidden', padding: 4, pointerEvents: 'none',
        color: se.textColor ?? '#000000',
        fontSize: se.fontSize ?? 16,
        wordBreak: 'break-word',
      }}
    >
      {se.text}
    </div>
  );
}

function ElementRenderer({ element, isPreview }: { element: SlideElement; isPreview?: boolean }) {
  const [hovered, setHovered] = useState(false);
  const { dispatch } = useCourse();

  const hoverProps = isPreview ? {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  } : {};

  if (element.type === 'text') {
    const te = element as TextElement;
    const bg = hovered && te.hoverBackgroundColor ? te.hoverBackgroundColor : te.backgroundColor;
    const color = hovered && te.hoverTextColor ? te.hoverTextColor : te.textColor;
    return (
      <div
        {...hoverProps}
        style={{
          width: '100%', height: '100%', fontSize: te.fontSize, fontWeight: te.fontWeight,
          color, backgroundColor: bg, padding: 8, overflow: 'hidden', wordBreak: 'break-word',
          transition: isPreview ? 'color 0.2s, background-color 0.2s' : undefined,
          cursor: isPreview && (te.hoverBackgroundColor || te.hoverTextColor) ? 'pointer' : undefined,
        }}
      >
        {te.content}
      </div>
    );
  }
  if (element.type === 'image') {
    return <img src={element.src} alt={element.alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />;
  }
  if (element.type === 'video') {
    const ve = element as any;
    return (
      <video
        src={ve.src}
        controls={ve.controls !== false}
        autoPlay={isPreview && !!ve.autoplay}
        muted={isPreview && !!ve.autoplay}
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000', pointerEvents: isPreview ? 'auto' : 'none' }}
      />
    );
  }
  if (element.type === 'shape') {
    const se = element as ShapeElement;
    const fill = hovered && se.hoverFillColor ? se.hoverFillColor : se.fillColor;
    const border = hovered && se.hoverBorderColor ? se.hoverBorderColor : se.borderColor;

    if (se.shapeType === 'circle') {
      return (
        <div
          {...hoverProps}
          style={{
            position: 'relative',
            width: '100%', height: '100%', borderRadius: '50%', backgroundColor: fill,
            border: `${se.borderWidth}px solid ${border}`,
            boxShadow: se.boxShadow,
            transition: isPreview ? 'background-color 0.2s, border-color 0.2s' : undefined,
            cursor: isPreview && (se.hoverFillColor || se.hoverBorderColor) ? 'pointer' : undefined,
          }}
        >
          <ShapeText se={se} isPreview={isPreview} />
        </div>
      );
    }
    if (se.shapeType === 'triangle') {
      return (
        <div {...hoverProps} style={{ position: 'relative', width: '100%', height: '100%' }}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
            <polygon points="50,5 95,95 5,95" fill={fill} stroke={border} strokeWidth={se.borderWidth * 2}
              style={{ transition: isPreview ? 'fill 0.2s, stroke 0.2s' : undefined }}
            />
          </svg>
          <ShapeText se={se} isPreview={isPreview} />
        </div>
      );
    }
    return (
      <div
        {...hoverProps}
        style={{
          position: 'relative',
          width: '100%', height: '100%', backgroundColor: fill,
          border: `${se.borderWidth}px solid ${border}`,
          borderRadius: se.borderRadius != null ? se.borderRadius : 4,
          boxShadow: se.boxShadow,
          transition: isPreview ? 'background-color 0.2s, border-color 0.2s' : undefined,
          cursor: isPreview && (se.hoverFillColor || se.hoverBorderColor) ? 'pointer' : undefined,
        }}
      >
        <ShapeText se={se} isPreview={isPreview} />
      </div>
    );
  }
  if (element.type === 'hotspot') {
    // In preview/SCORM the hotspot is fully invisible; in editor it gets a
    // dashed green outline so the author can locate and select it.
    if (isPreview) {
      return (
        <div
          style={{
            width: '100%', height: '100%',
            background: 'transparent',
            cursor: 'pointer',
          }}
        />
      );
    }
    return (
      <div
        style={{
          width: '100%', height: '100%',
          background: 'transparent',
          border: '3px dashed #10b981',
          borderRadius: 4,
          boxSizing: 'border-box',
        }}
      />
    );
  }
  if (element.type === 'checkbox') {
    const ce = element as any;
    return (
      <label
        style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: 4,
          color: ce.textColor ?? '#ffffff',
          fontSize: ce.fontSize ?? 16,
          cursor: isPreview ? 'pointer' : 'default',
          userSelect: 'none',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => { if (!isPreview) e.preventDefault(); }}
      >
        <input
          type="checkbox"
          defaultChecked={!!ce.defaultChecked}
          disabled={!isPreview}
          style={{ width: 18, height: 18, flexShrink: 0, cursor: isPreview ? 'pointer' : 'default' }}
          onClick={(e) => { if (!isPreview) e.preventDefault(); }}
        />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ce.label || 'Checkbox'}
        </span>
      </label>
    );
  }
  if (element.type === 'table') {
    const te = element as TableElement;
    const rows = te.rowCount;
    const cols = te.colCount;
    const data = te.cellData ?? [];
    const borderColor = te.borderColor ?? '#94a3b8';
    const textColor = te.textColor ?? '#0f172a';
    const fontSize = te.fontSize ?? 14;
    const onCellBlur = (r: number, c: number, value: string) => {
      // Build new 2D data matrix matching dimensions, mutating only [r][c].
      const next: string[][] = [];
      for (let i = 0; i < rows; i++) {
        const row: string[] = [];
        for (let j = 0; j < cols; j++) {
          if (i === r && j === c) row.push(value);
          else row.push(data[i]?.[j] ?? '');
        }
        next.push(row);
      }
      // Avoid dispatching when nothing changed.
      if ((data[r]?.[c] ?? '') === value) return;
      dispatch({ type: 'UPDATE_ELEMENT', id: te.id, updates: { cellData: next } as Partial<TableElement> });
    };
    return (
      <table
        style={{
          width: '100%', height: '100%', tableLayout: 'fixed',
          borderCollapse: 'collapse', background: '#ffffff',
          color: textColor, fontSize,
        }}
      >
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((__, c) => (
                <td
                  key={c}
                  contentEditable={!isPreview}
                  suppressContentEditableWarning
                  onMouseDown={(e) => {
                    if (isPreview) return;
                    e.stopPropagation();
                    dispatch({ type: 'SET_ACTIVE_ELEMENT', id: te.id });
                  }}
                  onBlur={(e) => { if (!isPreview) onCellBlur(r, c, e.currentTarget.textContent ?? ''); }}
                  style={{
                    border: `1px solid ${borderColor}`,
                    padding: '4px 6px',
                    verticalAlign: 'top',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                    cursor: isPreview ? 'default' : 'text',
                    outline: 'none',
                  }}
                >
                  {data[r]?.[c] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

function isElementVisible(el: SlideElement, playheadTime: number): boolean {
  return playheadTime >= el.startTime && playheadTime < el.startTime + el.duration;
}

export function Canvas({ onPreviewNext }: { onPreviewNext?: () => void } = {}) {
  const { state, dispatch } = useCourse();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [editingId, setEditingId] = useState<string | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const previewAccumRef = useRef(0);
  const ccEnabled = state.ccEnabled;
  // Stabilize onPreviewNext via ref so it doesn't re-trigger the preview play effect on every render.
  const onPreviewNextRef = useRef(onPreviewNext);
  useEffect(() => { onPreviewNextRef.current = onPreviewNext; }, [onPreviewNext]);

  const isPreview = state.previewMode;
  const isMasterMode = state.viewMode === 'master';

  // Get current slide based on view mode
  const activeSlide = isMasterMode
    ? state.masterSlides[state.activeSlideIndex]
    : state.slides[state.activeSlideIndex];

  // Get master slide elements for background layer (only in main mode)
  const masterElements: SlideElement[] = (() => {
    if (isMasterMode || !activeSlide?.masterId) return [];
    const master = state.masterSlides.find(m => m.id === activeSlide.masterId);
    return master?.elements ?? [];
  })();

  const { width: CANVAS_W, height: CANVAS_H } = state.courseSettings.canvasDimensions;

  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const pad = 40;
    const s = Math.min((clientWidth - pad) / CANVAS_W, (clientHeight - pad) / CANVAS_H);
    setScale(Math.min(s, 1));
  }, [CANVAS_W, CANVAS_H]);

  useEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  // Keyboard delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (state.previewMode) return;
      const ids = state.selectedElementIds.length > 0
        ? state.selectedElementIds
        : (state.activeElementId ? [state.activeElementId] : []);
      if (ids.length === 0) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      ids.forEach((id) => dispatch({ type: 'DELETE_ELEMENT', id }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.activeElementId, state.selectedElementIds, state.previewMode, dispatch]);

  // Audio playback synced to playhead. Plays slide audio from t=0 in preview
  // (and in author mode while the timeline is "playing"); pauses when paused.
  const audioTracks = activeSlide?.audio ?? [];
  const slideKey = activeSlide?.id ?? '';

  // In preview mode, drive the playhead forward (TimelinePanel ticker is hidden).
  // Implements per-slide advanceMode (manual vs auto-next) and revisitMode
  // (reset rewinds to 0; resume restores the playhead from when the user
  // last left this slide).
  const savedPlayheadsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!isPreview || !activeSlide) return;
    let raf = 0;
    let last = performance.now();
    const slideDur = activeSlide.duration ?? 5000;
    const revisit = activeSlide.revisitMode ?? 'reset';
    const advance = activeSlide.advanceMode ?? 'manual';
    const isLastSlide = state.activeSlideIndex >= state.slides.length - 1;

    // Determine starting playhead based on revisit mode.
    const saved = savedPlayheadsRef.current.get(activeSlide.id);
    const startTime = revisit === 'resume' && typeof saved === 'number'
      // If we'd resume past the end, snap back to 0 instead.
      ? (saved >= slideDur ? 0 : saved)
      : 0;
    previewAccumRef.current = startTime;
    dispatch({ type: 'SET_PLAYHEAD', time: startTime });
    dispatch({ type: 'SET_PLAYING', playing: true });

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      previewAccumRef.current += dt;
      const next = Math.min(slideDur, previewAccumRef.current);
      dispatch({ type: 'SET_PLAYHEAD', time: next });
      if (next >= slideDur) {
        cancelAnimationFrame(raf);
        // Persist final position before any auto-advance.
        savedPlayheadsRef.current.set(activeSlide.id, next);
        if (advance === 'auto' && !isLastSlide) {
          if (onPreviewNextRef.current) onPreviewNextRef.current();
          else dispatch({ type: 'PREVIEW_NEXT' });
        } else {
          dispatch({ type: 'SET_PLAYING', playing: false });
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Save current playhead so 'resume' can pick up where we left off.
      savedPlayheadsRef.current.set(activeSlide.id, previewAccumRef.current);
    };
  }, [isPreview, slideKey, activeSlide, state.activeSlideIndex, state.slides.length, dispatch]);

  // Reset & cleanup audio elements when slide changes or preview toggles.
  useEffect(() => {
    const map = audioRefs.current;
    return () => {
      map.forEach((a) => { try { a.pause(); a.currentTime = 0; } catch { /* noop */ } });
      map.clear();
    };
  }, [slideKey, isPreview]);

  // Drive playback based on isPlaying / playheadTime.
  useEffect(() => {
    const map = audioRefs.current;
    audioTracks.forEach((track) => {
      let el = map.get(track.id);
      if (!el) {
        el = new Audio(track.src);
        el.preload = 'auto';
        map.set(track.id, el);
      }
      const targetSec = state.playheadTime / 1000;
      // Resync if drift > 250ms
      if (Math.abs(el.currentTime - targetSec) > 0.25) {
        try { el.currentTime = Math.max(0, targetSec); } catch { /* noop */ }
      }
      if (state.isPlaying && targetSec < (track.duration || Infinity)) {
        if (el.paused) { el.play().catch(() => { /* autoplay blocked */ }); }
      } else {
        if (!el.paused) el.pause();
      }
    });
    // Pause/cleanup any audio elements no longer in the track list
    const liveIds = new Set(audioTracks.map((t) => t.id));
    map.forEach((el, id) => {
      if (!liveIds.has(id)) { try { el.pause(); } catch { /* noop */ } map.delete(id); }
    });
  }, [audioTracks, state.isPlaying, state.playheadTime]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isPreview && e.target === e.currentTarget) dispatch({ type: 'CLEAR_SELECTION' });
  };

  const editElements = activeSlide?.elements ?? [];

  // Active caption text from any audio track on the current slide whose
  // window contains the playhead (in seconds).
  const activeCaption = useMemo(() => {
    if (!ccEnabled) return '';
    const tSec = state.playheadTime / 1000;
    for (const track of audioTracks) {
      const cap = track.captions?.find((c) => tSec >= c.startTime && tSec < (c.endTime || c.startTime + 2));
      if (cap?.text) return cap.text;
    }
    return '';
  }, [ccEnabled, state.playheadTime, audioTracks]);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col items-center justify-center overflow-hidden min-w-0 bg-gradient-to-br from-slate-200 to-slate-300"
      style={themeVarStyle(state.courseSettings.themeColors)}
    >
      <div
        style={{
          width: CANVAS_W, height: CANVAS_H,
          flexShrink: 0,
          transform: `scale(${scale})`, transformOrigin: 'center center',
          ...(state.showGrid && !isPreview ? {
            backgroundImage:
              'linear-gradient(to right, hsl(var(--border) / 0.6) 1px, transparent 1px),' +
              'linear-gradient(to bottom, hsl(var(--border) / 0.6) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          } : {}),
        }}
        className="relative bg-white canvas-glow rounded-none"
        onClick={handleCanvasClick}
      >
        {/* Master slide background layer (locked, non-interactive) */}
        {masterElements.map((el) => {
          const visible = isElementVisible(el, state.playheadTime);
          if (!visible && !isPreview) return (
            <div
              key={`master-${el.id}`}
              style={{
                position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
                opacity: 0.15, pointerEvents: 'none',
              }}
            >
              <ElementRenderer element={el} />
            </div>
          );
          return (
            <div
              key={`master-${el.id}`}
              style={{
                position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height,
                opacity: isPreview ? 1 : 0.6, pointerEvents: 'none',
              }}
            >
              <ElementRenderer element={el} isPreview={isPreview} />
            </div>
          );
        })}

        {/* Regular slide elements */}
        {isPreview
          ? editElements.map((el) => {
              const phase = getAnimationPhase(el, state.playheadTime);
              if (phase === 'before' || phase === 'after') return null;
              const animClass = phase === 'entering' ? getAnimInClass(el.animationIn)
                : phase === 'exiting' ? getAnimOutClass(el.animationOut) : '';
              const animDurMs = phase === 'entering' ? (el.entranceDuration ?? 500)
                : phase === 'exiting' ? (el.exitDuration ?? 500) : 0;
              const clickTriggers = (el.triggers ?? []).filter(
                (t) => (t.event === 'onClick' || t.event === 'click')
              );
              const hasClickTrigger = clickTriggers.length > 0;
              const handleTriggerClick = hasClickTrigger ? (e: React.MouseEvent) => {
                e.stopPropagation();
                for (const t of clickTriggers) {
                  if (t.action === 'jumpToSlide') {
                    const idx = state.slides.findIndex((s) => s.id === t.targetId);
                    if (idx >= 0) {
                      dispatch({ type: 'SET_PLAYING', playing: false });
                      dispatch({ type: 'SET_ACTIVE_SLIDE', index: idx });
                    }
                  } else if (t.action === 'hideElement') {
                    dispatch({ type: 'UPDATE_ELEMENT', id: t.targetId, updates: { isHidden: true } as any });
                  } else if (t.action === 'showElement') {
                    dispatch({ type: 'UPDATE_ELEMENT', id: t.targetId, updates: { isHidden: false } as any });
                  }
                }
              } : undefined;
              const mpOffset = motionPathOffset(el, state.playheadTime);
              const baseTransform = mpOffset ? `translate(${mpOffset.dx}px, ${mpOffset.dy}px)` : undefined;
              return (
                <div
                  key={el.id}
                  className={`${animClass}${hasClickTrigger ? ' cursor-pointer' : ''}`}
                  style={{
                    position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 2,
                    ...(baseTransform ? { transform: baseTransform } : {}),
                    ...(animClass ? { animationDuration: `${animDurMs}ms` } : {}),
                  }}
                  onClick={handleTriggerClick}
                >
                  <ElementRenderer element={el} isPreview />
                </div>
              );
            })
          : editElements.map((el) => {
              const visible = isElementVisible(el, state.playheadTime);
              const isEditing = editingId === el.id && el.type === 'shape';
              const locked = !!el.isLocked;
              const hidden = !!el.isHidden;
              if (hidden) return null;
              return (
                <Rnd
                  key={el.id}
                  size={{ width: el.width, height: el.height }}
                  position={{ x: el.x, y: el.y }}
                  onDragStop={(_e, d) => {
                    const x = state.snapToGrid ? Math.round(d.x / 20) * 20 : d.x;
                    const y = state.snapToGrid ? Math.round(d.y / 20) * 20 : d.y;
                    dispatch({ type: 'UPDATE_ELEMENT', id: el.id, updates: { x, y } });
                  }}
                  onResizeStop={(_e, _dir, ref, _delta, position) => {
                    let w = parseInt(ref.style.width);
                    let h = parseInt(ref.style.height);
                    let x = position.x;
                    let y = position.y;
                    if (state.snapToGrid) {
                      w = Math.max(20, Math.round(w / 20) * 20);
                      h = Math.max(20, Math.round(h / 20) * 20);
                      x = Math.round(x / 20) * 20;
                      y = Math.round(y / 20) * 20;
                    }
                    dispatch({
                      type: 'UPDATE_ELEMENT', id: el.id,
                      updates: { width: w, height: h, x, y },
                    });
                  }}
                  scale={scale}
                  bounds="parent"
                  dragGrid={state.snapToGrid ? [20, 20] : undefined}
                  resizeGrid={state.snapToGrid ? [20, 20] : undefined}
                  disableDragging={isEditing || locked}
                  onMouseDown={(e: MouseEvent) => {
                    if (locked) return;
                    e.stopPropagation();
                    if ((e as any).shiftKey) {
                      dispatch({ type: 'TOGGLE_SELECT_ELEMENT', id: el.id });
                    } else {
                      dispatch({ type: 'SET_ACTIVE_ELEMENT', id: el.id });
                    }
                  }}
                  onDoubleClick={() => { if (!locked && el.type === 'shape') setEditingId(el.id); }}
                  enableResizing={!locked && state.activeElementId === el.id && state.selectedElementIds.length === 1 && !isEditing}
                  resizeHandleStyles={{
                    top: handleStyle, bottom: handleStyle, left: handleStyle, right: handleStyle,
                    topLeft: cornerStyle, topRight: cornerStyle, bottomLeft: cornerStyle, bottomRight: cornerStyle,
                  }}
                  style={{
                    outline: state.activeElementId === el.id
                      ? '2px solid hsl(var(--primary))'
                      : state.selectedElementIds.includes(el.id)
                        ? '2px dashed hsl(var(--primary))'
                        : 'none',
                    zIndex: state.activeElementId === el.id ? 10 : 2,
                    opacity: visible ? 1 : 0.3,
                    pointerEvents: locked ? 'none' : undefined,
                  }}
                >
                  <ElementRenderer element={el} />
                  {isEditing && (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      autoFocus
                      ref={(node) => {
                        if (node && document.activeElement !== node) {
                          node.focus();
                          // place caret at end
                          const range = document.createRange();
                          range.selectNodeContents(node);
                          range.collapse(false);
                          const sel = window.getSelection();
                          sel?.removeAllRanges();
                          sel?.addRange(range);
                        }
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        const text = e.currentTarget.textContent ?? '';
                        dispatch({ type: 'UPDATE_ELEMENT', id: el.id, updates: { text } as Partial<ShapeElement> });
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') { e.currentTarget.blur(); }
                      }}
                      style={{
                        position: 'absolute', inset: 0, zIndex: 20,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                        overflow: 'hidden', padding: 4,
                        color: (el as ShapeElement).textColor ?? '#000000',
                        fontSize: (el as ShapeElement).fontSize ?? 16,
                        outline: '2px dashed hsl(var(--primary))',
                        background: 'transparent',
                        cursor: 'text',
                        wordBreak: 'break-word',
                      }}
                    >
                      {(el as ShapeElement).text ?? ''}
                    </div>
                  )}
                </Rnd>
              );
            })}

        {/* Closed caption overlay (rendered inside the scaled stage so it
            scales with the canvas). */}
        {ccEnabled && activeCaption && (
          <div
            style={{
              position: 'absolute',
              left: '5%',
              right: '5%',
              bottom: '6%',
              textAlign: 'center',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(0,0,0,0.75)',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: Math.round(CANVAS_H * 0.035),
                lineHeight: 1.3,
                maxWidth: '90%',
                whiteSpace: 'pre-wrap',
              }}
            >
              {activeCaption}
            </span>
          </div>
        )}

        {/* Quiz / Results slide overlays — fixed centered layout */}
        {activeSlide?.slideType === 'quiz' && activeSlide.quiz && (
          <QuizSlideOverlay slide={activeSlide} isPreview={isPreview} />
        )}
        {activeSlide?.slideType === 'results' && activeSlide.results && (
          <ResultsSlideOverlay slide={activeSlide} isPreview={isPreview} />
        )}
      </div>

    </div>
  );
}

const handleStyle: React.CSSProperties = {
  width: 10, height: 10,
  background: 'hsl(var(--primary))',
  border: '1px solid hsl(var(--primary-foreground))',
  borderRadius: 1,
};

const cornerStyle: React.CSSProperties = {
  width: 10, height: 10,
  background: 'hsl(var(--primary))',
  border: '1px solid hsl(var(--primary-foreground))',
  borderRadius: 2,
};

// ============================================================================
// Quiz Slide Overlay
// ============================================================================

function gradeQuiz(quiz: QuizConfig, answer: unknown): boolean {
  if (quiz.questionType === 'multiple-choice') {
    const selected = new Set(Array.isArray(answer) ? (answer as string[]) : []);
    const correctIds = new Set((quiz.choices ?? []).filter((c) => c.correct).map((c) => c.id));
    if (selected.size !== correctIds.size) return false;
    for (const id of correctIds) if (!selected.has(id)) return false;
    return true;
  }
  if (quiz.questionType === 'dnd-matching') {
    const map = (answer && typeof answer === 'object') ? (answer as Record<string, string>) : {};
    for (const p of quiz.pairs ?? []) {
      if ((map[p.id] ?? '').trim() !== p.right.trim()) return false;
    }
    return true;
  }
  if (quiz.questionType === 'dnd-sorting') {
    const order = Array.isArray(answer) ? (answer as string[]) : [];
    const correct = (quiz.sortItems ?? []).map((i) => i.id);
    if (order.length !== correct.length) return false;
    return order.every((id, i) => id === correct[i]);
  }
  return false;
}

function QuizSlideOverlay({ slide, isPreview }: { slide: Slide; isPreview: boolean }) {
  const { state, dispatch } = useCourse();
  const quiz = slide.quiz!;
  const answer = state.quizAnswers?.[slide.id];
  const result = state.quizResults?.[slide.id];

  // Attempts: 0 = unlimited, otherwise 1–10. Default 1.
  const maxAttempts = quiz.attempts ?? 1;
  const isUnlimited = maxAttempts === 0;
  const exhaustedBehavior = quiz.attemptsExhaustedBehavior ?? 'reveal';
  const quizRevisit = quiz.quizRevisitMode ?? 'reset';

  // Track whether we've initialized this slide's runtime state for the
  // current visit, and which mode was applied. On slide change in preview,
  // either reset (clear answer/attempts/result) or resume (initialize
  // attempts only if missing).
  const visitedRef = useRef<{ slideId: string; mode: 'reset' | 'resume' } | null>(null);
  useEffect(() => {
    if (!isPreview) return;
    const prev = visitedRef.current;
    const sameVisit = prev && prev.slideId === slide.id && prev.mode === quizRevisit;
    if (sameVisit) return;
    if (quizRevisit === 'reset') {
      dispatch({ type: 'RESET_QUIZ_SLIDE_PROGRESS', slideId: slide.id });
    }
    // Initialize attempts (only if not already set — INIT is a no-op otherwise,
    // which preserves "resume" state across revisits).
    dispatch({
      type: 'INIT_QUIZ_ATTEMPTS',
      slideId: slide.id,
      attempts: isUnlimited ? Number.POSITIVE_INFINITY : maxAttempts,
    });
    visitedRef.current = { slideId: slide.id, mode: quizRevisit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview, slide.id, quizRevisit, maxAttempts, isUnlimited]);

  const remainingRaw = state.quizAttemptsRemaining?.[slide.id];
  const remaining = remainingRaw == null
    ? (isUnlimited ? Number.POSITIVE_INFINITY : maxAttempts)
    : remainingRaw;
  const isLocked = !!result?.submitted;
  const interactive = isPreview && !isLocked;
  const revealCorrect = isLocked && !result?.correct && exhaustedBehavior === 'reveal';

  // Whether to suppress the inline retry banner — set when the learner clicks
  // "Try Again" to dismiss the previous incorrect feedback. Cleared when the
  // attempts-remaining count changes (i.e. the next submit happens) or when
  // the active slide changes.
  const [retryDismissed, setRetryDismissed] = useState(false);
  useEffect(() => {
    setRetryDismissed(false);
  }, [slide.id, remainingRaw]);

  const setAnswer = (a: unknown) => {
    if (!isPreview || isLocked) return;
    dispatch({ type: 'SET_QUIZ_ANSWER', slideId: slide.id, answer: a });
  };

  const submit = () => {
    if (!isPreview || isLocked) return;
    const correct = gradeQuiz(quiz, answer);

    if (correct) {
      dispatch({ type: 'SUBMIT_QUIZ', slideId: slide.id, correct: true });
      const target = quiz.correctFeedback;
      if (target.mode === 'jumpToSlide' && target.targetSlideId) {
        const idx = state.slides.findIndex((s) => s.id === target.targetSlideId);
        if (idx >= 0) dispatch({ type: 'SET_ACTIVE_SLIDE', index: idx });
      } else if (target.mode === 'overlay') {
        dispatch({ type: 'OPEN_QUIZ_FEEDBACK', slideId: slide.id, correct: true });
      }
      return;
    }

    // Incorrect: consume an attempt.
    const attemptsLeftAfter = isUnlimited ? Number.POSITIVE_INFINITY : Math.max(0, remaining - 1);
    if (!isUnlimited) dispatch({ type: 'CONSUME_QUIZ_ATTEMPT', slideId: slide.id });

    const exhausted = !isUnlimited && attemptsLeftAfter <= 0;
    const target = quiz.incorrectFeedback;

    // Jump-to-slide always navigates immediately on incorrect, regardless of
    // attempts remaining. Lock the question first so revisit logic is sound.
    if (target.mode === 'jumpToSlide') {
      dispatch({ type: 'SUBMIT_QUIZ', slideId: slide.id, correct: false });
      if (target.targetSlideId) {
        const idx = state.slides.findIndex((s) => s.id === target.targetSlideId);
        if (idx >= 0) dispatch({ type: 'SET_ACTIVE_SLIDE', index: idx });
      }
      return;
    }

    if (exhausted) {
      // Final incorrect submission — lock the question.
      dispatch({ type: 'SUBMIT_QUIZ', slideId: slide.id, correct: false });
      if (target.mode === 'overlay') {
        dispatch({ type: 'OPEN_QUIZ_FEEDBACK', slideId: slide.id, correct: false });
      }
      return;
    }

    // Attempts remain — show feedback for this incorrect try and let learner retry.
    if (target.mode === 'overlay') {
      dispatch({ type: 'OPEN_QUIZ_FEEDBACK', slideId: slide.id, correct: false });
    }
    // For 'inline' between attempts: the inline retry banner below renders the
    // author's incorrect-feedback message in red until the learner retries.
  };

  // Inline incorrect message between attempts (when attempts remain).
  const showRetryHint =
    isPreview && !isLocked && !retryDismissed && remainingRaw != null && remainingRaw < (isUnlimited ? Number.POSITIVE_INFINITY : maxAttempts);

  const ts = resolveQuizStyle(slide.quizStyle);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
        pointerEvents: isPreview ? 'auto' : 'none',
        background: ts.pageBackgroundColor,
      }}
    >
      <div
        style={{
          background: ts.cardBackgroundColor,
          color: ts.textColor,
          fontFamily: ts.fontFamily,
          borderRadius: ts.cardRadius,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          padding: 32,
          width: '100%',
          maxWidth: 760,
          maxHeight: '100%',
          overflow: 'auto',
        }}
      >
        <h2 style={{ fontSize: ts.questionFontSize, fontWeight: 700, marginBottom: 20, lineHeight: 1.2 }}>
          {quiz.question || 'Untitled question'}
        </h2>

        {quiz.questionType === 'multiple-choice' && (
          <MCPlay
            quiz={quiz}
            answer={answer as string[] | undefined}
            onChange={setAnswer}
            disabled={!interactive}
            revealCorrect={revealCorrect}
            ts={ts}
          />
        )}
        {quiz.questionType === 'dnd-matching' && (
          <MatchPlay quiz={quiz} answer={answer as Record<string, string> | undefined} onChange={setAnswer} disabled={!interactive} ts={ts} />
        )}
        {quiz.questionType === 'dnd-sorting' && (
          <SortPlay quiz={quiz} answer={answer as string[] | undefined} onChange={setAnswer} disabled={!interactive} ts={ts} />
        )}

        {/* Attempts remaining indicator — preview only, only when attempts are limited and quiz is not locked. */}
        {isPreview && !isLocked && !isUnlimited && (
          <p style={{ marginTop: 16, fontSize: 13, color: '#475569', fontWeight: 500 }}>
            Attempts remaining: {remaining}
          </p>
        )}
        {isPreview && !isLocked && isUnlimited && (
          <p style={{ marginTop: 16, fontSize: 13, color: '#475569', fontWeight: 500 }}>
            Unlimited attempts
          </p>
        )}

        {/* Inline incorrect feedback shown after a failed attempt when attempts
            remain. Uses the same red banner style as the final inline feedback
            below, mirroring how correct feedback renders in green. */}
        {showRetryHint && quiz.incorrectFeedback.mode === 'inline' && (
          <div
            style={{
              marginTop: 20,
              padding: 14,
              borderRadius: 8,
              background: '#fee2e2',
              color: '#991b1b',
              fontWeight: 600,
            }}
          >
            {quiz.incorrectFeedback.message || 'Incorrect.'}
          </div>
        )}

        {/* Inline feedback (after final submit) */}
        {result?.submitted && (
          (() => {
            const target = result.correct ? quiz.correctFeedback : quiz.incorrectFeedback;
            if (target.mode !== 'inline') return null;
            return (
              <div
                style={{
                  marginTop: 20,
                  padding: 14,
                  borderRadius: 8,
                  background: result.correct ? '#dcfce7' : '#fee2e2',
                  color: result.correct ? '#166534' : '#991b1b',
                  fontWeight: 600,
                }}
              >
                {target.message || (result.correct ? 'Correct!' : 'Incorrect.')}
              </div>
            );
          })()
        )}

        {isPreview && (() => {
          // Determine which action button to render at the bottom of the quiz.
          // After inline feedback, replace Submit with a contextual button.
          const inlineCorrectShown = isLocked && result?.correct && quiz.correctFeedback.mode === 'inline';
          const inlineFinalIncorrectShown = isLocked && !result?.correct && quiz.incorrectFeedback.mode === 'inline';
          const inlineRetryShown = !isLocked && showRetryHint && quiz.incorrectFeedback.mode === 'inline';

          const advanceNext = () => {
            const next = Math.min(state.activeSlideIndex + 1, state.slides.length - 1);
            dispatch({ type: 'SET_ACTIVE_SLIDE', index: next });
          };
          const tryAgain = () => {
            // Clear selected answer and dismiss inline retry banner.
            dispatch({ type: 'SET_QUIZ_ANSWER', slideId: slide.id, answer: null });
            setRetryDismissed(true);
          };
          const goToSkipTarget = () => {
            const tid = quiz.skipTargetSlideId;
            if (!tid) return;
            const idx = state.slides.findIndex((s) => s.id === tid);
            if (idx >= 0) dispatch({ type: 'SET_ACTIVE_SLIDE', index: idx });
          };

          let primary: { label: string; onClick: () => void; disabled?: boolean } | null = null;
          if (inlineCorrectShown || inlineFinalIncorrectShown) {
            primary = { label: 'Continue', onClick: advanceNext };
          } else if (inlineRetryShown) {
            primary = { label: 'Try Again', onClick: tryAgain };
          } else if (!isLocked) {
            primary = { label: 'Submit', onClick: submit, disabled: answer == null };
          }

          if (!primary && !quiz.allowSkip) return null;

          return (
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {quiz.allowSkip && !isLocked && (
                <button
                  type="button"
                  onClick={goToSkipTarget}
                  disabled={!quiz.skipTargetSlideId}
                  style={{
                    background: '#fff',
                    color: '#0f172a',
                    fontWeight: 600,
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    cursor: quiz.skipTargetSlideId ? 'pointer' : 'not-allowed',
                    opacity: quiz.skipTargetSlideId ? 1 : 0.5,
                  }}
                >
                  Skip
                </button>
              )}
              {primary && (
                <button
                  type="button"
                  onClick={primary.onClick}
                  disabled={primary.disabled}
                  style={{
                    background: ts.buttonColor,
                    color: ts.buttonTextColor,
                    fontWeight: 600,
                    padding: '10px 24px',
                    borderRadius: 8,
                    opacity: primary.disabled ? 0.4 : 1,
                    cursor: primary.disabled ? 'not-allowed' : 'pointer',
                    border: 'none',
                  }}
                >
                  {primary.label}
                </button>
              )}
            </div>
          );
        })()}
        {!isPreview && (
          <p style={{ marginTop: 18, fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
            Editor preview — quiz becomes interactive in Preview / SCORM.
          </p>
        )}
      </div>
    </div>
  );
}

function MCPlay({ quiz, answer, onChange, disabled, revealCorrect, ts }: { quiz: QuizConfig; answer: string[] | undefined; onChange: (a: string[]) => void; disabled: boolean; revealCorrect?: boolean; ts: ResolvedQuizStyle }) {
  const single = quiz.singleSelect !== false;
  const choices = quiz.choices ?? [];
  const selected = new Set(answer ?? []);
  const toggle = (id: string) => {
    if (disabled) return;
    if (single) onChange([id]);
    else {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id); else next.add(id);
      onChange(Array.from(next));
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {choices.map((c) => {
        const isOn = selected.has(c.id);
        const showAsCorrect = revealCorrect && c.correct;
        const borderColor = showAsCorrect ? '#16a34a' : (isOn ? ts.optionSelectedBorderColor : ts.optionBorderColor);
        const bgColor = showAsCorrect ? '#dcfce7' : (isOn ? ts.optionSelectedBackgroundColor : ts.optionBackgroundColor);
        return (
          <label
            key={c.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px',
              border: `2px solid ${borderColor}`,
              background: bgColor,
              borderRadius: ts.optionRadius,
              cursor: disabled ? 'default' : 'pointer',
              fontSize: ts.optionFontSize,
              color: ts.textColor,
            }}
          >
            <input
              type={single ? 'radio' : 'checkbox'}
              name={`mc-${quiz.question}`}
              checked={isOn}
              onChange={() => toggle(c.id)}
              disabled={disabled}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ flex: 1 }}>{c.text}</span>
            {showAsCorrect && (
              <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>✓ Correct</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

function MatchPlay({ quiz, answer, onChange, disabled, ts }: { quiz: QuizConfig; answer: Record<string, string> | undefined; onChange: (a: Record<string, string>) => void; disabled: boolean; ts: ResolvedQuizStyle }) {
  const pairs = quiz.pairs ?? [];
  const map = answer ?? {};
  const rights = pairs.map((p) => p.right);
  const handleDrop = (pairId: string, value: string) => {
    if (disabled) return;
    onChange({ ...map, [pairId]: value });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, background: '#f1f5f9', borderRadius: ts.optionRadius }}>
        {rights.map((r, i) => (
          <span
            key={i}
            draggable={!disabled}
            onDragStart={(e) => e.dataTransfer.setData('text/plain', r)}
            style={{
              padding: '6px 12px',
              background: ts.optionBackgroundColor,
              border: `1px solid ${ts.optionBorderColor}`,
              borderRadius: 6,
              cursor: disabled ? 'default' : 'grab',
              fontSize: ts.optionFontSize - 2,
              color: ts.textColor,
            }}
          >
            {r}
          </span>
        ))}
      </div>
      {pairs.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, padding: '10px 14px', background: ts.optionBackgroundColor, border: `1px solid ${ts.optionBorderColor}`, borderRadius: ts.optionRadius, fontSize: ts.optionFontSize, color: ts.textColor }}>
            {p.left}
          </div>
          <span style={{ color: '#64748b' }}>→</span>
          <div
            onDragOver={(e) => { if (!disabled) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); handleDrop(p.id, e.dataTransfer.getData('text/plain')); }}
            style={{
              flex: 1, minHeight: 42,
              padding: '10px 14px',
              background: map[p.id] ? ts.optionSelectedBackgroundColor : '#f8fafc',
              border: `2px dashed ${map[p.id] ? ts.optionSelectedBorderColor : ts.optionBorderColor}`,
              borderRadius: ts.optionRadius,
              fontSize: ts.optionFontSize,
              color: map[p.id] ? ts.textColor : '#94a3b8',
            }}
          >
            {map[p.id] || 'Drop match here'}
          </div>
        </div>
      ))}
    </div>
  );
}

function SortPlay({ quiz, answer, onChange, disabled, ts }: { quiz: QuizConfig; answer: string[] | undefined; onChange: (a: string[]) => void; disabled: boolean; ts: ResolvedQuizStyle }) {
  const items = quiz.sortItems ?? [];
  const order = answer && answer.length === items.length
    ? answer
    : items.slice().sort((a, b) => a.id.localeCompare(b.id)).map((i) => i.id);
  const byId = new Map(items.map((i) => [i.id, i]));

  const move = (idx: number, dir: -1 | 1) => {
    if (disabled) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    const next = order.slice();
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {order.map((id, i) => (
        <div
          key={id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px',
            background: ts.optionBackgroundColor,
            border: `1px solid ${ts.optionBorderColor}`,
            borderRadius: ts.optionRadius,
            fontSize: ts.optionFontSize,
            color: ts.textColor,
          }}
        >
          <span style={{ color: '#94a3b8', width: 20 }}>{i + 1}.</span>
          <span style={{ flex: 1 }}>{byId.get(id)?.text ?? ''}</span>
          <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} style={{ padding: '4px 10px', border: `1px solid ${ts.optionBorderColor}`, background: ts.optionBackgroundColor, color: ts.textColor, borderRadius: 6, cursor: disabled || i === 0 ? 'not-allowed' : 'pointer' }}>↑</button>
          <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === order.length - 1} style={{ padding: '4px 10px', border: `1px solid ${ts.optionBorderColor}`, background: ts.optionBackgroundColor, color: ts.textColor, borderRadius: 6, cursor: disabled || i === order.length - 1 ? 'not-allowed' : 'pointer' }}>↓</button>
        </div>
      ))}
    </div>
  );
}


// ============================================================================
// Results Slide Overlay
// ============================================================================

function ResultsSlideOverlay({ slide, isPreview }: { slide: Slide; isPreview: boolean }) {
  const { state, dispatch } = useCourse();
  const cfg = slide.results!;
  // Compute score across all quiz slides in the course.
  const quizSlides = state.slides.filter((s) => s.slideType === 'quiz');
  const total = quizSlides.length;
  const correct = quizSlides.reduce((acc, s) => acc + (state.quizResults?.[s.id]?.correct ? 1 : 0), 0);
  const pct = total > 0 ? (correct / total) * 100 : 0;
  const passed = pct >= cfg.passThreshold;

  const retake = () => {
    dispatch({ type: 'RESET_QUIZ_PROGRESS' });
    const firstQuiz = state.slides.findIndex((s) => s.slideType === 'quiz');
    if (firstQuiz >= 0) dispatch({ type: 'SET_ACTIVE_SLIDE', index: firstQuiz });
  };

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 48,
        pointerEvents: isPreview ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          background: '#fff',
          color: '#0f172a',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          padding: 40,
          width: '100%',
          maxWidth: 600,
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Your Results</h2>
        <p style={{ fontSize: 18, color: '#475569', marginBottom: 24 }}>
          {isPreview
            ? `${correct} out of ${total} (${pct.toFixed(0)}%)`
            : 'Score will be calculated after the learner completes the course.'}
        </p>
        {isPreview && (
          <>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                padding: '14px 20px',
                borderRadius: 10,
                background: passed ? '#dcfce7' : '#fee2e2',
                color: passed ? '#166534' : '#991b1b',
                marginBottom: 20,
              }}
            >
              {passed ? 'PASS' : 'FAIL'}
            </div>
            <p style={{ fontSize: 16, marginBottom: 24 }}>
              {passed ? cfg.passMessage : cfg.failMessage}
            </p>
            <button
              type="button"
              onClick={retake}
              style={{
                background: '#3b82f6', color: '#fff',
                fontWeight: 600,
                padding: '10px 28px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Retake Quiz
            </button>
          </>
        )}
        <p style={{ marginTop: 18, fontSize: 12, color: '#64748b' }}>
          Pass threshold: {cfg.passThreshold}%
        </p>
      </div>
    </div>
  );
}
