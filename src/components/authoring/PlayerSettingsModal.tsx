import { useCourse } from '@/context/CourseContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { NavigationMode, PlayerSettings } from '@/types/course';

const FONT_OPTIONS = [
  { value: 'system-ui, sans-serif', label: 'System Default' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
];

export function PlayerSettingsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { state, dispatch } = useCourse();
  const ps = state.playerSettings;

  const update = (patch: Partial<PlayerSettings>) => {
    dispatch({ type: 'UPDATE_PLAYER_SETTINGS', updates: patch });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">Player Settings</DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Left — Live Preview */}
          <div className="flex-1 flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-4 min-h-[400px]">
            <div
              className="w-full max-w-md aspect-video rounded-lg shadow-lg flex flex-col overflow-hidden"
              style={{ backgroundColor: ps.backgroundColor, fontFamily: ps.fontFamily }}
            >
              {/* Faux stage */}
              <div className="flex-1 flex items-center justify-center">
                <div className="w-[70%] aspect-video bg-white rounded shadow-sm flex items-center justify-center">
                  <span className="text-muted-foreground text-xs">Slide Content Area</span>
                </div>
              </div>

              {/* Controls bar */}
              <div className="p-3 flex items-center justify-center gap-3">
                {ps.showMenu && (
                  <select
                    className="text-xs px-2 py-1.5 rounded border bg-white/10 text-white/80"
                    style={{ borderRadius: ps.buttonBorderRadius, fontFamily: ps.fontFamily }}
                    defaultValue="0"
                  >
                    {state.slides.map((_, i) => (
                      <option key={i} value={i}>Slide {i + 1}</option>
                    ))}
                  </select>
                )}
                <button
                  className="text-xs font-medium px-4 py-1.5 text-white border-none"
                  style={{
                    backgroundColor: ps.buttonColor,
                    borderRadius: ps.buttonBorderRadius,
                    fontFamily: ps.fontFamily,
                  }}
                >
                  ◀ Prev
                </button>
                <span className="text-xs text-white/60">1 / {state.slides.length}</span>
                <button
                  className="text-xs font-medium px-4 py-1.5 text-white border-none"
                  style={{
                    backgroundColor: ps.buttonColor,
                    borderRadius: ps.buttonBorderRadius,
                    fontFamily: ps.fontFamily,
                  }}
                >
                  Next ▶
                </button>
              </div>
            </div>
          </div>

          {/* Right — Controls */}
          <div className="w-[260px] shrink-0 overflow-y-auto space-y-5 pr-1">
            <ColorControl label="Background Color" value={ps.backgroundColor} onChange={(v) => update({ backgroundColor: v })} />
            <ColorControl label="Button Color" value={ps.buttonColor} onChange={(v) => update({ buttonColor: v })} />

            <div className="space-y-1.5">
              <Label className="text-xs">Button Corner Radius</Label>
              <Slider
                min={0} max={24} step={1}
                value={[ps.buttonBorderRadius]}
                onValueChange={([v]) => update({ buttonBorderRadius: v })}
              />
              <span className="text-[10px] text-muted-foreground">{ps.buttonBorderRadius}px</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Font Family</Label>
              <Select value={ps.fontFamily} onValueChange={(v) => update({ fontFamily: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FONT_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Show Slide Menu</Label>
              <Switch checked={ps.showMenu} onCheckedChange={(v) => update({ showMenu: v })} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Navigation Mode</Label>
              <Select value={ps.navigationMode} onValueChange={(v) => update({ navigationMode: v as NavigationMode })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                {ps.navigationMode === 'restricted'
                  ? 'Next button disabled until slide duration elapses.'
                  : 'Learner can navigate freely.'}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs flex-1" />
      </div>
    </div>
  );
}
