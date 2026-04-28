import { useCourse } from '@/context/CourseContext';
import { Canvas } from './Canvas';
import { ChevronLeft, ChevronRight, Play, Pause, Captions, CaptionsOff, Menu, FileText } from 'lucide-react';
import { useState } from 'react';
import { themeVarStyle } from '@/lib/themeVars';
import type { PlayerSettings } from '@/types/course';

type SidebarTab = 'menu' | 'notes';

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

  const tabsAvailable: SidebarTab[] = [];
  if (ps.playerTabs?.showMenu) tabsAvailable.push('menu');
  if (ps.playerTabs?.showNotes) tabsAvailable.push('notes');
  const sidebarVisible = ps.sidebarPosition !== 'none' && tabsAvailable.length > 0;

  const [activeTab, setActiveTab] = useState<SidebarTab>(tabsAvailable[0] ?? 'menu');
  const currentTab = tabsAvailable.includes(activeTab) ? activeTab : (tabsAvailable[0] ?? 'menu');

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

  const sidebar = sidebarVisible && (
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
                  onClick={() => interactive && dispatch({ type: 'SET_ACTIVE_SLIDE', index: i })}
                  className={`w-full text-left px-2.5 py-2 rounded transition-colors ${
                    i === state.activeSlideIndex ? 'text-white' : 'text-white/70 hover:bg-white/5'
                  }`}
                  style={i === state.activeSlideIndex ? { backgroundColor: `${ps.buttonColor}33` } : undefined}
                >
                  <span className="opacity-60 mr-1.5">{i + 1}.</span>
                  Slide {i + 1}
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

  const isLast = state.activeSlideIndex === state.slides.length - 1;
  const isFirst = state.activeSlideIndex === 0;

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
      <header className="h-12 shrink-0 flex items-center px-5 border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <h1 className="text-sm font-semibold tracking-wide truncate">
          {ps.courseTitle || 'Untitled Course'}
        </h1>
        <div className="ml-auto text-xs text-white/60">
          Slide {state.activeSlideIndex + 1} / {state.slides.length}
        </div>
      </header>

      {/* Body: sidebar + stage */}
      <div className="flex-1 flex min-h-0">
        {ps.sidebarPosition === 'left' && sidebar}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {(() => {
            const tType = slide?.transitionType ?? 'none';
            const tDur = slide?.transitionDuration ?? 0.5;
            const animClass = tType !== 'none' ? `slide-trans-${tType}` : '';
            // Re-keying the wrapper on slide id forces React to remount, which
            // restarts the CSS animation cleanly on every slide change.
            return (
              <div
                key={slide?.id ?? state.activeSlideIndex}
                className={`flex-1 flex min-w-0 ${animClass}`}
                style={animClass ? ({ ['--slide-trans-dur' as any]: `${tDur}s` }) : undefined}
              >
                <Canvas />
              </div>
            );
          })()}
        </div>
        {ps.sidebarPosition === 'right' && sidebar}
      </div>

      {/* Bottom controls */}
      <footer className="h-14 shrink-0 flex items-center justify-center gap-2 px-5 border-t border-white/10 bg-black/40 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => dispatch({ type: 'PREVIEW_PREV' })}
          disabled={isFirst}
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
          onClick={() => dispatch({ type: 'PREVIEW_NEXT' })}
          disabled={isLast}
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
