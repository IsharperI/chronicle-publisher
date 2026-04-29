import { useCourse } from '@/context/CourseContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronUp, ChevronDown, Type, ImageIcon, Square, Play, Pause, Music, X, Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { SlideElement, TextElement, ShapeElement } from '@/types/course';
import { themeVarRef, themeVarIndex, resolveColor } from '@/lib/themeVars';

const TRACK_HEIGHT = 28;

const typeColors: Record<string, string> = {
  text: 'bg-blue-500/80',
  image: 'bg-green-500/80',
  shape: 'bg-purple-500/80',
  video: 'bg-rose-500/80',
  hotspot: 'bg-emerald-500/80',
  checkbox: 'bg-amber-500/80',
  table: 'bg-cyan-500/80',
};

const typeIcons: Record<string, React.ReactNode> = {
  text: <Type className="h-3 w-3" />,
  image: <ImageIcon className="h-3 w-3" />,
  shape: <Square className="h-3 w-3" />,
  video: <ImageIcon className="h-3 w-3" />,
  hotspot: <Square className="h-3 w-3" />,
  checkbox: <Square className="h-3 w-3" />,
  table: <Square className="h-3 w-3" />,
};

function getElementLabel(el: SlideElement): string {
  if (el.type === 'text') return el.content.slice(0, 20) || 'Text';
  if (el.type === 'image') return el.alt || 'Image';
  if (el.type === 'video') return 'Video';
  if (el.type === 'hotspot') return 'Hotspot';
  if (el.type === 'checkbox') return el.label?.slice(0, 20) || 'Checkbox';
  if (el.type === 'table') return `Table ${el.rowCount}×${el.colCount}`;
  return el.shapeType;
}

