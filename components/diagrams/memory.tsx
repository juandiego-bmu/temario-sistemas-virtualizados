"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, Slider, Steps, useSteps } from "./kit";

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
  { id: "evict", text: "Fallo de página, sin marco libre", path: ["la", "tlb", "walk", "v", "p", "pf", "free", "evict", "inval", "swapin", "upd", "retry"], note: "No hay marcos libres: primero se expulsa una víctima (swap-out), se invalida su entrada de TLB y se actualiza la tabla." },
  { id: "segv", text: "Página no válida", path: ["la", "tlb", "walk", "v", "segv"], note: "V = 0: la página no es del proceso → fallo de segmentación." },
];

const NODES: Record<string, { x: number; y: number; w: number; t: string; kind?: "dec" | "end" | "bad" }> = {
  la: { x: 10, y: 20, w: 92, t: "Dir. lógica" },
  tlb: { x: 120, y: 20, w: 70, t: "¿TLB hit?", kind: "dec" },
  walk: { x: 210, y: 20, w: 92, t: "Page walk" },
  v: { x: 210, y: 70, w: 70, t: "¿V?", kind: "dec" },
  p: { x: 210, y: 120, w: 70, t: "¿P?", kind: "dec" },
  pa: { x: 100, y: 170, w: 110, t: "Dir. física", kind: "end" },
  segv: { x: 318, y: 70, w: 110, t: "Segmentation fault", kind: "bad" },
  pf: { x: 318, y: 120, w: 110, t: "Page fault (RTI)" },
  free: { x: 448, y: 120, w: 100, t: "¿Marco libre?", kind: "dec" },
  evict: { x: 448, y: 20, w: 100, t: "Swap-out víctima" },
  inval: { x: 448, y: 70, w: 100, t: "Invalidar TLB" },
  swapin: { x: 448, y: 170, w: 100, t: "Swap-in" },
  upd: { x: 318, y: 170, w: 110, t: "Actualizar TP" },
  retry: { x: 318, y: 220, w: 140, t: "Reintentar instrucción", kind: "end" },
};

