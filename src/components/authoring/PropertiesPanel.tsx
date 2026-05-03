import { useEffect, useRef, useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Upload, Plus, X, Sparkles, Loader2, Music } from 'lucide-react';
import type { SlideElement, TextElement, ImageElement, ShapeElement, VideoElement, ShapeType, Trigger, AnimationIn, AnimationOut, SlideAudio, Caption, CheckboxElement, HotspotElement, TableElement, QuizConfig, QuizChoice, QuizMatchPair, QuizSortItem, QuizFeedbackTarget, QuizQuestionType, QuizFeedbackMode, ResultsConfig, Slide } from '@/types/course';
import { Switch } from '@/components/ui/switch';
import { themeVarRef, themeVarIndex, resolveColor } from '@/lib/themeVars';
import { transcribeAudio } from '@/lib/transcribe';

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8 text-xs" />
    </div>
  );
}

function SecondsField({ label, valueMs, onChangeMs, min = 0, step = 0.1 }: { label: string; valueMs: number; onChangeMs: (ms: number) => void; min?: number; step?: number }) {
  const seconds = (valueMs / 1000).toFixed(1);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          step={step}
          min={min / 1000}
          value={seconds}
          onChange={(e) => {
            const sec = Number(e.target.value);
            if (!Number.isNaN(sec)) onChangeMs(Math.max(min, Math.round(sec * 1000)));
          }}
          className="h-8 text-xs pr-6"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">s</span>
      </div>
    </div>
  );
}

const SLIDE_MIN_S = 2;
const SLIDE_MAX_S = 600;

function SlideDurationControl({ valueMs, onChangeMs }: { valueMs: number; onChangeMs: (ms: number) => void }) {
  const seconds = Math.min(SLIDE_MAX_S, Math.max(SLIDE_MIN_S, valueMs / 1000));
  const [text, setText] = useState<string>(seconds.toString());

  useEffect(() => {
    setText(seconds.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMs]);

  const commit = () => {
    const parsed = Number(text);
    let clamped = Number.isFinite(parsed) ? parsed : seconds;
    if (clamped < SLIDE_MIN_S) clamped = SLIDE_MIN_S;
    if (clamped > SLIDE_MAX_S) clamped = SLIDE_MAX_S;
    setText(clamped.toString());
    onChangeMs(Math.round(clamped * 1000));
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Duration (s)</Label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={SLIDE_MIN_S}
          max={SLIDE_MAX_S}
          step={0.1}
          value={seconds}
          onChange={(e) => {
            const v = Number(e.target.value);
            setText(v.toString());
            onChangeMs(Math.round(v * 1000));
          }}
          className="flex-1 accent-primary cursor-pointer"
          aria-label="Slide duration slider"
        />
        <div className="relative w-20 shrink-0">
          <Input
            type="number"
            step={0.1}
            min={SLIDE_MIN_S}
            max={SLIDE_MAX_S}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="h-8 text-xs pr-5 bg-white text-slate-800"
            aria-label="Slide duration (seconds)"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">s</span>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Min {SLIDE_MIN_S}s · Max {SLIDE_MAX_S}s (10 min)</p>
    </div>
  );
}

function ThemeSwatches({ themeColors, activeIndex, onPick }: { themeColors: string[]; activeIndex: number; onPick: (varRef: string) => void }) {
  return (
    <div className="flex gap-1">
      {themeColors.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(themeVarRef(i))}
          className={`w-5 h-5 rounded-sm border hover:scale-110 transition-transform ${activeIndex === i ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
          style={{ backgroundColor: c }}
          title={`Theme color ${i + 1}: ${c}`}
          aria-label={`Apply theme color ${c}`}
        />
      ))}
    </div>
  );
}

function TransparentSwatch({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Transparent"
      aria-label="Set color to transparent"
      className={`relative w-5 h-5 rounded-sm border bg-background overflow-hidden hover:scale-110 transition-transform ${active ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
    >
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top right, transparent calc(50% - 1px), hsl(0 84% 60%) calc(50% - 1px), hsl(0 84% 60%) calc(50% + 1px), transparent calc(50% + 1px))',
        }}
      />
    </button>
  );
}

function ColorField({ label, value, onChange, themeColors }: { label: string; value: string; onChange: (v: string) => void; themeColors?: string[] }) {
  const palette = themeColors ?? [];
  const themeIdx = themeVarIndex(value);
  const isTransparent = value === 'transparent';
  const resolvedHex = resolveColor(value, palette, '#ffffff');
  const pickerValue = (resolvedHex && resolvedHex !== 'transparent') ? resolvedHex : '#ffffff';
  // Friendly display: show "theme-primary" instead of "var(--theme-primary)".
  const displayValue = themeIdx >= 0
    ? (value.match(/^var\(\s*--(theme-[a-z0-9-]+)\s*\)$/i)?.[1] ?? value)
    : value;
  const handleTextChange = (raw: string) => {
    const trimmed = raw.trim();
    const m = trimmed.match(/^--?(theme-[a-z0-9-]+)$/i) ?? trimmed.match(/^(theme-[a-z0-9-]+)$/i);
    if (m) {
      onChange(`var(--${m[1].toLowerCase()})`);
    } else {
      onChange(raw);
    }
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={pickerValue.startsWith('#') ? pickerValue : '#ffffff'} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
        <Input value={displayValue} onChange={(e) => handleTextChange(e.target.value)} className="h-8 text-xs flex-1" />
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        <TransparentSwatch active={isTransparent} onClick={() => onChange('transparent')} />
        {palette.length > 0 && <ThemeSwatches themeColors={palette} activeIndex={themeIdx} onPick={onChange} />}
      </div>
    </div>
  );
}

