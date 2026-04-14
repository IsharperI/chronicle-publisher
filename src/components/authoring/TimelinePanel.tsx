import { useCourse } from '@/context/CourseContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronUp, ChevronDown, Type, ImageIcon, Square, Play, Pause } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { SlideElement } from '@/types/course';

const TRACK_HEIGHT = 28;

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

function TimelineTrack({ element, timelineWidth, slideDuration }: { element: SlideElement; timelineWidth: number; slideDuration: number }) {
  const { dispatch, state } = useCourse();
  const [dragging, setDragging] = useState<'move' | 'resize-right' | null>(null);
  const dragStart = useRef({ mouseX: 0, startTime: 0, duration: 0 });

  const pxPerMs = timelineWidth / slideDuration;
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
        const newStart = Math.max(0, Math.min(slideDuration - dragStart.current.duration, dragStart.current.startTime + dMs));
        dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates: { startTime: Math.round(newStart) } });
      } else {
        const newDur = Math.max(200, Math.min(slideDuration - dragStart.current.startTime, dragStart.current.duration + dMs));
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
  }, [element, pxPerMs, dispatch, slideDuration]);

  const isSelected = state.activeElementId === element.id;

  return (
    <div className="relative h-7 w-full">
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
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const activeSlide = state.viewMode === 'master'
    ? state.masterSlides[state.activeSlideIndex]
    : state.slides[state.activeSlideIndex];
  const elements = activeSlide?.elements ?? [];
  const slideDuration = activeSlide?.duration ?? 5000;

  const measureWidth = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
      ro.observe(node);
      setTrackWidth(node.clientWidth);
      return () => ro.disconnect();
    }
  }, []);

  const playheadRef = useRef(state.playheadTime);
  // Keep ref in sync when user scrubs or resets
  useEffect(() => {
    if (!state.isPlaying) {
      playheadRef.current = state.playheadTime;
    }
  }, [state.playheadTime, state.isPlaying]);

  // Play/pause animation
  useEffect(() => {
    if (!state.isPlaying) {
      cancelAnimationFrame(animRef.current);
      return;
    }
    lastFrameRef.current = performance.now();
    playheadRef.current = Math.max(0, playheadRef.current);
    const tick = (now: number) => {
      const dt = now - lastFrameRef.current;
      lastFrameRef.current = now;
      const next = Math.max(0, playheadRef.current + dt);
      if (next >= slideDuration) {
        playheadRef.current = slideDuration;
        dispatch({ type: 'SET_PLAYHEAD', time: slideDuration });
        dispatch({ type: 'SET_PLAYING', playing: false });
        return;
      }
      playheadRef.current = next;
      dispatch({ type: 'SET_PLAYHEAD', time: next });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [state.isPlaying, slideDuration, dispatch]);

  const togglePlay = () => {
    if (state.isPlaying) {
      dispatch({ type: 'SET_PLAYING', playing: false });
    } else {
      if (state.playheadTime >= slideDuration) {
        dispatch({ type: 'SET_PLAYHEAD', time: 0 });
      }
      dispatch({ type: 'SET_PLAYING', playing: true });
    }
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = Math.max(0, Math.min(slideDuration, (x / trackWidth) * slideDuration));
    dispatch({ type: 'SET_PLAYHEAD', time });
  };

  const handleScrubDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = e.currentTarget;
    const onMove = (ev: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const time = Math.max(0, Math.min(slideDuration, (x / trackWidth) * slideDuration));
      dispatch({ type: 'SET_PLAYHEAD', time });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const tickCount = Math.ceil(slideDuration / 1000);
  const ticks: number[] = [];
  for (let s = 0; s <= tickCount; s++) ticks.push(s);

  const playheadLeft = (state.playheadTime / slideDuration) * trackWidth;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t bg-card shrink-0">
      <div className="flex items-center">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-none h-7 text-xs gap-1 text-muted-foreground px-3">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            Timeline
          </Button>
        </CollapsibleTrigger>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={togglePlay}>
          {state.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <span className="text-[10px] text-muted-foreground ml-1">
          {(state.playheadTime / 1000).toFixed(1)}s / {(slideDuration / 1000).toFixed(1)}s
        </span>
      </div>
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
          <div
            className="flex-1 overflow-x-auto overflow-y-auto relative"
            ref={measureWidth}
            onMouseDown={handleScrubDrag}
            onClick={handleScrub}
          >
            {/* Tick marks */}
            <div className="relative h-5 border-b shrink-0" style={{ minWidth: trackWidth }}>
              {ticks.map((s) => (
                <span
                  key={s}
                  className="absolute text-[9px] text-muted-foreground top-0"
                  style={{ left: (s / (slideDuration / 1000)) * trackWidth }}
                >
                  {s}s
                </span>
              ))}
            </div>
            <div ref={trackAreaRef} style={{ minWidth: trackWidth }} onClick={(e) => e.stopPropagation()}>
              {elements.map((el) => (
                <TimelineTrack key={el.id} element={el} timelineWidth={trackWidth} slideDuration={slideDuration} />
              ))}
            </div>
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-destructive pointer-events-none z-20"
              style={{ left: playheadLeft }}
            >
              <div className="absolute -top-0.5 -left-1.5 w-3.5 h-3 bg-destructive rounded-sm" />
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
