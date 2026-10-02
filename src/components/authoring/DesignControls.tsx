/**
 * Design-tab controls: story (canvas) size and the six course theme
 * colors (Primary, Secondary, Accent 1, Accent 2, Dark, Light).
 */
import { useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Maximize2, Palette } from 'lucide-react';

const SIZE_PRESETS = {
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1024, height: 768 },
} as const;

type PresetKey = keyof typeof SIZE_PRESETS | 'custom';

const THEME_LABELS = ['Primary', 'Secondary', 'Accent 1', 'Accent 2', 'Dark', 'Light'];

function detectPreset(w: number, h: number): PresetKey {
  if (w === SIZE_PRESETS['16:9'].width && h === SIZE_PRESETS['16:9'].height) return '16:9';
  if (w === SIZE_PRESETS['4:3'].width && h === SIZE_PRESETS['4:3'].height) return '4:3';
  return 'custom';
}

export function StorySizeControl() {
  const { state, dispatch } = useCourse();
  const { width, height } = state.courseSettings.canvasDimensions;
  const preset = detectPreset(width, height);

  const handlePresetChange = (v: PresetKey) => {
    if (v === 'custom') {
      if (preset !== 'custom') {
        dispatch({
          type: 'UPDATE_COURSE_SETTINGS',
          updates: { canvasDimensions: { width: width + 1, height } },
        });
      }
      return;
    }
    dispatch({
      type: 'UPDATE_COURSE_SETTINGS',
      updates: { canvasDimensions: { ...SIZE_PRESETS[v] } },
    });
  };

  const setDim = (key: 'width' | 'height', val: number) => {
    dispatch({
      type: 'UPDATE_COURSE_SETTINGS',
      updates: { canvasDimensions: { ...state.courseSettings.canvasDimensions, [key]: Math.max(100, val) } },
    });
  };

  return (
    <div className="flex items-end gap-2">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Story Size</Label>
        <Select value={preset} onValueChange={(v) => handlePresetChange(v as PresetKey)}>
          <SelectTrigger className="h-8 text-xs w-[180px]">
            <Maximize2 className="h-3.5 w-3.5 mr-1.5 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="16:9">16:9 (1920×1080)</SelectItem>
            <SelectItem value="4:3">4:3 (1024×768)</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {preset === 'custom' && (
        <>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">W</Label>
            <Input
              type="number"
              value={width}
              onChange={(e) => setDim('width', Number(e.target.value))}
              className="h-8 text-xs w-20"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">H</Label>
            <Input
              type="number"
              value={height}
              onChange={(e) => setDim('height', Number(e.target.value))}
              className="h-8 text-xs w-20"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function ThemeColorsControl() {
  const { state, dispatch } = useCourse();
  const colors = state.courseSettings.themeColors;
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 flex flex-col items-center justify-center gap-0.5 px-3 text-foreground"
        >
          <div className="flex items-center gap-1">
            <Palette className="h-4 w-4 mr-1" />
            <div className="flex gap-0.5">
              {colors.slice(0, 6).map((c, i) => (
                <span
                  key={i}
                  className="w-2.5 h-2.5 rounded-sm border border-border/40"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <span className="text-[10px] font-medium leading-none">Theme Colors</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Theme Colors</p>
            <p className="text-[11px] text-muted-foreground">Reusable palette across the course.</p>
          </div>
          <div className="space-y-2">
            {colors.map((color, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => dispatch({ type: 'UPDATE_THEME_COLOR', index: i, color: e.target.value })}
                  className="h-8 w-10 rounded border cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-[10px] text-muted-foreground">{THEME_LABELS[i]}</Label>
                  <Input
                    value={color}
                    onChange={(e) => dispatch({ type: 'UPDATE_THEME_COLOR', index: i, color: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
