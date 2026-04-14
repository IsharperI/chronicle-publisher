import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Save, Upload, Play, X, Type, ImageIcon, Square, Plus, Trash2, Eye, Package } from 'lucide-react';
import { useCourse } from '@/context/CourseContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { TextElement, ImageElement, ShapeElement } from '@/types/course';
import { Separator } from '@/components/ui/separator';

const TABS = ['Home', 'Insert', 'View'] as const;
type RibbonTab = typeof TABS[number];

export function Ribbon() {
  const { state, dispatch } = useCourse();
  const [activeTab, setActiveTab] = useState<RibbonTab>('Home');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── File operations (from TopNav) ──
  const saveProject = () => {
    const json = JSON.stringify({ slides: state.slides }, null, 2);
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.slides && Array.isArray(data.slides)) {
          dispatch({ type: 'LOAD_COURSE', slides: data.slides });
        }
      } catch {
        console.error('Invalid project file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Insert operations (from Toolbox) ──
  const addText = () => {
    const el: TextElement = {
      id: crypto.randomUUID(), type: 'text',
      x: 660, y: 440, width: 600, height: 200,
      content: 'Double-click to edit', fontSize: 32, fontWeight: '400',
      textColor: '#000000', backgroundColor: 'transparent',
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
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
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
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
      </div>

      {/* Ribbon content area */}
      <div className="h-[72px] flex items-center px-4 gap-1">
        {activeTab === 'Home' && (
          <>
            {/* File group */}
            <RibbonGroup label="File">
              <RibbonButton icon={Save} label="Save" onClick={saveProject} />
              <RibbonButton icon={Upload} label="Load" onClick={() => fileInputRef.current?.click()} />
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={loadProject} />
            </RibbonGroup>

            <Separator orientation="vertical" className="h-12 mx-2" />

            {/* Slides group */}
            <RibbonGroup label="Slides">
              <RibbonButton icon={Plus} label="Add Slide" onClick={() => dispatch({ type: 'ADD_SLIDE' })} />
              <RibbonButton
                icon={Trash2}
                label="Delete Slide"
                onClick={() => dispatch({ type: 'DELETE_SLIDE', index: state.activeSlideIndex })}
                disabled={state.slides.length <= 1}
              />
            </RibbonGroup>

            <Separator orientation="vertical" className="h-12 mx-2" />

            {/* Publish group */}
            <RibbonGroup label="Publish">
              <RibbonButton icon={Play} label="Preview" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: true })} />
              <RibbonButton icon={Package} label="Export SCORM" onClick={() => {}} disabled />
            </RibbonGroup>
          </>
        )}

        {activeTab === 'Insert' && (
          <RibbonGroup label="Elements">
            <RibbonButton icon={Type} label="Text" onClick={addText} />
            <RibbonButton icon={ImageIcon} label="Image" onClick={() => imageInputRef.current?.click()} />
            <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
            <RibbonButton icon={Square} label="Shape" onClick={addShape} />
          </RibbonGroup>
        )}

        {activeTab === 'View' && (
          <RibbonGroup label="Preview">
            <RibbonButton icon={Eye} label="Preview Mode" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: true })} />
          </RibbonGroup>
        )}
      </div>

      {/* Slide thumbnails strip */}
      <div className="h-[52px] border-t bg-muted/20 flex items-center px-4 gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-2 shrink-0">Slides</span>
        <ScrollArea className="flex-1">
          <div className="flex gap-1.5 py-1">
            {state.slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => dispatch({ type: 'SET_ACTIVE_SLIDE', index: i })}
                className={cn(
                  'relative h-9 aspect-video rounded border-2 bg-background text-[9px] font-medium flex items-center justify-center transition-colors shrink-0',
                  i === state.activeSlideIndex ? 'border-primary' : 'border-border hover:border-muted-foreground/50'
                )}
              >
                <span className="text-muted-foreground">{i + 1}</span>
                {slide.elements.length > 0 && (
                  <span className="absolute bottom-0 right-0.5 text-[8px] text-muted-foreground">{slide.elements.length}</span>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
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
