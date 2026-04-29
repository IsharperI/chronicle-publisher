## Goal

Replace the current "Export SCORM" button + export engine with a new **Publish** system inspired by Articulate Storyline. The new system gives the author a full-screen publish dialog with multiple output targets (LMS/LRS, Web, Video, Word) and a rewritten export engine that correctly renders all slide content in the exported package.

---

## 1. Ribbon change

`src/components/authoring/Ribbon.tsx`

- Remove the existing `<RibbonButton icon={Package} label="Export SCORM" onClick={() => exportScorm(state)} />` button.
- Remove the `import { exportScorm } from '@/lib/exportScorm'` import.
- Add a new `<RibbonButton icon={Upload} label="Publish" onClick={() => setPublishOpen(true)} />` in the same Publish group.
- Render `<PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />`.

## 2. Publish dialog (new)

`src/components/authoring/PublishDialog.tsx` — full-screen overlay (fixed inset-0, z-50, backdrop blur, glass card).

Layout:

```text
+----------------------------------------------------------+
| Publish                                              [X] |
+--------+-------------------------------------------------+
| LMS/LRS|  <Right panel, switches per section>            |
| Web    |                                                 |
| Video  |                                                 |
| Word   |                                                 |
+--------+-------------------------------------------------+
                                          [Cancel] [Publish]
```

Left sidebar: 4 selectable sections, "LMS / LRS" selected by default.

### LMS / LRS panel (primary)

Form fields (local React state, persisted only for the dialog session):

- **Course Title** (Input) — pre-filled from `state.playerSettings.courseTitle`.
- **Description** (Textarea).
- **Output filename** (Input) — defaults to slugified course title; appended with `.zip`.
- **Properties summary** (read-only block): Player = course title, Quality = "Standard", Publish scope = "Entire course (N slides)".
- **Reporting and Tracking**:
  - Format dropdown: `SCORM 1.2` (default) | `SCORM 2004` | `xAPI (Tin Can)`.
  - "Reporting and Tracking..." button → opens a secondary `Dialog` with two tabs:
    - **LMS tab**: SCORM version selector (mirrors the main dropdown), Course identifier, Version, Duration (hh:mm:ss), Keywords, Lesson title, Lesson identifier, Report status select (Passed/Incomplete · Passed/Failed · Completed/Incomplete).
    - **Tracking tab**: radio group — "When learner has viewed X% of slides" (with numeric input) · "When learner completes a quiz" (select quiz slide) · "Using triggers".
    - For xAPI, the LMS tab is replaced by an **LRS tab**: Endpoint URL, Actor name, Actor mbox, Auth token (basic).
- **Compatibility check**: a `useMemo` runs `analyzeCompatibility(state, format)` returning a list of warnings (e.g. "Video element on Slide 3 may not play in some LMSs", "xAPI verbs only emitted for quiz slides", etc.). Rendered as a yellow warning card. Non-blocking.
- **Publish button** (bottom right) — calls the new export engine for the chosen format, generates the ZIP via JSZip, downloads with `file-saver`, then closes the dialog.

### Web / Video / Word panels

Simple centered "Coming soon" placeholder with a short description. No form, no publish action.

## 3. Export engine — full rewrite

Delete the contents of `src/lib/exportScorm.ts` and replace with a new modular engine:

`src/lib/publish/index.ts` — public entry: `publish(state, options)` where options include `{ format: 'scorm12' | 'scorm2004' | 'xapi', courseTitle, description, filename, identifier, version, duration, keywords, lessonTitle, lessonIdentifier, reportStatus, completion: { mode, percent?, quizSlideId? }, lrs?: { endpoint, actorName, actorMbox, authToken } }`.

`src/lib/publish/runtime/player.ts` — exports a single `buildPlayerScript(courseDataJson, opts)` that returns a self-contained JS string. The script is a faithful port of `PlayerShell.tsx` rendering logic: it walks `slides[current].elements`, renders **all element types** identically to the in-app preview:

- `text` — content, font size/weight, colors, hover colors.
- `image` — `<img>` with object-fit: contain.
- `video` — `<video>` with controls/autoplay/muted/playsinline.
- `shape` — rectangle/circle via div, triangle via inline SVG; supports embedded text, borderRadius, boxShadow, hover colors.
- `hotspot` — invisible interactive region.
- `checkbox` — input + label, defaultChecked.
- `table` — `<table>` from `cellData`, with borderColor, textColor, fontSize.
- `button` (rendered as a styled shape with text — same as in-app).

