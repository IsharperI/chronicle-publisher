/**
 * Pre-publish compatibility warnings shown in the Publish dialog (embedded
 * video/audio size, quiz/results presence for the chosen tracking mode, …).
 */
import type { CourseState } from '@/types/course';
import type { PublishFormat } from './types';

export function analyzeCompatibility(state: CourseState, format: PublishFormat): string[] {
  const warnings: string[] = [];
  const slides = state.slides || [];

  let videoCount = 0;
  let audioCount = 0;
  let totalDataUriBytes = 0;
  let hasQuiz = false;
  let hasResults = false;

  for (const s of slides) {
    if (s.slideType === 'quiz') hasQuiz = true;
    if (s.slideType === 'results') hasResults = true;
    for (const a of s.audio || []) {
      audioCount++;
      if (typeof a.src === 'string' && a.src.startsWith('data:')) totalDataUriBytes += a.src.length;
    }
    for (const el of s.elements || []) {
      if (el.type === 'video') {
        videoCount++;
        if (typeof (el as { src?: string }).src === 'string') totalDataUriBytes += ((el as { src: string }).src).length;
      } else if (el.type === 'image') {
        if (typeof (el as { src?: string }).src === 'string') totalDataUriBytes += ((el as { src: string }).src).length;
      }
    }
  }

  if (slides.length === 0) {
    warnings.push('Course has no slides — the published package will be empty.');
  }
  if (hasQuiz && !hasResults) {
    warnings.push('Course has quiz slides but no Results slide. Score will not be reported to the LMS.');
  }
  if (format === 'xapi') {
    if (videoCount > 0) {
      warnings.push(`Course contains ${videoCount} video element${videoCount === 1 ? '' : 's'} embedded as data URIs. Inline video may exceed the LRS payload size.`);
    }
    if (!hasQuiz) {
      warnings.push('No quiz slides detected. Only completion statements will be sent to the LRS.');
    }
  }
  if (format === 'scorm12' && totalDataUriBytes > 50 * 1024 * 1024) {
    warnings.push('Total media exceeds 50MB. Some legacy SCORM 1.2 LMSs may reject large packages.');
  }
  if (format === 'scorm2004' && audioCount === 0 && videoCount === 0) {
    // no warning
  }
  return warnings;
}
