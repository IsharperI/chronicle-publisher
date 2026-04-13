export type ElementType = 'text' | 'image' | 'shape';
export type ShapeType = 'rectangle' | 'circle' | 'triangle';
export type AnimationIn = 'none' | 'fade' | 'fly-in-left' | 'fly-in-right';
export type AnimationOut = 'none' | 'fade' | 'fly-out-left' | 'fly-out-right';

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
}

export type SlideElement = TextElement | ImageElement | ShapeElement;

export interface Slide {
  id: string;
  elements: SlideElement[];
  duration: number;
}

export interface CourseState {
  slides: Slide[];
  activeSlideIndex: number;
  activeElementId: string | null;
  previewMode: boolean;
  playheadTime: number;
  isPlaying: boolean;
}
