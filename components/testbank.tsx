"use client";

import * as React from "react";
import { QUESTIONS } from "./questions";
import { TOPICS } from "./topics";

type Mode = "practice" | "exam" | "review";
interface Item {
  i: number; // index in QUESTIONS
  order: number[]; // shuffled option order
}
type Stats = Record<number, { ok: number; bad: number }>;

const KEY = "asv-test-stats";
const EXAM_SIZE = 20;

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const used = TOPICS.filter((t) => QUESTIONS.some((q) => q.t === t.id));

/** The question bank: practice with instant feedback, a 20-question exam, or review what you failed. */
export function TestBank() {
  const [mode, setMode] = React.useState<Mode>("practice");
  const [topics, setTopics] = React.useState<Set<string>>(new Set());
  const [deck, setDeck] = React.useState<Item[] | null>(null);
  const [pos, setPos] = React.useState(0);
  const [picked, setPicked] = React.useState<Record<number, number>>({});
  const [graded, setGraded] = React.useState(false);
  const [stats, setStats] = React.useState<Stats>({});
  React.useEffect(() => {
    try {
      setStats(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
  }, []);
  const save = (next: Stats) => {
    setStats(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const failed = QUESTIONS.map((_, i) => i).filter((i) => (stats[i]?.bad ?? 0) > (stats[i]?.ok ?? 0));
  const pool = (m: Mode) => {
    const all = QUESTIONS.map((_, i) => i).filter((i) => !topics.size || topics.has(QUESTIONS[i].t));
    if (m === "review") return failed.filter((i) => all.includes(i));
    return all;
  };
  const start = (m: Mode) => {
    let ids = shuffle(pool(m));
    if (m === "exam") ids = ids.slice(0, EXAM_SIZE);
    setMode(m);
    setDeck(ids.map((i) => ({ i, order: shuffle(QUESTIONS[i].o.map((_, k) => k)) })));
    setPos(0);
    setPicked({});
    setGraded(false);
  };
  const record = (results: [number, boolean][]) => {
    const next = { ...stats };
    results.forEach(([i, ok]) => {
      const s = next[i] ?? { ok: 0, bad: 0 };
      next[i] = ok ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 };
    });
    save(next);
  };
  const choose = (item: Item, k: number) => {
    if (picked[item.i] !== undefined) return;
    setPicked((p) => ({ ...p, [item.i]: k }));
    if (mode !== "exam") record([[item.i, k === QUESTIONS[item.i].a]]);
  };
  const grade = () => {
    if (!deck) return;
    setGraded(true);
    record(deck.filter((d) => picked[d.i] !== undefined).map((d) => [d.i, picked[d.i] === QUESTIONS[d.i].a]));
  };
  const answered = Object.keys(stats).length;
  const mastered = Object.values(stats).filter((s) => s.ok > s.bad).length;

  if (!deck) {
    return (
      <section className="tb reveal" aria-label="Test de examen">
        <header className="quiz-head">
          <span className="dg-kicker">Banco de {QUESTIONS.length} preguntas</span>
          <strong>Test tipo examen</strong>
          <span className="quiz-score">
            {answered ? `${mastered} dominadas · ${failed.length} por repasar` : "aún sin empezar"}
          </span>
        </header>
        <p className="tb-intro">El examen teórico es tipo test. Elige temas (o ninguno para todos) y un modo. Las opciones se barajan cada vez y tu progreso se guarda en este navegador.</p>
        <div className="tb-topics" role="group" aria-label="Temas">
          {used.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={topics.has(t.id)}
              style={{ "--h": t.hue } as React.CSSProperties}
              onClick={() =>
                setTopics((s) => {
                  const n = new Set(s);
                  if (n.has(t.id)) n.delete(t.id);
                  else n.add(t.id);
                  return n;
                })
              }
            >
              <b>{t.n}</b> {t.title} <span>{QUESTIONS.filter((q) => q.t === t.id).length}</span>
            </button>
          ))}
        </div>
        <div className="tb-modes">
          <button type="button" className="btn" onClick={() => start("practice")} disabled={!pool("practice").length}>
            ▶ Práctica · corrección al momento ({pool("practice").length})
          </button>
          <button type="button" className="btn" onClick={() => start("exam")} disabled={!pool("exam").length}>
            ⏱ Simulacro · {Math.min(EXAM_SIZE, pool("exam").length)} preguntas, nota al final
          </button>
          <button type="button" className="btn ghost" onClick={() => start("review")} disabled={!pool("review").length}>
            ↻ Repasar falladas ({pool("review").length})
          </button>
          {answered ? (
            <button type="button" className="btn ghost" onClick={() => save({})}>
              Borrar progreso
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const item = deck[pos];
  const q = QUESTIONS[item.i];
  const mine = picked[item.i];
  const show = mode !== "exam" || graded;
  const score = deck.filter((d) => picked[d.i] === QUESTIONS[d.i].a).length;
  const topic = TOPICS.find((t) => t.id === q.t)!;
  return (
    <section className="tb reveal" aria-label="Test de examen">
      <header className="quiz-head">
        <span className="dg-kicker">{mode === "exam" ? "Simulacro" : mode === "review" ? "Repaso" : "Práctica"}</span>
        <strong>
          Pregunta {pos + 1} / {deck.length}
        </strong>
        <span className="quiz-score" aria-live="polite">
          {mode === "exam" && !graded ? `${Object.keys(picked).length} respondidas` : `${score} / ${Object.keys(picked).length} bien`}
        </span>
      </header>
      <div className="tb-bar" aria-hidden="true">
        {deck.map((d, i) => (
          <button
            key={d.i}
            type="button"
            tabIndex={-1}
            onClick={() => setPos(i)}
            data-on={i === pos ? "" : undefined}
            data-state={picked[d.i] === undefined ? undefined : !show ? "done" : picked[d.i] === QUESTIONS[d.i].a ? "ok" : "bad"}
          />
        ))}
      </div>
      <div className="tb-q" style={{ "--h": topic.hue } as React.CSSProperties}>
        <span className="chip">
          {topic.n} · {topic.title}
        </span>
        <p>{q.q}</p>
        <div className="quiz-options">
          {item.order.map((k, j) => {
            const state = mine === undefined ? undefined : !show ? (k === mine ? "pick" : undefined) : k === q.a ? "ok" : k === mine ? "bad" : "off";
            return (
              <button key={k} type="button" data-state={state} disabled={mine !== undefined && (show || mode === "exam")} onClick={() => choose(item, k)}>
                <span className="quiz-letter">{String.fromCharCode(97 + j)})</span> {q.o[k]}
              </button>
            );
          })}
        </div>
        {mine !== undefined && show ? <p className={mine === q.a ? "quiz-why ok" : "quiz-why bad"}>{(mine === q.a ? "✓ Correcto. " : "✗ Incorrecto. ") + q.why}</p> : null}
      </div>
      <div className="tb-nav">
        <button type="button" className="btn ghost" onClick={() => setPos((p) => Math.max(0, p - 1))} disabled={pos === 0}>
          ◀ Anterior
        </button>
        <button type="button" className="btn" onClick={() => setPos((p) => Math.min(deck.length - 1, p + 1))} disabled={pos === deck.length - 1}>
          Siguiente ▶
        </button>
        {mode === "exam" && !graded ? (
          <button type="button" className="btn" onClick={grade}>
            Corregir simulacro
          </button>
        ) : null}
        <button type="button" className="btn ghost" onClick={() => setDeck(null)}>
          Terminar
        </button>
      </div>
      {mode === "exam" && graded ? (
        <p className="tb-result">
          Nota: <b>{((score / deck.length) * 10).toFixed(1)}</b> / 10 ({score} de {deck.length}). Recorre la barra de arriba: en rojo, las falladas con su explicación.
        </p>
      ) : null}
    </section>
  );
}
