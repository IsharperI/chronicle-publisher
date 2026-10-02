/**
 * Motion-path editor overlay on the Canvas: draws each element's cubic-bezier
 * path and lets the author drag its start, end and control points. Path math
 * lives in lib/motionPath.ts.
 */
import { useEffect, useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { defaultMotionPath, motionPathToSvgD } from '@/lib/motionPath';
import type { MotionPath, SlideElement } from '@/types/course';

interface Props {
  canvasW: number;
  canvasH: number;
  scale: number;
  elements: SlideElement[];
}

/**
 * Renders motion-path UI on top of the canvas:
 *  1) When `state.motionPathEditor` is set, an interactive bezier editor with
 *     draggable endpoints + control handles, plus a Done/Cancel toolbar.
 *  2) For any selected element with a motionPath (and not currently being
 *     edited), a read-only dotted preview of its path.
 */
export function MotionPathLayer({ canvasW, canvasH, scale, elements }: Props) {
  const { state, dispatch } = useCourse();
  const editorElId = state.motionPathEditor?.elementId ?? null;
  const editorEl = editorElId ? elements.find((e) => e.id === editorElId) : null;

  // Local working copy of the path while editing — committed on Done, discarded on Cancel.
  const [draft, setDraft] = useState<MotionPath | null>(null);
  const [originalPath, setOriginalPath] = useState<MotionPath | null>(null);
  // Two-stage editor: first click on canvas places the end point.
  const [needsEndPoint, setNeedsEndPoint] = useState(false);

  useEffect(() => {
    if (!editorEl) {
      setDraft(null);
      setOriginalPath(null);
      setNeedsEndPoint(false);
      return;
    }
    if (editorEl.motionPath) {
      setDraft({ ...editorEl.motionPath });
      setOriginalPath({ ...editorEl.motionPath });
      setNeedsEndPoint(false);
    } else {
      // Start with green point at element's top-left, end point not yet placed.
      setDraft({
        startX: editorEl.x,
        startY: editorEl.y,
        endX: editorEl.x,
        endY: editorEl.y,
        c1x: editorEl.x,
        c1y: editorEl.y,
        c2x: editorEl.x,
        c2y: editorEl.y,
      });
      setOriginalPath(null);
      setNeedsEndPoint(true);
    }
  }, [editorElId]);

  if (!editorEl && !elements.some((e) => e.motionPath && state.selectedElementIds.includes(e.id))) {
    return null;
  }

  const handleCancel = () => {
    if (editorEl) {
      // Restore the original path (or remove it if there was none).
      dispatch({ type: 'UPDATE_ELEMENT', id: editorEl.id, updates: { motionPath: originalPath ?? undefined } });
    }
    dispatch({ type: 'CLOSE_MOTION_PATH_EDITOR' });
  };

  const handleDone = () => {
    if (editorEl && draft && !needsEndPoint) {
      dispatch({ type: 'UPDATE_ELEMENT', id: editorEl.id, updates: { motionPath: draft } });
    }
    dispatch({ type: 'CLOSE_MOTION_PATH_EDITOR' });
  };

  const handleStageClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!editorEl || !draft || !needsEndPoint) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ex = (e.clientX - rect.left) / scale;
    const ey = (e.clientY - rect.top) / scale;
    const sx = draft.startX;
    const sy = draft.startY;
    setDraft({
      startX: sx,
      startY: sy,
      endX: ex,
      endY: ey,
      c1x: sx + (ex - sx) / 3,
      c1y: sy + (ey - sy) / 3 - 60,
      c2x: sx + ((ex - sx) * 2) / 3,
      c2y: sy + ((ey - sy) * 2) / 3 - 60,
    });
    setNeedsEndPoint(false);
  };

  const startDrag = (
    field: 'start' | 'end' | 'c1' | 'c2',
    e: React.PointerEvent<SVGElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg || !draft) return;
    const rect = svg.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const nx = (ev.clientX - rect.left) / scale;
      const ny = (ev.clientY - rect.top) / scale;
      setDraft((prev) => {
        if (!prev) return prev;
        if (field === 'start') {
          const dx = nx - prev.startX;
          const dy = ny - prev.startY;
          return { ...prev, startX: nx, startY: ny, c1x: prev.c1x + dx, c1y: prev.c1y + dy };
        }
        if (field === 'end') {
          const dx = nx - prev.endX;
          const dy = ny - prev.endY;
          return { ...prev, endX: nx, endY: ny, c2x: prev.c2x + dx, c2y: prev.c2y + dy };
        }
        if (field === 'c1') return { ...prev, c1x: nx, c1y: ny };
        return { ...prev, c2x: nx, c2y: ny };
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Compute strokeWidth that stays roughly constant on screen regardless of canvas scale.
  const sw = 2 / scale;
  const handleR = 8 / scale;
  const ctrlR = 6 / scale;

  return (
    <>
      {/* Read-only dotted previews for selected elements with paths (when not currently editing them) */}
      {!editorEl && (
        <svg
          width={canvasW}
          height={canvasH}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9 }}
        >
          {elements
            .filter((el) => el.motionPath && state.selectedElementIds.includes(el.id))
            .map((el) => (
              <path
                key={el.id}
                d={motionPathToSvgD(el.motionPath!)}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={sw}
                strokeDasharray={`${6 / scale} ${4 / scale}`}
              />
            ))}
        </svg>
      )}

      {/* Active editor */}
      {editorEl && draft && (
        <>
          <svg
            width={canvasW}
            height={canvasH}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 100,
              cursor: needsEndPoint ? 'crosshair' : 'default',
            }}
            onClick={handleStageClick}
          >
            {!needsEndPoint && (
              <>
                <path
                  d={motionPathToSvgD(draft)}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth={sw * 1.5}
                  strokeDasharray={`${6 / scale} ${4 / scale}`}
                  pointerEvents="none"
                />
                {/* Control-handle lines */}
                <line x1={draft.startX} y1={draft.startY} x2={draft.c1x} y2={draft.c1y} stroke="#94a3b8" strokeWidth={sw} pointerEvents="none" />
                <line x1={draft.endX} y1={draft.endY} x2={draft.c2x} y2={draft.c2y} stroke="#94a3b8" strokeWidth={sw} pointerEvents="none" />
                {/* Control-handle dots */}
                <circle cx={draft.c1x} cy={draft.c1y} r={ctrlR} fill="#fff" stroke="#64748b" strokeWidth={sw} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag('c1', e)} />
                <circle cx={draft.c2x} cy={draft.c2y} r={ctrlR} fill="#fff" stroke="#64748b" strokeWidth={sw} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag('c2', e)} />
                {/* End point (red) */}
                <circle cx={draft.endX} cy={draft.endY} r={handleR} fill="#ef4444" stroke="#fff" strokeWidth={sw} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag('end', e)} />
              </>
            )}
            {/* Start point (green) — always visible */}
            <circle cx={draft.startX} cy={draft.startY} r={handleR} fill="#22c55e" stroke="#fff" strokeWidth={sw} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag('start', e)} />
          </svg>

          {/* Floating toolbar (positioned in screen space — kept inside the scaled stage so it scales with the canvas) */}
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 101,
              display: 'flex',
              gap: 8,
              background: 'rgba(15,23,42,0.92)',
              color: '#fff',
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: Math.round(14 / scale),
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}
          >
            <span style={{ alignSelf: 'center' }}>
              {needsEndPoint ? 'Click on the canvas to place the end point' : 'Drag points and handles to shape the path'}
            </span>
            <button
              type="button"
              onClick={handleDone}
              disabled={needsEndPoint}
              style={{
                padding: `${4 / scale}px ${10 / scale}px`,
                background: needsEndPoint ? '#475569' : '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: needsEndPoint ? 'not-allowed' : 'pointer',
                fontSize: 'inherit',
              }}
            >
              Done
            </button>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: `${4 / scale}px ${10 / scale}px`,
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** Helper used by the ribbon button on first activation: ensure the element has a draftable path. */
export { defaultMotionPath };
