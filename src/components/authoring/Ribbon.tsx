import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Save, Upload, Play, X, Type, ImageIcon, Square, Eye, Package, Settings, Music, Video as VideoIcon, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Ban, Sparkles, ArrowUpFromLine, ArrowLeftFromLine, ZoomIn, CopyCheck } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exportScorm } from '@/lib/exportScorm';
import { useCourse } from '@/context/CourseContext';
import { cn } from '@/lib/utils';
import type { TextElement, ImageElement, ShapeElement, VideoElement, SlideAudio, SlideTransitionType } from '@/types/course';
import { Separator } from '@/components/ui/separator';
import { PlayerSettingsModal } from './PlayerSettingsModal';
import { sanitizeSlides, sanitizePlayerSettings, sanitizeCourseSettings } from '@/lib/sanitize';

import { StorySizeControl, ThemeColorsControl } from './DesignControls';

const TABS = ['Home', 'Insert', 'Design', 'Transitions', 'View'] as const;
type RibbonTab = typeof TABS[number];

export function Ribbon() {
  const { state, dispatch } = useCourse();
  const [activeTab, setActiveTab] = useState<RibbonTab>('Home');
  const [alignMode, setAlignMode] = useState<'canvas' | 'selection'>('canvas');
  const [playerSettingsOpen, setPlayerSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const saveProject = () => {
    const json = JSON.stringify({ slides: state.slides, masterSlides: state.masterSlides, playerSettings: state.playerSettings, courseSettings: state.courseSettings }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'course-project.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reject excessively large files to mitigate DoS via huge JSON payloads.
    if (file.size > 50 * 1024 * 1024) {
      console.error('Project file too large');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data && Array.isArray(data.slides)) {
          // Sanitize all imported data: validates colors, fonts, image URIs,
          // numeric ranges, and enums to prevent CSS/HTML/JS injection when
          // these values are later embedded in the SCORM export. See
          // src/lib/sanitize.ts for details.
          const slides = sanitizeSlides(data.slides);
          const masterSlides = sanitizeSlides(data.masterSlides);
          const playerSettings = sanitizePlayerSettings(data.playerSettings);
          const courseSettings = sanitizeCourseSettings(data.courseSettings);
          dispatch({
            type: 'LOAD_COURSE',
            slides,
            masterSlides,
            playerSettings,
            courseSettings,
          });
        }
      } catch {
        console.error('Invalid project file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const addText = () => {
    const el: TextElement = {
      id: crypto.randomUUID(), type: 'text',
      x: 660, y: 440, width: 600, height: 200,
      content: 'Double-click to edit', fontSize: 32, fontWeight: '400',
      textColor: '#000000', backgroundColor: 'transparent',
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const el: ImageElement = {
        id: crypto.randomUUID(), type: 'image',
        x: 560, y: 240, width: 800, height: 600,
        src: base64, alt: file.name,
        startTime: 0, duration: 5000, triggers: [],
        animationIn: 'none', animationOut: 'none',
        entranceDuration: 500, exitDuration: 500,
      };
      dispatch({ type: 'ADD_ELEMENT', element: el });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const addShape = () => {
    const el: ShapeElement = {
      id: crypto.randomUUID(), type: 'shape',
      x: 760, y: 390, width: 400, height: 300,
      shapeType: 'rectangle', fillColor: '#3b82f6', borderColor: '#1e40af', borderWidth: 2,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  const handleAudioFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      console.error('Audio file too large (max 50MB)');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      // Probe duration via a transient Audio element.
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        const audio: SlideAudio = {
          id: crypto.randomUUID(),
          name: file.name,
          src: base64,
          duration: Number.isFinite(probe.duration) ? probe.duration : 0,
          captions: [],
        };
        dispatch({ type: 'ADD_AUDIO', audio });
      };
      probe.onerror = () => {
        const audio: SlideAudio = {
          id: crypto.randomUUID(),
          name: file.name,
          src: base64,
          duration: 0,
          captions: [],
        };
        dispatch({ type: 'ADD_AUDIO', audio });
      };
      probe.src = base64;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (state.previewMode) {
    return (
      <div className="h-12 border-b bg-card flex items-center px-4 shrink-0">
        <span className="font-semibold text-foreground text-sm">eLearning Authoring Tool</span>
        <div className="flex-1" />
        <Button variant="destructive" size="sm" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: false })}>
          <X className="h-4 w-4 mr-1" />Exit Preview
        </Button>
      </div>
    );
  }

  return (
    <div className="border-b bg-card shrink-0">
      {/* Title bar + Tab row */}
      <div className="h-9 flex items-center px-4 border-b bg-muted/30">
        <span className="font-semibold text-foreground text-sm mr-6">eLearning Authoring Tool</span>
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-1.5 text-xs font-medium transition-colors rounded-t border-b-2',
                activeTab === tab
                  ? 'border-primary text-foreground bg-card'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        {state.viewMode === 'master' && (
          <span className="ml-auto text-xs font-medium text-primary">Editing Master Slide</span>
        )}
      </div>

      {/* Ribbon content area */}
      <div className="h-[72px] flex items-center px-4 gap-1">
        {activeTab === 'Home' && (
          <>
            <RibbonGroup label="File">
              <RibbonButton icon={Save} label="Save" onClick={saveProject} />
              <RibbonButton icon={Upload} label="Load" onClick={() => fileInputRef.current?.click()} />
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={loadProject} />
            </RibbonGroup>

            <Separator orientation="vertical" className="h-12 mx-2" />

            <RibbonGroup label="Publish">
              <RibbonButton icon={Play} label="Preview" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: true })} />
              <RibbonButton icon={Package} label="Export SCORM" onClick={() => exportScorm(state)} />
            </RibbonGroup>

            <Separator orientation="vertical" className="h-12 mx-2" />

            <RibbonGroup label="Settings">
              <RibbonButton icon={Settings} label="Player" onClick={() => setPlayerSettingsOpen(true)} />
            </RibbonGroup>
          </>
        )}
        <PlayerSettingsModal open={playerSettingsOpen} onOpenChange={setPlayerSettingsOpen} />

        {activeTab === 'Insert' && (
          <>
            <RibbonGroup label="Elements">
              <RibbonButton icon={Type} label="Text" onClick={addText} />
              <RibbonButton icon={ImageIcon} label="Image" onClick={() => imageInputRef.current?.click()} />
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
              <RibbonButton icon={Square} label="Shape" onClick={addShape} />
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Media">
              <RibbonButton icon={Music} label="Audio" onClick={() => audioInputRef.current?.click()} />
              <input ref={audioInputRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" className="hidden" onChange={handleAudioFile} />
            </RibbonGroup>
          </>
        )}

        {activeTab === 'Design' && (
          <>
            <RibbonGroup label="Story Size">
              <StorySizeControl />
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Colors">
              <ThemeColorsControl />
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Arrange">
              <ArrangeControls
                mode={alignMode}
                onModeChange={setAlignMode}
                disabled={state.selectedElementIds.length === 0 || (alignMode === 'selection' && state.selectedElementIds.length < 2)}
                onAlign={(alignment) => dispatch({ type: 'ALIGN_ELEMENTS', mode: alignMode, alignment })}
                onDistribute={(axis) => dispatch({ type: 'DISTRIBUTE_ELEMENTS', axis })}
                distributeDisabled={state.selectedElementIds.length < 3}
                selectionCount={state.selectedElementIds.length}
              />
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Grid">
              <div className="flex flex-col gap-1.5 px-2 py-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.showGrid}
                    onChange={(e) => dispatch({ type: 'SET_SHOW_GRID', value: e.target.checked })}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                  Show Grid
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.snapToGrid}
                    onChange={(e) => dispatch({ type: 'SET_SNAP_TO_GRID', value: e.target.checked })}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                  Snap to Grid
                </label>
              </div>
            </RibbonGroup>
          </>
        )}

        {activeTab === 'Transitions' && (
          <TransitionsTab />
        )}

        {activeTab === 'View' && (
          <>
            <RibbonGroup label="Preview">
              <RibbonButton icon={Eye} label="Preview Mode" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: true })} />
            </RibbonGroup>
          </>
        )}
      </div>
    </div>
  );
}

function RibbonGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-1 mb-0.5">{children}</div>
      <span className="text-[9px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function RibbonButton({ icon: Icon, label, onClick, disabled }: { icon: React.ComponentType<any>; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      variant="ghost"
      className="h-11 flex flex-col items-center justify-center gap-0.5 px-3 text-foreground"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-5 w-5" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </Button>
  );
}

type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

function ArrangeControls({
  mode, onModeChange, onAlign, onDistribute, disabled, distributeDisabled, selectionCount,
}: {
  mode: 'canvas' | 'selection';
  onModeChange: (m: 'canvas' | 'selection') => void;
  onAlign: (alignment: Alignment) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
  disabled: boolean;
  distributeDisabled: boolean;
  selectionCount: number;
}) {
  const buttons: Array<{ icon: React.ComponentType<any>; label: string; alignment: Alignment }> = [
    { icon: AlignLeft, label: 'Align Left', alignment: 'left' },
    { icon: AlignCenter, label: 'Align Center', alignment: 'center' },
    { icon: AlignRight, label: 'Align Right', alignment: 'right' },
    { icon: AlignStartVertical, label: 'Align Top', alignment: 'top' },
    { icon: AlignCenterVertical, label: 'Align Middle', alignment: 'middle' },
    { icon: AlignEndVertical, label: 'Align Bottom', alignment: 'bottom' },
  ];
  return (
    <div className="flex flex-col gap-1 px-1">
      <Select value={mode} onValueChange={(v) => onModeChange(v as 'canvas' | 'selection')}>
        <SelectTrigger className="h-7 text-[11px] w-[170px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="canvas">Align to Canvas</SelectItem>
          <SelectItem value="selection">Align to Selected Objects</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-0.5">
        {buttons.map(({ icon: Icon, label, alignment }) => (
          <Button
            key={alignment}
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled}
            onClick={() => onAlign(alignment)}
            title={`${label} (${selectionCount} selected)`}
            aria-label={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
        <Separator orientation="vertical" className="h-5 mx-0.5" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={distributeDisabled}
          onClick={() => onDistribute('horizontal')}
          title={`Distribute Horizontally (${selectionCount} selected, requires 3+)`}
          aria-label="Distribute Horizontally"
        >
          <AlignHorizontalDistributeCenter className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={distributeDisabled}
          onClick={() => onDistribute('vertical')}
          title={`Distribute Vertically (${selectionCount} selected, requires 3+)`}
          aria-label="Distribute Vertically"
        >
          <AlignVerticalDistributeCenter className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const TRANSITION_OPTIONS: Array<{ type: SlideTransitionType; label: string; icon: React.ComponentType<any> }> = [
  { type: 'none',       label: 'None',      icon: Ban },
  { type: 'fade',       label: 'Fade',      icon: Sparkles },
  { type: 'push-up',    label: 'Push Up',   icon: ArrowUpFromLine },
  { type: 'push-left',  label: 'Push Left', icon: ArrowLeftFromLine },
  { type: 'zoom-in',    label: 'Zoom',      icon: ZoomIn },
];

function TransitionsTab() {
  const { state, dispatch } = useCourse();
  const transition = state.courseSettings.transition ?? { type: 'none' as SlideTransitionType, duration: 1 };
  const tType: SlideTransitionType = transition.type;
  // Local buffered input so the user can freely type "1.5" etc. without
  // every keystroke triggering a clamp/global update.
  const [durInput, setDurInput] = useState<string>(String(transition.duration));
  // Keep local input in sync if the global value changes elsewhere.
  React.useEffect(() => { setDurInput(String(transition.duration)); }, [transition.duration]);

  const setType = (type: SlideTransitionType) => {
    dispatch({
      type: 'UPDATE_COURSE_SETTINGS',
      updates: { transition: { type, duration: transition.duration } },
    });
  };

  const commitDuration = () => {
    const parsed = parseFloat(durInput);
    const next = Number.isFinite(parsed) ? Math.max(1, Math.min(5, parsed)) : 1;
    setDurInput(String(next));
    dispatch({
      type: 'UPDATE_COURSE_SETTINGS',
      updates: { transition: { type: tType, duration: next } },
    });
  };

  return (
    <>
      <RibbonGroup label="Slide Transition (Global)">
        <div className="flex items-center gap-1 px-1">
          {TRANSITION_OPTIONS.map(({ type, label, icon: Icon }) => {
            const active = tType === type;
            return (
              <Button
                key={type}
                variant="ghost"
                onClick={() => setType(type)}
                className={cn(
                  'h-12 w-16 flex flex-col items-center justify-center gap-0.5 px-1 rounded border transition-colors',
                  active
                    ? 'border-primary bg-primary/15 text-foreground ring-1 ring-primary/40'
                    : 'border-transparent text-foreground hover:bg-accent/60',
                )}
                title={label}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Button>
            );
          })}
        </div>
      </RibbonGroup>

      <Separator orientation="vertical" className="h-12 mx-2" />

      <RibbonGroup label="Timing">
        <div className="flex flex-col gap-1 px-1">
          <label className="text-[10px] text-muted-foreground font-medium">Duration (s) — 1 to 5</label>
          <input
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={durInput}
            onChange={(e) => setDurInput(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="h-7 w-24 rounded border bg-background px-2 text-xs"
          />
        </div>
      </RibbonGroup>
    </>
  );
}
