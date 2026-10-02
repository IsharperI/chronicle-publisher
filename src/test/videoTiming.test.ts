import { describe, it, expect } from 'vitest';
import { elementAppearance } from '@/lib/publish/video';
import type { SlideElement } from '@/types/course';

/** A text element; times in ms (like the editor's timeline). */
function el(over: Partial<SlideElement>): SlideElement {
  return {
    id: 'x', type: 'text', x: 0, y: 0, width: 100, height: 50, startTime: 0, duration: 6000, triggers: [],
    animationIn: 'none', animationOut: 'none', entranceDuration: 500, exitDuration: 500,
    content: 'Hi', fontSize: 20, fontWeight: '400', textColor: '#000', backgroundColor: 'transparent',
    ...over,
  } as SlideElement;
}

describe('elementAppearance (video export timing, same rules as the preview)', () => {
  const SLIDE = 6000;

  it('hides an element before its start and after its end', () => {
    const b = el({ startTime: 2000, duration: 2000 });
    expect(elementAppearance(b, 1999, SLIDE)).toBeNull();
    expect(elementAppearance(b, 3000, SLIDE)).toEqual({ alpha: 1, dx: 0 });
    expect(elementAppearance(b, 4000, SLIDE)).toBeNull();
  });

  it('keeps an element that runs to the end of the slide visible afterwards', () => {
    expect(elementAppearance(el({ startTime: 3000, duration: 3000 }), 9000, SLIDE)).toEqual({ alpha: 1, dx: 0 });
  });

  it('fades in and out over the entrance and exit durations', () => {
    const b = el({ startTime: 2000, duration: 2000, animationIn: 'fade', animationOut: 'fade' });
    expect(elementAppearance(b, 2250, SLIDE)!.alpha).toBeCloseTo(0.5);
    expect(elementAppearance(b, 3750, SLIDE)!.alpha).toBeCloseTo(0.5);
  });

  it('flies in from the left', () => {
    const a = elementAppearance(el({ startTime: 1000, animationIn: 'fly-in-left' }), 1000, SLIDE)!;
    expect(a.alpha).toBe(0);
    expect(a.dx).toBeLessThan(0);
    expect(elementAppearance(el({ startTime: 1000, animationIn: 'fly-in-left' }), 1600, SLIDE)).toEqual({ alpha: 1, dx: 0 });
  });

  it('never plays an exit animation on an element that lasts to the end', () => {
    const c = el({ startTime: 0, duration: 6000, animationOut: 'fade' });
    expect(elementAppearance(c, 5900, SLIDE)).toEqual({ alpha: 1, dx: 0 });
  });
});
