/**
 * Player settings: colors, font, button radius, background, sidebar position,
 * menu/notes tabs, play and caption controls, navigation mode and the
 * course-wide quiz timer. Includes a scaled live preview (PlayerShell).
 */
import { useRef, useState, useLayoutEffect } from 'react';
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
import { themeVarRef, themeVarIndex, resolveColor } from '@/lib/themeVars';
import { PlayerShell } from './PlayerShell';

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">Player Settings</DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0 overflow-hidden">
          {/* Left — Live Preview (scaled real PlayerShell) */}
          <ScaledPlayerPreview ps={ps} />

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

            <div className="space-y-2 pt-3 border-t">
              <Label className="text-xs font-semibold uppercase tracking-wider">Course Quiz Timer</Label>
              <div className="flex items-center justify-between">
                <Label className="text-xs cursor-pointer" htmlFor="course-timer-enabled">Enable course timer</Label>
                <Switch
                  id="course-timer-enabled"
                  checked={!!ps.courseTimer?.enabled}
                  onCheckedChange={(v) => update({ courseTimer: { ...(ps.courseTimer ?? { minutes: 10, seconds: 0, showToLearner: true }), enabled: v } })}
                />
              </div>
              {ps.courseTimer?.enabled && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Minutes</Label>
                      <Input
                        type="number" min={0} max={240}
                        value={ps.courseTimer?.minutes ?? 0}
                        onChange={(e) => { const n = Number(e.target.value); if (Number.isNaN(n)) return; update({ courseTimer: { ...(ps.courseTimer!), minutes: Math.max(0, Math.min(240, Math.round(n))) } }); }}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Seconds</Label>
                      <Input
                        type="number" min={0} max={59}
                        value={ps.courseTimer?.seconds ?? 0}
                        onChange={(e) => { const n = Number(e.target.value); if (Number.isNaN(n)) return; update({ courseTimer: { ...(ps.courseTimer!), seconds: Math.max(0, Math.min(59, Math.round(n))) } }); }}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs cursor-pointer" htmlFor="course-timer-show">Show timer to learner</Label>
                    <Switch
                      id="course-timer-show"
                      checked={ps.courseTimer?.showToLearner !== false}
                      onCheckedChange={(v) => update({ courseTimer: { ...(ps.courseTimer!), showToLearner: v } })}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">Single countdown across all quiz slides. Pauses on non-quiz slides. Disables per-question timers.</p>
                </>
              )}
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

/**
 * Renders the real <PlayerShell /> at a fixed virtual size and scales it down
 * via CSS transform to fit the modal's left pane. Live-binds to the same
 * playerSettings object the right-pane controls mutate.
 */
function ScaledPlayerPreview({ ps }: { ps: PlayerSettings }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  // Virtual canvas the shell renders into before scaling.
  const VW = 1280;
  const VH = 720;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const { clientWidth, clientHeight } = el;
      if (!clientWidth || !clientHeight) return;
      const s = Math.min(clientWidth / VW, clientHeight / VH);
      setScale(Math.max(0.1, s));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex-1 min-w-0 rounded-lg border bg-muted/30 overflow-hidden">
      <div ref={wrapRef} className="w-full h-full relative">
        <div
          className="absolute top-1/2 left-1/2 flex"
          style={{
            width: VW,
            height: VH,
            transform: `translate(-50%, -50%) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          <PlayerShell playerSettings={ps} interactive={false} />
        </div>
      </div>
    </div>
  );
}

