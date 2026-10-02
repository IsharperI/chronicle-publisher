/**
 * Insert → Image Placeholders: fill the grey "IMAGE PLACEHOLDER" boxes that
 * blueprints create.
 *
 * Images come from the storyboard read in the Blueprint dialog (its pictures,
 * matched by their [Image N] markers) and from files the author adds (matched
 * by stock number or file-name words). The author can change any match by
 * hand. "Place images" swaps each matched placeholder for the image, sized to
 * fit its box without stretching (lib/imageMatching.ts). Large photos are
 * scaled down to keep the course file small.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCourse } from '@/context/CourseContext';
import { storyboardImages } from '@/lib/storyboard';
import { findPlaceholders, fitImage, matchImages, type CandidateImage, type Match } from '@/lib/imageMatching';
import type { ImageElement, SlideElement } from '@/types/course';

const MAX_SIDE = 1920;
const NONE = '__none';
const REASON: Record<Match['reason'], string> = {
  storyboard: 'From storyboard',
  number: 'Stock number',
  name: 'File name',
  manual: 'Chosen',
};

/** Load an image file, scaling it down if it's larger than needed. */
async function readImage(file: File): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return url;
  const img = await loadImage(url);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale >= 1) return url;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

export function ImagePlaceholdersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { state, dispatch } = useCourse();
  const placeholders = useMemo(() => findPlaceholders(state.slides), [state.slides]);
  const [added, setAdded] = useState<CandidateImage[]>([]);
  const [manual, setManual] = useState<Record<string, Match>>({});
  const [cleared, setCleared] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fromStoryboard: CandidateImage[] = useMemo(
    () => (open ? storyboardImages().map((i) => ({ id: `sb-${i.n}`, name: `Storyboard image ${i.n}`, dataUrl: i.dataUrl, marker: i.n })) : []),
    [open],
  );
  const images = useMemo(() => [...fromStoryboard, ...added], [fromStoryboard, added]);
  const byId = useMemo(() => new Map(images.map((i) => [i.id, i])), [images]);

  useEffect(() => {
    if (!open) { setManual({}); setCleared({}); }
  }, [open]);

  const matches = useMemo(() => {
    const auto = matchImages(placeholders.filter((p) => !cleared[p.elementId]), images, manual);
    return auto;
  }, [placeholders, images, manual, cleared]);
  const matchedCount = placeholders.filter((p) => matches[p.elementId]).length;

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(true);
    try {
      const read = await Promise.all(list.map(async (f) => ({ id: crypto.randomUUID(), name: f.name, dataUrl: await readImage(f) })));
      setAdded((a) => [...a, ...read]);
    } catch {
      toast.error('Some images could not be read');
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    let placed = 0;
    try {
      for (const p of placeholders) {
        const m = matches[p.elementId];
        const img = m && byId.get(m.imageId);
        if (!img) continue;
        const natural = await loadImage(img.dataUrl).then((i) => ({ width: i.naturalWidth, height: i.naturalHeight })).catch(() => ({ width: 0, height: 0 }));
        const slide = state.slides.find((s) => s.id === p.slideId);
        const old = slide && [...(slide.layers?.flatMap((l) => l.elements) ?? []), ...slide.elements].find((e) => e.id === p.elementId);
        if (!old) continue;
        const element: ImageElement = {
          ...(old as SlideElement),
          ...fitImage(p, natural),
          type: 'image',
          src: img.dataUrl,
          alt: p.description.replace(/\[\s*image\s+\d+\s*\]/gi, '').trim().slice(0, 300),
        } as ImageElement;
        // Drop the placeholder's shape-only fields.
        for (const k of ['shapeType', 'fillColor', 'borderColor', 'borderWidth', 'text', 'textColor', 'fontSize', 'hoverFillColor', 'hoverBorderColor', 'borderRadius', 'boxShadow']) {
          delete (element as unknown as Record<string, unknown>)[k];
        }
        dispatch({ type: 'REPLACE_SLIDE_ELEMENT', slideId: p.slideId, elementId: p.elementId, element });
        placed++;
      }
      toast.success(`Placed ${placed} image${placed === 1 ? '' : 's'}`);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Image placeholders</DialogTitle>
          <DialogDescription>
            Add your images and Chronicle matches them to the placeholders: pictures from the storyboard by their
            [Image&nbsp;N] marker, other files by stock number or by words in the file name. Change any match below.
          </DialogDescription>
        </DialogHeader>

        <div
          className={`rounded-md border-2 border-dashed px-4 py-3 text-sm flex flex-wrap items-center gap-3 ${dragOver ? 'border-primary bg-primary/5' : 'border-border'}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
        >
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <ImagePlus className="h-4 w-4 mr-1.5" />Add images…
          </Button>
          <span className="text-muted-foreground">or drop image files here.</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {fromStoryboard.length > 0 && `${fromStoryboard.length} from the storyboard · `}
            {added.length} added
          </span>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label="Add images"
            onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {placeholders.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">This course has no image placeholders.</p>
        ) : (
          <div className="max-h-[50vh] overflow-auto border rounded-md divide-y" data-testid="placeholder-list">
            {placeholders.map((p) => {
              const m = matches[p.elementId];
              const img = m && byId.get(m.imageId);
              return (
                <div key={p.elementId} className="flex items-center gap-3 p-2" data-testid="placeholder-row">
                  <div className="h-14 w-20 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden border">
                    {img ? <img src={img.dataUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-[10px] text-muted-foreground">No image</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted-foreground">
                      {String(p.slideIndex + 1).padStart(2, '0')} {p.slideTitle}{p.layerName ? ` · ${p.layerName}` : ''}
                    </div>
                    <div className="text-sm truncate" title={p.description}>{p.description || 'No description'}</div>
                  </div>
                  {m && <span className="text-[11px] rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 shrink-0">{REASON[m.reason]}</span>}
                  <Select
                    value={m?.imageId ?? NONE}
                    onValueChange={(v) => {
                      if (v === NONE) {
                        setManual((x) => { const n = { ...x }; delete n[p.elementId]; return n; });
                        setCleared((c) => ({ ...c, [p.elementId]: true }));
                      } else {
                        setManual((x) => ({ ...x, [p.elementId]: { imageId: v, reason: 'manual' } }));
                        setCleared((c) => { const n = { ...c }; delete n[p.elementId]; return n; });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-56 text-xs" aria-label={`Image for ${p.description || p.slideTitle}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Leave as placeholder</SelectItem>
                      {images.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {m && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Clear match"
                      onClick={() => {
                        setManual((x) => { const n = { ...x }; delete n[p.elementId]; return n; });
                        setCleared((c) => ({ ...c, [p.elementId]: true }));
                      }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter className="sm:justify-between gap-2">
          <span className="text-xs text-muted-foreground self-center">
            {placeholders.length > 0 && `${matchedCount} of ${placeholders.length} placeholders matched. Unmatched ones stay as placeholders.`}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void apply()} disabled={busy || matchedCount === 0}>
              Place {matchedCount || ''} image{matchedCount === 1 ? '' : 's'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
