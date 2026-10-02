/**
 * View → Course Tree: an editable flowchart of the course (like Storyline's
 * story view). Layout, arrows and editing rules live in lib/courseTree.ts.
 *
 * - Drag a box to move it (positions are saved with the course).
 * - Drag from the dot under a box onto another box to connect them. Two or
 *   more connections make a branching slide with a button per branch
 *   (lib/navigation.ts).
 * - Click an arrow to select it: Delete removes it; drag its end dot onto
 *   another box to re-point it. Double-click a branch label to rename the button.
 * - Double-click a box to open the slide; right-click for more.
 * - Dashed arrows are Jump to Slide triggers on the slide; edit those there.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { X, Maximize2, Wand2 } from 'lucide-react';
import { useCourse, createSlide } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  NODE_W, NODE_H, ROW_GAP, autoLayout, buildEdges, connectNext, disconnectNext, edgeGeometry, freeSpot,
  nodeShape, retargetNext, treePositions, type NodeShape, type Pos, type TreeEdge,
} from '@/lib/courseTree';
import { isBranchingSlide, isHub } from '@/lib/navigation';
import type { Slide } from '@/types/course';

const EDGE = 'hsl(220 10% 35%)';
const SELECT = 'hsl(217 91% 55%)';
const CONTINUE = 'hsl(142 60% 35%)';
const snap = (v: number) => Math.round(v / 10) * 10;

function boundsOf(pos: Record<string, Pos>) {
  const ps = Object.values(pos);
  if (!ps.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  return {
    minX: Math.min(...ps.map((p) => p.x)) - 80,
    minY: Math.min(...ps.map((p) => p.y)) - 80,
    maxX: Math.max(...ps.map((p) => p.x)) + NODE_W + 80,
    maxY: Math.max(...ps.map((p) => p.y)) + NODE_H + 80,
  };
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; px: number; py: number }
  /** Moving one box, a multi-selection, or a whole slide group. */
  | { kind: 'node'; ids: string[]; sx: number; sy: number; orig: Record<string, Pos>; moved: boolean }
  | { kind: 'connect'; from: string }
  | { kind: 'retarget'; edge: TreeEdge };

interface Menu { x: number; y: number; slideId: string; sub?: 'continue' | 'group'; group?: string }

const GROUP_PREFIX = 'group:';
const GROUP_COLORS = ['hsl(199 80% 45%)', 'hsl(262 60% 55%)', 'hsl(330 65% 50%)', 'hsl(24 85% 50%)', 'hsl(160 60% 35%)', 'hsl(45 85% 42%)'];
function groupColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}
const FRAME_PAD = 24;
const FRAME_TOP = 34;

