import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildNarration, cuesForChunk, encodeMp3, extractNarration, segmentScript, toDataUrl, TTS_AUDIO_NAME, type Chunk, type SpeechSegment } from '@/lib/tts/narration';
import { generateNarrationAudio, setSynthesizer, countSentences } from '@/lib/tts';
import { startCourseNarration, cancelNarration } from '@/lib/tts/narrationJob';
import { courseReducer } from '@/context/CourseContext';
import { prepareBlueprintLoad } from '@/lib/blueprint';
import { defaultCourseSettings, defaultPlayerSettings, type CourseState, type Slide, type SlideAudio } from '@/types/course';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const RATE = 24000;
/** Stand-in voice: a sine tone whose length depends on the sentence length. */
function tone(text: string, seconds = text.length / 20): SpeechSegment {
  const n = Math.round(seconds * RATE);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return { text, samples, sampleRate: RATE };
}
const fakeSynth = async (chunks: Chunk[]) => chunks.map((c) => tone(c.text));

afterEach(() => setSynthesizer(null));

describe('extractNarration', () => {
  it('reads the script from blueprint-style notes', () => {
    expect(extractNarration('Narration:\nHello there.\nSecond line.\n\nSource: Manual 4.2')).toBe('Hello there.\nSecond line.');
  });
  it('handles notes with narration only, or none', () => {
    expect(extractNarration('Narration:\nJust this.')).toBe('Just this.');
    expect(extractNarration('Source: Manual 4.2')).toBe('');
    expect(extractNarration(undefined)).toBe('');
  });
});

describe('segmentScript (MyCanary rules)', () => {
  it('splits at sentence ends and marks paragraph breaks', () => {
    expect(segmentScript('Welcome to the course today. It covers electrical safety.\n\nLet us begin the first section.')).toEqual([
      { text: 'Welcome to the course today.', endsParagraph: false },
      { text: 'It covers electrical safety.', endsParagraph: true },
      { text: 'Let us begin the first section.', endsParagraph: false },
    ]);
  });
  it('never splits at commas, and merges fragments under four words into the previous sentence', () => {
    expect(segmentScript('Electricity can kill, even at low voltage. Be careful. Always wear your PPE on site.').map((c) => c.text)).toEqual([
      'Electricity can kill, even at low voltage. Be careful.',
      'Always wear your PPE on site.',
    ]);
  });
  it('keeps closing quotes with their sentence and handles a missing final full stop', () => {
    expect(segmentScript('Select the “EXIT” button to finish.” Then close the window').map((c) => c.text)).toEqual([
      'Select the “EXIT” button to finish.”',
      'Then close the window',
    ]);
  });
});

describe('buildNarration', () => {
  it('adds MyCanary pauses (0.42s after a sentence, 0.7s after a paragraph) and captions each chunk', () => {
    const built = buildNarration([
      { ...tone('First sentence here.', 1), endsParagraph: false },
      { ...tone('Second sentence here.', 2), endsParagraph: true },
      { ...tone('New paragraph starts.', 1) },
    ]);
    expect(built.duration).toBeCloseTo(1 + 0.42 + 2 + 0.7 + 1, 3);
    expect(built.captions).toEqual([
      { startTime: 0, endTime: 1, text: 'First sentence here.' },
      { startTime: 1.42, endTime: 3.42, text: 'Second sentence here.' },
      { startTime: 4.12, endTime: 5.12, text: 'New paragraph starts.' },
    ]);
  });
});

describe('cuesForChunk', () => {
  it('splits long sentences into captions of at most 10 words, sharing time by word count', () => {
    const text = 'By the end of this course you will be able to explain the structure of atoms and describe electricity.';
    const cues = cuesForChunk(text, 0, 8);
    expect(cues.length).toBe(2);
    expect(cues.every((c) => c.text.split(' ').length <= 10)).toBe(true);
    expect(cues.map((c) => c.text).join(' ')).toBe(text);
    expect(cues[0].startTime).toBe(0);
    expect(cues[cues.length - 1].endTime).toBe(8);
  });
  it('splits by time when a short sentence is spoken slowly', () => {
    expect(cuesForChunk('One two three four five.', 0, 10).length).toBe(2);
  });
});

describe('encodeMp3', () => {
  it('produces a compact MP3 stream', () => {
    const { samples } = tone('x', 2);
    const mp3 = encodeMp3(samples, RATE);
    // MPEG audio frame sync: 11 set bits.
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
    // 128 kbps ≈ 16 KB/s, a third of 16-bit WAV (48 KB/s).
    expect(mp3.length).toBeGreaterThan(2 * 12000);
    expect(mp3.length).toBeLessThan(2 * 20000);
    expect(toDataUrl(mp3).startsWith('data:audio/mpeg;base64,')).toBe(true);
  });
});

describe('generateNarrationAudio', () => {
  it('returns slide audio with captions from the speech engine', async () => {
    setSynthesizer(fakeSynth);
    const audio = await generateNarrationAudio('One way to stay safe is PPE. This includes gloves and boots.');
    expect(audio.name).toBe(TTS_AUDIO_NAME);
    expect(audio.src.startsWith('data:audio/mpeg;base64,')).toBe(true);
    expect(audio.captions.map((c) => c.text)).toEqual(['One way to stay safe is PPE.', 'This includes gloves and boots.']);
    expect(audio.duration).toBeGreaterThan(2);
  });
  it('rejects an empty script', async () => {
    await expect(generateNarrationAudio('   ')).rejects.toThrow(/no voice-over script/i);
  });
  it('counts sentences for progress', () => {
    expect(countSentences('This is the first one. Here is the second one! Is this the third one?')).toBe(3);
  });
});

