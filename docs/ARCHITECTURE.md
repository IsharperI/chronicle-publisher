# Chronicle Publisher: developer guide

This guide explains how the app fits together and what to watch out for. Read it before changing code. File paths are relative to `src/`.

## The big picture

Chronicle is a single-page React app (Vite + TypeScript + Tailwind + shadcn/ui). There is no backend:

- The **whole course lives in one React state object** (`CourseState`) held by a context + reducer.
- Courses are **saved and loaded as JSON files**, with all media (images, audio, video) embedded as base64 data URIs. The latest version is also **autosaved in the browser** (see *Autosave*), but that copy stays on one browser and one computer, so the JSON file is still how courses are backed up and shared.
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
| `lib/brand.ts` | Client brands: library (browser storage + .json export/import), applying a brand to a course, course fonts. See *Brands*. |
| `lib/courseTree.ts` | The course tree (View → Course Tree): arrows, auto layout (Tidy up), saved box positions and the connect / disconnect / re-point rules. |
| `lib/navigation.ts` | Where Next goes (`slide.next`), branching slides and their auto-generated buttons. See *Navigation and branching*. |
| `lib/project.ts` | What a saved project contains (`projectSnapshot`) and how saved data becomes a `LOAD_COURSE` payload (`sanitizeProject`). Used by Save/Load and autosave. |
| `lib/autosave.ts` | Autosave storage (IndexedDB) and the saving/saved status shown in the ribbon. |
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
2. If it's a blueprint (`blueprintVersion: 1`), convert it (see below). Otherwise treat it as a saved project (`sanitizeProject` in `lib/project.ts`).
3. **Everything passes through `lib/sanitize.ts`** (`sanitizeSlides`, `sanitizePlayerSettings`, …). It validates colors, fonts, numbers, enums, IDs and data URIs, because these values end up inside the exported HTML.
4. Dispatch `LOAD_COURSE`, which fills in defaults and migrates old files (for example, creating a Base Layer for slides without layers).

> **Gotcha: the sanitizer is an allow-list.** Any field it doesn't copy is **silently dropped on load**. When you add a field to `types/course.ts`, add it to `sanitize.ts` too, or it will vanish the next time a project is opened. This has already bitten quiz settings, player settings (course title, sidebar, tabs, timer) and layers.

## Navigation and branching (`lib/navigation.ts`)

Each slide's outgoing connections are stored in `slide.next`:

| `slide.next` | Next button |
|---|---|
| omitted | goes to the following slide in the slide list (the default) |
| `[]` | off (an end point) |
| `[id]` | goes to that slide, wherever it is |
| `[a, b, …]` | off: this is a **branching slide** |

- A branching slide gets **one button per connection**, generated by Chronicle: theme-colored shapes in a centered row, with a Jump to Slide trigger and `autoBranchTarget` set. Authors can move, restyle and rename them.
- `reconcileBranching` runs inside `courseReducer` after **every** change to the slide list. It adds buttons for new connections, removes buttons whose connection is gone (or all of them when the slide drops back to one connection), removes connections to deleted slides, and treats an auto button the author deleted as removing that connection. Add or change connections only through `SET_SLIDE_NEXT`.
- **Hubs.** A branching slide's `branchMode` is `choice` (the default: pick one path, Next stays off), `explore` or `required`. A hub's Next ("Continue") goes to `continueTo`.
  - A branch is **completed** when the learner reaches its last slide, meaning a slide whose Next leads back to the hub (`completesBranch`).
  - A `required` hub keeps Continue locked until every branch is completed (`hubLocked`).
  - Completed branches get a ✓ on their button (`BranchTick` in `Canvas.tsx`; `.branch-tick` in the exported player).
  - Progress is tracked in `branchDone` / `previewBranch` in the preview, and in `branchDone` / `activeBranch` in `player.ts`. The exported player saves it as `{"b": branchDone}` in SCORM `cmi.suspend_data` (`getSuspend`/`setSuspend` in the SCORM adapters), so ticks survive a relaunch. xAPI packages don't save it yet.
  - The panel warns about branches that never lead back to their hub (`branchesReturn`).
  - Branching slides never auto-advance.
