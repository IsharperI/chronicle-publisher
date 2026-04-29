import { useEffect, useRef, useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, Upload, Plus, X, Sparkles, Loader2, Music } from 'lucide-react';
import type { SlideElement, TextElement, ImageElement, ShapeElement, VideoElement, ShapeType, Trigger, AnimationIn, AnimationOut, SlideAudio, Caption, CheckboxElement, HotspotElement, TableElement } from '@/types/course';
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
              {isMasterMode ? 'Master Slide Properties' : 'Slide Properties'}
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

            <AnimationsSection element={activeElement} onUpdate={update} />

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

function AnimationsSection({ element, onUpdate }: { element: SlideElement; onUpdate: (u: Partial<SlideElement>) => void }) {
  return (
    <div className="space-y-2 pt-2 border-t">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Animations</p>
      <div className="space-y-1">
        <Label className="text-xs">Entrance</Label>
        <Select value={element.animationIn ?? 'none'} onValueChange={(v) => onUpdate({ animationIn: v as AnimationIn } as any)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="fade">Fade In</SelectItem>
            <SelectItem value="fly-in-left">Fly In Left</SelectItem>
            <SelectItem value="fly-in-right">Fly In Right</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SecondsField
        label="Entrance Duration (s)"
        valueMs={element.entranceDuration ?? 500}
        onChangeMs={(v) => onUpdate({ entranceDuration: Math.max(0, v) } as any)}
        step={0.1}
      />
      <div className="space-y-1">
        <Label className="text-xs">Exit</Label>
        <Select value={element.animationOut ?? 'none'} onValueChange={(v) => onUpdate({ animationOut: v as AnimationOut } as any)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="fade">Fade Out</SelectItem>
            <SelectItem value="fly-out-left">Fly Out Left</SelectItem>
            <SelectItem value="fly-out-right">Fly Out Right</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SecondsField
        label="Exit Duration (s)"
        valueMs={element.exitDuration ?? 500}
        onChangeMs={(v) => onUpdate({ exitDuration: Math.max(0, v) } as any)}
        step={0.1}
      />
    </div>
  );
}

function TriggersSection({ element, onUpdate }: { element: SlideElement; onUpdate: (u: Partial<SlideElement>) => void }) {
  const { state } = useCourse();
  const slides = state.slides;
  const triggers = element.triggers ?? [];
  const [newEvent, setNewEvent] = useState('onClick');
  const [newAction, setNewAction] = useState('jumpToSlide');
  const [newTarget, setNewTarget] = useState('');
  const isSlideAction = newAction === 'jumpToSlide';

  const slideLabel = (id: string) => {
    const idx = slides.findIndex((s) => s.id === id);
    if (idx === -1) return id.slice(0, 8);
    return slides[idx].title || `Slide ${idx + 1}`;
  };

  const addTrigger = () => {
    if (!newTarget) return;
    const t: Trigger = { event: newEvent, action: newAction, targetId: newTarget };
    onUpdate({ triggers: [...triggers, t] } as any);
    setNewTarget('');
  };

  const removeTrigger = (idx: number) => {
    onUpdate({ triggers: triggers.filter((_, i) => i !== idx) } as any);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Triggers</p>
      {triggers.map((t, i) => (
        <div key={i} className="flex items-center gap-1 text-[10px] bg-muted rounded p-1.5">
          <span className="truncate flex-1">{t.event} → {t.action} ({t.action === 'jumpToSlide' ? slideLabel(t.targetId) : t.targetId.slice(0, 8)})</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeTrigger(i)}><X className="h-3 w-3" /></Button>
        </div>
      ))}
      <div className="space-y-1.5">
        <Select value={newEvent} onValueChange={setNewEvent}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="onClick">onClick</SelectItem>
            <SelectItem value="onHover">onHover</SelectItem>
          </SelectContent>
        </Select>
        <Select value={newAction} onValueChange={(v) => { setNewAction(v); setNewTarget(''); }}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="jumpToSlide">Jump to Slide</SelectItem>
            <SelectItem value="hideElement">Hide Element</SelectItem>
            <SelectItem value="showElement">Show Element</SelectItem>
          </SelectContent>
        </Select>
        {isSlideAction ? (
          <Select value={newTarget} onValueChange={setNewTarget}>
            <SelectTrigger className="h-7 text-xs bg-white text-slate-800 rounded-md"><SelectValue placeholder="Select slide..." /></SelectTrigger>
            <SelectContent>
              {slides.map((s, idx) => (
                <SelectItem key={s.id} value={s.id}>{s.title || `Slide ${idx + 1}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input placeholder="Target ID" value={newTarget} onChange={(e) => setNewTarget(e.target.value)} className="h-7 text-xs" />
        )}
        <Button variant="outline" size="sm" className="w-full h-7 text-xs" onClick={addTrigger}><Plus className="h-3 w-3 mr-1" />Add Trigger</Button>
      </div>
    </div>
  );
}
