/**
 * Undo / redo buttons for the ribbon's title bar, plus the keyboard
 * shortcuts: Ctrl+Z (⌘Z) to undo, Ctrl+Y or Ctrl+Shift+Z (⌘⇧Z) to redo.
 * While you're typing in a text field the browser's own text undo is left
 * alone. History itself lives in context/history.ts.
 */
import { useEffect } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { useCourse } from '@/context/CourseContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function UndoRedo() {
  const { history } = useCourse();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  const btn = (label: string, shortcut: string, enabled: boolean, onClick: () => void, Icon: typeof Undo2, what?: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={!enabled}
          aria-label={what ? `${label} ${what}` : label}
          className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-600 hover:bg-white/70 disabled:opacity-35 disabled:hover:bg-transparent"
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {enabled && what ? `${label}: ${what}` : label} ({shortcut})
      </TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5" data-testid="undo-redo">
        {btn('Undo', `${MOD}Z`, history.canUndo, history.undo, Undo2, history.undoLabel)}
        {btn('Redo', isMac ? '⌘⇧Z' : 'Ctrl+Y', history.canRedo, history.redo, Redo2, history.redoLabel)}
      </div>
    </TooltipProvider>
  );
}
