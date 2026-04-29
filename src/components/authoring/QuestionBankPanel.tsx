import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourse } from '@/context/CourseContext';
import { questionTypeLabel } from '@/lib/quizTemplates';
import { loadBank, saveBank, type BankQuestion } from '@/lib/questionBank';
import type {
  QuizQuestionType,
  QuizChoice,
  QuizMatchPair,
  QuizSortItem,
} from '@/types/course';

const ALL_TYPES: QuizQuestionType[] = ['multiple-choice', 'dnd-matching', 'dnd-sorting'];

export function QuestionBankPanel() {
  const { state, dispatch } = useCourse();
  const [items, setItems] = useState<BankQuestion[]>(() => loadBank());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [tagFilter, setTagFilter] = useState<string>('__all__');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((q) => q.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (tagFilter === '__all__') return items;
    return items.filter((q) => q.tags.includes(tagFilter));
  }, [items, tagFilter]);

  const persist = (next: BankQuestion[]) => {
    setItems(next);
    saveBank(next);
  };

  const activeSlide = state.slides[state.activeSlideIndex];
  const isQuizSelected = activeSlide?.slideType === 'quiz' && !!activeSlide.quiz;
  const selectedQType = isQuizSelected ? activeSlide.quiz!.questionType : null;

  const handleSave = (q: BankQuestion) => {
    const idx = items.findIndex((i) => i.id === q.id);
    if (idx >= 0) {
      const next = items.slice();
      next[idx] = q;
      persist(next);
    } else {
      persist([...items, q]);
    }
    setEditorOpen(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    persist(items.filter((q) => q.id !== id));
  };

  const handleInsert = (q: BankQuestion) => {
    if (!isQuizSelected || q.questionType !== selectedQType) return;
    dispatch({
      type: 'UPDATE_QUIZ',
      index: state.activeSlideIndex,
      updates: {
        questionType: q.questionType,
        question: q.question,
        choices: q.choices ? q.choices.map((c) => ({ ...c })) : undefined,
        singleSelect: q.singleSelect,
        pairs: q.pairs ? q.pairs.map((p) => ({ ...p })) : undefined,
        sortItems: q.sortItems ? q.sortItems.map((s) => ({ ...s })) : undefined,
      },
    });
  };

  return (
    <div className="flex flex-col gap-2 w-full overflow-hidden">
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setEditing(null); setEditorOpen(true); }}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" /> Add Question
        </Button>
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] text-muted-foreground">Filter by tag</Label>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="h-7 text-xs w-40 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!isQuizSelected && (
          <span className="text-[10px] text-muted-foreground italic ml-2">
            Select a quiz slide to enable "Insert into Slide".
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto max-h-40 border rounded bg-white/40">
        {filtered.length === 0 ? (
          <div className="p-3 text-[11px] text-muted-foreground italic">
            {items.length === 0
              ? 'No questions yet. Click "Add Question" to create one.'
              : 'No questions match the selected tag.'}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((q) => {
              const compatible = isQuizSelected && q.questionType === selectedQType;
              return (
                <li key={q.id} className="px-2 py-1.5 flex items-center gap-2 hover:bg-accent/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold whitespace-nowrap">
                        {questionTypeLabel(q.questionType)}
                      </span>
                      <span className="text-xs truncate text-foreground">{q.question || '(untitled)'}</span>
                    </div>
                    {q.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {q.tags.map((t) => (
                          <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {compatible && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleInsert(q)}
                        className="h-6 text-[10px] px-2"
                        title="Insert this question into the selected quiz slide"
                      >
                        <ArrowRight className="h-3 w-3 mr-1" /> Insert into Slide
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => { setEditing(q); setEditorOpen(true); }}
                      className="h-6 w-6"
                      title="Edit question"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(q.id)}
                      className="h-6 w-6 text-destructive"
                      title="Delete question"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {editorOpen && (
        <QuestionEditorDialog
          open={editorOpen}
          onOpenChange={(v) => { setEditorOpen(v); if (!v) setEditing(null); }}
          initial={editing}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor dialog
// ---------------------------------------------------------------------------

function QuestionEditorDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: BankQuestion | null;
  onSave: (q: BankQuestion) => void;
}) {
  const [draft, setDraft] = useState<BankQuestion>(() =>
    initial ?? {
      id: crypto.randomUUID(),
      questionType: 'multiple-choice',
      question: '',
      choices: [
        { id: crypto.randomUUID(), text: 'Option 1', correct: true },
        { id: crypto.randomUUID(), text: 'Option 2', correct: false },
      ],
      singleSelect: true,
      tags: [],
      createdAt: Date.now(),
    },
  );
  const [tagInput, setTagInput] = useState('');

  const set = <K extends keyof BankQuestion>(key: K, value: BankQuestion[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setType = (qt: QuizQuestionType) => {
    setDraft((d) => {
      const next: BankQuestion = { ...d, questionType: qt };
      if (qt === 'multiple-choice' && !next.choices) {
        next.choices = [
          { id: crypto.randomUUID(), text: 'Option 1', correct: true },
          { id: crypto.randomUUID(), text: 'Option 2', correct: false },
        ];
        next.singleSelect = true;
      }
      if (qt === 'dnd-matching' && !next.pairs) {
        next.pairs = [
          { id: crypto.randomUUID(), left: 'Item A', right: 'Match A' },
          { id: crypto.randomUUID(), left: 'Item B', right: 'Match B' },
        ];
      }
      if (qt === 'dnd-sorting' && !next.sortItems) {
        next.sortItems = [
          { id: crypto.randomUUID(), text: 'First' },
          { id: crypto.randomUUID(), text: 'Second' },
          { id: crypto.randomUUID(), text: 'Third' },
        ];
      }
      return next;
    });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (draft.tags.includes(t)) { setTagInput(''); return; }
    set('tags', [...draft.tags, t]);
    setTagInput('');
  };

  const removeTag = (t: string) => set('tags', draft.tags.filter((x) => x !== t));

  const canSave = draft.question.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSave(draft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Question' : 'Add Question'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Question type</Label>
            <Select value={draft.questionType} onValueChange={(v) => setType(v as QuizQuestionType)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{questionTypeLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Question text</Label>
            <Textarea
              value={draft.question}
              onChange={(e) => set('question', e.target.value)}
              placeholder="What is the answer?"
              className="text-sm min-h-[60px]"
            />
          </div>

          {draft.questionType === 'multiple-choice' && (
            <MultipleChoiceEditor
              choices={draft.choices ?? []}
              singleSelect={draft.singleSelect !== false}
              onChange={(choices, singleSelect) => setDraft((d) => ({ ...d, choices, singleSelect }))}
            />
          )}
          {draft.questionType === 'dnd-matching' && (
            <MatchingEditor
              pairs={draft.pairs ?? []}
              onChange={(pairs) => set('pairs', pairs)}
            />
          )}
          {draft.questionType === 'dnd-sorting' && (
            <OrderingEditor
              items={draft.sortItems ?? []}
              onChange={(sortItems) => set('sortItems', sortItems)}
            />
          )}

          <div className="space-y-1">
            <Label className="text-xs">Tags</Label>
            <div className="flex items-center gap-1.5">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addTag(); }
                }}
                placeholder="Add tag and press Enter"
                className="h-8 text-xs"
              />
              <Button size="sm" variant="outline" onClick={addTag} className="h-8 text-xs">Add</Button>
            </div>
            {draft.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {draft.tags.map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1">
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="hover:text-destructive"
                      aria-label={`Remove tag ${t}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!canSave}>Save Question</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Per-type sub-editors
// ---------------------------------------------------------------------------

function MultipleChoiceEditor({
  choices,
  singleSelect,
  onChange,
}: {
  choices: QuizChoice[];
  singleSelect: boolean;
  onChange: (choices: QuizChoice[], singleSelect: boolean) => void;
}) {
  const setChoice = (id: string, patch: Partial<QuizChoice>) =>
    onChange(choices.map((c) => (c.id === id ? { ...c, ...patch } : c)), singleSelect);

  const toggleCorrect = (id: string) => {
    if (singleSelect) {
      onChange(choices.map((c) => ({ ...c, correct: c.id === id })), singleSelect);
    } else {
      onChange(choices.map((c) => (c.id === id ? { ...c, correct: !c.correct } : c)), singleSelect);
    }
  };

  const addChoice = () =>
    onChange([...choices, { id: crypto.randomUUID(), text: `Option ${choices.length + 1}`, correct: false }], singleSelect);

  const removeChoice = (id: string) =>
    onChange(choices.filter((c) => c.id !== id), singleSelect);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Answer options</Label>
        <label className="flex items-center gap-1 text-[11px] cursor-pointer">
          <input
            type="checkbox"
            checked={singleSelect}
            onChange={(e) => onChange(choices, e.target.checked)}
          />
          Single answer (radio)
        </label>
      </div>
      {choices.map((c) => (
        <div key={c.id} className="flex items-center gap-1.5">
          <input
            type={singleSelect ? 'radio' : 'checkbox'}
            checked={c.correct}
            onChange={() => toggleCorrect(c.id)}
            title="Mark as correct"
          />
          <Input
            value={c.text}
            onChange={(e) => setChoice(c.id, { text: e.target.value })}
            className="h-7 text-xs flex-1"
          />
          <Button size="icon" variant="ghost" onClick={() => removeChoice(c.id)} className="h-6 w-6 text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={addChoice} className="h-7 text-xs">
        <Plus className="h-3 w-3 mr-1" /> Add option
      </Button>
    </div>
  );
}

function MatchingEditor({
  pairs,
  onChange,
}: {
  pairs: QuizMatchPair[];
  onChange: (pairs: QuizMatchPair[]) => void;
}) {
  const setPair = (id: string, patch: Partial<QuizMatchPair>) =>
    onChange(pairs.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => onChange([...pairs, { id: crypto.randomUUID(), left: '', right: '' }]);
  const remove = (id: string) => onChange(pairs.filter((p) => p.id !== id));

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Matching pairs (left ↔ correct match on right)</Label>
      {pairs.map((p) => (
        <div key={p.id} className="flex items-center gap-1.5">
          <Input value={p.left} onChange={(e) => setPair(p.id, { left: e.target.value })} placeholder="Left" className="h-7 text-xs flex-1" />
          <span className="text-muted-foreground text-xs">→</span>
          <Input value={p.right} onChange={(e) => setPair(p.id, { right: e.target.value })} placeholder="Right" className="h-7 text-xs flex-1" />
          <Button size="icon" variant="ghost" onClick={() => remove(p.id)} className="h-6 w-6 text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="h-7 text-xs">
        <Plus className="h-3 w-3 mr-1" /> Add pair
      </Button>
    </div>
  );
}

function OrderingEditor({
  items,
  onChange,
}: {
  items: QuizSortItem[];
  onChange: (items: QuizSortItem[]) => void;
}) {
  const setItem = (id: string, text: string) => onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  const add = () => onChange([...items, { id: crypto.randomUUID(), text: '' }]);
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const swap = idx + dir;
    if (swap < 0 || swap >= items.length) return;
    const next = items.slice();
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Items in correct order (top = first)</Label>
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground w-5">{i + 1}.</span>
          <Input value={it.text} onChange={(e) => setItem(it.id, e.target.value)} className="h-7 text-xs flex-1" />
          <Button size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} className="h-6 w-6">↑</Button>
          <Button size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="h-6 w-6">↓</Button>
          <Button size="icon" variant="ghost" onClick={() => remove(it.id)} className="h-6 w-6 text-destructive">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} className="h-7 text-xs">
        <Plus className="h-3 w-3 mr-1" /> Add item
      </Button>
    </div>
  );
}

// Silence unused-cn warning if linter strict.
void cn;
