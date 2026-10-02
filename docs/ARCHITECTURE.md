# Chronicle Publisher: developer guide

This guide explains how the app fits together and what to watch out for. Read it before changing code. File paths are relative to `src/`.

## The big picture

Chronicle is a single-page React app (Vite + TypeScript + Tailwind + shadcn/ui). There is no backend:

- The **whole course lives in one React state object** (`CourseState`) held by a context + reducer.
- Courses are **saved and loaded as JSON files**, with all media (images, audio, video) embedded as base64 data URIs. There is **no autosave**: refreshing the page loses unsaved work.
- **Publishing** turns that state into a self-contained HTML player, zipped as a SCORM or xAPI package, entirely in the browser.
- The AI features (text-to-speech and Whisper captions) download their models from Hugging Face on first use and run in the browser.

```
User edits ──► dispatch(action) ──► courseReducer ──► CourseState ──► editor UI re-renders
                                                          │
                     Save ◄──────── JSON file ◄────────────┤
                     Load ──► sanitize ──► LOAD_COURSE ───►│
                     Publish ──► buildPlayerHtml ──► index.html + manifest ──► .zip
```

## Folder map

| Path | What's there |
|---|---|
| `types/course.ts` | **Start here.** The data model: `CourseState`, `Slide`, `SlideLayer`, every element type, quizzes, triggers, variables, player and course settings. Well commented. |
| `context/CourseContext.tsx` | The single store: `CourseProvider`, `useCourse()`, and `courseReducer` with every action (`ADD_SLIDE`, `UPDATE_ELEMENT`, `LOAD_COURSE`, `SET_SLIDE_NARRATION`, …). |
| `pages/Index.tsx` | The page layout: ribbon on top; slide list, canvas and properties panel in the middle; timeline at the bottom. Preview mode swaps the editor for `PlayerShell`. |
| `components/authoring/` | All editor UI (see the next table). |
| `components/ui/` | shadcn/ui building blocks (buttons, dialogs, selects, …). Generated; don't edit by hand. |
| `lib/blueprint.ts` | Course blueprints: schema, validation, layout → slide conversion, JSON repair, and the AI instructions text. |
| `lib/tts/` | Text-to-speech narration (Kokoro). See *Text-to-speech* below. |
| `lib/transcribe.ts` | Whisper speech-to-text for "Auto-Generate Captions" on imported audio. |
| `lib/sanitize.ts` | Validates everything loaded from a file before it enters the app. See *Loading a course*. |
| `lib/publish/` | Publishing: `index.ts` (zip builder), `runtime/` (the exported player and LMS APIs), `manifest/` (SCORM/xAPI manifests), `word.ts`, `video.ts`, `compat.ts`. |
| `lib/shapes.ts`, `lib/themeVars.ts`, `lib/motionPath.ts` | Shared helpers: SVG shape library, theme color variables, bezier motion paths. Used by the editor and the exported player. |
| `lib/questionBank.ts`, `lib/quizTemplates.ts` | Question bank and quiz style templates, stored in the browser's `localStorage` (not in the course file). |
| `test/` | Vitest unit tests (`npm test`). |

### Editor components (`components/authoring/`)

| File | Responsibility |
|---|---|
| `Ribbon.tsx` | The Storyline-style ribbon: tabs Home, Insert, Design, Transitions, Animations, View, Quiz. Also owns **Save/Load** and mounts most dialogs. |
| `Canvas.tsx` | The slide stage. Renders elements for both **editing** (drag/resize) and **preview** (playback, triggers, layers, audio, captions, quiz/results overlays). The largest and most central component. |
| `PropertiesPanel.tsx` | Right-hand panel: slide properties (title, layers, advance/revisit, notes, audio and captions) and the selected element's properties, including the **trigger editor** and quiz/results editors. |
| `TimelinePanel.tsx` | Bottom timeline: element timing bars, playhead, play/pause; "States" tab for hover colors. |
| `SlidePanel.tsx` | Left slide list with thumbnails (its own lightweight renderer). |
| `PlayerShell.tsx` | Preview-mode player frame (title bar, menu/notes sidebar, Prev/Play/Next/CC); also runs quiz timers. Wraps `Canvas`. |
| `PublishDialog.tsx` | Publish dialog: LMS/LRS (SCORM/xAPI), Word, Video ("Web" is a placeholder). |
| `BlueprintDialog.tsx` | Paste-a-blueprint dialog, "Copy AI instructions", narration option. |
| `TextToSpeechDialog.tsx`, `NarrationProgress.tsx` | Insert → Text to Speech, and the background narration progress panel. |
| `TextLines.tsx` | Renders text with hanging-indent bullets (mirrors `fillText` in the exported player). |
| `StoryViewOverlay.tsx` | "Story View": a flowchart of slides and their jump-to-slide triggers. |
| `MediaLibraryOverlay.tsx` | Lists every image, video and audio file used in the course. |
| `VariableManagerOverlay.tsx` | Create and edit course variables. |
| `PlayerSettingsModal.tsx` | Player look (colors, font, sidebar, menu/notes tabs, controls, course timer). |
| `QuizOverlays.tsx`, `QuizTemplatesTab.tsx`, `QuestionBankPanel.tsx` | Quiz style templates and the question bank. |
| `MotionPathLayer.tsx`, `ShapePicker.tsx`, `DesignControls.tsx` | Motion-path editing, shape menu, story size and theme color controls. |
| `Toolbox.tsx`, `TopNav.tsx`, `../NavLink.tsx` | **Unused leftovers** from earlier versions; not imported anywhere. `TopNav`'s save only saved slides, so don't revive it as-is. |

