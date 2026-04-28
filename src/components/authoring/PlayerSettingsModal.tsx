import { useRef } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BackgroundMode, NavigationMode, PlayerSettings, SidebarPosition } from '@/types/course';
import { ImageIcon, Trash2 } from 'lucide-react';
import { themeVarRef, themeVarIndex, resolveColor, themeVarStyle } from '@/lib/themeVars';

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

  const bgInputRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<PlayerSettings>) => {
    dispatch({ type: 'UPDATE_PLAYER_SETTINGS', updates: patch });
  };

  const handleBgImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => update({ backgroundImage: ev.target?.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const bgStyle = (): React.CSSProperties => {
    const s: React.CSSProperties = { backgroundColor: ps.backgroundColor };
    if (ps.backgroundImage) {
      s.backgroundImage = `url(${ps.backgroundImage})`;
      if (ps.backgroundMode === 'stretch') { s.backgroundSize = '100% 100%'; s.backgroundRepeat = 'no-repeat'; }
      else if (ps.backgroundMode === 'fit') { s.backgroundSize = 'contain'; s.backgroundRepeat = 'no-repeat'; s.backgroundPosition = 'center'; }
      else { s.backgroundRepeat = 'repeat'; s.backgroundSize = 'auto'; }
    }
    return s;
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
              style={{ ...themeVarStyle(state.courseSettings.themeColors), ...bgStyle(), fontFamily: ps.fontFamily }}
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
            <div className="space-y-1.5">
              <Label className="text-xs">Course Title</Label>
              <Input
                value={ps.courseTitle}
                onChange={(e) => update({ courseTitle: e.target.value })}
                className="h-8 text-xs"
                placeholder="Untitled Course"
              />
            </div>

            <ColorControl label="Background Color" value={ps.backgroundColor} onChange={(v) => update({ backgroundColor: v })} themeColors={state.courseSettings.themeColors} />
            <div className="space-y-1.5">
              <Label className="text-xs">Background Image</Label>
              <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={() => bgInputRef.current?.click()}>
                  <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                  {ps.backgroundImage ? 'Change' : 'Upload'}
                </Button>
                {ps.backgroundImage && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => update({ backgroundImage: null })}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
                <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={handleBgImage} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Image Fit</Label>
              <Select value={ps.backgroundMode} onValueChange={(v) => update({ backgroundMode: v as BackgroundMode })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stretch">Stretch to Fill</SelectItem>
                  <SelectItem value="fit">Fit to Screen</SelectItem>
                  <SelectItem value="tile">Tile (Loop)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ColorControl label="Button Color" value={ps.buttonColor} onChange={(v) => update({ buttonColor: v })} themeColors={state.courseSettings.themeColors} />

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
              <Label className="text-xs">Sidebar Position</Label>
              <Select value={ps.sidebarPosition} onValueChange={(v) => update({ sidebarPosition: v as SidebarPosition })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                  <SelectItem value="none">None (Hide Sidebar)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Player Tabs</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="tab-menu"
                  checked={ps.playerTabs.showMenu}
                  onCheckedChange={(v) => update({ playerTabs: { ...ps.playerTabs, showMenu: !!v } })}
                />
                <Label htmlFor="tab-menu" className="text-xs font-normal cursor-pointer">Menu</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="tab-notes"
                  checked={ps.playerTabs.showNotes}
                  onCheckedChange={(v) => update({ playerTabs: { ...ps.playerTabs, showNotes: !!v } })}
                />
                <Label htmlFor="tab-notes" className="text-xs font-normal cursor-pointer">Notes</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Player Controls</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ctrl-pp"
                  checked={ps.playerControls.showPlayPause}
                  onCheckedChange={(v) => update({ playerControls: { ...ps.playerControls, showPlayPause: !!v } })}
                />
                <Label htmlFor="ctrl-pp" className="text-xs font-normal cursor-pointer">Play/Pause</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ctrl-cc"
                  checked={ps.playerControls.showCaptions}
                  onCheckedChange={(v) => update({ playerControls: { ...ps.playerControls, showCaptions: !!v } })}
                />
                <Label htmlFor="ctrl-cc" className="text-xs font-normal cursor-pointer">Captions (CC)</Label>
              </div>
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

function ColorControl({ label, value, onChange, themeColors }: { label: string; value: string; onChange: (v: string) => void; themeColors?: string[] }) {
  const palette = themeColors ?? [];
  const themeIdx = themeVarIndex(value);
  const resolvedHex = resolveColor(value, palette, '#ffffff');
  const pickerValue = resolvedHex.startsWith('#') ? resolvedHex : '#ffffff';
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <input type="color" value={pickerValue} onChange={(e) => onChange(e.target.value)} className="h-8 w-8 rounded border cursor-pointer" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs flex-1" />
      </div>
      {palette.length > 0 && (
        <div className="flex gap-1">
          {palette.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(themeVarRef(i))}
              className={`w-5 h-5 rounded-sm border hover:scale-110 transition-transform ${themeIdx === i ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
              style={{ backgroundColor: c }}
              title={c}
              aria-label={`Apply theme color ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