export function TranslationFlow() {
  const [c, setC] = React.useState<Case>("free");
  const cs = CASES.find((x) => x.id === c)!;
  const on = new Set(cs.path);
  const mid = (id: string) => [NODES[id].x + NODES[id].w / 2, NODES[id].y + 15] as const;
  const edges = cs.path.slice(1).map((id, i) => [cs.path[i], id]);
  return (
    <Diagram
      title="De dirección lógica a física"
      kicker="Memoria virtual paginada"
      label="Diagrama de flujo de la traducción: TLB, recorrido de la tabla, bit de validez, bit de presencia, fallo de página, reemplazo y reintento."
      viewBox="0 0 560 256"
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
      <line className="tf-split" x1={308} y1={14} x2={308} y2={250} />
      <text className="dg-kick" x={300} y={10} textAnchor="end">
        HW (MMU)
      </text>
      <text className="dg-kick" x={316} y={10}>
        SW (SO)
      </text>
      {edges.map(([a, b]) => {
        const [x1, y1] = mid(a);
        const [x2, y2] = mid(b);
        return <path key={`${a}${b}`} className="tf-edge" d={`M${x1} ${y1} L${x2} ${y2}`} />;
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
  const frames = stage < 2 ? 3 : 4;
  const childTo = [0, stage >= 2 ? 3 : 1, 2];
  return (
    <Diagram
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
  const g = GV[sel[0]];
  const pa = g.pa[sel[1]];
  const ma = MA[g.vm][pa];
  const vaX = (gi: number, pi: number) => 14 + gi * 140 + pi * 40;
  const paX = (vm: number, f: number) => 50 + vm * 280 + f * 50;
  const maX = (m: number) => 14 + m * 45;
  return (
    <Diagram
      title="Tres espacios de direcciones"
      kicker="Paginación virtual"
      label="Páginas de los procesos de dos máquinas virtuales, marcos virtuales de cada máquina y marcos físicos reales. Una página seleccionada muestra su camino."
      viewBox="0 0 560 240"
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
      <text className="dg-kick" x={4} y={12}>
        Páginas (ELV)
      </text>
      <text className="dg-kick" x={16} y={84}>
        Marcos virtuales (EFV)
      </text>
      <text className="dg-kick" x={4} y={192}>
        Marcos reales (EFR · RAM del servidor)
      </text>
      {[0, 1].map((vm) => (
        <g key={vm}>
          <rect className="ts-vm" x={8 + vm * 280} y={18} width={268} height={128} rx={10} />
          <text className="dg-s" x={268 + vm * 280} y={142} textAnchor="end">
            MV{vm + 1}
          </text>
        </g>
      ))}
      {GV.map((gv, gi) =>
        gv.pages.map((p, pi) => {
          const on = sel[0] === gi && sel[1] === pi;
          return (
            <g key={`${gi}${pi}`} className="ts-page" data-on={on ? "" : undefined} role="button" tabIndex={0} onClick={() => setSel([gi, pi])} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSel([gi, pi])}>
              <rect x={vaX(gi, pi)} y={34} width={34} height={24} rx={4} />
              <text x={vaX(gi, pi) + 17} y={50} textAnchor="middle">
                {gv.proc}·{p}
              </text>
            </g>
          );
        }),
      )}
      {[0, 1].map((vm) =>
        [0, 1, 2, 3].map((f) => (
          <g key={`${vm}${f}`} className="ts-frame" data-on={g.vm === vm && pa === f ? "" : undefined}>
            <rect x={paX(vm, f)} y={92} width={40} height={24} rx={4} />
            <text x={paX(vm, f) + 20} y={108} textAnchor="middle">
              {f}
            </text>
          </g>
        )),
      )}
      {Array.from({ length: 12 }, (_, m) => (
        <g key={m} className="ts-frame real" data-on={m === ma ? "" : undefined}>
          <rect x={maX(m)} y={200} width={38} height={24} rx={4} />
          <text x={maX(m) + 19} y={216} textAnchor="middle">
            {m}
          </text>
        </g>
      ))}
      {shadow ? (
        <path className="ts-link shadow" d={`M${vaX(sel[0], sel[1]) + 17} 58 C${vaX(sel[0], sel[1]) + 17} 160 ${maX(ma) + 19} 140 ${maX(ma) + 19} 200`} />
      ) : (
        <>
          <path className="ts-link" d={`M${vaX(sel[0], sel[1]) + 17} 58 L${paX(g.vm, pa) + 20} 92`} />
          <path className="ts-link" d={`M${paX(g.vm, pa) + 20} 116 L${maX(ma) + 19} 200`} />
        </>
      )}
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
  const cw = Math.min(70, 430 / (N + 1));
  const ch = Math.min(34, 200 / (G + 1));
  const x0 = 100;
  const y0 = 22;
  const done = Math.min(step, total);
  return (
    <Diagram
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
      {[
        ["Con acierto de TLB", 1],
        ["Sin virtualizar (G + 1)", G + 1],
        ["Nested (G + 1)(N + 1)", total],
      ].map(([t, v], i) => (
        <g key={t as string}>
          <text className="dg-s" x={x0 - 8} y={y0 + (G + 1) * ch + 26 + i * 18} textAnchor="end">
            {t}
          </text>
          <rect className={i === 2 ? "dg-bar accent" : "dg-bar"} x={x0} y={y0 + (G + 1) * ch + 16 + i * 18} width={Math.max(4, ((v as number) / 36) * 420)} height={12} rx={3} />
          <text className="dg-t" x={x0 + Math.max(4, ((v as number) / 36) * 420) + 6} y={y0 + (G + 1) * ch + 26 + i * 18}>
            {v}
          </text>
        </g>
      ))}
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
  const sum = (key: "sh" | "ne", i: 0 | 1) => log.reduce((s, id) => s + EVENTS.find((e) => e.id === id)![key][i], 0);
  const last = log.length ? EVENTS.find((e) => e.id === log[log.length - 1]) : null;
  return (
    <figure className="dg dg-wide svn reveal">
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
  const vms = [
    { name: "MV1 · ociosa", active: 1.5, cache: 2.5 },
    { name: "MV2 · web", active: 4, cache: 1 },
    { name: "MV3 · base de datos", active: d3, cache: 0.5 },
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
      title="Overcommit de RAM: 3 MVs de 8 GB en 16 GB"
      kicker="Multiplexación de la RAM"
      label="Barras de memoria de tres máquinas virtuales de 8 GB y de la RAM física de 16 GB. Al subir la demanda, el hipervisor infla globos y, si no basta, manda páginas a un swap privado."
      viewBox="0 0 560 250"
      wide
      controls={<Slider label="Demanda de la MV3" value={d3} min={1} max={7.5} step={0.5} onChange={setD3} format={(v) => `${v} GB`} />}
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