## The data model (essentials)

See `types/course.ts` for every field. Key points:

- **Layers are the source of truth.** Each slide has `layers` (bottom to top; index 0 is the "Base Layer"). `slide.elements` is a **flattened copy of all layers' elements**, kept for older code paths. The reducer rebuilds it whenever layers change (`rebuildElements` / `mapElementsInSlide` in `CourseContext.tsx`). When you write code that edits elements, go through those helpers.
- A layer's `visible` flag is its **starting state** during playback. Show Layer / Hide Layer triggers override it at runtime. That's how lightboxes (blueprint `reveal` slides) work: hidden layers that buttons reveal.
- **Mixed time units:** slide `duration` and element `startTime`/`duration` are in **milliseconds**; audio `duration` and caption `startTime`/`endTime` are in **seconds**.
- In the editor preview, an element appears when its timeline bar starts and disappears when it ends. An element whose bar reaches the end of the slide **stays visible after the timeline ends** (as in Storyline). The exported player (`applyTiming` in `player.ts`) and the video exporter (`elementAppearance` in `video.ts`) follow the same rules, including entrance and exit animations.
- Colors can be hex values or theme references like `var(--theme-primary)` (see `lib/themeVars.ts`), so changing a theme color restyles every element that uses it.
- Quiz and results slides are ordinary slides with `slideType: 'quiz' | 'results'` and a `quiz` / `results` config. The quiz card is drawn by the renderer, not built from elements.
- Runtime-only fields (playhead, quiz answers, variable values, preview mode) live in `CourseState` too, but are never saved.

## Rendering: three renderers that must stay in sync

The same slide content is drawn by **three independent renderers**:

1. **`Canvas.tsx` → `ElementRenderer`**: the editor and in-app preview (React).
2. **`SlidePanel.tsx` → `ThumbElement`**: the slide-list thumbnails (React, simplified).
3. **`lib/publish/runtime/player.ts` → `renderElement`**: the **exported SCORM/xAPI player** (plain JavaScript, see below).

A fourth, simplified renderer lives in **`lib/publish/video.ts`**, which paints slides onto an off-screen `<canvas>` for video export. Check it too when changing visuals.

