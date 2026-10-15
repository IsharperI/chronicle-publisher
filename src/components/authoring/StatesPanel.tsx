/**
 * States tab (bottom panel): the selected object's states, Storyline style.
 * Click a state to edit it on the canvas with the normal property controls
 * (look changes are stored in that state, see lib/states.ts and the
 * UPDATE_ELEMENT case in CourseContext), then Done. Also sets the initial
 * state and the button set.
 */
import { useState } from 'react';
import { EyeOff, Plus, Trash2, Check } from 'lucide-react';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DRAG_STATE_NAMES } from '@/lib/dragDrop';
import { BUILT_IN_STATES, hasState, initialStateOf, NORMAL, stateNames, withState } from '@/lib/states';
import type { SlideElement } from '@/types/course';
import { ThumbElement } from './SlidePanel';

const HINTS: Record<string, string> = {
  Normal: 'How the object normally looks',
  Hover: 'Shown while the pointer is over it',
  Down: 'Shown while it is being pressed',
  Selected: 'Clicking it switches this on and off',
  Visited: 'Shown after it has been clicked',
  Disabled: 'It ignores clicks while in this state',
  Hidden: 'It is not shown while in this state',
  'Drag Over': 'Shown while a dragged object is held over this drop target',
  Dropped: 'Shown after it is dropped on a drop target',
  'Drop Correct': 'Shown after it is dropped on its correct target',
  'Drop Incorrect': 'Shown after it is dropped on a wrong target',
};
const BUILT_IN = new Set<string>([...BUILT_IN_STATES, ...DRAG_STATE_NAMES]);

