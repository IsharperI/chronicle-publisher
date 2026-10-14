// Import a Storyline .story into Chronicle (Home → Storyline) and capture one screenshot per slide,
// as Preview shows it (what learners see) near the end of each slide's timeline.
// Usage: node capture-chronicle.mjs <Chronicle dev URL> <file.story | project.json> <out dir> [chromium path]
// A .json project is loaded through Home → Load instead. Needs a development build of Chronicle
// (it uses the window.__chronicle test hook).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, inputFile, outDir, exe = '/opt/pw-browsers/chromium'] = process.argv.slice(2);
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
  // Preview starts each slide playing from 0; once it has, pause it near the end of the timeline.
  const target = Math.max(0, s.duration - 250);
  for (let tries = 0; tries < 10; tries++) {
    await page.waitForTimeout(250);
    await page.evaluate((t) => {
      const c = window.__chronicle;
      c.dispatch({ type: 'SET_PLAYING', playing: false });
      c.dispatch({ type: 'SET_PLAYHEAD', time: t });
      return c.getState().playheadTime;
    }, target);
    await page.waitForTimeout(150);
    const still = await page.evaluate(() => window.__chronicle.getState());
    if (!still.isPlaying && Math.abs(still.playheadTime - target) < 1 && still.activeSlideIndex === i) break;
  }
  await page.waitForTimeout(500);
  const canvas = page.locator('.canvas-glow').first();
  const file = `${String(i + 1).padStart(3, '0')}_${s.id}.png`;
  await canvas.screenshot({ path: path.join(outDir, file) });
  manifest.push({ ...s, index: i + 1, file });
  process.stdout.write('.');
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\ncaptured ${manifest.length}`);
await browser.close();
