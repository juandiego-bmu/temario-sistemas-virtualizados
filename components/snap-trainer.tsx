"use client";

import * as React from "react";
import s from "./snap-trainer.module.css";
import { BLOCKS, PROF, randomExercise, walk, type Ask, type Exercise, type Part, type Step } from "./snap-logic";

const of = (vol: string) => (vol === "Base" ? "la base" : vol);
const say = (st: Step, a: Ask, thick: boolean) =>
  st.act === "meta"
    ? `metadatos de ${of(st.vol)}: ${st.hit ? "sí está" : "no está"}`
    : st.act === "offset"
      ? "escribir el offset nuevo en los metadatos de Δ"
      : a.op === "escribir"
        ? "escribir el dato en Δ"
        : `leer el dato de ${of(st.vol)}${st.vol === "Base" && thick ? " (thick: sin metadatos)" : ""}`;

/** A volume as in the professor's figure: its name and, to the right, its blocks. */
function Vol({ name, blocks, now }: { name: string; blocks?: number[]; now?: boolean }) {
  return (
    <>
      <span className={s.tag} data-now={now ? "" : undefined}>
        {name}
      </span>
      <span className={s.arrow} aria-hidden="true" />
      <span className={s.cells}>
        {blocks ? (
          blocks.map((b) => (
            <span key={b} className={s.cell}>
              {b}
            </span>
          ))
        ) : (
          <span className={s.cell}>0–{BLOCKS - 1}, todos</span>
        )}
      </span>
    </>
  );
}

/** Newest on top and a dot per snapshot; the current Δ hangs from its snapshot. Once you check, what does not count fades. */
function Chain({ ex, p, open }: { ex: Exercise; p: Part; open: boolean }) {
  const rows: React.ReactNode[] = [];
  for (let k = ex.deltas.length; k >= 0; k--) {
    const late = open && k > p.from ? "" : undefined;
    rows.push(
      <li key={`s${k}`} className={s.snap} data-late={late}>
        <span className={s.dot} aria-hidden="true" />
        <span>snap{k}</span>
        {k === p.from ? (
          <span className={s.branch}>
            <Vol name="Δ actual" blocks={p.delta} now />
          </span>
        ) : null}
      </li>,
      <li key={`v${k}`} data-late={late}>
        {k ? <Vol name={`Δ${k}`} blocks={ex.deltas[k - 1]} /> : <Vol name={`Base ${ex.thick ? "thick" : "thin"}`} blocks={ex.thick ? undefined : ex.base} />}
        {late === undefined ? null : <small className={s.late}>posterior a snap{p.from}: no cuenta</small>}
      </li>,
    );
  }
  return (
    <ol className={s.chain} aria-label={`Cadena de snapshots; el estado actual cuelga de snap${p.from}`}>
      {rows}
    </ol>
  );
}

/** "How many real disk accesses?" like the professor's snapshot exercise, with the walk step by step. */
export function SnapTrainer() {
  const [ex, setEx] = React.useState(PROF);
  const [typed, setTyped] = React.useState<Record<string, string>>({});
  const [shown, setShown] = React.useState<Record<string, true>>({});
  const [score, setScore] = React.useState([0, 0]); // right, checked: this session only
  const top = React.useRef<HTMLElement>(null);
  const uid = React.useId();

  const load = (next: Exercise) => {
    setEx(next);
    setTyped({});
    setShown({});
    top.current?.scrollIntoView({ block: "start" });
  };
  const check = (key: string, n: number) => {
    const v = (typed[key] ?? "").trim();
    if (shown[key] || !/^\d+$/.test(v)) return;
    setShown((x) => ({ ...x, [key]: true }));
    setScore(([ok, all]) => [ok + (Number(v) === n ? 1 : 0), all + 1]);
  };

  return (
    <section ref={top} className={`tb reveal ${s.root}`} aria-label="Entrenador de snapshots">
      <header className="quiz-head">
        <span className="dg-kicker">{ex === PROF ? "Ejercicio del campus" : "Ejercicio nuevo"}</span>
        <strong>Snapshots: ¿cuántos accesos al disco real?</strong>
        <span className="quiz-score" aria-live="polite">
          {score[1] ? `${score[0]} de ${score[1]} bien en esta sesión` : "aún sin empezar"}
        </span>
      </header>
      <p className="tb-intro">
        Disco base <b>{ex.thick ? "thick" : "thin"}</b>; a la derecha de cada volumen, sus bloques (LBA). Los metadatos se leen o se escriben en un acceso y no hay caché de disco. Escribe el número y pulsa Intro.
      </p>
      <details className={s.rules}>
        <summary>Las reglas del profesor</summary>
        <ul>
          <li>
            <b>Leer</b>: +1 por los metadatos de cada volumen, empezando por el Δ actual y bajando por la cadena, y +1 por leer el dato en el volumen donde está el bloque.
          </li>
          <li>
            Base <b>thin</b>: un volumen más (metadatos y datos). Base <b>thick</b>: no tiene metadatos, así que leer de ella es 1 acceso.
          </li>
          <li>
            <b>Escribir</b>: siempre en el Δ actual, sin bajar nunca. +1 por sus metadatos; si el bloque ya estaba, +1 por el dato (2); si no, +1 por el offset nuevo en los metadatos y +1 por el dato (3).
          </li>
          <li>Si estás en snapK, la cadena es Δ actual → los deltas que hay por debajo de snapK → base. Los posteriores a snapK no cuentan.</li>
        </ul>
      </details>
      <div className={s.parts}>
        {ex.parts.map((p, pi) => {
          const keys = p.asks.map((_, ai) => `${pi}-${ai}`);
          return (
            <div key={pi} className={s.part}>
              <p className={s.when}>
                En snap{p.from}, con Δ = {`{${p.delta.join(", ")}}`}, ¿cuántos accesos para…
              </p>
              <Chain ex={ex} p={p} open={keys.some((k) => shown[k])} />
              <ol className={s.asks}>
                {p.asks.map((a, ai) => {
                  const key = keys[ai];
                  const steps = walk(ex, p, a);
                  const v = typed[key] ?? "";
                  const ok = Number(v) === steps.length;
                  return (
                    <li key={key} className={s.ask}>
                      <label htmlFor={uid + key}>
                        {a.op === "leer" ? "Leer" : "Escribir"} el bloque <b>{a.b}</b>?
                      </label>
                      <span className={s.ctl}>
                        <input
                          id={uid + key}
                          className="tb-input"
                          inputMode="numeric"
                          autoComplete="off"
                          value={v}
                          disabled={!!shown[key]}
                          onChange={(e) => setTyped((t) => ({ ...t, [key]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") check(key, steps.length);
                          }}
                        />
                        {shown[key] ? null : (
                          <button type="button" className="btn ghost" disabled={!/^\s*\d+\s*$/.test(v)} onClick={() => check(key, steps.length)}>
                            Corregir
                          </button>
                        )}
                      </span>
                      {shown[key] ? (
                        <div className={`quiz-why ${ok ? "ok" : "bad"} ${s.walk}`}>
                          {ok ? "✓ " : `✗ Son ${steps.length}, no ${v.trim()}: `}
                          {steps.map((st, i) => `(${i + 1}) ${say(st, a, ex.thick)}`).join(" → ")} = <b>{steps.length}</b>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
      <div className="tb-nav">
        <button type="button" className="btn" onClick={() => load(randomExercise())}>
          Otro ejercicio
        </button>
        <button type="button" className="btn ghost" onClick={() => load(PROF)}>
          El ejercicio del profesor
        </button>
      </div>
    </section>
  );
}
