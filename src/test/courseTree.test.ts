import { describe, it, expect } from 'vitest';
import { autoLayout, buildEdges, connectNext, disconnectNext, retargetNext, treePositions, NODE_W } from '@/lib/courseTree';
import { courseReducer } from '@/context/CourseContext';
import type { CourseState, Slide } from '@/types/course';

const sl = (id: string, next?: string[]): Slide => ({ id, title: id, elements: [], duration: 5000, ...(next ? { next } : {}) });
const load = (slides: Slide[]): CourseState => courseReducer(undefined as unknown as CourseState, { type: 'LOAD_COURSE', slides });

describe('course tree arrows', () => {
  it('draws Next connections, labels branches with their button text, and dashes trigger jumps', () => {
    const s = load([sl('hub', ['a', 'b']), sl('a', ['hub']), sl('b')]);
    const edges = buildEdges(s.slides);
    expect(edges.filter((e) => e.kind === 'next').map((e) => `${e.from}>${e.to}:${e.label ?? ''}`)).toEqual(['hub>a:a', 'hub>b:b', 'a>hub:']);
    expect(edges.some((e) => e.kind === 'jump')).toBe(false); // branch buttons aren't counted twice
  });
});

describe('connecting in the tree', () => {
  const slides = load([sl('a'), sl('b'), sl('c'), sl('d')]).slides;
  it('adding a second arrow makes a branching slide', () => {
    expect(connectNext(slides, 'a', 'c')).toEqual(['b', 'c']);
    expect(connectNext(slides, 'a', 'b')).toBeNull(); // already connected
    expect(connectNext(slides, 'a', 'a')).toBeNull();
  });
  it('removing an arrow, and going back to the default', () => {
    expect(disconnectNext(slides, 'a', 'b')).toEqual([]);
    const branched = load([sl('a', ['b', 'c']), sl('b'), sl('c')]).slides;
    expect(disconnectNext(branched, 'a', 'c')).toBeUndefined(); // only the following slide left = default
  });
  it('re-pointing an arrow', () => {
    expect(retargetNext(slides, 'a', 'b', 'd')).toEqual(['d']);
    const branched = load([sl('a', ['b', 'c']), sl('b'), sl('c'), sl('d')]).slides;
    expect(retargetNext(branched, 'a', 'c', 'd')).toEqual(['b', 'd']);
    expect(retargetNext(branched, 'a', 'c', 'b')).toBeUndefined(); // merged into the existing arrow to b
  });
});

describe('layout', () => {
  it('fans branches out side by side under the branching slide', () => {
    const s = load([sl('intro'), sl('hub', ['a1', 'b1', 'c1']), sl('a1'), sl('a2', ['hub']), sl('b1', ['hub']), sl('c1', ['end']), sl('end')]);
    const p = autoLayout(s.slides);
    expect(p.hub.y).toBeGreaterThan(p.intro.y);
    expect(new Set([p.a1.y, p.b1.y, p.c1.y]).size).toBe(1);
    expect(p.a1.y).toBeGreaterThan(p.hub.y);
    const xs = [p.a1.x, p.b1.x, p.c1.x].sort((x, y) => x - y);
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(NODE_W);
    expect(Math.abs(xs[1] - p.hub.x)).toBeLessThanOrEqual(1); // middle branch under the hub
    expect(p.a2.x).toBe(p.a1.x); // second slide of branch A sits under A
    expect(p.a2.y).toBeGreaterThan(p.a1.y);
  });
  it('keeps saved positions and places new slides below the slide that leads to them', () => {
    let s = load([sl('a'), sl('b')]);
    s = courseReducer(s, { type: 'SET_TREE_POSITIONS', positions: { a: { x: 500, y: 100 }, b: { x: 900, y: 100 } } });
    s = courseReducer(s, { type: 'INSERT_SLIDE', index: 2, slide: sl('c') });
    const p = treePositions(s.slides);
    expect(p.a).toEqual({ x: 500, y: 100 });
    expect(p.c.x).toBe(900);
    expect(p.c.y).toBeGreaterThan(100);
  });
});

describe('duplicate slide', () => {
  it('copies with new ids and keeps triggers pointing at the copy’s own layers', () => {
    const el = { id: 'btn', type: 'shape', x: 0, y: 0, width: 10, height: 10, startTime: 0, duration: 5000, animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500,
      shapeType: 'rectangle', fillColor: '#000', borderColor: '#000', borderWidth: 0, triggers: [{ event: 'onClick', action: 'showLayer', targetId: 'L2' }] };
    const slide = { id: 's', title: 'Reveal', duration: 5000, elements: [el], layers: [{ id: 'L1', name: 'Base', visible: true, locked: false, elements: [el] }, { id: 'L2', name: 'Pop', visible: false, locked: false, elements: [] }] } as unknown as Slide;
    let s = load([slide, sl('z')]);
    s = courseReducer(s, { type: 'DUPLICATE_SLIDE', index: 0 });
    expect(s.slides.map((x) => x.title)).toEqual(['Reveal', 'Reveal (copy)', 'z']);
    const copy = s.slides[1];
    expect(copy.id).not.toBe('s');
    const layerIds = copy.layers!.map((l) => l.id);
    expect(layerIds).not.toContain('L2');
    expect(copy.layers![0].elements[0].triggers[0].targetId).toBe(layerIds[1]);
    expect(s.slides[0].layers![0].elements[0].triggers[0].targetId).toBe('L2'); // original untouched
  });
});
