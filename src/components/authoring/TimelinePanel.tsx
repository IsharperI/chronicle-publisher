import { useCourse } from '@/context/CourseContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, Type, ImageIcon, Square } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { SlideElement } from '@/types/course';

const TIMELINE_DURATION_MS = 10000;
const TRACK_HEIGHT = 28;
const LABEL_WIDTH = 180;

const typeColors: Record<string, string> = {
  text: 'bg-blue-500/80',
  image: 'bg-green-500/80',
  shape: 'bg-purple-500/80',
};

const typeIcons: Record<string, React.ReactNode> = {
  text: <Type className="h-3 w-3" />,
  image: <ImageIcon className="h-3 w-3" />,
  shape: <Square className="h-3 w-3" />,
};

function getElementLabel(el: SlideElement): string {
  if (el.type === 'text') return el.content.slice(0, 20) || 'Text';
  if (el.type === 'image') return el.alt || 'Image';
  return el.shapeType;
}

function TimelineTrack({ element, timelineWidth }: { element: SlideElement; timelineWidth: number }) {
  const { dispatch, state } = useCourse();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'move' | 'resize-right' | null>(null);
  const dragStart = useRef({ mouseX: 0, startTime: 0, duration: 0 });

  const pxPerMs = timelineWidth / TIMELINE_DURATION_MS;
  const barLeft = element.startTime * pxPerMs;
  const barWidth = Math.max(element.duration * pxPerMs, 8);

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'move' | 'resize-right') => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(mode);
    dragStart.current = { mouseX: e.clientX, startTime: element.startTime, duration: element.duration };

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStart.current.mouseX;
      const dMs = dx / pxPerMs;
      if (mode === 'move') {
        const newStart = Math.max(0, Math.min(TIMELINE_DURATION_MS - dragStart.current.duration, dragStart.current.startTime + dMs));
        dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates: { startTime: Math.round(newStart) } });
      } else {
        const newDur = Math.max(200, Math.min(TIMELINE_DURATION_MS - dragStart.current.startTime, dragStart.current.duration + dMs));
        dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates: { duration: Math.round(newDur) } });
      }
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [element, pxPerMs, dispatch]);

  const isSelected = state.activeElementId === element.id;

  return (
    <div ref={trackRef} className="relative h-7 w-full">
      <div
        className={cn(
          'absolute top-0.5 h-6 rounded cursor-grab flex items-center text-[10px] text-white font-medium select-none',
          typeColors[element.type],
          isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          dragging === 'move' && 'cursor-grabbing'
        )}
        style={{ left: barLeft, width: barWidth }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_ACTIVE_ELEMENT', id: element.id }); }}
      >
        <span className="truncate px-1.5">{(element.startTime / 1000).toFixed(1)}s</span>
        <div
          className="absolute right-0 top-0 w-2 h-full cursor-ew-resize hover:bg-white/30 rounded-r"
          onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
        />
      </div>
    </div>
  );
}

export function TimelinePanel() {
  const { state, dispatch } = useCourse();
  const [open, setOpen] = useState(true);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(600);

  const activeSlide = state.slides[state.activeSlideIndex];
  const elements = activeSlide?.elements ?? [];

  const measureWidth = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
      ro.observe(node);
      setTrackWidth(node.clientWidth);
      return () => ro.disconnect();
    }
  }, []);

  const ticks: number[] = [];
  for (let s = 0; s <= TIMELINE_DURATION_MS / 1000; s++) ticks.push(s);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t bg-card shrink-0">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full rounded-none h-7 text-xs gap-1 text-muted-foreground">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          Timeline
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex h-[180px] overflow-hidden">
          {/* Labels */}
          <div className="w-[180px] shrink-0 border-r overflow-y-auto">
            {elements.map((el) => (
              <button
                key={el.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_ELEMENT', id: el.id })}
                className={cn(
                  'w-full h-7 flex items-center gap-1.5 px-2 text-xs truncate hover:bg-accent/50 transition-colors',
                  state.activeElementId === el.id && 'bg-accent text-accent-foreground'
                )}
              >
                {typeIcons[el.type]}
                <span className="truncate">{getElementLabel(el)}</span>
              </button>
            ))}
            {elements.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No elements</p>
            )}
          </div>

          {/* Tracks */}
          <div className="flex-1 overflow-x-auto overflow-y-auto" ref={measureWidth}>
            {/* Tick marks */}
            <div className="relative h-5 border-b shrink-0" style={{ minWidth: trackWidth }}>
              {ticks.map((s) => (
                <span
                  key={s}
                  className="absolute text-[9px] text-muted-foreground top-0"
                  style={{ left: (s / (TIMELINE_DURATION_MS / 1000)) * trackWidth }}
                >
                  {s}s
                </span>
              ))}
            </div>
            <div ref={trackAreaRef} style={{ minWidth: trackWidth }}>
              {elements.map((el) => (
                <TimelineTrack key={el.id} element={el} timelineWidth={trackWidth} />
              ))}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
