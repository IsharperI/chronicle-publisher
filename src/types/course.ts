export type ElementType = 'text' | 'image' | 'shape' | 'video' | 'hotspot' | 'checkbox' | 'table';
export type ShapeType = 'rectangle' | 'circle' | 'triangle';
export type AnimationIn = 'none' | 'fade' | 'fly-in-left' | 'fly-in-right';
export type AnimationOut = 'none' | 'fade' | 'fly-out-left' | 'fly-out-right';
export type ViewMode = 'main' | 'master';

export interface Trigger {
  event: string;
  action: string;
  targetId: string;
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

/** How the slide advances when its internal timeline reaches the end. */
export type SlideAdvanceMode = 'manual' | 'auto';
/** What happens when the user navigates back to a previously visited slide. */
export type SlideRevisitMode = 'reset' | 'resume';

export interface Slide {
  id: string;
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
  playheadTime: number;
  isPlaying: boolean;
  viewMode: ViewMode;
  playerSettings: PlayerSettings;
  courseSettings: CourseSettings;
  /** Editor-only: show 20px visual grid on canvas. Not exported. */
  showGrid: boolean;
  /** Editor-only: snap drag/resize to 20px grid. Not exported. */
  snapToGrid: boolean;
  /** Runtime: closed-captions enabled in preview/player. */
  ccEnabled: boolean;
}