For each slide it also:

- Renders master-slide elements first (background layer) by looking up `slide.masterId` in `masterSlides`.
- Honors `slide.advanceMode` (`auto` → setTimeout to next slide on slide duration; `manual` → wait for Next click).
- Honors `slide.revisitMode` (`reset` clears per-slide runtime; `resume` keeps it).
- Plays slide entrance via `slide.transitionType` + `transitionDuration` and global `courseSettings.transition`.
- Plays slide audio (`slide.audio[]`) with caption rendering in #cc-overlay.
- Renders **quiz** slides (`slideType === 'quiz'`) with full attempt tracking, feedback (inline / overlay / jumpToSlide), skip support, attempts-exhausted behavior, `quizStyle` overrides — porting the preview quiz logic.
- Renders **results** slides (`slideType === 'results'`) by computing score from `quizResults`, comparing to `passThreshold`, displaying pass/fail message, and reporting to LMS.

Canvas dimensions are taken straight from `state.courseSettings.canvasDimensions`. The `#stage` element is set to those exact px and scaled with `transform: scale(min(wrapperW/dimsW, wrapperH/dimsH))` on load + resize.

`src/lib/publish/runtime/scorm12.ts` — emits SCORM 1.2 API wrapper:

- `LMSInitialize("")` on load, `LMSFinish("")` on `beforeunload`.
- `LMSSetValue("cmi.core.lesson_status", ...)` on completion (per chosen Tracking option).
- `LMSSetValue("cmi.core.score.raw", ...)` after results slide.

`src/lib/publish/runtime/scorm2004.ts` — emits SCORM 2004 API wrapper:

- `Initialize("")`, `Terminate("")`.
- `SetValue("cmi.completion_status", ...)`, `SetValue("cmi.success_status", ...)`.
- `SetValue("cmi.score.scaled", ...)` (0–1).

`src/lib/publish/runtime/xapi.ts` — emits xAPI wrapper:

- POSTs `initialized`, `progressed` (per slide), `completed` statements to the configured `endpoint` with `Authorization: Basic <token>` and the actor JSON from settings.

`src/lib/publish/manifest/scorm12.ts` — `imsmanifest.xml` (current schema, generalized to use `identifier`, `version`, `lessonTitle`).

`src/lib/publish/manifest/scorm2004.ts` — `imsmanifest.xml` with SCORM 2004 schemas (`adlcp_v1p3`, `adlseq_v1p3`, `adlnav_v1p3`, `imscp_v1p1`).

`src/lib/publish/manifest/tincan.ts` — `tincan.xml` with activity definition built from course settings.

`src/lib/publish/zip.ts` — assembles the ZIP:

- `index.html` (built from `buildPlayerHtml(state, opts)` — uses real canvas dims, theme vars, sidebar, controls, quiz/results runtime).
- Manifest file(s) for the chosen format.
- Media: images, video, audio remain inline as base64 data URIs (kept inside the JSON blob embedded in `index.html`) — this keeps everything self-contained and uses relative paths only for the manifest. No separate media folder is needed because every asset is already a data URI in the course state, matching what the preview player consumes.

`src/lib/publish/compat.ts` — `analyzeCompatibility(state, format)` returns an array of warning strings. Examples:

- video element + xAPI: "Inline video assets exceed typical LRS payload size."
- audio + SCORM 1.2: no warning.
- quiz slide without results slide: "Course has quiz slides but no Results slide; completion will not be reported."

## 4. Files

**Edited**
- `src/components/authoring/Ribbon.tsx` — swap button, mount PublishDialog.

**Created**
- `src/components/authoring/PublishDialog.tsx`
- `src/lib/publish/index.ts`
- `src/lib/publish/zip.ts`
- `src/lib/publish/compat.ts`
- `src/lib/publish/runtime/player.ts`
- `src/lib/publish/runtime/scorm12.ts`
- `src/lib/publish/runtime/scorm2004.ts`
- `src/lib/publish/runtime/xapi.ts`
- `src/lib/publish/manifest/scorm12.ts`
- `src/lib/publish/manifest/scorm2004.ts`
- `src/lib/publish/manifest/tincan.ts`

**Deleted**
- `src/lib/exportScorm.ts` (entirely replaced by `src/lib/publish/*`).

## 5. Out of scope

- No backend/LRS hosting — xAPI just POSTs to the user-supplied endpoint at runtime in the published package.
- Web / Video / Word exports are placeholder panels only.
- No changes to the editor, canvas, timeline, quiz authoring, or any other feature.
