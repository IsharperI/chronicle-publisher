/**
 * Shape menu (Insert → Shape): a grid of the shapes defined in lib/shapes.ts.
 */
import { useState } from 'react';
import { Square, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SHAPE_CATEGORIES, SHAPE_SVG, isExtendedShapeType } from '@/lib/shapes';
import type { ShapeType } from '@/types/course';

function ShapeIcon({ type }: { type: ShapeType }) {
  if (type === 'rectangle') {
    return <div className="w-6 h-6 bg-foreground/70" />;
  }
  if (type === 'circle') {
    return <div className="w-6 h-6 rounded-full bg-foreground/70" />;
  }
  if (type === 'triangle') {
    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-6 h-6">
        <polygon points="50,0 100,100 0,100" fill="currentColor" />
      </svg>
    );
  }
  if (isExtendedShapeType(type)) {
    const inner = SHAPE_SVG[type]
      .replace(/\{fill\}/g, 'currentColor')
      .replace(/\{stroke\}/g, 'currentColor')
      .replace(/\{strokeWidth\}/g, '0');
    return (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-6 h-6 text-foreground/70"
        dangerouslySetInnerHTML={{ __html: inner }}
      />
    );
  }
  return null;
}

export function ShapePicker({ onPick }: { onPick: (t: ShapeType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 flex flex-col items-center justify-center gap-0.5 px-3 text-foreground"
        >
          <Square className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none flex items-center gap-0.5">
            Shape <ChevronDown className="h-3 w-3" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] max-h-[480px] overflow-y-auto p-3">
        {SHAPE_CATEGORIES.map((cat) => (
          <div key={cat.label} className="mb-3 last:mb-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              {cat.label}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {cat.shapes.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  title={s.label}
                  onClick={() => { onPick(s.type as ShapeType); setOpen(false); }}
                  className="aspect-square rounded border border-transparent hover:border-border hover:bg-accent flex items-center justify-center p-1 text-foreground/70"
                >
                  <ShapeIcon type={s.type as ShapeType} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
