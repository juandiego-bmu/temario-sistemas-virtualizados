"use client";

import * as React from "react";
import { examDraw, isCorrect, normalize, points, qid, QUESTIONS, shuffle, type Answer, type Question } from "./questions";
import { TOPICS } from "./topics";

type Mode = "practice" | "exam" | "review";
interface Item {
  i: number; // index in QUESTIONS
  order: number[]; // shuffled option order
}
type Stats = Record<string, { ok: number; bad: number }>; // by qid, so new questions do not scramble the progress

const KEY = "asv-test-v2";
const EXAM_SIZE = 20;
const FULL_SIZE = 60; // the real exam: about 60 test questions on topics 1, 2 and 3
const THEORY: readonly string[] = TOPICS.filter((t) => t.kind === "Teoría").map((t) => t.id);
// The professor's quiz had 11 questions of T1, 15 of T2 and 4 of T3: the full exam keeps that mix, and inside each
// tema every topic weighs what it does in the bank.
const MIX: Record<string, number> = { T1: 11, T2: 15, T3: 4 };
const tag = (id: string) => TOPICS.find((t) => t.id === id)!.tag;
const testable = (id: string) => QUESTIONS.filter((q) => q.t === id && !q.s).length;
const weight = (id: string) => (MIX[tag(id)] * testable(id)) / THEORY.filter((t) => tag(t) === tag(id)).reduce((s, t) => s + testable(t), 0);
const IDS = QUESTIONS.map(qid);
const FROM_PROF = QUESTIONS.filter((q) => q.prof).length;

