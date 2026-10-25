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

type Case = "hit" | "walk" | "free" | "evict" | "segv";
const CASES: { id: Case; text: string; path: string[]; note: string }[] = [
  { id: "hit", text: "Acierto de TLB", path: ["la", "tlb", "pa"], note: "La TLB tiene el par (página, marco): un solo acceso a memoria, el del dato." },
  { id: "walk", text: "Fallo de TLB", path: ["la", "tlb", "walk", "v", "p", "pa"], note: "La MMU recorre la tabla (page walk): con N niveles, N accesos más el del dato. Todo en hardware." },
  { id: "free", text: "Fallo de página, hay marco libre", path: ["la", "tlb", "walk", "v", "p", "pf", "free", "swapin", "upd", "retry"], note: "P = 0: la RTI del SO trae la página del swap (swap-in), actualiza la tabla y reintenta la instrucción." },
  { id: "evict", text: "Fallo de página, sin marco libre", path: ["la", "tlb", "walk", "v", "p", "pf", "free", "evict", "inval", "swapin", "upd", "retry"], note: "No hay marcos libres: primero se expulsa una víctima (swap-out), se invalida su entrada de TLB y se actualiza la tabla; después, swap-in." },
  { id: "segv", text: "Página no válida", path: ["la", "tlb", "walk", "v", "segv"], note: "V = 0: la página no es del proceso → fallo de segmentación." },
];

const NODES: Record<string, { x: number; y: number; w: number; t: string; kind?: "dec" | "end" | "bad" }> = {
  la: { x: 10, y: 30, w: 92, t: "Dir. lógica" },
  tlb: { x: 120, y: 30, w: 100, t: "¿TLB hit?", kind: "dec" },
  walk: { x: 238, y: 30, w: 92, t: "Page walk" },
  v: { x: 254, y: 92, w: 60, t: "¿V?", kind: "dec" },
  p: { x: 254, y: 152, w: 60, t: "¿P?", kind: "dec" },
  pa: { x: 110, y: 228, w: 214, t: "Dir. física", kind: "end" },
  segv: { x: 352, y: 92, w: 140, t: "Segmentation fault", kind: "bad" },
  pf: { x: 352, y: 152, w: 140, t: "Page fault (RTI)" },
  free: { x: 512, y: 152, w: 116, t: "¿Marco libre?", kind: "dec" },
  evict: { x: 512, y: 92, w: 116, t: "Swap-out víctima" },
  inval: { x: 512, y: 30, w: 116, t: "Invalidar TLB" },
  swapin: { x: 512, y: 228, w: 116, t: "Swap-in" },
  upd: { x: 352, y: 228, w: 140, t: "Actualizar TP" },
  retry: { x: 342, y: 278, w: 160, t: "Reintentar instrucción", kind: "end" },
};

// Every edge is drawn on its own route, so no line runs behind another box.
const EDGES: { a: string; b: string; d: string; label?: string; lx?: number; ly?: number; anchor?: "start" | "middle" }[] = [
  { a: "la", b: "tlb", d: "M102 45 H120" },
  { a: "tlb", b: "walk", d: "M220 45 H238", label: "no", lx: 229, ly: 38, anchor: "middle" },
  { a: "tlb", b: "pa", d: "M170 60 V228", label: "sí", lx: 176, ly: 148 },
  { a: "walk", b: "v", d: "M284 60 V92" },
  { a: "v", b: "segv", d: "M314 107 H352", label: "0", lx: 333, ly: 101, anchor: "middle" },
  { a: "v", b: "p", d: "M284 122 V152", label: "1", lx: 290, ly: 141 },
  { a: "p", b: "pa", d: "M284 182 V228", label: "1", lx: 290, ly: 209 },
  { a: "p", b: "pf", d: "M314 167 H352", label: "0", lx: 333, ly: 161, anchor: "middle" },
  { a: "pf", b: "free", d: "M492 167 H512" },
  { a: "free", b: "swapin", d: "M570 182 V228", label: "sí", lx: 576, ly: 209 },
  { a: "free", b: "evict", d: "M570 152 V122", label: "no", lx: 576, ly: 141 },
  { a: "evict", b: "inval", d: "M570 92 V60" },
  { a: "inval", b: "swapin", d: "M628 45 H636 V243 H628" },
  { a: "swapin", b: "upd", d: "M512 243 H492" },
  { a: "upd", b: "retry", d: "M422 258 V278" },
];

