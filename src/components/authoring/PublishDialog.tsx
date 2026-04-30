import { useMemo, useState } from 'react';
import { X, Upload, Cloud, Globe, Video as VideoIcon, FileText, AlertTriangle, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useCourse } from '@/context/CourseContext';
import { publish } from '@/lib/publish';
import type { PublishFormat, PublishOptions, ReportStatus, CompletionMode } from '@/lib/publish/types';
import { analyzeCompatibility } from '@/lib/publish/compat';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Section = 'lms' | 'web' | 'video' | 'word';

const SECTIONS: Array<{ id: Section; label: string; icon: typeof Cloud }> = [
  { id: 'lms', label: 'LMS / LRS', icon: Cloud },
  { id: 'web', label: 'Web', icon: Globe },
  { id: 'video', label: 'Video', icon: VideoIcon },
  { id: 'word', label: 'Word', icon: FileText },
];

function slugify(s: string): string {
  return (s || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'course';
}

export function PublishDialog({ open, onOpenChange }: Props) {
  const { state } = useCourse();
  const [section, setSection] = useState<Section>('lms');
  const [format, setFormat] = useState<PublishFormat>('scorm12');
  const [title, setTitle] = useState(state.playerSettings.courseTitle || 'Untitled Course');
  const [description, setDescription] = useState('');
  const [filename, setFilename] = useState(`${slugify(state.playerSettings.courseTitle)}.zip`);

  const [identifier, setIdentifier] = useState(`course_${Date.now()}`);
  const [version, setVersion] = useState('1.0');
  const [duration, setDuration] = useState('00:10:00');
  const [keywords, setKeywords] = useState('');
  const [lessonTitle, setLessonTitle] = useState(state.playerSettings.courseTitle || 'Lesson');
  const [lessonIdentifier, setLessonIdentifier] = useState(`lesson_${Date.now()}`);
  const [reportStatus, setReportStatus] = useState<ReportStatus>('passed-incomplete');

  const [completionMode, setCompletionMode] = useState<CompletionMode>('percent');
  const [completionPercent, setCompletionPercent] = useState(100);
  const [completionQuizSlideId, setCompletionQuizSlideId] = useState<string>('');

  const [lrsEndpoint, setLrsEndpoint] = useState('');
  const [lrsActorName, setLrsActorName] = useState('Learner');
  const [lrsActorMbox, setLrsActorMbox] = useState('mailto:learner@example.com');
  const [lrsAuthToken, setLrsAuthToken] = useState('');

  const [trackingOpen, setTrackingOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const quizSlides = useMemo(
    () => state.slides.filter((s) => s.slideType === 'quiz'),
    [state.slides],
  );

  const warnings = useMemo(() => analyzeCompatibility(state, format), [state, format]);

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const opts: PublishOptions = {
        format,
        courseTitle: title,
        description,
        filename,
        identifier,
        version,
        duration,
        keywords,
        lessonTitle,
        lessonIdentifier,
        reportStatus,
        completion: { mode: completionMode, percent: completionPercent, quizSlideId: completionQuizSlideId || undefined },
        lrs: format === 'xapi' ? {
          endpoint: lrsEndpoint,
          actorName: lrsActorName,
          actorMbox: lrsActorMbox,
          authToken: lrsAuthToken,
        } : undefined,
      };
      await publish(state, opts);
      onOpenChange(false);
    } catch (e) {
      console.error('Publish failed', e);
      alert('Publish failed: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPublishing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full h-full max-w-6xl max-h-[92vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-slate-700" />
            <h2 className="text-lg font-semibold text-slate-800">Publish</h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 rounded-md hover:bg-slate-200 text-slate-600 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <aside className="w-56 shrink-0 border-r bg-slate-50 p-3 flex flex-col gap-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors',
                    section === s.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-700 hover:bg-slate-200',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {s.label}
                </button>
              );
            })}
          </aside>

          {/* Right panel */}
          <main className="flex-1 overflow-y-auto p-6 bg-white">
            {section === 'lms' && (
              <div className="space-y-5 max-w-3xl">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pub-title">Course Title</Label>
                    <Input id="pub-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pub-filename">Output filename</Label>
                    <Input id="pub-filename" value={filename} onChange={(e) => setFilename(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pub-desc">Description</Label>
                  <Textarea id="pub-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>

                <div className="rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-800 mb-2">Properties</div>
                  <dl className="grid grid-cols-3 gap-y-1.5 gap-x-4">
                    <dt className="text-slate-500">Player</dt>
                    <dd className="col-span-2">{title || 'Untitled Course'}</dd>
                    <dt className="text-slate-500">Quality</dt>
                    <dd className="col-span-2">Standard</dd>
                    <dt className="text-slate-500">Publish scope</dt>
                    <dd className="col-span-2">Entire course ({state.slides.length} slide{state.slides.length === 1 ? '' : 's'})</dd>
                  </dl>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">Reporting and Tracking</div>
                      <div className="text-xs text-slate-500">Configure how progress is reported to your LMS.</div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setTrackingOpen(true)}>
                      <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                      Reporting and Tracking…
                    </Button>
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <Label>Format</Label>
                    <Select value={format} onValueChange={(v) => setFormat(v as PublishFormat)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scorm12">SCORM 1.2</SelectItem>
                        <SelectItem value="scorm2004">SCORM 2004</SelectItem>
                        <SelectItem value="xapi">xAPI (Tin Can)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-amber-900">
                        <div className="font-semibold mb-1">Compatibility check</div>
                        <ul className="list-disc pl-5 space-y-1">
                          {warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {section !== 'lms' && (
              <div className="h-full flex items-center justify-center text-center">
                <div className="max-w-sm">
                  <div className="text-2xl font-semibold text-slate-800 mb-2">Coming soon</div>
                  <p className="text-sm text-slate-500">
                    {section === 'web' && 'Publish a standalone web package that can be hosted on any static server.'}
                    {section === 'video' && 'Render the entire course as an MP4 video file.'}
                    {section === 'word' && 'Export slide content and notes as a Microsoft Word document.'}
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Footer */}
        <div className="h-16 border-t bg-slate-50 px-6 flex items-center justify-end gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handlePublish}
            disabled={publishing || section !== 'lms'}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* Reporting and Tracking secondary dialog */}
      <Dialog open={trackingOpen} onOpenChange={setTrackingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Reporting and Tracking</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue={format === 'xapi' ? 'lrs' : 'lms'}>
            <TabsList className="h-auto bg-sky-100 p-0 rounded-none gap-0 border-b border-slate-200 w-full justify-start">
              <TabsTrigger
                value="lms"
                className="rounded-none px-4 py-1.5 text-xs font-medium border-t-2 border-transparent bg-sky-100 text-slate-600 hover:bg-sky-200 data-[state=active]:bg-white data-[state=active]:border-blue-600 data-[state=active]:text-slate-800 data-[state=active]:shadow-none"
              >
                {format === 'xapi' ? 'LRS' : 'LMS'}
              </TabsTrigger>
              <TabsTrigger
                value="tracking"
                className="rounded-none px-4 py-1.5 text-xs font-medium border-t-2 border-transparent bg-sky-100 text-slate-600 hover:bg-sky-200 data-[state=active]:bg-white data-[state=active]:border-blue-600 data-[state=active]:text-slate-800 data-[state=active]:shadow-none"
              >
                Tracking
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lms" className="space-y-3 pt-2">
              {format !== 'xapi' ? (
                <>
                  <div className="space-y-1.5">
                    <Label>SCORM version</Label>
                    <Select value={format} onValueChange={(v) => setFormat(v as PublishFormat)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="scorm12">SCORM 1.2</SelectItem>
                        <SelectItem value="scorm2004">SCORM 2004</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Course identifier</Label><Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Version</Label><Input value={version} onChange={(e) => setVersion(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Duration (hh:mm:ss)</Label><Input value={duration} onChange={(e) => setDuration(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Keywords</Label><Input value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Lesson title</Label><Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Lesson identifier</Label><Input value={lessonIdentifier} onChange={(e) => setLessonIdentifier(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Report status</Label>
                    <Select value={reportStatus} onValueChange={(v) => setReportStatus(v as ReportStatus)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="passed-incomplete">Passed / Incomplete</SelectItem>
                        <SelectItem value="passed-failed">Passed / Failed</SelectItem>
                        <SelectItem value="completed-incomplete">Completed / Incomplete</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5"><Label>Endpoint URL</Label><Input value={lrsEndpoint} onChange={(e) => setLrsEndpoint(e.target.value)} placeholder="https://your-lrs/xapi" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Actor name</Label><Input value={lrsActorName} onChange={(e) => setLrsActorName(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Actor mbox</Label><Input value={lrsActorMbox} onChange={(e) => setLrsActorMbox(e.target.value)} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>Auth token (Base64 basic)</Label><Input value={lrsAuthToken} onChange={(e) => setLrsAuthToken(e.target.value)} type="password" /></div>
                </>
              )}
            </TabsContent>

            <TabsContent value="tracking" className="space-y-4 pt-2">
              <div className="space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="completion-mode"
                    checked={completionMode === 'percent'}
                    onChange={() => setCompletionMode('percent')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">When learner has viewed</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={completionPercent}
                        onChange={(e) => setCompletionPercent(Number(e.target.value))}
                        className="w-20"
                        disabled={completionMode !== 'percent'}
                      />
                      <span className="text-sm text-slate-600">% of slides</span>
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="completion-mode"
                    checked={completionMode === 'quiz'}
                    onChange={() => setCompletionMode('quiz')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">When learner completes a quiz</div>
                    <div className="mt-1">
                      <Select
                        value={completionQuizSlideId}
                        onValueChange={setCompletionQuizSlideId}
                        disabled={completionMode !== 'quiz' || quizSlides.length === 0}
                      >
                        <SelectTrigger className="w-72"><SelectValue placeholder={quizSlides.length === 0 ? 'No quiz slides' : 'Any quiz'} /></SelectTrigger>
                        <SelectContent>
                          {quizSlides.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.title || `Quiz slide ${state.slides.indexOf(s) + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="completion-mode"
                    checked={completionMode === 'triggers'}
                    onChange={() => setCompletionMode('triggers')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-800">Using triggers</div>
                    <div className="text-xs text-slate-500">Completion will be reported only when triggered by an action in your course.</div>
                  </div>
                </label>
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setTrackingOpen(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
