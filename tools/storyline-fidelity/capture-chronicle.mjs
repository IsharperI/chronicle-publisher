// Capture one screenshot per slide of a Chronicle project, as the editor shows it near the end of each slide's timeline.
// Usage: node capture-chronicle.mjs <Chronicle dev URL> <project.json> <out dir> [chromium path]
// Needs a development build of Chronicle (it uses the window.__chronicle test hook).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, projectFile, outDir, exe = '/opt/pw-browsers/chromium'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 2200, height: 1500 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__chronicle, null, { timeout: 60000 });
// Load through the normal Home → Load path so the file goes through Chronicle's sanitizer.
await page.locator('input[type=file][accept=".json"]').first().setInputFiles(projectFile);
const expected = JSON.parse(fs.readFileSync(projectFile, 'utf8')).slides.length;
await page.waitForFunction((n) => window.__chronicle.getState().slides.length === n, expected, { timeout: 120000 });
await page.evaluate(() => window.__chronicle.dispatch({ type: 'SET_SHOW_GRID', value: false }));

const slides = await page.evaluate(() => window.__chronicle.getState().slides.map((s) => ({ id: s.id, title: s.title || '', duration: s.duration })));
const manifest = [];
for (const [i, s] of slides.entries()) {
  await page.evaluate(([index, dur]) => {
    const c = window.__chronicle;
    c.dispatch({ type: 'SET_ACTIVE_SLIDE', index });
    c.dispatch({ type: 'SET_ACTIVE_ELEMENT', id: null });
    c.dispatch({ type: 'SET_PLAYHEAD', time: Math.max(0, dur - 50) });
  }, [i, s.duration]);
  await page.waitForTimeout(400);
  const canvas = page.locator('.canvas-glow').first();
  const file = `${String(i + 1).padStart(3, '0')}_${s.id}.png`;
  await canvas.screenshot({ path: path.join(outDir, file) });
  manifest.push({ ...s, index: i + 1, file });
  process.stdout.write('.');
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\ncaptured ${manifest.length}`);
await browser.close();
