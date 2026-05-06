/**
 * Library of inline-SVG shape definitions used by the canvas, the published
 * player runtime, and the ribbon shape picker.
 *
 * Each definition is a string of SVG inner markup with three placeholder
 * tokens that callers replace with concrete values:
 *   {fill}        — hex fill color
 *   {stroke}      — hex stroke color
 *   {strokeWidth} — numeric stroke width in user-units (paired with
 *                   vector-effect="non-scaling-stroke" so the visual width
 *                   stays constant regardless of the bounding-box aspect).
 *
 * All shapes are authored against a 100x100 viewBox and rely on the host
 * <svg> using preserveAspectRatio="none" so they fill arbitrary bounding
 * boxes. Existing 'rectangle' / 'circle' / 'triangle' shape types are NOT
 * included here — they continue to render via their original code paths.
 */

export type ExtendedShapeType =
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

const A = 'fill="{fill}" stroke="{stroke}" stroke-width="{strokeWidth}" stroke-linejoin="miter" vector-effect="non-scaling-stroke"';

export const SHAPE_SVG: Record<ExtendedShapeType, string> = {
  'rounded-rectangle': `<rect x="0" y="0" width="100" height="100" rx="12" ry="12" ${A}/>`,
  'right-triangle': `<polygon points="0,0 0,100 100,100" ${A}/>`,
  'diamond': `<polygon points="50,0 100,50 50,100 0,50" ${A}/>`,
  'pentagon': `<polygon points="50,0 97.6,34.5 79.4,90.5 20.6,90.5 2.4,34.5" ${A}/>`,
  'hexagon': `<polygon points="25,0 75,0 100,50 75,100 25,100 0,50" ${A}/>`,
  'octagon': `<polygon points="30.9,3.8 69.1,3.8 96.2,30.9 96.2,69.1 69.1,96.2 30.9,96.2 3.8,69.1 3.8,30.9" ${A}/>`,
  'parallelogram': `<polygon points="25,0 100,0 75,100 0,100" ${A}/>`,
  'trapezoid': `<polygon points="20,0 80,0 100,100 0,100" ${A}/>`,
  'cross': `<polygon points="35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35" ${A}/>`,
  'l-shape': `<polygon points="0,0 35,0 35,65 100,65 100,100 0,100" ${A}/>`,
  'arrow-right': `<polygon points="0,30 60,30 60,10 100,50 60,90 60,70 0,70" ${A}/>`,
  'arrow-left': `<polygon points="100,30 40,30 40,10 0,50 40,90 40,70 100,70" ${A}/>`,
  'arrow-up': `<polygon points="30,100 30,40 10,40 50,0 90,40 70,40 70,100" ${A}/>`,
  'arrow-down': `<polygon points="30,0 70,0 70,60 90,60 50,100 10,60 30,60" ${A}/>`,
  'arrow-left-right': `<polygon points="0,50 20,20 20,40 80,40 80,20 100,50 80,80 80,60 20,60 20,80" ${A}/>`,
  'arrow-up-down': `<polygon points="50,0 80,20 60,20 60,80 80,80 50,100 20,80 40,80 40,20 20,20" ${A}/>`,
  'chevron-right': `<polygon points="0,10 50,10 100,50 50,90 0,90 50,50" ${A}/>`,
  'chevron-left': `<polygon points="100,10 50,10 0,50 50,90 100,90 50,50" ${A}/>`,
  'bent-arrow-right': `<polygon points="10,100 10,30 70,30 70,10 100,40 70,70 70,50 25,50 25,100" ${A}/>`,
  'bent-arrow-left': `<polygon points="90,100 90,30 30,30 30,10 0,40 30,70 30,50 75,50 75,100" ${A}/>`,
  'circular-arrow': `<path d="M50,15 A35,35 0 1,1 15,50 L5,50 L20,30 L35,50 L25,50 A25,25 0 1,0 50,25 Z" ${A}/>`,
  'callout-rectangle': `<path d="M0,0 L100,0 L100,70 L30,70 L18,98 L22,70 L0,70 Z" ${A}/>`,
  'callout-rounded': `<path d="M10,0 L90,0 Q100,0 100,10 L100,60 Q100,70 90,70 L30,70 L18,98 L22,70 L10,70 Q0,70 0,60 L0,10 Q0,0 10,0 Z" ${A}/>`,
  'callout-oval': `<ellipse cx="50" cy="40" rx="48" ry="32" ${A}/><polygon points="30,68 22,98 42,68" ${A}/>`,
  'thought-bubble': `<ellipse cx="50" cy="35" rx="45" ry="28" ${A}/><circle cx="25" cy="78" r="8" ${A}/><circle cx="15" cy="93" r="5" ${A}/>`,
  'star-4point': `<polygon points="50,0 62.7,37.3 100,50 62.7,62.7 50,100 37.3,62.7 0,50 37.3,37.3" ${A}/>`,
  'star-5point': `<polygon points="50,0 61.8,33.8 97.6,34.5 69,56.2 79.4,90.5 50,70 20.6,90.5 31,56.2 2.4,34.5 38.2,33.8" ${A}/>`,
  'star-6point': `<polygon points="50,0 61,30.9 93.3,25 72,50 93.3,75 61,69.1 50,100 39,69.1 6.7,75 28,50 6.7,25 39,30.9" ${A}/>`,
  'star-8point': `<polygon points="50,0 59.6,26.9 85.4,14.6 73.1,40.4 100,50 73.1,59.6 85.4,85.4 59.6,73.1 50,100 40.4,73.1 14.6,85.4 26.9,59.6 0,50 26.9,40.4 14.6,14.6 40.4,26.9" ${A}/>`,
  'burst-4': `<polygon points="50,0 55.7,44.3 100,50 55.7,55.7 50,100 44.3,55.7 0,50 44.3,44.3" ${A}/>`,
  'burst-8': `<polygon points="50,0 56.9,33.4 85.4,14.6 66.6,43.1 100,50 66.6,56.9 85.4,85.4 56.9,66.6 50,100 43.1,66.6 14.6,85.4 33.4,56.9 0,50 33.4,43.1 14.6,14.6 43.1,33.4" ${A}/>`,
};

