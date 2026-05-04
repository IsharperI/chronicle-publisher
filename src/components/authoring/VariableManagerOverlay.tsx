import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { useCourse } from '@/context/CourseContext';
import type { CourseVariable } from '@/types/course';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

function coerceDefault(type: CourseVariable['type'], raw: string): boolean | number | string {
  if (type === 'boolean') return raw === 'true';
  if (type === 'number') {
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  }
  return raw;
}

function defaultRawFor(type: CourseVariable['type']): string {
  if (type === 'boolean') return 'false';
  if (type === 'number') return '0';
  return '';
}

export function VariableManagerOverlay({ open, onOpenChange }: Props) {
  const { state, dispatch } = useCourse();
  const variables = state.variables;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftType, setDraftType] = useState<CourseVariable['type']>('text');
  const [draftDefault, setDraftDefault] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startEdit = (v: CourseVariable) => {
    setEditingId(v.id);
    setDraftName(v.name);
    setDraftType(v.type);
    setDraftDefault(String(v.defaultValue));
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setError(null);
  };

  const saveEdit = (id: string) => {
    const name = draftName.trim();
    if (!NAME_RE.test(name)) {
      setError('Name must start with a letter/underscore and contain only letters, numbers, and underscores (no spaces).');
      return;
    }
    if (variables.some((v) => v.id !== id && v.name === name)) {
      setError('A variable with this name already exists.');
      return;
    }
    dispatch({
      type: 'UPDATE_VARIABLE',
      id,
      updates: { name, type: draftType, defaultValue: coerceDefault(draftType, draftDefault) },
    });
    setEditingId(null);
    setError(null);
  };

  const addVariable = () => {
    // Generate a unique placeholder name like newVar, newVar2, ...
    let base = 'newVar';
    let n = 1;
    let candidate = base;
    while (variables.some((v) => v.name === candidate)) {
      n += 1;
      candidate = `${base}${n}`;
    }
    const v: CourseVariable = {
      id: crypto.randomUUID(),
      name: candidate,
      type: 'text',
      defaultValue: '',
    };
    dispatch({ type: 'ADD_VARIABLE', variable: v });
    startEdit(v);
  };

  const removeVariable = (id: string) => {
    if (editingId === id) cancelEdit();
    dispatch({ type: 'DELETE_VARIABLE', id });
  };

  const renderDefaultInput = () => {
    if (draftType === 'boolean') {
      return (
        <Select value={draftDefault === 'true' ? 'true' : 'false'} onValueChange={(v) => setDraftDefault(v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if (draftType === 'number') {
      return (
        <Input
          type="number"
          step="any"
          value={draftDefault}
          onChange={(e) => setDraftDefault(e.target.value)}
          className="h-8 text-xs"
        />
      );
    }
    return (
      <Input
        type="text"
        value={draftDefault}
        onChange={(e) => setDraftDefault(e.target.value)}
        className="h-8 text-xs"
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-white text-slate-800">
        <DialogHeader>
          <DialogTitle>Variables</DialogTitle>
          <DialogDescription>
            Variables hold values that persist across slides during a learner's session. Use the
            "Adjust Variable" trigger action to read or modify them at runtime.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 w-1/3">Name</th>
                <th className="text-left px-3 py-2 w-32">Type</th>
                <th className="text-left px-3 py-2">Default Value</th>
                <th className="text-right px-3 py-2 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {variables.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                    No variables yet. Click "Add Variable" below.
                  </td>
                </tr>
              )}
              {variables.map((v) => {
                const editing = editingId === v.id;
                return (
                  <tr key={v.id} className="border-t border-slate-100 align-middle">
                    <td className="px-3 py-2">
                      {editing ? (
                        <Input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          placeholder="myVariable"
                          className="h-8 text-xs"
                        />
                      ) : (
                        <span className="font-mono text-slate-800">{v.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        <Select
                          value={draftType}
                          onValueChange={(val) => {
                            const t = val as CourseVariable['type'];
                            setDraftType(t);
                            setDraftDefault(defaultRawFor(t));
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="boolean">True/False</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="text">Text</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-slate-600">
                          {v.type === 'boolean' ? 'True/False' : v.type === 'number' ? 'Number' : 'Text'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editing ? (
                        renderDefaultInput()
                      ) : (
                        <span className="font-mono text-slate-700">
                          {v.type === 'boolean'
                            ? v.defaultValue
                              ? 'true'
                              : 'false'
                            : v.type === 'text'
                            ? `"${String(v.defaultValue)}"`
                            : String(v.defaultValue)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {editing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-600 hover:text-emerald-700"
                              onClick={() => saveEdit(v.id)}
                              aria-label="Save"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500 hover:text-slate-700"
                              onClick={cancelEdit}
                              aria-label="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500 hover:text-slate-700"
                              onClick={() => startEdit(v)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-500 hover:text-destructive"
                              onClick={() => removeVariable(v.id)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" onClick={addVariable} className="text-slate-700">
            <Plus className="h-4 w-4 mr-1" /> Add Variable
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
