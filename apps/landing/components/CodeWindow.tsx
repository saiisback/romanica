import { Fragment, type ReactNode } from "react";

const KEYWORDS = new Set([
  "import",
  "from",
  "const",
  "let",
  "await",
  "async",
  "new",
  "return",
  "function",
  "export",
  "default",
]);

/** Tiny, safe highlighter — comments, strings, keywords, calls. No deps. */
function highlightLine(line: string, key: number): ReactNode {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return (
      <span key={key} className="text-faint">
        {line}
      </span>
    );
  }

  // Split on strings and inline comments, keeping the delimiters.
  const parts = line.split(/("[^"]*"|'[^']*'|`[^`]*`|\/\/.*$)/g);
  return (
    <Fragment key={key}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^("|'|`)/.test(part)) {
          return (
            <span key={i} className="text-flame">
              {part}
            </span>
          );
        }
        if (part.startsWith("//")) {
          return (
            <span key={i} className="text-faint">
              {part}
            </span>
          );
        }
        // word-level: keywords + function calls
        const words = part.split(/(\b\w+\b)/g);
        return words.map((w, j) => {
          if (KEYWORDS.has(w)) {
            return (
              <span key={`${i}-${j}`} className="text-blood">
                {w}
              </span>
            );
          }
          return <Fragment key={`${i}-${j}`}>{w}</Fragment>;
        });
      })}
    </Fragment>
  );
}

export function CodeWindow({ title, code }: { title: string; code: string }) {
  const lines = code.split("\n");
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#0b0b0e] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-center gap-2 border-b border-line bg-panel/60 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a3e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a3e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#3a3a3e]" />
        <span className="ml-2 font-mono text-xs text-faint">{title}</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-ink sm:text-[13px]">
        <code>
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="mr-4 w-5 shrink-0 select-none text-right text-faint/50">
                {i + 1}
              </span>
              <span className="whitespace-pre">{highlightLine(line, i)}</span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}
