import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeProgress } from '@/lib/tts';
import { cancelNarration, useNarrationJob } from '@/lib/tts/narrationJob';

/** Floating status panel shown while a whole course is being narrated in the background. */
export function NarrationProgress() {
  const job = useNarrationJob();
  if (!job.running) return null;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
  const current = Math.min(job.done + 1, job.total);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 w-80 rounded-lg border bg-white/95 p-3 shadow-lg backdrop-blur text-sm text-slate-800"
    >
      <div className="flex items-start gap-2">
        <Loader2 className="h-4 w-4 mt-0.5 animate-spin shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            Generating narration: slide {current} of {job.total}
          </div>
          <div className="truncate text-xs text-muted-foreground" title={job.currentTitle}>
            {job.currentTitle}
          </div>
          <div className="text-xs text-muted-foreground">{describeProgress(job.progress)}</div>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={cancelNarration} aria-label="Stop generating narration" title="Stop">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 h-1.5 w-full rounded bg-slate-200 overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">You can keep working while this runs.</div>
    </div>
  );
}
