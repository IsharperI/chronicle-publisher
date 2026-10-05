/**
 * Properties panel section for an image placeholder: what the picture should
 * show, its storyboard picture number (for numbered images), and a button to
 * choose the image (same as double-clicking the placeholder).
 */
import { useRef } from 'react';
import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCourse } from '@/context/CourseContext';
import { imageFromPlaceholder, readImageFile } from '@/lib/imagePlaceholders';
import type { ShapeElement, SlideElement } from '@/types/course';

export function PlaceholderProperties({ element, onChange }: { element: ShapeElement; onChange: (u: Partial<SlideElement>) => void }) {
  const { state, dispatch } = useCourse();
  const input = useRef<HTMLInputElement>(null);
  const ph = element.imagePlaceholder!;
  const slides = state.viewMode === 'master' ? state.masterSlides : state.slides;
  const slide = slides[state.activeSlideIndex];

  const choose = async (file?: File) => {
    if (!file || !slide) return;
    try {
      const img = await readImageFile(file);
      dispatch({ type: 'REPLACE_SLIDE_ELEMENT', slideId: slide.id, elementId: element.id, element: imageFromPlaceholder(element, img.dataUrl, img) });
    } catch {
      toast.error('That image could not be read');
    }
  };

  return (
    <div className="space-y-2" data-testid="placeholder-properties">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Image placeholder</Label>
      <Button size="sm" className="w-full" onClick={() => input.current?.click()}>
        <ImagePlus className="h-4 w-4 mr-1.5" />Choose image…
      </Button>
      <input ref={input} type="file" accept="image/*" hidden aria-label="Choose image for placeholder"
        onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
      <div className="space-y-1">
        <Label className="text-xs">What the image should show</Label>
        <Textarea value={ph.description} className="text-xs min-h-[64px] bg-white text-slate-800"
          onChange={(e) => onChange({ imagePlaceholder: { ...ph, description: e.target.value } } as Partial<ShapeElement>)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Storyboard picture number (optional)</Label>
        <Input type="number" min={1} className="h-8 text-xs bg-white text-slate-800" value={ph.marker ?? ''} placeholder="e.g. 3 for [Image 3]"
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            const next = { ...ph };
            if (Number.isInteger(n) && n > 0) next.marker = n; else delete next.marker;
            onChange({ imagePlaceholder: next } as Partial<ShapeElement>);
          }} />
      </div>
      <p className="text-xs text-muted-foreground">
        Double-click the placeholder to choose an image. Empty placeholders are hidden from learners unless you publish with
        “Show empty image placeholders”.
      </p>
    </div>
  );
}
