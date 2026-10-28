"use client";

import * as React from "react";
import { Choice } from "../figs/common";

const CELLS = {
  "flat-thin": {
    t: "Raw disperso (sparse)",
    cmd: "qemu-img create -f raw d.img 10G",
    pro: "Ocupa solo lo escrito (el FS del host reserva los bloques al escribir).",
    con: "Sin CoW: no hay snapshots ni linked clones; riesgo de over-provisioning; puede fragmentar.",
  },
  "flat-thick": {
    t: "Raw prerreservado",
    cmd: "qemu-img create -f raw -o preallocation=full d.img 10G",
    pro: "Máximo rendimiento y espacio garantizado: nunca overcommit.",
    con: "Ocupa los 10 GB desde el primer día; clonar = copiarlo entero.",
  },
  "index-thin": {
    t: "qcow2 normal (el de las prácticas)",
    cmd: "qemu-img create -f qcow2 d.qcow2 10G",
    pro: "Crece con lo escrito y tiene CoW: backing files, linked clones y snapshots baratos.",
    con: "Cada acceso pasa por el índice; 1.ª escritura más lenta; fragmenta; over-provisioning.",
  },
  "index-thick": {
    t: "qcow2 prerreservado",
    cmd: "qemu-img create -f qcow2 -o preallocation=full d.qcow2 10G",
    pro: "Mantiene el CoW con el espacio (y los metadatos) ya reservados: escribe más rápido.",
    con: "Ocupa todo desde el principio; sigue pagando la consulta al índice.",
  },
} as const;

type Mark = "✓" | "✗" | "?";
const GRIDS = [
  {
    cols: ["Thin", "Thick"],
    rows: [
      { t: "Ocupa solo los bloques que se han escrito", a: ["✓", "✗"] },
      { t: "Permite over-provisioning (prometer más espacio del que hay)", a: ["✓", "✗"] },
      { t: "Nunca se queda sin espacio por culpa de otras MVs", a: ["✗", "✓"] },
      { t: "Fragmenta: bloques seguidos acaban dispersos en el disco real", a: ["✓", "✗"] },
      { t: "Da el mejor rendimiento (en su variante eager-zeroed)", a: ["✗", "✓"] },
      { t: "Pone a cero los bloques reales por seguridad", a: ["✓", "✓"] },
    ],
  },
  {
    cols: ["Flat", "Index"],
    rows: [
      { t: "Tiene copy-on-write (snapshots y linked clones baratos)", a: ["✗", "✓"] },
      { t: "Para clonar o hacer un snapshot hay que duplicarlo todo", a: ["✓", "✗"] },
      { t: "Cada acceso consulta un mapa (índice) de bloques", a: ["✗", "✓"] },
      { t: "El bloque N está en la posición N × tamaño de bloque", a: ["✓", "✗"] },
      { t: "qcow2 es de este tipo", a: ["✗", "✓"] },
      { t: "Puede ser thin o thick", a: ["✓", "✓"] },
    ],
  },
] as const;

