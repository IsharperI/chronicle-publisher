import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCourse } from '@/context/CourseContext';
import { BLUEPRINT_GUIDE, parseBlueprintText, prepareBlueprintLoad, type BlueprintLoadPayload } from '@/lib/blueprint';

/** True when the current course has content that loading a blueprint would replace. */
function hasContent(slides: { elements: unknown[]; slideType?: string }[]): boolean {
  if (slides.length > 1) return true;
  return slides.some((s) => s.elements.length > 0 || (s.slideType && s.slideType !== 'content'));
}

export function BlueprintDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useCourse();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<BlueprintLoadPayload | null>(null);

  const apply = (payload: BlueprintLoadPayload) => {
    dispatch({ type: 'LOAD_COURSE', ...payload });
    toast.success(`Loaded blueprint: ${payload.slides.length} slides`);
    setPending(null);
    setErrors([]);
    setText('');
    onOpenChange(false);
  };

  const handleLoad = () => {
    const parsed = parseBlueprintText(text);
    if (parsed.ok === false) {
      setErrors([parsed.error]);
      return;
    }
    const res = prepareBlueprintLoad(parsed.data, state.courseSettings);
    if (res.ok === false) {
      setErrors(res.errors);
      return;
    }
    setErrors([]);
    if (hasContent(state.slides)) setPending(res.payload);
    else apply(res.payload);
  };

  const copyGuide = async () => {
    try {
      await navigator.clipboard.writeText(BLUEPRINT_GUIDE);
      toast.success('AI instructions copied', { description: 'Paste them into an AI chat along with your source material.' });
    } catch {
      toast.error('Could not copy to the clipboard');
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setErrors([]);
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Load a course blueprint</DialogTitle>
            <DialogDescription>
              Paste blueprint JSON to build a course from it. To have an AI write one, copy the AI instructions,
              then paste them into the chat along with your source material.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (errors.length) setErrors([]);
            }}
            placeholder={'{\n  "blueprintVersion": 1,\n  "course": { "title": "…" },\n  "slides": [ … ]\n}'}
            spellCheck={false}
            className="font-mono text-xs h-80 resize-none"
            aria-label="Blueprint JSON"
          />

          {errors.length > 0 && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                {errors.length === 1 ? 'The blueprint has a problem' : `The blueprint has ${errors.length} problems`}
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-6 max-h-32 overflow-auto">
                {errors.slice(0, 20).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter className="sm:justify-between gap-2">
            <Button variant="outline" onClick={copyGuide}>
              <Copy className="h-4 w-4 mr-2" />
              Copy AI instructions
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleLoad} disabled={!text.trim()}>
                Load Blueprint
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current course?</AlertDialogTitle>
            <AlertDialogDescription>
              Loading this blueprint replaces all {state.slides.length} slide{state.slides.length === 1 ? '' : 's'} in
              the current course. Save your project first if you want to keep it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && apply(pending)}>Replace course</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
