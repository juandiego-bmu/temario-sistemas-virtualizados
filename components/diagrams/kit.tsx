"use client";

import * as React from "react";
import { useMounted } from "../figs/common";

// "Ver en la figura": a term card names a figure (its ns) and a key; the figure listens and shows it.
const SHOW = "asv:show";

export function showIn(target: string) {
  const ns = target.split(":")[0];
  window.dispatchEvent(new CustomEvent(SHOW, { detail: target }));
  const el = document.querySelector<HTMLElement>(`[data-ns="${ns}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.removeAttribute("data-flash");
  void el.offsetWidth;
  el.setAttribute("data-flash", "");
  window.setTimeout(() => el.removeAttribute("data-flash"), 1600);
}

export function useShow(ns: string, on: (key: string) => void) {
  const latest = React.useRef(on);
  latest.current = on;
  React.useEffect(() => {
    const listen = (e: Event) => {
      const [n, key = ""] = String((e as CustomEvent<string>).detail).split(":");
      if (n === ns) latest.current(key);
    };
    window.addEventListener(SHOW, listen);
    return () => window.removeEventListener(SHOW, listen);
  }, [ns]);
}

// A flat explanatory diagram: kicker + title, the svg, optional controls and a one-line takeaway.
export function Diagram({
  title,
  kicker = "Diagrama",
  label,
  viewBox = "0 0 560 260",
  controls,
  note,
  wide,
  ns,
  children,
}: {
  title: string;
  kicker?: string;
  label: string;
  viewBox?: string;
  controls?: React.ReactNode;
  note?: React.ReactNode;
  wide?: boolean;
  ns?: string;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  return (
    <figure className={wide ? "dg dg-wide reveal" : "dg reveal"} data-ns={ns}>
      <figcaption className="dg-head">
        <span className="dg-kicker">{kicker}</span>
        <strong>{title}</strong>
      </figcaption>
      <svg className="dg-svg" viewBox={viewBox} role="img" aria-label={label}>
        {mounted ? children : null}
      </svg>
      {controls ? <div className="controls">{controls}</div> : null}
      {note ? <div className="dg-note">{note}</div> : null}
    </figure>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange, format = (v: number) => String(v) }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const id = React.useId();
  return (
    <label className="slider" htmlFor={id}>
      <span className="choice-label">{label}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format(value)}</output>
    </label>
  );
}

export function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const id = React.useId();
  return (
    <label className="num" htmlFor={id}>
      <span className="choice-label">{label}</span>
      <input id={id} type="number" min={min} max={max} value={value} onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
    </label>
  );
}

// An arrow from a to b with a small head; `tone` maps to a CSS class.
export function Arrow({ x1, y1, x2, y2, tone = "", dashed, flow }: { x1: number; y1: number; x2: number; y2: number; tone?: string; dashed?: boolean; flow?: boolean }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 7;
  const head = `M${x2} ${y2}L${x2 - h * Math.cos(a - 0.45)} ${y2 - h * Math.sin(a - 0.45)}M${x2} ${y2}L${x2 - h * Math.cos(a + 0.45)} ${y2 - h * Math.sin(a + 0.45)}`;
  return (
    <g className={`dg-arrow ${tone}`} data-dashed={dashed ? "" : undefined} data-flow={flow ? "" : undefined}>
      <path d={`M${x1} ${y1}L${x2} ${y2}`} />
      <path className="dg-head-line" d={head} />
    </g>
  );
}

// A rounded box with one or two lines of centred text.
export function Box({ x, y, w, h, title, sub, tone = "", r = 8 }: { x: number; y: number; w: number; h: number; title: React.ReactNode; sub?: React.ReactNode; tone?: string; r?: number }) {
  return (
    <g className={`dg-box ${tone}`}>
      <rect x={x} y={y} width={w} height={h} rx={r} />
      <text x={x + w / 2} y={sub ? y + h / 2 - 4 : y + h / 2 + 4} textAnchor="middle" className="dg-t">
        {title}
      </text>
      {sub ? (
        <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" className="dg-s">
          {sub}
        </text>
      ) : null}
    </g>
  );
}

// Prev / play / next controls for a diagram that walks through numbered steps.
export function Steps({ step, total, playing, onStep, onPlay, labels }: { step: number; total: number; playing: boolean; onStep: (s: number) => void; onPlay: () => void; labels?: string[] }) {
  return (
    <div className="steps" role="group" aria-label="Pasos">
      <button type="button" onClick={() => onStep(0)} disabled={step === 0} aria-label="Volver al principio">
        ⏮
      </button>
      <button type="button" onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Paso anterior">
        ◀
      </button>
      <button type="button" className="steps-play" onClick={onPlay} aria-pressed={playing}>
        {playing ? "❚❚ Pausa" : "▶ Reproducir"}
      </button>
      <button type="button" onClick={() => onStep(Math.min(total - 1, step + 1))} disabled={step === total - 1} aria-label="Paso siguiente">
        ▶
      </button>
      <span className="steps-count" aria-live="polite">
        {labels?.[step] ?? `Paso ${step + 1} / ${total}`}
      </span>
    </div>
  );
}

// Step state that can auto-advance; it stops by itself on the last step.
export function useSteps(total: number, ms = 1600) {
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  React.useEffect(() => {
    if (!playing) return;
    if (step >= total - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setStep((s) => Math.min(total - 1, s + 1)), ms);
    return () => window.clearTimeout(id);
  }, [playing, step, total, ms]);
  React.useEffect(() => setStep((s) => Math.min(s, total - 1)), [total]);
  const play = () => {
    if (!playing && step >= total - 1) setStep(0);
    setPlaying((p) => !p);
  };
  const go = (s: number) => {
    setPlaying(false);
    setStep(s);
  };
  return { step, playing, play, go, setStep };
}

export interface QuizItem {
  q: React.ReactNode;
  options: React.ReactNode[];
  ok: number;
  why: React.ReactNode;
}

// A short self-check: pick an answer, see why at once.
export function MiniQuiz({ title, kicker = "Ponte a prueba", questions }: { title: string; kicker?: string; questions: QuizItem[] }) {
  const [answers, setAnswers] = React.useState<(number | null)[]>(() => questions.map(() => null));
  const score = answers.filter((a, i) => a === questions[i].ok).length;
  const done = answers.filter((a) => a !== null).length;
  return (
    <section className="quiz reveal" aria-label={`Mini test: ${title}`}>
      <header className="quiz-head">
        <span className="dg-kicker">{kicker}</span>
        <strong>{title}</strong>
        <span className="quiz-score" aria-live="polite">
          {done ? `${score} / ${done} bien` : `${questions.length} preguntas`}
        </span>
      </header>
      <ol className="quiz-list">
        {questions.map((item, i) => {
          const picked = answers[i];
          return (
            <li key={i} className="quiz-q">
              <p>{item.q}</p>
              <div className="quiz-options">
                {item.options.map((opt, j) => {
                  const state = picked === null ? undefined : j === item.ok ? "ok" : j === picked ? "bad" : "off";
                  return (
                    <button key={j} type="button" data-state={state} disabled={picked !== null} onClick={() => setAnswers((prev) => prev.map((a, k) => (k === i ? j : a)))}>
                      <span className="quiz-letter">{String.fromCharCode(97 + j)})</span> {opt}
                    </button>
                  );
                })}
              </div>
              {picked !== null ? (
                <p className={picked === item.ok ? "quiz-why ok" : "quiz-why bad"}>
                  {picked === item.ok ? "✓ Correcto. " : `✗ Era la ${String.fromCharCode(97 + item.ok)}). `}
                  {item.why}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {done ? (
        <button type="button" className="quiz-reset" onClick={() => setAnswers(questions.map(() => null))}>
          Volver a empezar
        </button>
      ) : null}
    </section>
  );
}

// Inline text label for diagrams with a background plate, so it reads over lines.
export function Tag({ x, y, children, anchor = "middle", tone = "" }: { x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end"; tone?: string }) {
  return (
    <text x={x} y={y} textAnchor={anchor} className={`dg-tagtext ${tone}`}>
      {children}
    </text>
  );
}
