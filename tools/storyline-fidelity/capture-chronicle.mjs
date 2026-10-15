// Import a Storyline .story into Chronicle (Home → Storyline) and capture each slide as Preview shows
// it (what learners see), paused at the same moments as the Storyline capture.
// Usage: node capture-chronicle.mjs <Chronicle dev URL> <file.story | project.json> <out dir> [storyline manifest.json] [chromium path]
// Without a Storyline manifest, only the end of each slide is captured.
// A .json project is loaded through Home → Load instead. Needs a development build of Chronicle
// (it uses the window.__chronicle test hook).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, inputFile, outDir, momentsFile, exe = '/opt/pw-browsers/chromium'] = process.argv.slice(2);
const moments = new Map(momentsFile && fs.existsSync(momentsFile) ? JSON.parse(fs.readFileSync(momentsFile, 'utf8')).map((m) => [m.id, m.shots || []]) : []);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 2200, height: 1500 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__chronicle, null, { timeout: 60000 });

const t0 = Date.now();
if (inputFile.endsWith('.json')) {
  // Load through the normal Home → Load path so the file goes through Chronicle's sanitizer.
  await page.locator('input[type=file][accept=".json"]').first().setInputFiles(inputFile);
  const expected = JSON.parse(fs.readFileSync(inputFile, 'utf8')).slides.length;
  await page.waitForFunction((n) => window.__chronicle.getState().slides.length === n, expected, { timeout: 120000 });
} else {
  await page.getByRole('button', { name: 'Storyline' }).click();
  await page.locator('input[type=file][accept=".story,.zip"]').setInputFiles(inputFile);
  await page.waitForFunction(() => window.__chronicleLastImport, null, { timeout: 600000 });
  const report = await page.evaluate(() => window.__chronicleLastImport);
  fs.writeFileSync(path.join(outDir, '..', 'import-report.json'), JSON.stringify(report, null, 1));
  await page.getByRole('button', { name: 'Done' }).click();
  console.log(`imported in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
await page.evaluate(() => {
  window.__chronicle.dispatch({ type: 'SET_SHOW_GRID', value: false });
  window.__chronicle.dispatch({ type: 'SET_PREVIEW_MODE', enabled: true });
});
await page.waitForTimeout(500);

const slides = await page.evaluate(() => window.__chronicle.getState().slides.map((s) => ({ id: s.id, title: s.title || '', duration: s.duration })));
const manifest = [];
for (const [i, s] of slides.entries()) {
  await page.evaluate((index) => window.__chronicle.dispatch({ type: 'SET_ACTIVE_SLIDE', index }), i);
  // Preview starts each slide playing from 0; once it has, pause it and move to each moment.
  const theirs = moments.get(s.id);
  const plan = theirs && theirs.length ? theirs.map((m) => ({ t: m.t, end: m.end })) : [{ t: Math.max(0, s.duration - 250), end: true }];
  const shots = [];
  for (const { t, end } of plan) {
    for (let tries = 0; tries < 10; tries++) {
      await page.waitForTimeout(tries ? 250 : 150);
      await page.evaluate((ms) => {
        const c = window.__chronicle;
        c.dispatch({ type: 'SET_PLAYING', playing: false });
        c.dispatch({ type: 'SET_PLAYHEAD', time: ms });
      }, t);
      await page.waitForTimeout(150);
      const st = await page.evaluate(() => { const g = window.__chronicle.getState(); return { p: g.isPlaying, t: g.playheadTime, i: g.activeSlideIndex }; });
      if (!st.p && Math.abs(st.t - t) < 1 && st.i === i) break;
    }
    // Entrance/exit animations are CSS animations that run in real time even while paused.
    // Freeze each one at the point it would have reached at this moment (as Storyline's seek does).
    await page.evaluate((ms) => {
      const st = window.__chronicle.getState();
      const slide = st.slides[st.activeSlideIndex];
      const all = [...(slide.layers || []).flatMap((l) => l.elements), ...(slide.elements || [])];
      const byId = new Map(all.map((e) => [e.id, e]));
      for (const node of document.querySelectorAll('.canvas-glow [data-el-id]')) {
        const el = byId.get(node.getAttribute('data-el-id'));
        if (!el || !getComputedStyle(node).animationName || getComputedStyle(node).animationName === 'none') continue;
        const endT = el.startTime + el.duration;
        const inDur = el.entranceDuration ?? 500, outDur = el.exitDuration ?? 500;
        const into = ms < el.startTime + inDur ? ms - el.startTime : ms - (endT - outDur);
        node.style.animationDelay = `${-Math.max(0, into)}ms`;
        node.style.animationPlayState = 'paused';
      }
    }, t);
    await page.waitForTimeout(end ? 500 : 350);
    const file = `${String(i + 1).padStart(3, '0')}_${s.id}${end ? '' : `_t${t}`}.png`;
    await page.locator('.canvas-glow').first().screenshot({ path: path.join(outDir, file) });
    shots.push({ t, file, end });
  }
  manifest.push({ ...s, index: i + 1, file: shots[shots.length - 1].file, shots });
  process.stdout.write('.');
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\ncaptured ${manifest.length}`);
await browser.close();
