/**
 * Renders AI and teacher answers: paragraphs, numbered / bulleted lines and **bold**.
 * Everything is rendered as text nodes, so nothing in an answer can inject HTML.
 */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
      : part,
  );
}

export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3 leading-[1.75] text-ink [overflow-wrap:anywhere]">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const listLike = lines.every((l) => /^\s*([-*•]|\d+[.)]|[০-৯]+[.)])\s+/.test(l));
        if (listLike && lines.length > 1) {
          return (
            <ul key={i} className="flex flex-col gap-1.5">
              {lines.map((l, j) => {
                const m = l.match(/^\s*([-*•]|\d+[.)]|[০-৯]+[.)])\s+(.*)$/)!;
                const bullet = /[-*•]/.test(m[1]) ? "•" : m[1];
                return (
                  <li key={j} className="flex gap-2">
                    <span className="shrink-0 text-ink-soft">{bullet}</span><span>{inline(m[2])}</span>
                  </li>
                );
              })}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-line">{inline(block)}</p>;
      })}
    </div>
  );
}