function ColorField({ label, value, onChange, themeColors }: { label: string; value: string; onChange: (v: string) => void; themeColors?: string[] }) {
  const palette = themeColors ?? [];
  const themeIdx = themeVarIndex(value);
  const resolvedHex = resolveColor(value, palette, '#ffffff');
  const pickerValue = resolvedHex.startsWith('#') ? resolvedHex : '#ffffff';
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={pickerValue} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs flex-1" />
      </div>
      {palette.length > 0 && (
        <div className="flex gap-1">
          {palette.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(themeVarRef(i))}
              className={`w-5 h-5 rounded-sm border hover:scale-110 transition-transform ${themeIdx === i ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
              style={{ backgroundColor: c }}
              title={c}
              aria-label={`Apply theme color ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineTrack({ element, timelineWidth, slideDuration }: { element: SlideElement; timelineWidth: number; slideDuration: number }) {
  const { dispatch, state } = useCourse();
  const [dragging, setDragging] = useState<'move' | 'resize-right' | 'entrance' | 'exit' | null>(null);
  const dragStart = useRef({ mouseX: 0, startTime: 0, duration: 0, entranceDuration: 0, exitDuration: 0 });

  const pxPerMs = timelineWidth / slideDuration;
  const barLeft = element.startTime * pxPerMs;
  const barWidth = Math.max(element.duration * pxPerMs, 8);
  const entranceMs = element.entranceDuration ?? 500;
  const exitMs = element.exitDuration ?? 500;
  const hasEntrance = element.animationIn && element.animationIn !== 'none';
  const hasExit = element.animationOut && element.animationOut !== 'none';
  // Clamp overlay widths to bar width
  const maxOverlay = Math.max(0, element.duration);
  const entranceOverlayMs = Math.min(entranceMs, maxOverlay);
  const exitOverlayMs = Math.min(exitMs, Math.max(0, maxOverlay - entranceOverlayMs));
  const entranceWidth = entranceOverlayMs * pxPerMs;
  const exitWidth = exitOverlayMs * pxPerMs;

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: 'move' | 'resize-right' | 'entrance' | 'exit') => {
    e.stopPropagation();
    e.preventDefault();
    setDragging(mode);
    dragStart.current = {
      mouseX: e.clientX,
      startTime: element.startTime,
      duration: element.duration,
      entranceDuration: entranceMs,
      exitDuration: exitMs,
    };

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStart.current.mouseX;
      const dMs = dx / pxPerMs;
      if (mode === 'move') {
        const newStart = Math.max(0, Math.min(slideDuration - dragStart.current.duration, dragStart.current.startTime + dMs));
        dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates: { startTime: Math.round(newStart) } });
      } else if (mode === 'resize-right') {
        const newDur = Math.max(200, Math.min(slideDuration - dragStart.current.startTime, dragStart.current.duration + dMs));
        dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates: { duration: Math.round(newDur) } });
      } else if (mode === 'entrance') {
        const newEntrance = Math.max(0, Math.min(dragStart.current.duration - dragStart.current.exitDuration, dragStart.current.entranceDuration + dMs));
        dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates: { entranceDuration: Math.round(newEntrance) } });
      } else if (mode === 'exit') {
        // Dragging the inner edge of the exit overlay leftward grows exitDuration
        const newExit = Math.max(0, Math.min(dragStart.current.duration - dragStart.current.entranceDuration, dragStart.current.exitDuration - dMs));
        dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates: { exitDuration: Math.round(newExit) } });
      }
    };
    const onUp = () => {
      setDragging(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [element, pxPerMs, dispatch, slideDuration, entranceMs, exitMs]);

  const isSelected = state.activeElementId === element.id;

  return (
    <div className="relative h-7 w-full timeline-groove my-0.5">
      <div
        className={cn(
          'absolute top-0.5 h-6 rounded cursor-grab flex items-center text-[10px] text-white font-medium select-none overflow-hidden',
          typeColors[element.type],
          isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          dragging === 'move' && 'cursor-grabbing'
        )}
        style={{ left: barLeft, width: barWidth }}
        onMouseDown={(e) => handleMouseDown(e, 'move')}
        onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_ACTIVE_ELEMENT', id: element.id }); }}
      >
        <span className="truncate px-1.5 relative z-10">{(element.startTime / 1000).toFixed(1)}s</span>

        {/* Entrance overlay (left) */}
        {hasEntrance && entranceWidth > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-white/30 pointer-events-none"
            style={{ width: entranceWidth }}
            title={`Entrance: ${(entranceMs / 1000).toFixed(1)}s`}
          >
            {/* Inner draggable edge */}
            <div
              className="absolute right-0 top-0 w-1.5 h-full cursor-ew-resize bg-white/60 pointer-events-auto hover:bg-white/90"
              onMouseDown={(e) => handleMouseDown(e, 'entrance')}
            />
          </div>
        )}

        {/* Exit overlay (right) */}
        {hasExit && exitWidth > 0 && (
          <div
            className="absolute right-0 top-0 h-full bg-black/30 pointer-events-none"
            style={{ width: exitWidth }}
            title={`Exit: ${(exitMs / 1000).toFixed(1)}s`}
          >
            {/* Inner draggable edge (on the left side of the right overlay) */}
            <div
              className="absolute left-0 top-0 w-1.5 h-full cursor-ew-resize bg-white/60 pointer-events-auto hover:bg-white/90"
              onMouseDown={(e) => handleMouseDown(e, 'exit')}
            />
          </div>
        )}

        {/* Right resize handle for total duration */}
        <div
          className="absolute right-0 top-0 w-2 h-full cursor-ew-resize hover:bg-white/30 rounded-r z-20"
          onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
        />
      </div>
    </div>
  );
}

