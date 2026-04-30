import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Save, Upload, Play, X, Type, ImageIcon, Square, Eye, Settings, Music, Video as VideoIcon, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Ban, Sparkles, ArrowUpFromLine, ArrowLeftFromLine, ZoomIn, CopyCheck, MousePointerClick, Target, CheckSquare, ChevronDown, Table as TableIcon, HelpCircle, Trophy, Layers, FolderOpen, Map as MapIcon, Spline, Palette, Library } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MediaLibraryOverlay } from './MediaLibraryOverlay';
import { StoryViewOverlay } from './StoryViewOverlay';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PublishDialog } from './PublishDialog';
import { useCourse } from '@/context/CourseContext';
import { cn } from '@/lib/utils';
import type { TextElement, ImageElement, ShapeElement, VideoElement, SlideAudio, SlideTransitionType, HotspotElement, CheckboxElement, SlideElement, TableElement, AnimationIn, AnimationOut } from '@/types/course';
import { Separator } from '@/components/ui/separator';
import { PlayerSettingsModal } from './PlayerSettingsModal';
import { sanitizeSlides, sanitizePlayerSettings, sanitizeCourseSettings } from '@/lib/sanitize';

import { StorySizeControl, ThemeColorsControl } from './DesignControls';
import { QuizThemesOverlay, QuestionBankOverlay } from './QuizOverlays';

const TABS = ['Home', 'Insert', 'Design', 'Transitions', 'Animations', 'View', 'Quiz'] as const;
type RibbonTab = typeof TABS[number];

