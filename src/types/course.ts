export type ElementType = 'text' | 'image' | 'shape';
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
}

export type SlideElement = TextElement | ImageElement | ShapeElement;

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

export interface Slide {
  id: string;
  elements: SlideElement[];
  duration: number;
  masterId?: string;
  audio?: SlideAudio[];
}

export type NavigationMode = 'free' | 'restricted';
export type BackgroundMode = 'stretch' | 'fit' | 'tile';

export interface PlayerSettings {
  backgroundColor: string;
  buttonColor: string;
  buttonBorderRadius: number;
  fontFamily: string;
  showMenu: boolean;
  navigationMode: NavigationMode;
  backgroundImage: string | null;
  backgroundMode: BackgroundMode;
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
};

export interface CanvasDimensions {
  width: number;
  height: number;
}

export interface CourseSettings {
  canvasDimensions: CanvasDimensions;
  /** 6 hex colors: Primary, Secondary, Accent 1, Accent 2, Dark, Light */
  themeColors: string[];
}

export const defaultCourseSettings: CourseSettings = {
  canvasDimensions: { width: 1920, height: 1080 },
  themeColors: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#1f2937', '#f9fafb'],
};

export interface CourseState {
  slides: Slide[];
  masterSlides: Slide[];
  activeSlideIndex: number;
  activeElementId: string | null;
  activeAudioId: string | null;
  previewMode: boolean;
  playheadTime: number;
  isPlaying: boolean;
  viewMode: ViewMode;
  playerSettings: PlayerSettings;
  courseSettings: CourseSettings;
}
