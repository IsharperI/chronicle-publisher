/**
 * The course data model, the best place to start reading.
 *
 * Everything in a course file is described here. Notes:
 * - Times: slide.duration and element startTime/duration are milliseconds;
 *   audio duration and caption times are seconds.
 * - Slides keep elements in `layers` (source of truth); `elements` is a
 *   flattened copy maintained by the reducer (context/CourseContext.tsx).
 * - Adding a field? Also add it to lib/sanitize.ts, or it is dropped when a
 *   course is loaded from a file.
 */
export type ElementType = 'text' | 'image' | 'shape' | 'video' | 'hotspot' | 'checkbox' | 'table';
export type ShapeType =
  | 'rectangle'
  | 'circle'
  | 'triangle'
  | 'rounded-rectangle'
  | 'right-triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'parallelogram'
  | 'trapezoid'
  | 'cross'
  | 'l-shape'
  | 'arrow-right'
  | 'arrow-left'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left-right'
  | 'arrow-up-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'bent-arrow-right'
  | 'bent-arrow-left'
  | 'circular-arrow'
  | 'callout-rectangle'
  | 'callout-rounded'
  | 'callout-oval'
  | 'thought-bubble'
  | 'star-4point'
  | 'star-5point'
  | 'star-6point'
  | 'star-8point'
  | 'burst-4'
  | 'burst-8';
export type AnimationIn = 'none' | 'fade' | 'fly-in-left' | 'fly-in-right';
export type AnimationOut = 'none' | 'fade' | 'fly-out-left' | 'fly-out-right';
export type ViewMode = 'main' | 'master';

export interface Trigger {
  /** 'onClick' | 'onHover' | 'timelineStart' | 'timelineEnd' | 'atTime' | 'mediaStart' | 'mediaEnd' | 'mediaPause' */
  event: string;
  /** 'jumpToSlide' | 'showElement' | 'hideElement' | 'playMedia' | 'pauseMedia' | 'stopMedia' | 'restartCourse' | 'exitCourse' | 'completeCourse' | 'jumpToTime' | 'emphasizeElement' | 'openUrl' | 'adjustVariable' | 'pauseTimeline' | 'resumeTimeline' | 'lightboxSlide' | 'showLayer' | 'hideLayer' */
  action: string;
  targetId: string;
  /** For 'atTime' events: time in seconds from slide start when the trigger fires. */
  time?: number;
  /**
   * For media events ('mediaStart' | 'mediaEnd' | 'mediaPause'): identifies the
   * audio or video source element on the slide. Format: 'audio:<audioId>' or
   * 'video:<elementId>'.
   */
  mediaId?: string;
  /** For 'emphasizeElement' action: emphasis animation style. */
  emphasis?: 'pulse' | 'shake' | 'bounce' | 'flash';
  /** For 'openUrl' action: the URL to open in a new tab. */
  url?: string;
  /** For 'adjustVariable' action: id of the target variable. */
  variableId?: string;
  /**
   * For 'adjustVariable' action: operator depending on variable type.
   * Boolean: 'setTrue' | 'setFalse' | 'toggle'
   * Number:  'setNumber' | 'add' | 'subtract' | 'multiply' | 'divide'
   * Text:    'setText' | 'append'
   */
  variableOperator?: string;
  /** For 'adjustVariable' action: literal value used by the operator. */
  variableValue?: string | number | boolean;
  /**
   * Optional conditions that must ALL evaluate true (AND) for the trigger to
   * fire. Empty/undefined means the trigger always fires.
   */
  conditions?: TriggerCondition[];
}

/** A single condition gating a trigger. Compares a course variable against a value. */
export interface TriggerCondition {
  variableId: string;
  /**
   * Comparison operator.
   * Boolean / Text: 'equals' | 'notEquals'
   * Number:        'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterThanOrEqual' | 'lessThanOrEqual'
   */
  operator: string;
  value: string | number | boolean;
}

/** A course-level variable persisted across slides during a learner's session. */
export interface CourseVariable {
  id: string;
  /** Unique identifier — no spaces. e.g. "hasSeenIntro". */
  name: string;
  type: 'boolean' | 'number' | 'text';
  defaultValue: boolean | number | string;
}

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  startTime: number;
  duration: number;
  triggers: Trigger[];
  animationIn: AnimationIn;
  animationOut: AnimationOut;
  entranceDuration: number;
  exitDuration: number;
  isLocked?: boolean;
  isHidden?: boolean;
  /** Optional motion path animation. Coordinates are in canvas pixels (absolute, not offsets). */
  motionPath?: MotionPath;
  /** Optional override duration (ms) for the motion-path traversal. Defaults to the element's `duration`. */
  motionPathDuration?: number;
}

