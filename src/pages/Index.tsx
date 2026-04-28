import { CourseProvider, useCourse } from '@/context/CourseContext';
import { Ribbon } from '@/components/authoring/Ribbon';
import { Canvas } from '@/components/authoring/Canvas';
import { PropertiesPanel } from '@/components/authoring/PropertiesPanel';
import { TimelinePanel } from '@/components/authoring/TimelinePanel';
import { SlidePanel } from '@/components/authoring/SlidePanel';
import { PlayerShell } from '@/components/authoring/PlayerShell';

function AuthoringLayout() {
  const { state } = useCourse();
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
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
  </CourseProvider>
);

export default Index;
