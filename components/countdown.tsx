"use client";

import * as React from "react";

/** Days left to an exam; rendered only in the browser so the number is always today's. */
export function Countdown({ at, label, when }: { at: string; label: string; when: string }) {
  const [days, setDays] = React.useState<number | null>(null);
  React.useEffect(() => setDays(Math.ceil((new Date(at).getTime() - Date.now()) / 86_400_000)), [at]);
  if (days === null || days <= 0) return <span className="countdown">{label} · {when}</span>;
  return <span className="countdown">{`${label} en ${days} día${days === 1 ? "" : "s"} · ${when}`}</span>;
}