/** Cubic bezier motion path in absolute canvas coordinates. */
export interface MotionPath {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize: number;
  fontWeight: string;
  textColor: string;
  backgroundColor: string;
  hoverTextColor?: string;
  hoverBackgroundColor?: string;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
  alt: string;
}

export interface VideoElement extends BaseElement {
  type: 'video';
  /** Base64 data URI of the video file. */
  src: string;
  /** Show native HTML5 controls. Default true. */
  controls: boolean;
  /** Autoplay when slide enters. Default false. */
  autoplay: boolean;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: ShapeType;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  hoverFillColor?: string;
  hoverBorderColor?: string;
  /** Optional embedded text rendered centered inside the shape. */
  text?: string;
  textColor?: string;
  fontSize?: number;
  /** Optional CSS border-radius (px) override for rectangle shapes. */
  borderRadius?: number;
  /** Optional CSS box-shadow value, applied to rectangle/circle shapes. */
  boxShadow?: string;
  /**
   * Set on buttons Chronicle generates for a branching slide: the slide this
   * button leads to. Managed by lib/navigation.ts (removed with its connection).
   */
  autoBranchTarget?: string;
}

/**
 * Invisible interactive region. Renders a dashed outline in the editor so
 * the author can locate it, but is fully transparent in preview/SCORM.
 */
export interface HotspotElement extends BaseElement {
  type: 'hotspot';
}

/**
 * Standard checkbox + label control.
 */
export interface CheckboxElement extends BaseElement {
  type: 'checkbox';
  label: string;
  /** Default checked state when the slide loads. */
  defaultChecked?: boolean;
  textColor?: string;
  fontSize?: number;
}

/**
 * Editable data table. `cellData` is a 2D array sized rowCount x colCount of
 * plain strings. Cells are contentEditable in the editor and rendered as a
 * static <table> in preview / SCORM export.
 */
export interface TableElement extends BaseElement {
  type: 'table';
  rowCount: number;
  colCount: number;
  cellData: string[][];
  borderColor?: string;
  textColor?: string;
  fontSize?: number;
}

export type SlideElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | VideoElement
  | HotspotElement
  | CheckboxElement
  | TableElement;

export interface Caption {
  startTime: number;
  endTime: number;
  text: string;
}

export interface SlideAudio {
  id: string;
  name: string;
  /** Base64 data URI (e.g. data:audio/mpeg;base64,...) */
  src: string;
  /** Duration in seconds */
  duration: number;
  captions: Caption[];
}

export type SlideTransitionType = 'none' | 'fade' | 'push-up' | 'push-left' | 'zoom-in';

/** Distinguishes regular content slides from quiz / results slides. */
export type SlideKind = 'content' | 'quiz' | 'results';

export type QuizQuestionType = 'multiple-choice' | 'dnd-matching' | 'dnd-sorting';
export type QuizFeedbackMode = 'inline' | 'jumpToSlide' | 'overlay';

export interface QuizChoice {
  id: string;
  text: string;
  correct: boolean;
}

export interface QuizMatchPair {
  id: string;
  left: string;
  right: string;
}

export interface QuizSortItem {
  id: string;
  text: string;
}

export interface QuizFeedbackTarget {
  /** What happens after submit for this outcome. */
  mode: QuizFeedbackMode;
  /** For 'inline' or 'overlay': the message shown to the learner. */
  message?: string;
  /** For 'jumpToSlide': the target slide id. */
  targetSlideId?: string;
}

/** What happens after a learner exhausts all quiz attempts without succeeding. */
export type QuizExhaustedBehavior = 'reveal' | 'lock';
/** Quiz-specific revisit behavior: reset answer/attempts, or resume saved state. */
export type QuizRevisitMode = 'reset' | 'resume';

export interface QuizConfig {
  questionType: QuizQuestionType;
  question: string;
  /** Multiple-choice fields */
  choices?: QuizChoice[];
  /** True = single-select radio, false = multi-select checkboxes. */
  singleSelect?: boolean;
  /** DnD Matching pairs. */
  pairs?: QuizMatchPair[];
  /** DnD Sorting items, listed in the correct order. */
  sortItems?: QuizSortItem[];
  /** Per-outcome feedback configuration. */
  correctFeedback: QuizFeedbackTarget;
  incorrectFeedback: QuizFeedbackTarget;
  /** Max attempts (1–10). 0 = unlimited. Defaults to 1. */
  attempts?: number;
  /** Behavior after attempts are exhausted without a correct answer. */
  attemptsExhaustedBehavior?: QuizExhaustedBehavior;
  /** Quiz-specific revisit mode (separate from regular slide revisitMode). */
  quizRevisitMode?: QuizRevisitMode;
  /** When true, learner can skip this question via a Skip button. */
  allowSkip?: boolean;
  /** Target slide id to navigate to when learner clicks Skip. */
  skipTargetSlideId?: string;
  /** Optional countdown timer for this quiz slide. */
  timer?: QuizTimerConfig;
}

