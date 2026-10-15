# Storyline import work: handoff notes

This is the brief for a new Claude session continuing the Storyline-compatibility work. Read this file first. Read `docs/ARCHITECTURE.md` only for the sections you need.

## How we work
- The owner is a non-programmer. Edit this repo directly and use **one branch and one pull request per phase**. She merges on GitHub and republishes in Lovable. Don't give her Lovable prompts.
- Keep replies short and plain. End each phase with what changed for authors, the scores, and the PR link.
- **Saving usage matters.** Don't read whole large files: use `grep -n` and read only the line ranges you need. `Canvas.tsx`, `PropertiesPanel.tsx`, `player.ts` and `storyImport/index.ts` are 1,000–2,000 lines each. Run only the tests you touched until the end, then run the full suite once. Run the fidelity checker once, at the end of a phase, and only if the phase changes how slides look. Don't take screenshots unless you need to check a UI change.
- **The repo is public.** Never commit course files (`.story` files, web outputs, screenshots of client slides). Don't name client courses in files or PRs; call them "Course A" (36-slide production template) and "Course B" (19-slide technical course).

## Setup in a fresh session
```bash
npm install                      # if npm ci complains about the lockfile; don't commit package-lock changes
npx tsc --noEmit -p tsconfig.app.json
npx vitest run src/test/<file>   # targeted; full suite: npx vitest run
```
- **Git:** for a shallow clone, run `git checkout -b <branch>`, then `git config --add remote.origin.fetch '+refs/heads/<branch>:refs/remotes/origin/<branch>'`, then `git push -u origin <branch>`.
- **Open PRs with** `gh api repos/IsharperI/chronicle-publisher/pulls -f title=… -f head=<branch> -f base=main -F body=@file` (`gh pr create` doesn't work here).
- **Commit with** `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, plus the attribution lines the session gives you.
- **Real courses** are only available if the owner attaches them to the chat: the `.story` file and the matching Storyline **Web** publish zip. They stay in the session's scratchpad, never in the repo.
  - Import check: `STORY_FIXTURES=a.story,b.story npx vitest run src/test/storyImport.fixture.test.ts`. It prints the import report and takes about 15 s.
  - Fidelity checker (slow, a few minutes): start `npx vite --port 5180` in the background, then run `CHRONICLE_URL=http://127.0.0.1:5180/ tools/storyline-fidelity/run.sh <story> <web.zip> <out> "Course A"`.

## Where things are
| What | Where |
|---|---|
| Importer (.story → course) | `src/lib/storyImport/index.ts`. The header comment lists the mapping. Test: `src/test/storyImport.test.ts` (a synthetic .story built in code; extend it for new mappings) |
| Data model, allow-list | `src/types/course.ts`. **Every new field must also be added to `src/lib/sanitize.ts`, or it is dropped on load.** |
| Renderers (keep in sync) | `Canvas.tsx` (editor and Preview), `SlidePanel.tsx` ThumbElement, `lib/publish/runtime/player.ts` (published player, plain JS in a template string: escape backslashes), `lib/publish/video.ts` |
| States | `src/lib/states.ts` (shared rules; the player has a JS copy), `StatesPanel.tsx`, test `src/test/states.test.ts` (it also shows how to boot the published player in a test) |
| Store | `src/context/CourseContext.tsx` (reducer; use the layer helpers when editing elements) |
| Checker | `tools/storyline-fidelity/` (README explains the scoring) |

**.story format reminders:**
- A .story file is a zip of XML: `story/story.xml` and `story/slides/*.xml`.
- Each state is a full copy of the object (the child named by the state's `defG`). Objects added to a state sit next to that copy, positioned relative to the object.
- Font px = FontSize × 16/9.
- Storyline's own timeline length is `tmProps@min`.
- Trigger data lives in `trig/data` (`event`, `action`, `actSubType`) and child elements such as `shape`, `other` and `sldLayer`. To see how a feature is stored, grep the fixture XML.

## Status
Done:
- Phase 0: checker
- Phase 1: importer
- Timeline phase: audio timing and animations
- Phase 2: object states, state triggers, Storyline-style state editing (PR #28)

Scores (layout / timing):

| Course | Layout | Timing |
|---|---|---|
| Course A | 87.9 | 88.7 |
| Course B | 86.4 | 86.8 |

## Remaining phases (in suggested order)
1. **Next/Prev button control.** Import "change state of the player's Next button" triggers (`changeShapeState` with no `setStateG`; seen as `OnStart` → Disabled, then `OnStateChange` → Normal once all are Visited). This needs a Chronicle action that disables or enables the player's Next (and Prev) buttons, in Preview (`PlayerShell.tsx`) and in the player (`setNavLock`). Also covers "Jump to previous slide" (`jumpToSlide` with `actSubType="prev"`). No checker run needed.
2. **Drag and drop.** Storyline `OnDrop` triggers (`shape/dropLst`, `hoverLst`), "Drag Correct/Incorrect/Dropped" states, and freeform drag-and-drop questions (`dragDropIntr`). Chronicle needs draggable objects with drop targets and drop events. This is a big phase.
3. **Freeform shapes, diagonal lines, arrows, imported vector graphics** (`freeForm`, `importedVector`, `shapePath`, `line` that isn't horizontal or vertical). Likely a new SVG-path shape element. This is the largest remaining visual gap: run the checker.
4. **Text and style details:**
   - mixed formatting within one text box (bold or colour runs)
   - text showing variable values (`%VarName%`)
   - rotation
   - gradients
   - rounding on only some corners

   Run the checker.
5. **Quizzes:** question slides with scoring (freeform pick-one and pick-many, submit interaction, result slides, question banks).
6. **Motion paths:** `linePath` objects and the "Move along motion path" action. Chronicle already has a bezier `motionPath`.
7. **Import from published output only** (courses with no .story): read `html5/data/js/*.js` (`window.globalProvideData('slide', …)`).