export function TranslationFlow() {
  const [c, setC] = React.useState<Case>("free");
  useShow("flow", (key) => CASES.some((x) => x.id === key) && setC(key as Case));
  const cs = CASES.find((x) => x.id === c)!;
  const on = new Set(cs.path);
  const live = (a: string, b: string) => cs.path.some((id, i) => id === a && cs.path[i + 1] === b);
  return (
    <Diagram
      ns="flow"
      title="De dirección lógica a física"
      kicker="Memoria virtual paginada"
      label="Diagrama de flujo de la traducción: TLB, recorrido de la tabla, bit de validez, bit de presencia, fallo de página, reemplazo y reintento."
      viewBox="0 0 640 312"
      wide
      controls={
        <div className="choice" role="group" aria-label="Caso">
          <span className="choice-label">Caso</span>
          {CASES.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === c} onClick={() => setC(x.id)}>
              {x.text}
            </button>
          ))}
        </div>
      }
      note={cs.note}
    >
      <defs>
        <marker id="tf-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path className="tf-head on" d="M0 0 L10 5 L0 10 z" />
        </marker>
        <marker id="tf-off" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path className="tf-head" d="M0 0 L10 5 L0 10 z" />
        </marker>
      </defs>
      <line className="tf-split" x1={336} y1={18} x2={336} y2={306} />
      <text className="dg-kick" x={330} y={12} textAnchor="end">
        HW (MMU)
      </text>
      <text className="dg-kick" x={342} y={12}>
        SW (SO)
      </text>
      {EDGES.map((e) => {
        const l = live(e.a, e.b);
        return (
          <g key={`${e.a}${e.b}`} className="tf-e" data-on={l ? "" : undefined}>
            <path className="tf-edge" d={e.d} markerEnd={`url(#${l ? "tf-on" : "tf-off"})`} />
            {e.label ? (
              <text className="tf-lbl" x={e.lx} y={e.ly} textAnchor={e.anchor ?? "start"}>
                {e.label}
              </text>
            ) : null}
          </g>
        );
      })}
      {Object.entries(NODES).map(([id, n]) => (
        <g key={id} className="tf-node" data-kind={n.kind} data-on={on.has(id) ? "" : undefined}>
          <rect x={n.x} y={n.y} width={n.w} height={30} rx={n.kind === "dec" ? 15 : 6} />
          <text className="dg-t" x={n.x + n.w / 2} y={n.y + 19} textAnchor="middle">
            {n.t}
          </text>
        </g>
      ))}
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */

