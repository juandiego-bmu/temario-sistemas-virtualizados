"use client";

import * as React from "react";
import { showIn } from "./diagrams/kit";

interface Ctx {
  recall: boolean;
  shown: Set<string>;
  reveal: (k: string) => void;
  register: (k: string) => () => void;
}

const TermsCtx = React.createContext<Ctx | null>(null);

/** A list of term cards with a "modo repaso" that covers every definition until you click it. */
export function Terms({ children }: { children: React.ReactNode }) {
  const [recall, setRecall] = React.useState(false);
  const [shown, setShown] = React.useState<Set<string>>(new Set());
  const [keys, setKeys] = React.useState<Set<string>>(new Set());
  const register = React.useCallback((k: string) => {
    setKeys((s) => new Set(s).add(k));
    return () =>
      setKeys((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
  }, []);
  const reveal = React.useCallback((k: string) => setShown((s) => new Set(s).add(k)), []);
  const ctx = React.useMemo(() => ({ recall, shown, reveal, register }), [recall, shown, reveal, register]);
  const done = [...keys].filter((k) => shown.has(k)).length;
  return (
    <TermsCtx.Provider value={ctx}>
      <div className="terms-wrap">
        <div className="terms-bar">
          <button
            type="button"
            className="terms-mode"
            aria-pressed={recall}
            onClick={() => {
              setRecall((r) => !r);
              setShown(new Set());
            }}
          >
            🧠 {recall ? "Salir del modo repaso" : "Modo repaso"}
          </button>
          {recall ? (
            <>
              <span className="terms-count" aria-live="polite">
                {done} / {keys.size} comprobados
              </span>
              <button type="button" className="terms-reset" onClick={() => setShown(new Set())}>
                Tapar otra vez
              </button>
            </>
          ) : (
            <span className="terms-hint">tapa las definiciones e intenta recordarlas</span>
          )}
        </div>
        <dl className="terms" data-recall={recall ? "" : undefined}>
          {children}
        </dl>
      </div>
    </TermsCtx.Provider>
  );
}

function useTerm(k: string) {
  const ctx = React.useContext(TermsCtx);
  const register = ctx?.register;
  React.useEffect(() => register?.(k), [register, k]);
  return { hidden: !!ctx?.recall && !ctx.shown.has(k), reveal: () => ctx?.reveal(k) };
}

function ShowButtons({ show }: { show?: [string, string][] }) {
  if (!show) return null;
  return (
    <div className="term-show">
      {show.map(([label, to]) => (
        <button key={to + label} type="button" onClick={() => showIn(to)}>
          ▶ {label}
        </button>
      ))}
    </div>
  );
}

const hiddenProps = (hidden: boolean, reveal: () => void, k: string) =>
  hidden
    ? {
        role: "button",
        tabIndex: 0,
        "aria-label": `${k}: pulsa para ver la respuesta`,
        onClick: reveal,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            reveal();
          }
        },
      }
    : {};

/** One term card. `show` adds buttons that put the section's figure in the state this term describes; `hot` flags what the exam asks. */
export function T({ k, children, show, hot }: { k: string; children: React.ReactNode; show?: [string, string][]; hot?: boolean }) {
  const { hidden, reveal } = useTerm(k);
  return (
    <div className="term reveal" data-hidden={hidden ? "" : undefined} data-hot={hot ? "" : undefined} {...hiddenProps(hidden, reveal, k)}>
      <dt>
        {k}
        {hot ? <span className="term-hot">★ examen</span> : null}
      </dt>
      <dd aria-hidden={hidden || undefined}>{children}</dd>
      {hidden ? <span className="term-peek">¿Lo recuerdas? Pulsa para comprobarlo</span> : <ShowButtons show={show} />}
    </div>
  );
}

export function Formula({ title, children, example, show }: { title: string; children: React.ReactNode; example?: string; show?: [string, string][] }) {
  const { hidden, reveal } = useTerm(title);
  return (
    <div className="formula reveal" data-hidden={hidden ? "" : undefined} {...hiddenProps(hidden, reveal, title)}>
      <span className="formula-title">{title}</span>
      <code aria-hidden={hidden || undefined}>{children}</code>
      {example ? <span className="formula-ex">{example}</span> : null}
      {hidden ? <span className="term-peek">¿Lo recuerdas? Pulsa para comprobarlo</span> : <ShowButtons show={show} />}
    </div>
  );
}
