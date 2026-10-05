import { ImagePlus } from 'lucide-react';

/** Editor look of an empty image placeholder (lib/imagePlaceholders.ts). */
export function PlaceholderBox({ description, compact }: { description: string; compact?: boolean }) {
  return (
    <div
      data-image-placeholder={compact ? "thumbnail" : "editor"}
      style={{
        width: '100%', height: '100%', boxSizing: 'border-box', border: '2px dashed #94a3b8', borderRadius: 6,
        background: '#f1f5f9', color: '#475569', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 6, padding: 10, textAlign: 'center', overflow: 'hidden', fontFamily: 'system-ui, sans-serif',
      }}
    >
      <ImagePlus style={{ width: compact ? 40 : 34, height: compact ? 40 : 34, opacity: 0.7, flexShrink: 0 }} />
      {!compact && <div style={{ fontSize: 14, lineHeight: 1.3, maxHeight: '60%', overflow: 'hidden' }}>{description || 'Image'}</div>}
      {!compact && <div style={{ fontSize: 12, opacity: 0.75 }}>Double-click to add an image</div>}
    </div>
  );
}