/** Countdown timer applied to a quiz slide. */
export interface QuizTimerConfig {
  /** Master toggle. When false, timer does not apply. */
  enabled: boolean;
  /**
   * 'per-question': countdown applies to this slide only and starts on entry.
   * 'course': single shared countdown across all course-timer quiz slides.
   */
  mode: 'per-question' | 'course';
  /** Author-configured minutes (0+). */
  minutes: number;
  /** Author-configured seconds (0–59). */
  seconds: number;
  /** When true, countdown is rendered to the learner; otherwise silent. */
  showToLearner: boolean;
}

/**
 * Visual styling overrides applied to a quiz slide via a Quiz Template.
 * Affects appearance only (colors, fonts, spacing). All fields are optional
 * — when omitted, the quiz renders with its default appearance.
 */
export interface QuizStyleOverrides {
  /** Page background color behind the quiz card. */
  pageBackgroundColor?: string;
  /** Quiz card background color. */
  cardBackgroundColor?: string;
  /** Card text color (question + answer text). */
  textColor?: string;
  /** Font family applied to the entire quiz card. */
  fontFamily?: string;
  /** Question heading font size in px. */
  questionFontSize?: number;
  /** Answer option font size in px. */
  optionFontSize?: number;
  /** Answer option background color (default state). */
  optionBackgroundColor?: string;
  /** Answer option border color (default state). */
  optionBorderColor?: string;
  /** Answer option border color when selected. */
  optionSelectedBorderColor?: string;
  /** Answer option background color when selected. */
  optionSelectedBackgroundColor?: string;
  /** Submit/Continue/Try Again button background color. */
  buttonColor?: string;
  /** Submit/Continue/Try Again button text color. */
  buttonTextColor?: string;
  /** Card border-radius in px. */
  cardRadius?: number;
  /** Option border-radius in px. */
  optionRadius?: number;
}

export interface ResultsConfig {
  /** 0-100 inclusive. */
  passThreshold: number;
  passMessage: string;
  failMessage: string;
}

/**
 * A stacking layer inside a slide. Every slide always contains at least one
 * layer — the Base Layer — which holds the slide's original elements.
 * Layers are stored bottom-to-top: index 0 is the lowest (Base), the last
 * index is the topmost rendered layer.
 */
export interface SlideLayer {
  id: string;
  name: string;
  /** Visible in editor and preview. */
  visible: boolean;
  /** Locked layers render but elements cannot be selected/edited. */
  locked: boolean;
  /** Elements belonging to this layer. */
  elements: SlideElement[];
}

/** How the slide advances when its internal timeline reaches the end. */
export type SlideAdvanceMode = 'manual' | 'auto';
/** What happens when the user navigates back to a previously visited slide. */
export type SlideRevisitMode = 'reset' | 'resume';

export interface Slide {
  id: string;
  /** Optional human-readable title (max 30 chars). Falls back to "Slide N". */
  title?: string;
  elements: SlideElement[];
  duration: number;
  masterId?: string;
  audio?: SlideAudio[];
  notes?: string;
  /** Slide entrance transition played when this slide becomes active. */
  transitionType?: SlideTransitionType;
  /** Transition duration in seconds. Default 0.5. */
  transitionDuration?: number;
  /** When timeline ends: 'manual' waits for Next click, 'auto' advances. */
  advanceMode?: SlideAdvanceMode;
  /** When revisiting: 'reset' rewinds to 0, 'resume' keeps last playhead. */
  revisitMode?: SlideRevisitMode;
  /**
   * Where Next goes (slide ids). Omitted: the following slide in the list.
   * Empty: no Next. Two or more: a branching slide with one button per target.
   * See lib/navigation.ts.
   */
  next?: string[];
  /** Slide kind. Defaults to 'content' when omitted. */
  slideType?: SlideKind;
  /** Quiz configuration; only used when slideType === 'quiz'. */
  quiz?: QuizConfig;
  /** Results configuration; only used when slideType === 'results'. */
  results?: ResultsConfig;
  /** Optional visual style overrides applied via a Quiz Template. */
  quizStyle?: QuizStyleOverrides;
  /**
   * Stacking layers for this slide. Bottom-to-top order. When omitted (legacy
   * data), the slide is treated as having a single implicit Base Layer
   * containing `elements`. The reducer migrates this on load.
   */
  layers?: SlideLayer[];
}

export type NavigationMode = 'free' | 'restricted';
export type BackgroundMode = 'stretch' | 'fit' | 'tile';
export type SidebarPosition = 'left' | 'right' | 'none';

