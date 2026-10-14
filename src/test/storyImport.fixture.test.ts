/**
 * Runs the Storyline importer on real .story files when STORY_FIXTURES points
 * at them (comma-separated paths). Client courses can't live in this public
 * repo, so this is skipped in normal test runs.
 *   STORY_FIXTURES=/path/a.story,/path/b.zip npx vitest run src/test/storyImport.fixture.test.ts
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { importStory } from '@/lib/storyImport';
import { sanitizeProject } from '@/lib/project';

const files = (process.env.STORY_FIXTURES ?? '').split(',').filter(Boolean);

describe.skipIf(!files.length)('importStory on real courses', () => {
  for (const f of files) {
    it(`imports ${f.split('/').pop()}`, async () => {
      const { payload, report } = await importStory(new Uint8Array(fs.readFileSync(f)));
      const clean = sanitizeProject(payload)!;
      expect(clean.slides.length).toBe(payload.slides.length);
      if (process.env.STORY_DUMP) {
        fs.writeFileSync(`${process.env.STORY_DUMP}/${f.split('/').pop()}.json`, JSON.stringify(payload));
        fs.writeFileSync(`${process.env.STORY_DUMP}/${f.split('/').pop()}.report.json`, JSON.stringify(report, null, 1));
      }
      console.log(JSON.stringify({ ...report, issues: report.issues.map((i) => `${i.kind} ${i.count}× ${i.message}`) }, null, 1));
    }, 300_000);
  }
});
