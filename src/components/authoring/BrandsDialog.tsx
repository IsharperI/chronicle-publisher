/**
 * Design → Brands: create and edit client brands (colours, fonts, logo,
 * title style), apply one to the current course, and share brands as .json
 * files. The library lives in this browser (lib/brand.ts); the brand a
 * course uses travels inside the course file, so it can be added to the
 * library from any course ("Add this course's brand").
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, ImagePlus, Plus, Trash2, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCourse } from '@/context/CourseContext';
import { BRAND_FONTS, TITLE_STYLES, loadBrands, newBrand, readLogo, saveBrands, setLastBrandId } from '@/lib/brand';
import { sanitizeBrand } from '@/lib/sanitize';
import type { Brand } from '@/types/course';

const COLOR_NAMES = ['Primary', 'Secondary', 'Accent 1', 'Accent 2 (warnings)', 'Dark (text)', 'Light (backgrounds)'];
const POSITIONS: { value: Brand['logoPosition']; label: string }[] = [
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
];

/** Small live preview of a branded content slide. */
function BrandPreview({ brand }: { brand: Brand }) {
  const [primary, , , accent2, dark, light] = brand.colors;
  const style = brand.titleStyle;
  const barBg = style === 'solid' ? primary : style === 'light' ? light : 'transparent';
  const titleColor = style === 'solid' ? light : primary;
  const W = 320, H = 240, k = W / 1024;
  const logoH = 60 * k, logoW = Math.min(logoH * (brand.logoAspect || 3), 240 * k);
  const left = brand.logoPosition.endsWith('left'), top = brand.logoPosition.startsWith('top');
  return (
    <div className="relative overflow-hidden rounded border shadow-sm bg-white" style={{ width: W, height: H, fontFamily: brand.bodyFont }} aria-label="Brand preview">
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: 110 * k, background: barBg }} />
      {style !== 'solid' && (
        <div style={{ position: 'absolute', left: style === 'minimal' ? 60 * k : 0, top: 110 * k - (style === 'light' ? 6 : 3) * k, width: style === 'minimal' ? 160 * k : W, height: (style === 'light' ? 6 : 3) * k, background: style === 'light' ? accent2 : primary }} />
      )}
      <div style={{ position: 'absolute', left: 60 * k, top: 32 * k, fontFamily: brand.headingFont, fontWeight: 700, fontSize: 36 * k, color: titleColor }}>Slide title</div>
      <div style={{ position: 'absolute', left: 60 * k, top: 150 * k, fontSize: 24 * k, color: dark, lineHeight: 1.5 }}>
        • First point<br />• Second point<br />• Third point
      </div>
      <div style={{ position: 'absolute', left: 60 * k, top: 470 * k, padding: `${12 * k}px ${28 * k}px`, borderRadius: 12 * k, background: primary, color: light, fontSize: 22 * k }}>Button</div>
      {brand.logo && (
        <img src={brand.logo} alt="" style={{
          position: 'absolute', width: logoW, height: logoW / (brand.logoAspect || 3),
          left: left ? 24 * k : W - 24 * k - logoW,
          top: top ? (110 * k - logoW / (brand.logoAspect || 3)) / 2 : H - 20 * k - logoW / (brand.logoAspect || 3),
        }} />
      )}
    </div>
  );
}