function StatesPanel() {
  const { state, dispatch } = useCourse();
  const isMasterMode = state.viewMode === 'master';
  const activeSlide = isMasterMode
    ? state.masterSlides[state.activeSlideIndex]
    : state.slides[state.activeSlideIndex];
  const activeElement = activeSlide?.elements.find((el) => el.id === state.activeElementId);
  const themeColors = state.courseSettings.themeColors;

  const [activeState, setActiveState] = useState<'normal' | 'hover'>('normal');

  const update = (updates: Partial<SlideElement>) => {
    if (!activeElement) return;
    dispatch({ type: 'UPDATE_ELEMENT', id: activeElement.id, updates });
  };

  if (!activeElement || (activeElement.type !== 'text' && activeElement.type !== 'shape')) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground">Select a shape or text element to view its states.</p>
      </div>
    );
  }

  if (activeElement.type === 'text') {
    const te = activeElement as TextElement;
    return (
      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <Button variant={activeState === 'normal' ? 'default' : 'outline'} size="sm" className="text-xs h-7 flex-1" onClick={() => setActiveState('normal')}>Normal</Button>
          <Button variant={activeState === 'hover' ? 'default' : 'outline'} size="sm" className="text-xs h-7 flex-1" onClick={() => setActiveState('hover')}>Hover</Button>
        </div>
        {activeState === 'normal' ? (
          <>
            <ColorField label="Text Color" value={te.textColor} onChange={(v) => update({ textColor: v } as any)} themeColors={themeColors} />
            <ColorField label="Background" value={te.backgroundColor} onChange={(v) => update({ backgroundColor: v } as any)} themeColors={themeColors} />
          </>
        ) : (
          <>
            <ColorField label="Hover Text Color" value={te.hoverTextColor ?? ''} onChange={(v) => update({ hoverTextColor: v } as any)} themeColors={themeColors} />
            <ColorField label="Hover Background" value={te.hoverBackgroundColor ?? ''} onChange={(v) => update({ hoverBackgroundColor: v } as any)} themeColors={themeColors} />
            <p className="text-xs text-muted-foreground">Colors applied on hover during preview.</p>
          </>
        )}
      </div>
    );
  }

  const se = activeElement as ShapeElement;
  return (
    <div className="p-3 space-y-3">
      <div className="flex gap-2">
        <Button variant={activeState === 'normal' ? 'default' : 'outline'} size="sm" className="text-xs h-7 flex-1" onClick={() => setActiveState('normal')}>Normal</Button>
        <Button variant={activeState === 'hover' ? 'default' : 'outline'} size="sm" className="text-xs h-7 flex-1" onClick={() => setActiveState('hover')}>Hover</Button>
      </div>
      {activeState === 'normal' ? (
        <>
          <ColorField label="Fill Color" value={se.fillColor} onChange={(v) => update({ fillColor: v } as any)} themeColors={themeColors} />
          <ColorField label="Border Color" value={se.borderColor} onChange={(v) => update({ borderColor: v } as any)} themeColors={themeColors} />
        </>
      ) : (
        <>
          <ColorField label="Hover Fill Color" value={se.hoverFillColor ?? ''} onChange={(v) => update({ hoverFillColor: v } as any)} themeColors={themeColors} />
          <ColorField label="Hover Border Color" value={se.hoverBorderColor ?? ''} onChange={(v) => update({ hoverBorderColor: v } as any)} themeColors={themeColors} />
          <p className="text-xs text-muted-foreground">Colors applied on hover during preview.</p>
        </>
      )}
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
  useEffect(() => {
    if (!state.isPlaying) {
      playheadRef.current = state.playheadTime;
    }
  }, [state.playheadTime, state.isPlaying]);

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

  const slideDurationS = slideDuration / 1000;
  const tickInterval = slideDurationS <= 15 ? 1 : slideDurationS <= 60 ? 5 : slideDurationS <= 180 ? 10 : 30;
  const useMinutes = slideDurationS > 180;
  const ticks: number[] = [];
  for (let s = 0; s <= slideDurationS; s += tickInterval) ticks.push(s);
  const formatTick = (s: number) => {
    if (!useMinutes) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  const playheadLeft = (state.playheadTime / slideDuration) * trackWidth;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="glass border-t border-white/60 shrink-0 rounded-none">
      <div className="flex items-center">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-none h-7 text-xs gap-1 text-muted-foreground px-3">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            Panel
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
        <Tabs defaultValue="timeline" className="h-[180px]">
          <div className="px-2 border-b">
            <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
              <TabsTrigger
                value="timeline"
                className="text-xs px-4 py-1.5 rounded-none border-t-2 border-transparent bg-sky-100 text-slate-600 hover:bg-sky-200 data-[state=active]:bg-white data-[state=active]:border-blue-600 data-[state=active]:text-slate-800 data-[state=active]:shadow-none"
              >
                Timeline
              </TabsTrigger>
              <TabsTrigger
                value="states"
                className="text-xs px-4 py-1.5 rounded-none border-t-2 border-transparent bg-sky-100 text-slate-600 hover:bg-sky-200 data-[state=active]:bg-white data-[state=active]:border-blue-600 data-[state=active]:text-slate-800 data-[state=active]:shadow-none"
              >
                States
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="timeline" className="mt-0 h-[calc(180px-36px)]">
            <div className="flex h-full overflow-hidden">
              {/* Labels */}
              <div className="w-[180px] shrink-0 border-r overflow-y-auto">
                {elements.map((el) => (
                  <div
                    key={el.id}
                    className={cn(
                      'w-full h-7 flex items-center gap-1 px-2 text-xs hover:bg-accent/50 transition-colors',
                      state.activeElementId === el.id && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_ELEMENT', id: el.id, updates: { isHidden: !el.isHidden } }); }}
                      className="opacity-70 hover:opacity-100 shrink-0"
                      title={el.isHidden ? 'Show' : 'Hide'}
                    >
                      {el.isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'UPDATE_ELEMENT', id: el.id, updates: { isLocked: !el.isLocked } }); }}
                      className="opacity-70 hover:opacity-100 shrink-0"
                      title={el.isLocked ? 'Unlock' : 'Lock'}
                    >
                      {el.isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => dispatch({ type: 'SET_ACTIVE_ELEMENT', id: el.id })}
                      className="flex items-center gap-1.5 flex-1 min-w-0 truncate text-left"
                    >
                      {typeIcons[el.type]}
                      <span className="truncate">{getElementLabel(el)}</span>
                    </button>
                  </div>
                ))}
                {elements.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No elements</p>
                )}
                {(activeSlide?.audio ?? []).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => dispatch({ type: 'SET_ACTIVE_AUDIO', id: a.id })}
                    className={cn(
                      'w-full h-7 flex items-center gap-1.5 px-2 text-xs truncate border-t bg-muted/30 hover:bg-accent/50 transition-colors text-left',
                      state.activeAudioId === a.id && 'bg-accent text-accent-foreground'
                    )}
                  >
                    <Music className="h-3 w-3 text-amber-600 shrink-0" />
                    <span className="truncate flex-1">{a.name}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'DELETE_AUDIO', id: a.id }); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dispatch({ type: 'DELETE_AUDIO', id: a.id }); } }}
                      className="opacity-60 hover:opacity-100 shrink-0"
                      title="Remove audio"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </button>
                ))}
              </div>

              {/* Tracks */}
              <div
                className="flex-1 overflow-x-auto overflow-y-auto relative"
                ref={measureWidth}
                onMouseDown={handleScrubDrag}
                onClick={handleScrub}
              >
                <div className="relative h-5 border-b shrink-0" style={{ minWidth: trackWidth }}>
                  {ticks.map((s) => (
                    <span
                      key={s}
                      className="absolute text-[9px] text-muted-foreground top-0"
                      style={{ left: (s / slideDurationS) * trackWidth }}
                    >
                      {formatTick(s)}
                    </span>
                  ))}
                </div>
                <div ref={trackAreaRef} style={{ minWidth: trackWidth }} onClick={(e) => e.stopPropagation()}>
                  {elements.map((el) => (
                    <TimelineTrack key={el.id} element={el} timelineWidth={trackWidth} slideDuration={slideDuration} />
                  ))}
                  {(activeSlide?.audio ?? []).map((a) => {
                    const widthPx = Math.max(8, Math.min(slideDuration, a.duration * 1000) / slideDuration * trackWidth);
                    const selected = state.activeAudioId === a.id;
                    return (
                      <div key={a.id} className="relative h-7 w-full timeline-groove my-0.5">
                        <div
                          className={cn(
                            'absolute top-0.5 h-6 rounded bg-amber-500/80 flex items-center text-[10px] text-white font-medium select-none overflow-hidden px-1.5 cursor-pointer',
                            selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                          )}
                          style={{ left: 0, width: widthPx }}
                          title={`${a.name} — ${a.duration.toFixed(1)}s`}
                          onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SET_ACTIVE_AUDIO', id: a.id }); }}
                        >
                          <Music className="h-3 w-3 mr-1 shrink-0" />
                          <span className="truncate">{a.name} · {a.duration.toFixed(1)}s</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-destructive pointer-events-none z-20"
                  style={{ left: playheadLeft }}
                >
                  <div className="absolute -top-0.5 -left-1.5 w-3.5 h-3 bg-destructive rounded-sm" />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="states" className="mt-0 h-[calc(180px-36px)] overflow-y-auto">
            <StatesPanel />
          </TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  );
}
