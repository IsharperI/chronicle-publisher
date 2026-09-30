import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCourse } from '@/context/CourseContext';
import {
  VOICES,
  describeProgress,
  extractNarration,
  generateNarrationAudio,
  getVoicePref,
  setVoicePref,
  TTS_AUDIO_NAME,
  type TtsProgress,
} from '@/lib/tts';

/**
 * Insert → Text to Speech. Type a voice-over script for the current slide and
 * generate narration with the free Kokoro voice. When it finishes, the audio
 * (with captions) is added to the slide's timeline and the slide is lengthened
 * to fit.
 */
export function TextToSpeechDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, dispatch } = useCourse();
  const slide = state.viewMode === 'main' ? state.slides[state.activeSlideIndex] : undefined;
  const existingTts = slide?.audio?.find((a) => a.name === TTS_AUDIO_NAME);

  const [script, setScript] = useState('');
  const [voice, setVoice] = useState(getVoicePref);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<TtsProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);

  // Prefill each time the dialog opens: the slide's current TTS script, else
  // the narration from the slide notes (blueprint courses), else empty.
  useEffect(() => {
    if (!open) return;
    const fromTts = existingTts?.captions.map((c) => c.text).join(' ') ?? '';
    setScript(fromTts || extractNarration(slide?.notes));
    setError(null);
    setProgress(null);
    // Only when opening, not on every edit to the slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    runRef.current++; // any in-flight generation is discarded
    setBusy(false);
    onOpenChange(false);
  };

  const generate = async () => {
    if (!slide) return;
    const run = ++runRef.current;
    const slideId = slide.id;
    setBusy(true);
    setError(null);
    setProgress(null);
    setVoicePref(voice);
    try {
      const audio = await generateNarrationAudio(script, {
        voice,
        onProgress: (p) => run === runRef.current && setProgress(p),
      });
      if (run !== runRef.current) return; // cancelled
      dispatch({ type: 'SET_SLIDE_NARRATION', slideId, audio });
      toast.success('Narration added', { description: `${audio.duration.toFixed(1)} seconds, with captions.` });
      setBusy(false);
      onOpenChange(false);
    } catch (e) {
      if (run !== runRef.current) return;
      setBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const downloadPct = progress?.stage === 'loading' ? progress.progress : null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Text to speech</DialogTitle>
          <DialogDescription>
            Type the voice-over for {slide ? <strong>{slide.title || `slide ${state.activeSlideIndex + 1}`}</strong> : 'this slide'}.
            The narration is added to the slide's timeline with captions, and the slide is lengthened to fit.
          </DialogDescription>
        </DialogHeader>

        {!slide ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Switch to the main timeline and select a slide to add narration.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="tts-script">Voice-over script</Label>
              <Textarea
                id="tts-script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                disabled={busy}
                placeholder="One way to stay safe while working with electricity is to always wear the appropriate personal protective equipment, or PPE."
                className="h-44 resize-none text-sm"
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="space-y-1.5 flex-1">
                <Label>Voice</Label>
                <Select value={voice} onValueChange={setVoice} disabled={busy}>
                  <SelectTrigger aria-label="Voice">
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
            </div>

            {existingTts && !busy && (
              <p className="text-xs text-muted-foreground">
                This replaces the slide's current text-to-speech narration ({existingTts.duration.toFixed(1)}s).
              </p>
            )}

            {busy && (
              <div role="status" className="rounded-md border bg-muted/40 p-3 text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{describeProgress(progress)}</span>
                </div>
                {downloadPct != null && (
                  <div className="h-1.5 w-full rounded bg-slate-200 overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${downloadPct}%` }} />
                  </div>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Couldn't generate speech: {error}</span>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={generate} disabled={!slide || busy || !script.trim()}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              'Generate'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
