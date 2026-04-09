import { CourseProvider } from '@/context/CourseContext';
import { TopNav } from '@/components/authoring/TopNav';
import { Toolbox } from '@/components/authoring/Toolbox';
import { Canvas } from '@/components/authoring/Canvas';
import { PropertiesPanel } from '@/components/authoring/PropertiesPanel';

const Index = () => (
  <CourseProvider>
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopNav />
      <div className="flex-1 flex min-h-0">
        <Toolbox />
        <Canvas />
        <PropertiesPanel />
      </div>
    </div>
  </CourseProvider>
);

export default Index;
