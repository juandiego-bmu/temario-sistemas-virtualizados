"use client";

import * as React from "react";

const KEY = "theme";

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<"dark" | "light">("dark");
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") {
        document.body.dataset.theme = saved;
        setTheme(saved);
      }
    } catch {}
  }, []);
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    document.body.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  };
  return (
    <button type="button" className="theme" onClick={flip} aria-label={`Tema ${theme === "dark" ? "oscuro" : "claro"} activo. Cambiar a ${theme === "dark" ? "claro" : "oscuro"}`}>
      <span className="theme-dot" aria-hidden="true" />
      {theme === "dark" ? "Tema oscuro" : "Tema claro"} · cambiar
    </button>
  );
}
