// Capture one screenshot per slide from a Storyline web (HTML5) output.
// Usage: node capture-storyline.mjs <story.html URL> <out dir> [chromium path]
// Each slide is opened directly, its timeline is paused near the end, and the slide area is captured.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [url, outDir, exe = '/opt/pw-browsers/chromium'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(url);
await page.waitForFunction(() => window.DS && window.DS.windowManager && window.DS.windowManager.getCurrentWindowSlide(), null, { timeout: 60000 });
await page.waitForTimeout(1500);

const slides = await page.evaluate(() =>
  window.DS.presentation.getFlatSlides()
    .filter((s) => !/MsgScene|PromptScene/.test(s.absoluteId))
    .map((s) => ({ id: s.id, absoluteId: s.absoluteId, title: (s.get('title') || '').replace(/<[^>]+>/g, '').trim() })),
);
console.log(`${slides.length} slides`);

const manifest = [];
for (const [i, s] of slides.entries()) {
  const ok = await page.evaluate(async (abs) => {
    const DS = window.DS;
    // Same request the player's own "jump to slide" triggers send.
    DS.pubSub.trigger(DS.events.request.NEXT_SLIDE, abs);
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const cur = DS.windowManager.getCurrentWindowSlide();
      if (cur && cur.absoluteId === abs) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const cur = DS.windowManager.getCurrentWindowSlide();
    if (!cur || cur.absoluteId !== abs) return `ended up on ${cur ? cur.absoluteId : 'nothing'}`;
    await new Promise((r) => setTimeout(r, 600));
    try {
      const tl = cur.currentTimeline();
      tl.pause();
      const dur = tl.get('duration') || 0;
      tl.seek(Math.max(0, dur - 50));
      tl.pause();
    } catch (e) { /* some slides have no timeline */ }
    return true;
  }, s.absoluteId);
  if (ok !== true) { console.log('could not open', s.absoluteId, ok); continue; }
  // let images and fonts settle
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  const box = await page.evaluate(() => {
    const el = document.querySelector('.primary-slide') || document.querySelector('.slide-container');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const file = `${String(i + 1).padStart(3, '0')}_${s.id}.png`;
  await page.screenshot({ path: path.join(outDir, file), clip: box || undefined });
  manifest.push({ ...s, index: i + 1, file });
  process.stdout.write('.');
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\ncaptured ${manifest.length}`);
await browser.close();
