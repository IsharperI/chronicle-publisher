/**
 * Options passed from the Publish dialog to publish(): format, metadata,
 * completion/reporting rules and xAPI LRS settings.
 */
export type PublishFormat = 'scorm12' | 'scorm2004' | 'xapi';
export type ReportStatus = 'passed-incomplete' | 'passed-failed' | 'completed-incomplete';
export type CompletionMode = 'percent' | 'quiz' | 'triggers';

export interface LrsConfig {
  endpoint: string;
  actorName: string;
  actorMbox: string;
  authToken: string;
}

export interface PublishOptions {
  format: PublishFormat;
  courseTitle: string;
  description: string;
  filename: string;
  identifier: string;
  version: string;
  duration: string;
  keywords: string;
  lessonTitle: string;
  lessonIdentifier: string;
  reportStatus: ReportStatus;
  completion: { mode: CompletionMode; percent?: number; quizSlideId?: string };
  lrs?: LrsConfig;
}
