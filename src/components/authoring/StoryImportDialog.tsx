/**
 * Home → Import Storyline: pick a .story file, convert it in the browser
 * (lib/storyImport), load it as the current course, and show the import
 * report (what was skipped or approximated).
 */
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { FileUp, AlertTriangle, CircleSlash } from 'lucide-react';
import { useCourse } from '@/context/CourseContext';
import { sanitizeProject } from '@/lib/project';
import { importStory, type StoryImportReport } from '@/lib/storyImport';
import { cancelNarration } from '@/lib/tts/narrationJob';

type Phase = { step: 'pick' } | { step: 'working'; done: number; total: number } | { step: 'done'; report: StoryImportReport } | { step: 'error'; message: string };

export function StoryImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { dispatch } = useCourse();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ step: 'pick' });

  const close = (o: boolean) => {
    if (phase.step === 'working') return;
    onOpenChange(o);
    if (!o) setPhase({ step: 'pick' });
  };

  const run = async (file: File | undefined) => {
    if (!file) return;
    setPhase({ step: 'working', done: 0, total: 1 });
    try {
      const { payload, report } = await importStory(file, (done, total) => setPhase({ step: 'working', done, total }));
      const project = sanitizeProject(payload);
      if (!project) throw new Error('The converted course could not be loaded.');
      cancelNarration();
      dispatch({ type: 'LOAD_COURSE', ...project });
      // Development builds only: the fidelity checker (tools/storyline-fidelity) saves this report.
      if (import.meta.env.DEV) (window as unknown as { __chronicleLastImport?: StoryImportReport }).__chronicleLastImport = report;
      setPhase({ step: 'done', report });
    } catch (e) {
      setPhase({ step: 'error', message: (e as Error).message || 'This file could not be read.' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import from Storyline</DialogTitle>
          <DialogDescription>
            Converts an Articulate Storyline <code>.story</code> file into a Chronicle course. It replaces the course that's open now, so save first if you need it.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={input} type="file" accept=".story,.zip" hidden aria-label="Storyline file"
          onChange={(e) => { void run(e.target.files?.[0]); e.target.value = ''; }}
        />

        {phase.step === 'pick' && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 py-10 text-slate-600 hover:border-primary hover:text-primary"
          >
            <FileUp className="h-8 w-8" />
            <span className="font-medium">Choose a .story file</span>
            <span className="text-xs text-slate-500">Everything happens in your browser. Nothing is uploaded.</span>
          </button>
        )}

        {phase.step === 'working' && (
          <div className="space-y-3 py-6">
            <p className="text-sm text-slate-600">Converting slide {Math.min(phase.done + 1, phase.total)} of {phase.total}…</p>
            <Progress value={phase.total ? (phase.done / phase.total) * 100 : 0} />
          </div>
        )}

        {phase.step === 'error' && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Import failed</p>
            <p>{phase.message}</p>
          </div>
        )}

        {phase.step === 'done' && <ImportReportView report={phase.report} />}

        <DialogFooter>
          {phase.step === 'error' && <Button variant="outline" onClick={() => setPhase({ step: 'pick' })}>Try another file</Button>}
          {phase.step !== 'working' && <Button onClick={() => close(false)}>{phase.step === 'done' ? 'Done' : 'Cancel'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportReportView({ report }: { report: StoryImportReport }) {
  const stats: [number, string][] = [
    [report.slides, 'slides'], [report.layers, 'layers'], [report.objects, 'objects'],
    [report.triggersConverted, 'triggers'], [report.variables, 'variables'], [report.masters, 'master slides'],
  ];
  const skipped = report.issues.filter((i) => i.kind === 'skipped');
  const approx = report.issues.filter((i) => i.kind === 'approximated');
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm">
        Imported <span className="font-medium">{report.title || 'the course'}</span>:{' '}
        {stats.map(([n, l]) => `${n} ${l}`).join(', ')}.
      </p>
      {report.issues.length === 0 ? (
        <p className="text-sm text-green-700">Everything was brought across.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-md border">
          <div className="space-y-4 p-3">
            {skipped.length > 0 && <IssueList title="Not brought across yet" icon={<CircleSlash className="h-4 w-4 text-red-600" />} issues={skipped} />}
            {approx.length > 0 && <IssueList title="Brought across with differences" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} issues={approx} />}
          </div>
        </div>
      )}
    </div>
  );
}

function IssueList({ title, icon, issues }: { title: string; icon: React.ReactNode; issues: StoryImportReport['issues'] }) {
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">{icon}{title}</h3>
      <ul className="space-y-1">
        {issues.map((i) => (
          <li key={i.message} className="min-w-0 text-sm">
            <span className="tabular-nums text-slate-500">{i.count}×</span> {i.message}
            {i.slides.filter(Boolean).length > 0 && (
              <span className="block truncate text-xs text-slate-500" title={i.slides.join(', ')}>
                {i.slides.filter(Boolean).join(', ')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