export function BrandsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { state, dispatch } = useCourse();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [dirty, setDirty] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const courseBrand = state.courseSettings.brand;

  useEffect(() => {
    if (!open) return;
    const list = loadBrands();
    setBrands(list);
    setEditing(list.find((b) => b.id === courseBrand?.id) ?? list[0] ?? null);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const inLibrary = useMemo(() => !!courseBrand && brands.some((b) => b.id === courseBrand.id), [brands, courseBrand]);

  const persist = (list: Brand[]) => {
    const err = saveBrands(list);
    if (err) { toast.error(err); return false; }
    setBrands(list);
    return true;
  };
  const save = (b: Brand | null = editing) => {
    if (!b) return false;
    const list = brands.some((x) => x.id === b.id) ? brands.map((x) => (x.id === b.id ? b : x)) : [...brands, b];
    if (!persist(list)) return false;
    setDirty(false);
    return true;
  };
  const edit = (patch: Partial<Brand>) => {
    if (!editing) return;
    setEditing({ ...editing, ...patch });
    setDirty(true);
  };
  const create = (from?: Partial<Brand>) => {
    const b = newBrand({
      colors: [...state.courseSettings.themeColors],
      ...(state.courseSettings.bodyFont ? { bodyFont: state.courseSettings.bodyFont } : {}),
      ...(state.courseSettings.headingFont ? { headingFont: state.courseSettings.headingFont } : {}),
      ...from,
    });
    setEditing(b);
    setDirty(true);
  };
  const remove = (b: Brand) => {
    const list = brands.filter((x) => x.id !== b.id);
    if (persist(list)) setEditing(list[0] ?? null);
  };
  const apply = () => {
    if (!editing) return;
    if (dirty && !save()) return;
    dispatch({ type: 'APPLY_BRAND', brand: editing });
    setLastBrandId(editing.id);
    toast.success(`Applied “${editing.name}” to this course`, { description: 'Ctrl+Z undoes it.' });
    onOpenChange(false);
  };
  const exportBrand = () => {
    if (!editing) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ chronicleBrand: 1, ...editing }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editing.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'brand'}.brand.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importBrand = async (file?: File) => {
    if (!file) return;
    try {
      const b = sanitizeBrand(JSON.parse(await file.text()));
      if (!b) throw new Error('not a brand');
      const existing = brands.find((x) => x.id === b.id);
      if (persist(existing ? brands.map((x) => (x.id === b.id ? b : x)) : [...brands, b])) {
        setEditing(b); setDirty(false);
        toast.success(`${existing ? 'Updated' : 'Added'} brand “${b.name}”`);
      }
    } catch {
      toast.error("This file isn't a Chronicle brand");
    }
  };
  const onLogo = async (file?: File) => {
    if (!file) return;
    try {
      const { dataUrl, aspect } = await readLogo(file);
      edit({ logo: dataUrl, logoAspect: aspect });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Brands</DialogTitle>
          <DialogDescription>
            Save a client’s colours, fonts, logo and title style, then apply it to any course or pick it when loading a
            blueprint. Brands are kept in this browser; use Export / Import to share them with your team.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 min-h-[420px]">
          {/* Library */}
          <div className="w-52 shrink-0 flex flex-col gap-1 border-r pr-3">
            {brands.map((b) => (
              <button key={b.id} type="button" onClick={() => { setEditing(b); setDirty(false); }}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${editing?.id === b.id ? 'bg-muted font-medium' : ''}`}>
                <span className="flex shrink-0">{b.colors.slice(0, 3).map((c, i) => <span key={i} className="h-3.5 w-3.5 border border-white" style={{ background: c, marginLeft: i ? -4 : 0, borderRadius: 999 }} />)}</span>
                <span className="truncate">{b.name}</span>
                {courseBrand?.id === b.id && <span className="ml-auto text-[10px] text-emerald-700">in use</span>}
              </button>
            ))}
            {brands.length === 0 && <p className="text-xs text-muted-foreground px-2">No brands yet.</p>}
            <div className="mt-auto flex flex-col gap-1 pt-2">
              <Button variant="outline" size="sm" onClick={() => create()}><Plus className="h-4 w-4 mr-1" />New brand</Button>
              {courseBrand && !inLibrary && (
                <Button variant="outline" size="sm" onClick={() => { setEditing({ ...courseBrand }); setDirty(true); }}>
                  Add this course’s brand
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => importRef.current?.click()}><Upload className="h-4 w-4 mr-1" />Import…</Button>
              <input ref={importRef} type="file" accept=".json,application/json" hidden aria-label="Import brand"
                onChange={(e) => { void importBrand(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>

          {/* Editor */}
          {editing ? (
            <div className="flex-1 grid grid-cols-[1fr_auto] gap-5">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={editing.name} maxLength={60} onChange={(e) => edit({ name: e.target.value })} aria-label="Brand name" />
                </div>
                <div>
                  <Label className="text-xs">Colours</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {editing.colors.map((c, i) => (
                      <label key={i} className="flex items-center gap-2 text-xs">
                        <input type="color" value={c} aria-label={COLOR_NAMES[i]}
                          onChange={(e) => edit({ colors: editing.colors.map((x, j) => (j === i ? e.target.value : x)) })}
                          className="h-8 w-10 rounded border cursor-pointer" />
                        <span className="leading-tight">{COLOR_NAMES[i]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['headingFont', 'bodyFont'] as const).map((k) => (
                    <div key={k}>
                      <Label className="text-xs">{k === 'headingFont' ? 'Heading font' : 'Body font'}</Label>
                      <Select value={editing[k]} onValueChange={(v) => edit({ [k]: v })}>
                        <SelectTrigger className="h-8 text-xs" aria-label={k === 'headingFont' ? 'Heading font' : 'Body font'}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BRAND_FONTS.map((f) => <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">Title style</Label>
                  <Select value={editing.titleStyle} onValueChange={(v) => edit({ titleStyle: v as Brand['titleStyle'] })}>
                    <SelectTrigger className="h-8 text-xs" aria-label="Title style"><SelectValue /></SelectTrigger>
                    <SelectContent>{TITLE_STYLES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Logo</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {editing.logo ? <img src={editing.logo} alt="Logo" className="h-9 max-w-[140px] object-contain border rounded bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:12px_12px]" /> : <span className="text-xs text-muted-foreground">No logo</span>}
                    <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}><ImagePlus className="h-4 w-4 mr-1" />{editing.logo ? 'Change' : 'Add logo'}…</Button>
                    {editing.logo && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove logo" onClick={() => edit({ logo: undefined, logoAspect: undefined })}><X className="h-4 w-4" /></Button>}
                    <Select value={editing.logoPosition} onValueChange={(v) => edit({ logoPosition: v as Brand['logoPosition'] })}>
                      <SelectTrigger className="h-8 w-36 text-xs ml-auto" aria-label="Logo position"><SelectValue /></SelectTrigger>
                      <SelectContent>{POSITIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <input ref={logoRef} type="file" accept="image/*" hidden aria-label="Logo file"
                      onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">A PNG or SVG with a transparent background works best. On a solid title bar, use a light version of the logo.</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Preview</Label>
                <BrandPreview brand={editing} />
                <p className="text-[11px] text-muted-foreground max-w-[320px]">
                  Fonts must be installed on learners’ computers; these are common ones that are.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Create a brand to get started.</div>
          )}
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <div className="flex gap-2">
            {editing && brands.some((b) => b.id === editing.id) && (
              <Button variant="ghost" className="text-red-600" onClick={() => remove(editing)}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
            )}
            {editing && <Button variant="ghost" onClick={exportBrand}><Download className="h-4 w-4 mr-1" />Export…</Button>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save() && toast.success('Brand saved')} disabled={!editing || !dirty}>Save brand</Button>
            <Button onClick={apply} disabled={!editing}>Apply to this course</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
