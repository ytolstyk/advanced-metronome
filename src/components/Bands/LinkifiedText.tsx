import { useMemo } from 'react';
import { splitTextWithLinks } from '../../bandUtils';

/** Plain text with http(s) URLs turned into links that open in a new tab. */
export function LinkifiedText({ text }: { text: string }) {
  const parts = useMemo(() => splitTextWithLinks(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 break-all"
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
