import { useMemo, useRef, useState, useEffect, WheelEvent, MouseEvent } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { X, Maximize2 } from 'lucide-react';
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
  col: number; // 0 = main, negative = left, positive = right
  row: number;
}

interface FlowEdge {
  fromIndex: number;
  toIndex: number;
  label?: string;
  kind: 'sequential' | 'branch';
  /** Which side of the source the edge exits from. */
  exit: 'top' | 'bottom' | 'left' | 'right';
}

const NODE_W = 180;
const NODE_H = 90;
const COL_GAP = 100;
const ROW_GAP = 80;
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

    // Outgoing jumps per slide
    const jumpsBySlide: { toIndex: number; label: string }[][] = slides.map((slide) => {
      const out: { toIndex: number; label: string }[] = [];
      slide.elements.forEach((el, ei) => {
        for (const t of el.triggers ?? []) {
          if (t.action === 'jumpToSlide' && t.targetId) {
            const idx = idToIndex.get(t.targetId);
            if (idx !== undefined) out.push({ toIndex: idx, label: elementLabel(el, ei) });
          }
        }
      });
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

    // A slide is "branch-only" when no sequential arrow lands on it
    // (i.e., the previous slide is a diamond) yet a jump targets it.
    const inBranchOnly = new Set<number>();
    slides.forEach((_, i) => {
      if (i === 0) return;
      const prev = i - 1;
      const prevHasJumps = jumpsBySlide[prev].length > 0;
      const sequentiallyReached = !prevHasJumps;
      if (sequentiallyReached) return;
      const inbound = jumpsBySlide.some((arr) => arr.some((j) => j.toIndex === i));
      if (inbound) inBranchOnly.add(i);
    });

    // Assign rows: main-flow slides take consecutive rows. Branch-only slides
    // share their parent diamond's row.
    const parentDiamondOf = new Map<number, number>(); // branch-only idx -> source diamond idx
    slides.forEach((_, i) => {
      if (!inBranchOnly.has(i)) return;
      // find first diamond that jumps to i
      for (let s = 0; s < slides.length; s++) {
        if (jumpsBySlide[s].some((j) => j.toIndex === i)) {
          parentDiamondOf.set(i, s);
          break;
        }
      }
    });

    const rowOfIndex = new Map<number, number>();
    let mainRow = 0;
    slides.forEach((_, i) => {
      if (inBranchOnly.has(i)) return;
      rowOfIndex.set(i, mainRow++);
    });
    // branch-only: same row as parent diamond
    slides.forEach((_, i) => {
      if (!inBranchOnly.has(i)) return;
      const parent = parentDiamondOf.get(i);
      const r = parent !== undefined ? rowOfIndex.get(parent) ?? 0 : 0;
      rowOfIndex.set(i, r);
    });

    // Assign columns: main-flow = 0. Branch-only siblings of the same diamond
    // get distributed: first to the right (+1), then left (-1), then +2, -2.
    const colOfIndex = new Map<number, number>();
    slides.forEach((_, i) => { if (!inBranchOnly.has(i)) colOfIndex.set(i, 0); });

    const branchChildrenByParent = new Map<number, number[]>();
    inBranchOnly.forEach((i) => {
      const p = parentDiamondOf.get(i);
      if (p === undefined) return;
      const list = branchChildrenByParent.get(p) ?? [];
      list.push(i);
      branchChildrenByParent.set(p, list);
    });
    branchChildrenByParent.forEach((children) => {
      children.sort((a, b) => a - b);
      children.forEach((child, k) => {
        // 0 -> +1, 1 -> -1, 2 -> +2, 3 -> -2 ...
        const step = Math.floor(k / 2) + 1;
        const sign = k % 2 === 0 ? 1 : -1;
        colOfIndex.set(child, sign * step);
      });
    });

    // Determine bounds
    let minCol = 0, maxCol = 0, maxRow = 0;
    slides.forEach((_, i) => {
      const c = colOfIndex.get(i) ?? 0;
      const r = rowOfIndex.get(i) ?? 0;
      if (c < minCol) minCol = c;
      if (c > maxCol) maxCol = c;
      if (r > maxRow) maxRow = r;
    });

    const colToX = (c: number) => PAD + (c - minCol) * (NODE_W + COL_GAP);
    const rowToY = (r: number) => PAD + r * (NODE_H + ROW_GAP);

    const nodes: FlowNode[] = slides.map((slide, i) => {
      const hasJumps = jumpsBySlide[i].length > 0;
      const col = colOfIndex.get(i) ?? 0;
      const row = rowOfIndex.get(i) ?? 0;
      return {
        slide, index: i,
        shape: shapeFor(slide, hasJumps),
        title: slide.title?.trim() || `Slide ${i + 1}`,
        x: colToX(col), y: rowToY(row),
        w: NODE_W, h: NODE_H,
        col, row,
      };
    });

    // Build edges with thoughtful exit-side assignment.
    const edges: FlowEdge[] = [];
    const mainOrder: number[] = [];
    slides.forEach((_, i) => { if (!inBranchOnly.has(i)) mainOrder.push(i); });

    // Sequential main-flow edges: between consecutive entries in mainOrder,
    // unless the source has its own jump triggers (in which case sequential is
    // implicit only if there's no jump to the next index — keep both but mark
    // sequential coming out of bottom).
    for (let m = 0; m < mainOrder.length - 1; m++) {
      const fromIdx = mainOrder[m];
      const toIdx = mainOrder[m + 1];
      // Always draw a sequential arrow between consecutive main-flow slides.
      // Visual distinction (solid vs dashed branches) keeps the diagram readable.
      edges.push({ fromIndex: fromIdx, toIndex: toIdx, kind: 'sequential', exit: 'bottom' });
    }

    // Branch edges from diamonds.
    slides.forEach((_, i) => {
      const jumps = jumpsBySlide[i];
      if (jumps.length === 0) return;
      // Sort jumps so the one matching the next main slide uses the bottom exit;
      // the others use right/left/top depending on target column relative to source.
      const sourceCol = colOfIndex.get(i) ?? 0;
      const sourceRow = rowOfIndex.get(i) ?? 0;
      // Track exits used to avoid duplicates.
      const usedExits = new Set<FlowEdge['exit']>();
      // First pass: assign bottom to a target that sits directly below in the main column.
      for (const j of jumps) {
        const tCol = colOfIndex.get(j.toIndex) ?? 0;
        const tRow = rowOfIndex.get(j.toIndex) ?? 0;
        if (tCol === sourceCol && tRow > sourceRow && !usedExits.has('bottom')) {
          edges.push({ fromIndex: i, toIndex: j.toIndex, label: j.label, kind: 'branch', exit: 'bottom' });
          usedExits.add('bottom');
          (j as any)._assigned = true;
        }
      }
      // Second pass: assign right/left for side branches by column sign.
      for (const j of jumps) {
        if ((j as any)._assigned) continue;
        const tCol = colOfIndex.get(j.toIndex) ?? 0;
        let exit: FlowEdge['exit'];
        if (tCol > sourceCol && !usedExits.has('right')) exit = 'right';
        else if (tCol < sourceCol && !usedExits.has('left')) exit = 'left';
        else if (!usedExits.has('right')) exit = 'right';
        else if (!usedExits.has('left')) exit = 'left';
        else if (!usedExits.has('top')) exit = 'top';
        else exit = 'bottom';
        usedExits.add(exit);
        edges.push({ fromIndex: i, toIndex: j.toIndex, label: j.label, kind: 'branch', exit });
      }
    });

    const colsCount = maxCol - minCol + 1;
    const width = PAD * 2 + colsCount * NODE_W + Math.max(0, colsCount - 1) * COL_GAP;
    const height = PAD * 2 + (maxRow + 1) * NODE_H + maxRow * ROW_GAP;

    return { nodes, edges, width, height };
  }, [state.slides]);

  // Pan & zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panState = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setZoom(1); setPan({ x: 0, y: 0 }); }
  }, [open]);

  const zoomBy = (factor: number) => {
    setZoom((z) => {
      const next = Math.min(2, Math.max(0.25, z * factor));
      if (viewportRef.current) {
        // Keep the center of the viewport stable
        const rect = viewportRef.current.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        setPan((p) => ({
          x: cx - ((cx - p.x) / z) * next,
          y: cy - ((cy - p.y) / z) * next,
        }));
      }
      return next;
    });
  };

  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
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
    // For diamond, anchor at the actual diamond points (which align with rect mid sides).
    switch (side) {
      case 'right': return { x: n.x + n.w, y: n.y + n.h / 2 };
      case 'left': return { x: n.x, y: n.y + n.h / 2 };
      case 'top': return { x: n.x + n.w / 2, y: n.y };
      case 'bottom': return { x: n.x + n.w / 2, y: n.y + n.h };
    }
  };

  /**
   * Compute an orthogonal path from source's chosen exit to the target's
   * nearest face, with a small per-edge offset so parallel arrows don't overlap.
   */
  const edgePath = (e: FlowEdge, parallelOffset: number) => {
    const from = nodes[e.fromIndex];
    const to = nodes[e.toIndex];
    if (!from || !to) return { d: '', mid: { x: 0, y: 0 } };

    const a = anchorOnNode(from, e.exit);
    // Choose target entry side based on geometry relative to exit direction.
    let toSide: 'top' | 'bottom' | 'left' | 'right';
    if (e.exit === 'bottom') {
      if (to.y + to.h < from.y) {
        // Back-arrow to a slide above: enter from the side based on horizontal position.
        const centerX = from.x + from.w / 2;
        toSide = to.x + to.w / 2 < centerX ? 'right' : 'left';
      } else {
        toSide = to.y >= from.y + from.h ? 'top' : (to.x > from.x ? 'left' : 'right');
      }
    }
    else if (e.exit === 'top') toSide = to.y + to.h <= from.y ? 'bottom' : (to.x > from.x ? 'left' : 'right');
    else if (e.exit === 'right') toSide = to.x >= from.x + from.w ? 'left' : (to.y > from.y ? 'top' : 'bottom');
    else toSide = to.x + to.w <= from.x ? 'right' : (to.y > from.y ? 'top' : 'bottom');
    const b = anchorOnNode(to, toSide);

    const off = parallelOffset;

    // Same column straight vertical
    if (e.exit === 'bottom' && toSide === 'top' && a.x === b.x) {
      return { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, mid: { x: a.x, y: (a.y + b.y) / 2 } };
    }
    if (e.exit === 'top' && toSide === 'bottom' && a.x === b.x) {
      return { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, mid: { x: a.x, y: (a.y + b.y) / 2 } };
    }
    // Same row straight horizontal
    if ((e.exit === 'right' || e.exit === 'left') && a.y === b.y) {
      return { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, mid: { x: (a.x + b.x) / 2, y: a.y } };
    }

    // Orthogonal: exit out, then along, then in.
    const STUB = 24 + off;
    if (e.exit === 'bottom') {
      const midY = a.y + STUB;
      return {
        d: `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`,
        mid: { x: (a.x + b.x) / 2, y: midY },
      };
    }
    if (e.exit === 'top') {
      const midY = a.y - STUB;
      return {
        d: `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`,
        mid: { x: (a.x + b.x) / 2, y: midY },
      };
    }
    if (e.exit === 'right') {
      const midX = a.x + STUB;
      return {
        d: `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`,
        mid: { x: midX, y: (a.y + b.y) / 2 },
      };
    }
    // left
    const midX = a.x - STUB;
    return {
      d: `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`,
      mid: { x: midX, y: (a.y + b.y) / 2 },
    };
  };

  // Per-source parallel offsets so multiple branches from same diamond don't overlap.
  const offsetByEdge = new Map<number, number>();
  const seenBySource = new Map<number, number>();
  edges.forEach((e, i) => {
    const k = seenBySource.get(e.fromIndex) ?? 0;
    seenBySource.set(e.fromIndex, k + 1);
    offsetByEdge.set(i, k * 6);
  });

  const renderNodeShape = (n: FlowNode) => {
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;

    if (n.shape === 'circle') {
      const r = Math.min(n.w, n.h) / 2 - 4;
      const titleText = n.title.length > 24 ? n.title.slice(0, 24) + '…' : n.title;
      const titleW = Math.max(40, titleText.length * 6.5 + 12);
      return (
        <g>
          {/* solid white background to clip arrows behind */}
          <circle cx={cx} cy={cy} r={r + 1} fill="hsl(0 0% 100%)" />
          <circle
            cx={cx} cy={cy} r={r}
            fill="hsl(270 90% 96%)"
            stroke="hsl(270 70% 55%)" strokeWidth={2}
          />
          <text
            x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fontSize={28} fontWeight={700} fill="hsl(270 70% 40%)"
          >?</text>
          <rect
            x={cx - titleW / 2} y={n.y + n.h + 4}
            width={titleW} height={18} rx={3}
            fill="hsl(0 0% 100%)"
          />
          <text
            x={cx} y={n.y + n.h + 16}
            textAnchor="middle" fontSize={12} fill="hsl(var(--foreground))"
          >{titleText}</text>
        </g>
      );
    }

    if (n.shape === 'diamond') {
      const points = `${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}`;
      return (
        <g>
          {/* white backing same shape to clip arrows */}
          <polygon points={points} fill="hsl(0 0% 100%)" />
          <polygon
            points={points}
            fill="hsl(45 95% 92%)"
            stroke="hsl(28 90% 55%)" strokeWidth={2}
          />
          <text
            x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fontSize={12} fontWeight={500} fill="hsl(var(--foreground))"
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
          <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={8} fill="hsl(0 0% 100%)" />
          <rect
            x={n.x} y={n.y} width={n.w} height={n.h} rx={8}
            fill="hsl(140 60% 92%)"
            stroke="hsl(140 60% 40%)" strokeWidth={2}
          />
          <text
            x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
            fontSize={12} fontWeight={600} fill="hsl(140 60% 25%)"
          >
            <tspan x={cx} dy="-4">{String(n.index + 1).padStart(2, '0')} · Results</tspan>
            <tspan x={cx} dy="16">{n.title.length > 22 ? n.title.slice(0, 22) + '…' : n.title}</tspan>
          </text>
        </g>
      );
    }

    return (
      <g>
        <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} fill="hsl(0 0% 100%)" />
        <rect
          x={n.x} y={n.y} width={n.w} height={n.h} rx={6}
          fill="hsl(0 0% 100%)"
          stroke="hsl(220 80% 55%)" strokeWidth={2}
        />
        <text
          x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={12} fontWeight={500} fill="hsl(var(--foreground))"
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
      role="dialog" aria-modal="true" aria-label="Course Tree"
    >
      <div className="h-14 border-b border-border flex items-center px-6 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Course Tree</h2>
        <span className="ml-3 text-xs text-muted-foreground">
          · {state.slides.length} slides · read-only
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close course tree">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div
        ref={viewportRef}
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
              width, height,
            }}
          >
            <svg width={width} height={height} style={{ display: 'block' }}>
              <defs>
                <marker
                  id="flowArrow" viewBox="0 0 10 10"
                  refX="9" refY="5" markerWidth="7" markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(220 10% 35%)" />
                </marker>
              </defs>

              {/* Edges (rendered first, beneath nodes) */}
              {edges.map((e, i) => {
                const { d } = edgePath(e, offsetByEdge.get(i) ?? 0);
                if (!d) return null;
                const isBranch = e.kind === 'branch';
                return (
                  <path
                    key={`edge-${i}`}
                    d={d} fill="none"
                    stroke="hsl(220 10% 35%)" strokeWidth={1.5}
                    strokeDasharray={isBranch ? '6 4' : undefined}
                    markerEnd="url(#flowArrow)"
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map((n) => (
                <g key={n.slide.id}>{renderNodeShape(n)}</g>
              ))}

              {/* Edge labels rendered LAST so they sit above arrows and nodes */}
              {edges.map((e, i) => {
                if (!e.label) return null;
                const { d, mid } = edgePath(e, offsetByEdge.get(i) ?? 0);
                if (!d) return null;
                const text = e.label;
                const w = Math.max(24, text.length * 6.2 + 10);
                return (
                  <g key={`label-${i}`}>
                    <rect
                      x={mid.x - w / 2} y={mid.y - 8}
                      width={w} height={16} rx={3}
                      fill="hsl(0 0% 100%)"
                      stroke="hsl(220 15% 85%)" strokeWidth={0.5}
                    />
                    <text
                      x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central"
                      fontSize={10} fill="hsl(var(--muted-foreground))"
                    >{text}</text>
                  </g>
                );
              })}

              {/* Re-render the "?" glyph for quiz circles on top so it's never covered */}
              {nodes.filter((n) => n.shape === 'circle').map((n) => {
                const cx = n.x + n.w / 2;
                const cy = n.y + n.h / 2;
                return (
                  <text
                    key={`q-${n.slide.id}`}
                    x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
                    fontSize={28} fontWeight={700} fill="hsl(270 70% 40%)"
                    pointerEvents="none"
                  >?</text>
                );
              })}
            </svg>
          </div>
        )}

        {/* Legend (top right) */}
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

        {/* Zoom controls (bottom right) */}
        <div className="absolute bottom-4 right-4 bg-card border border-border rounded-md shadow-sm flex items-center gap-1 p-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(0.9)} aria-label="Zoom out">
            <span className="text-base font-semibold">−</span>
          </Button>
          <span className="text-xs tabular-nums w-10 text-center text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(1.1)} aria-label="Zoom in">
            <span className="text-base font-semibold">+</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
            Reset
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} aria-label="Reset view">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
