"use client";

import * as React from "react";

/** Calendar days left to an exam (at = "YYYY-MM-DD", no time); rendered only in the browser so the number is always today's. */
export function Countdown({ at, label, when }: { at: string; label: string; when: string }) {
  const [days, setDays] = React.useState<number | null>(null);
  React.useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setDays(Math.round((new Date(`${at}T00:00`).getTime() - today.getTime()) / 86_400_000)); // round: a DST day is 23 or 25 h
  }, [at]);
  if (days === null || days < 0) return <span className="countdown">{label} · {when}</span>;
  if (days === 0) return <span className="countdown">{`${label} hoy · ${when}`}</span>;
  return <span className="countdown">{`${label} en ${days} día${days === 1 ? "" : "s"} · ${when}`}</span>;
}
