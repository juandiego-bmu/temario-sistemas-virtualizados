"use client";

import * as React from "react";

const EXAM = new Date("2026-11-12T08:00:00+01:00").getTime();

/** Days left to the first exam; rendered only in the browser so the number is always today's. */
export function Countdown() {
  const [days, setDays] = React.useState<number | null>(null);
  React.useEffect(() => setDays(Math.ceil((EXAM - Date.now()) / 86_400_000)), []);
  if (days === null) return <span className="countdown">Primer parcial · 12–14 nov</span>;
  return <span className="countdown">{days > 0 ? `Primer parcial en ${days} día${days === 1 ? "" : "s"} · 12–14 nov` : "Primer parcial · 12–14 nov"}</span>;
}
