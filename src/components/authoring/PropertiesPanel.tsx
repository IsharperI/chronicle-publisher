import { useRef, useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2, Upload, Plus, X } from 'lucide-react';
import type { SlideElement, TextElement, ImageElement, ShapeElement, ShapeType, Trigger } from '@/types/course';

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 text-xs" />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={value === 'transparent' ? '#ffffff' : value} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs flex-1" />
      </div>
    </div>
  );
}

export function PropertiesPanel() {
  const { state, dispatch } = useCourse();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSlide = state.slides[state.activeSlideIndex];
  const activeElement = activeSlide?.elements.find((el) => el.id === state.activeElementId);

  const update = (updates: Partial<SlideElement>) => {
    if (!activeElement) return;
    dispatch({ type: 'UPDATE_ELEMENT', id: activeElement.id, updates });
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeElement) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      update({ src: ev.target?.result as string } as Partial<ImageElement>);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="w-[280px] border-l bg-card flex flex-col shrink-0">
      <div className="p-3 border-b">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Properties</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {!activeElement ? (
          /* Slide Properties when nothing selected */
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">Slide Properties</p>
            <NumField
              label="Duration (ms)"
              value={activeSlide?.duration ?? 5000}
              onChange={(v) => dispatch({ type: 'UPDATE_SLIDE', index: state.activeSlideIndex, updates: { duration: Math.max(1000, v) } })}
            />
            <p className="text-xs text-muted-foreground">Sets the total timeline length for this slide.</p>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium capitalize text-foreground">{activeElement.type} Element</p>

            <div className="grid grid-cols-2 gap-2">
              <NumField label="X" value={Math.round(activeElement.x)} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={Math.round(activeElement.y)} onChange={(v) => update({ y: v })} />
              <NumField label="Width" value={Math.round(activeElement.width)} onChange={(v) => update({ width: v })} />
              <NumField label="Height" value={Math.round(activeElement.height)} onChange={(v) => update({ height: v })} />
            </div>

            {activeElement.type === 'text' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Content</Label>
                  <Textarea value={(activeElement as TextElement).content} onChange={(e) => update({ content: e.target.value } as Partial<TextElement>)} className="text-xs min-h-[60px]" />
                </div>
                <NumField label="Font Size" value={(activeElement as TextElement).fontSize} onChange={(v) => update({ fontSize: v } as Partial<TextElement>)} />
                <div className="space-y-1">
                  <Label className="text-xs">Font Weight</Label>
                  <Select value={(activeElement as TextElement).fontWeight} onValueChange={(v) => update({ fontWeight: v } as Partial<TextElement>)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">Light</SelectItem>
                      <SelectItem value="400">Normal</SelectItem>
                      <SelectItem value="600">Semi Bold</SelectItem>
                      <SelectItem value="700">Bold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ColorField label="Text Color" value={(activeElement as TextElement).textColor} onChange={(v) => update({ textColor: v } as Partial<TextElement>)} />
                <ColorField label="Background" value={(activeElement as TextElement).backgroundColor} onChange={(v) => update({ backgroundColor: v } as Partial<TextElement>)} />
              </>
            )}

            {activeElement.type === 'image' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Image</Label>
                  {(activeElement as ImageElement).src && (
                    <img src={(activeElement as ImageElement).src} alt="Preview" className="w-full h-24 object-contain rounded border bg-muted" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />Replace Image
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceImage} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Alt Text</Label>
                  <Input value={(activeElement as ImageElement).alt} onChange={(e) => update({ alt: e.target.value } as Partial<ImageElement>)} className="h-8 text-xs" />
                </div>
              </>
            )}

            {activeElement.type === 'shape' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Shape Type</Label>
                  <Select value={(activeElement as ShapeElement).shapeType} onValueChange={(v) => update({ shapeType: v as ShapeType } as Partial<ShapeElement>)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rectangle">Rectangle</SelectItem>
                      <SelectItem value="circle">Circle</SelectItem>
                      <SelectItem value="triangle">Triangle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ColorField label="Fill Color" value={(activeElement as ShapeElement).fillColor} onChange={(v) => update({ fillColor: v } as Partial<ShapeElement>)} />
                <ColorField label="Border Color" value={(activeElement as ShapeElement).borderColor} onChange={(v) => update({ borderColor: v } as Partial<ShapeElement>)} />
                <NumField label="Border Width" value={(activeElement as ShapeElement).borderWidth} onChange={(v) => update({ borderWidth: v } as Partial<ShapeElement>)} />
              </>
            )}

            {/* Timeline Properties */}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</p>
              <div className="grid grid-cols-2 gap-2">
                <NumField label="Start (ms)" value={activeElement.startTime} onChange={(v) => update({ startTime: Math.max(0, v) })} />
                <NumField label="Duration (ms)" value={activeElement.duration} onChange={(v) => update({ duration: Math.max(100, v) })} />
              </div>
            </div>

            {/* Triggers */}
            <TriggersSection element={activeElement} onUpdate={update} />

            <Button variant="destructive" size="sm" className="w-full" onClick={() => dispatch({ type: 'DELETE_ELEMENT', id: activeElement.id })}>
              <Trash2 className="h-4 w-4 mr-1" />Delete Element
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function TriggersSection({ element, onUpdate }: { element: SlideElement; onUpdate: (u: Partial<SlideElement>) => void }) {
  const triggers = element.triggers ?? [];
  const [newEvent, setNewEvent] = useState('onClick');
  const [newAction, setNewAction] = useState('jumpToSlide');
  const [newTarget, setNewTarget] = useState('');

  const addTrigger = () => {
    if (!newTarget) return;
    const t: Trigger = { event: newEvent, action: newAction, targetId: newTarget };
    onUpdate({ triggers: [...triggers, t] } as any);
    setNewTarget('');
  };

  const removeTrigger = (idx: number) => {
    onUpdate({ triggers: triggers.filter((_, i) => i !== idx) } as any);
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Triggers</p>
      {triggers.map((t, i) => (
        <div key={i} className="flex items-center gap-1 text-[10px] bg-muted rounded p-1.5">
          <span className="truncate flex-1">{t.event} → {t.action} ({t.targetId.slice(0, 8)})</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeTrigger(i)}><X className="h-3 w-3" /></Button>
        </div>
      ))}
      <div className="space-y-1.5">
        <Select value={newEvent} onValueChange={setNewEvent}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="onClick">onClick</SelectItem>
            <SelectItem value="onHover">onHover</SelectItem>
          </SelectContent>
        </Select>
        <Select value={newAction} onValueChange={setNewAction}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="jumpToSlide">Jump to Slide</SelectItem>
            <SelectItem value="hideElement">Hide Element</SelectItem>
            <SelectItem value="showElement">Show Element</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Target ID" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="h-7 text-xs" />
        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addTrigger}><Plus className="h-3 w-3 mr-1" />Add Trigger</Button>
      </div>
    </div>
  );
}
