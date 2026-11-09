"use client";

import * as React from "react";
import { isCorrect, normalize, qid, QUESTIONS, type Answer, type Question } from "./questions";
import { TOPICS } from "./topics";

type Mode = "practice" | "exam" | "review";
interface Item {
  i: number; // index in QUESTIONS
  order: number[]; // shuffled option order
}
type Stats = Record<string, { ok: number; bad: number }>; // by qid, so new questions do not scramble the progress

const KEY = "asv-test-v2";
const EXAM_SIZE = 20;
const IDS = QUESTIONS.map(qid);
const FROM_PROF = QUESTIONS.filter((q) => q.prof).length;

const shuffle = <T,>(list: T[]) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const used = TOPICS.filter((t) => QUESTIONS.some((q) => q.t === t.id));
const trueFalse = (q: Question) => q.o?.map(normalize).join("/") === "verdadero/falso";
// An option picked, a box ticked or some text typed.
const filled = (v?: Answer) => v !== undefined && String(v).trim() !== "";

/** The question bank: practice with instant feedback, a 20-question exam, or review what you failed. */
export function TestBank() {
  const [mode, setMode] = React.useState<Mode>("practice");
  const [topics, setTopics] = React.useState<Set<string>>(new Set());
  const [prof, setProf] = React.useState(false);
  const [deck, setDeck] = React.useState<Item[] | null>(null);
  const [pos, setPos] = React.useState(0);
  const [ans, setAns] = React.useState<Record<number, Answer>>({});
  const [sent, setSent] = React.useState<Record<number, true>>({}); // checked one by one (practice and review)
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
  const bad = (i: number) => (stats[IDS[i]]?.bad ?? 0) > (stats[IDS[i]]?.ok ?? 0);
  const failed = QUESTIONS.map((_, i) => i).filter(bad);
  const pool = (m: Mode) => {
    const all = QUESTIONS.map((_, i) => i).filter((i) => (!topics.size || topics.has(QUESTIONS[i].t)) && (!prof || QUESTIONS[i].prof));
    if (m === "review") return all.filter(bad);
    return all;
  };
  const start = (m: Mode) => {
    let ids = shuffle(pool(m));
    if (m === "exam") ids = ids.slice(0, EXAM_SIZE);
    setMode(m);
    setDeck(
      ids.map((i) => {
        const order = (QUESTIONS[i].o ?? []).map((_, k) => k);
        return { i, order: trueFalse(QUESTIONS[i]) ? order : shuffle(order) };
      }),
    );
    setPos(0);
    setAns({});
    setSent({});
    setGraded(false);
  };
  const record = (results: [number, boolean][]) => {
    const next = { ...stats };
    results.forEach(([i, ok]) => {
      const s = next[IDS[i]] ?? { ok: 0, bad: 0 };
      next[IDS[i]] = ok ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 };
    });
    save(next);
  };
  const put = (i: number, v: Answer) => setAns((a) => ({ ...a, [i]: v }));
  const check = (i: number, v: Answer) => {
    put(i, v);
    setSent((s) => ({ ...s, [i]: true }));
    record([[i, isCorrect(QUESTIONS[i], v)]]);
  };
  const grade = () => {
    if (!deck) return;
    setGraded(true);
    record(deck.filter((d) => filled(ans[d.i])).map((d) => [d.i, isCorrect(QUESTIONS[d.i], ans[d.i])]));
  };
  // Corrected and locked: in the exam, everything at the end; otherwise, each one when checked.
  const done = (i: number) => (mode === "exam" ? graded : !!sent[i]);
  const answered = IDS.filter((id) => stats[id]).length;
  const mastered = IDS.filter((id) => stats[id] && stats[id].ok > stats[id].bad).length;

  if (!deck) {
    return (
      <section className="tb reveal" aria-label="Test de teoría">
        <header className="quiz-head">
          <span className="dg-kicker">Banco de {QUESTIONS.length} preguntas</span>
          <strong>Test tipo examen</strong>
          <span className="quiz-score">
            {answered ? `${mastered} dominadas · ${failed.length} por repasar` : "aún sin empezar"}
          </span>
        </header>
        <p className="tb-intro">
          Como el cuestionario del profesor: de una respuesta, de una o más y de respuesta corta. Elige temas (o ninguno para todos) y un modo. Las opciones se barajan cada vez, salvo las de verdadero o falso, y tu progreso se guarda en este navegador.
        </p>
        <div className="tb-topics" role="group" aria-label="Temas">
          {FROM_PROF ? (
            <button type="button" aria-pressed={prof} onClick={() => setProf((p) => !p)}>
              <b>★</b> Solo del profesor <span>{FROM_PROF}</span>
            </button>
          ) : null}
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
              <b>{t.n}</b> {t.title} <span>{QUESTIONS.filter((q) => q.t === t.id && (!prof || q.prof)).length}</span>
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
  const mine = ans[item.i];
  const fin = done(item.i);
  const ok = isCorrect(q, mine);
  const multi = Array.isArray(q.a);
  const ticked = Array.isArray(mine) ? mine : [];
  const right = (k: number) => (Array.isArray(q.a) ? q.a.includes(k) : k === q.a);
  const score = deck.filter((d) => done(d.i) && isCorrect(QUESTIONS[d.i], ans[d.i])).length;
  const topic = TOPICS.find((t) => t.id === q.t)!;
  const checkBtn =
    mode !== "exam" && !fin ? (
      <button type="button" className="btn" disabled={!filled(mine)} onClick={() => check(item.i, mine!)}>
        Comprobar
      </button>
    ) : null;
  return (
    <section className="tb reveal" aria-label="Test de teoría">
      <header className="quiz-head">
        <span className="dg-kicker">{mode === "exam" ? "Simulacro" : mode === "review" ? "Repaso" : "Práctica"}</span>
        <strong>
          Pregunta {pos + 1} / {deck.length}
        </strong>
        <span className="quiz-score" aria-live="polite">
          {mode === "exam" && !graded ? `${deck.filter((d) => filled(ans[d.i])).length} respondidas` : `${score} / ${deck.filter((d) => done(d.i) && filled(ans[d.i])).length} bien`}
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
            data-state={!filled(ans[d.i]) ? undefined : !done(d.i) ? "done" : isCorrect(QUESTIONS[d.i], ans[d.i]) ? "ok" : "bad"}
          />
        ))}
      </div>
      <div className="tb-q" style={{ "--h": topic.hue } as React.CSSProperties}>
        <span className="chip">
          {topic.n} · {topic.title}
          {q.prof ? " · del profesor" : ""}
        </span>
        {multi ? <span className="tb-kind">Selecciona una o más</span> : q.s ? <span className="tb-kind">Respuesta corta · si son varios elementos, sepáralos con ;</span> : null}
        <p>{q.q}</p>
        {q.s ? (
          <div className="tb-check">
            <input
              className="tb-input"
              type="text"
              aria-label="Tu respuesta"
              placeholder="Tu respuesta"
              autoComplete="off"
              value={typeof mine === "string" ? mine : ""}
              disabled={fin}
              onChange={(e) => put(item.i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && mode !== "exam" && filled(mine)) check(item.i, mine!);
              }}
            />
            {checkBtn}
          </div>
        ) : (
          <>
            <div className="quiz-options">
              {item.order.map((k, j) => {
                const on = multi ? ticked.includes(k) : k === mine;
                const state = fin ? (right(k) ? "ok" : on ? "bad" : "off") : on ? "pick" : undefined;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={multi ? on : undefined}
                    data-state={state}
                    disabled={fin}
                    onClick={() => (multi ? put(item.i, on ? ticked.filter((x) => x !== k) : [...ticked, k]) : mode === "exam" ? put(item.i, k) : check(item.i, k))}
                  >
                    <span className="quiz-letter">
                      {multi ? (on ? "☑ " : "☐ ") : ""}
                      {String.fromCharCode(97 + j)})
                    </span>{" "}
                    {q.o![k]}
                  </button>
                );
              })}
            </div>
            {multi && checkBtn ? <div className="tb-check">{checkBtn}</div> : null}
          </>
        )}
        {fin ? (
          <p className={ok ? "quiz-why ok" : "quiz-why bad"}>
            {ok ? "✓ Correcto. " : filled(mine) ? "✗ Incorrecto. " : "✗ Sin contestar. "}
            {q.s ? `Respuesta: ${q.s[0]}. ` : ""}
            {q.why}
            {q.src ? <span className="tb-src"> 📍 {q.src}</span> : null}
          </p>
        ) : null}
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
