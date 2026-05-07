import { useMemo, useRef, useState, useEffect, WheelEvent, MouseEvent } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { Slide, SlideElement } from '@/types/course';

type NodeShape = 'rect' | 'diamond' | 'circle' | 'results';

interface FlowNode {
  slide: Slide;
  index: number;
  shape: NodeShape;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Row 0 = main sequential row; >0 = branch rows below. */
  row: number;
}

interface FlowEdge {
  fromIndex: number;
  toIndex: number;
  label?: string;
  kind: 'sequential' | 'branch';
}

const NODE_W = 180;
const NODE_H = 90;
const COL_GAP = 80;
const ROW_GAP = 110;
const PAD = 80;

function elementLabel(el: SlideElement | undefined, idx: number): string {
  if (!el) return `Element ${idx + 1}`;
  if (el.type === 'text' && (el as any).content) {
    const t = String((el as any).content).replace(/<[^>]+>/g, '').trim();
    if (t) return t.length > 24 ? t.slice(0, 24) + '…' : t;
  }
  if (el.type === 'shape') return `Shape ${idx + 1}`;
  if (el.type === 'image') return `Image ${idx + 1}`;
  if (el.type === 'video') return `Video ${idx + 1}`;
  if (el.type === 'hotspot') return `Hotspot ${idx + 1}`;
  if (el.type === 'checkbox') return (el as any).label || `Checkbox ${idx + 1}`;
  return `Element ${idx + 1}`;
}