export interface PlayerTabs {
  showMenu: boolean;
  showNotes: boolean;
}

export interface PlayerControls {
  showPlayPause: boolean;
  showCaptions: boolean;
}

export interface PlayerSettings {
  backgroundColor: string;
  buttonColor: string;
  buttonBorderRadius: number;
  fontFamily: string;
  /** @deprecated Use playerTabs.showMenu. Kept for backward compat. */
  showMenu: boolean;
  navigationMode: NavigationMode;
  backgroundImage: string | null;
  backgroundMode: BackgroundMode;
  courseTitle: string;
  sidebarPosition: SidebarPosition;
  playerTabs: PlayerTabs;
  playerControls: PlayerControls;
  /** Optional course-wide quiz timer applied across all quiz slides. */
  courseTimer?: CourseTimerConfig;
}

/** Course-wide quiz timer configuration set in Player Settings. */
export interface CourseTimerConfig {
  enabled: boolean;
  minutes: number;
  seconds: number;
  showToLearner: boolean;
}

export const defaultPlayerSettings: PlayerSettings = {
  backgroundColor: '#1a1a2e',
  buttonColor: '#3b82f6',
  buttonBorderRadius: 6,
  fontFamily: 'system-ui, sans-serif',
  showMenu: false,
  navigationMode: 'free',
  backgroundImage: null,
  backgroundMode: 'stretch',
  courseTitle: 'Untitled Course',
  sidebarPosition: 'left',
  playerTabs: { showMenu: true, showNotes: true },
  playerControls: { showPlayPause: true, showCaptions: true },
  courseTimer: { enabled: false, minutes: 10, seconds: 0, showToLearner: true },
};

export interface CanvasDimensions {
  width: number;
  height: number;
}

export interface GlobalTransition {
  type: SlideTransitionType;
  /** Duration in seconds. Bound to 1–5s in UI. */
  duration: number;
  /** Background color the canvas fades through during a transition. */
  color: string;
}

export interface CourseSettings {
  canvasDimensions: CanvasDimensions;
  /** 6 hex colors: Primary, Secondary, Accent 1, Accent 2, Dark, Light */
  themeColors: string[];
  /** Global slide transition applied to every slide change in preview/SCORM. */
  transition: GlobalTransition;
}

export const defaultCourseSettings: CourseSettings = {
  canvasDimensions: { width: 1024, height: 768 },
  themeColors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#1f2937', '#f9fafb'],
  transition: { type: 'fade', duration: 1, color: '#000000' },
};

export interface CourseState {
  slides: Slide[];
  masterSlides: Slide[];
  activeSlideIndex: number;
  activeElementId: string | null;
  /** All currently selected element IDs (for multi-select). The
   * `activeElementId` is always included when non-null. */
  selectedElementIds: string[];
  activeAudioId: string | null;
  previewMode: boolean;
  /** Preview only: slides visited before the current one, for the Prev button. */
  previewHistory?: number[];
  playheadTime: number;
  isPlaying: boolean;
  viewMode: ViewMode;
  playerSettings: PlayerSettings;
  courseSettings: CourseSettings;
  /** Course-level variables, authored in the Variable Manager. */
  variables: CourseVariable[];
  /** Runtime (preview/player): live values keyed by variable id. */
  variableValues: Record<string, boolean | number | string>;
  /** Editor-only: show 20px visual grid on canvas. Not exported. */
  showGrid: boolean;
  /** Editor-only: snap drag/resize to 20px grid. Not exported. */
  snapToGrid: boolean;
  /** Runtime: closed-captions enabled in preview/player. */
  ccEnabled: boolean;
  /** Runtime (preview/player): per-quiz-slide submission result. */
  quizResults: Record<string, { correct: boolean; submitted: boolean }>;
  /** Runtime (preview/player): in-progress learner answer for a quiz slide. */
  quizAnswers: Record<string, unknown>;
  /** Runtime: which quiz slide currently has its feedback overlay open. */
  quizFeedbackOpen: { slideId: string; correct: boolean } | null;
  /** Runtime (preview/player): attempts remaining per quiz slide. */
  quizAttemptsRemaining: Record<string, number>;
  /** Runtime: shared course-timer remaining seconds (null = uninitialized). */
  courseQuizTimerRemaining: number | null;
  /** Runtime: per-slide remaining seconds for per-question quiz timers. */
  perQuestionTimerRemaining: Record<string, number>;
  /** Editor-only: when set, canvas enters motion-path drawing mode for the given element. */
  motionPathEditor: { elementId: string } | null;
  /** Editor-only: id of the layer currently being edited on the active slide. */
  activeLayerId: string | null;
}
