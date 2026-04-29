import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { CourseState } from '@/types/course';
import type { PublishOptions } from './types';
import { buildPlayerHtml } from './runtime/player';
import { buildScorm12Runtime } from './runtime/scorm12';
import { buildScorm2004Runtime } from './runtime/scorm2004';
import { buildXapiRuntime } from './runtime/xapi';
import { buildScorm12Manifest } from './manifest/scorm12';
import { buildScorm2004Manifest } from './manifest/scorm2004';
import { buildTinCanManifest } from './manifest/tincan';

function slugify(s: string): string {
  return (s || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'course';
}

export async function publish(state: CourseState, opts: PublishOptions): Promise<void> {
  let lmsRuntime = '';
  if (opts.format === 'scorm12') lmsRuntime = buildScorm12Runtime();
  else if (opts.format === 'scorm2004') lmsRuntime = buildScorm2004Runtime();
  else if (opts.format === 'xapi') {
    lmsRuntime = buildXapiRuntime({
      endpoint: opts.lrs?.endpoint || '',
      actorName: opts.lrs?.actorName || 'Learner',
      actorMbox: opts.lrs?.actorMbox || 'mailto:learner@example.com',
      authToken: opts.lrs?.authToken || '',
      activityId: opts.identifier || `https://chronicle.publisher/course/${Date.now()}`,
      activityName: opts.courseTitle || 'eLearning Course',
    });
  }

  const html = buildPlayerHtml(state, opts, lmsRuntime);
  const zip = new JSZip();
  zip.file('index.html', html);

  if (opts.format === 'scorm12') {
    zip.file('imsmanifest.xml', buildScorm12Manifest({
      identifier: opts.identifier,
      version: opts.version,
      title: opts.courseTitle,
      lessonTitle: opts.lessonTitle,
    }));
  } else if (opts.format === 'scorm2004') {
    zip.file('imsmanifest.xml', buildScorm2004Manifest({
      identifier: opts.identifier,
      version: opts.version,
      title: opts.courseTitle,
      lessonTitle: opts.lessonTitle,
    }));
  } else if (opts.format === 'xapi') {
    zip.file('tincan.xml', buildTinCanManifest({
      identifier: opts.identifier,
      title: opts.courseTitle,
      description: opts.description,
      launch: 'index.html',
    }));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = (opts.filename && opts.filename.trim()) || `${slugify(opts.courseTitle)}-${opts.format}.zip`;
  const finalName = filename.endsWith('.zip') ? filename : `${filename}.zip`;
  saveAs(blob, finalName);
}

export type { PublishOptions } from './types';
