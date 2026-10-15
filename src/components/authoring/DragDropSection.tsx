/**
 * Drag-and-drop settings for the selected object (Triggers tab): make it
 * draggable (with its correct targets) and/or a drop target. See lib/dragDrop.ts.
 */
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCourse } from '@/context/CourseContext';
import type { DragSettings, DropTargetSettings, SlideElement } from '@/types/course';

interface Props {
  element: SlideElement;
  onUpdate: (u: Partial<SlideElement>) => void;
  /** Other objects on the slide, with their names. */
  slideElements: { id: string; label: string; dropTarget: boolean }[];
}

export function DragDropSection({ element, onUpdate, slideElements }: Props) {
  const { dispatch } = useCourse();
  const drag = element.drag;
  const drop = element.dropTarget;
  const setDrag = (d: Partial<DragSettings>) => onUpdate({ drag: { ...drag, ...d } });
  const setDrop = (d: Partial<DropTargetSettings>) => onUpdate({ dropTarget: { ...drop, ...d } });
  const targets = slideElements.filter((e) => e.dropTarget && e.id !== element.id);
  const correct = drag?.correctTargets ?? [];
  const toggleCorrect = (id: string) => {
    const next = correct.includes(id) ? correct.filter((x) => x !== id) : [...correct, id];
    setDrag({ correctTargets: next.length ? next : undefined });
  };
  /** Picking a correct target that isn't a drop target yet makes it one. */
  const addCorrect = (id: string) => {
    const target = slideElements.find((e) => e.id === id);
    if (target && !target.dropTarget) dispatch({ type: 'UPDATE_ELEMENT', id, updates: { dropTarget: {} } });
    if (!correct.includes(id)) setDrag({ correctTargets: [...correct, id] });
  };

  return (
    <div className="space-y-2 border-b pb-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Drag and drop</p>
      <div className="flex items-center justify-between">
        <Label className="text-xs" htmlFor="dd-drag">Learners can drag this</Label>
        <Switch id="dd-drag" checked={!!drag} onCheckedChange={(on) => onUpdate({ drag: on ? {} : undefined })} />
      </div>
      {drag && (
        <div className="space-y-2 pl-2 border-l">
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor="dd-return">Return to start if not dropped on a target</Label>
            <Switch id="dd-return" checked={drag.returnIfMissed !== false} onCheckedChange={(on) => setDrag({ returnIfMissed: on ? undefined : false })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Correct target(s)</Label>
            {correct.map((id) => (
              <div key={id} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                <span className="truncate">{slideElements.find((e) => e.id === id)?.label ?? id.slice(0, 8)}</span>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => toggleCorrect(id)} aria-label="Remove">×</button>
              </div>
            ))}
            <Select value="" onValueChange={addCorrect}>
              <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Add a correct target…" /></SelectTrigger>
              <SelectContent>
                {slideElements.filter((e) => e.id !== element.id && !correct.includes(e.id)).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.label}{e.dropTarget ? '' : ' (becomes a drop target)'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Dropped on a correct target it shows its Drop Correct state, otherwise Drop Incorrect (add these on the States tab).
              {targets.length === 0 && ' No drop targets on this slide yet.'}
            </p>
          </div>
          {correct.length > 0 && (
            <div className="flex items-center justify-between">
              <Label className="text-xs" htmlFor="dd-hold">Show correct/incorrect only after submit</Label>
              <Switch id="dd-hold" checked={!!drag.holdResult} onCheckedChange={(on) => setDrag({ holdResult: on ? true : undefined })} />
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label className="text-xs" htmlFor="dd-drop">Drop target</Label>
        <Switch id="dd-drop" checked={!!drop} onCheckedChange={(on) => onUpdate({ dropTarget: on ? {} : undefined })} />
      </div>
      {drop && (
        <div className="space-y-2 pl-2 border-l">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">Dropped objects</Label>
            <Select value={drop.snap ?? 'center'} onValueChange={(v) => setDrop({ snap: v === 'center' ? undefined : (v as 'tile' | 'free') })}>
              <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="center">Snap to centre</SelectItem>
                <SelectItem value="tile">Tile across it</SelectItem>
                <SelectItem value="free">Stay where dropped</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs" htmlFor="dd-one">Accept only one object</Label>
            <Switch id="dd-one" checked={!!drop.onlyOne} onCheckedChange={(on) => setDrop({ onlyOne: on ? true : undefined })} />
          </div>
        </div>
      )}
    </div>
  );
}
