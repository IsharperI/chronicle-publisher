import { CourseProvider, useCourse } from '@/context/CourseContext';
import { Ribbon } from '@/components/authoring/Ribbon';
import { Canvas } from '@/components/authoring/Canvas';
import { PropertiesPanel } from '@/components/authoring/PropertiesPanel';
import { TimelinePanel } from '@/components/authoring/TimelinePanel';

function AuthoringLayout() {
  const { state } = useCourse();
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <Ribbon />
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex min-h-0">
          <Canvas />
          {!state.previewMode && <PropertiesPanel />}
        </div>
        {!state.previewMode && <TimelinePanel />}
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
