/**
 * Full-screen overlays for the Quiz tab's library: quiz themes
 * (QuizTemplatesTab) and the question bank (QuestionBankPanel).
 */
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TemplatesGallery } from './QuizTemplatesTab';
import { QuestionBankPanel } from './QuestionBankPanel';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
}

function OverlayShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="h-14 border-b border-border flex items-center px-6 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={`Close ${title}`}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-6">
        {children}
      </div>
    </div>
  );
}

export function QuizThemesOverlay({ open, onClose }: OverlayProps) {
  if (!open) return null;
  return (
    <OverlayShell title="Quiz Themes" onClose={onClose}>
      <TemplatesGallery />
    </OverlayShell>
  );
}

export function QuestionBankOverlay({ open, onClose }: OverlayProps) {
  if (!open) return null;
  return (
    <OverlayShell title="Question Bank" onClose={onClose}>
      <QuestionBankPanel />
    </OverlayShell>
  );
}
