import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Slide, SlideElement } from '@/types/course';

const THUMB_WIDTH = 160; // px rendered width of the thumbnail box

/**
 * Render a miniature, read-only preview of a slide's elements scaled to fit
 * inside a fixed-width thumbnail box. Uses proportional divs (no heavy
 * canvas rendering) so the panel stays cheap to render for many slides.
 */
function SlideThumbnail({ slide, canvasWidth, canvasHeight }: {
  slide: Slide;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const scale = THUMB_WIDTH / canvasWidth;
  const thumbHeight = canvasHeight * scale;

  return (
    <div
      className="relative w-full bg-white overflow-hidden"
      style={{ height: thumbHeight }}
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {slide.elements.map((el: SlideElement) => {
          const baseStyle: React.CSSProperties = {
            position: 'absolute',
            left: el.x,
            top: el.y,
            width: el.width,
            height: el.height,
            overflow: 'hidden',
          };

          if (el.type === 'text') {
            return (
              <div
                key={el.id}
                style={{
                  ...baseStyle,
                  color: el.textColor,
                  backgroundColor: el.backgroundColor,
                  fontSize: el.fontSize,
                  fontWeight: el.fontWeight as React.CSSProperties['fontWeight'],
                  lineHeight: 1.1,
                }}
              >
                {el.content}
              </div>
            );
          }

          if (el.type === 'shape') {
            return (
              <div
                key={el.id}
                style={{
                  ...baseStyle,
                  backgroundColor: el.fillColor,
                  border: `${el.borderWidth}px solid ${el.borderColor}`,
                  borderRadius:
                    el.shapeType === 'circle'
                      ? '50%'
                      : el.borderRadius ?? 0,
                }}
              />
            );
          }

          if (el.type === 'image') {
            return (
              <img
                key={el.id}
                src={el.src}
                alt=""
                style={{ ...baseStyle, objectFit: 'cover' }}
              />
            );
          }

          if (el.type === 'video') {
            return (
              <div
                key={el.id}
                style={{ ...baseStyle, backgroundColor: '#1f2937' }}
              />
            );
          }

          if (el.type === 'hotspot') {
            return (
              <div
                key={el.id}
                style={{
                  ...baseStyle,
                  border: '2px dashed #94a3b8',
                  backgroundColor: 'rgba(148,163,184,0.1)',
                }}
              />
            );
          }

          if (el.type === 'checkbox') {
            return (
              <div
                key={el.id}
                style={{
                  ...baseStyle,
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                }}
              />
            );
          }

          if (el.type === 'table') {
            return (
              <div
                key={el.id}
                style={{
                  ...baseStyle,
                  backgroundColor: '#fff',
                  border: `1px solid ${el.borderColor ?? '#94a3b8'}`,
                }}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

export function SlidePanel() {
  const { state, dispatch } = useCourse();
  const isMain = state.viewMode === 'main';
  const slides = isMain ? state.slides : state.masterSlides;
  const { width: canvasWidth, height: canvasHeight } = state.courseSettings.canvasDimensions;

  return (
    <div className="w-[200px] glass border-r border-white/60 flex flex-col shrink-0 rounded-none">
      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'main' })}
          className={cn(
            'flex-1 px-2 py-2 text-xs font-medium transition-colors border-t-2',
            isMain
              ? 'bg-white border-blue-600 text-blue-600'
              : 'bg-sky-50/60 border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          Main Timeline
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'master' })}
          className={cn(
            'flex-1 px-2 py-2 text-xs font-medium transition-colors border-t-2',
            !isMain
              ? 'bg-white border-blue-600 text-blue-600'
              : 'bg-sky-50/60 border-transparent text-slate-500 hover:text-slate-700'
          )}
        >
          Masters
        </button>
      </div>

      {/* Slide list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          {slides.map((slide, i) => {
            const isActive = i === state.activeSlideIndex;
            const fallback = isMain ? `Slide ${i + 1}` : `Master ${i + 1}`;
            const label = slide.title?.trim() || fallback;
            const num = String(i + 1).padStart(2, '0');
            return (
              <div key={slide.id} className="flex flex-col gap-1">
                <div className="text-xs font-semibold text-slate-700 text-left px-0.5 flex items-center gap-1.5">
                  <span className="text-slate-500">{num}</span>
                  <span className="truncate">{label}</span>
                  {isMain && slide.masterId && (
                    <span className="ml-auto text-[9px] text-primary font-bold">M</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (isMain) {
                      dispatch({ type: 'SET_ACTIVE_SLIDE', index: i });
                    } else {
                      dispatch({ type: 'SET_ACTIVE_MASTER_SLIDE', index: i });
                    }
                  }}
                  className={cn(
                    'relative w-full bg-white overflow-hidden transition-colors block',
                    isActive
                      ? 'border-2 border-primary shadow-sm'
                      : 'border border-slate-300 hover:border-slate-400'
                  )}
                >
                  <SlideThumbnail
                    slide={slide}
                    canvasWidth={canvasWidth}
                    canvasHeight={canvasHeight}
                  />
                </button>
              </div>
            );
          })}
          {!isMain && slides.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No master slides</p>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-2 border-t flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => {
            if (isMain) {
              dispatch({ type: 'ADD_SLIDE' });
            } else {
              dispatch({ type: 'ADD_MASTER_SLIDE' });
            }
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {isMain ? 'Add Slide' : 'Add Master'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            if (isMain) {
              dispatch({ type: 'DELETE_SLIDE', index: state.activeSlideIndex });
            } else {
              dispatch({ type: 'DELETE_MASTER_SLIDE', index: state.activeSlideIndex });
            }
          }}
          disabled={isMain ? state.slides.length <= 1 : state.masterSlides.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