function AudioPanel({ audio }: { audio: SlideAudio }) {
  const { dispatch } = useCourse();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const updateCaption = (idx: number, patch: Partial<Caption>) => {
    const next = audio.captions.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    dispatch({ type: 'UPDATE_AUDIO', id: audio.id, updates: { captions: next } });
  };
  const removeCaption = (idx: number) => {
    const next = audio.captions.filter((_, i) => i !== idx);
    dispatch({ type: 'UPDATE_AUDIO', id: audio.id, updates: { captions: next } });
  };
  const addCaption = () => {
    const last = audio.captions[audio.captions.length - 1];
    const start = last ? last.endTime : 0;
    const next = [...audio.captions, { startTime: start, endTime: start + 2, text: '' }];
    dispatch({ type: 'UPDATE_AUDIO', id: audio.id, updates: { captions: next } });
  };

  const runAi = async () => {
    setBusy(true);
    setError(null);
    setProgress('Loading model…');
    try {
      const captions = await transcribeAudio(audio.src, { onProgress: setProgress });
      dispatch({ type: 'UPDATE_AUDIO', id: audio.id, updates: { captions } });
    } catch (e: any) {
      console.error('Transcription failed', e);
      setError(e?.message ?? 'Transcription failed');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="p-3 border-b shrink-0 flex items-center gap-2">
        <Music className="h-4 w-4 text-amber-600" />
        <p className="text-sm font-medium truncate flex-1">{audio.name}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            dispatch({ type: 'DELETE_AUDIO', id: audio.id });
          }}
          title="Delete audio"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="text-xs text-muted-foreground">
          Duration: {audio.duration.toFixed(1)}s · {audio.captions.length} caption{audio.captions.length === 1 ? '' : 's'}
        </div>

        <Button onClick={runAi} disabled={busy} className="w-full" size="sm">
          {busy ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{progress || 'Working…'}</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-1" />Auto-Generate Captions (AI)</>
          )}
        </Button>
        {busy && (
          <p className="text-[10px] text-muted-foreground">
            First run downloads ~40MB Whisper-tiny model. Subsequent runs use the cached model.
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        <div className="pt-2 border-t space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Captions</Label>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addCaption}>
              <Plus className="h-3 w-3 mr-1" />Add
            </Button>
          </div>

          {audio.captions.length === 0 && (
            <p className="text-xs text-muted-foreground">No captions yet. Generate with AI or add manually.</p>
          )}

          <div className="space-y-2">
            {audio.captions.map((c, i) => (
              <div key={i} className="rounded border p-2 space-y-1.5 bg-muted/30">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step={0.1}
                    min={0}
                    value={Number(c.startTime.toFixed(2))}
                    onChange={(e) => updateCaption(i, { startTime: Number(e.target.value) || 0 })}
                    className="h-7 text-xs"
                    aria-label="Start time (s)"
                  />
                  <span className="text-[10px] text-muted-foreground">→</span>
                  <Input
                    type="number"
                    step={0.1}
                    min={0}
                    value={Number(c.endTime.toFixed(2))}
                    onChange={(e) => updateCaption(i, { endTime: Number(e.target.value) || 0 })}
                    className="h-7 text-xs"
                    aria-label="End time (s)"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeCaption(i)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  value={c.text}
                  onChange={(e) => updateCaption(i, { text: e.target.value })}
                  className="text-xs min-h-[44px]"
                  placeholder="Caption text"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SlideNumberField({ index, total, onMove }: { index: number; total: number; onMove: (to: number) => void }) {
  const display = String(index + 1).padStart(2, '0');
  const [value, setValue] = useState(display);
  useEffect(() => { setValue(display); }, [display]);
  const commit = () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > total) { setValue(display); return; }
    const to = n - 1;
    if (to === index) { setValue(display); return; }
    onMove(to);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slide Number</Label>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
        className="h-8 text-xs bg-white text-slate-800 w-20"
      />
      <p className="text-xs text-muted-foreground">Position in the slide list (1–{total}). Press Enter to reorder.</p>
    </div>
  );
}

export function PropertiesPanel() {
  const { state, dispatch } = useCourse();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMasterMode = state.viewMode === 'master';
  const activeSlide = isMasterMode
    ? state.masterSlides[state.activeSlideIndex]
    : state.slides[state.activeSlideIndex];
  const activeElement = activeSlide?.elements.find((el) => el.id === state.activeElementId);
  const activeAudio = activeSlide?.audio?.find((a) => a.id === state.activeAudioId) ?? null;
  const themeColors = state.courseSettings.themeColors;

  const update = (updates: Partial<SlideElement>) => {
    if (!activeElement) return;
    dispatch({ type: 'UPDATE_ELEMENT', id: activeElement.id, updates });
  };

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeElement) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      update({ src: ev.target?.result as string } as Partial<ImageElement>);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="w-[280px] glass border-l border-white/60 flex flex-col shrink-0 rounded-none">
      {activeAudio ? (
        <AudioPanel audio={activeAudio} />
      ) : !activeElement ? (
        /* Slide-level properties — no tabs needed */
        <>
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Properties</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <p className="text-sm font-medium text-foreground">
              {isMasterMode
                ? 'Master Slide Properties'
                : activeSlide?.slideType === 'quiz'
                ? 'Quiz Slide Properties'
                : activeSlide?.slideType === 'results'
                ? 'Results Slide Properties'
                : 'Slide Properties'}
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slide Title</Label>
              <Input
                value={activeSlide?.title ?? ''}
                onChange={(e) => dispatch({
                  type: 'UPDATE_SLIDE',
                  index: state.activeSlideIndex,
                  updates: { title: e.target.value.slice(0, 30) },
                })}
                maxLength={30}
                placeholder={isMasterMode ? `Master ${state.activeSlideIndex + 1}` : `Slide ${state.activeSlideIndex + 1}`}
                className="h-8 text-xs bg-white text-slate-800"
              />
              <p className="text-xs text-muted-foreground">Up to 30 characters. Shown in the slide list and player menu.</p>
            </div>

            {!isMasterMode && (
              <SlideNumberField
                index={state.activeSlideIndex}
                total={state.slides.length}
                onMove={(to) => dispatch({ type: 'MOVE_SLIDE', from: state.activeSlideIndex, to })}
              />
            )}

            {!isMasterMode && activeSlide?.slideType === 'quiz' && activeSlide.quiz && (
              <QuizEditor slide={activeSlide} index={state.activeSlideIndex} allSlides={state.slides} />
            )}

            {!isMasterMode && activeSlide?.slideType === 'results' && activeSlide.results && (
              <ResultsEditor results={activeSlide.results} index={state.activeSlideIndex} />
            )}

            {activeSlide?.slideType !== 'results' && (
              <>
                <SlideDurationControl
                  valueMs={activeSlide?.duration ?? 5000}
                  onChangeMs={(v) => dispatch({ type: 'UPDATE_SLIDE', index: state.activeSlideIndex, updates: { duration: v } })}
                />
                <p className="text-xs text-muted-foreground">Sets the total timeline length for this slide.</p>

                <div className="space-y-1.5 pt-2 border-t">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slide Advance</Label>
                  <Select
                    value={activeSlide?.advanceMode ?? 'manual'}
                    onValueChange={(v) => dispatch({ type: 'UPDATE_SLIDE', index: state.activeSlideIndex, updates: { advanceMode: v as 'manual' | 'auto' } })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">By user (manual)</SelectItem>
                      <SelectItem value="auto">Automatically</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Action when the slide timeline ends.</p>
                </div>

                <div className="space-y-1.5 pt-2 border-t">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When Revisiting</Label>
                  <Select
                    value={activeSlide?.revisitMode ?? 'reset'}
                    onValueChange={(v) => dispatch({ type: 'UPDATE_SLIDE', index: state.activeSlideIndex, updates: { revisitMode: v as 'reset' | 'resume' } })}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reset">Reset to initial state</SelectItem>
                      <SelectItem value="resume">Resume saved state</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Behavior when navigating back to this slide.</p>
                </div>

                {!isMasterMode && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slide Notes</Label>
                    <Textarea
                      value={activeSlide?.notes ?? ''}
                      onChange={(e) => dispatch({ type: 'UPDATE_SLIDE', index: state.activeSlideIndex, updates: { notes: e.target.value } })}
                      className="text-xs min-h-[80px] bg-white text-slate-800"
                      placeholder="Speaker notes shown in the player Notes tab…"
                    />
                  </div>
                )}

                {!isMasterMode && state.masterSlides.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Master Slide</p>
                    <Select
                      value={activeSlide?.masterId ?? 'none'}
                      onValueChange={(v) => {
                        dispatch({
                          type: 'UPDATE_SLIDE',
                          index: state.activeSlideIndex,
                          updates: { masterId: v === 'none' ? undefined : v },
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {state.masterSlides.map((ms, i) => (
                          <SelectItem key={ms.id} value={ms.id}>
                            Master {i + 1} ({ms.elements.length} elements)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Assigns a master slide as a locked background layer.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      ) : (
        /* Element selected — show tabbed Properties / Triggers */
        <Tabs defaultValue="properties" className="flex flex-col flex-1 min-h-0">
          <div className="border-b shrink-0">
            <TabsList className="w-full h-auto p-0 bg-transparent rounded-none gap-0 justify-start">
              <TabsTrigger
                value="properties"
                className="flex-1 text-xs px-4 py-1.5 rounded-none border-t-2 border-transparent bg-sky-100 text-slate-600 hover:bg-sky-200 data-[state=active]:bg-white data-[state=active]:border-blue-600 data-[state=active]:text-slate-800 data-[state=active]:shadow-none"
              >
                Properties
              </TabsTrigger>
              <TabsTrigger
                value="triggers"
                className="flex-1 text-xs px-4 py-1.5 rounded-none border-t-2 border-transparent bg-sky-100 text-slate-600 hover:bg-sky-200 data-[state=active]:bg-white data-[state=active]:border-blue-600 data-[state=active]:text-slate-800 data-[state=active]:shadow-none"
              >
                Triggers
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="properties" className="flex-1 overflow-y-auto p-3 space-y-4 mt-0">
            <p className="text-sm font-medium capitalize text-foreground">{activeElement.type} Element</p>

            <div className="grid grid-cols-2 gap-2">
              <NumField label="X" value={Math.round(activeElement.x)} onChange={(v) => update({ x: v })} />
              <NumField label="Y" value={Math.round(activeElement.y)} onChange={(v) => update({ y: v })} />
              <NumField label="Width" value={Math.round(activeElement.width)} onChange={(v) => update({ width: v })} />
              <NumField label="Height" value={Math.round(activeElement.height)} onChange={(v) => update({ height: v })} />
            </div>

            {activeElement.type === 'text' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Content</Label>
                  <Textarea value={(activeElement as TextElement).content} onChange={(e) => update({ content: e.target.value } as Partial<TextElement>)} className="text-xs min-h-[60px]" />
                </div>
                <NumField label="Font Size" value={(activeElement as TextElement).fontSize} onChange={(v) => update({ fontSize: v } as Partial<TextElement>)} />
                <div className="space-y-1">
                  <Label className="text-xs">Font Weight</Label>
                  <Select value={(activeElement as TextElement).fontWeight} onValueChange={(v) => update({ fontWeight: v } as Partial<TextElement>)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="300">Light</SelectItem>
                      <SelectItem value="400">Normal</SelectItem>
                      <SelectItem value="600">Semi Bold</SelectItem>
                      <SelectItem value="700">Bold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
               <ColorField label="Text Color" value={(activeElement as TextElement).textColor} onChange={(v) => update({ textColor: v } as Partial<TextElement>)} themeColors={themeColors} />
               <ColorField label="Background" value={(activeElement as TextElement).backgroundColor} onChange={(v) => update({ backgroundColor: v } as Partial<TextElement>)} themeColors={themeColors} />
              </>
            )}

            {activeElement.type === 'image' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Image</Label>
                  {(activeElement as ImageElement).src && (
                    <img src={(activeElement as ImageElement).src} alt="Preview" className="w-full h-24 object-contain rounded border bg-muted" />
                  )}
                  <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />Replace Image
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceImage} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Alt Text</Label>
                  <Input value={(activeElement as ImageElement).alt} onChange={(e) => update({ alt: e.target.value } as Partial<ImageElement>)} className="h-8 text-xs" />
                </div>
              </>
            )}

            {activeElement.type === 'shape' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Shape Type</Label>
                  <Select value={(activeElement as ShapeElement).shapeType} onValueChange={(v) => update({ shapeType: v as ShapeType } as Partial<ShapeElement>)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rectangle">Rectangle</SelectItem>
                      <SelectItem value="circle">Circle</SelectItem>
                      <SelectItem value="triangle">Triangle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
               <ColorField label="Fill Color" value={(activeElement as ShapeElement).fillColor} onChange={(v) => update({ fillColor: v } as Partial<ShapeElement>)} themeColors={themeColors} />
               <ColorField label="Border Color" value={(activeElement as ShapeElement).borderColor} onChange={(v) => update({ borderColor: v } as Partial<ShapeElement>)} themeColors={themeColors} />
                <NumField label="Border Width" value={(activeElement as ShapeElement).borderWidth} onChange={(v) => update({ borderWidth: v } as Partial<ShapeElement>)} />

                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shape Text</p>
                  <div className="space-y-1">
                    <Label className="text-xs">Text</Label>
                    <Textarea
                      value={(activeElement as ShapeElement).text ?? ''}
                      onChange={(e) => update({ text: e.target.value } as Partial<ShapeElement>)}
                      placeholder="Type text to display inside the shape (or double-click the shape on the canvas)"
                      className="text-xs min-h-[60px]"
                    />
                  </div>
                  <NumField
                    label="Font Size"
                    value={(activeElement as ShapeElement).fontSize ?? 16}
                    onChange={(v) => update({ fontSize: Math.max(1, v) } as Partial<ShapeElement>)}
                  />
                  <ColorField
                    label="Text Color"
                    value={(activeElement as ShapeElement).textColor ?? '#000000'}
                    onChange={(v) => update({ textColor: v } as Partial<ShapeElement>)}
                    themeColors={themeColors}
                  />
                </div>
              </>
            )}

            {activeElement.type === 'video' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Video Source</Label>
                  {(activeElement as VideoElement).src ? (
                    <video
                      src={(activeElement as VideoElement).src}
                      controls
                      className="w-full h-32 rounded border bg-black"
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">No video loaded.</div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Label htmlFor="video-controls" className="text-xs cursor-pointer">Show Controls</Label>
                  <Switch
                    id="video-controls"
                    checked={(activeElement as VideoElement).controls !== false}
                    onCheckedChange={(v) => update({ controls: v } as Partial<VideoElement>)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="video-autoplay" className="text-xs cursor-pointer">Autoplay</Label>
                  <Switch
                    id="video-autoplay"
                    checked={!!(activeElement as VideoElement).autoplay}
                    onCheckedChange={(v) => update({ autoplay: v } as Partial<VideoElement>)}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Autoplayed videos are muted by default to comply with browser policies.
                </p>
              </>
            )}

            {activeElement.type === 'hotspot' && (
              <div className="space-y-1 rounded border border-dashed border-emerald-500/50 bg-emerald-500/5 p-2">
                <p className="text-xs font-medium text-foreground">Hotspot</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Invisible interactive region. The dashed outline is only visible
                  in the editor — it renders fully transparent in Preview and SCORM.
                  Add Triggers (e.g. onClick) to make it interactive.
                </p>
              </div>
            )}

            {activeElement.type === 'checkbox' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={(activeElement as CheckboxElement).label}
                    onChange={(e) => update({ label: e.target.value } as Partial<CheckboxElement>)}
                    className="h-8 text-xs"
                    placeholder="Checkbox label"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="cb-default" className="text-xs cursor-pointer">Checked by default</Label>
                  <Switch
                    id="cb-default"
                    checked={!!(activeElement as CheckboxElement).defaultChecked}
                    onCheckedChange={(v) => update({ defaultChecked: v } as Partial<CheckboxElement>)}
                  />
                </div>
                <NumField
                  label="Font Size"
                  value={(activeElement as CheckboxElement).fontSize ?? 16}
                  onChange={(v) => update({ fontSize: Math.max(1, v) } as Partial<CheckboxElement>)}
                />
                <ColorField
                  label="Text Color"
                  value={(activeElement as CheckboxElement).textColor ?? '#ffffff'}
                  onChange={(v) => update({ textColor: v } as Partial<CheckboxElement>)}
                  themeColors={themeColors}
                />
              </>
            )}

            {activeElement.type === 'table' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <NumField
                    label="Rows"
                    value={(activeElement as TableElement).rowCount}
                    onChange={(v) => {
                      const te = activeElement as TableElement;
                      const r = Math.max(1, Math.min(50, Math.round(v || 1)));
                      const c = te.colCount;
                      const next: string[][] = [];
                      for (let i = 0; i < r; i++) {
                        const row: string[] = [];
                        for (let j = 0; j < c; j++) row.push(te.cellData[i]?.[j] ?? '');
                        next.push(row);
                      }
                      update({ rowCount: r, cellData: next } as Partial<TableElement>);
                    }}
                  />
                  <NumField
                    label="Columns"
                    value={(activeElement as TableElement).colCount}
                    onChange={(v) => {
                      const te = activeElement as TableElement;
                      const c = Math.max(1, Math.min(20, Math.round(v || 1)));
                      const r = te.rowCount;
                      const next: string[][] = [];
                      for (let i = 0; i < r; i++) {
                        const row: string[] = [];
                        for (let j = 0; j < c; j++) row.push(te.cellData[i]?.[j] ?? '');
                        next.push(row);
                      }
                      update({ colCount: c, cellData: next } as Partial<TableElement>);
                    }}
                  />
                </div>
                <NumField
                  label="Font Size"
                  value={(activeElement as TableElement).fontSize ?? 14}
                  onChange={(v) => update({ fontSize: Math.max(1, v) } as Partial<TableElement>)}
                />
                <ColorField
                  label="Border Color"
                  value={(activeElement as TableElement).borderColor ?? '#94a3b8'}
                  onChange={(v) => update({ borderColor: v } as Partial<TableElement>)}
                  themeColors={themeColors}
                />
                <ColorField
                  label="Text Color"
                  value={(activeElement as TableElement).textColor ?? '#0f172a'}
                  onChange={(v) => update({ textColor: v } as Partial<TableElement>)}
                  themeColors={themeColors}
                />
                <p className="text-[10px] text-muted-foreground">Click any cell on the canvas to edit its content.</p>
              </>
            )}

            

            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timeline</p>
              <div className="grid grid-cols-2 gap-2">
                <SecondsField label="Start (s)" valueMs={activeElement.startTime} onChangeMs={(v) => update({ startTime: Math.max(0, v) })} />
                <SecondsField label="Duration (s)" valueMs={activeElement.duration} onChangeMs={(v) => update({ duration: Math.max(100, v) })} min={100} />
              </div>
            </div>

            <Button variant="destructive" size="sm" className="w-full" onClick={() => dispatch({ type: 'DELETE_ELEMENT', id: activeElement.id })}>
              <Trash2 className="h-4 w-4 mr-1" />Delete Element
            </Button>
          </TabsContent>

          <TabsContent value="triggers" className="flex-1 overflow-y-auto p-3 mt-0">
            <TriggersSection element={activeElement} onUpdate={update} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function TriggersSection({ element, onUpdate }: { element: SlideElement; onUpdate: (u: Partial<SlideElement>) => void }) {
  const { state } = useCourse();
  const slides = state.slides;
  const activeSlide = slides[state.activeSlideIndex];
  const triggers = element.triggers ?? [];
  const [newEvent, setNewEvent] = useState('onClick');
  const [newAction, setNewAction] = useState('jumpToSlide');
  const [newTarget, setNewTarget] = useState('');
  const [newTime, setNewTime] = useState<string>('0');
  const [newMediaId, setNewMediaId] = useState<string>('');
  const [newJumpTime, setNewJumpTime] = useState<string>('0');
  const [newEmphasis, setNewEmphasis] = useState<'pulse' | 'shake' | 'bounce' | 'flash'>('pulse');
  const [newUrl, setNewUrl] = useState<string>('');
  const isSlideAction = newAction === 'jumpToSlide';
  const isElementAction = newAction === 'showElement' || newAction === 'hideElement';
  const isMediaAction = newAction === 'playMedia' || newAction === 'pauseMedia' || newAction === 'stopMedia';
  const isCourseAction = newAction === 'restartCourse' || newAction === 'exitCourse' || newAction === 'completeCourse';
  const isJumpToTime = newAction === 'jumpToTime';
  const isEmphasize = newAction === 'emphasizeElement';
  const isOpenUrl = newAction === 'openUrl';
  const isMediaEvent = newEvent === 'mediaStart' || newEvent === 'mediaEnd' || newEvent === 'mediaPause';

  const slideLabel = (id: string) => {
    const idx = slides.findIndex((s) => s.id === id);
    if (idx === -1) return id.slice(0, 8);
    return slides[idx].title || `Slide ${idx + 1}`;
  };

  // Element name resolver — used for Show/Hide Element dropdowns + labels.
  const elementName = (el: SlideElement, idx: number): string => {
    const fallback = `${el.type.charAt(0).toUpperCase() + el.type.slice(1)} ${idx + 1}`;
    if (el.type === 'text') return ((el as TextElement).content || fallback).slice(0, 30);
    if (el.type === 'image') return (el as ImageElement).alt || fallback;
    if (el.type === 'video') return (el as any).alt || fallback;
    if (el.type === 'checkbox') return (el as CheckboxElement).label || fallback;
    if (el.type === 'shape') return ((el as ShapeElement).text || fallback).slice(0, 30);
    return fallback;
  };
  const slideElements = (activeSlide?.elements ?? []).map((el, i) => ({ id: el.id, label: elementName(el, i) }));
  const elementLabel = (id: string) => slideElements.find((e) => e.id === id)?.label || id.slice(0, 8);

  // Media sources available on the current slide: audio tracks + video elements.
  const mediaSources = (() => {
    const out: { id: string; label: string }[] = [];
    const audios = activeSlide?.audio ?? [];
    audios.forEach((a) => out.push({ id: `audio:${a.id}`, label: `🎵 ${a.name || 'Audio'}` }));
    (activeSlide?.elements ?? []).forEach((el, i) => {
      if (el.type === 'video') {
        const ve = el as VideoElement;
        const name = (ve as any).alt || `Video ${i + 1}`;
        out.push({ id: `video:${el.id}`, label: `🎬 ${name}` });
      }
    });
    return out;
  })();

  const mediaLabel = (mediaId?: string) => {
    if (!mediaId) return 'media';
    const m = mediaSources.find((s) => s.id === mediaId);
    if (m) return m.label;
    return mediaId;
  };

  const addTrigger = () => {
    if (isMediaEvent && !newMediaId) return;
    if (isCourseAction) {
      // No target needed.
    } else if (isMediaAction) {
      if (!newTarget) return; // newTarget holds mediaId for media actions
    } else {
      if (!newTarget) return;
    }
    const t: Trigger = { event: newEvent, action: newAction, targetId: isCourseAction ? '' : newTarget };
    if (newEvent === 'atTime') {
      const parsed = parseFloat(newTime);
      t.time = isFinite(parsed) && parsed >= 0 ? parsed : 0;
    }
    if (isMediaEvent) {
      t.mediaId = newMediaId;
    }
    onUpdate({ triggers: [...triggers, t] } as any);
    setNewTarget('');
    setNewMediaId('');
  };

  const removeTrigger = (idx: number) => {
    onUpdate({ triggers: triggers.filter((_, i) => i !== idx) } as any);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Triggers</p>
      {triggers.map((t, i) => {
        let eventLabel: string;
        if (t.event === 'onClick') eventLabel = 'User clicks';
        else if (t.event === 'onHover') eventLabel = 'User hovers';
        else if (t.event === 'timelineStart') eventLabel = 'Timeline starts';
        else if (t.event === 'timelineEnd') eventLabel = 'Timeline ends';
        else if (t.event === 'atTime') eventLabel = `At ${typeof t.time === 'number' ? t.time : 0}s`;
        else if (t.event === 'mediaStart') eventLabel = `${mediaLabel(t.mediaId)} starts`;
        else if (t.event === 'mediaEnd') eventLabel = `${mediaLabel(t.mediaId)} ends`;
        else if (t.event === 'mediaPause') eventLabel = `${mediaLabel(t.mediaId)} pauses`;
        else eventLabel = t.event;
        let actionLabel: string;
        if (t.action === 'jumpToSlide') actionLabel = `Jump to ${slideLabel(t.targetId)}`;
        else if (t.action === 'hideElement') actionLabel = `Hide ${elementLabel(t.targetId)}`;
        else if (t.action === 'showElement') actionLabel = `Show ${elementLabel(t.targetId)}`;
        else if (t.action === 'playMedia') actionLabel = `Play ${mediaLabel(t.targetId)}`;
        else if (t.action === 'pauseMedia') actionLabel = `Pause ${mediaLabel(t.targetId)}`;
        else if (t.action === 'stopMedia') actionLabel = `Stop ${mediaLabel(t.targetId)}`;
        else if (t.action === 'restartCourse') actionLabel = 'Restart Course';
        else if (t.action === 'exitCourse') actionLabel = 'Exit Course';
        else if (t.action === 'completeCourse') actionLabel = 'Complete Course';
        else actionLabel = `${t.action} (${t.targetId.slice(0, 8)})`;
        return (
          <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-md shadow-sm p-2">
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-xs text-slate-800 truncate"><span className="font-semibold">Action:</span> {actionLabel}</p>
              <p className="text-[11px] text-slate-500 truncate"><span className="font-semibold">When:</span> {eventLabel}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-500 hover:text-destructive" onClick={() => removeTrigger(i)} aria-label="Remove trigger">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      <div className="space-y-1.5">
        <Select value={newEvent} onValueChange={(v) => { setNewEvent(v); setNewMediaId(''); }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="onClick">onClick</SelectItem>
            <SelectItem value="onHover">onHover</SelectItem>
            <SelectItem value="timelineStart">When timeline starts</SelectItem>
            <SelectItem value="timelineEnd">When timeline ends</SelectItem>
            <SelectItem value="atTime">At time</SelectItem>
            <SelectItem value="mediaStart">When media starts</SelectItem>
            <SelectItem value="mediaEnd">When media ends</SelectItem>
            <SelectItem value="mediaPause">When media pauses</SelectItem>
          </SelectContent>
        </Select>
        {newEvent === 'atTime' && (
          <Input
            type="number"
            step="0.1"
            min="0"
            placeholder="Time (seconds)"
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            className="h-7 text-xs"
          />
        )}
        {isMediaEvent && (
          <Select value={newMediaId} onValueChange={setNewMediaId}>
            <SelectTrigger className="h-7 text-xs bg-white text-slate-800 rounded-md">
              <SelectValue placeholder={mediaSources.length ? 'Select media element…' : 'No audio or video on slide'} />
            </SelectTrigger>
            <SelectContent>
              {mediaSources.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={newAction} onValueChange={(v) => { setNewAction(v); setNewTarget(''); }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="jumpToSlide">Jump to Slide</SelectItem>
            <SelectItem value="showElement">Show Element</SelectItem>
            <SelectItem value="hideElement">Hide Element</SelectItem>
            <SelectItem value="playMedia">Play Media</SelectItem>
            <SelectItem value="pauseMedia">Pause Media</SelectItem>
            <SelectItem value="stopMedia">Stop Media</SelectItem>
            <SelectItem value="restartCourse">Restart Course</SelectItem>
            <SelectItem value="exitCourse">Exit Course</SelectItem>
            <SelectItem value="completeCourse">Complete Course</SelectItem>
          </SelectContent>
        </Select>
        {isSlideAction && (
          <Select value={newTarget} onValueChange={setNewTarget}>
            <SelectTrigger className="h-7 text-xs bg-white text-slate-800 rounded-md"><SelectValue placeholder="Select slide..." /></SelectTrigger>
            <SelectContent>
              {slides.map((s, idx) => (
                <SelectItem key={s.id} value={s.id}>{s.title || `Slide ${idx + 1}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isElementAction && (
          <Select value={newTarget} onValueChange={setNewTarget}>
            <SelectTrigger className="h-7 text-xs bg-white text-slate-800 rounded-md">
              <SelectValue placeholder={slideElements.length ? 'Select element…' : 'No elements on slide'} />
            </SelectTrigger>
            <SelectContent>
              {slideElements.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {isMediaAction && (
          <Select value={newTarget} onValueChange={setNewTarget}>
            <SelectTrigger className="h-7 text-xs bg-white text-slate-800 rounded-md">
              <SelectValue placeholder={mediaSources.length ? 'Select media element…' : 'No audio or video on slide'} />
            </SelectTrigger>
            <SelectContent>
              {mediaSources.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addTrigger}><Plus className="h-3 w-3 mr-1" />Add Trigger</Button>
      </div>
    </div>
  );
}

// ============================================================================
// Quiz Slide editor
// ============================================================================

function QuizEditor({ slide, index, allSlides }: { slide: Slide; index: number; allSlides: Slide[] }) {
  const { dispatch } = useCourse();
  const quiz = slide.quiz!;

  const update = (updates: Partial<QuizConfig>) => {
    dispatch({ type: 'UPDATE_QUIZ', index, updates });
  };

  const otherSlides = allSlides
    .map((s, i) => ({ slide: s, label: s.title?.trim() || `Slide ${i + 1}` }))
    .filter(({ slide: s }) => s.id !== slide.id);

  return (
    <div className="space-y-3 pt-2 border-t">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quiz</p>

      <div className="space-y-1">
        <Label className="text-xs">Question Type</Label>
        <Select
          value={quiz.questionType}
          onValueChange={(v) => update({ questionType: v as QuizQuestionType })}
        >
          <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
            <SelectItem value="dnd-matching">Drag & Drop — Matching</SelectItem>
            <SelectItem value="dnd-sorting">Ordering</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Question</Label>
        <Textarea
          value={quiz.question}
          onChange={(e) => update({ question: e.target.value })}
          className="text-xs min-h-[60px] bg-white text-slate-800"
          placeholder="Enter your question…"
        />
      </div>

      {quiz.questionType === 'multiple-choice' && (
        <MCEditor quiz={quiz} update={update} />
      )}

      {quiz.questionType === 'dnd-matching' && (
        <PairsEditor quiz={quiz} update={update} />
      )}

      {quiz.questionType === 'dnd-sorting' && (
        <SortEditor quiz={quiz} update={update} />
      )}

      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">If Correct</p>
        <FeedbackEditor target={quiz.correctFeedback} otherSlides={otherSlides} onChange={(t) => update({ correctFeedback: t })} />
      </div>

      <div className="pt-2 border-t space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">If Incorrect</p>
        <FeedbackEditor target={quiz.incorrectFeedback} otherSlides={otherSlides} onChange={(t) => update({ incorrectFeedback: t })} />
      </div>

      <AttemptsEditor quiz={quiz} update={update} />
      <QuizRevisitEditor quiz={quiz} update={update} />
      <SkipEditor quiz={quiz} update={update} otherSlides={otherSlides} />
    </div>
  );
}

function SkipEditor({ quiz, update, otherSlides }: { quiz: QuizConfig; update: (u: Partial<QuizConfig>) => void; otherSlides: { slide: Slide; label: string }[] }) {
  const allow = !!quiz.allowSkip;
  return (
    <div className="pt-2 border-t space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skip</p>
      <div className="flex items-center justify-between">
        <Label className="text-xs cursor-pointer" htmlFor="quiz-allow-skip">Allow Skip</Label>
        <Switch
          id="quiz-allow-skip"
          checked={allow}
          onCheckedChange={(v) => update({ allowSkip: v })}
        />
      </div>
      {allow && (
        <div className="space-y-1">
          <Label className="text-xs">Skip to slide</Label>
          <Select
            value={quiz.skipTargetSlideId ?? ''}
            onValueChange={(v) => update({ skipTargetSlideId: v })}
          >
            <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue placeholder="Select slide…" /></SelectTrigger>
            <SelectContent>
              {otherSlides.map(({ slide: s, label }) => (
                <SelectItem key={s.id} value={s.id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Skipped questions are not scored.
          </p>
        </div>
      )}
    </div>
  );
}

function AttemptsEditor({ quiz, update }: { quiz: QuizConfig; update: (u: Partial<QuizConfig>) => void }) {
  const attempts = quiz.attempts ?? 1;
  const unlimited = attempts === 0;
  const behavior = quiz.attemptsExhaustedBehavior ?? 'reveal';
  return (
    <div className="pt-2 border-t space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attempts</p>
      <div className="flex items-center justify-between">
        <Label className="text-xs cursor-pointer" htmlFor="quiz-unlimited">Unlimited</Label>
        <Switch
          id="quiz-unlimited"
          checked={unlimited}
          onCheckedChange={(v) => update({ attempts: v ? 0 : 1 })}
        />
      </div>
      {!unlimited && (
        <div className="space-y-1">
          <Label className="text-xs">Max attempts</Label>
          <Input
            type="number"
            min={1}
            max={10}
            value={attempts}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isNaN(n)) return;
              update({ attempts: Math.max(1, Math.min(10, Math.round(n))) });
            }}
            className="h-8 text-xs"
          />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">When attempts are exhausted</Label>
        <Select
          value={behavior}
          onValueChange={(v) => update({ attemptsExhaustedBehavior: v as 'reveal' | 'lock' })}
        >
          <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="reveal">Show correct answer</SelectItem>
            <SelectItem value="lock">Lock and continue</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          {behavior === 'reveal'
            ? 'Highlight correct answer(s) and lock the question.'
            : 'Lock the question without revealing the answer.'}
        </p>
      </div>
    </div>
  );
}

function QuizRevisitEditor({ quiz, update }: { quiz: QuizConfig; update: (u: Partial<QuizConfig>) => void }) {
  const mode = quiz.quizRevisitMode ?? 'reset';
  return (
    <div className="pt-2 border-t space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When Revisiting (Quiz)</Label>
      <Select
        value={mode}
        onValueChange={(v) => update({ quizRevisitMode: v as 'reset' | 'resume' })}
      >
        <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="reset">Reset to initial state</SelectItem>
          <SelectItem value="resume">Resume saved state</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Controls answer, attempts, and lock state when the learner returns to this quiz.
      </p>
    </div>
  );
}

function MCEditor({ quiz, update }: { quiz: QuizConfig; update: (u: Partial<QuizConfig>) => void }) {
  const choices = quiz.choices ?? [];
  const single = quiz.singleSelect !== false;

  const setChoices = (next: QuizChoice[]) => update({ choices: next });

  const toggleCorrect = (id: string) => {
    if (single) {
      setChoices(choices.map((c) => ({ ...c, correct: c.id === id })));
    } else {
      setChoices(choices.map((c) => (c.id === id ? { ...c, correct: !c.correct } : c)));
    }
  };

  const addChoice = () => {
    if (choices.length >= 6) return;
    setChoices([...choices, { id: crypto.randomUUID(), text: `Option ${choices.length + 1}`, correct: false }]);
  };

  const removeChoice = (id: string) => {
    if (choices.length <= 2) return;
    setChoices(choices.filter((c) => c.id !== id));
  };

  const setText = (id: string, text: string) => {
    setChoices(choices.map((c) => (c.id === id ? { ...c, text } : c)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs cursor-pointer" htmlFor="quiz-single">Single answer</Label>
        <Switch
          id="quiz-single"
          checked={single}
          onCheckedChange={(v) => {
            if (v) {
              // collapse to first correct only
              const firstCorrect = choices.find((c) => c.correct)?.id;
              update({
                singleSelect: true,
                choices: choices.map((c) => ({ ...c, correct: c.id === firstCorrect })),
              });
            } else {
              update({ singleSelect: false });
            }
          }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">{single ? 'Radio buttons — one correct answer.' : 'Checkboxes — one or more correct answers.'}</p>

      {choices.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded p-1.5">
          <input
            type={single ? 'radio' : 'checkbox'}
            checked={c.correct}
            onChange={() => toggleCorrect(c.id)}
            className="cursor-pointer"
            title="Mark as correct"
          />
          <Input
            value={c.text}
            onChange={(e) => setText(c.id, e.target.value)}
            className="h-7 text-xs flex-1"
            placeholder="Answer text"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-slate-500 hover:text-destructive"
            onClick={() => removeChoice(c.id)}
            disabled={choices.length <= 2}
            aria-label="Remove option"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs"
        onClick={addChoice}
        disabled={choices.length >= 6}
      >
        <Plus className="h-3 w-3 mr-1" />Add option {choices.length >= 6 && '(max 6)'}
      </Button>
    </div>
  );
}

function PairsEditor({ quiz, update }: { quiz: QuizConfig; update: (u: Partial<QuizConfig>) => void }) {
  const pairs = quiz.pairs ?? [];
  const setPairs = (next: QuizMatchPair[]) => update({ pairs: next });
  const addPair = () => setPairs([...pairs, { id: crypto.randomUUID(), left: '', right: '' }]);
  const removePair = (id: string) => {
    if (pairs.length <= 2) return;
    setPairs(pairs.filter((p) => p.id !== id));
  };
  const setField = (id: string, field: 'left' | 'right', v: string) => {
    setPairs(pairs.map((p) => (p.id === id ? { ...p, [field]: v } : p)));
  };
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">Define matching pairs. The learner drags left items onto the correct right items.</p>
      {pairs.map((p) => (
        <div key={p.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded p-1.5">
          <Input value={p.left} onChange={(e) => setField(p.id, 'left', e.target.value)} className="h-7 text-xs flex-1" placeholder="Left (term)" />
          <span className="text-slate-400 text-xs">→</span>
          <Input value={p.right} onChange={(e) => setField(p.id, 'right', e.target.value)} className="h-7 text-xs flex-1" placeholder="Right (match)" />
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-slate-500 hover:text-destructive" onClick={() => removePair(p.id)} disabled={pairs.length <= 2} aria-label="Remove pair">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addPair}>
        <Plus className="h-3 w-3 mr-1" />Add pair
      </Button>
    </div>
  );
}

function SortEditor({ quiz, update }: { quiz: QuizConfig; update: (u: Partial<QuizConfig>) => void }) {
  const items = quiz.sortItems ?? [];
  const setItems = (next: QuizSortItem[]) => update({ sortItems: next });
  const addItem = () => setItems([...items, { id: crypto.randomUUID(), text: '' }]);
  const removeItem = (id: string) => {
    if (items.length <= 2) return;
    setItems(items.filter((i) => i.id !== id));
  };
  const setText = (id: string, text: string) => {
    setItems(items.map((i) => (i.id === id ? { ...i, text } : i)));
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= items.length) return;
    const next = items.slice();
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setItems(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">Items in correct order (top → bottom). Learner drags to arrange.</p>
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded p-1.5">
          <span className="text-[10px] text-slate-500 w-4 text-right">{i + 1}.</span>
          <Input value={it.text} onChange={(e) => setText(it.id, e.target.value)} className="h-7 text-xs flex-1" placeholder="Item text" />
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => move(it.id, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => move(it.id, 1)} disabled={i === items.length - 1} aria-label="Move down">↓</Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-slate-500 hover:text-destructive" onClick={() => removeItem(it.id)} disabled={items.length <= 2} aria-label="Remove">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addItem}>
        <Plus className="h-3 w-3 mr-1" />Add item
      </Button>
    </div>
  );
}

function FeedbackEditor({ target, otherSlides, onChange }: { target: QuizFeedbackTarget; otherSlides: { slide: Slide; label: string }[]; onChange: (t: QuizFeedbackTarget) => void }) {
  return (
    <div className="space-y-1.5">
      <Select value={target.mode} onValueChange={(v) => onChange({ ...target, mode: v as QuizFeedbackMode })}>
        <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="inline">Inline message</SelectItem>
          <SelectItem value="overlay">Overlay popup</SelectItem>
          <SelectItem value="jumpToSlide">Jump to slide</SelectItem>
        </SelectContent>
      </Select>
      {(target.mode === 'inline' || target.mode === 'overlay') && (
        <Input
          value={target.message ?? ''}
          onChange={(e) => onChange({ ...target, message: e.target.value })}
          className="h-7 text-xs bg-white text-slate-800"
          placeholder="Message text"
        />
      )}
      {target.mode === 'jumpToSlide' && (
        <Select value={target.targetSlideId ?? ''} onValueChange={(v) => onChange({ ...target, targetSlideId: v })}>
          <SelectTrigger className="h-8 text-xs bg-white text-slate-800"><SelectValue placeholder="Select slide…" /></SelectTrigger>
          <SelectContent>
            {otherSlides.map(({ slide: s, label }) => (
              <SelectItem key={s.id} value={s.id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ============================================================================
// Results Slide editor
// ============================================================================

function ResultsEditor({ results, index }: { results: ResultsConfig; index: number }) {
  const { dispatch } = useCourse();
  const update = (updates: Partial<ResultsConfig>) => {
    dispatch({ type: 'UPDATE_RESULTS', index, updates });
  };
  return (
    <div className="space-y-3 pt-2 border-t">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Results</p>
      <div className="space-y-1">
        <Label className="text-xs">Pass Threshold (%)</Label>
        <Input
          type="number"
          min={0}
          max={100}
          value={results.passThreshold}
          onChange={(e) => {
            const n = Number(e.target.value);
            const clamped = Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
            update({ passThreshold: clamped });
          }}
          className="h-8 text-xs bg-white text-slate-800"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Pass Message</Label>
        <Textarea value={results.passMessage} onChange={(e) => update({ passMessage: e.target.value })} className="text-xs min-h-[50px] bg-white text-slate-800" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Fail Message</Label>
        <Textarea value={results.failMessage} onChange={(e) => update({ failMessage: e.target.value })} className="text-xs min-h-[50px] bg-white text-slate-800" />
      </div>
    </div>
  );
}
