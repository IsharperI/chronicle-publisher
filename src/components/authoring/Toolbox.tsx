import { Button } from '@/components/ui/button';
import { Type, ImageIcon, Square, Plus, Trash2 } from 'lucide-react';
import { useCourse } from '@/context/CourseContext';
import type { TextElement, ImageElement, ShapeElement } from '@/types/course';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function Toolbox() {
  const { state, dispatch } = useCourse();
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const addText = () => {
    const el: TextElement = {
      id: crypto.randomUUID(), type: 'text',
      x: 660, y: 440, width: 600, height: 200,
      content: 'Double-click to edit', fontSize: 32, fontWeight: '400',
      textColor: '#000000', backgroundColor: 'transparent',
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  const addImage = () => {
    if (!imageUrl.trim()) return;
    const el: ImageElement = {
      id: crypto.randomUUID(), type: 'image',
      x: 560, y: 240, width: 800, height: 600,
      src: imageUrl.trim(), alt: 'Image',
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
    setImageUrl('');
    setImageDialogOpen(false);
  };

  const addShape = () => {
    const el: ShapeElement = {
      id: crypto.randomUUID(), type: 'shape',
      x: 760, y: 390, width: 400, height: 300,
      shapeType: 'rectangle', fillColor: '#3b82f6', borderColor: '#1e40af', borderWidth: 2,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  return (
    <div className="w-[250px] border-r bg-card flex flex-col shrink-0">
      <div className="p-3 border-b">
        <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Toolbox</p>
        <div className="flex flex-col gap-1.5">
          <Button variant="outline" size="sm" className="justify-start" onClick={addText}><Type className="h-4 w-4 mr-2" />Add Text</Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={() => setImageDialogOpen(true)}><ImageIcon className="h-4 w-4 mr-2" />Add Image</Button>
          <Button variant="outline" size="sm" className="justify-start" onClick={addShape}><Square className="h-4 w-4 mr-2" />Add Shape</Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-3 pb-1 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Slides</p>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dispatch({ type: 'ADD_SLIDE' })}><Plus className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => dispatch({ type: 'DELETE_SLIDE', index: state.activeSlideIndex })} disabled={state.slides.length <= 1}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
        <ScrollArea className="flex-1 px-3 pb-3">
          <div className="flex flex-col gap-2">
            {state.slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_SLIDE', index: i })}
                className={cn(
                  'relative w-full aspect-video rounded border-2 bg-background text-xs font-medium flex items-center justify-center transition-colors',
                  i === state.activeSlideIndex ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
                )}
              >
                <span className="text-muted-foreground">Slide {i + 1}</span>
                {slide.elements.length > 0 && (
                  <span className="absolute bottom-1 right-1 text-[10px] text-muted-foreground">{slide.elements.length} el</span>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Image</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Image URL</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.jpg" onKeyDown={(e) => e.key === 'Enter' && addImage()} />
          </div>
          <DialogFooter><Button onClick={addImage} disabled={!imageUrl.trim()}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
