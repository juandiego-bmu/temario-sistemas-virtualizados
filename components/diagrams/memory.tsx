"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, Slider, Steps, useShow, useSteps } from "./kit";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
// 2^bits bytes in human form: 22 → "4 MB".
const bytes2 = (bits: number) => {
  const u = Math.min(UNITS.length - 1, Math.floor(bits / 10));
  return `${2 ** (bits - u * 10)} ${UNITS[u]}`;
};
// 2^bits items: 20 → "1 M (2^20)".
const count2 = (bits: number) => {
  const names = ["", " K", " M", " G", " T", " P", " E"];
  const u = Math.min(names.length - 1, Math.floor(bits / 10));
  return `${2 ** (bits - u * 10)}${names[u]} (2^${bits})`;
};

/** Page table arithmetic, as in the exercises: entries, bits, entry size, table size and levels. */
export function PagingCalculator() {
  const [la, setLa] = React.useState(32);
  const [phys, setPhys] = React.useState(30); // log2 bytes: 30 = 1 GB
  const [page, setPage] = React.useState(12); // log2 bytes: 12 = 4 KB
  useShow("calc", () => (setLa(32), setPhys(30), setPage(12)));
  const off = page;
  const pageBits = la - off;
  const frameBits = phys - page;
  const entryBits = frameBits + 1;
  const entryBytesLog = Math.max(0, Math.ceil(Math.log2(Math.ceil(entryBits / 8))));
  const tableBits = pageBits + entryBytesLog;
  const perLevel = page - entryBytesLog;
  const levels = Math.max(1, Math.ceil(pageBits / perLevel));
  const top = pageBits - perLevel * (levels - 1);
  const fields = [...Array.from({ length: levels }, (_, i) => ({ name: levels === 1 ? "página" : `L${i + 1}`, bits: i === 0 ? top : perLevel })), { name: "offset", bits: off }];
  let x = 10;
  const scale = 540 / la;
  return (
    <Diagram
      ns="calc"
      title="Calculadora de tablas de páginas"
      kicker="Ejercicio tipo"
      label="Calculadora: a partir del ancho de la dirección lógica, la memoria física y el tamaño de página calcula páginas, marcos, bits, tamaño de entrada, tamaño de la tabla y niveles."
      viewBox="0 0 560 100"
      wide
      controls={
        <>
          <Slider label="Dirección lógica" value={la} min={16} max={64} step={4} onChange={setLa} format={(v) => `${v} bits`} />
          <Slider label="RAM física" value={phys} min={24} max={40} onChange={setPhys} format={(v) => bytes2(v)} />
          <Slider label="Página" value={page} min={10} max={21} onChange={setPage} format={(v) => bytes2(v)} />
          <button type="button" className="btn" onClick={() => (setLa(32), setPhys(30), setPage(12))}>
            Ejemplo de clase
          </button>
        </>
      }
      note={
        <div className="calc">
          <span>Nº de páginas = 2^{la} / 2^{off}</span>
          <b>{count2(pageBits)}</b>
          <span>Nº de marcos = {bytes2(phys)} / {bytes2(page)}</span>
          <b>{count2(frameBits)}</b>
          <span>Bits de offset · de página · de marco</span>
          <b>
            {off} · {pageBits} · {frameBits}
          </b>
          <span>Entrada = marco + bit V</span>
          <b>
            {entryBits} bits → {2 ** entryBytesLog} B
          </b>
          <span>Tabla de 1 nivel = nº páginas × entrada</span>
          <b>{bytes2(tableBits)} por proceso</b>
          <span>Entradas por página de tabla</span>
          <b>
            {bytes2(page)} / {2 ** entryBytesLog} B = 2^{perLevel}
          </b>
          <span>Niveles para que cada tabla quepa en una página</span>
          <b>
            {levels} → {levels + 1} accesos a memoria por acceso
          </b>
        </div>
      }
    >
      {fields.map((f) => {
        const w = f.bits * scale;
        const r = (
          <g key={f.name}>
            <rect className={f.name === "offset" ? "pc-off" : "pc-page"} x={x} y={24} width={Math.max(0, w - 2)} height={34} rx={4} />
            <text className="dg-t" x={x + w / 2} y={46} textAnchor="middle">
              {w > 44 ? `${f.name} · ${f.bits}` : f.bits}
            </text>
          </g>
        );
        x += w;
        return r;
      })}
      <text className="dg-s" x={10} y={16}>
        dirección lógica de {la} bits
      </text>
      <text className="dg-s" x={10} y={78}>
        dirección física de {phys} bits = marco ({frameBits}) + offset ({off})
      </text>
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */

// Guest virtual pages → guest physical frames → machine frames.
const GV = [
  { vm: 0, proc: "P1", pages: [0, 1, 2], pa: [1, 3, 0] },
  { vm: 0, proc: "P2", pages: [0, 1], pa: [2, 3] },
  { vm: 1, proc: "P1", pages: [0, 1, 2], pa: [0, 2, 3] },
  { vm: 1, proc: "P2", pages: [0, 1], pa: [1, 2] },
];
const MA = [
  [5, 0, 7, 2],
  [9, 3, 6, 11],
];

export function ThreeSpacesDiagram() {
  const [sel, setSel] = React.useState<[number, number]>([0, 1]);
  const [shadow, setShadow] = React.useState(false);
  useShow("spaces", (key) => setShadow(key === "s"));
  const g = GV[sel[0]];
  const pa = g.pa[sel[1]];
  const ma = MA[g.vm][pa];
  const vmX = (vm: number) => 104 + vm * 270;
  const vaX = (gi: number, pi: number) => vmX(GV[gi].vm) + 12 + (gi % 2 ? 136 : 0) + pi * 40;
  const paX = (vm: number, f: number) => vmX(vm) + 18 + f * 58;
  const maX = (m: number) => 104 + m * 44;
  const x1 = vaX(sel[0], sel[1]) + 18;
  const x2 = paX(g.vm, pa) + 22;
  const x3 = maX(ma) + 20;
  return (
    <Diagram
      ns="spaces"
      title="Tres espacios de direcciones"
      kicker="Paginación virtual"
      label="Páginas de los procesos de dos máquinas virtuales, marcos virtuales de cada máquina y marcos físicos reales. Una página seleccionada muestra su camino."
      viewBox="0 0 640 222"
      wide
      controls={
        <Choice
          label="MMU virtual"
          value={shadow ? "s" : "n"}
          options={[
            { value: "n", text: "Dos traducciones (nested / EPT)" },
            { value: "s", text: "Shadow page table" },
          ]}
          onChange={(v) => setShadow(v === "s")}
        />
      }
      note={
        <>
          Pulsa una página. MV{g.vm + 1} · {g.proc} · página {g.pages[sel[1]]}: <b>ELV</b> → marco virtual {pa} (<b>EFV</b>, lo que el guest cree que es su RAM) → marco real {ma} (<b>EFR</b>).{" "}
          {shadow ? "Con shadow page tables la MMU real usa una tabla que va directa de ELV a EFR (línea de puntos), mantenida a escondidas por el hipervisor." : "Con nested paging la MMU hace las dos traducciones en hardware: la tabla del guest y la tabla nested del hipervisor."}
        </>
      }
    >
      {[
        ["ELV", "páginas", 46],
        ["EFV", "marcos virt.", 106],
        ["EFR", "marcos reales", 196],
      ].map(([k, t, y]) => (
        <g key={k as string}>
          <text className="ts-k" x={8} y={y as number}>
            {k}
          </text>
          <text className="dg-s" x={8} y={(y as number) + 14}>
            {t}
          </text>
        </g>
      ))}
      {[0, 1].map((vm) => (
        <g key={vm}>
          <rect className="ts-vm" x={vmX(vm)} y={20} width={262} height={118} rx={10} />
          <text className="dg-s" x={vmX(vm) + 254} y={132} textAnchor="end">
            MV{vm + 1}
          </text>
        </g>
      ))}
      {shadow ? (
        <path className="ts-link shadow" d={`M${x1} 58 C${x1} 140 ${x3} 120 ${x3} 184`} />
      ) : (
        <>
          <path className="ts-link" d={`M${x1} 58 L${x2} 94`} />
          <path className="ts-link" d={`M${x2} 118 L${x3} 184`} />
        </>
      )}
      {GV.map((gv, gi) =>
        gv.pages.map((p, pi) => {
          const on = sel[0] === gi && sel[1] === pi;
          return (
            <g key={`${gi}${pi}`} className="ts-page" data-on={on ? "" : undefined} role="button" tabIndex={0} onClick={() => setSel([gi, pi])} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel([gi, pi])}>
              <rect x={vaX(gi, pi)} y={34} width={36} height={24} rx={4} />
              <text x={vaX(gi, pi) + 18} y={50} textAnchor="middle">
                {gv.proc}·{p}
              </text>
            </g>
          );
        }),
      )}
      {[0, 1].map((vm) =>
        [0, 1, 2, 3].map((f) => (
          <g key={`${vm}${f}`} className="ts-frame" data-on={g.vm === vm && pa === f ? "" : undefined}>
            <rect x={paX(vm, f)} y={94} width={44} height={24} rx={4} />
            <text x={paX(vm, f) + 22} y={110} textAnchor="middle">
              {f}
            </text>
          </g>
        )),
      )}
      {Array.from({ length: 12 }, (_, m) => (
        <g key={m} className="ts-frame real" data-on={m === ma ? "" : undefined}>
          <rect x={maX(m)} y={184} width={40} height={24} rx={4} />
          <text x={maX(m) + 20} y={200} textAnchor="middle">
            {m}
          </text>
        </g>
      ))}
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */

/** The 2D page walk: every guest table access needs a full nested walk. */
export function NestedWalkGrid() {
  const [G, setG] = React.useState(4);
  const [N, setN] = React.useState(4);
  const total = (G + 1) * (N + 1);
  const { step, playing, play, go } = useSteps(total + 1, 380);
  React.useEffect(() => go(0), [G, N]); // eslint-disable-line react-hooks/exhaustive-deps
  useShow("walk", () => {
    setG(4);
    setN(4);
    window.setTimeout(play, 60);
  });
  const x0 = 150;
  const cw = Math.min(64, (550 - x0) / (N + 1));
  const ch = Math.min(34, 186 / (G + 1));
  const y0 = 22;
  const done = Math.min(step, total);
  return (
    <Diagram
      ns="walk"
      title="(G + 1) × (N + 1) accesos"
      kicker="Nested paging / EPT"
      label="Rejilla del recorrido bidimensional: cada fila es un nivel de la tabla del guest más la dirección final; cada columna, un nivel de la tabla nested más el acceso a la entrada. Se numeran los accesos en orden."
      viewBox="0 0 560 290"
      wide
      controls={
        <>
          <Slider label="Niveles guest (G)" value={G} min={1} max={5} onChange={setG} />
          <Slider label="Niveles nested (N)" value={N} min={1} max={5} onChange={setN} />
          <Steps step={step} total={total + 1} playing={playing} onPlay={play} onStep={go} labels={Array.from({ length: total + 1 }, (_, i) => (i ? `${i} / ${total} accesos` : "Inicio"))} />
        </>
      }
      note={
        <>
          Cada entrada de la tabla del guest está en una dirección <b>física del guest</b>, que hay que traducir con las tablas nested (N accesos) antes de leerla (1 acceso). Son G filas así, más la fila final: traducir la dirección del dato (N) y leerlo (1). Total <b>(G+1)(N+1) = {total}</b>, frente a <b>{G + 1}</b> sin virtualizar y <b>1</b> con acierto de TLB. Por eso <b>la TLB es crítica</b>.
        </>
      }
    >
      {Array.from({ length: G + 1 }, (_, r) => (
        <text key={`r${r}`} className="dg-s" x={x0 - 8} y={y0 + r * ch + ch / 2 + 4} textAnchor="end">
          {r < G ? `tabla guest L${G - r}` : "dato (gPA final)"}
        </text>
      ))}
      {Array.from({ length: N + 1 }, (_, c) => (
        <text key={`c${c}`} className="dg-s" x={x0 + c * cw + cw / 2} y={y0 - 6} textAnchor="middle">
          {c < N ? `nL${N - c}` : "leer"}
        </text>
      ))}
      {Array.from({ length: G + 1 }, (_, r) =>
        Array.from({ length: N + 1 }, (_, c) => {
          const n = r * (N + 1) + c + 1;
          const kind = c < N ? "nested" : r < G ? "guest" : "data";
          return (
            <g key={`${r}-${c}`} className="nw-cell" data-kind={kind} data-on={n <= done ? "" : undefined} data-now={n === done ? "" : undefined}>
              <rect x={x0 + c * cw + 2} y={y0 + r * ch + 2} width={cw - 4} height={ch - 4} rx={4} />
              <text x={x0 + c * cw + cw / 2} y={y0 + r * ch + ch / 2 + 4} textAnchor="middle">
                {n}
              </text>
            </g>
          );
        }),
      )}
      <text className="dg-kick" x={8} y={y0 + (G + 1) * ch + 28}>
        Accesos
      </text>
      {[
        ["acierto de TLB", 1],
        ["sin virtualizar (G+1)", G + 1],
        ["nested (G+1)(N+1)", total],
      ].map(([t, v], i) => {
        const y = y0 + (G + 1) * ch + 16 + i * 18;
        const w = Math.max(4, ((v as number) / 36) * 240);
        return (
          <g key={t as string}>
            <rect className={i === 2 ? "dg-bar accent" : "dg-bar"} x={x0} y={y} width={w} height={12} rx={3} />
            <text className="dg-s" x={x0 + w + 8} y={y + 10}>
              <tspan className="nw-v">{v}</tspan> · {t}
            </text>
          </g>
        );
      })}
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
