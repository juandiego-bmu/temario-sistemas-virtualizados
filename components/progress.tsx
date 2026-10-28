"use client";

import * as React from "react";
import { REVIEW, TOPICS } from "./topics";

/** [statement, is it true, why]. */
export type VF = [string, boolean, string];
// topic → statement index → answered right?
type Store = Record<string, Record<number, boolean>>;

const KEY = "asv-vf";
const EVENT = "asv:vf";

const load = (): Store | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return null;
  }
};

/** The true/false answers of every topic, kept in this browser and shared live between components. */
function useVf() {
  const [store, setStore] = React.useState<Store>({});
  // Updates start from the newest answers, never from a render that is already out of date.
  const latest = React.useRef<Store>({});
  React.useEffect(() => {
    const sync = () => {
      const s = load();
      if (!s) return;
      latest.current = s;
      setStore(s);
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = (f: (s: Store) => Store) => {
    const next = f(latest.current);
    latest.current = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    setStore(next);
    window.dispatchEvent(new Event(EVENT));
  };
  return [store, update] as const;
}

/** Quick-fire true or false on the traps of a topic. Getting all of them right marks the topic as mastered. */
export function TrueFalse({ topic, items }: { topic: string; items: VF[] }) {
  const [store, update] = useVf();
  const mine = store[topic] ?? {};
  const answer = (i: number, right: boolean) => update((s) => ({ ...s, [topic]: { ...s[topic], [i]: right } }));
  const ok = items.filter((_, i) => mine[i]).length;
  const done = items.every((_, i) => mine[i] !== undefined);
  const won = ok === items.length;
  return (
    <div className="vf reveal" data-won={won ? "" : undefined}>
      <header className="vf-head">
        <span className="vf-kicker">Ponte a prueba</span>
        <strong>¿Verdadero o falso?</strong>
        <span className="vf-score" aria-live="polite">
          {ok} / {items.length}
        </span>
      </header>
      <ol className="vf-list">
        {items.map(([s, truth, why], i) => {
          const right = mine[i];
          return (
            <li key={s} data-state={right === undefined ? undefined : right ? "ok" : "bad"}>
              <p className="vf-s">{s}</p>
              {right === undefined ? (
                <div className="vf-btns">
                  <button type="button" onClick={() => answer(i, truth)}>
                    Verdadero
                  </button>
                  <button type="button" onClick={() => answer(i, !truth)}>
                    Falso
                  </button>
                </div>
              ) : (
                <p className="vf-why">
                  <b>
                    {right ? "✓ " : "✗ "}
                    {truth ? "Verdadero." : "Falso."}
                  </b>{" "}
                  {why}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {done ? (
        <footer className="vf-foot">
          {won ? (
            <span className="vf-win">
              <span className="vf-confetti" aria-hidden="true">
                {Array.from({ length: 14 }, (_, k) => (
                  <i key={k} style={{ "--k": k } as React.CSSProperties} />
                ))}
              </span>
              Tema dominado
            </span>
          ) : (
            <span>{items.length - ok} por repasar: vuelve a leer las tarjetas y repite.</span>
          )}
          <button
            type="button"
            onClick={() =>
              update((s) => {
                const next = { ...s };
                delete next[topic];
                return next;
              })
            }
          >
            Repetir
          </button>
        </footer>
      ) : null}
    </div>
  );
}

/** The syllabus as cards, each with a ring that fills as its true/false gets answered right. */
export function RouteMap({ totals }: { totals: Record<string, number> }) {
  const [store] = useVf();
  return (
    <nav className="route" aria-label="Temario">
      {[...TOPICS, ...REVIEW].map((t, i) => {
        const total = totals[t.id] ?? 0;
        const ok = Object.values(store[t.id] ?? {}).filter(Boolean).length;
        return (
          <a key={t.id} href={`#${t.id}`} className="route-card" style={{ "--h": t.hue, "--i": i, "--p": total ? ok / total : 0 } as React.CSSProperties}>
            <span className="route-n">{t.n}</span>
            <span className="route-title">{t.title}</span>
            <span className="route-tag">
              {t.kind} · {t.tag}
            </span>
            {total ? <span className="route-ring" role="img" aria-label={`${ok} de ${total} acertadas`} data-full={ok === total ? "" : undefined} /> : null}
          </a>
        );
      })}
    </nav>
  );
}
