

# Timeline & Triggers Implementation

## 1. State Schema Updates (`src/types/course.ts`)
- Add `startTime: number` (default 0) and `duration: number` (default 5000) to `BaseElement`
- Add `triggers: Trigger[]` to `BaseElement`
- New `Trigger` interface: `{ event: string; action: string; targetId: string }`
- Update default element creation in `Toolbox.tsx` to include these new fields

## 2. Context Updates (`src/context/CourseContext.tsx`)
- Existing `UPDATE_ELEMENT` action already handles partial updates, so timeline property changes (startTime, duration) will work automatically through the properties panel and timeline UI

## 3. Bottom Timeline Panel (`src/components/authoring/TimelinePanel.tsx`)
- New collapsible panel at the bottom of the editor (hidden in preview mode)
- **Left column (~200px)**: Lists element names/types for the active slide, clicking selects the element
- **Right area**: Horizontal timeline tracks using `react-rnd` (already installed) for each element — bars are draggable (changes startTime) and resizable horizontally (changes duration)
- Timeline scale: configurable, default showing ~10 seconds with tick marks
- Bars color-coded by element type (text, image, shape)
- Collapsible via a toggle button using Radix Collapsible (already available)

## 4. Layout Update (`src/pages/Index.tsx`)
- Insert `TimelinePanel` below the canvas area, inside the main flex column, outside the three-panel row
- Only visible when not in preview mode

## 5. Properties Panel Update (`src/components/authoring/PropertiesPanel.tsx`)
- Add startTime and duration number fields for all element types
- Add a triggers section: list existing triggers with delete, button to add new trigger with dropdowns for event/action and an ID input for targetId

## Files Changed
- `src/types/course.ts` — schema additions
- `src/context/CourseContext.tsx` — no reducer changes needed (UPDATE_ELEMENT covers it)
- `src/components/authoring/Toolbox.tsx` — add defaults for new fields
- `src/components/authoring/TimelinePanel.tsx` — new component
- `src/components/authoring/PropertiesPanel.tsx` — timeline + trigger fields
- `src/pages/Index.tsx` — layout update