export function StoryViewOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useCourse();
  const slides = state.slides;

  const edges = useMemo(() => buildEdges(slides), [slides]);
  const saved = useMemo(() => treePositions(slides, edges), [slides, edges]);
  // Live positions while a box is being dragged.
  const [livePos, setLivePos] = useState<Record<string, Pos> | null>(null);
  const pos = livePos ?? saved;

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [pointer, setPointer] = useState<Pos | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [editLabel, setEditLabel] = useState<{ edge: TreeEdge; text: string; at: Pos } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  /** Shift+click selection (for grouping and moving several boxes). */
  const [multi, setMulti] = useState<string[]>([]);
  /** Collapsed slide groups (view only, not saved). */
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [groupEdit, setGroupEdit] = useState<{ name: string; text: string; at: Pos } | null>(null);
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const [dragKind, setDragKind] = useState<Drag['kind'] | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const indexOf = (id: string) => slides.findIndex((s) => s.id === id);
  const slideById = (id: string): Slide | undefined => slides.find((s) => s.id === id);

  // Slide groups: members per name, frames around them, and collapsed boxes.
  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const s of slides) if (s.group) m.set(s.group, [...(m.get(s.group) ?? []), s.id]);
    return m;
  }, [slides]);
  const frameOf = (name: string) => {
    const ps = (groups.get(name) ?? []).map((id) => pos[id]).filter(Boolean);
    if (!ps.length) return null;
    const x = Math.min(...ps.map((p) => p.x)) - FRAME_PAD, y = Math.min(...ps.map((p) => p.y)) - FRAME_TOP;
    return { x, y, w: Math.max(...ps.map((p) => p.x)) + NODE_W + FRAME_PAD - x, h: Math.max(...ps.map((p) => p.y)) + NODE_H + FRAME_PAD - y };
  };
  const collapsedSet = new Set(collapsed.filter((g) => groups.has(g)));
  /** The box an arrow end attaches to: the slide, or its collapsed group. */
  const shownAs = (id: string) => {
    const g = slideById(id)?.group;
    return g && collapsedSet.has(g) ? GROUP_PREFIX + g : id;
  };
  const dpos: Record<string, Pos> = { ...pos };
  for (const g of collapsedSet) {
    const f = frameOf(g);
    if (f) dpos[GROUP_PREFIX + g] = { x: f.x + FRAME_PAD, y: f.y + FRAME_TOP };
  }
  const groupMembersPos = (name: string) => Object.fromEntries((groups.get(name) ?? []).filter((id) => pos[id]).map((id) => [id, pos[id]]));

  const bounds = useMemo(() => boundsOf(pos), [pos]);

  /** Zoom and scroll so the whole tree (or the given positions) fits on screen. */
  const fitView = (positions?: Record<string, Pos>) => {
    const vp = viewportRef.current?.getBoundingClientRect();
    if (!vp) return;
    const bb = positions ? boundsOf(positions) : bounds;
    const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY;
    const z = Math.min(1, Math.max(0.25, Math.min(vp.width / w, vp.height / h)));
    setZoom(z);
    setPan({ x: (vp.width - w * z) / 2 - bb.minX * z, y: Math.max(0, (vp.height - h * z) / 2) - bb.minY * z });
  };

  useEffect(() => {
    if (!open) return;
    setSelectedEdge(null); setSelectedNode(null); setMenu(null); setEditLabel(null); setHint(null);
    requestAnimationFrame(() => fitView());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Screen → tree coordinates.
  const toWorld = (clientX: number, clientY: number): Pos => {
    const r = viewportRef.current!.getBoundingClientRect();
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  };
  const nodeAt = (p: Pos, except?: string): string | null => {
    const inBox = (q: Pos | undefined) => !!q && p.x >= q.x && p.x <= q.x + NODE_W && p.y >= q.y && p.y <= q.y + NODE_H;
    for (const g of collapsedSet) if (inBox(dpos[GROUP_PREFIX + g])) return GROUP_PREFIX + g;
    for (let i = slides.length - 1; i >= 0; i--) {
      const s = slides[i];
      if (s.id === except || shownAs(s.id) !== s.id) continue;
      if (inBox(pos[s.id])) return s.id;
    }
    return null;
  };

  const zoomBy = (factor: number) => {
    const vp = viewportRef.current?.getBoundingClientRect();
    setZoom((z) => {
      const next = Math.min(2, Math.max(0.25, z * factor));
      if (vp) {
        const cx = vp.width / 2, cy = vp.height / 2;
        setPan((p) => ({ x: cx - ((cx - p.x) / z) * next, y: cy - ((cy - p.y) / z) * next }));
      }
      return next;
    });
  };
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const setNext = (slideId: string, next: string[] | undefined | null) => {
    if (next === null) return;
    dispatch({ type: 'SET_SLIDE_NEXT', slideId, next });
  };

  /** Save every box's position (freezes the auto layout the first time). */
  const savePositions = (positions: Record<string, Pos>) => {
    dispatch({ type: 'SET_TREE_POSITIONS', positions });
  };

  // ---- pointer handling ---------------------------------------------------

  const startPan = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    setMenu(null); setSelectedEdge(null); setSelectedNode(null); setEditLabel(null); setHint(null); setMulti([]);
    drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    setDragKind('pan');
  };
  const startNodeDrag = (e: ReactPointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null); setSelectedEdge(null); setEditLabel(null); setHint(null);
    if (e.shiftKey) {
      // Shift+click: add to / remove from the selection.
      const base = multi.length ? multi : selectedNode ? [selectedNode] : [];
      setMulti(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
      setSelectedNode(id);
      return;
    }
    const ids = multi.includes(id) ? multi : [id];
    if (!multi.includes(id)) setMulti([]);
    setSelectedNode(id);
    startMove(e, ids);
  };
  /** Drag the given boxes together (one slide, a selection or a group). */
  const startMove = (e: ReactPointerEvent, ids: string[]) => {
    const w = toWorld(e.clientX, e.clientY);
    const orig = Object.fromEntries(ids.filter((x) => pos[x]).map((x) => [x, pos[x]]));
    drag.current = { kind: 'node', ids, sx: w.x, sy: w.y, orig, moved: false };
    setDragKind('node');
  };
  const startGroupDrag = (e: ReactPointerEvent, name: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null); setSelectedEdge(null); setSelectedNode(null); setMulti([]); setHint(null);
    startMove(e, Object.keys(groupMembersPos(name)));
  };
  const startConnect = (e: ReactPointerEvent, from: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setMenu(null); setSelectedEdge(null); setHint(null);
    drag.current = { kind: 'connect', from };
    setPointer(toWorld(e.clientX, e.clientY));
    setDragKind('connect');
  };
  const startRetarget = (e: ReactPointerEvent, edge: TreeEdge) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    drag.current = { kind: 'retarget', edge };
    setPointer(toWorld(e.clientX, e.clientY));
    setDragKind('retarget');
  };

  useEffect(() => {
    if (!open) return;
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === 'pan') {
        setPan({ x: d.px + e.clientX - d.sx, y: d.py + e.clientY - d.sy });
      } else if (d.kind === 'node') {
        const w = toWorld(e.clientX, e.clientY);
        if (!d.moved && Math.abs(w.x - d.sx) + Math.abs(w.y - d.sy) < 4) return;
        d.moved = true;
        const dx = snap(w.x - d.sx), dy = snap(w.y - d.sy);
        const moved = Object.fromEntries(Object.entries(d.orig).map(([id, o]) => [id, { x: o.x + dx, y: o.y + dy }]));
        setLivePos((lp) => ({ ...(lp ?? saved), ...moved }));
      } else {
        const w = toWorld(e.clientX, e.clientY);
        setPointer(w);
        setHoverNode(nodeAt(w, d.kind === 'connect' ? d.from : d.edge.from));
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      setDragKind(null);
      if (!d) return;
      if (d.kind === 'node') {
        if (d.moved && livePosRef.current) savePositions(livePosRef.current);
        setLivePos(null);
      } else if (d.kind === 'connect' || d.kind === 'retarget') {
        const target = nodeAt(toWorld(e.clientX, e.clientY), d.kind === 'connect' ? d.from : d.edge.from);
        setPointer(null);
        if (!target) return;
        if (target.startsWith(GROUP_PREFIX)) {
          setHint('Expand the slide group first (double-click it) to connect to a slide inside it.');
          return;
        }
        if (d.kind === 'connect') {
          const next = connectNext(slides, d.from, target);
          if (next === null) setHint('Those slides are already connected.');
          else setNext(d.from, next);
        } else if (d.edge.continue) {
          const hub = slideById(d.edge.from);
          if (hub?.next?.includes(target)) setHint('That slide is already one of this hub’s branches.');
          else dispatch({ type: 'UPDATE_SLIDE_BY_ID', slideId: d.edge.from, updates: { continueTo: target } });
          setSelectedEdge(null);
        } else {
          setNext(d.edge.from, retargetNext(slides, d.edge.from, d.edge.to, target));
          setSelectedEdge(null);
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });
  const livePosRef = useRef(livePos);
  livePosRef.current = livePos;

  // Keyboard: Delete removes the selected arrow; Escape clears / closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (editLabel || confirmDelete || groupEdit || newGroup !== null) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdge !== null) {
        e.preventDefault();
        removeEdge(edges[selectedEdge]);
      } else if (e.key === 'Escape') {
        if (menu || selectedEdge !== null || selectedNode || multi.length) { setMenu(null); setSelectedEdge(null); setSelectedNode(null); setMulti([]); }
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const removeEdge = (edge: TreeEdge | undefined) => {
    if (!edge) return;
    if (edge.kind === 'jump') {
      setHint('Dashed arrows are Jump to Slide triggers. Remove them from the trigger on the slide.');
      return;
    }
    if (edge.continue) dispatch({ type: 'UPDATE_SLIDE_BY_ID', slideId: edge.from, updates: { continueTo: undefined } });
    else setNext(edge.from, disconnectNext(slides, edge.from, edge.to));
    setSelectedEdge(null);
  };

  // ---- slide actions (context menu) ------------------------------------------

  const openSlide = (id: string) => {
    const i = indexOf(id);
    if (i < 0) return;
    if (state.viewMode !== 'main') dispatch({ type: 'SET_VIEW_MODE', mode: 'main' });
    dispatch({ type: 'SET_ACTIVE_SLIDE', index: i });
    onClose();
  };

  /** New slide placed in the tree below `anchor`, saving the current layout first. */
  const placeBelow = (anchorId: string, newId: string, column = 0): Record<string, Pos> => {
    const a = pos[anchorId];
    const spot = freeSpot({ x: a.x + column * (NODE_W + 60), y: a.y + NODE_H + ROW_GAP }, Object.values(pos));
    return { ...pos, [newId]: spot };
  };

  const addSlideAfter = (id: string) => {
    const i = indexOf(id);
    const s = slides[i];
    const n = createSlide();
    const positions = placeBelow(id, n.id);
    if (s.next === undefined) {
      dispatch({ type: 'INSERT_SLIDE', index: i + 1, slide: n });
    } else {
      // Keep the flow: this slide → new slide → wherever this slide went before.
      dispatch({ type: 'INSERT_SLIDE', index: i + 1, slide: { ...n, next: [...s.next] } });
      dispatch({ type: 'SET_SLIDE_NEXT', slideId: id, next: [n.id] });
    }
    savePositions(positions);
  };

  const addBranch = (id: string) => {
    const n = { ...createSlide(), title: 'New branch', next: [] as string[] };
    const kids = edges.filter((e) => e.from === id && e.kind === 'next').length;
    const positions = placeBelow(id, n.id, kids);
    dispatch({ type: 'INSERT_SLIDE', index: slides.length, slide: n });
    // The new slide isn't in `slides` yet, so build the connection list directly.
    const current = edges.filter((e) => e.from === id && e.kind === 'next').map((e) => e.to);
    dispatch({ type: 'SET_SLIDE_NEXT', slideId: id, next: [...current, n.id] });
    savePositions(positions);
  };

  const duplicate = (id: string) => {
    const newId = crypto.randomUUID();
    const spot = freeSpot({ x: pos[id].x + NODE_W + 60, y: pos[id].y }, Object.values(pos));
    savePositions(pos);
    dispatch({ type: 'DUPLICATE_SLIDE', index: indexOf(id), newId, treePos: spot });
  };

  const deleteSlide = (id: string) => {
    const i = indexOf(id);
    if (i < 0 || slides.length <= 1) return;
    if (state.viewMode !== 'main') dispatch({ type: 'SET_VIEW_MODE', mode: 'main' });
    dispatch({ type: 'DELETE_SLIDE', index: i });
    setSelectedNode(null);
  };

  /** Slides the context-menu acts on: the selection if the clicked box is in it. */
  const menuTargets = (id: string) => (multi.includes(id) ? multi : [id]);
  const setGroup = (ids: string[], group: string | undefined) => {
    if (group && slides.some((s) => !s.treePos)) savePositions(pos);
    dispatch({ type: 'SET_SLIDE_GROUP', slideIds: ids, group });
    setMulti([]);
  };
  const toggleCollapsed = (name: string) =>
    setCollapsed((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));

  const tidy = () => {
    const laid = autoLayout(slides, edges);
    savePositions(laid);
    fitView(laid);
  };

  // ---- drawing ------------------------------------------------------------------

  // Parallel arrows between the same two boxes get a small offset.
  if (!open) return null;

  // Arrow ends as drawn (members of a collapsed group attach to the group's box).
  const shownEdges = edges.map((e) => ({ from: shownAs(e.from), to: shownAs(e.to) }));
  const bends = (() => {
    const seen = new Map<string, number>();
    return shownEdges.map((e) => {
      const key = [e.from, e.to].sort().join('|');
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      return k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 14;
    });
  })();
  const edgeVisible = (i: number) => shownEdges[i].from !== shownEdges[i].to && !!dpos[shownEdges[i].from] && !!dpos[shownEdges[i].to];

  const renderNode = (s: Slide, i: number) => {
    const p = pos[s.id];
    if (!p) return null;
    const shape: NodeShape = nodeShape(s);
    const title = s.title?.trim() || `Slide ${i + 1}`;
    const cx = p.x + NODE_W / 2, cy = p.y + NODE_H / 2;
    const num = String(i + 1).padStart(2, '0');
    const isSel = selectedNode === s.id || multi.includes(s.id);
    const isDrop = (dragKind === 'connect' || dragKind === 'retarget') && hoverNode === s.id;
    const isActive = i === state.activeSlideIndex && state.viewMode === 'main';
    const ring = isDrop ? 'hsl(142 70% 40%)' : isSel ? SELECT : null;
    const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n) + '…' : t);

    let body: JSX.Element;
    if (shape === 'circle') {
      const r = Math.min(NODE_W, NODE_H) / 2 - 4;
      body = (
        <g>
          <circle cx={cx} cy={cy} r={r} fill="hsl(270 90% 96%)" stroke={ring ?? 'hsl(270 70% 55%)'} strokeWidth={ring ? 3 : 2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={28} fontWeight={700} fill="hsl(270 70% 40%)">?</text>
          <text x={cx} y={p.y + NODE_H + 16} textAnchor="middle" fontSize={12} fill="hsl(var(--foreground))">{num} {clip(title, 22)}</text>
        </g>
      );
    } else if (shape === 'diamond') {
      const pts = `${cx},${p.y} ${p.x + NODE_W},${cy} ${cx},${p.y + NODE_H} ${p.x},${cy}`;
      body = (
        <g>
          <polygon points={pts} fill="hsl(45 95% 92%)" stroke={ring ?? 'hsl(28 90% 55%)'} strokeWidth={ring ? 3 : 2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={500} fill="hsl(var(--foreground))">
            <tspan x={cx} dy="-4">{num}</tspan>
            <tspan x={cx} dy="14">{clip(title, 18)}</tspan>
          </text>
        </g>
      );
    } else {
      const results = shape === 'results';
      body = (
        <g>
          <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={results ? 8 : 6}
            fill={results ? 'hsl(140 60% 92%)' : 'hsl(0 0% 100%)'}
            stroke={ring ?? (results ? 'hsl(140 60% 40%)' : 'hsl(220 80% 55%)')} strokeWidth={ring ? 3 : 2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={results ? 600 : 500}
            fill={results ? 'hsl(140 60% 25%)' : 'hsl(var(--foreground))'}>
            <tspan x={cx} dy="-4">{num}{results ? ' · Results' : ''}</tspan>
            <tspan x={cx} dy="16">{clip(title, 22)}</tspan>
          </text>
        </g>
      );
    }
    const showPort = dragKind === null && (hoverNode === s.id || isSel);
    return (
      <g
        key={s.id}
        data-tree-node={s.id}
        style={{ cursor: dragKind === 'node' ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => startNodeDrag(e, s.id)}
        onPointerEnter={() => dragKind === null && setHoverNode(s.id)}
        onPointerLeave={() => dragKind === null && setHoverNode((h) => (h === s.id ? null : h))}
        onDoubleClick={(e) => { e.stopPropagation(); openSlide(s.id); }}
        onContextMenu={(e) => {
          e.preventDefault(); e.stopPropagation();
          const r = viewportRef.current!.getBoundingClientRect();
          setSelectedNode(s.id); setSelectedEdge(null);
          if (!multi.includes(s.id)) setMulti([]);
          setNewGroup(null);
          setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, slideId: s.id });
        }}
      >
        {/* invisible hit area covering the whole box, including diamond corners */}
        <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} fill="transparent" />
        {body}
        {isActive && (
          // Marks the slide open in the editor; kept inside diamonds and circles.
          <circle cx={shape === 'rect' || shape === 'results' ? p.x + 10 : cx} cy={shape === 'rect' || shape === 'results' ? p.y + 10 : p.y + 16} r={4} fill={SELECT}>
            <title>Slide open in the editor</title>
          </circle>
        )}
        {showPort && (
          <g onPointerDown={(e) => startConnect(e, s.id)} style={{ cursor: 'crosshair' }} data-tree-port={s.id}>
            <circle cx={cx} cy={p.y + NODE_H + (shape === 'circle' ? 0 : 0)} r={14} fill="transparent" />
            <circle cx={cx} cy={p.y + NODE_H} r={7} fill={SELECT} stroke="white" strokeWidth={2} />
            <title>Drag onto another slide to connect</title>
          </g>
        )}
      </g>
    );
  };

  const selEdge = selectedEdge !== null ? edges[selectedEdge] : null;
  const dragFrom = dragKind === 'connect' && drag.current?.kind === 'connect' ? drag.current.from
    : dragKind === 'retarget' && drag.current?.kind === 'retarget' ? drag.current.edge.from : null;

  const viewW = Math.max(bounds.maxX, 2000), viewH = Math.max(bounds.maxY, 1500);

  return (
    <div className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex flex-col" role="dialog" aria-modal="true" aria-label="Course Tree">
      <div className="h-14 border-b border-border flex items-center px-6 shrink-0 gap-3">
        <h2 className="text-lg font-semibold text-foreground">Course Tree</h2>
        <span className="text-xs text-muted-foreground">· {slides.length} slides</span>
        <span className="text-xs text-muted-foreground hidden lg:inline">
          · Drag boxes to arrange · drag the blue dot onto a slide to connect · Shift+click to select several · right-click for more
        </span>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={tidy} title="Re-arrange the whole tree neatly">
          <Wand2 className="h-4 w-4 mr-1.5" />Tidy up
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close course tree">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 relative overflow-hidden bg-muted/30 select-none"
        onWheel={onWheel}
        onPointerDown={startPan}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: dragKind === 'pan' ? 'grabbing' : dragKind === 'connect' || dragKind === 'retarget' ? 'crosshair' : 'default', touchAction: 'none' }}
        data-testid="course-tree"
      >
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: viewW, height: viewH }}>
          <svg width={viewW} height={viewH} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <marker id="treeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE} />
              </marker>
              <marker id="treeArrowSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={SELECT} />
              </marker>
            </defs>

            {/* Slide group frames (behind everything) */}
            {[...groups.keys()].filter((g) => !collapsedSet.has(g)).map((g) => {
              const f = frameOf(g);
              if (!f) return null;
              const c = groupColor(g);
              const tabW = Math.max(80, g.length * 7.5 + 28);
              return (
                <g key={`grp-${g}`} data-tree-group={g}>
                  <rect x={f.x} y={f.y} width={f.w} height={f.h} rx={12} fill={c} fillOpacity={0.06} stroke={c} strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="8 5" pointerEvents="none" />
                  <g style={{ cursor: 'grab' }} onPointerDown={(e) => startGroupDrag(e, g)}
                    onDoubleClick={(e) => { e.stopPropagation(); setGroupEdit({ name: g, text: g, at: { x: f.x + 8, y: f.y + 4 } }); }}
                    onContextMenu={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      const r = viewportRef.current!.getBoundingClientRect();
                      setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, slideId: '', group: g });
                    }}>
                    <rect x={f.x + 8} y={f.y + 6} width={tabW} height={22} rx={6} fill={c} />
                    <text x={f.x + 18} y={f.y + 17} dominantBaseline="central" fontSize={12} fontWeight={600} fill="white">{g}</text>
                    <title>Drag to move the group · double-click to rename · right-click for more</title>
                  </g>
                </g>
              );
            })}

            {/* Arrows */}
            {edges.map((e, i) => {
              if (!edgeVisible(i)) return null;
              const a = dpos[shownEdges[i].from], b = dpos[shownEdges[i].to];
              const g = edgeGeometry(a, b, bends[i]);
              const sel = selectedEdge === i;
              return (
                <g key={`e-${i}`} data-tree-edge={`${e.from}>${e.to}`}>
                  <path d={g.d} fill="none" stroke={sel ? SELECT : e.continue ? CONTINUE : EDGE} strokeWidth={sel ? 2.5 : e.continue ? 2.5 : 1.5}
                    strokeDasharray={e.kind === 'jump' ? '6 4' : undefined} markerEnd={sel ? 'url(#treeArrowSel)' : 'url(#treeArrow)'} />
                  <path d={g.d} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: 'pointer' }}
                    onPointerDown={(ev) => { ev.stopPropagation(); setMenu(null); setSelectedNode(null); setHint(e.kind === 'jump' ? 'Dashed arrows are Jump to Slide triggers. Edit them on the slide.' : null); setSelectedEdge(i); }} />
                </g>
              );
            })}

            {/* Rubber band while connecting / re-pointing */}
            {dragFrom && pointer && pos[dragFrom] && shownAs(dragFrom) === dragFrom && (
              <path d={`M ${pos[dragFrom].x + NODE_W / 2} ${pos[dragFrom].y + NODE_H} L ${pointer.x} ${pointer.y}`}
                stroke={SELECT} strokeWidth={2} strokeDasharray="5 4" fill="none" markerEnd="url(#treeArrowSel)" pointerEvents="none" />
            )}

            {/* Boxes (members of collapsed groups are hidden) */}
            {slides.map((sl, i) => (shownAs(sl.id) === sl.id ? renderNode(sl, i) : null))}

            {/* Collapsed slide groups */}
            {[...collapsedSet].map((g) => {
              const p = dpos[GROUP_PREFIX + g];
              if (!p) return null;
              const c = groupColor(g);
              const n = groups.get(g)?.length ?? 0;
              const drop = (dragKind === 'connect' || dragKind === 'retarget') && hoverNode === GROUP_PREFIX + g;
              return (
                <g key={`cg-${g}`} data-tree-collapsed={g} style={{ cursor: 'grab' }}
                  onPointerDown={(e) => startGroupDrag(e, g)}
                  onDoubleClick={(e) => { e.stopPropagation(); toggleCollapsed(g); }}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const r = viewportRef.current!.getBoundingClientRect();
                    setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, slideId: '', group: g });
                  }}>
                  <rect x={p.x + 6} y={p.y + 6} width={NODE_W} height={NODE_H} rx={8} fill="white" stroke={c} strokeOpacity={0.5} strokeWidth={1.5} />
                  <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8} fill="white" stroke={drop ? 'hsl(0 70% 50%)' : c} strokeWidth={2.5} />
                  <rect x={p.x} y={p.y} width={NODE_W} height={8} rx={4} fill={c} />
                  <text x={p.x + NODE_W / 2} y={p.y + NODE_H / 2} textAnchor="middle" dominantBaseline="central" fontSize={12.5} fontWeight={600} fill="hsl(var(--foreground))">
                    <title>Double-click to expand</title>
                    <tspan x={p.x + NODE_W / 2} dy="-4">{g.length > 22 ? g.slice(0, 22) + '…' : g}</tspan>
                    <tspan x={p.x + NODE_W / 2} dy="16" fontSize={11} fontWeight={400} fill="hsl(var(--muted-foreground))">{n} slide{n === 1 ? '' : 's'}</tspan>
                  </text>
                </g>
              );
            })}

            {/* Labels on top */}
            {edges.map((e, i) => {
              if (!e.label || !edgeVisible(i)) return null;
              const { mid } = edgeGeometry(dpos[shownEdges[i].from], dpos[shownEdges[i].to], bends[i]);
              const w = Math.max(24, e.label.length * 6.2 + 12);
              const editable = !!e.buttonId;
              return (
                <g key={`l-${i}`} style={{ cursor: editable ? 'text' : 'pointer' }}
                  onPointerDown={(ev) => { ev.stopPropagation(); setSelectedEdge(i); setSelectedNode(null); setMenu(null); }}
                  onDoubleClick={(ev) => {
                    ev.stopPropagation();
                    if (editable) setEditLabel({ edge: e, text: e.label ?? '', at: mid });
                  }}>
                  <rect x={mid.x - w / 2} y={mid.y - 9} width={w} height={18} rx={4} fill="white"
                    stroke={selectedEdge === i ? SELECT : 'hsl(220 15% 85%)'} strokeWidth={selectedEdge === i ? 1.5 : 0.75} />
                  <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={10.5} fill="hsl(var(--muted-foreground))">{e.label}</text>
                  {editable && <title>Double-click to rename this button</title>}
                </g>
              );
            })}

            {/* End handle on the selected arrow: drag it onto another slide to re-point */}
            {selEdge && selEdge.kind === 'next' && edgeVisible(selectedEdge!) && dragKind === null && (() => {
              const g = edgeGeometry(dpos[shownEdges[selectedEdge!].from], dpos[shownEdges[selectedEdge!].to], bends[selectedEdge!]);
              return (
                <circle cx={g.end.x} cy={g.end.y} r={7} fill="white" stroke={SELECT} strokeWidth={2.5} style={{ cursor: 'move' }}
                  data-tree-edge-handle onPointerDown={(e) => startRetarget(e, selEdge)}>
                  <title>Drag onto another slide to re-point this arrow</title>
                </circle>
              );
            })()}
          </svg>
        </div>

        {/* Inline rename of a branch button */}
        {editLabel && (
          <input
            autoFocus
            aria-label="Button text"
            className="absolute z-10 h-7 px-2 text-xs border rounded shadow bg-white text-slate-800"
            style={{ left: pan.x + editLabel.at.x * zoom - 80, top: pan.y + editLabel.at.y * zoom - 14, width: 160 }}
            value={editLabel.text}
            onChange={(e) => setEditLabel({ ...editLabel, text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditLabel(null);
            }}
            onBlur={() => {
              const t = editLabel.text.trim();
              if (t && editLabel.edge.buttonId) {
                dispatch({ type: 'UPDATE_SLIDE_ELEMENT', slideId: editLabel.edge.from, elementId: editLabel.edge.buttonId, updates: { text: t } });
              }
              setEditLabel(null);
            }}
          />
        )}

        {/* Inline rename of a slide group */}
        {groupEdit && (
          <input
            autoFocus
            aria-label="Group name"
            className="absolute z-10 h-7 px-2 text-xs border rounded shadow bg-white text-slate-800"
            style={{ left: pan.x + groupEdit.at.x * zoom, top: pan.y + groupEdit.at.y * zoom, width: 200 }}
            value={groupEdit.text}
            maxLength={60}
            onChange={(e) => setGroupEdit({ ...groupEdit, text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setGroupEdit(null);
            }}
            onBlur={() => {
              const t = groupEdit.text.trim();
              if (t && t !== groupEdit.name) {
                dispatch({ type: 'RENAME_SLIDE_GROUP', from: groupEdit.name, to: t });
                setCollapsed((c) => c.map((x) => (x === groupEdit.name ? t : x)));
              }
              setGroupEdit(null);
            }}
          />
        )}

        {/* Context menu for a slide group */}
        {menu && menu.group && (() => {
          const g = menu.group;
          const f = frameOf(g);
          const item = (label: string, fn: () => void, danger = false) => (
            <button key={label} type="button"
              className={`block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted ${danger ? 'text-red-600' : 'text-foreground'}`}
              onClick={() => { setMenu(null); fn(); }}>{label}</button>
          );
          return (
            <div role="menu" className="absolute z-20 min-w-[200px] bg-card border border-border rounded-md shadow-lg p-1"
              style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
              <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">Slide group: {g}</div>
              {item('Rename…', () => f && setGroupEdit({ name: g, text: g, at: { x: f.x + 8, y: f.y + 4 } }))}
              {item(collapsedSet.has(g) ? 'Expand' : 'Collapse', () => toggleCollapsed(g))}
              {item('Ungroup (keep the slides)', () => setGroup(groups.get(g) ?? [], undefined), true)}
            </div>
          );
        })()}

        {/* Context menu for a slide */}
        {menu && !menu.group && (() => {
          const s = slideById(menu.slideId);
          if (!s) return null;
          const targets = menuTargets(s.id);
          const inGroup = targets.some((id) => slideById(id)?.group);
          const branching = isBranchingSlide(s);
          const item = (label: string, fn: () => void, opts: { danger?: boolean; disabled?: boolean; title?: string } = {}) => (
            <button
              key={label} type="button" disabled={opts.disabled} title={opts.title}
              className={`block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent ${opts.danger ? 'text-red-600' : 'text-foreground'}`}
              onClick={() => { setMenu(null); fn(); }}
            >{label}</button>
          );
          return (
            <div role="menu" className="absolute z-20 min-w-[200px] bg-card border border-border rounded-md shadow-lg p-1"
              style={{ left: menu.x, top: menu.y }} onPointerDown={(e) => e.stopPropagation()}>
              {item('Open slide', () => openSlide(s.id))}
              {item('Add slide after', () => addSlideAfter(s.id), { disabled: branching, title: branching ? 'Branching slide: use Add branch' : undefined })}
              {item('Add branch', () => addBranch(s.id))}
              {isHub(s) && (
                <button type="button" className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted text-foreground"
                  onClick={() => setMenu({ ...menu, sub: menu.sub === 'continue' ? undefined : 'continue' })}>
                  Set Continue to… ›
                </button>
              )}
              {menu.sub === 'continue' && (
                <div className="ml-2 pl-2 border-l border-border max-h-56 overflow-auto">
                  {slides.filter((o) => o.id !== s.id && !s.next?.includes(o.id)).map((o) =>
                    item(`${String(indexOf(o.id) + 1).padStart(2, '0')}  ${o.title?.trim() || `Slide ${indexOf(o.id) + 1}`}`,
                      () => dispatch({ type: 'UPDATE_SLIDE_BY_ID', slideId: s.id, updates: { continueTo: o.id } })))}
                </div>
              )}
              {item('Duplicate', () => duplicate(s.id))}
              <div className="my-1 border-t border-border" />
              <button type="button" className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted text-foreground"
                onClick={() => setMenu({ ...menu, sub: menu.sub === 'group' ? undefined : 'group' })}>
                {targets.length > 1 ? `Add ${targets.length} slides to group… ›` : 'Add to slide group… ›'}
              </button>
              {menu.sub === 'group' && (
                <div className="ml-2 pl-2 border-l border-border max-h-56 overflow-auto">
                  {[...groups.keys()].map((g) => item(g, () => setGroup(targets, g)))}
                  {newGroup === null ? (
                    <button type="button" className="block w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted text-foreground"
                      onClick={() => setNewGroup('')}>New group…</button>
                  ) : (
                    <input autoFocus aria-label="New group name" placeholder="Group name" maxLength={60}
                      className="m-1 h-7 w-[180px] px-2 text-xs border rounded bg-white text-slate-800"
                      value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newGroup.trim()) { setGroup(targets, newGroup.trim()); setNewGroup(null); setMenu(null); }
                        if (e.key === 'Escape') { setNewGroup(null); setMenu(null); }
                      }} />
                  )}
                </div>
              )}
              {inGroup && item('Remove from group', () => setGroup(targets, undefined))}
              <div className="my-1 border-t border-border" />
              {item('Delete slide…', () => setConfirmDelete(s.id), { danger: true, disabled: slides.length <= 1 })}
            </div>
          );
        })()}

        {/* Hint / status */}
        {(hint || selEdge) && (
          <div className="absolute bottom-4 left-4 max-w-md bg-card border border-border rounded-md shadow-sm px-3 py-2 text-xs text-muted-foreground">
            {hint ?? (selEdge?.kind === 'next'
              ? 'Press Delete to remove this arrow, or drag its end dot onto another slide.' + (selEdge.buttonId ? ' Double-click the label to rename the button.' : '')
              : '')}
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
          <div className="pt-1 border-t border-border space-y-1.5">
            <div className="flex items-center gap-2">
              <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke={EDGE} strokeWidth="1.5" /></svg>
              <span className="text-muted-foreground">Next / branch</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke={EDGE} strokeWidth="1.5" strokeDasharray="4 3" /></svg>
              <span className="text-muted-foreground">Trigger jump</span>
            </div>
            <div className="flex items-center gap-2">
              <svg width="22" height="8"><line x1="1" y1="4" x2="21" y2="4" stroke={CONTINUE} strokeWidth="2.5" /></svg>
              <span className="text-muted-foreground">Hub: Continue</span>
            </div>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 bg-card border border-border rounded-md shadow-sm flex items-center gap-1 p-1" onPointerDown={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(0.9)} aria-label="Zoom out">
            <span className="text-base font-semibold">−</span>
          </Button>
          <span className="text-xs tabular-nums w-10 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(1.1)} aria-label="Zoom in">
            <span className="text-base font-semibold">+</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fitView()} aria-label="Fit to screen" title="Fit to screen">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent className="z-[300]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this slide?</AlertDialogTitle>
            <AlertDialogDescription>
              “{confirmDelete ? (slideById(confirmDelete)?.title?.trim() || `Slide ${indexOf(confirmDelete) + 1}`) : ''}” and everything on it will be
              deleted. Arrows into it are removed too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => { if (confirmDelete) deleteSlide(confirmDelete); setConfirmDelete(null); }}>
              Delete slide
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
