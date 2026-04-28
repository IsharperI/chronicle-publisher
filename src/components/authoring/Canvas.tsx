import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Rnd } from 'react-rnd';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Captions, CaptionsOff } from 'lucide-react';
import type { SlideElement, TextElement, ShapeElement, AnimationIn, AnimationOut } from '@/types/course';
import { themeVarStyle } from '@/lib/themeVars';

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
          border: `${se.borderWidth}px solid ${border}`, borderRadius: 4,
          transition: isPreview ? 'background-color 0.2s, border-color 0.2s' : undefined,
          cursor: isPreview && (se.hoverFillColor || se.hoverBorderColor) ? 'pointer' : undefined,
        }}
      >
        <ShapeText se={se} isPreview={isPreview} />
      </div>
    );
  }
  return null;
}

function isElementVisible(el: SlideElement, playheadTime: number): boolean {
  return playheadTime >= el.startTime && playheadTime < el.startTime + el.duration;
}

export function Canvas() {
  const { state, dispatch } = useCourse();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [editingId, setEditingId] = useState<string | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const previewAccumRef = useRef(0);
  const ccEnabled = state.ccEnabled;

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
  useEffect(() => {
    if (!isPreview) return;
    let raf = 0;
    let last = performance.now();
    const slideDur = activeSlide?.duration ?? 5000;
    dispatch({ type: 'SET_PLAYHEAD', time: 0 });
    dispatch({ type: 'SET_PLAYING', playing: true });
    previewAccumRef.current = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      previewAccumRef.current += dt;
      const next = Math.min(slideDur, previewAccumRef.current);
      dispatch({ type: 'SET_PLAYHEAD', time: next });
      if (next >= slideDur) {
        dispatch({ type: 'SET_PLAYING', playing: false });
        cancelAnimationFrame(raf);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPreview, slideKey, activeSlide?.duration, dispatch]);

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
      className="flex-1 bg-muted/50 flex flex-col items-center justify-center overflow-hidden min-w-0"
      style={themeVarStyle(state.courseSettings.themeColors)}
    >
      <div
        style={{
          width: CANVAS_W, height: CANVAS_H,
          transform: `scale(${scale})`, transformOrigin: 'center center',
          ...(state.showGrid && !isPreview ? {
            backgroundImage:
              'linear-gradient(to right, hsl(var(--border) / 0.6) 1px, transparent 1px),' +
              'linear-gradient(to bottom, hsl(var(--border) / 0.6) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          } : {}),
        }}
        className="relative bg-background shadow-lg border rounded"
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
              return (
                <div
                  key={el.id}
                  className={animClass}
                  style={{
                    position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 2,
                    ...(animClass ? { animationDuration: `${animDurMs}ms` } : {}),
                  }}
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