function stateWith(slides: Slide[]): CourseState {
  return {
    slides, masterSlides: [], activeSlideIndex: 0, activeElementId: null, selectedElementIds: [], activeAudioId: null,
    previewMode: false, playheadTime: 0, isPlaying: false, viewMode: 'main',
    playerSettings: { ...defaultPlayerSettings }, courseSettings: { ...defaultCourseSettings },
    variables: [], variableValues: {}, showGrid: false, snapToGrid: false, ccEnabled: true,
    quizResults: {}, quizAnswers: {}, quizFeedbackOpen: null, quizAttemptsRemaining: {},
    courseQuizTimerRemaining: null, perQuestionTimerRemaining: {}, motionPathEditor: null, activeLayerId: null,
  };
}
const audioOf = (duration: number, name = TTS_AUDIO_NAME): SlideAudio => ({ id: crypto.randomUUID(), name, src: 'data:audio/mpeg;base64,AA==', duration, captions: [] });
function slideWithText(id: string): Slide {
  const el = {
    id: 'el-' + id, type: 'text' as const, x: 0, y: 0, width: 100, height: 50, startTime: 0, duration: 5000, triggers: [],
    animationIn: 'none' as const, animationOut: 'none' as const, entranceDuration: 500, exitDuration: 500,
    content: 'Hi', fontSize: 20, fontWeight: '400', textColor: '#000', backgroundColor: 'transparent',
  };
  const short = { ...el, id: 'short-' + id, duration: 2000 };
  return { id, elements: [el, short], duration: 5000, layers: [{ id: 'L-' + id, name: 'Base Layer', visible: true, locked: false, elements: [el, short] }] };
}

describe('SET_SLIDE_NARRATION', () => {
  it('adds audio to the right slide and lengthens it and its full-length elements', () => {
    const s0 = stateWith([slideWithText('a'), slideWithText('b')]);
    const s1 = courseReducer(s0, { type: 'SET_SLIDE_NARRATION', slideId: 'b', audio: audioOf(12.3) });
    const b = s1.slides[1];
    expect(b.audio).toHaveLength(1);
    expect(b.duration).toBe(12800); // 12.3s rounded up + 0.5s
    const els = b.layers![0].elements;
    expect(els.find((e) => e.id === 'el-b')!.duration).toBe(12800); // ran to the end, so stretched
    expect(els.find((e) => e.id === 'short-b')!.duration).toBe(2000); // ended early, untouched
    expect(s1.slides[0]).toBe(s0.slides[0]);
  });
  it('replaces earlier TTS narration but keeps other audio, and never shortens the slide', () => {
    let s = stateWith([{ ...slideWithText('a'), audio: [audioOf(3, 'music.mp3')] }]);
    s = courseReducer(s, { type: 'SET_SLIDE_NARRATION', slideId: 'a', audio: audioOf(20) });
    s = courseReducer(s, { type: 'SET_SLIDE_NARRATION', slideId: 'a', audio: audioOf(4) });
    const a = s.slides[0];
    expect(a.audio!.map((x) => x.name)).toEqual(['music.mp3', TTS_AUDIO_NAME]);
    expect(a.audio![1].duration).toBe(4);
    expect(a.duration).toBe(20500);
  });
  it('ignores unknown slides', () => {
    const s0 = stateWith([slideWithText('a')]);
    expect(courseReducer(s0, { type: 'SET_SLIDE_NARRATION', slideId: 'gone', audio: audioOf(5) })).toBe(s0);
  });
});

describe('blueprint narration', () => {
  it('lists each slide with a script, matched to its loaded slide id', () => {
    const res = prepareBlueprintLoad({
      blueprintVersion: 1, course: { title: 'T' },
      slides: [
        { layout: 'title', title: 'Welcome', narration: 'Welcome to the course.' },
        { layout: 'bullets', title: 'No VO', bullets: ['a'] },
        { layout: 'bullets', title: 'PPE', bullets: ['b'], narration: 'Always wear PPE.' },
      ],
    }, defaultCourseSettings);
    if (res.ok === false) throw new Error(res.errors.join('; '));
    expect(res.narration.map((n) => [n.title, n.script])).toEqual([['Welcome', 'Welcome to the course.'], ['PPE', 'Always wear PPE.']]);
    expect(res.narration[1].slideId).toBe(res.payload.slides[2].id);
  });
});

describe('course narration job', () => {
  it('narrates each slide in order and dispatches the audio', async () => {
    setSynthesizer(fakeSynth);
    const dispatch = vi.fn();
    await startCourseNarration(
      [{ slideId: 'a', title: 'A', script: 'Hello.' }, { slideId: 'b', title: 'B', script: '' }, { slideId: 'c', title: 'C', script: 'Bye now.' }],
      dispatch, 'af_heart',
    );
    expect(dispatch.mock.calls.map((c) => c[0].slideId)).toEqual(['a', 'c']);
  });
  it('stops early when the voice cannot be generated at all', async () => {
    const synth = vi.fn(async () => { throw new Error('network error'); });
    setSynthesizer(synth);
    const dispatch = vi.fn();
    await startCourseNarration(
      ['a', 'b', 'c', 'd'].map((id) => ({ slideId: id, title: id, script: 'Hi.' })), dispatch, 'af_heart',
    );
    expect(synth).toHaveBeenCalledTimes(2);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('can be cancelled', async () => {
    let release: () => void = () => {};
    setSynthesizer(() => new Promise((r) => { release = () => r([tone('Hi.')]); }));
    const dispatch = vi.fn();
    const job = startCourseNarration([{ slideId: 'a', title: 'A', script: 'Hi.' }], dispatch, 'af_heart');
    cancelNarration();
    release();
    await job;
    expect(dispatch).not.toHaveBeenCalled();
  });
});