/** fork() with copy-on-write: share every frame until someone writes. */
export function CowForkDiagram() {
  const [stage, setStage] = React.useState(0);
  useShow("cow", (key) => setStage(Math.max(0, Math.min(2, Number(key) || 0))));
  const frames = stage < 2 ? 3 : 4;
  const childTo = [0, stage >= 2 ? 3 : 1, 2];
  return (
    <Diagram
      ns="cow"
      title="fork() con copy-on-write"
      kicker="COW en memoria"
      label="Un proceso padre y su hijo comparten los marcos tras fork. Cuando el hijo escribe en una página, se crea un marco nuevo solo para ella."
      viewBox="0 0 560 200"
      controls={
        <div className="choice" role="group" aria-label="Paso">
          {["1 · Padre", "2 · fork()", "3 · El hijo escribe en la página 1"].map((t, i) => (
            <button key={t} type="button" aria-pressed={stage === i} onClick={() => setStage(i)}>
              {t}
            </button>
          ))}
        </div>
      }
      note={
        stage === 0 ? (
          <>El padre tiene 3 páginas en 3 marcos.</>
        ) : stage === 1 ? (
          <><code>fork()</code> no copia memoria: crea la tabla del hijo como réplica de la del padre y marca las entradas <b>COW</b> (solo lectura). <b>3 marcos</b> para dos procesos.</>
        ) : (
          <>La primera escritura provoca una excepción; el SO crea un <b>marco nuevo solo para esa página</b> y quita el COW. Es la misma idea que un snapshot de disco: compartir hasta que alguien escribe.</>
        )
      }
    >
      {[0, 1].map((p) =>
        p === 1 && stage === 0 ? null : (
          <g key={p}>
            <text className="dg-t" x={p ? 470 : 20} y={24}>
              {p ? "Hijo" : "Padre"}
            </text>
            {[0, 1, 2].map((i) => (
              <g key={i}>
                <rect className="dg-node" data-cow={stage >= 1 && !(p === 1 && i === 1 && stage === 2) ? "" : undefined} x={p ? 470 : 20} y={34 + i * 50} width={70} height={36} rx={6} />
                <text className="dg-s" x={(p ? 470 : 20) + 35} y={56 + i * 50} textAnchor="middle">
                  pág {i} {stage >= 1 && !(p === 1 && i === 1 && stage === 2) ? "· COW" : ""}
                </text>
              </g>
            ))}
          </g>
        ),
      )}
      <text className="dg-kick" x={280} y={24} textAnchor="middle">
        marcos físicos: {frames}
      </text>
      {Array.from({ length: frames }, (_, f) => (
        <g key={f}>
          <rect className={f === 3 ? "dg-node accent" : "dg-node out"} x={240} y={34 + f * 40} width={80} height={30} rx={6} />
          <text className="dg-t" x={280} y={54 + f * 40} textAnchor="middle">
            marco {f}
          </text>
        </g>
      ))}
      {[0, 1, 2].map((i) => (
        <path key={`p${i}`} className="dg-wire" d={`M90 ${52 + i * 50} C160 ${52 + i * 50} 170 ${49 + i * 40} 238 ${49 + i * 40}`} />
      ))}
      {stage >= 1
        ? childTo.map((f, i) => <path key={`c${i}`} className={stage === 2 && i === 1 ? "dg-wire accent-line" : "dg-wire"} d={`M470 ${52 + i * 50} C400 ${52 + i * 50} 390 ${49 + f * 40} 322 ${49 + f * 40}`} />)
        : null}
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

const EVENTS = [
  { id: "ctx", t: "Cambio de contexto en el guest (escribe PTBR)", sh: [1, 0], ne: [0, 0], why: "Shadow: el hipervisor intercepta la escritura del PTBR para cargar la shadow table del nuevo proceso. Nested: el guest cambia su gCR3 sin salir." },
  { id: "pte", t: "El guest escribe en su tabla de páginas", sh: [1, 0], ne: [0, 0], why: "Shadow: las páginas de la TP del guest están protegidas como solo lectura, así que cada escritura provoca un trap para mantener la sombra coherente." },
  { id: "pf", t: "Fallo de página del guest (P = 0)", sh: [1, 0], ne: [0, 0], why: "Shadow: todo fallo pasa primero por el hipervisor, que decide si es suyo o lo reinyecta al guest. Nested: lo atiende el guest directamente." },
  { id: "miss", t: "Acceso con fallo de TLB (4 + 4 niveles)", sh: [0, 5], ne: [0, 25], why: "Shadow: la MMU recorre una sola tabla ELV→EFR (G + 1 = 5 accesos). Nested: recorrido 2D, (4 + 1)(4 + 1) = 25 accesos." },
  { id: "hit", t: "Acceso con acierto de TLB", sh: [0, 1], ne: [0, 1], why: "Las dos guardan en la TLB la traducción final ELV → EFR: un acceso." },
  { id: "rec", t: "El guest usa un marco que el hipervisor le quitó", sh: [1, 0], ne: [1, 0], why: "Hidden page fault en shadow, violación de EPT en nested: en ambos casos sale al hipervisor para traer la página." },
] as const;

export function ShadowVsNested() {
  const [log, setLog] = React.useState<string[]>([]);
  useShow("svn", (key) => EVENTS.some((e) => e.id === key) && setLog((l) => [...l, key]));
  const sum = (key: "sh" | "ne", i: 0 | 1) => log.reduce((s, id) => s + EVENTS.find((e) => e.id === id)![key][i], 0);
  const last = log.length ? EVENTS.find((e) => e.id === log[log.length - 1]) : null;
  return (
    <figure className="dg dg-wide svn reveal" data-ns="svn">
      <figcaption className="dg-head">
        <span className="dg-kicker">Comparativa en vivo</span>
        <strong>Shadow page tables vs nested paging</strong>
      </figcaption>
      <div className="svn-events">
        {EVENTS.map((e) => (
          <button key={e.id} type="button" className="btn" onClick={() => setLog((l) => [...l, e.id])}>
            + {e.t}
          </button>
        ))}
        <button type="button" className="btn ghost" onClick={() => setLog([])}>
          Reiniciar
        </button>
      </div>
      <div className="svn-cols">
        {(["sh", "ne"] as const).map((key) => (
          <div key={key} className="svn-col" data-k={key}>
            <h4>{key === "sh" ? "Shadow page tables (software)" : "Nested paging · EPT / NPT (hardware)"}</h4>
            <div className="svn-num">
              <span>
                <b>{sum(key, 0)}</b> exits al hipervisor
              </span>
              <span>
                <b>{sum(key, 1)}</b> accesos a memoria
              </span>
            </div>
            <p>{key === "sh" ? "Una tabla sombra por cada proceso de cada MV. El guest no se modifica." : "Una sola tabla nested por MV. El guest gestiona sus tablas sin salir."}</p>
          </div>
        ))}
      </div>
      <p className="dg-note">{last ? last.why : "Añade eventos y compara: la shadow paga en exits (software), nested paga en accesos a memoria cuando falla la TLB."}</p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */

const HOST = 16;
const HV = 1;

/** Overcommit: working sets, then ballooning, then the hypervisor's private swap. */
export function BalloonDiagram() {
  const [d3, setD3] = React.useState(3);
  useShow("balloon", (key) => setD3(Number(key) || 3));
  const vms = [
    { name: "MV1 · ociosa", active: 1.5, cache: 2 },
    { name: "MV2 · web", active: 6.5, cache: 0.5 },
    { name: "MV3 · base de datos", active: d3, cache: 0 },
  ];
  const demand = HV + vms.reduce((s, v) => s + v.active + v.cache, 0);
  let deficit = Math.max(0, demand - HOST);
  const balloon = vms.map((v) => {
    const b = Math.min(v.cache, deficit);
    deficit -= b;
    return b;
  });
  const swapped = vms.map((v) => {
    const s = Math.min(v.active * 0.6, deficit);
    deficit -= s;
    return s;
  });
  const phase = demand <= HOST ? 0 : swapped.some((s) => s > 0) ? 2 : 1;
  const u = 520 / (8 * 3 + 2);
  const sx = (gb: number) => gb * (520 / HOST);
  let hx = 20;
  return (
    <Diagram
      ns="balloon"
      title="Overcommit de RAM: 3 MVs de 8 GB en 16 GB"
      kicker="Multiplexación de la RAM"
      label="Barras de memoria de tres máquinas virtuales de 8 GB y de la RAM física de 16 GB. Al subir la demanda, el hipervisor infla globos y, si no basta, manda páginas a un swap privado."
      viewBox="0 0 560 250"
      wide
      controls={<Slider label="Demanda de la MV3" value={d3} min={1} max={8} step={0.5} onChange={setD3} format={(v) => `${v} GB`} />}
      note={
        phase === 0 ? (
          <><b>Todo cabe.</b> Cada MV tiene configurados 8 GB (24 GB en total: overcommit ×1,5), pero el hipervisor solo le da su <b>working set</b>, asignado bajo demanda.</>
        ) : phase === 1 ? (
          <><b>Ballooning.</b> Falta RAM: el driver globo de las MVs con memoria sobrante se infla, el guest libera su caché y el hipervisor recupera esos marcos.</>
        ) : (
          <><b>Swap privado del hipervisor.</b> Ni con globos cabe: el hipervisor manda páginas en uso a un fichero de swap privado de cada MV, <b>invisible para el guest</b>, que cree que siguen en RAM (hidden page faults: todo va mucho más lento).</>
        )
      }
    >
      {vms.map((v, i) => {
        const x0 = 20;
        const y = 22 + i * 46;
        const live = v.active - swapped[i];
        return (
          <g key={v.name}>
            <text className="dg-t" x={x0} y={y - 4}>
              {v.name}
            </text>
            <rect className="bl-cap" x={x0} y={y} width={8 * u * 2.4} height={20} rx={4} />
            <rect className="bl-active" x={x0} y={y} width={live * u * 2.4} height={20} rx={4} />
            <rect className="bl-swap" x={x0 + live * u * 2.4} y={y} width={swapped[i] * u * 2.4} height={20} rx={4} />
            <rect className="bl-cache" x={x0 + v.active * u * 2.4} y={y} width={(v.cache - balloon[i]) * u * 2.4} height={20} rx={4} />
            <rect className="bl-balloon" x={x0 + (v.active + v.cache - balloon[i]) * u * 2.4} y={y} width={balloon[i] * u * 2.4} height={20} rx={10} />
            <text className="dg-s" x={x0 + 8 * u * 2.4 + 8} y={y + 14}>
              config. 8 GB · usa {(v.active + v.cache).toFixed(1)}
            </text>
          </g>
        );
      })}
      <text className="dg-t" x={20} y={176}>
        RAM física del servidor ({HOST} GB)
      </text>
      <rect className="bl-cap" x={20} y={184} width={520} height={24} rx={5} />
      <rect className="bl-hv" x={hx} y={184} width={sx(HV)} height={24} rx={5} />
      {vms.map((v, i) => {
        const w = sx(v.active - swapped[i] + v.cache - balloon[i]);
        const r = <rect key={i} className="bl-vm" data-vm={i} x={hx + sx(HV)} y={184} width={Math.max(0, w)} height={24} />;
        hx += w;
        return r;
      })}
      <text className="dg-s" x={20} y={226}>
        hipervisor · MV1 · MV2 · MV3
      </text>
      <text className={phase ? "dg-t bad-text" : "dg-t ok-text"} x={540} y={226} textAnchor="end">
        demanda {demand.toFixed(1)} / {HOST} GB
      </text>
      <g className="bl-keys">
        <rect className="bl-active" x={20} y={234} width={10} height={10} />
        <text className="dg-s" x={34} y={243}>
          en uso
        </text>
        <rect className="bl-cache" x={90} y={234} width={10} height={10} />
        <text className="dg-s" x={104} y={243}>
          caché
        </text>
        <rect className="bl-balloon" x={150} y={234} width={10} height={10} rx={5} />
        <text className="dg-s" x={164} y={243}>
          globo
        </text>
        <rect className="bl-swap" x={210} y={234} width={10} height={10} />
        <text className="dg-s" x={224} y={243}>
          en swap del hipervisor
        </text>
      </g>
    </Diagram>
  );
}
