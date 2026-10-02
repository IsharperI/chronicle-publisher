/**
 * UNUSED: not imported anywhere. An earlier top bar with Save/Load. Its save
 * only stored `slides` (losing masters, settings and variables), so don't revive
 * it as-is. The real Save/Load lives in Ribbon.tsx.
 */
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Save, Upload, Play, X } from 'lucide-react';
import { useCourse } from '@/context/CourseContext';

export function TopNav() {
  const { state, dispatch } = useCourse();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveProject = () => {
    const json = JSON.stringify({ slides: state.slides }, null, 2);
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

  return (
    <div className="h-12 border-b bg-card flex items-center px-4 gap-3 shrink-0">
      <span className="font-semibold text-foreground text-sm">Chronicle Publisher</span>
      <div className="flex-1" />
      {state.previewMode ? (
        <Button variant="destructive" size="sm" onClick={() => {
          dispatch({ type: 'SET_PREVIEW_MODE', enabled: false });
          // Defensive: ensure timeline does not auto-play after exiting preview.
          dispatch({ type: 'SET_PLAYING', playing: false });
          dispatch({ type: 'SET_PLAYHEAD', time: 0 });
        }}>
          <X className="h-4 w-4 mr-1" />Exit Preview
        </Button>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={saveProject}>
            <Save className="h-4 w-4 mr-1" />Save Project
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />Load Project
          </Button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={loadProject} />
          <Button size="sm" onClick={() => dispatch({ type: 'SET_PREVIEW_MODE', enabled: true })}>
            <Play className="h-4 w-4 mr-1" />Preview
          </Button>
        </>
      )}
    </div>
  );
}