export function Ribbon() {
  const { state, dispatch } = useCourse();
  const [activeTab, setActiveTab] = useState<RibbonTab>('Home');
  const [alignMode, setAlignMode] = useState<'canvas' | 'selection'>('canvas');
  const [playerSettingsOpen, setPlayerSettingsOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [storyViewOpen, setStoryViewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [quizThemesOpen, setQuizThemesOpen] = useState(false);
  const [questionBankOpen, setQuestionBankOpen] = useState(false);
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
    const rawName = (state.playerSettings?.courseTitle || '').trim();
    const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    a.download = `${slug || 'course-project'}.json`;
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
      x: 0, y: 0, width: 600, height: 200,
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
        x: 0, y: 0, width: 800, height: 600,
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
      x: 0, y: 0, width: 400, height: 300,
      shapeType: 'rectangle', fillColor: '#3b82f6', borderColor: '#1e40af', borderWidth: 2,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  const centerXY = (w: number, h: number) => {
    const { width: cw, height: ch } = state.courseSettings.canvasDimensions;
    return { x: Math.round((cw - w) / 2), y: Math.round((ch - h) / 2) };
  };

  const addInteractiveButton = () => {
    const el: ShapeElement = {
      id: crypto.randomUUID(), type: 'shape',
      x: 0, y: 0, width: 200, height: 60,
      shapeType: 'rectangle',
      fillColor: '#3b82f6',
      borderColor: 'transparent',
      borderWidth: 0,
      borderRadius: 4,
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      text: 'Button',
      textColor: '#ffffff',
      fontSize: 18,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  const addHotspot = () => {
    const el: HotspotElement = {
      id: crypto.randomUUID(), type: 'hotspot',
      x: 0, y: 0, width: 240, height: 160,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el as SlideElement });
  };

  const addCheckbox = () => {
    const el: CheckboxElement = {
      id: crypto.randomUUID(), type: 'checkbox',
      x: 0, y: 0, width: 220, height: 36,
      label: 'Checkbox option',
      defaultChecked: false,
      textColor: '#ffffff',
      fontSize: 16,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el as SlideElement });
  };

  const addTable = (rows: number, cols: number) => {
    const r = Math.max(1, Math.min(20, Math.round(rows)));
    const c = Math.max(1, Math.min(20, Math.round(cols)));
    const w = Math.min(state.courseSettings.canvasDimensions.width - 40, Math.max(240, c * 120));
    const h = Math.min(state.courseSettings.canvasDimensions.height - 40, Math.max(120, r * 40));
    const cellData: string[][] = Array.from({ length: r }, () =>
      Array.from({ length: c }, () => ''),
    );
    const el: TableElement = {
      id: crypto.randomUUID(), type: 'table',
      x: 0, y: 0, width: w, height: h,
      rowCount: r, colCount: c, cellData,
      borderColor: '#94a3b8',
      textColor: '#0f172a',
      fontSize: 14,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el as SlideElement });
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

  const handleVideoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX = 15 * 1024 * 1024;
    if (file.size > MAX) {
      alert(`Video is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 15MB. Please use a smaller file or host the video externally.`);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const w = 800, h = 450;

      const MAX_SLIDE_MS = 600 * 1000; // 10 minute hard cap
      const DEFAULT_MS = 5000;

      const finalize = (mediaDurationSec: number) => {
        // Clamp media duration: must be a finite positive number, capped at 600s.
        const validSec = Number.isFinite(mediaDurationSec) && mediaDurationSec > 0 ? mediaDurationSec : 0;
        const cappedMs = validSec > 0 ? Math.min(Math.round(validSec * 1000), MAX_SLIDE_MS) : DEFAULT_MS;

        const el: VideoElement = {
          id: crypto.randomUUID(), type: 'video',
          x: 0, y: 0, width: w, height: h,
          src: base64,
          controls: true,
          autoplay: false,
          startTime: 0, duration: cappedMs, triggers: [],
          animationIn: 'none', animationOut: 'none',
          entranceDuration: 500, exitDuration: 500,
          isLocked: false, isHidden: false,
        };
        dispatch({ type: 'ADD_ELEMENT', element: el });

        // Expand the active slide's duration to fit the video, capped at 10 min.
        if (validSec > 0) {
          const activeSlide = state.slides[state.activeSlideIndex];
          const currentSlideMs = activeSlide?.duration ?? DEFAULT_MS;
          if (cappedMs > currentSlideMs) {
            dispatch({
              type: 'UPDATE_SLIDE',
              index: state.activeSlideIndex,
              updates: { duration: cappedMs },
            });
          }
        }
      };

      // Probe intrinsic duration via a temporary <video> element.
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => finalize(probe.duration);
      probe.onerror = () => finalize(0);
      probe.src = base64;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (state.previewMode) {
    return (
      <div className="h-12 glass border-b border-white/60 flex items-center px-4 shrink-0 rounded-none">
        <span className="font-semibold text-foreground text-sm">Chronicle Publisher</span>
        <div className="flex-1" />
        <Button variant="destructive" size="sm" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: false })}>
          <X className="h-4 w-4 mr-1" />Exit Preview
        </Button>
      </div>
    );
  }

  return (
    <>
    <div className="glass border-b border-white/60 shrink-0 rounded-none">
      {/* Title bar + Tab row */}
      <div className="h-9 flex items-center px-4 border-b border-white/40 bg-white/30">
        <span className="font-semibold text-foreground text-sm mr-6">Chronicle Publisher</span>
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (state.viewMode === 'master') {
                  dispatch({ type: 'SET_VIEW_MODE', mode: 'main' });
                }
              }}
              className={cn(
                'px-4 py-1.5 text-xs font-medium transition-colors border-t-2',
                activeTab === tab
                  ? 'bg-white border-blue-600 text-slate-800'
                  : 'bg-sky-100 border-transparent text-slate-600 hover:bg-sky-200'
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
      <div className="flex items-center px-4 gap-1 h-[72px]">
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
              <RibbonButton icon={Upload} label="Publish" onClick={() => setPublishOpen(true)} />
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
              <RibbonButton icon={VideoIcon} label="Video" onClick={() => videoInputRef.current?.click()} />
              <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,.mp4,.webm" className="hidden" onChange={handleVideoFile} />
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Interactive">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-11 flex flex-col items-center justify-center gap-0.5 px-3 text-foreground"
                  >
                    <MousePointerClick className="h-5 w-5" />
                    <span className="text-[10px] font-medium leading-none flex items-center gap-0.5">
                      Interactive <ChevronDown className="h-3 w-3" />
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={addInteractiveButton}>
                    <MousePointerClick className="h-4 w-4 mr-2" /> Button
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={addHotspot}>
                    <Target className="h-4 w-4 mr-2" /> Hotspot
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={addCheckbox}>
                    <CheckSquare className="h-4 w-4 mr-2" /> Checkbox
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Data">
              <TableInsertPopover onInsert={addTable} />
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
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Assets">
              <RibbonButton icon={FolderOpen} label="Media Library" onClick={() => setMediaLibraryOpen(true)} />
            </RibbonGroup>
          </>
        )}

        {activeTab === 'Transitions' && (
          <TransitionsTab />
        )}

        {activeTab === 'Animations' && (
          <AnimationsTab />
        )}

        {activeTab === 'View' && (
          <>
            <RibbonGroup label="Preview">
              <RibbonButton icon={Eye} label="Preview Mode" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: true })} />
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Slides">
              <RibbonButton
                icon={Layers}
                label="Master Slides"
                onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: state.viewMode === 'master' ? 'main' : 'master' })}
              />
              <RibbonButton
                icon={MapIcon}
                label="Course Tree"
                onClick={() => setStoryViewOpen(true)}
              />
            </RibbonGroup>
          </>
        )}

        {activeTab === 'Quiz' && (
          <>
            <RibbonGroup label="Slides">
              <RibbonButton icon={HelpCircle} label="Quiz Slide" onClick={() => dispatch({ type: 'ADD_QUIZ_SLIDE' })} />
              <RibbonButton icon={Trophy} label="Results Slide" onClick={() => dispatch({ type: 'ADD_RESULTS_SLIDE' })} />
            </RibbonGroup>
            <Separator orientation="vertical" className="h-12 mx-2" />
            <RibbonGroup label="Library">
              <RibbonButton icon={Palette} label="Quiz Themes" onClick={() => setQuizThemesOpen(true)} />
              <RibbonButton icon={Library} label="Question Bank" onClick={() => setQuestionBankOpen(true)} />
            </RibbonGroup>
          </>
        )}
      </div>

    </div>
    <MediaLibraryOverlay open={mediaLibraryOpen} onClose={() => setMediaLibraryOpen(false)} />
    <StoryViewOverlay open={storyViewOpen} onClose={() => setStoryViewOpen(false)} />
    <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
    <QuizThemesOverlay open={quizThemesOpen} onClose={() => setQuizThemesOpen(false)} />
    <QuestionBankOverlay open={questionBankOpen} onClose={() => setQuestionBankOpen(false)} />
    </>
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
  const transition = state.courseSettings.transition ?? { type: 'fade' as SlideTransitionType, duration: 1, color: '#000000' };
  const tType: SlideTransitionType = transition.type;
  const tColor = transition.color ?? '#000000';
  // Local buffered input so the user can freely type "1.5" etc. without
  // every keystroke triggering a clamp/global update.
  const [durInput, setDurInput] = useState<string>(String(transition.duration));
  // Keep local input in sync if the global value changes elsewhere.
  React.useEffect(() => { setDurInput(String(transition.duration)); }, [transition.duration]);

  const setType = (type: SlideTransitionType) => {
    dispatch({
      type: 'UPDATE_COURSE_SETTINGS',
      updates: { transition: { type, duration: transition.duration, color: tColor } },
    });
  };

  const setColor = (color: string) => {
    dispatch({
      type: 'UPDATE_COURSE_SETTINGS',
      updates: { transition: { type: tType, duration: transition.duration, color } },
    });
  };

  const commitDuration = () => {
    const parsed = parseFloat(durInput);
    const next = Number.isFinite(parsed) ? Math.max(1, Math.min(5, parsed)) : 1;
    setDurInput(String(next));
    dispatch({
      type: 'UPDATE_COURSE_SETTINGS',
      updates: { transition: { type: tType, duration: next, color: tColor } },
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
            className="h-7 w-24 rounded border bg-white px-2 text-xs text-slate-800"
          />
        </div>
      </RibbonGroup>

      <Separator orientation="vertical" className="h-12 mx-2" />

      <RibbonGroup label="Fade Color">
        <div className="flex flex-col gap-1 px-1">
          <label className="text-[10px] text-muted-foreground font-medium">Fades through</label>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={tColor}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-10 rounded border bg-white cursor-pointer p-0.5"
              aria-label="Transition fade color"
            />
            <input
              type="text"
              value={tColor}
              onChange={(e) => setColor(e.target.value)}
              className="h-7 w-20 rounded border bg-white px-2 text-xs font-mono text-slate-800"
            />
          </div>
        </div>
      </RibbonGroup>
    </>
  );
}

const ENTRANCE_OPTIONS: Array<{ value: AnimationIn; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade In' },
  { value: 'fly-in-left', label: 'Fly In Left' },
  { value: 'fly-in-right', label: 'Fly In Right' },
];

const EXIT_OPTIONS: Array<{ value: AnimationOut; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade Out' },
  { value: 'fly-out-left', label: 'Fly Out Left' },
  { value: 'fly-out-right', label: 'Fly Out Right' },
];

function AnimationsTab() {
  const { state, dispatch } = useCourse();
  const isMaster = state.viewMode === 'master';
  const slide = isMaster ? state.masterSlides[state.activeSlideIndex] : state.slides[state.activeSlideIndex];
  const element = slide?.elements.find((el) => el.id === state.activeElementId);
  const disabled = !element;

  const update = (updates: Partial<SlideElement>) => {
    if (!element) return;
    dispatch({ type: 'UPDATE_ELEMENT', id: element.id, updates });
  };

  const entranceSec = ((element?.entranceDuration ?? 500) / 1000).toFixed(1);
  const exitSec = ((element?.exitDuration ?? 500) / 1000).toFixed(1);

  return (
    <>
      <RibbonGroup label="Entrance Animation">
        <div className="flex items-end gap-2 px-1">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium">Type</label>
            <Select
              value={element?.animationIn ?? 'none'}
              onValueChange={(v) => update({ animationIn: v as AnimationIn } as Partial<SlideElement>)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 w-36 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ENTRANCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium">Duration (s)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={entranceSec}
              disabled={disabled}
              onChange={(e) => {
                const sec = Number(e.target.value);
                if (!Number.isNaN(sec)) update({ entranceDuration: Math.max(0, Math.round(sec * 1000)) } as Partial<SlideElement>);
              }}
              className="h-8 w-20 rounded border bg-white px-2 text-xs text-slate-800 disabled:opacity-50"
            />
          </div>
        </div>
      </RibbonGroup>

      <Separator orientation="vertical" className="h-12 mx-2" />

      <RibbonGroup label="Exit Animation">
        <div className="flex items-end gap-2 px-1">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium">Type</label>
            <Select
              value={element?.animationOut ?? 'none'}
              onValueChange={(v) => update({ animationOut: v as AnimationOut } as Partial<SlideElement>)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 w-36 text-xs bg-white text-slate-800"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXIT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] text-muted-foreground font-medium">Duration (s)</label>
            <input
              type="number"
              min={0}
              step={0.1}
              value={exitSec}
              disabled={disabled}
              onChange={(e) => {
                const sec = Number(e.target.value);
                if (!Number.isNaN(sec)) update({ exitDuration: Math.max(0, Math.round(sec * 1000)) } as Partial<SlideElement>);
              }}
              className="h-8 w-20 rounded border bg-white px-2 text-xs text-slate-800 disabled:opacity-50"
            />
          </div>
        </div>
      </RibbonGroup>

      <Separator orientation="vertical" className="h-12 mx-2" />

      <RibbonGroup label="Motion Path">
        <div className="flex flex-col items-start gap-1">
          <MotionPathButton element={element} disabled={disabled} />
          {element?.motionPath && (
            <MotionPathDurationControls element={element} />
          )}
        </div>
      </RibbonGroup>

      {disabled && (
        <span className="ml-3 text-[11px] text-muted-foreground italic">Select an element on the canvas to edit animations.</span>
      )}
    </>
  );
}

function MotionPathButton({ element, disabled }: { element: SlideElement | undefined; disabled: boolean }) {
  const { dispatch } = useCourse();
  const onClick = () => {
    if (!element) return;
    dispatch({ type: 'OPEN_MOTION_PATH_EDITOR', elementId: element.id });
  };
  const hasPath = !!element?.motionPath;
  const btn = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 px-3 py-1 rounded text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Spline className="h-5 w-5" />
      <span>{hasPath ? 'Edit Path' : 'Motion Path'}</span>
    </button>
  );
  if (!disabled) return btn;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
        <TooltipContent>Select an element to add a motion path.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TableInsertPopover({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const clamp = (n: number) => Math.max(1, Math.min(20, Math.round(n || 1)));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 flex flex-col items-center justify-center gap-0.5 px-3 text-foreground"
        >
          <TableIcon className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">Table</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Rows</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={rows}
            onChange={(e) => setRows(clamp(Number(e.target.value)))}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Columns</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={cols}
            onChange={(e) => setCols(clamp(Number(e.target.value)))}
            className="h-8 text-xs"
          />
        </div>
        <Button
          size="sm"
          className="w-full"
          onClick={() => { onInsert(clamp(rows), clamp(cols)); setOpen(false); }}
        >
          Insert Table
        </Button>
      </PopoverContent>
    </Popover>
  );
}
