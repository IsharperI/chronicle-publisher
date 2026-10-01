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
import { BLUEPRINT_GUIDE, parseBlueprintText, prepareBlueprintLoad, type BlueprintLoadPayload, type BlueprintNarration } from '@/lib/blueprint';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VOICES, getVoicePref, setVoicePref } from '@/lib/tts';
import { startCourseNarration } from '@/lib/tts/narrationJob';

type PendingLoad = { payload: BlueprintLoadPayload; narration: BlueprintNarration[] };

/** True when the current course has content that loading a blueprint would replace. */
function hasContent(slides: { elements: unknown[]; slideType?: string }[]): boolean {
  if (slides.length > 1) return true;
  return slides.some((s) => s.elements.length > 0 || (s.slideType && s.slideType !== 'content'));
}

export function BlueprintDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useCourse();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingLoad | null>(null);
  const [narrate, setNarrate] = useState(true);
  const [voice, setVoice] = useState(getVoicePref);

  const apply = ({ payload, narration }: PendingLoad) => {
    dispatch({ type: 'LOAD_COURSE', ...payload });
    toast.success(`Loaded blueprint: ${payload.slides.length} slides`);
    if (narrate && narration.length) {
      setVoicePref(voice);
      void startCourseNarration(narration, dispatch, voice);
    }
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
    if (parsed.repaired) {
      toast.info("Fixed formatting in the AI's output", {
        description: 'For example quotation marks inside text. The content itself is unchanged.',
      });
    }
    const res = prepareBlueprintLoad(parsed.data, state.courseSettings);
    if (res.ok === false) {
      setErrors(res.errors);
      return;
    }
    setErrors([]);
    const load = { payload: res.payload, narration: res.narration };
    if (hasContent(state.slides)) setPending(load);
    else apply(load);
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

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={narrate} onCheckedChange={(v) => setNarrate(v === true)} aria-label="Generate narration audio" />
              Generate narration audio from the voice-over scripts
            </label>
            {narrate && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-muted-foreground">Voice</span>
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger className="h-8 w-56" aria-label="Narration voice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

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
