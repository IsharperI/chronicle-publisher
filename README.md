# Chronicle Publisher

A browser-based eLearning authoring tool, in the spirit of Articulate Storyline. Authors build slide-based courses (text, shapes, images, video, audio, quizzes, layers, triggers, variables) and publish them as **SCORM 1.2**, **SCORM 2004** or **xAPI** packages for an LMS, or as a Word document or video.

Everything runs in the browser. There is no backend or database. Courses are saved and loaded as `.json` files.

## Main features

- **Slide editor:** drag-and-drop canvas, timeline, layers, master slides, theme colors, transitions, entrance/exit animations and motion paths.
- **Interactivity:** triggers (click, hover, timeline, media events), course variables with conditions, layers that can be shown and hidden, lightboxes.
- **Quizzes:** multiple choice, drag-and-drop matching and sorting, attempts, timers, feedback, a results slide, quiz style templates and a question bank.
- **Course blueprints:** paste a compact JSON "blueprint" (usually written by an AI from a storyboard) and Chronicle builds the whole course. Layouts include title, section, bullets, image + text, two columns, callout, click-to-reveal lightboxes, quiz and results. The **Copy AI instructions** button gives any AI chat (Claude, Gemini, …) the format.
- **Text-to-speech narration:** free, in-browser voices (Kokoro). Blueprints are narrated automatically; **Insert → Text to Speech** narrates a single slide. Captions are generated too.
- **Captions from audio:** Whisper speech recognition, in the browser.
- **Publishing:** SCORM 1.2 / 2004 / xAPI zip, Word (.docx) storyboard export, and MP4 video export.

## Running it locally

Requires Node.js 18+ (or Bun).

```sh
npm install        # or: bun install
npm run dev        # starts the editor at http://localhost:8080
npm test           # unit tests (Vitest)
npm run build      # production build into dist/
```

## How changes get to the live app

The project is connected to [Lovable](https://lovable.dev), which builds and hosts it.

1. Changes land on the `main` branch, either through Lovable or by merging a GitHub pull request.
2. Lovable syncs from `main` automatically.
3. **Click _Publish_ in Lovable** to update the live site. Merging alone only updates the Lovable editor preview.
4. Hard-refresh the site (Ctrl+Shift+R) to make sure the browser isn't showing a cached version.

## For developers

Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** before changing code. It covers how a course is stored, how the editor, preview and exported player relate, the blueprint and text-to-speech pipelines, and a list of hard-won gotchas.
