"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Arrow, Box, Diagram, useShow } from "./kit";

/** The guest always sees the same SCSI LUN; behind it there is a real volume or a file. */
export function ScsiDiagram() {
  const [file, setFile] = React.useState(true);
  useShow("scsi", (key) => setFile(key !== "vol"));
  const lit = [6, 7, 8];
  return (
    <Diagram
      ns="scsi"
      title="El guest ve un LUN SCSI, no un disco"
      kicker="Virtualización de discos"
      label="Pila del guest: aplicación, sistema de ficheros y driver SCSI, que envía comandos a un LUN de bloques LBA. El hipervisor implementa ese LUN sobre un volumen físico o sobre un fichero."
      viewBox="0 0 560 258"
      controls={
        <Choice
          label="El LUN se implementa sobre"
          value={file ? "f" : "v"}
          options={[
            { value: "v", text: "Volumen físico (by-pass)" },
            { value: "f", text: "Fichero (disk.qcow2)" },
          ]}
          onChange={(v) => setFile(v === "f")}
        />
      }
      note={
        file ? (
          <><b>Fichero en el FS del hipervisor:</b> más latencia y menos velocidad, pero <b>portable y flexible</b> (se mueve a otro almacenamiento sin tocar la MV) y puede no reservar el espacio libre (thin), con riesgo de fragmentación y over-provisioning.</>
        ) : (
          <><b>Volumen físico (by-pass):</b> menos retardo en cada acceso, pero <b>menos portable</b> (atado a un volumen real). Para aplicaciones críticas o para migrar un servidor físico existente.</>
        )
      }
    >
      <Box x={14} y={14} w={150} h={34} title="Aplicación" />
      <Box x={14} y={56} w={150} h={34} title="Sistema de ficheros" />
      <Box x={14} y={98} w={150} h={40} title="Driver SCSI estándar" sub="mismo driver siempre" tone="accent" />
      <text className="dg-kick" x={14} y={156}>
        SO guest
      </text>
      <Arrow x1={164} y1={118} x2={226} y2={118} />
      <text className="dg-s" x={195} y={110} textAnchor="middle">
        WRITE
      </text>
      <rect className="dg-node out" x={228} y={18} width={318} height={112} rx={10} />
      <text className="dg-t" x={242} y={38}>
        LUN 0 · bloques LBA
      </text>
      <text className="dg-s" x={534} y={38} textAnchor="end">
        sin geometría
      </text>
      {Array.from({ length: 16 }, (_, i) => (
        <g key={i}>
          <rect className={lit.includes(i) ? "dg-px hot" : "dg-px"} x={242 + (i % 8) * 37} y={50 + Math.floor(i / 8) * 36} width={33} height={30} rx={3} />
          <text className="dg-s" x={258 + (i % 8) * 37} y={70 + Math.floor(i / 8) * 36} textAnchor="middle">
            {i}
          </text>
        </g>
      ))}
      <Arrow x1={387} y1={130} x2={387} y2={168} />
      <text className="dg-s" x={379} y={153} textAnchor="end">
        hipervisor · emulación SCSI
      </text>
      <rect className="dg-node" x={228} y={170} width={318} height={70} rx={8} />
      {file ? (
        <>
          <text className="dg-t" x={387} y={192} textAnchor="middle">
            /home/VMs/disk.qcow2
          </text>
          <text className="dg-s" x={387} y={210} textAnchor="middle">
            un fichero del sistema de ficheros del host
          </text>
          <text className="dg-s" x={387} y={226} textAnchor="middle">
            (el ext4/xfs del host lo guarda en el disco)
          </text>
        </>
      ) : (
        <>
          <text className="dg-t" x={387} y={196} textAnchor="middle">
            /dev/sdb · un volumen real entero
          </text>
          <text className="dg-s" x={387} y={216} textAnchor="middle">
            el LBA del guest va directo al del volumen
          </text>
        </>
      )}
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */

const KINDS = [
  { id: "eager", name: "Thick eager-zeroed", create: 9, first: 1, again: 1, space: [100, 100, 100, 100, 100, 100] },
  { id: "lazy", name: "Thick lazy-zeroed", create: 1.5, first: 2.2, again: 1, space: [100, 100, 100, 100, 100, 100] },
  { id: "thin", name: "Thin", create: 0.4, first: 3.2, again: 1.4, space: [0, 12, 25, 41, 58, 70] },
] as const;

/** Thick vs thin: when the space is taken and what the first write costs (illustrative numbers). */
export function ProvisionChart() {
  const [on, setOn] = React.useState<(typeof KINDS)[number]["id"]>("thin");
  useShow("prov", (key) => KINDS.some((x) => x.id === key) && setOn(key as (typeof KINDS)[number]["id"]));
  const k = KINDS.find((x) => x.id === on)!;
  const bars = [
    ["Crear el disco", k.create],
    ["1.ª escritura de un bloque", k.first],
    ["Reescribir el bloque", k.again],
  ] as const;
  return (
    <Diagram
      ns="prov"
      title="Thick (eager / lazy) vs thin"
      kicker="Reserva del espacio"
      label="Dos gráficas ilustrativas: el coste de crear el disco y de escribir, y el espacio ocupado en el datastore a medida que la MV escribe."
      viewBox="0 0 560 210"
      controls={
        <Choice label="Disco" value={on} options={KINDS.map((x) => ({ value: x.id, text: x.name }))} onChange={setOn} />
      }
      note={
        on === "eager" ? (
          <><b>Eager-zeroed:</b> todo el espacio se reserva y se pone a cero al crear (lento), y después da el <b>mejor rendimiento</b>. Poner a cero evita que se filtren datos de otra MV que usó esos bloques reales.</>
        ) : on === "lazy" ? (
          <><b>Lazy-zeroed:</b> reserva todo al crear (rápido) pero pone a cero cada bloque en su <b>primera escritura</b>, que es más lenta.</>
        ) : (
          <><b>Thin:</b> se crea al instante y solo ocupa lo escrito, pero en cada primera escritura hay que <b>buscar un bloque libre, ponerlo a cero y escribir</b>. Fragmenta (en HDD, más acceso aleatorio) y permite <b>over-provisioning</b>.</>
        )
      }
    >
      <text className="dg-kick" x={14} y={16}>
        Coste por operación (ilustrativo)
      </text>
      {bars.map(([t, v], i) => (
        <g key={t}>
          <text className="dg-s" x={14} y={44 + i * 34}>
            {t}
          </text>
          <rect className="dg-bar ghost" x={14} y={50 + i * 34} width={240} height={10} rx={3} />
          <rect className="dg-bar accent" x={14} y={50 + i * 34} width={Math.min(240, v * 25)} height={10} rx={3} />
        </g>
      ))}
      <text className="dg-kick" x={300} y={16}>
        Espacio ocupado en el datastore
      </text>
      <line className="dg-axis" x1={300} y1={170} x2={548} y2={170} />
      <line className="dg-axis" x1={300} y1={30} x2={300} y2={170} />
      <text className="dg-s" x={304} y={186}>
        crear
      </text>
      <text className="dg-s" x={548} y={186} textAnchor="end">
        datos escritos por la MV →
      </text>
      <text className="dg-s" x={296} y={36} textAnchor="end">
        100 %
      </text>
      {KINDS.map((x) => (
        <path
          key={x.id}
          className={x.id === on ? "dg-curve pv-on" : "dg-curve pv-off"}
          d={x.space.map((s, i) => `${i ? "L" : "M"}${300 + i * 48} ${170 - s * 1.36 + (x.id === "lazy" ? 3 : 0)}`).join("")}
        />
      ))}
      <path className="dg-curve pv-data" d={[0, 12, 25, 41, 58, 70].map((s, i) => `${i ? "L" : "M"}${300 + i * 48} ${170 - s * 1.36}`).join("")} />
      <text className="dg-s" x={548} y={70} textAnchor="end">
        thin = lo escrito
      </text>
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */

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
