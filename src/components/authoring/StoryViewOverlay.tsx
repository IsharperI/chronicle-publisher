import { useMemo } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { X, HelpCircle, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Slide } from '@/types/course';

interface NodePos {
  slide: Slide;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Edge {
  fromIndex: number;
  toIndex: number;
  kind: 'sequential' | 'trigger';
}

const NODE_W = 200;
const NODE_H = 110;
const COL_GAP = 100;
const ROW_GAP = 60;
const PAD = 60;
const COLS_PER_ROW = 5;

export function StoryViewOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useCourse();

  const { nodes, edges, width, height } = useMemo(() => {
    const slides = state.slides;
    const nodes: NodePos[] = slides.map((s, i) => {
      const col = i % COLS_PER_ROW;
      const row = Math.floor(i / COLS_PER_ROW);
      return {
        slide: s,
        index: i,
        x: PAD + col * (NODE_W + COL_GAP),
        y: PAD + row * (NODE_H + ROW_GAP),
        w: NODE_W,
        h: NODE_H,
      };
    });

    const idToIndex = new Map(slides.map((s, i) => [s.id, i]));
    const edges: Edge[] = [];
    const seen = new Set<string>();
    const addEdge = (from: number, to: number, kind: Edge['kind']) => {
      if (from === to) return;
      const key = `${from}->${to}:${kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ fromIndex: from, toIndex: to, kind });
    };

    slides.forEach((slide, i) => {
      const triggerTargets: number[] = [];
      for (const el of slide.elements) {
        for (const t of el.triggers ?? []) {
          if (t.action === 'jumpToSlide' && t.targetId) {
            const idx = idToIndex.get(t.targetId);
            if (idx !== undefined) triggerTargets.push(idx);
          }
        }
      }
      // Quiz config jumps
      const q = slide.quiz;
      if (q) {
        if (q.feedbackMode === 'jumpToSlide' && (q as any).targetSlideId) {
          const idx = idToIndex.get((q as any).targetSlideId as string);
          if (idx !== undefined) triggerTargets.push(idx);
        }
      }

      if (triggerTargets.length > 0) {
        for (const t of triggerTargets) addEdge(i, t, 'trigger');
      } else if (i < slides.length - 1) {
        addEdge(i, i + 1, 'sequential');
      }
    });

    const cols = Math.min(COLS_PER_ROW, Math.max(1, slides.length));
    const rows = Math.max(1, Math.ceil(slides.length / COLS_PER_ROW));
    const width = PAD * 2 + cols * NODE_W + (cols - 1) * COL_GAP;
    const height = PAD * 2 + rows * NODE_H + (rows - 1) * ROW_GAP;

    return { nodes, edges, width, height };
  }, [state.slides]);

  if (!open) return null;

  const nodeCenter = (n: NodePos) => ({ cx: n.x + n.w / 2, cy: n.y + n.h / 2 });

  // Compute an arrow path between two nodes — connect from right edge of source
  // to left edge of target when same row, otherwise center-to-center via curve.
  const arrowPath = (from: NodePos, to: NodePos) => {
    const fromRow = Math.floor(from.index / COLS_PER_ROW);
    const toRow = Math.floor(to.index / COLS_PER_ROW);
    if (fromRow === toRow && to.index === from.index + 1) {
      const x1 = from.x + from.w;
      const y1 = from.y + from.h / 2;
      const x2 = to.x;
      const y2 = to.y + to.h / 2;
      return `M ${x1} ${y1} L ${x2} ${y2}`;
    }
    const a = nodeCenter(from);
    const b = nodeCenter(to);
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const cx1 = a.cx + dx * 0.3;
    const cy1 = a.cy + dy * 0.1;
    const cx2 = a.cx + dx * 0.7;
    const cy2 = b.cy - dy * 0.1;
    return `M ${a.cx} ${a.cy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${b.cx} ${b.cy}`;
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Story View"
    >
      <div className="h-14 border-b border-border flex items-center px-6 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Story View</h2>
        <span className="ml-3 text-xs text-muted-foreground">
          {state.slides.length} slides · read-only
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close story view">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto bg-muted/30">
        {state.slides.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No slides in this course.
          </div>
        ) : (
          <div className="relative" style={{ width, height, minWidth: '100%' }}>
            <svg
              className="absolute inset-0 pointer-events-none"
              width={width}
              height={height}
            >
              <defs>
                <marker
                  id="storyArrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" />
                </marker>
                <marker
                  id="storyArrowTrigger"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--primary))" />
                </marker>
              </defs>
              {edges.map((e, i) => {
                const from = nodes[e.fromIndex];
                const to = nodes[e.toIndex];
                if (!from || !to) return null;
                const isTrigger = e.kind === 'trigger';
                return (
                  <path
                    key={i}
                    d={arrowPath(from, to)}
                    fill="none"
                    stroke={isTrigger ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                    strokeWidth={isTrigger ? 2 : 1.5}
                    strokeDasharray={isTrigger ? undefined : '6 4'}
                    markerEnd={`url(#${isTrigger ? 'storyArrowTrigger' : 'storyArrow'})`}
                    opacity={0.85}
                  />
                );
              })}
            </svg>

            {nodes.map((n) => {
              const isQuiz = n.slide.slideType === 'quiz';
              const isResults = n.slide.slideType === 'results';
              const title = n.slide.title?.trim() || `Slide ${n.index + 1}`;
              return (
                <div
                  key={n.slide.id}
                  className={cn(
                    'absolute rounded-lg border shadow-sm flex flex-col p-3 select-none',
                    isQuiz
                      ? 'bg-primary/10 border-primary'
                      : isResults
                        ? 'bg-amber-100 border-amber-400 dark:bg-amber-900/30 dark:border-amber-600'
                        : 'bg-card border-border'
                  )}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {String(n.index + 1).padStart(2, '0')}
                    </span>
                    {isQuiz && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
                        <HelpCircle className="h-3 w-3" /> Quiz
                      </span>
                    )}
                    {isResults && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        <Trophy className="h-3 w-3" /> Results
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-foreground line-clamp-3 leading-snug">
                    {title}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
