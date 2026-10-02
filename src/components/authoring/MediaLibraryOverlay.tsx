/**
 * Media library: lists every image, video and audio file used anywhere in the
 * course (slides and master slides), for reuse on the current slide.
 */
import { useMemo, useState } from 'react';
import { useCourse } from '@/context/CourseContext';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { X, ImageIcon, Music, Video as VideoIcon, FileAudio, FileVideo } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ImageElement,
  VideoElement,
  SlideElement,
  SlideAudio,
} from '@/types/course';

type MediaTab = 'images' | 'audio' | 'video';

interface ImageItem {
  kind: 'image';
  id: string;
  src: string;
  name: string;
}
interface VideoItem {
  kind: 'video';
  id: string;
  src: string;
  name: string;
}
interface AudioItem {
  kind: 'audio';
  id: string;
  src: string;
  name: string;
}

export function MediaLibraryOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useCourse();
  const [tab, setTab] = useState<MediaTab>('images');

  const slides = state.slides;
  const hasActiveSlide = slides.length > 0 && state.activeSlideIndex >= 0 && state.activeSlideIndex < slides.length;

  const { images, videos, audios } = useMemo(() => {
    const imgMap = new Map<string, ImageItem>();
    const vidMap = new Map<string, VideoItem>();
    const audMap = new Map<string, AudioItem>();

    const allSlides = [...state.slides, ...state.masterSlides];
    for (const slide of allSlides) {
      for (const el of slide.elements as SlideElement[]) {
        if (el.type === 'image') {
          const e = el as ImageElement;
          if (e.src && !imgMap.has(e.src)) {
            imgMap.set(e.src, { kind: 'image', id: e.id, src: e.src, name: e.alt || 'image' });
          }
        } else if (el.type === 'video') {
          const e = el as VideoElement;
          if (e.src && !vidMap.has(e.src)) {
            vidMap.set(e.src, { kind: 'video', id: e.id, src: e.src, name: 'video' });
          }
        }
      }
      const slideAudios: SlideAudio[] = (slide as any).audio ?? [];
      for (const a of slideAudios) {
        if (a.src && !audMap.has(a.src)) {
          audMap.set(a.src, { kind: 'audio', id: a.id, src: a.src, name: a.name || 'audio' });
        }
      }
    }
    return {
      images: Array.from(imgMap.values()),
      videos: Array.from(vidMap.values()),
      audios: Array.from(audMap.values()),
    };
  }, [state.slides, state.masterSlides]);

  if (!open) return null;

  const insertImage = (item: ImageItem) => {
    const el: ImageElement = {
      id: crypto.randomUUID(),
      type: 'image',
      x: 0, y: 0, width: 800, height: 600,
      src: item.src, alt: item.name,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  const insertVideo = (item: VideoItem) => {
    const el: VideoElement = {
      id: crypto.randomUUID(),
      type: 'video',
      x: 0, y: 0, width: 800, height: 450,
      src: item.src,
      controls: true,
      autoplay: false,
      startTime: 0, duration: 5000, triggers: [],
      animationIn: 'none', animationOut: 'none',
      entranceDuration: 500, exitDuration: 500,
      isLocked: false, isHidden: false,
    };
    dispatch({ type: 'ADD_ELEMENT', element: el });
  };

  const insertAudio = (item: AudioItem) => {
    const audio: SlideAudio = {
      id: crypto.randomUUID(),
      name: item.name,
      src: item.src,
      duration: 0,
      captions: [],
    };
    dispatch({ type: 'ADD_AUDIO', audio });
  };

  const handleClick = (item: ImageItem | VideoItem | AudioItem) => {
    if (!hasActiveSlide) return;
    if (item.kind === 'image') insertImage(item);
    else if (item.kind === 'video') insertVideo(item);
    else insertAudio(item);
  };

  const tabs: { key: MediaTab; label: string; icon: React.ComponentType<any>; count: number }[] = [
    { key: 'images', label: 'Images', icon: ImageIcon, count: images.length },
    { key: 'audio', label: 'Audio', icon: Music, count: audios.length },
    { key: 'video', label: 'Video', icon: VideoIcon, count: videos.length },
  ];

  const items: (ImageItem | VideoItem | AudioItem)[] =
    tab === 'images' ? images : tab === 'audio' ? audios : videos;

  const tooltipMsg = 'Select a slide to insert media';

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Media Library"
    >
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center px-6 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Media Library</h2>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close media library"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6 flex gap-1 shrink-0">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className="text-xs text-muted-foreground">({count})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {!hasActiveSlide && items.length > 0 && (
          <div className="mb-4 text-xs text-muted-foreground italic">
            Select a slide to insert media.
          </div>
        )}
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No {tab} have been added to this course yet. Use the Insert tab to add media.
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4">
              {items.map((item) => (
                <Tooltip key={item.src}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleClick(item)}
                      className={cn(
                        'group flex flex-col rounded-lg border border-border overflow-hidden bg-card text-left transition-all',
                        hasActiveSlide
                          ? 'hover:border-primary hover:shadow-md cursor-pointer'
                          : 'cursor-not-allowed opacity-70'
                      )}
                    >
                      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        {item.kind === 'image' ? (
                          <img
                            src={item.src}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : item.kind === 'video' ? (
                          <FileVideo className="h-12 w-12 text-muted-foreground" />
                        ) : (
                          <FileAudio className="h-12 w-12 text-muted-foreground" />
                        )}
                      </div>
                      <div className="px-2 py-1.5 text-xs text-foreground truncate" title={item.name}>
                        {item.name}
                      </div>
                    </button>
                  </TooltipTrigger>
                  {!hasActiveSlide && (
                    <TooltipContent>{tooltipMsg}</TooltipContent>
                  )}
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
