"use client";

import * as React from "react";

/** A shell snippet with a copy button. Lines starting with # are shown as comments. */
export function Cmd({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = React.useState(false);
  const text = children.replace(/^\n+|\s+$/g, "");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <div className="cmd">
      {title ? <div className="cmd-title">{title}</div> : null}
      <pre>
        <code>
          {text.split("\n").map((line, i) => (
            <span key={i} className={line.trimStart().startsWith("#") ? "cmd-c" : undefined}>
              {line}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
      <button type="button" className="cmd-copy" onClick={copy} aria-label="Copiar comando">
        {copied ? "✓ copiado" : "copiar"}
      </button>
    </div>
  );
}

/** Small boxed note for exam tips. */
export function Exam({ children, title = "Cae en el examen" }: { children: React.ReactNode; title?: string }) {
  return (
    <aside className="exam reveal">
      <span className="exam-title">{title}</span>
      <div>{children}</div>
    </aside>
  );
}