export function StoryViewOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useCourse();

  const { nodes, edges, width, height } = useMemo(() => {
    const slides = state.slides;
    const idToIndex = new Map(slides.map((s, i) => [s.id, i]));

    // Determine jump targets per slide and per-trigger source label
    const jumpsBySlide: { toIndex: number; label: string }[][] = slides.map((slide) => {
      const out: { toIndex: number; label: string }[] = [];
      slide.elements.forEach((el, ei) => {
        for (const t of el.triggers ?? []) {
          if (t.action === 'jumpToSlide' && t.targetId) {
            const idx = idToIndex.get(t.targetId);
            if (idx !== undefined) {
              out.push({ toIndex: idx, label: elementLabel(el, ei) });
            }
          }
        }
      });
      // Quiz config jumps
      const q: any = slide.quiz;
      if (q?.feedbackMode === 'jumpToSlide' && q?.targetSlideId) {
        const idx = idToIndex.get(q.targetSlideId as string);
        if (idx !== undefined) out.push({ toIndex: idx, label: 'Quiz' });
      }
      return out;
    });

    const shapeFor = (slide: Slide, hasJumps: boolean): NodeShape => {
      if (slide.slideType === 'results') return 'results';
      if (slide.slideType === 'quiz') return 'circle';
      if (hasJumps) return 'diamond';
      return 'rect';
    };

    // Layout: main row 0 contains all slides in sequential order. For each
    // jump target whose index is NOT (fromIndex + 1), place an additional
    // "branch" copy on a lower row beneath the source. We don't duplicate
    // nodes — instead the node lives on the main row, and edges route down
    // when the destination is non-adjacent. But to satisfy "branch destinations
    // that break the sequential order are positioned below the main flow row"
    // we move slides that are ONLY reached via a non-adjacent branch target
    // down one row beneath their primary inbound source.

    const inBranchOnly = new Set<number>();
    slides.forEach((_, i) => {
      // A slide is "branch-only off-flow" if no slide sequentially advances to it
      // and at least one jump points to it from a non-adjacent source.
      if (i === 0) return;
      const prev = i - 1;
      const prevHasJumps = jumpsBySlide[prev].length > 0;
      const sequentiallyReached = !prevHasJumps; // sequential arrow drawn from prev
      if (sequentiallyReached) return;
      const inbound = jumpsBySlide.some((arr) => arr.some((j) => j.toIndex === i));
      if (inbound) inBranchOnly.add(i);
    });

    const rowOf = (i: number) => (inBranchOnly.has(i) ? 1 : 0);

    const nodes: FlowNode[] = slides.map((slide, i) => {
      const row = rowOf(i);
      const hasJumps = jumpsBySlide[i].length > 0;
      return {
        slide,
        index: i,
        shape: shapeFor(slide, hasJumps),
        title: slide.title?.trim() || `Slide ${i + 1}`,
        x: PAD + i * (NODE_W + COL_GAP),
        y: PAD + row * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
        row,
      };
    });

    const edges: FlowEdge[] = [];
    const seen = new Set<string>();
    const addEdge = (e: FlowEdge) => {
      const key = `${e.fromIndex}->${e.toIndex}:${e.kind}:${e.label ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push(e);
    };

    slides.forEach((_, i) => {
      const jumps = jumpsBySlide[i];
      if (jumps.length === 0) {
        if (i < slides.length - 1) {
          addEdge({ fromIndex: i, toIndex: i + 1, kind: 'sequential' });
        }
      } else {
        for (const j of jumps) {
          addEdge({ fromIndex: i, toIndex: j.toIndex, label: j.label, kind: 'branch' });
        }
      }
    });

    const cols = Math.max(1, slides.length);
    const rows = nodes.reduce((m, n) => Math.max(m, n.row + 1), 1);
    const width = PAD * 2 + cols * NODE_W + Math.max(0, cols - 1) * COL_GAP;
    const height = PAD * 2 + rows * NODE_H + Math.max(0, rows - 1) * ROW_GAP;

    return { nodes, edges, width, height };
  }, [state.slides]);

  // Pan & zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panState = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    if (open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [open]);

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(2.5, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    panState.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!panState.current) return;
    setPan({
      x: panState.current.px + (e.clientX - panState.current.x),
      y: panState.current.py + (e.clientY - panState.current.y),
    });
  };
  const endPan = () => { panState.current = null; };

  if (!open) return null;

  const anchorOnNode = (n: FlowNode, side: 'right' | 'left' | 'top' | 'bottom') => {
    switch (side) {
      case 'right': return { x: n.x + n.w, y: n.y + n.h / 2 };
      case 'left': return { x: n.x, y: n.y + n.h / 2 };
      case 'top': return { x: n.x + n.w / 2, y: n.y };
      case 'bottom': return { x: n.x + n.w / 2, y: n.y + n.h };
    }
  };

  const edgePath = (e: FlowEdge) => {
    const from = nodes[e.fromIndex];
    const to = nodes[e.toIndex];
    if (!from || !to) return { d: '', mid: { x: 0, y: 0 } };

    // Same row, adjacent or forward → right-to-left orthogonal
    if (from.row === to.row && to.x > from.x) {
      const a = anchorOnNode(from, 'right');
      const b = anchorOnNode(to, 'left');
      const midX = (a.x + b.x) / 2;
      return {
        d: `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`,
        mid: { x: midX, y: (a.y + b.y) / 2 - 6 },
      };
    }
    // Different rows → drop down then across
    if (to.row > from.row) {
      const a = anchorOnNode(from, 'bottom');
      const b = anchorOnNode(to, 'top');
      const midY = (a.y + b.y) / 2;
      return {
        d: `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`,
        mid: { x: (a.x + b.x) / 2, y: midY - 6 },
      };
    }
    if (to.row < from.row) {
      const a = anchorOnNode(from, 'top');
      const b = anchorOnNode(to, 'bottom');
      const midY = (a.y + b.y) / 2;
      return {
        d: `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`,
        mid: { x: (a.x + b.x) / 2, y: midY - 6 },
      };
    }
    // Same row, going backward → loop down
    const a = anchorOnNode(from, 'bottom');
    const b = anchorOnNode(to, 'bottom');
    const dropY = Math.max(a.y, b.y) + 50;
    return {
      d: `M ${a.x} ${a.y} L ${a.x} ${dropY} L ${b.x} ${dropY} L ${b.x} ${b.y}`,
      mid: { x: (a.x + b.x) / 2, y: dropY - 6 },
    };
  };

  const renderNodeShape = (n: FlowNode) => {
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;

    if (n.shape === 'circle') {
      const r = Math.min(n.w, n.h) / 2 - 4;
      return (
        <g>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="hsl(270 90% 96%)"
            stroke="hsl(270 70% 55%)"
            strokeWidth={2}
          />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={28}
            fontWeight={700}
            fill="hsl(270 70% 40%)"
          >
            ?
          </text>
          <text
            x={cx}
            y={n.y + n.h + 16}
            textAnchor="middle"
            fontSize={12}
            fill="hsl(var(--foreground))"
          >
            {n.title.length > 24 ? n.title.slice(0, 24) + '…' : n.title}
          </text>
        </g>
      );
    }

    if (n.shape === 'diamond') {
      const points = `${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`;
      return (
        <g>
          <polygon
            points={points}
            fill="hsl(45 95% 92%)"
            stroke="hsl(28 90% 55%)"
            strokeWidth={2}
          />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={500}
            fill="hsl(var(--foreground))"
          >
            <tspan x={cx} dy="-4">{String(n.index + 1).padStart(2, '0')}</tspan>
            <tspan x={cx} dy="14">{n.title.length > 18 ? n.title.slice(0, 18) + '…' : n.title}</tspan>
          </text>
        </g>
      );
    }

    if (n.shape === 'results') {
      return (
        <g>
          <rect
            x={n.x}
            y={n.y}
            width={n.w}
            height={n.h}
            rx={8}
            fill="hsl(140 60% 92%)"
            stroke="hsl(140 60% 40%)"
            strokeWidth={2}
          />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={600}
            fill="hsl(140 60% 25%)"
          >
            <tspan x={cx} dy="-4">{String(n.index + 1).padStart(2, '0')} · Results</tspan>
            <tspan x={cx} dy="16">{n.title.length > 22 ? n.title.slice(0, 22) + '…' : n.title}</tspan>
          </text>
        </g>
      );
    }

    // rect
    return (
      <g>
        <rect
          x={n.x}
          y={n.y}
          width={n.w}
          height={n.h}
          rx={6}
          fill="hsl(0 0% 100%)"
          stroke="hsl(220 80% 55%)"
          strokeWidth={2}
        />
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight={500}
          fill="hsl(var(--foreground))"
        >
          <tspan x={cx} dy="-4">{String(n.index + 1).padStart(2, '0')}</tspan>
          <tspan x={cx} dy="16">{n.title.length > 22 ? n.title.slice(0, 22) + '…' : n.title}</tspan>
        </text>
      </g>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Course Tree"
    >
      <div className="h-14 border-b border-border flex items-center px-6 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Course Tree</h2>
        <span className="ml-3 text-xs text-muted-foreground">
          · {state.slides.length} slides · read-only
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 mr-4">
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(0.25, z * 0.9))} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums w-12 text-center text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(2.5, z * 1.1))} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset view">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close course tree">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div
        className="flex-1 relative overflow-hidden bg-muted/30"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        style={{ cursor: panState.current ? 'grabbing' : 'grab' }}
      >
        {state.slides.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No slides in this course.
          </div>
        ) : (
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width,
              height,
            }}
          >
            <svg width={width} height={height} style={{ display: 'block' }}>
              <defs>
                <marker
                  id="flowArrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(220 10% 35%)" />
                </marker>
              </defs>

              {edges.map((e, i) => {
                const { d, mid } = edgePath(e);
                if (!d) return null;
                return (
                  <g key={i}>
                    <path
                      d={d}
                      fill="none"
                      stroke="hsl(220 10% 35%)"
                      strokeWidth={1.5}
                      markerEnd="url(#flowArrow)"
                    />
                    {e.label && (
                      <text
                        x={mid.x}
                        y={mid.y}
                        textAnchor="middle"
                        fontSize={10}
                        fill="hsl(var(--muted-foreground))"
                        style={{ paintOrder: 'stroke', stroke: 'hsl(var(--background))', strokeWidth: 3 }}
                      >
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {nodes.map((n) => (
                <g key={n.slide.id}>{renderNodeShape(n)}</g>
              ))}
            </svg>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-4 right-4 bg-card border border-border rounded-md shadow-sm p-3 text-xs space-y-2 pointer-events-none">
          <div className="font-semibold text-foreground mb-1">Legend</div>
          <div className="flex items-center gap-2">
            <svg width="22" height="14"><rect x="1" y="1" width="20" height="12" rx="2" fill="hsl(0 0% 100%)" stroke="hsl(220 80% 55%)" strokeWidth="1.5" /></svg>
            <span className="text-muted-foreground">Slide</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="22" height="14"><polygon points="11,1 21,7 11,13 1,7" fill="hsl(45 95% 92%)" stroke="hsl(28 90% 55%)" strokeWidth="1.5" /></svg>
            <span className="text-muted-foreground">Branching</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="22" height="14"><circle cx="11" cy="7" r="6" fill="hsl(270 90% 96%)" stroke="hsl(270 70% 55%)" strokeWidth="1.5" /></svg>
            <span className="text-muted-foreground">Quiz</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="22" height="14"><rect x="1" y="1" width="20" height="12" rx="2" fill="hsl(140 60% 92%)" stroke="hsl(140 60% 40%)" strokeWidth="1.5" /></svg>
            <span className="text-muted-foreground">Results</span>
          </div>
        </div>
      </div>
    </div>
  );
}