const used = TOPICS.filter((t) => QUESTIONS.some((q) => q.t === t.id));
const trueFalse = (q: Question) => q.o?.map(normalize).join("/") === "verdadero/falso";
// An option picked, a box ticked or some text typed.
const filled = (v?: Answer) => v !== undefined && String(v).trim() !== "";
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The question bank: practice with instant feedback, the full 60-question exam or a short one, or review what you failed. */
export function TestBank() {
  const [mode, setMode] = React.useState<Mode>("practice");
  const [topics, setTopics] = React.useState<Set<string>>(new Set());
  const [prof, setProf] = React.useState(false);
  const [deck, setDeck] = React.useState<Item[] | null>(null);
  const [pos, setPos] = React.useState(0);
  const [ans, setAns] = React.useState<Record<number, Answer>>({});
  const [sent, setSent] = React.useState<Record<number, true>>({}); // checked one by one (practice and review)
  const [flags, setFlags] = React.useState<Record<number, true>>({}); // "dudosa", like Moodle's «Marcar pregunta»
  const [graded, setGraded] = React.useState(false);
  const [stats, setStats] = React.useState<Stats>({});
  const [t0, setT0] = React.useState(0);
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    try {
      setStats(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
  }, []);
  React.useEffect(() => {
    if (!deck || mode !== "exam" || graded) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deck, mode, graded]);
  const save = (next: Stats) => {
    setStats(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const bad = (i: number) => (stats[IDS[i]]?.bad ?? 0) > (stats[IDS[i]]?.ok ?? 0);
  const failed = QUESTIONS.map((_, i) => i).filter((i) => bad(i) && THEORY.includes(QUESTIONS[i].t));
  const pool = (m: Mode) => {
    // No topic chosen: the eight theory ones, since the lab exam is over.
    const all = QUESTIONS.map((_, i) => i).filter((i) => (topics.size ? topics.has(QUESTIONS[i].t) : THEORY.includes(QUESTIONS[i].t)) && (!prof || QUESTIONS[i].prof));
    if (m === "review") return all.filter(bad);
    return all;
  };
  const seen = (i: number) => (stats[IDS[i]]?.ok ?? 0) + (stats[IDS[i]]?.bad ?? 0);
  // full: the real exam's size, from all the theory topics whatever the filters.
  const start = (m: Mode, full = false) => {
    let ids = shuffle(full ? examDraw(FULL_SIZE, THEORY, seen, weight) : pool(m));
    if (m === "exam" && !full) ids = ids.slice(0, EXAM_SIZE);
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
    setFlags({});
    setGraded(false);
    setT0(Date.now());
    setNow(Date.now());
  };
  const record = (results: [number, boolean][]) => {
    const next = { ...stats };
    results.forEach(([i, ok]) => {
      const s = next[IDS[i]] ?? { ok: 0, bad: 0 };
      next[IDS[i]] = ok ? { ...s, ok: s.ok + 1 } : { ...s, bad: s.bad + 1 };
    });
    save(next);
  };
  const put = (i: number, v?: Answer) =>
    setAns((a) => {
      const n = { ...a };
      if (v === undefined) delete n[i];
      else n[i] = v;
      return n;
    });
  const check = (i: number, v: Answer) => {
    put(i, v);
    setSent((s) => ({ ...s, [i]: true }));
    record([[i, isCorrect(QUESTIONS[i], v)]]);
  };
  const grade = () => {
    if (!deck) return;
    const blanks = deck.filter((d) => !filled(ans[d.i])).length;
    // Like Moodle's «Enviar todo y terminar»: a last look at what is still blank.
    if (blanks && !confirm(`Te quedan ${blanks} en blanco: no restan, pero irán a «Repasar falladas». ¿Corregir ya?`)) return;
    setGraded(true);
    setNow(Date.now());
    record(deck.map((d) => [d.i, isCorrect(QUESTIONS[d.i], ans[d.i])])); // a blank goes to review too
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
          El examen real tendrá unas 60 preguntas tipo test de los temas 1, 2 y 3. El examen completo lo imita: 60 preguntas con el reparto del cuestionario del profesor (22 del tema 1, 30 del 2 y 8 del 3), y cada fallo resta 1/3 si hay cuatro opciones o 1 entero en verdadero o falso, así que contestar al azar da 0 de media. Las de varias respuestas puntúan por opción, como en Moodle, y nunca bajan de 0. Para practicar, elige temas (o ninguno para los ocho de teoría) y un modo. Las opciones se barajan cada vez, salvo las de verdadero o falso, y tu progreso se guarda en este navegador.
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
          <button type="button" className="btn" onClick={() => start("exam", true)}>
            🎓 Examen completo · {FULL_SIZE} preguntas, los fallos restan
          </button>
          <button type="button" className="btn" onClick={() => start("practice")} disabled={!pool("practice").length}>
            ▶ Práctica · corrección al momento ({pool("practice").length})
          </button>
          <button type="button" className="btn ghost" onClick={() => start("exam")} disabled={!pool("exam").length}>
            ⏱ Simulacro corto · {Math.min(EXAM_SIZE, pool("exam").length)} preguntas
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
  // Points to a grade out of 10 with one decimal; + 0 turns a -0 into 0.
  const tenths = (x: number) => Math.round((x / deck.length) * 100) / 10 + 0;
  const nota = (x: number) => tenths(x).toLocaleString("es", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sum = (ds: Item[], floor = -Infinity) => ds.reduce((s, d) => s + Math.max(floor, points(QUESTIONS[d.i], ans[d.i])), 0);
  const blank = deck.filter((d) => !filled(ans[d.i])).length;
  const doubt = deck.filter((d) => flags[d.i] && filled(ans[d.i]));
  const leave = () => {
    if (mode === "exam" && !graded && Object.keys(ans).length && !confirm("¿Salir sin corregir? Se pierden las respuestas de este simulacro.")) return;
    setDeck(null);
  };
  const checkBtn =
    mode !== "exam" && !fin ? (
      <button type="button" className="btn" disabled={!filled(mine)} onClick={() => check(item.i, mine!)}>
        Comprobar
      </button>
    ) : null;
  return (
    <section className="tb reveal" aria-label="Test de teoría">
      <header className="quiz-head">
        <span className="dg-kicker">{mode === "exam" ? `Simulacro · ${clock(now - t0)}` : mode === "review" ? "Repaso" : "Práctica"}</span>
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
            data-flag={flags[d.i] ? "" : undefined}
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
                    aria-pressed={multi || mode === "exam" ? on : undefined}
                    data-state={state}
                    disabled={fin}
                    // In the exam a second click clears the answer, but not the second click of a double-click.
                    onClick={(e) => (multi ? put(item.i, on ? ticked.filter((x) => x !== k) : [...ticked, k]) : mode === "exam" ? put(item.i, on && e.detail < 2 ? undefined : k) : check(item.i, k))}
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
            {mode === "exam" && !fin && filled(mine) && !multi ? <span className="tb-kind">Pulsa otra vez tu opción para dejarla en blanco, que no resta.</span> : null}
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
          <>
            <button
              type="button"
              className="btn ghost"
              aria-pressed={!!flags[item.i]}
              onClick={() =>
                setFlags((f) => {
                  const n = { ...f };
                  if (n[item.i]) delete n[item.i];
                  else n[item.i] = true;
                  return n;
                })
              }
            >
              {flags[item.i] ? "⚑ Marcada como dudosa" : "⚐ Marcar como dudosa"}
            </button>
            <button type="button" className="btn" onClick={grade}>
              Corregir simulacro
            </button>
          </>
        ) : null}
        <button type="button" className="btn ghost" onClick={leave}>
          Terminar
        </button>
      </div>
      {mode === "exam" && graded ? (
        <div className="tb-result">
          <p>
            Nota con penalización: <b>{nota(sum(deck))}</b> / 10 · sin penalización, {nota(sum(deck, 0))}
          </p>
          <p>
            {score} bien · {deck.length - score - blank} mal · {blank} en blanco · {clock(now - t0)} en total, {Math.round((now - t0) / 1000 / deck.length)} s por pregunta
          </p>
          {doubt.length ? (
            <p>
              Contestaste {doubt.length} dudosa{doubt.length === 1 ? "" : "s"} y acertaste {doubt.filter((d) => isCorrect(QUESTIONS[d.i], ans[d.i])).length}:{" "}
              {tenths(sum(doubt)) === 0 ? "en total, tu nota no cambió." : `en total te ${tenths(sum(doubt)) < 0 ? "restaron" : "sumaron"} ${nota(Math.abs(sum(doubt)))} puntos de nota.`}
            </p>
          ) : null}
          <p>
            Por temas:{" "}
            {TOPICS.filter((t) => deck.some((d) => QUESTIONS[d.i].t === t.id))
              .map((t) => {
                const of = deck.filter((d) => QUESTIONS[d.i].t === t.id);
                return `${t.n} ${t.title} ${of.filter((d) => isCorrect(QUESTIONS[d.i], ans[d.i])).length}/${of.length}`;
              })
              .join(" · ")}
          </p>
          <p>Recorre la barra de arriba: en rojo, las falladas; vacías, las que dejaste en blanco. Todas tienen su explicación.</p>
        </div>
      ) : null}
    </section>
  );
}
