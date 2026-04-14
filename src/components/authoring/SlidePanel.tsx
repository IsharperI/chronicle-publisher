import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function SlidePanel() {
  const { state, dispatch } = useCourse();
  const isMain = state.viewMode === 'main';
  const slides = isMain ? state.slides : state.masterSlides;

  return (
    <div className="w-[200px] border-r bg-card flex flex-col shrink-0">
      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'main' })}
          className={cn(
            'flex-1 px-2 py-2 text-xs font-medium transition-colors',
            isMain
              ? 'bg-background text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          )}
        >
          Main Timeline
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', mode: 'master' })}
          className={cn(
            'flex-1 px-2 py-2 text-xs font-medium transition-colors',
            !isMain
              ? 'bg-background text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
          )}
        >
          Masters
        </button>
      </div>

      {/* Slide list */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              onClick={() => {
                if (isMain) {
                  dispatch({ type: 'SET_ACTIVE_SLIDE', index: i });
                } else {
                  dispatch({ type: 'SET_ACTIVE_MASTER_SLIDE', index: i });
                }
              }}
              className={cn(
                'relative w-full aspect-video rounded border-2 bg-background text-xs font-medium flex items-center justify-center transition-colors',
                i === state.activeSlideIndex
                  ? 'border-primary'
                  : 'border-border hover:border-muted-foreground/50'
              )}
            >
              <span className="text-muted-foreground">
                {isMain ? `Slide ${i + 1}` : `Master ${i + 1}`}
              </span>
              {slide.elements.length > 0 && (
                <span className="absolute bottom-1 right-1 text-[10px] text-muted-foreground">
                  {slide.elements.length} el
                </span>
              )}
              {isMain && slide.masterId && (
                <span className="absolute top-0.5 left-1 text-[8px] text-primary font-semibold">M</span>
              )}
            </button>
          ))}
          {!isMain && slides.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No master slides</p>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-2 border-t flex gap-1">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => {
            if (isMain) {
              dispatch({ type: 'ADD_SLIDE' });
            } else {
              dispatch({ type: 'ADD_MASTER_SLIDE' });
            }
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {isMain ? 'Add Slide' : 'Add Master'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            if (isMain) {
              dispatch({ type: 'DELETE_SLIDE', index: state.activeSlideIndex });
            } else {
              dispatch({ type: 'DELETE_MASTER_SLIDE', index: state.activeSlideIndex });
            }
          }}
          disabled={isMain ? state.slides.length <= 1 : state.masterSlides.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