/** The exam matrix: thin/thick × flat/index, plus a fill-in grid of properties. */
export function FlatIndexMatrix() {
  const [cell, setCell] = React.useState<keyof typeof CELLS>("index-thin");
  const [hide, setHide] = React.useState(false);
  const [shown, setShown] = React.useState<Set<string>>(new Set());
  const [marks, setMarks] = React.useState<Mark[][][]>(() => GRIDS.map((g) => g.rows.map(() => g.cols.map(() => "?" as Mark))));
  const [checked, setChecked] = React.useState(false);
  const c = CELLS[cell];
  const pick = (id: keyof typeof CELLS) => {
    setCell(id);
    setShown((s) => new Set(s).add(id));
  };
  const cycle = (g: number, r: number, col: number) => {
    setChecked(false);
    setMarks((m) => m.map((gg, gi) => (gi !== g ? gg : gg.map((rr, ri) => (ri !== r ? rr : rr.map((v, ci) => (ci !== col ? v : v === "?" ? "✓" : v === "✓" ? "✗" : "?")))))));
  };
  const right = marks.flat(2).filter((v, i) => v === GRIDS.flatMap((g) => g.rows.flatMap((r) => r.a))[i]).length;
  const totalMarks = GRIDS.reduce((s, g) => s + g.rows.length * 2, 0);
  return (
    <figure className="dg dg-wide fi reveal" data-ns="fi">
      <figcaption className="dg-head">
        <span className="dg-kicker">Cae en el examen</span>
        <strong>La matriz thin / thick × flat / index</strong>
      </figcaption>
      <div className="controls">
        <Choice
          label="Modo"
          value={hide ? "exam" : "study"}
          options={[
            { value: "study", text: "Estudiar" },
            { value: "exam", text: "Examen (tapar celdas)" },
          ]}
          onChange={(v) => {
            setHide(v === "exam");
            setShown(new Set());
          }}
        />
      </div>
      <div className="fi-wrap">
        <table className="fi-table">
          <thead>
            <tr>
              <th className="fi-corner">
                ¿cómo encuentro el bloque? ↓<br />¿cuándo reservo? →
              </th>
              <th>Thin · bajo demanda</th>
              <th>Thick · al crear</th>
            </tr>
          </thead>
          <tbody>
            {(["flat", "index"] as const).map((r) => (
              <tr key={r}>
                <th>{r === "flat" ? "Flat · sin índice, sin CoW" : "Index · mapa de bloques, con CoW"}</th>
                {(["thin", "thick"] as const).map((col) => {
                  const id = `${r}-${col}` as keyof typeof CELLS;
                  const covered = hide && !shown.has(id);
                  return (
                    <td key={col} data-on={cell === id ? "" : undefined}>
                      <button type="button" onClick={() => pick(id)} aria-pressed={cell === id}>
                        {covered ? "¿?" : CELLS[id].t}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="fi-detail">
          {hide && !shown.has(cell) ? (
            <p>Piensa qué va en la celda y púlsala para comprobarlo.</p>
          ) : (
            <>
              <strong>{c.t}</strong>
              <code>{c.cmd}</code>
              <p>
                <b className="ok-text">+</b> {c.pro}
              </p>
              <p>
                <b className="bad-text">−</b> {c.con}
              </p>
            </>
          )}
        </div>
      </div>
      <p className="fi-sub">Rellena la tabla de propiedades: pulsa cada casilla para marcar ✓ o ✗ y luego comprueba.</p>
      <div className="fi-grids">
        {GRIDS.map((g, gi) => (
          <table key={gi} className="fi-props">
            <thead>
              <tr>
                <th />
                {g.cols.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {g.rows.map((row, ri) => (
                <tr key={ri}>
                  <th>{row.t}</th>
                  {g.cols.map((col, ci) => {
                    const v = marks[gi][ri][ci];
                    const state = checked ? (v === row.a[ci] ? "ok" : "bad") : undefined;
                    return (
                      <td key={col}>
                        <button type="button" data-state={state} onClick={() => cycle(gi, ri, ci)} aria-label={`${row.t} · ${col}: ${v}`}>
                          {v}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <div className="controls">
        <button type="button" className="btn" onClick={() => setChecked(true)}>
          Comprobar
        </button>
        <button type="button" className="btn ghost" onClick={() => (setMarks(GRIDS.map((g) => g.rows.map((r) => [...r.a] as Mark[]))), setChecked(true))}>
          Ver solución
        </button>
        <button type="button" className="btn ghost" onClick={() => (setMarks(GRIDS.map((g) => g.rows.map(() => g.cols.map(() => "?" as Mark)))), setChecked(false))}>
          Vaciar
        </button>
        {checked ? (
          <span className="fi-score" aria-live="polite">
            {right} / {totalMarks} bien
          </span>
        ) : null}
      </div>
    </figure>
  );
}