When you change how something looks or behaves (a new element property, text handling, shape text, layer visibility, timing), **update all three** (and the video renderer if it's visual), or the editor, thumbnails and published course will disagree. Several past bugs came from exactly this: line breaks lost in the export, bullets without hanging indents in thumbnails, hidden layers that could never be shown in the export.

## Loading a course

`Ribbon.tsx → loadProject`:

1. Read the file and `JSON.parse` it. If parsing fails and the content is a **blueprint**, common AI formatting slips are repaired (`parseBlueprintText`, using `jsonrepair`).
2. If it's a blueprint (`blueprintVersion: 1`), convert it (see below). Otherwise treat it as a saved project.
3. **Everything passes through `lib/sanitize.ts`** (`sanitizeSlides`, `sanitizePlayerSettings`, …). It validates colors, fonts, numbers, enums, IDs and data URIs, because these values end up inside the exported HTML.
4. Dispatch `LOAD_COURSE`, which fills in defaults and migrates old files (for example, creating a Base Layer for slides without layers).

> **Gotcha: the sanitizer is an allow-list.** Any field it doesn't copy is **silently dropped on load**. When you add a field to `types/course.ts`, add it to `sanitize.ts` too, or it will vanish the next time a project is opened. This has already bitten quiz settings, player settings (course title, sidebar, tabs, timer) and layers.

## Publishing (`lib/publish/`)

`publish(state, options)` in `lib/publish/index.ts`:

1. Picks the LMS adapter script: `runtime/scorm12.ts`, `runtime/scorm2004.ts` or `runtime/xapi.ts`.
2. Calls `buildPlayerHtml` (`runtime/player.ts`), which produces **one self-contained `index.html`**: player CSS, the course JSON (media still embedded as data URIs), the LMS adapter and the player runtime.
3. Adds the manifest (`manifest/scorm12.ts`, `scorm2004.ts` → `imsmanifest.xml`; `tincan.ts` → `tincan.xml`), zips it with JSZip and downloads it.

> **Gotcha: the exported player is code inside a string.** `PLAYER_RUNTIME` in `player.ts` returns the player's JavaScript as a **template literal**, so it can't `import` anything, is written in ES5 style (`var`, `function`), and **backslashes must be doubled** (`\\n`, `\\{`). Use `String.fromCharCode(10)` rather than `"\n"` when in doubt. Test changes by publishing a package and opening its `index.html`.

Also in this folder: `compat.ts` (warnings shown in the Publish dialog), `word.ts` (Word storyboard export using `docx`) and `video.ts` (records slides with `MediaRecorder` into MP4).

> **Video export notes.** `video.ts` plays the whole course once, in real time, painting frames on a timer (not `requestAnimationFrame`, which stalls in background tabs) while slide audio is routed into the recording. Remember the units: `slide.duration` and element times are **milliseconds**, audio durations and captions are **seconds** (mixing them up once made slide 1 "record" for 83 minutes). A silent oscillator keeps the audio track active, because an idle audio track makes Chrome cut the recording short.

## Course blueprints (`lib/blueprint.ts`)

A blueprint is a compact JSON course description, usually written by an AI from a storyboard:

- `courseBlueprintSchema` (zod) defines the layouts: `title`, `section`, `bullets`, `image-text`, `two-column`, `reveal`, `callout`, `quiz`, `results`. Every slide may carry `narration` and `sourceRef`.
- `blueprintToCourse` converts each layout into real slides, elements and layers with fixed positions (designed for 1024×768 and scaled to the canvas). `reveal` builds one hidden layer per item, wired with Show/Hide Layer triggers.
- `narration` and `sourceRef` go into slide notes (`Narration:` / `Source:`). Narration is also voiced automatically after loading.
- `prepareBlueprintLoad` is the single path used by both the Load button and the Blueprint dialog: validate → convert → sanitize.
- **`BLUEPRINT_GUIDE`** is the text behind "Copy AI instructions". **Keep it in sync with the schema** whenever you add or change a layout.

## Text-to-speech (`lib/tts/`)

| File | Role |
|---|---|
| `narration.ts` | Pure functions: split a script into sentences (MyCanary's rules), join audio with pauses (0.42s after a sentence, 0.7s after a paragraph), split captions (≤10 words / ≤7s), encode MP3 (128 kbps). Unit-tested. |
| `ttsWorker.ts` | Web Worker running Kokoro (`onnx-community/Kokoro-82M-v1.0-ONNX`, ~90 MB) one sentence at a time. |
| `index.ts` | Main-thread client: voice list, progress messages, a 3-minute stall timeout, and `generateNarrationAudio()`, which returns a `SlideAudio` with captions. `setSynthesizer()` lets tests swap in a fake voice. |
| `narrationJob.ts` | Background job that narrates a whole course after a blueprint loads, slide by slide, with cancel. |

Narration is added through the `SET_SLIDE_NARRATION` reducer action, which replaces earlier text-to-speech audio (found by its name, `TTS_AUDIO_NAME`) and **lengthens the slide**, and the elements that ran to its end, to fit the voice.

## Gotchas (learned the hard way)

1. **Kokoro must run on the CPU (`device: 'wasm'`).** Its WebGPU path produces garbled speech on many laptop GPUs (AMD Radeon integrated, Intel Iris Xe), even when Windows is set to use an NVIDIA card. See [onnxruntime#29807](https://github.com/microsoft/onnxruntime/issues/29807).
2. **Don't use `kokoro-js`'s `tts.stream(text)`.** It never closes its sentence splitter, so it hangs before the last sentence. We split sentences ourselves and call `tts.generate()` per sentence.
3. **ONNX Runtime version clash.** `@xenova/transformers` (Whisper) brings ONNX Runtime 1.14, Kokoro brings 1.22, and Kokoro's regular entry point can pick up the wrong one ("invalid data location: undefined for input 'input_ids'"). `vite.config.ts` therefore aliases `kokoro-js` to its self-contained `dist/kokoro.web.js`. Keep that alias.
4. **Test in the published app, not just the Lovable editor preview.** The Lovable preview has thrown "Maximum update depth exceeded" errors that don't happen on the published site.
5. **Merging to `main` doesn't update the live site.** Someone must click **Publish** in Lovable.
6. **First use of text-to-speech or Whisper needs internet** to download the models from Hugging Face (cached afterwards). In `npm run dev`, Vite may reload the page the first time it prepares these libraries; that's normal.
7. **Course files can get large.** All media is embedded as base64 (narration is about 16 KB per second). The Load button rejects files over 50 MB.
8. **The sanitizer is an allow-list** (see *Loading a course*), and **there are three renderers** (see *Rendering*). These two cause most "it works in the editor but not after loading or publishing" bugs.

## Known gaps

Behaviors that differ between the editor preview and the exported course, or are unfinished:

- **Video export is simplified.** It draws text, shapes, images, captions, a static quiz card and fade/fly animations, but videos inside slides appear as a placeholder, and motion paths, layers opened by triggers and interactivity are not shown. It records in real time, so the tab must stay open.
- **The "Web" publish target** is a "Coming soon" placeholder.

## Testing

- `npm test` runs the Vitest suite in `src/test/`: blueprint conversion and repair, the text-to-speech pipeline, the narration reducer, layer round-trips through the sanitizer, and the stall timeout.
- For UI or player changes, also check by hand: load a blueprint, preview it, and **publish a SCORM package and open its `index.html`**, since the exported player is separate code.
