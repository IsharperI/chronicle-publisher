/**
 * Home → Blueprint: paste an AI-written course blueprint and build the course
 * from it (lib/blueprint.ts). Also offers "Copy AI instructions" (the blueprint
 * format guide for any AI chat) and starts background narration of the
 * blueprint's voice-over scripts (lib/tts/narrationJob.ts).
 *
 * "Start from a storyboard" reads a Word storyboard (lib/storyboard.ts) and
 * copies one ready-made prompt (instructions + storyboard text) for the AI
 * chat. After loading, if the course has image placeholders, a toast offers
 * to fill them (Insert → Image Placeholders).
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Copy, AlertTriangle, FileUp, Download, CheckCircle2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { buildStoryboardPrompt, extractStoryboard, type ExtractedStoryboard } from '@/lib/storyboard';
import { findPlaceholders } from '@/lib/imageMatching';
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
import { hasCourseContent } from '@/lib/project';

type PendingLoad = { payload: BlueprintLoadPayload; narration: BlueprintNarration[] };

export function BlueprintDialog({ open, onOpenChange, onOpenImages }: { open: boolean; onOpenChange: (open: boolean) => void; onOpenImages?: () => void }) {
  const { state, dispatch } = useCourse();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingLoad | null>(null);
  const [narrate, setNarrate] = useState(true);
  const [voice, setVoice] = useState(getVoicePref);
  const [storyboard, setStoryboard] = useState<ExtractedStoryboard | null>(null);
  const [sbNotes, setSbNotes] = useState('');
  const [sbBusy, setSbBusy] = useState(false);
  const [sbCopied, setSbCopied] = useState(false);
  const sbInput = useRef<HTMLInputElement>(null);

  const prompt = () => (storyboard ? buildStoryboardPrompt(storyboard, sbNotes) : '');
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt());
      setSbCopied(true);
      return true;
    } catch {
      setSbCopied(false);
      return false;
    }
  };
  const downloadPrompt = () => {
    const url = URL.createObjectURL(new Blob([prompt()], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = (storyboard?.fileName.replace(/\.[^.]+$/, '') || 'storyboard') + ' - AI prompt.txt';
    a.click();
    URL.revokeObjectURL(url);
  };
  const onStoryboard = async (file: File | undefined) => {
    if (!file) return;
    setSbBusy(true);
    setSbCopied(false);
    try {
      const sb = await extractStoryboard(file);
      if (!sb.text) throw new Error('No text was found in this file.');
      setStoryboard(sb);
      try {
        await navigator.clipboard.writeText(buildStoryboardPrompt(sb, sbNotes));
        setSbCopied(true);
      } catch {
        /* Browser blocked copying without a click: the Copy prompt button works. */
      }
    } catch (err) {
      setStoryboard(null);
      toast.error("Couldn't read the storyboard", { description: (err as Error).message });
    } finally {
      setSbBusy(false);
    }
  };

  const apply = ({ payload, narration }: PendingLoad) => {
    dispatch({ type: 'LOAD_COURSE', ...payload });
    toast.success(`Loaded blueprint: ${payload.slides.length} slides`);
    if (narrate && narration.length) {
      setVoicePref(voice);
      void startCourseNarration(narration, dispatch, voice);
    }
    const holes = findPlaceholders(payload.slides).length;
    if (holes && onOpenImages) {
      toast.info(`${holes} image placeholder${holes === 1 ? '' : 's'} to fill`, {
        description: 'Add your images, or use the pictures from the storyboard.',
        action: { label: 'Fill images', onClick: onOpenImages },
        duration: 10000,
      });
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
    if (hasCourseContent(state.slides)) setPending(load);
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

          <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2" data-testid="storyboard-start">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Start from a storyboard</span>
              <Button variant="outline" size="sm" onClick={() => sbInput.current?.click()} disabled={sbBusy}>
                {sbBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileUp className="h-4 w-4 mr-1.5" />}
                Upload storyboard…
              </Button>
              <Input
                value={sbNotes}
                onChange={(e) => { setSbNotes(e.target.value); setSbCopied(false); }}
                placeholder="Notes for the AI (optional), e.g. audience, length, which sections"
                className="h-8 text-xs flex-1 min-w-[220px]"
                aria-label="Notes for the AI"
              />
              <input ref={sbInput} type="file" accept=".docx,.txt,.md" hidden aria-label="Storyboard file"
                onChange={(e) => { void onStoryboard(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            {storyboard ? (
              <div className="flex flex-wrap items-center gap-2 text-xs" role="status">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>
                  <strong>{storyboard.fileName}</strong>: {storyboard.text.length.toLocaleString()} characters
                  {storyboard.images.length > 0 && `, ${storyboard.images.length} picture${storyboard.images.length === 1 ? '' : 's'}`}.{' '}
                  {sbCopied
                    ? 'Prompt copied. Paste it into Gemini (or any AI chat), then paste its reply below.'
                    : 'Copy the prompt, paste it into Gemini (or any AI chat), then paste its reply below.'}
                </span>
                <Button variant={sbCopied ? 'ghost' : 'default'} size="sm" className="h-7" onClick={() => void copyPrompt()}>
                  <Copy className="h-3.5 w-3.5 mr-1" />{sbCopied ? 'Copy again' : 'Copy prompt'}
                </Button>
                <Button variant="ghost" size="sm" className="h-7" onClick={downloadPrompt}>
                  <Download className="h-3.5 w-3.5 mr-1" />Save as .txt
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Upload a Word storyboard (.docx) and Chronicle copies a complete prompt for your AI chat: the instructions plus the storyboard text.
              </p>
            )}
          </div>

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
                  <SelectTrigger className="h-8 w-72" aria-label="Narration voice">
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
