// Capture screenshots of every slide of a Storyline web (HTML5) output: at 25%, 50% and 75% of
// each slide's timeline (to check timing and animations) and just before its end (layout).
// Usage: node capture-storyline.mjs <story.html URL> <out dir> [chromium path]
// Each slide is opened directly; its timeline is paused and moved to each moment in turn.
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
    // Block the course's own slide changes (e.g. "jump to next slide when the timeline
    // ends") so each slide stays put while it's captured.
    if (!window.__jumpGate) {
      window.__jumpGate = true;
      const trig = DS.pubSub.trigger.bind(DS.pubSub);
      const blocked = new Set([DS.events.request.NEXT_SLIDE, DS.events.request.PREV_SLIDE, DS.events.request.NEXT_DRAW_SLIDE]);
      DS.pubSub.trigger = (ev, ...rest) => (blocked.has(ev) && !window.__allowJump ? undefined : trig(ev, ...rest));
    }
    // Same request the player's own "jump to slide" triggers send.
    window.__allowJump = true;
    DS.pubSub.trigger(DS.events.request.NEXT_SLIDE, abs);
    window.__allowJump = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const cur = DS.windowManager.getCurrentWindowSlide();
      if (cur && cur.absoluteId === abs) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const cur = DS.windowManager.getCurrentWindowSlide();
    if (!cur || cur.absoluteId !== abs) return `ended up on ${cur ? cur.absoluteId : 'nothing'}`;
    await new Promise((r) => setTimeout(r, 600));
    try { cur.currentTimeline().pause(); } catch (e) { /* some slides have no timeline */ }
    return true;
  }, s.absoluteId);
  if (ok !== true) { console.log('could not open', s.absoluteId, ok); continue; }
  // let images and fonts settle
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  const still = await page.evaluate((abs) => window.DS.windowManager.getCurrentWindowSlide()?.absoluteId === abs, s.absoluteId);
  if (!still) { console.log('slide moved on before capture:', s.absoluteId); continue; }
  const box = await page.evaluate(() => {
    const el = document.querySelector('.primary-slide') || document.querySelector('.slide-container');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const duration = await page.evaluate(() => {
    try { return window.DS.windowManager.getCurrentWindowSlide().currentTimeline().get('duration') || 0; } catch (e) { return 0; }
  });
  // The moments: three through the slide, and 250 ms before the end. Stopping short of the end
  // avoids the course's own "when the timeline ends" triggers.
  const end = Math.max(0, duration - 250);
  const times = [...new Set([0.25, 0.5, 0.75].map((f) => Math.round((duration * f) / 100) * 100).filter((t) => t < end))];
  const shots = [];
  for (const t of [...times, end]) {
    await page.evaluate((ms) => {
      try { const tl = window.DS.windowManager.getCurrentWindowSlide().currentTimeline(); tl.seek(ms); tl.pause(); } catch (e) { /* no timeline */ }
    }, t);
    await page.waitForTimeout(t === end ? 500 : 350);
    const file = `${String(i + 1).padStart(3, '0')}_${s.id}${t === end ? '' : `_t${t}`}.png`;
    await page.screenshot({ path: path.join(outDir, file), clip: box || undefined });
    shots.push({ t, file, end: t === end });
  }
  manifest.push({ ...s, index: i + 1, duration, file: shots[shots.length - 1].file, shots });
  process.stdout.write('.');
}
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`\ncaptured ${manifest.length}`);
await browser.close();
