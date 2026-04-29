# Add Slide Title Property

Add an optional `title` field to each slide. The user can edit it in the right Properties panel (capped at 30 characters). When set, it replaces the default "Slide X" label in the left Slide Panel and in the Player Menu (both preview and SCORM export). When empty, "Slide X" is used as a fallback.

## Changes

### 1. Schema — `src/types/course.ts`
Add to the `Slide` interface:
```ts
/** Optional human-readable title (max 30 chars). Falls back to "Slide N". */
title?: string;
```

### 2. Sanitization — `src/lib/sanitize.ts`
In `sanitizeSlide`, accept and clamp the title:
```ts
title: typeof raw?.title === 'string' ? raw.title.slice(0, 30) : undefined,
```

### 3. Properties panel — `src/components/authoring/PropertiesPanel.tsx`
Add a "Slide Title" `Input` near the top of the Slide Properties section (just under the heading, above Duration). Apply for both main and master slides.
- `maxLength={30}`, `bg-white text-slate-800`, placeholder `Slide {index+1}`
- onChange dispatches `UPDATE_SLIDE` with `{ title: e.target.value.slice(0, 30) }`
- Small helper text: "Up to 30 characters. Shown in the slide list and player menu."

### 4. Left slide panel — `src/components/authoring/SlidePanel.tsx`
Replace the hard-coded label:
```ts
const label = (slide.title?.trim())
  || (isMain ? `Slide ${i + 1}` : `Master ${i + 1}`);
```
Used in the `01 Slide 1` heading above each thumbnail.

### 5. Player preview menu — `src/components/authoring/PlayerShell.tsx`
In the sidebar menu list, replace `Slide {i + 1}` with `s.title?.trim() || \`Slide ${i + 1}\``.

### 6. SCORM export menu — `src/lib/exportScorm.ts`
In `buildMenu`, replace:
```js
b.textContent = "Slide " + (idx + 1);
```
with logic that uses `slides[idx].title` when present, else `"Slide " + (idx+1)`. The slides object passed to runtime already serializes the full Slide JSON, so `title` rides along automatically once the schema field exists; only the label resolution needs updating.

## Behavior summary
- Empty/whitespace title → falls back to "Slide N" everywhere.
- Input enforces 30-character limit via `maxLength` and a defensive `.slice(0, 30)` in the dispatch.
- No state-shape migration needed (field is optional); existing saved courses load unchanged.
