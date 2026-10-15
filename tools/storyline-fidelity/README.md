# Storyline import fidelity checker

Measures how closely Chronicle reproduces an Articulate Storyline course after import, slide by slide.

It takes a `.story` file and the Storyline **Web** publish of that same file, then:

1. opens the published course in a headless browser and screenshots every slide at 25%, 50% and 75% of its timeline and shortly before its end (`capture-storyline.mjs`),
2. imports the `.story` into Chronicle through Home → Storyline (the real importer, `src/lib/storyImport`) and screenshots the same slides in Preview at the same moments (`capture-chronicle.mjs`),
3. scores each pair out of 100 and writes a side-by-side report with a difference heat map (`compare.py`).

Two scores come out: **layout** (the end of each slide) and **timing** (the moments during it, which show whether things appear, animate and disappear when they should).

The average score is the number to push up as the importer and Chronicle improve.

## Running it

```bash
npm run dev                                   # Chronicle dev server (the checker needs a dev build)
tools/storyline-fidelity/run.sh course.story course-web-output.zip runs/my-course "My course"
open runs/my-course/report.html
```

Set `CHRONICLE_URL` if the dev server isn't on `http://localhost:8080/`, and `CHROMIUM` to use a specific browser binary.
Needs Node (Playwright comes with the project's dev dependencies) and Python 3 with `numpy`, `Pillow` and `scikit-image`.

## Rules

- **Never commit course files.** Client courses stay out of this public repo. `fixtures/`, `runs/`, `*.story` and `*.zip` are git-ignored here.
- The `.story` and the web output must come from the **same version** of the course, or every edit shows up as a mismatch.

## How the score works

Both screenshots are scaled to 640×360. The score is 60% structural similarity (layout, shapes and text blocks, compared in greyscale) plus 40% colour closeness. Roughly: 85+ looks right, 70–85 is recognisably the same slide with visible differences, below 70 is missing important content.

Storyline slides are reached the same way the player's own "jump to slide" triggers work, so courses with restricted navigation can still be captured, and the course's own automatic slide changes are blocked while capturing. Both sides are paused at each moment; the end capture is 250 ms before the slide's end. Chronicle's entrance/exit animations are frozen at the point they'd have reached at that moment, as Storyline's seek does. Audio isn't checked (screenshots can't hear); it's covered by unit tests. Question-bank slides that the importer doesn't bring across yet are listed as "Not imported".

## Progress

Layout scores:

| | Prototype converter | Phase 1 importer |
|---|---|---|
| Course A (36-slide production template) | 74.6 | 87.7 |
| Course B (19-slide technical course) | 58.0 | 86.0 |

Timing scores (added with the timeline phase):

| | Phase 1 importer | Timeline phase | States phase |
|---|---|---|---|
| Course A | 88.3 | 88.5 | 88.7 |
| Course B | 85.7 | 86.5 | 86.8 |

Layout after the states phase: Course A 87.9, Course B 86.4. Most of what states change happens on interaction (hover, clicks), which screenshots of the untouched slide don't see; it's covered by unit tests.

## Output

- `report.html`: the side-by-side report (sort by slide order or worst first)
- `scores.json`: average and per-slide scores, for tracking progress over time
- `import-report.json`: the importer's report (what it couldn't convert or approximated)
- `storyline/`, `chronicle/`: the raw screenshots
