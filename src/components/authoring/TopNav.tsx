import { Button } from '@/components/ui/button';
import { Save, Play } from 'lucide-react';

export function TopNav() {
  return (
    <div className="h-12 border-b bg-card flex items-center px-4 gap-3 shrink-0">
      <span className="font-semibold text-foreground text-sm">eLearning Authoring Tool</span>
      <div className="flex-1" />
      <Button variant="outline" size="sm"><Save className="h-4 w-4 mr-1" />Save</Button>
      <Button size="sm"><Play className="h-4 w-4 mr-1" />Preview</Button>
    </div>
  );
}