function StatePreview({ el, name, themeColors }: { el: SlideElement; name: string; themeColors: string[] }) {
  if (name === 'Hidden') {
    return <div className="flex h-full w-full items-center justify-center text-slate-400"><EyeOff className="h-5 w-5" /></div>;
  }
  const W = 104, H = 56;
  const scale = Math.min(W / el.width, H / el.height, 1);
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div style={{ width: el.width * scale, height: el.height * scale, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: el.width, height: el.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <ThumbElement el={{ ...withState(el, name), x: 0, y: 0 } as SlideElement} themeColors={themeColors} />
        </div>
      </div>
    </div>
  );
}

export function StatesPanel() {
  const { state, dispatch } = useCourse();
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState('');
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const slides = state.viewMode === 'master' ? state.masterSlides : state.slides;
  const el = slides[state.activeSlideIndex]?.elements.find((e) => e.id === state.activeElementId);

  if (!el) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">Select an object to see its states.</p>
      </div>
    );
  }

  const editing = state.editingState?.elementId === el.id ? state.editingState.state : NORMAL;
  const names = stateNames(el);
  // Drag states are offered on draggable objects (Drop…) and drop targets (Drag Over).
  const dragBuiltIns = DRAG_STATE_NAMES.filter((n) => (n === 'Drag Over' ? !!el.dropTarget : !!el.drag));
  const missingBuiltIns = [...BUILT_IN_STATES, ...dragBuiltIns].filter((n) => !hasState(el, n));
  const edit = (name: string) => dispatch({ type: 'SET_EDITING_STATE', editing: name === NORMAL ? null : { elementId: el.id, state: name } });
  const update = (updates: Partial<SlideElement>) => dispatch({ type: 'UPDATE_ELEMENT', id: el.id, updates });

  const addState = (name: string) => {
    const clean = name.trim().slice(0, 40);
    if (!clean || hasState(el, clean)) return;
    update({ states: [...(el.states ?? []), { name: clean, look: {} }] });
    setAdding(false);
    setCustomName('');
    if (clean !== 'Hidden') dispatch({ type: 'SET_EDITING_STATE', editing: { elementId: el.id, state: clean } });
  };
  const deleteState = (name: string) => {
    if (editing === name) dispatch({ type: 'SET_EDITING_STATE', editing: null });
    // Objects that were inside only this state go too.
    for (const child of slides[state.activeSlideIndex]?.elements ?? []) {
      if (child.stateParent?.id !== el.id || !child.stateParent.states.includes(name)) continue;
      const rest = child.stateParent.states.filter((n) => n !== name);
      if (rest.length) dispatch({ type: 'UPDATE_ELEMENT', id: child.id, updates: { stateParent: { id: el.id, states: rest } } });
      else dispatch({ type: 'DELETE_ELEMENT', id: child.id });
    }
    update({
      states: (el.states ?? []).filter((s) => s.name !== name),
      ...(el.initialState === name ? { initialState: undefined } : {}),
    });
  };
  const finishRename = () => {
    if (renaming) {
      const to = renaming.to.trim().slice(0, 40);
      if (to && !hasState(el, to)) dispatch({ type: 'RENAME_STATE', elementId: el.id, from: renaming.from, to });
    }
    setRenaming(null);
  };

  return (
    <div className="flex h-full gap-3 p-2">
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {names.map((name) => {
          const active = editing === name;
          const custom = !BUILT_IN.has(name);
          return (
            <div
              key={name}
              role="button"
              tabIndex={0}
              title={HINTS[name] ?? 'A custom state, set with a "Change state" trigger'}
              onClick={() => name !== 'Hidden' && edit(name)}
              onKeyDown={(e) => { if (e.key === 'Enter' && name !== 'Hidden') edit(name); }}
              className={cn(
                'group relative flex w-[120px] shrink-0 cursor-pointer flex-col rounded-md border bg-white p-1.5 text-left',
                active ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-400',
                name === 'Hidden' && 'cursor-default',
              )}
            >
              <div className="h-[60px] rounded bg-slate-50">
                <StatePreview el={el} name={name} themeColors={state.courseSettings.themeColors} />
              </div>
              <div className="mt-1 flex items-center gap-1">
                {renaming?.from === name ? (
                  <Input
                    autoFocus
                    value={renaming.to}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenaming({ from: name, to: e.target.value })}
                    onBlur={finishRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') finishRename(); if (e.key === 'Escape') setRenaming(null); }}
                    className="h-6 px-1 text-xs"
                    aria-label="State name"
                  />
                ) : (
                  <span
                    className="flex-1 truncate text-xs font-medium text-slate-700"
                    onDoubleClick={(e) => { if (custom) { e.stopPropagation(); setRenaming({ from: name, to: name }); } }}
                  >
                    {name}
                    {initialStateOf(el) === name && <span className="ml-1 text-[10px] font-normal text-slate-400">(start)</span>}
                  </span>
                )}
                {active && name !== NORMAL && <Check className="h-3 w-3 shrink-0 text-blue-600" aria-label="Editing" />}
                {name !== NORMAL && (
                  <button
                    type="button"
                    aria-label={`Delete ${name} state`}
                    className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); deleteState(name); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <div className="flex w-[130px] shrink-0 flex-col justify-center gap-1.5 rounded-md border border-dashed border-slate-300 p-1.5">
          {adding ? (
            <>
              <Select onValueChange={addState}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Built-in state" /></SelectTrigger>
                <SelectContent>
                  {missingBuiltIns.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addState(customName); if (e.key === 'Escape') setAdding(false); }}
                placeholder="or a custom name"
                className="h-7 text-xs"
              />
              <Button size="sm" variant="outline" className="h-6 text-xs" disabled={!customName.trim()} onClick={() => addState(customName)}>Add</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-full text-xs" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />New state
            </Button>
          )}
        </div>
      </div>

      <div className="w-[190px] shrink-0 space-y-2 border-l pl-3">
        {editing !== NORMAL ? (
          <div className="space-y-1.5 rounded-md bg-amber-50 p-2">
            <p className="text-xs text-amber-900">Editing <b>{editing}</b>. Changes to colours, text and images go into this state.</p>
            <Button size="sm" className="h-6 w-full text-xs" onClick={() => edit(NORMAL)}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Initial state</Label>
              <Select value={initialStateOf(el)} onValueChange={(v) => update({ initialState: v === NORMAL ? undefined : v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {names.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs" title="Objects in the same button set act like radio buttons: selecting one clears the others">Button set</Label>
              <Input
                value={el.buttonSet ?? ''}
                onChange={(e) => update({ buttonSet: e.target.value.slice(0, 40) || undefined })}
                placeholder="None"
                className="h-7 text-xs"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
