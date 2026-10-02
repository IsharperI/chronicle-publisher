/**
 * The editor page layout. Wraps everything in CourseProvider (the single course
 * store) and arranges the ribbon, slide list, canvas, properties panel and
 * timeline, plus autosave. In preview mode the editor is replaced by PlayerShell.
 */
import { CourseProvider, useCourse } from '@/context/CourseContext';
import { Ribbon } from '@/components/authoring/Ribbon';
import { Canvas } from '@/components/authoring/Canvas';
import { PropertiesPanel } from '@/components/authoring/PropertiesPanel';
import { TimelinePanel } from '@/components/authoring/TimelinePanel';
import { SlidePanel } from '@/components/authoring/SlidePanel';
import { PlayerShell } from '@/components/authoring/PlayerShell';
import { AutosaveManager } from '@/components/authoring/AutosaveManager';

function AuthoringLayout() {
  const { state } = useCourse();
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Ribbon />
      <div className="flex-1 flex flex-col min-h-0">
        {state.previewMode ? (
          <PlayerShell />
        ) : (
          <>
            <div className="flex-1 flex min-h-0">
              <SlidePanel />
              <Canvas />
              <PropertiesPanel />
            </div>
            <TimelinePanel />
          </>
        )}
      </div>
    </div>
  );
}

const Index = () => (
  <CourseProvider>
    <AuthoringLayout />
    <AutosaveManager />
  </CourseProvider>
);

export default Index;