- **Prev retraces the path the learner took** (a history stack), not the slide list, in both the preview (`previewHistory`, `PREVIEW_BACK`) and the exported player (`navHistory`).
- The exported player has an ES5 copy of `resolveNext` (`nextIndexOf` in `player.ts`). **Keep the two in sync.**
- In a course with branching slides, a learner can't see every slide, so for "percent of slides viewed" completion, reaching an end point (a slide with no Next) also counts as complete.
- UI: Slide Properties → **Next Button Goes To / Branches** (`NextSlideControl.tsx`), or the **course tree** (`StoryViewOverlay.tsx`):
  - drag boxes to arrange (positions saved in `slide.treePos`);
  - drag the blue dot under a box onto another box to connect;
  - select an arrow, then press Delete or drag its end dot to re-point it;
  - double-click a branch label to rename its button, or a box to open the slide;
  - right-click a box to add a slide after it, add a branch, duplicate or delete;
  - **Tidy up** re-runs the automatic layout;
  - a hub's Continue arrow is green; delete or re-point it like any other, or use right-click → Set Continue to…;
  - **slide groups** (`slide.group`, a name like a Storyline scene): Shift+click several boxes, then right-click → Add to slide group. Groups are drawn as labelled frames; drag the label to move the group, double-click it to rename, right-click it to collapse, expand or ungroup. Collapsing is view-only and isn't saved. The slide list stays flat.

  Dashed arrows are Jump to Slide triggers and are read-only in the tree. A connection to the following slide is stored as the default (no `next`), so it keeps following the slide list when slides are reordered.

## Brands (`lib/brand.ts`, `BrandsDialog.tsx`)

A brand is a client's 6 theme colours, heading and body fonts, logo (data URL plus its aspect ratio), logo position and title style (`solid` / `light` / `minimal`).
- **Storage:** brands live in browser storage. Design → Brands creates, edits and exports/imports them as `.brand.json`. The brand a course uses is also saved in `courseSettings.brand`, so it travels with the course file.
- **Applying a brand** (`APPLY_BRAND`, undoable):
  - sets the theme colours, `courseSettings.bodyFont` / `headingFont` and the player button colour;
  - restyles every brand-managed element (`brandRole`): blueprint title bars (`titleBar` / `titleText`, plus an added `titleAccent` line for the light and minimal styles);
  - replaces the logo (`logo`, locked) on every non-quiz slide. The logo sits inside the title bar if there is one, and is larger on title slides (whose background is marked `cover`).
- **Blueprints:** the Blueprint dialog's **Brand** picker passes the brand to `blueprintToCourse`, which overrides the AI's colours and brands each slide the same way. **Blueprint elements use theme colour references (`var(--theme-*)`), not hex values**, so later theme or brand changes restyle them.
- **Fonts:** the body font is set on the slide stage of every renderer (canvas, thumbnails, exported `#stage`, video). Text with `fontRole: 'heading'` uses `var(--course-heading-font)`. Only fonts in the sanitizer's safe list are allowed, because they are written into the exported CSS.

## Undo / redo (`context/history.ts`)

