import { CourseProvider, useCourse } from '@/context/CourseContext';
import { TopNav } from '@/components/authoring/TopNav';
import { Toolbox } from '@/components/authoring/Toolbox';
import { Canvas } from '@/components/authoring/Canvas';
import { PropertiesPanel } from '@/components/authoring/PropertiesPanel';

function AuthoringLayout() {
  const { state } = useCourse();
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopNav />
      <div className="flex-1 flex min-h-0">
        {!state.previewMode && <Toolbox />}
        <Canvas />
        {!state.previewMode && <PropertiesPanel />}
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
