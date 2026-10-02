/**
 * Autosave (see lib/autosave.ts).
 *
 * AutosaveManager (mounted once inside CourseProvider):
 * - On startup, if this browser holds an autosaved course, asks whether to
 *   restore it. Nothing is autosaved until that question is answered, so the
 *   blank startup course can't overwrite the saved one.
 * - Then saves the course about a second after each change, and right away
 *   when the tab is hidden or closed.
 * - Warns before leaving the page if the latest changes couldn't be saved.
 *
 * AutosaveStatus is the small "Saved in this browser 10:42" label in the
 * ribbon's title bar.
 */
import { useEffect, useRef, useState } from 'react';
import { CloudOff, Check, Loader2 } from 'lucide-react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCourse } from '@/context/CourseContext';
import { hasCourseContent, projectSnapshot, sanitizeProject } from '@/lib/project';
import {
  clearAutosave,
  getAutosaveStatus,
  readAutosave,
  requestPersistentStorage,
  setAutosaveStatus,
  useAutosaveStatus,
  writeAutosave,
  type AutosaveRecord,
} from '@/lib/autosave';
import { cn } from '@/lib/utils';

/** How long after the last change to save. */
export const AUTOSAVE_DELAY_MS = 1000;

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} at ${time}`;
}

export function AutosaveManager() {
  const { state, dispatch } = useCourse();
  const [ready, setReady] = useState(false);
  const [offer, setOffer] = useState<AutosaveRecord | null>(null);

  const latest = useRef(projectSnapshot(state));
  latest.current = projectSnapshot(state);
  const timer = useRef<number | null>(null);
  const writing = useRef(false);
  const again = useRef(false);

  // 1. Startup: look for an autosaved course.
  useEffect(() => {
    let cancelled = false;
    requestPersistentStorage();
    readAutosave()
      .then((rec) => {
        if (cancelled) return;
        if (rec && hasCourseContent(rec.project.slides)) setOffer(rec);
        else setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('Autosave unavailable:', err);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flush = async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (writing.current) {
      again.current = true;
      return;
    }
    writing.current = true;
    setAutosaveStatus({ kind: 'saving' });
    try {
      do {
        again.current = false;
        await writeAutosave(latest.current);
      } while (again.current);
      setAutosaveStatus({ kind: 'saved', at: Date.now() });
    } catch (err) {
      console.error('Autosave failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setAutosaveStatus({ kind: 'error', message: /quota|full/i.test(msg) ? 'Browser storage is full' : msg });
    } finally {
      writing.current = false;
    }
  };

  // 2. Save shortly after each change (only once the restore question is settled).
  const first = useRef(true);
  const { slides, masterSlides, playerSettings, courseSettings, variables } = state;
  useEffect(() => {
    if (!ready) return;
    if (first.current) {
      // The course as it stands when autosave switches on is already saved
      // (restored) or blank (fresh start): wait for the first real change.
      first.current = false;
      if (getAutosaveStatus().kind === 'off') setAutosaveStatus({ kind: 'on' });
      return;
    }
    setAutosaveStatus({ kind: 'pending' });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
     
  }, [ready, slides, masterSlides, playerSettings, courseSettings, variables]);

  // 3. Save right away when the tab is hidden or closed; warn if that may fail.
  useEffect(() => {
    if (!ready) return;
    const onHide = () => {
      if (timer.current !== null) void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = getAutosaveStatus().kind;
      if (timer.current !== null || s === 'saving' || s === 'error') {
        onHide();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
     
  }, [ready]);

  const restore = () => {
    if (!offer) return;
    const payload = sanitizeProject(offer.project);
    if (payload) dispatch({ type: 'LOAD_COURSE', ...payload });
    setAutosaveStatus({ kind: 'saved', at: offer.savedAt });
    setOffer(null);
    setReady(true);
  };

  const startFresh = () => {
    void clearAutosave().catch(() => {});
    setOffer(null);
    setReady(true);
  };

  return (
    <AlertDialog open={offer !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore your last course?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This browser kept a copy of the course you were working on
                {offer?.title ? (
                  <>
                    , <span className="font-medium text-foreground">“{offer.title}”</span>
                  </>
                ) : null}{' '}
                ({offer?.slideCount ?? 0} slide{offer?.slideCount === 1 ? '' : 's'}), last changed{' '}
                {offer ? formatWhen(offer.savedAt) : ''}.
              </p>
              <p>Starting a new course discards this copy, so save it first if you might need it.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={startFresh}>Start a new course</AlertDialogCancel>
          <AlertDialogAction onClick={restore}>Restore it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** "Saved in this browser 10:42" label for the ribbon's title bar. */
export function AutosaveStatus({ className }: { className?: string }) {
  const s = useAutosaveStatus();
  if (s.kind === 'off') return null;
  let icon = <Check className="h-3.5 w-3.5" />;
  let text = 'Autosave on';
  if (s.kind === 'saving' || s.kind === 'pending') {
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    text = 'Saving…';
  } else if (s.kind === 'saved') {
    text = `Saved in this browser ${new Date(s.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } else if (s.kind === 'error') {
    icon = <CloudOff className="h-3.5 w-3.5" />;
    text = 'Autosave failed';
  }
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="autosave-status"
            className={cn(
              'flex items-center gap-1 text-xs select-none',
              s.kind === 'error' ? 'text-red-600 font-medium' : 'text-slate-500',
              className,
            )}
          >
            {icon}
            {text}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {s.kind === 'error'
            ? `${s.message}. Use Home → Save now so you don't lose work.`
            : 'Your latest changes are kept in this browser, so a refresh or crash won’t lose them. Use Home → Save for a file you can back up, share or open on another computer.'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
