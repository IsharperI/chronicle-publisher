import { useRef, useEffect, useState, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { useCourse } from '@/context/CourseContext';
import type { SlideElement } from '@/types/course';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

function ElementRenderer({ element }: { element: SlideElement }) {
  if (element.type === 'text') {
    return (
      <div style={{ width: '100%', height: '100%', fontSize: element.fontSize, fontWeight: element.fontWeight, color: element.textColor, backgroundColor: element.backgroundColor, padding: 8, overflow: 'hidden', wordBreak: 'break-word' }}>
        {element.content}
      </div>
    );
  }
  if (element.type === 'image') {
    return <img src={element.src} alt={element.alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} draggable={false} />;
  }
  if (element.type === 'shape') {
    const { shapeType, fillColor, borderColor, borderWidth } = element;
    if (shapeType === 'circle') {
      return <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: fillColor, border: `${borderWidth}px solid ${borderColor}` }} />;
    }
    if (shapeType === 'triangle') {
      return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <polygon points="50,5 95,95 5,95" fill={fillColor} stroke={borderColor} strokeWidth={borderWidth * 2} />
        </svg>
      );
    }
    return <div style={{ width: '100%', height: '100%', backgroundColor: fillColor, border: `${borderWidth}px solid ${borderColor}`, borderRadius: 4 }} />;
  }
  return null;
}

export function Canvas() {
  const { state, dispatch } = useCourse();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const activeSlide = state.slides[state.activeSlideIndex];

  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const pad = 40;
    const s = Math.min((clientWidth - pad) / CANVAS_W, (clientHeight - pad) / CANVAS_H);
    setScale(Math.min(s, 1));
  }, []);

  useEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) dispatch({ type: 'SET_ACTIVE_ELEMENT', id: null });
  };

  return (
    <div ref={containerRef} className="flex-1 bg-muted/50 flex items-center justify-center overflow-hidden min-w-0">
      <div
        style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: 'center center' }}
        className="relative bg-background shadow-lg border rounded"
        onClick={handleCanvasClick}
      >
        {activeSlide?.elements.map((el) => (
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
            onMouseDown={(e: MouseEvent) => { e.stopPropagation(); dispatch({ type: 'SET_ACTIVE_ELEMENT', id: el.id }); }}
            style={{ outline: state.activeElementId === el.id ? '2px solid hsl(var(--primary))' : 'none', zIndex: state.activeElementId === el.id ? 10 : 1 }}
          >
            <ElementRenderer element={el} />
          </Rnd>
        ))}
      </div>
    </div>
  );
}
