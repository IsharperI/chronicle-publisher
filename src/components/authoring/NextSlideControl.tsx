/**
 * Slide Properties → "Next Button Goes To": where Next leads from this slide,
 * and branches. With two or more branches Next is disabled and Chronicle adds
 * a button per branch to the slide (lib/navigation.ts keeps them in step).
 */
import { Plus, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCourse } from '@/context/CourseContext';
import { resolveNext, slideLabel } from '@/lib/navigation';

const DEFAULT = '__default';
const END = '__end';

export function NextSlideControl() {
  const { state, dispatch } = useCourse();
  const slides = state.slides;
  const index = state.activeSlideIndex;
  const slide = slides[index];
  if (!slide) return null;

  const setNext = (next: string[] | undefined) => dispatch({ type: 'SET_SLIDE_NEXT', slideId: slide.id, next });
  const others = slides.filter((s) => s.id !== slide.id);
  const optionLabel = (id: string) => `${String(slides.findIndex((s) => s.id === id) + 1).padStart(2, '0')}  ${slideLabel(slides, id)}`;
  const branches = slide.next && slide.next.length >= 2 ? slide.next : null;

  const addBranch = (id: string) => {
    const current = resolveNext(slides, index);
    setNext([...current.filter((t) => t !== id), id]);
  };

  return (
    <div className="space-y-1.5 pt-2 border-t" data-testid="next-slide-control">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {branches ? 'Branches' : 'Next Button Goes To'}
      </Label>

      {branches ? (
        <div className="space-y-1.5">
          {branches.map((id, i) => (
            <div key={id} className="flex items-center gap-1">
              <Select
                value={id}
                onValueChange={(v) => setNext(branches.map((b, j) => (j === i ? v : b)).filter((b, j, arr) => arr.indexOf(b) === j))}
              >
                <SelectTrigger className="h-8 text-xs bg-white text-slate-800 flex-1" aria-label={`Branch ${i + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {others.map((s) => (
                    <SelectItem key={s.id} value={s.id} disabled={s.id !== id && branches.includes(s.id)}>
                      {optionLabel(s.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={`Remove branch to ${slideLabel(slides, id)}`}
                onClick={() => setNext(branches.filter((b) => b !== id))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Select
          value={slide.next === undefined ? DEFAULT : slide.next.length === 0 ? END : slide.next[0]}
          onValueChange={(v) => setNext(v === DEFAULT ? undefined : v === END ? [] : [v])}
        >
          <SelectTrigger className="h-8 text-xs bg-white text-slate-800" aria-label="Next button goes to">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>Next slide in the list (default)</SelectItem>
            <SelectItem value={END}>Nowhere (end of course)</SelectItem>
            {others.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {optionLabel(s.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {others.length > 0 && (
        <Select value="" onValueChange={addBranch}>
          <SelectTrigger className="h-8 text-xs bg-white text-slate-800" aria-label="Add a branch">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Plus className="h-3.5 w-3.5" />
              Add a branch…
            </span>
          </SelectTrigger>
          <SelectContent>
            {others
              .filter((s) => !(branches ?? []).includes(s.id))
              .map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {optionLabel(s.id)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}

      <p className="text-xs text-muted-foreground">
        {branches
          ? 'Next is turned off on this slide. Each branch has a button on the slide that you can move, restyle or rename. Deleting a button removes its branch.'
          : 'With two or more branches, Next is turned off and a button for each branch is added to the slide.'}
      </p>
    </div>
  );
}