`CourseProvider` runs `courseReducer` inside `withHistory`. Use Ctrl+Z / Ctrl+Y (⌘Z / ⌘⇧Z) or the arrows in the ribbon's title bar (`UndoRedo.tsx`).
- **What makes a step:** a step is recorded whenever the saved part of the course changes (slides, masters, settings, variables). Because the store is immutable, a step is just references, so 100 steps cost little memory. UI actions (selection, playhead) never make steps.
- **Merging:** rapid edits to the same thing (typing) merge into one step, as do several dispatches from one click (`GESTURE_MS`).
- **Preview and loading:** nothing is recorded in preview, and `LOAD_COURSE` starts a fresh history.
- **Background narration:** `SET_SLIDE_NARRATION` is applied to every stored version instead of becoming a step, so undo never strips voice-over.
- **Text fields:** while typing in an input, the browser's own text undo is used.
- **If you add a background action** (one the user didn't make directly), add it to `BACKGROUND` in `history.ts`.

## Autosave

`AutosaveManager.tsx` (mounted in `pages/Index.tsx`) keeps the latest course in the browser's **IndexedDB** (`lib/autosave.ts`). IndexedDB is used rather than localStorage because courses embed media and can be tens of MB, and localStorage holds about 5 MB.

- On startup, if a saved course exists, a dialog offers **Restore it** or **Start a new course** (which discards the copy). **Nothing is autosaved until that choice is made**, so the blank startup course can never overwrite the saved one.
- After that, the course is saved about a second after each change, and immediately when the tab is hidden or closed. The browser's "leave page?" prompt appears only if a save is still pending or has failed.
- The ribbon's title bar shows the status ("Saved in this browser 10:42", or "Autosave failed" in red, for example when storage is full).
- **Limits:** there is one autosave slot per browser, and two tabs editing at once overwrite each other's copy. Autosave isn't shared across computers; use Save for that.

## Publishing (`lib/publish/`)

`publish(state, options)` in `lib/publish/index.ts`:

1. Picks the LMS adapter script: `runtime/scorm12.ts`, `runtime/scorm2004.ts` or `runtime/xapi.ts`.
2. Calls `buildPlayerHtml` (`runtime/player.ts`), which produces **one self-contained `index.html`**: player CSS, the course JSON (media still embedded as data URIs), the LMS adapter and the player runtime.
3. Adds the manifest (`manifest/scorm12.ts`, `scorm2004.ts` → `imsmanifest.xml`; `tincan.ts` → `tincan.xml`), zips it with JSZip and downloads it.

> **Gotcha: the exported player is code inside a string.** `PLAYER_RUNTIME` in `player.ts` returns the player's JavaScript as a **template literal**, so it can't `import` anything, is written in ES5 style (`var`, `function`), and **backslashes must be doubled** (`\\n`, `\\{`). Use `String.fromCharCode(10)` rather than `"\n"` when in doubt. Test changes by publishing a package and opening its `index.html`.

**LMS reporting.** Scores are only sent once a quiz is scored. A course with no quiz questions reports a status but no score, so it never shows as "0%" in LMS reports. SCORM 1.2 and 2004 both report time spent (`cmi.core.session_time` / `cmi.session_time`), and SCORM 2004 sets `cmi.exit` to `suspend` until the course is complete so the LMS keeps the learner's place.

Also in this folder: `compat.ts` (warnings shown in the Publish dialog), `word.ts` (Word storyboard export using `docx`) and `video.ts` (records slides with `MediaRecorder` into MP4).

> **Video export notes.** `video.ts` plays the whole course once, in real time, painting frames on a timer (not `requestAnimationFrame`, which stalls in background tabs) while slide audio is routed into the recording. Remember the units: `slide.duration` and element times are **milliseconds**, audio durations and captions are **seconds** (mixing them up once made slide 1 "record" for 83 minutes). A silent oscillator keeps the audio track active, because an idle audio track makes Chrome cut the recording short.

## Course blueprints (`lib/blueprint.ts`)

A blueprint is a compact JSON course description, usually written by an AI from a storyboard:

- `courseBlueprintSchema` (zod) defines the layouts: `title`, `section`, `bullets`, `image-text`, `two-column`, `reveal`, `callout`, `quiz`, `results`, `hub`. Every slide may carry `narration` and `sourceRef`.
- **`hub`** contains its branches, and each branch contains its own slides (any layout except `hub`). The converter:
  - places the branch slides right after the hub;
  - generates the hub's branch buttons (`autoBranchTarget`, labelled from the blueprint);
  - points each branch's last slide back to the hub (or, for `mode: "choice"`, on to the slide after the hub);
  - sets the hub's `continueTo` to the slide after it.

  The AI never writes arrows itself.
- Each `section` slide starts a **slide group** named after it. The slides that follow it, including hub branches, join that group.
- `blueprintToCourse` converts each layout into real slides, elements and layers with fixed positions (designed for 1024×768 and scaled to the canvas). `reveal` builds one hidden layer per item, wired with Show/Hide Layer triggers.
- `narration` and `sourceRef` go into slide notes (`Narration:` / `Source:`). Narration is also voiced automatically after loading.
- `prepareBlueprintLoad` is the single path used by both the Load button and the Blueprint dialog: validate → convert → sanitize.
- **`BLUEPRINT_GUIDE`** is the text behind "Copy AI instructions". **Keep it in sync with the schema** whenever you add or change a layout.

## Storyboard → prompt, and image placeholders

- **`lib/storyboard.ts`**: Blueprint dialog → **Upload storyboard…** reads a Word storyboard in the browser (JSZip + DOMParser on `word/document.xml`, no server).
  - Table rows become `cell | cell | cell` lines, so a storyboard's columns stay together.
  - Pictures become `[Image N]` markers. The pictures themselves are kept in memory for this browser session.
  - `buildStoryboardPrompt` joins `BLUEPRINT_GUIDE`, optional notes and the storyboard text into one prompt, which is copied to the clipboard or saved as .txt.
  - `.txt` and `.md` files also work. A PDF or .doc must be saved as .docx first.
- **`lib/imageMatching.ts`** and `ImagePlaceholdersDialog.tsx` (Insert → **Image Placeholders**, also offered after a blueprint loads):
  - `findPlaceholders` lists the grey `IMAGE PLACEHOLDER` boxes, including those on pop-up layers.
  - `matchImages` pairs them with images, in this order: storyboard `[Image N]` marker, then a 5+ digit stock number in the file name, then file-name words found in the description. Each image is used only once.
  - The author can change any match. Placing swaps each placeholder for an image element (`REPLACE_SLIDE_ELEMENT`) that fits inside its box without stretching (`fitImage`). Added photos are scaled down to at most 1920 px.
  - `BLUEPRINT_GUIDE` asks the AI to copy `[Image N]` markers and stock numbers into `imageDescription`.

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
