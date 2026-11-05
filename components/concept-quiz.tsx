"use client";

import * as React from "react";
import s from "./concept-quiz.module.css";
import { AREAS, CONCEPTS, pickExam, shuffle, type Area, type Concept } from "./concepts";

type Mode = "exam" | "practice" | "review";
type Stats = Record<string, { s: number; n: number }>; // last score (0 to 1) and times answered

const KEY = "asv-conceptos";
const BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));
const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a])) as Record<Area, (typeof AREAS)[number]>;
const hue = (h: number) => ({ "--h": h }) as React.CSSProperties;
const nota = (x: number) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",").replace(",0", "");
const clock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** The bank writes commands between backticks. */
function Rich({ t }: { t: string }) {
  return <>{t.split("`").map((p, i) => (i % 2 ? <code key={i}>{p}</code> : p))}</>;
}

/** Where it is in the practice PDFs, or a loud warning when it is not there. */
function Source({ c }: { c: Concept }) {
  return c.pdf ? <span className="ok-text">📍 {c.pdf}</span> : <span className="bad-text">⚠️ No está en los PDFs: apréndetelo</span>;
}

/** Mock exams for the concept part of the lab exam: 3 questions per block, test and open answers, a mark and where to look in the PDFs. */
export function ConceptQuiz() {
  const [stats, setStats] = React.useState<Stats>({});
  const [areas, setAreas] = React.useState<Set<Area>>(new Set());
  const [mode, setMode] = React.useState<Mode>("exam");
  const [deck, setDeck] = React.useState<string[] | null>(null);
  const [order, setOrder] = React.useState<Record<string, number[]>>({});
  const [pos, setPos] = React.useState(0);
  const [picked, setPicked] = React.useState<Record<string, number>>({});
  const [ticks, setTicks] = React.useState<Record<string, number[]>>({}); // open answers shown, with the key points ticked
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState(false);
  const [time, setTime] = React.useState<[number, number]>([0, 0]); // started, now
  const counted = React.useRef(new Set<string>());

  React.useEffect(() => {
    try {
      setStats(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    } catch {}
  }, []);
  React.useEffect(() => {
    if (!deck || done) return;
    const tick = setInterval(() => setTime(([t0]) => [t0, Date.now()]), 1000);
    return () => clearInterval(tick);
  }, [deck, done]);

  const save = (next: Stats) => {
    setStats(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const record = (id: string, score: number) => {
    const first = !counted.current.has(id);
    counted.current.add(id);
    save({ ...stats, [id]: { s: score, n: (stats[id]?.n ?? 0) + (first ? 1 : 0) } });
  };
  const scoreOf = (id: string): number | undefined => {
    const c = BY_ID.get(id)!;
    if (c.k) return ticks[id] ? ticks[id].length / c.k.length : undefined;
    return picked[id] === undefined ? undefined : picked[id] === c.a ? 1 : 0;
  };
  const start = (m: Mode, ids: string[]) => {
    setMode(m);
    setDeck(ids);
    setOrder(Object.fromEntries(ids.map((id) => [id, shuffle((BY_ID.get(id)!.o ?? []).map((_, k) => k))])));
    setPos(0);
    setPicked({});
    setTicks({});
    setTyped({});
    setDone(false);
    counted.current = new Set();
    const now = Date.now();
    setTime([now, now]);
  };
  const exam = () => start("exam", pickExam(Object.fromEntries(Object.entries(stats).map(([id, v]) => [id, v.n]))));

  const chosen = CONCEPTS.filter((c) => !areas.size || areas.has(c.area));
  const failed = chosen.filter((c) => (stats[c.id]?.s ?? 1) < 1).map((c) => c.id);

  if (!deck) {
    const answered = Object.keys(stats).length;
    const pending = Object.values(stats).filter((v) => v.s < 1).length;
    return (
      <section id="simulacro-conceptos" className={`tb reveal ${s.root}`} aria-label="Simulacro de conceptos">
        <header className="quiz-head">
          <span className="dg-kicker">Examen de laboratorio · {CONCEPTS.length} preguntas</span>
          <strong>Conceptos de QEMU</strong>
          <span className="quiz-score">{answered ? `${answered - pending} dominadas · ${pending} por repasar` : "aún sin empezar"}</span>
        </header>
        <p className="tb-intro">
          Las abiertas, contéstalas de memoria (en voz alta o por escrito) y luego marca los puntos clave que hayas dicho. Cada corrección te dice en qué PDF y página está (📍) o te avisa si no viene en ellos (⚠️). Tu progreso se guarda en este navegador.
        </p>
        <div className="tb-modes">
          <button type="button" className={`btn ${s.big}`} onClick={exam}>
            ⏱ Simulacro · 12 preguntas, 3 de cada bloque
          </button>
        </div>
        <p className={s.sub}>O practica por bloques</p>
        <div className="tb-topics" role="group" aria-label="Bloques">
          {AREAS.map((a) => {
            const all = CONCEPTS.filter((c) => c.area === a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={areas.has(a.id)}
                style={hue(a.hue)}
                onClick={() =>
                  setAreas((set) => {
                    const next = new Set(set);
                    if (next.has(a.id)) next.delete(a.id);
                    else next.add(a.id);
                    return next;
                  })
                }
              >
                {a.title} <span>{all.filter((c) => stats[c.id]?.s === 1).length}/{all.length}</span>
              </button>
            );
          })}
        </div>
        <div className="tb-modes">
          <button type="button" className="btn" onClick={() => start("practice", shuffle(chosen.map((c) => c.id)))}>
            ▶ Practicar {areas.size ? "los bloques elegidos" : "todo"} ({chosen.length})
          </button>
          <button type="button" className="btn ghost" onClick={() => start("review", shuffle(failed))} disabled={!failed.length}>
            ↻ Repasar falladas ({failed.length})
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

  const scores = deck.map(scoreOf);
  const got = scores.reduce<number>((t, x) => t + (x ?? 0), 0);
  const elapsed = clock(time[1] - time[0]);
  const label = mode === "exam" ? "Simulacro" : mode === "review" ? "Repaso" : "Práctica";

  if (done) {
    const misses = deck.filter((_, i) => (scores[i] ?? 0) < 1);
    return (
      <section id="simulacro-conceptos" className={`tb reveal ${s.root}`} aria-label="Simulacro de conceptos">
        <header className="quiz-head">
          <span className="dg-kicker">{label} terminado</span>
          <strong>Nota: {nota((got / deck.length) * 10)} / 10</strong>
          <span className="quiz-score">
            ⏱ {elapsed} · {nota(got)} de {deck.length}
          </span>
        </header>
        <div className={s.areas}>
          {AREAS.map((a) => {
            const idx = deck.flatMap((d, i) => (BY_ID.get(d)!.area === a.id ? [i] : []));
            if (!idx.length) return null;
            const sum = idx.reduce((t, i) => t + (scores[i] ?? 0), 0);
            return (
              <div key={a.id} className={s.area} style={hue(a.hue)}>
                <span>{a.title}</span>
                <span className={s.track} role="img" aria-label={`${nota(sum)} de ${idx.length}`}>
                  <span className={s.fill} style={{ "--p": sum / idx.length } as React.CSSProperties} />
                </span>
                <b>
                  {nota(sum)} / {idx.length}
                </b>
              </div>
            );
          })}
        </div>
        {misses.length ? (
          <>
            <p className={s.sub}>Para repasar ({misses.length})</p>
            <ol className={s.misses}>
              {misses.map((d) => {
                const c = BY_ID.get(d)!;
                return (
                  <li key={d} style={hue(AREA[c.area].hue)}>
                    <p>
                      <Rich t={c.q} />
                    </p>
                    {c.o ? (
                      <p>
                        ✓ <Rich t={c.o[c.a!]} />
                      </p>
                    ) : (
                      <ul>
                        {c.k!.map((point, j) => (
                          <li key={j} data-off={ticks[d]?.includes(j) ? undefined : ""}>
                            <Rich t={point} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="quiz-why">
                      <Rich t={c.why} /> <Source c={c} />
                    </p>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="tb-result">Todo bien. El siguiente simulacro trae preguntas que aún no has visto.</p>
        )}
        <div className="tb-nav">
          <button type="button" className="btn" onClick={exam}>
            ⏱ Otro simulacro
          </button>
          {misses.length ? (
            <button type="button" className="btn ghost" onClick={() => start("review", misses)}>
              ↻ Repetir estas {misses.length}
            </button>
          ) : null}
          <button type="button" className="btn ghost" onClick={() => setDeck(null)}>
            Volver
          </button>
        </div>
      </section>
    );
  }

  const id = deck[pos];
  const c = BY_ID.get(id)!;
  const sc = scores[pos];
  const last = pos === deck.length - 1;
  return (
    <section id="simulacro-conceptos" className={`tb reveal ${s.root}`} aria-label="Simulacro de conceptos">
      <header className="quiz-head">
        <span className="dg-kicker">{label}</span>
        <strong>
          Pregunta {pos + 1} / {deck.length}
        </strong>
        <span className="quiz-score" aria-live="polite">
          ⏱ {elapsed} · {nota(got)} de {scores.filter((x) => x !== undefined).length}
        </span>
      </header>
      <div className="tb-bar" aria-hidden="true">
        {deck.map((d, i) => (
          <button
            key={d}
            type="button"
            tabIndex={-1}
            onClick={() => setPos(i)}
            data-on={i === pos ? "" : undefined}
            data-state={scores[i] === undefined ? undefined : scores[i] === 1 ? "ok" : scores[i] === 0 ? "bad" : "done"}
          />
        ))}
      </div>
      <div className="tb-q" style={hue(AREA[c.area].hue)}>
        <span className="chip">
          {AREA[c.area].title} · {c.k ? "respuesta abierta" : "test"}
        </span>
        <p>
          <Rich t={c.q} />
        </p>
        {c.o ? (
          <>
            <div className="quiz-options">
              {order[id].map((k, j) => {
                const mine = picked[id];
                return (
                  <button
                    key={k}
                    type="button"
                    data-state={mine === undefined ? undefined : k === c.a ? "ok" : k === mine ? "bad" : "off"}
                    disabled={mine !== undefined}
                    onClick={() => {
                      setPicked((p) => ({ ...p, [id]: k }));
                      record(id, k === c.a ? 1 : 0);
                    }}
                  >
                    <span className="quiz-letter">{String.fromCharCode(97 + j)})</span> <Rich t={c.o![k]} />
                  </button>
                );
              })}
            </div>
            {sc !== undefined ? (
              <p className={sc ? "quiz-why ok" : "quiz-why bad"}>
                {sc ? "✓ Correcto. " : "✗ No es esa. "}
                <Rich t={c.why} /> <Source c={c} />
              </p>
            ) : null}
          </>
        ) : (
          <>
            <textarea
              className={s.answer}
              aria-label="Tu respuesta"
              placeholder="Tu respuesta, de memoria (opcional: también vale decirla en voz alta)"
              rows={3}
              value={typed[id] ?? ""}
              onChange={(e) => setTyped((t) => ({ ...t, [id]: e.target.value }))}
            />
            {ticks[id] ? (
              <>
                <p className={s.sub}>
                  Marca lo que has dicho · {ticks[id].length} de {c.k!.length}
                </p>
                <div className="quiz-options">
                  {c.k!.map((point, j) => {
                    const on = ticks[id].includes(j);
                    return (
                      <button
                        key={j}
                        type="button"
                        aria-pressed={on}
                        data-state={on ? "ok" : undefined}
                        onClick={() => {
                          const next = on ? ticks[id].filter((x) => x !== j) : [...ticks[id], j];
                          setTicks((t) => ({ ...t, [id]: next }));
                          record(id, next.length / c.k!.length);
                        }}
                      >
                        <span className="quiz-letter">{on ? "✓" : "○"}</span> <Rich t={point} />
                      </button>
                    );
                  })}
                </div>
                <p className="quiz-why">
                  <Rich t={c.why} /> <Source c={c} />
                </p>
              </>
            ) : (
              <div className="tb-modes">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setTicks((t) => ({ ...t, [id]: [] }));
                    record(id, 0);
                  }}
                >
                  Ver la respuesta
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <div className="tb-nav">
        <button type="button" className="btn ghost" onClick={() => setPos((p) => p - 1)} disabled={pos === 0}>
          ◀ Anterior
        </button>
        <button type="button" className="btn" onClick={() => (last ? setDone(true) : setPos((p) => p + 1))}>
          {last ? "Ver la nota" : "Siguiente ▶"}
        </button>
        {last ? null : (
          <button type="button" className="btn ghost" onClick={() => setDone(true)}>
            Terminar y ver la nota
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => setDeck(null)}>
          Salir
        </button>
      </div>
    </section>
  );
}
