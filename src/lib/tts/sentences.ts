import { TextSplitterStream } from 'kokoro-js';

/**
 * Split a script into sentences for Kokoro, as a *closed* stream.
 *
 * kokoro-js's `tts.stream(text)` pushes the text into a TextSplitterStream but
 * never closes it, so the splitter waits forever for more text after the last
 * sentence: a one-sentence script never starts, and longer scripts hang before
 * their final sentence. Closing it ourselves flushes the last sentence.
 */
export function sentenceStream(text: string): TextSplitterStream {
  const stream = new TextSplitterStream();
  stream.push(text);
  stream.close();
  return stream;
}
