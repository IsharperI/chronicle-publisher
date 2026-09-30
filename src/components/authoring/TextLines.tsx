/**
 * Renders text element content. Lines starting with "• " get a hanging indent,
 * so wrapped bullet text lines up under the text rather than under the bullet.
 * Content without bullet lines renders exactly as before (plain pre-wrap text).
 * Keep in sync with fillText() in src/lib/publish/runtime/player.ts.
 */
const BULLET = '• ';

export function TextLines({ content }: { content: string }) {
  const text = content ?? '';
  const lines = text.split('\n');
  if (!lines.some((l) => l.startsWith(BULLET))) return <>{text}</>;
  return (
    <>
      {lines.map((line, i) =>
        line.startsWith(BULLET) ? (
          <div key={i} style={{ display: 'flex' }}>
            <span style={{ flex: 'none', width: '0.9em' }}>•</span>
            <span style={{ flex: 1, minWidth: 0 }}>{line.slice(BULLET.length)}</span>
          </div>
        ) : (
          <div key={i}>{line || ' '}</div>
        ),
      )}
    </>
  );
}
