"use client";

import * as React from "react";
import { REVIEW, TOPICS } from "./topics";

const ALL = [...TOPICS, ...REVIEW];

/** Fixed bar naming the topic you are reading, in that topic's colour, with a segment per topic. */
export function TopicBar() {
  const [current, setCurrent] = React.useState<string | null>(null);
  React.useEffect(() => {
    const seen = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRect.height : 0));
        let best: string | null = null;
        let most = 0;
        seen.forEach((h, id) => {
          if (h > most) {
            most = h;
            best = id;
          }
        });
        setCurrent(best);
      },
      { threshold: [0, 0.1, 0.25, 0.5, 0.75, 1], rootMargin: "-20% 0px -35% 0px" },
    );
    ALL.forEach((t) => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);
  const t = ALL.find((x) => x.id === current);
  return (
    <nav className="topicbar" data-on={t ? "" : undefined} style={t ? ({ "--h": t.hue } as React.CSSProperties) : undefined} aria-label="Tema actual">
      {t ? (
        <a className="tb-now" href={`#${t.id}`} key={t.id}>
          <span className="tb-n">{t.n}</span>
          <span className="tb-title">{t.title}</span>
          <span className="tb-tag">
            {t.kind} · {t.tag}
          </span>
        </a>
      ) : null}
      <ol className="tb-steps">
        {ALL.map((x) => (
          <li key={x.id} style={{ "--h": x.hue } as React.CSSProperties} data-on={x.id === current ? "" : undefined}>
            <a href={`#${x.id}`} aria-label={`${x.n} ${x.title}`} title={`${x.n} · ${x.title}`} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
