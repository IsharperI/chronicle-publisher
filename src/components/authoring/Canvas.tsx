import { useRef, useEffect, useState, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
      if (!state.activeElementId || state.previewMode) return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      dispatch({ type: 'DELETE_ELEMENT', id: state.activeElementId });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.activeElementId, state.previewMode, dispatch]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isPreview && e.target === e.currentTarget) dispatch({ type: 'SET_ACTIVE_ELEMENT', id: null });
  };

  const editElements = activeSlide?.elements ?? [];

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-muted/50 flex flex-col items-center justify-center overflow-hidden min-w-0"
      style={themeVarStyle(state.courseSettings.themeColors)}
    >
      <div
        style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: 'center center' }}
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
              return (
                <Rnd
                  key={el.id}
                  size={{ width: el.width, height: el.height }}
                  position={{ x: el.x, y: el.y }}
                  onDragStop={(_e, d) => dispatch({ type: 'UPDATE_ELEMENT', id: el.id, updates: { x: d.x, y: d.y } })}
                  onResizeStop={(_e, _dir, ref, _delta, position) => {
                    dispatch({
                      type: 'UPDATE_ELEMENT', id: el.id,
                      updates: { width: parseInt(ref.style.width), height: parseInt(ref.style.height), x: position.x, y: position.y },
                    });
                  }}
                  scale={scale}
                  bounds="parent"
                  disableDragging={isEditing}
                  onMouseDown={(e: MouseEvent) => { e.stopPropagation(); dispatch({ type: 'SET_ACTIVE_ELEMENT', id: el.id }); }}
                  onDoubleClick={() => { if (el.type === 'shape') setEditingId(el.id); }}
                  enableResizing={state.activeElementId === el.id && !isEditing}
                  resizeHandleStyles={{
                    top: handleStyle, bottom: handleStyle, left: handleStyle, right: handleStyle,
                    topLeft: cornerStyle, topRight: cornerStyle, bottomLeft: cornerStyle, bottomRight: cornerStyle,
                  }}
                  style={{
                    outline: state.activeElementId === el.id ? '2px solid hsl(var(--primary))' : 'none',
                    zIndex: state.activeElementId === el.id ? 10 : 2,
                    opacity: visible ? 1 : 0.3,
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
      </div>

      {isPreview && (
        <div className="flex items-center gap-4 mt-4">
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'PREVIEW_PREV' })} disabled={state.activeSlideIndex === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" />Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Slide {state.activeSlideIndex + 1} of {state.slides.length}
          </span>
          <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'PREVIEW_NEXT' })} disabled={state.activeSlideIndex === state.slides.length - 1}>
            Next<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
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
