import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TemplatesGallery } from './QuizTemplatesTab';
import { QuestionBankPanel } from './QuestionBankPanel';

type Section = 'templates' | 'bank';

export function QuizTemplatesTab() {
  const [section, setSection] = useState<Section>('templates');

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-1 shrink-0">
        <SubTab label="Template Gallery" active={section === 'templates'} onClick={() => setSection('templates')} />
        <SubTab label="Question Bank" active={section === 'bank'} onClick={() => setSection('bank')} />
      </div>
      <div className="flex-1 min-h-0">
        {section === 'templates' ? <TemplatesGallery /> : <QuestionBankPanel />}
      </div>
    </div>
  );
}

function SubTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1 text-[11px] font-semibold rounded-t border-b-2 transition-colors',
        active
          ? 'border-primary text-foreground bg-white/70'
          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/40',
      )}
    >
      {label}
    </button>
  );
}
