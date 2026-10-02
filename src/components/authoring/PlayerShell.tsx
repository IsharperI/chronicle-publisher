/**
 * Preview-mode player frame around the Canvas (also used as a live preview in
 * PlayerSettingsModal). Mirrors what the exported player looks like: title bar,
 * menu/notes sidebar, slide transitions, Prev/Play/Next/CC controls. Also owns
 * the quiz countdown timers (per-question and course-wide).
 */
import { hubLocked, nextSlideIndex } from '@/lib/navigation';
import { useCourse } from '@/context/CourseContext';
import { Canvas } from './Canvas';
import { ChevronLeft, ChevronRight, Play, Pause, Captions, CaptionsOff, Menu, FileText, Check, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { themeVarStyle } from '@/lib/themeVars';
import type { PlayerSettings } from '@/types/course';

type SidebarTab = 'menu' | 'notes';

function formatMSS(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PlayerShellProps {
  /** Optional override of playerSettings (e.g. for live preview in settings modal). Defaults to global state. */
  playerSettings?: PlayerSettings;
  /** When true, disables interactive nav/play actions (used for static previews). */
  interactive?: boolean;
}

/**
 * Articulate Storyline–style player shell wrapping the Canvas during preview.
 * Layout: top title bar, optional left/right sidebar (Menu / Notes tabs),
 * stage area, bottom controls (Prev/Play/Next/CC).
 */
export function PlayerShell({ playerSettings, interactive = true }: PlayerShellProps = {}) {
  const { state, dispatch } = useCourse();
  const ps = playerSettings ?? state.playerSettings;
  const slide = state.slides[state.activeSlideIndex];
  const transitionType = state.courseSettings.transition?.type ?? 'none';
  const transitionDuration = state.courseSettings.transition?.duration ?? 1;
  const transitionColor = state.courseSettings.transition?.color ?? '#000000';
  const [stagePhase, setStagePhase] = useState<'idle' | 'exit' | 'enter-from' | 'enter-to'>('idle');
  const [navLocked, setNavLocked] = useState(false);
  const timersRef = useRef<{ swap: number | null; finish: number | null; raf1: number | null; raf2: number | null }>({
    swap: null,
    finish: null,
    raf1: null,
    raf2: null,
  });

  const clearTransition = useCallback(() => {
    if (timersRef.current.swap !== null) window.clearTimeout(timersRef.current.swap);
    if (timersRef.current.finish !== null) window.clearTimeout(timersRef.current.finish);
    if (timersRef.current.raf1 !== null) cancelAnimationFrame(timersRef.current.raf1);
    if (timersRef.current.raf2 !== null) cancelAnimationFrame(timersRef.current.raf2);
    timersRef.current = { swap: null, finish: null, raf1: null, raf2: null };
  }, []);

  useEffect(() => () => clearTransition(), [clearTransition]);

  /** Go to a slide; with `back`, return along the path taken (Prev). */
  const navigateToIndex = useCallback((nextIndex: number, back = false) => {
    if (!interactive || navLocked) return;
    if (nextIndex < 0 || nextIndex >= state.slides.length || nextIndex === state.activeSlideIndex) return;

    clearTransition();

    if (transitionType === 'none' || transitionDuration <= 0) {
      setStagePhase('idle');
      setNavLocked(false);
      dispatch(back ? { type: 'PREVIEW_BACK' } : { type: 'SET_ACTIVE_SLIDE', index: nextIndex });
      return;
    }

    const halfMs = Math.max(50, (transitionDuration * 1000) / 2);
    dispatch({ type: 'SET_PLAYING', playing: false });
    setNavLocked(true);
    setStagePhase('exit');

    timersRef.current.swap = window.setTimeout(() => {
      dispatch(back ? { type: 'PREVIEW_BACK' } : { type: 'SET_ACTIVE_SLIDE', index: nextIndex });
      setStagePhase('enter-from');
      timersRef.current.raf1 = requestAnimationFrame(() => {
        timersRef.current.raf2 = requestAnimationFrame(() => setStagePhase('enter-to'));
      });
      timersRef.current.finish = window.setTimeout(() => {
        setStagePhase('idle');
        setNavLocked(false);
        timersRef.current.finish = null;
      }, halfMs);
      timersRef.current.swap = null;
    }, halfMs);
  }, [clearTransition, dispatch, interactive, navLocked, state.activeSlideIndex, state.slides.length, transitionDuration, transitionType]);

  const tabsAvailable: SidebarTab[] = [];
  if (ps.playerTabs?.showMenu) tabsAvailable.push('menu');
  if (ps.playerTabs?.showNotes) tabsAvailable.push('notes');
  const sidebarVisible = ps.sidebarPosition !== 'none' && tabsAvailable.length > 0;

  const [activeTab, setActiveTab] = useState<SidebarTab>(tabsAvailable[0] ?? 'menu');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [visitedIds, setVisitedIds] = useState<Set<string>>(() => new Set(slide ? [slide.id] : []));
  useEffect(() => {
    if (!slide) return;
    setVisitedIds((prev) => {
      if (prev.has(slide.id)) return prev;
      const next = new Set(prev);
      next.add(slide.id);
      return next;
    });
  }, [slide?.id]);
  const currentTab = tabsAvailable.includes(activeTab) ? activeTab : (tabsAvailable[0] ?? 'menu');

  // ===== Quiz timer countdown logic =====
  const courseTimerCfg = ps.courseTimer;
  const courseTimerEnabled = !!courseTimerCfg?.enabled;
  const courseTimerTotal = courseTimerEnabled
    ? Math.max(0, (courseTimerCfg!.minutes || 0) * 60 + (courseTimerCfg!.seconds || 0))
    : 0;
  const isQuizSlide = !!slide?.quiz;
  const slideQuizTimerCfg = slide?.quiz?.timer;
  const perQEnabled = !courseTimerEnabled && !!slideQuizTimerCfg?.enabled;
  const perQTotal = perQEnabled
    ? Math.max(0, (slideQuizTimerCfg!.minutes || 0) * 60 + (slideQuizTimerCfg!.seconds || 0))
    : 0;
  const slideId = slide?.id;
  const isQuizLocked = !!slideId && !!state.quizResults?.[slideId]?.submitted;
  const courseRemaining = state.courseQuizTimerRemaining;

  // Init course timer on first slide visit (any slide type).
  useEffect(() => {
    if (!interactive) return;
    if (!courseTimerEnabled) return;
    if (courseRemaining == null && courseTimerTotal > 0) {
      dispatch({ type: 'SET_COURSE_QUIZ_TIMER', seconds: courseTimerTotal });
    }
  }, [interactive, courseTimerEnabled, courseTimerTotal, courseRemaining, dispatch]);

  // If course timer already expired, mark current quiz as incorrect on entry.
  useEffect(() => {
    if (!interactive) return;
    if (!courseTimerEnabled) return;
    if (!isQuizSlide || !slideId || isQuizLocked) return;
    if (courseRemaining === 0) {
      dispatch({ type: 'SUBMIT_QUIZ', slideId, correct: false });
    }
  }, [interactive, courseTimerEnabled, isQuizSlide, slideId, isQuizLocked, courseRemaining, dispatch]);

  // Init per-question timer for the current slide.
  useEffect(() => {
    if (!interactive) return;
    if (!perQEnabled || !slideId || perQTotal <= 0) return;
    if (state.perQuestionTimerRemaining?.[slideId] == null) {
      dispatch({ type: 'SET_PER_QUESTION_TIMER', slideId, seconds: perQTotal });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, perQEnabled, perQTotal, slideId]);

  // Single ticker — drives both per-question and course timers as appropriate.
  useEffect(() => {
    if (!interactive || !slideId) return;
    const tickPerQ = perQEnabled && !isQuizLocked && perQTotal > 0;
    const tickCourse = courseTimerEnabled && courseTimerTotal > 0 && (state.courseQuizTimerRemaining ?? 0) > 0;
    if (!tickPerQ && !tickCourse) return;
    const id = window.setInterval(() => {
      if (tickCourse) {
        const cur = state.courseQuizTimerRemaining;
        if (cur != null && cur > 0) {
          const next = Math.max(0, cur - 1);
          dispatch({ type: 'SET_COURSE_QUIZ_TIMER', seconds: next });
          if (next <= 0 && isQuizSlide && !isQuizLocked) {
            dispatch({ type: 'SUBMIT_QUIZ', slideId, correct: false });
          }
        }
      }
      if (tickPerQ) {
        const cur = state.perQuestionTimerRemaining?.[slideId] ?? perQTotal;
        const next = Math.max(0, cur - 1);
        dispatch({ type: 'SET_PER_QUESTION_TIMER', slideId, seconds: next });
        if (next <= 0) dispatch({ type: 'SUBMIT_QUIZ', slideId, correct: false });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [interactive, slideId, perQEnabled, perQTotal, courseTimerEnabled, courseTimerTotal, isQuizSlide, isQuizLocked, state.courseQuizTimerRemaining, state.perQuestionTimerRemaining, dispatch]);

  const showCourseTimer =
    courseTimerEnabled &&
    courseTimerCfg!.showToLearner !== false &&
    courseRemaining != null;
  const courseTimerDisplay = showCourseTimer ? formatMSS(courseRemaining!) : null;
  const courseTimerCritical = showCourseTimer && (courseRemaining as number) <= 10;


  const bgStyle: React.CSSProperties = { backgroundColor: ps.backgroundColor };
  if (ps.backgroundImage) {
    bgStyle.backgroundImage = `url(${ps.backgroundImage})`;
    if (ps.backgroundMode === 'stretch') {
      bgStyle.backgroundSize = '100% 100%';
      bgStyle.backgroundRepeat = 'no-repeat';
    } else if (ps.backgroundMode === 'fit') {
      bgStyle.backgroundSize = 'contain';
      bgStyle.backgroundRepeat = 'no-repeat';
      bgStyle.backgroundPosition = 'center';
    } else {
      bgStyle.backgroundRepeat = 'repeat';
    }
  }

  const sidebar = sidebarVisible && sidebarOpen && (
    <aside
      className="w-64 shrink-0 flex flex-col border-white/10 bg-black/30 backdrop-blur-sm"
      style={{
        borderRightWidth: ps.sidebarPosition === 'left' ? 1 : 0,
        borderLeftWidth: ps.sidebarPosition === 'right' ? 1 : 0,
        fontFamily: ps.fontFamily,
      }}
    >
      {tabsAvailable.length > 1 && (
        <div className="flex border-b border-white/10">
          {tabsAvailable.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors ${
                currentTab === t ? 'text-white border-b-2' : 'text-white/60 hover:text-white/90'
              }`}
              style={currentTab === t ? { borderColor: ps.buttonColor } : undefined}
            >
              {t === 'menu' ? <Menu className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              {t === 'menu' ? 'Menu' : 'Notes'}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 text-white/90 text-xs">
        {currentTab === 'menu' ? (
          <ul className="space-y-1">
            {state.slides.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => navigateToIndex(i)}
                  disabled={navLocked}
                  className={`w-full text-left px-2.5 py-2 rounded transition-colors ${
                    i === state.activeSlideIndex ? 'text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                  style={i === state.activeSlideIndex ? { backgroundColor: `${ps.buttonColor}33` } : undefined}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-flex w-3.5 justify-center">
                      {visitedIds.has(s.id) ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
                    </span>
                    <span className="opacity-60">{i + 1}.</span>
                    <span>{s.title?.trim() || `Slide ${i + 1}`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="whitespace-pre-wrap leading-relaxed">
            {slide?.notes?.trim() ? slide.notes : <span className="text-white/40 italic">No notes for this slide.</span>}
          </div>
        )}
      </div>
    </aside>
  );

  // Next follows the slide's connections (lib/navigation.ts); Prev retraces the path taken.
  const nextIndex = nextSlideIndex(state.slides, state.activeSlideIndex);
  const history = state.previewHistory ?? [];
  const backIndex = history.length ? history[history.length - 1] : -1;

  const here = state.slides[state.activeSlideIndex];
  // Required hubs keep Next locked until every branch is completed.
  const locked = hubLocked(here, state.branchDone?.[here?.id ?? '']);
  const isLast = nextIndex < 0 || locked;
  const goNext = () => { if (!locked) navigateToIndex(nextIndex); };
  const isFirst = backIndex < 0;

  const btnStyle: React.CSSProperties = {
    backgroundColor: ps.buttonColor,
    borderRadius: ps.buttonBorderRadius,
    fontFamily: ps.fontFamily,
  };

  return (
    <div
      className="flex-1 flex flex-col min-h-0 text-white"
      style={{ ...themeVarStyle(state.courseSettings.themeColors), ...bgStyle, fontFamily: ps.fontFamily }}
    >
      {/* Top bar */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-5 border-b border-white/10 bg-black/30 backdrop-blur-sm">
        {sidebarVisible && (
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
            aria-label={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
            title={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        )}
        <h1 className="text-sm font-semibold tracking-wide truncate">
          {ps.courseTitle || 'Untitled Course'}
        </h1>
        <div className="ml-auto text-xs text-white/60">
          Slide {state.activeSlideIndex + 1} / {state.slides.length}
        </div>
      </header>

      {/* Body: sidebar + stage */}
      <div className="flex-1 flex min-h-0 relative">
        {ps.sidebarPosition === 'left' && sidebar}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          <SlideStage
            transitionType={transitionType}
            transitionDuration={transitionDuration}
            transitionColor={transitionColor}
            phase={stagePhase}
            onPreviewNext={goNext}
          />
        </div>
        {ps.sidebarPosition === 'right' && sidebar}
        {courseTimerDisplay && (
          <div
            className="absolute top-3 right-3 z-50 px-3 py-1.5 rounded-md text-sm tabular-nums shadow"
            style={{
              background: courseTimerCritical ? '#fee2e2' : 'rgba(15,23,42,0.7)',
              color: courseTimerCritical ? '#b91c1c' : '#fff',
              fontWeight: courseTimerCritical ? 700 : 500,
              border: courseTimerCritical ? '1px solid #fca5a5' : '1px solid rgba(255,255,255,0.1)',
              fontFamily: ps.fontFamily,
            }}
            aria-live="polite"
          >
            ⏱ {courseTimerDisplay}
          </div>
        )}
        <QuizFeedbackOverlay onContinue={goNext} />
      </div>

      {/* Bottom controls */}
      <footer className="h-14 shrink-0 flex items-center justify-center gap-2 px-5 border-t border-white/10 bg-black/40 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => navigateToIndex(backIndex, true)}
          disabled={isFirst || navLocked}
          className="text-white text-xs font-medium px-4 py-2 disabled:opacity-40"
          style={btnStyle}
        >
          <ChevronLeft className="inline h-4 w-4 mr-1" />
          Prev
        </button>

        {ps.playerControls?.showPlayPause && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'TOGGLE_PLAY' })}
            className="text-white text-xs font-medium px-4 py-2 inline-flex items-center"
            style={btnStyle}
            aria-label={state.isPlaying ? 'Pause' : 'Play'}
          >
            {state.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        )}

        <button
          type="button"
          onClick={goNext}
          disabled={isLast || navLocked}
          title={locked ? 'Complete every section to continue' : undefined}
          className="text-white text-xs font-medium px-4 py-2 disabled:opacity-40"
          style={btnStyle}
        >
          Next
          <ChevronRight className="inline h-4 w-4 ml-1" />
        </button>

        {ps.playerControls?.showCaptions && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_CC_ENABLED', value: !state.ccEnabled })}
            className="text-white text-xs font-medium px-3 py-2 inline-flex items-center gap-1.5 ml-2"
            style={{ ...btnStyle, opacity: state.ccEnabled ? 1 : 0.55 }}
            aria-pressed={state.ccEnabled}
            title={state.ccEnabled ? 'Hide captions' : 'Show captions'}
          >
            {state.ccEnabled ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
            CC
          </button>
        )}
      </footer>
    </div>
  );
}

/**
 * Slide stage with "Fade through Color" transition. The container behind the
 * Canvas is painted with `transitionColor`; on slide change we fade the
 * Canvas opacity to 0, swap the slide (which has already happened in state),
 * then fade back in. This avoids the absolute-positioned overlap that broke
 * canvas scaling.
 */
interface SlideStageProps {
  transitionType: 'none' | 'fade' | 'push-up' | 'push-left' | 'zoom-in';
  transitionDuration: number;
  transitionColor: string;
  phase: 'idle' | 'exit' | 'enter-from' | 'enter-to';
  onPreviewNext: () => void;
}

function SlideStage({ transitionType, transitionDuration, transitionColor, phase, onPreviewNext }: SlideStageProps) {
  const { state } = useCourse();
  const { width: canvasW, height: canvasH } = state.courseSettings.canvasDimensions;
  const halfMs = Math.max(50, (transitionDuration * 1000) / 2);
  const animatedStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    willChange: 'transform, opacity',
    transformOrigin: 'center center',
    transition: phase === 'enter-from' || phase === 'idle' ? 'none' : `opacity ${halfMs}ms ease, transform ${halfMs}ms ease`,
    opacity: 1,
    transform: 'none',
  };

  if (transitionType !== 'none') {
    switch (transitionType) {
      case 'fade':
        if (phase === 'exit' || phase === 'enter-from') animatedStyle.opacity = 0;
        if (phase === 'enter-to') animatedStyle.opacity = 1;
        break;
      case 'push-up':
        if (phase === 'exit') animatedStyle.transform = 'translateY(-100%)';
        if (phase === 'enter-from') animatedStyle.transform = 'translateY(100%)';
        if (phase === 'enter-to') animatedStyle.transform = 'translateY(0%)';
        break;
      case 'push-left':
        if (phase === 'exit') animatedStyle.transform = 'translateX(-100%)';
        if (phase === 'enter-from') animatedStyle.transform = 'translateX(100%)';
        if (phase === 'enter-to') animatedStyle.transform = 'translateX(0%)';
        break;
      case 'zoom-in':
        if (phase === 'exit') {
          animatedStyle.transform = 'scale(1.08)';
          animatedStyle.opacity = 0;
        }
        if (phase === 'enter-from') {
          animatedStyle.transform = 'scale(0.86)';
          animatedStyle.opacity = 0;
        }
        if (phase === 'enter-to') {
          animatedStyle.transform = 'scale(1)';
          animatedStyle.opacity = 1;
        }
        break;
    }
  }

  return (
    <div
      className="relative flex-1 min-w-0 overflow-hidden flex items-center justify-center p-4"
      style={{ backgroundColor: transitionColor }}
    >
      {/* Lock the slide stage to the configured canvas aspect ratio so it
          matches the editor canvas (e.g. 4:3 → 1024×768, 16:9 → 1920×1080,
          or any custom size). The inner Canvas uses transform:scale based
          on this container's measured size, so enforcing the ratio here
          guarantees the preview never collapses or stretches. */}
      <div
        className="relative"
        style={{
          ...animatedStyle,
          aspectRatio: `${canvasW} / ${canvasH}`,
          width: 'auto',
          height: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          flex: '0 1 auto',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div style={{ width: '100%', height: '100%', display: 'flex' }}>
          <Canvas onPreviewNext={onPreviewNext} />
        </div>
      </div>
    </div>
  );
}



function QuizFeedbackOverlay({ onContinue }: { onContinue: () => void }) {
  const { state, dispatch } = useCourse();
  const fb = state.quizFeedbackOpen;
  if (!fb) return null;
  const slide = state.slides.find((s) => s.id === fb.slideId);
  const target = slide?.quiz ? (fb.correct ? slide.quiz.correctFeedback : slide.quiz.incorrectFeedback) : null;
  if (!target || target.mode !== 'overlay') return null;
  // If learner failed but quiz isn't yet locked (attempts remain), don't advance — let them retry.
  const submitted = !!state.quizResults?.[fb.slideId]?.submitted;
  const advance = fb.correct || submitted;
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: 32, maxWidth: 480, width: '100%', textAlign: 'center', color: '#0f172a' }}>
        <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, color: fb.correct ? '#166534' : '#991b1b' }}>
          {fb.correct ? 'Correct!' : 'Incorrect'}
        </h3>
        <p style={{ fontSize: 16, marginBottom: 24 }}>{target.message || ''}</p>
        <button
          type="button"
          onClick={() => { dispatch({ type: 'CLOSE_QUIZ_FEEDBACK' }); if (advance) onContinue(); }}
          style={{ background: '#3b82f6', color: '#fff', fontWeight: 600, padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer' }}
        >
          {advance ? 'Continue' : 'Try Again'}
        </button>
      </div>
    </div>
  );
}
