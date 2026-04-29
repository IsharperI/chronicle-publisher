import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCourse } from '@/context/CourseContext';
import {
  loadTemplates,
  saveTemplates,
  resolveQuizStyle,
  questionTypeLabel,
  type QuizTemplate,
  type ResolvedQuizStyle,
  DEFAULT_QUIZ_STYLE,
} from '@/lib/quizTemplates';
import type { QuizQuestionType, QuizStyleOverrides } from '@/types/course';

const TYPES: QuizQuestionType[] = ['multiple-choice', 'dnd-matching', 'dnd-sorting'];

export function TemplatesGallery() {
  const { state, dispatch } = useCourse();
  const [templates, setTemplates] = useState<QuizTemplate[]>(() => loadTemplates());
  const [editorOpen, setEditorOpen] = useState(false);

  const activeSlide = state.slides[state.activeSlideIndex];
  const isQuizSelected = activeSlide?.slideType === 'quiz' && !!activeSlide.quiz;
  const selectedQType = isQuizSelected ? activeSlide.quiz!.questionType : null;

  const persist = (next: QuizTemplate[]) => {
    setTemplates(next);
    saveTemplates(next);
  };

  const handleSave = (tpl: QuizTemplate) => {
    persist([...templates, tpl]);
    setEditorOpen(false);
  };

  const handleDelete = (id: string) => {
    persist(templates.filter((t) => t.id !== id));
  };

  const handleApply = (tpl: QuizTemplate) => {
    if (!isQuizSelected || tpl.questionType !== selectedQType) return;
    dispatch({
      type: 'UPDATE_SLIDE',
      index: state.activeSlideIndex,
      updates: { quizStyle: { ...tpl.style } },
    });
  };

  return (
    <div className="flex items-start gap-4 w-full overflow-x-auto">
      <div className="flex flex-col items-center shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditorOpen(true)}
          disabled={!isQuizSelected}
          title={isQuizSelected ? 'Create a new template from the current quiz slide' : 'Select a quiz slide first'}
          className="h-12 w-12 p-0 flex flex-col items-center justify-center"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <span className="text-[10px] mt-1 font-medium text-muted-foreground">New Theme</span>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        {!isQuizSelected && (
          <span className="text-[11px] text-muted-foreground italic">
            Select a quiz slide in the filmstrip to apply a template.
          </span>
        )}
        <div className="flex flex-col gap-2">
          {TYPES.map((qt) => {
            const group = templates.filter((t) => t.questionType === qt);
            if (group.length === 0) return null;
            return (
              <div key={qt} className="flex items-center gap-2">
                <div className="flex gap-2 overflow-x-auto">
                  {group.map((tpl) => {
                    const applicable = isQuizSelected && tpl.questionType === selectedQType;
                    return (
                      <TemplateCard
                        key={tpl.id}
                        tpl={tpl}
                        applicable={applicable}
                        onApply={() => handleApply(tpl)}
                        onDelete={() => handleDelete(tpl.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
          {templates.length === 0 && (
            <span className="text-[11px] text-muted-foreground">
              No saved themes yet. Click <strong>New Theme</strong> to create one from the selected quiz slide.
            </span>
          )}
        </div>
      </div>

      {editorOpen && isQuizSelected && (
        <TemplateEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          questionType={selectedQType!}
          initialStyle={activeSlide.quizStyle ?? {}}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function TemplateCard({
  tpl,
  applicable,
  onApply,
  onDelete,
}: {
  tpl: QuizTemplate;
  applicable: boolean;
  onApply: () => void;
  onDelete: () => void;
}) {
  const ts = resolveQuizStyle(tpl.style);
  return (
    <div
      className={cn(
        'relative w-32 shrink-0 rounded-md border bg-card overflow-hidden',
        applicable ? 'cursor-pointer hover:border-primary' : 'opacity-50 cursor-not-allowed',
      )}
      onClick={applicable ? onApply : undefined}
      title={applicable ? `Apply "${tpl.name}"` : `Only applicable to ${questionTypeLabel(tpl.questionType)} slides`}
    >
      <Thumbnail ts={ts} />
      <div className="p-1.5 border-t">
        <div className="text-[11px] font-medium truncate text-foreground">{tpl.name}</div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-white/80 hover:bg-destructive hover:text-white flex items-center justify-center text-muted-foreground"
        title="Delete template"
        aria-label="Delete template"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function Thumbnail({ ts }: { ts: ResolvedQuizStyle }) {
  return (
    <div
      style={{
        height: 64,
        background: ts.pageBackgroundColor === 'transparent' ? '#f1f5f9' : ts.pageBackgroundColor,
        padding: 6,
      }}
    >
      <div
        style={{
          background: ts.cardBackgroundColor,
          color: ts.textColor,
          borderRadius: Math.min(ts.cardRadius, 6),
          padding: 4,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontFamily: ts.fontFamily,
        }}
      >
        <div style={{ fontSize: 7, fontWeight: 700 }}>Question?</div>
        <div style={{
          background: ts.optionBackgroundColor,
          border: `1px solid ${ts.optionBorderColor}`,
          borderRadius: Math.min(ts.optionRadius, 4),
          height: 6,
        }} />
        <div style={{
          background: ts.optionSelectedBackgroundColor,
          border: `1px solid ${ts.optionSelectedBorderColor}`,
          borderRadius: Math.min(ts.optionRadius, 4),
          height: 6,
        }} />
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            background: ts.buttonColor,
            color: ts.buttonTextColor,
            fontSize: 5,
            padding: '1px 4px',
            borderRadius: 3,
            fontWeight: 600,
          }}>OK</div>
        </div>
      </div>
    </div>
  );
}

function TemplateEditorDialog({
  open,
  onOpenChange,
  questionType,
  initialStyle,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  questionType: QuizQuestionType;
  initialStyle: QuizStyleOverrides;
  onSave: (tpl: QuizTemplate) => void;
}) {
  const [name, setName] = useState('');
  const [style, setStyle] = useState<QuizStyleOverrides>(() => ({ ...DEFAULT_QUIZ_STYLE, ...initialStyle }));

  useEffect(() => {
    if (open) {
      setName('');
      setStyle({ ...DEFAULT_QUIZ_STYLE, ...initialStyle });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ts = useMemo(() => resolveQuizStyle(style), [style]);

  const set = (patch: Partial<QuizStyleOverrides>) => setStyle((s) => ({ ...s, ...patch }));

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      id: crypto.randomUUID(),
      name: trimmed,
      questionType,
      style: { ...style },
      createdAt: Date.now(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Quiz Template — {questionTypeLabel(questionType)}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <FieldGroup label="Page background">
              <ColorField value={style.pageBackgroundColor ?? '#ffffff'} onChange={(v) => set({ pageBackgroundColor: v })} />
            </FieldGroup>
            <FieldGroup label="Card background">
              <ColorField value={style.cardBackgroundColor ?? '#ffffff'} onChange={(v) => set({ cardBackgroundColor: v })} />
            </FieldGroup>
            <FieldGroup label="Text color">
              <ColorField value={style.textColor ?? '#0f172a'} onChange={(v) => set({ textColor: v })} />
            </FieldGroup>
            <FieldGroup label="Font family">
              <Input value={style.fontFamily ?? 'inherit'} onChange={(e) => set({ fontFamily: e.target.value })} className="h-8 text-xs" />
            </FieldGroup>
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Question font size">
                <Input type="number" min={12} max={64} value={style.questionFontSize ?? 28} onChange={(e) => set({ questionFontSize: Number(e.target.value) || 28 })} className="h-8 text-xs" />
              </FieldGroup>
              <FieldGroup label="Option font size">
                <Input type="number" min={10} max={32} value={style.optionFontSize ?? 16} onChange={(e) => set({ optionFontSize: Number(e.target.value) || 16 })} className="h-8 text-xs" />
              </FieldGroup>
            </div>
            <FieldGroup label="Option background">
              <ColorField value={style.optionBackgroundColor ?? '#ffffff'} onChange={(v) => set({ optionBackgroundColor: v })} />
            </FieldGroup>
            <FieldGroup label="Option border">
              <ColorField value={style.optionBorderColor ?? '#e2e8f0'} onChange={(v) => set({ optionBorderColor: v })} />
            </FieldGroup>
            <FieldGroup label="Selected option background">
              <ColorField value={style.optionSelectedBackgroundColor ?? '#eff6ff'} onChange={(v) => set({ optionSelectedBackgroundColor: v })} />
            </FieldGroup>
            <FieldGroup label="Selected option border">
              <ColorField value={style.optionSelectedBorderColor ?? '#3b82f6'} onChange={(v) => set({ optionSelectedBorderColor: v })} />
            </FieldGroup>
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Button color">
                <ColorField value={style.buttonColor ?? '#3b82f6'} onChange={(v) => set({ buttonColor: v })} />
              </FieldGroup>
              <FieldGroup label="Button text">
                <ColorField value={style.buttonTextColor ?? '#ffffff'} onChange={(v) => set({ buttonTextColor: v })} />
              </FieldGroup>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FieldGroup label="Card radius">
                <Input type="number" min={0} max={32} value={style.cardRadius ?? 12} onChange={(e) => set({ cardRadius: Number(e.target.value) || 0 })} className="h-8 text-xs" />
              </FieldGroup>
              <FieldGroup label="Option radius">
                <Input type="number" min={0} max={32} value={style.optionRadius ?? 8} onChange={(e) => set({ optionRadius: Number(e.target.value) || 0 })} className="h-8 text-xs" />
              </FieldGroup>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Live Preview</Label>
            <div
              style={{
                background: ts.pageBackgroundColor === 'transparent' ? '#e2e8f0' : ts.pageBackgroundColor,
                padding: 16,
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  background: ts.cardBackgroundColor,
                  color: ts.textColor,
                  fontFamily: ts.fontFamily,
                  borderRadius: ts.cardRadius,
                  padding: 16,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
              >
                <div style={{ fontSize: ts.questionFontSize / 1.5, fontWeight: 700, marginBottom: 12 }}>Sample question?</div>
                {['Option A', 'Option B (selected)', 'Option C'].map((label, i) => {
                  const sel = i === 1;
                  return (
                    <div
                      key={label}
                      style={{
                        padding: '8px 12px',
                        marginBottom: 6,
                        border: `2px solid ${sel ? ts.optionSelectedBorderColor : ts.optionBorderColor}`,
                        background: sel ? ts.optionSelectedBackgroundColor : ts.optionBackgroundColor,
                        borderRadius: ts.optionRadius,
                        fontSize: ts.optionFontSize,
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <div style={{
                    background: ts.buttonColor,
                    color: ts.buttonTextColor,
                    padding: '6px 16px',
                    borderRadius: 6,
                    fontWeight: 600,
                    fontSize: 13,
                  }}>Submit</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full pt-2 border-t">
          <Label className="text-xs shrink-0">Template name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dark Modern"
            className="h-8 text-xs"
          />
          <Button size="sm" onClick={handleSave} disabled={!name.trim()}>
            <Check className="h-4 w-4 mr-1" /> Save Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-10 rounded border bg-white cursor-pointer p-0.5"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs font-mono"
      />
    </div>
  );
}