export const EXTENDED_SHAPE_TYPES = Object.keys(SHAPE_SVG) as ExtendedShapeType[];

export function isExtendedShapeType(t: string): t is ExtendedShapeType {
  return Object.prototype.hasOwnProperty.call(SHAPE_SVG, t);
}

/** Resolves the SVG inner markup for a given shape with concrete colors. */
export function resolveShapeSvg(
  shapeType: ExtendedShapeType,
  fill: string,
  stroke: string,
  strokeWidth: number,
): string {
  return SHAPE_SVG[shapeType]
    .replace(/\{fill\}/g, fill)
    .replace(/\{stroke\}/g, stroke)
    .replace(/\{strokeWidth\}/g, String(strokeWidth));
}

/** Categorized groups for the Insert tab shape picker. */
export const SHAPE_CATEGORIES: { label: string; shapes: { type: ExtendedShapeType | 'rectangle' | 'circle' | 'triangle'; label: string }[] }[] = [
  {
    label: 'Basic Shapes',
    shapes: [
      { type: 'rectangle', label: 'Rectangle' },
      { type: 'rounded-rectangle', label: 'Rounded Rectangle' },
      { type: 'circle', label: 'Ellipse' },
      { type: 'triangle', label: 'Triangle' },
      { type: 'right-triangle', label: 'Right Triangle' },
      { type: 'diamond', label: 'Diamond' },
      { type: 'pentagon', label: 'Pentagon' },
      { type: 'hexagon', label: 'Hexagon' },
      { type: 'octagon', label: 'Octagon' },
      { type: 'parallelogram', label: 'Parallelogram' },
      { type: 'trapezoid', label: 'Trapezoid' },
      { type: 'cross', label: 'Cross' },
      { type: 'l-shape', label: 'L-Shape' },
    ],
  },
  {
    label: 'Arrows',
    shapes: [
      { type: 'arrow-right', label: 'Arrow Right' },
      { type: 'arrow-left', label: 'Arrow Left' },
      { type: 'arrow-up', label: 'Arrow Up' },
      { type: 'arrow-down', label: 'Arrow Down' },
      { type: 'arrow-left-right', label: 'Arrow Left-Right' },
      { type: 'arrow-up-down', label: 'Arrow Up-Down' },
      { type: 'chevron-right', label: 'Chevron Right' },
      { type: 'chevron-left', label: 'Chevron Left' },
      { type: 'bent-arrow-right', label: 'Bent Arrow Right' },
      { type: 'bent-arrow-left', label: 'Bent Arrow Left' },
      { type: 'circular-arrow', label: 'Circular Arrow' },
    ],
  },
  {
    label: 'Callouts',
    shapes: [
      { type: 'callout-rectangle', label: 'Rectangle Callout' },
      { type: 'callout-rounded', label: 'Rounded Callout' },
      { type: 'callout-oval', label: 'Oval Callout' },
      { type: 'thought-bubble', label: 'Thought Bubble' },
    ],
  },
  {
    label: 'Stars',
    shapes: [
      { type: 'star-4point', label: '4-Point Star' },
      { type: 'star-5point', label: '5-Point Star' },
      { type: 'star-6point', label: '6-Point Star' },
      { type: 'star-8point', label: '8-Point Star' },
      { type: 'burst-4', label: '4-Point Burst' },
      { type: 'burst-8', label: '8-Point Burst' },
    ],
  },
];
