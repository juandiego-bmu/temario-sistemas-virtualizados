"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, Slider, Steps, useSteps } from "./kit";

/* ------------------------------------------------------------------ */
/* Emulator: the interpreter loop of the slides, one guest instruction at a time */

type Line = "irq" | "fetch" | "alu" | "int" | "iret" | "io" | "illegal";

interface EmuStep {
  pc: string;
  inst: string;
  lines: Line[];
  mode: "USER" | "KERNEL";
  r1: number;
  stack: string[];
  io?: string;
  note: string;
}

const MEM_USER = [
  ["0x100", "ADD R1, R2"],
  ["0x101", "INT 0x80"],
  ["0x102", "SUB R1, 1"],
];
const MEM_BAD = [
  ["0x100", "ADD R1, R2"],
  ["0x101", "OUT 0x3F8, R1"],
  ["0x102", "SUB R1, 1"],
];
const MEM_KERNEL = [
  ["0x200", "… RTI instrucción ilegal"],
  ["0x300", "OUT 0x3F8, R1"],
  ["0x301", "IRET"],
  ["0x320", "… RTI del timer"],
];

const SCENARIOS: Record<string, { mem: string[][]; steps: EmuStep[] }> = {
  syscall: {
    mem: MEM_USER,
    steps: [
      { pc: "0x100", inst: "ADD R1, R2", lines: ["fetch", "alu"], mode: "USER", r1: 8, stack: [], note: "Instrucción inocua: el intérprete la lee de la RAM de la MV (fetch), la decodifica y simula la suma sobre los registros virtuales." },
      { pc: "0x101", inst: "INT 0x80", lines: ["fetch", "int"], mode: "KERNEL", r1: 8, stack: ["SR = USER", "PC = 0x102"], note: "Llamada al sistema: el intérprete guarda PC y estado en la pila, cambia el modo VIRTUAL a KERNEL y salta al vector 0x80 (0x300)." },
      { pc: "0x300", inst: "OUT 0x3F8, R1", lines: ["fetch", "io"], mode: "KERNEL", r1: 8, stack: ["SR = USER", "PC = 0x102"], io: "UART virtual ← 8", note: "IN/OUT en modo kernel: se emula el puerto del controlador correspondiente (aquí, la consola serie virtual)." },
      { pc: "0x301", inst: "IRET", lines: ["fetch", "iret"], mode: "USER", r1: 8, stack: [], io: "UART virtual ← 8", note: "IRET en kernel: se recupera el estado y el PC de la pila. Volvemos a modo USER en 0x102." },
      { pc: "0x102", inst: "SUB R1, 1", lines: ["fetch", "alu"], mode: "USER", r1: 7, stack: [], io: "UART virtual ← 8", note: "Seguimos con el programa de usuario. Todo lo ha hecho software: por eso la emulación es la técnica más lenta." },
    ],
  },
  illegal: {
    mem: MEM_BAD,
    steps: [
      { pc: "0x100", inst: "ADD R1, R2", lines: ["fetch", "alu"], mode: "USER", r1: 8, stack: [], note: "Instrucción inocua: se simula directamente." },
      { pc: "0x101", inst: "OUT 0x3F8, R1", lines: ["fetch", "io", "illegal"], mode: "USER", r1: 8, stack: [], note: "Un programa de usuario intenta hablar con un dispositivo. El intérprete mira el modo VIRTUAL: es USER, así que provoca ILLEGAL_INSTRUCTION en la CPU virtual." },
      { pc: "0x200", inst: "RTI instrucción ilegal", lines: ["int"], mode: "KERNEL", r1: 8, stack: ["SR = USER", "PC = 0x101"], note: "La excepción se emula igual que una interrupción: se apila PC y estado y se salta a la rutina del kernel guest, que decidirá (normalmente, matar el proceso)." },
    ],
  },
  irq: {
    mem: MEM_USER,
    steps: [
      { pc: "0x100", inst: "ADD R1, R2", lines: ["fetch", "alu"], mode: "USER", r1: 8, stack: [], note: "Instrucción inocua: se simula directamente." },
      { pc: "0x320", inst: "IRQ pendiente → salto al vector 0x320", lines: ["irq"], mode: "KERNEL", r1: 8, stack: ["SR = USER", "PC = 0x101"], note: "Antes de leer la siguiente instrucción, el bucle mira el PIC virtual: hay una IRQ pendiente y las interrupciones están habilitadas → se emula el salto al vector (0x320)." },
      { pc: "0x320", inst: "RTI del timer … IRET", lines: ["fetch", "iret"], mode: "USER", r1: 8, stack: [], note: "La rutina del guest atiende el timer y hace IRET: se recupera el PC 0x101 y el modo USER." },
      { pc: "0x101", inst: "INT 0x80", lines: ["fetch", "int"], mode: "KERNEL", r1: 8, stack: ["SR = USER", "PC = 0x102"], note: "El programa continúa donde estaba, sin enterarse de la interrupción." },
    ],
  },
};

const CODE: { id?: Line; text: string }[] = [
  { text: "while (true) {" },
  { id: "irq", text: "  if (PIC.IRQ_pending && SR.IRQ_enabled) {  push(PC); push(SR);" },
  { id: "irq", text: "      SR.mode = KERNEL; PC = IVT[PIC.IRQ_vector]; }" },
  { id: "fetch", text: "  else { inst = mem.RAM[PC];   switch (inst.opcode) {" },
  { id: "alu", text: "    case ADD: case SUB: …  emular la operación" },
  { id: "int", text: "    case INT:  push(PC); push(SR); SR.mode = KERNEL;" },
  { id: "int", text: "               PC = IVT[inst.arg];" },
  { id: "iret", text: "    case IRET: if (SR.mode == USER) ILLEGAL_INSTRUCTION;" },
  { id: "iret", text: "               else { SR = pop(); PC = pop(); }" },
  { id: "io", text: "    case IN | OUT: if (SR.mode == USER)" },
  { id: "illegal", text: "                     ILLEGAL_INSTRUCTION;" },
  { id: "io", text: "                   else emular el puerto del controlador;" },
  { text: "  } }" },
  { text: "}" },
];

export function EmulatorStepper() {
  const [sc, setSc] = React.useState<keyof typeof SCENARIOS>("syscall");
  const { mem, steps } = SCENARIOS[sc];
  const { step, playing, play, go } = useSteps(steps.length, 2200);
  const s = steps[Math.min(step, steps.length - 1)];
  return (
    <figure className="dg dg-wide emu reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">Emulación</span>
        <strong>El intérprete de CPU, paso a paso</strong>
      </figcaption>
      <div className="controls">
        <Choice
          label="Programa"
          value={sc}
          options={[
            { value: "syscall", text: "Llamada al sistema" },
            { value: "illegal", text: "OUT en modo usuario" },
            { value: "irq", text: "Llega una IRQ" },
          ]}
          onChange={(v) => {
            setSc(v);
            go(0);
          }}
        />
      </div>
      <div className="emu-grid">
        <div className="emu-col">
          <span className="emu-h">RAM de la MV</span>
          <ol className="emu-mem">
            {[...mem, ...MEM_KERNEL].map(([a, t]) => (
              <li key={a} data-on={a === s.pc ? "" : undefined} data-k={a >= "0x200" ? "" : undefined}>
                <code>{a}</code> {t}
              </li>
            ))}
          </ol>
          <span className="emu-h">Estado de la CPU virtual</span>
          <dl className="emu-state">
            <dt>PC</dt>
            <dd>{s.pc}</dd>
            <dt>Modo</dt>
            <dd data-mode={s.mode}>{s.mode}</dd>
            <dt>R1</dt>
            <dd>{s.r1}</dd>
            <dt>Pila</dt>
            <dd>{s.stack.length ? s.stack.join(" · ") : "vacía"}</dd>
            <dt>E/S</dt>
            <dd>{s.io ?? "—"}</dd>
          </dl>
        </div>
        <pre className="emu-code" aria-label="Bucle del intérprete">
          {CODE.map((c, i) => (
            <span key={i} data-on={c.id && s.lines.includes(c.id) ? "" : undefined} data-bad={c.id === "illegal" && s.lines.includes("illegal") ? "" : undefined}>
              {c.text}
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
      <Steps step={step} total={steps.length} playing={playing} onPlay={play} onStep={go} labels={steps.map((x, i) => `Paso ${i + 1}/${steps.length} · ${x.inst}`)} />
      <p className="dg-note">{s.note}</p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Runtime binary translation */

const BT_BLOCK = [
  { g: "mov ebx, eax", kind: "IDENT", tc: ["mov ebx, eax"] },
  { g: "cli", kind: "INLINE", tc: ["mov [CPU_IE], 0"] },
  { g: "and ebx, ~0xfff", kind: "IDENT", tc: ["and ebx, ~0xfff"] },
  { g: "mov cr3, ebx", kind: "INLINE + CALLOUT", tc: ["mov [CO_ARG], ebx", "call HANDLE_CR3"] },
  { g: "sti", kind: "INLINE + CALLOUT", tc: ["mov [CPU_IE], 1", "test [CPU_IRQ], 1", "jne → call HANDLE_INTS"] },
  { g: "ret", kind: "CALLOUT", tc: ["jmp HANDLE_RET"] },
];

const BT_WHY: Record<string, string> = {
  IDENT: "Inocua: se copia tal cual.",
  INLINE: "Se sustituye por unas pocas instrucciones seguras que actúan sobre la CPU virtual (cli → poner a 0 el flag de interrupciones VIRTUAL).",
  "INLINE + CALLOUT": "Se guarda el argumento y se llama a una rutina de emulación (escribir cr3 = cambiar el PTBR; sti debe comprobar si hay IRQs pendientes).",
  CALLOUT: "Control de flujo: el destino aún no está traducido, se salta al traductor (HANDLE_RET) para el siguiente bloque básico.",
};

const BT_CHAIN = [
  { tc: ["test eax, 1", "jeq → call END_BB", "call END_BB"], note: "Se traduce solo el bloque básico, hasta el salto. Sus dos salidas (salta / no salta) apuntan todavía al traductor (END_BB)." },
  { tc: ["test eax, 1", "jeq → call END_BB", "call END_BB", "add ebx, 18", "mov ecx, [ebx]", "mov [ecx], eax", "call HANDLE_RET"], hi: [3, 4, 5, 6], note: "Se ejecuta el camino que no salta: el traductor busca (find next) y traduce ese bloque al final de la caché." },
  { tc: ["test eax, 1", "jeq → call END_BB", "jmp ↓ (parcheado)", "add ebx, 18", "mov ecx, [ebx]", "mov [ecx], eax", "call HANDLE_RET"], hi: [2], note: "Encadenamiento: la llamada al traductor se parchea con un salto directo. La próxima vez no se pasa por el traductor." },
  { tc: ["test eax, 1", "jeq → call END_BB", "jmp ↓", "add ebx, 18", "mov ecx, [ebx]", "mov [ecx], eax", "call HANDLE_RET", "mov [ecx], eax", "call HANDLE_RET"], hi: [7, 8], note: "Ahora el guest toma el otro camino (sí salta): se traduce el bloque destino." },
  { tc: ["test eax, 1", "jeq → jmp ↓ (parcheado)", "jmp ↓", "add ebx, 18", "mov ecx, [ebx]", "mov [ecx], eax", "call HANDLE_RET", "mov [ecx], eax", "call HANDLE_RET"], hi: [1], note: "Los dos caminos encadenados: este código ya corre entero desde la Translation Cache, en modo usuario, sin el traductor." },
];

export function BinaryTranslationStepper() {
  const [sc, setSc] = React.useState<"priv" | "flow">("priv");
  const total = sc === "priv" ? BT_BLOCK.length : BT_CHAIN.length;
  const { step, playing, play, go } = useSteps(total, 2000);
  let guest: { text: string; on: boolean; kind?: string }[];
  let cache: { text: string; on: boolean; kind?: string }[];
  let note: React.ReactNode;
  if (sc === "priv") {
    guest = BT_BLOCK.map((b, i) => ({ text: b.g, on: i === step, kind: i <= step ? b.kind : undefined }));
    cache = BT_BLOCK.slice(0, step + 1).flatMap((b, i) => b.tc.map((t) => ({ text: t, on: i === step, kind: b.kind })));
    note = (
      <>
        <b>{BT_BLOCK[step].kind}:</b> {BT_WHY[BT_BLOCK[step].kind]}
      </>
    );
  } else {
    const c = BT_CHAIN[step];
    guest = ["test eax, 1", "jeq L", "add ebx, 18", "mov ecx, [ebx]", "L: mov [ecx], eax", "ret"].map((t) => ({ text: t, on: false }));
    cache = c.tc.map((t, i) => ({ text: t, on: (c.hi ?? []).includes(i) }));
    note = c.note;
  }
  return (
    <figure className="dg bt reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">Runtime binary translation</span>
        <strong>Del código guest a la Translation Cache</strong>
      </figcaption>
      <div className="controls">
        <Choice
          label="Ejemplo"
          value={sc}
          options={[
            { value: "priv", text: "Bloque con privilegiadas" },
            { value: "flow", text: "Saltos y encadenamiento" },
          ]}
          onChange={(v) => {
            setSc(v);
            go(0);
          }}
        />
      </div>
      <div className="bt-grid">
        <div>
          <span className="emu-h">Código guest {sc === "priv" ? "(un bloque básico)" : ""}</span>
          <ol className="bt-list">
            {guest.map((g, i) => (
              <li key={i} data-on={g.on ? "" : undefined}>
                <code>{g.text}</code>
                {g.kind ? <span className="bt-kind" data-kind={g.kind}>{g.kind}</span> : null}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <span className="emu-h">Translation Cache (se ejecuta en modo usuario)</span>
          <ol className="bt-list tc">
            {cache.map((c, i) => (
              <li key={i} data-on={c.on ? "" : undefined}>
                <code>{c.text}</code>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <Steps step={step} total={total} playing={playing} onPlay={play} onStep={go} />
      <p className="dg-note">{note}</p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Trap & emulate vs hardware-assisted: one syscall that does one I/O */

type Lane = 0 | 1 | 2 | 3;
interface Seg {
  lane: Lane;
  text: string;
  via?: string;
  cost?: "trap" | "exit";
}

const LANES = ["Usuario", "Kernel (guest)", "Hipervisor", "Hardware"];

const SEQ: Record<string, Seg[]> = {
  real: [
    { lane: 0, text: "código usuario" },
    { lane: 1, text: "kernel (PRIV)", via: "INT" },
    { lane: 3, text: "E/S", via: "IN/OUT" },
    { lane: 1, text: "kernel" },
    { lane: 0, text: "código usuario", via: "IRET" },
  ],
  te: [
    { lane: 0, text: "código usuario" },
    { lane: 2, text: "emula paso a kernel", via: "INT", cost: "trap" },
    { lane: 1, text: "kernel DEPRIV" },
    { lane: 2, text: "emula ctrl. E/S", via: "IN/OUT", cost: "trap" },
    { lane: 3, text: "E/S real" },
    { lane: 2, text: "fin emulación" },
    { lane: 1, text: "kernel DEPRIV" },
    { lane: 2, text: "emula vuelta a usuario", via: "IRET", cost: "trap" },
    { lane: 0, text: "código usuario" },
  ],
  hw: [
    { lane: 0, text: "código usuario" },
    { lane: 1, text: "kernel PSEUDO-PRIV", via: "INT (sin exit)" },
    { lane: 2, text: "emula ctrl. E/S", via: "IN/OUT", cost: "exit" },
    { lane: 3, text: "E/S real" },
    { lane: 2, text: "vmrun" },
    { lane: 1, text: "kernel guest", via: "vmrun" },
    { lane: 0, text: "código usuario", via: "IRET (sin exit)" },
  ],
};

export function TrapTimeline() {
  const [mode, setMode] = React.useState<keyof typeof SEQ>("te");
  const seq = SEQ[mode];
  const { step, playing, play, go } = useSteps(seq.length, 1100);
  const X0 = 112;
  const W = (552 - X0) / seq.length;
  const laneY = (l: number) => 40 + l * 46;
  const shown = seq.slice(0, step + 1);
  const traps = shown.filter((s) => s.cost).length;
  const total = seq.filter((s) => s.cost).length;
  return (
    <Diagram
      title="Una llamada al sistema con una E/S"
      kicker="Trap & emulate vs hardware"
      label="Línea temporal con cuatro carriles: usuario, kernel del guest, hipervisor y hardware. Con trap & emulate la llamada provoca tres traps; con soporte hardware, un solo exit."
      viewBox="0 0 560 222"
      wide
      controls={
        <>
          <Choice
            label="Sistema"
            value={mode}
            options={[
              { value: "real", text: "SO real (sin virtualizar)" },
              { value: "te", text: "Trap & emulate" },
              { value: "hw", text: "Hardware (VT-x / AMD-V)" },
            ]}
            onChange={(v) => {
              setMode(v);
              go(0);
            }}
          />
          <Steps step={step} total={seq.length} playing={playing} onPlay={play} onStep={go} />
        </>
      }
      note={
        mode === "real" ? (
          <>Sin virtualizar: el kernel corre en modo privilegiado y habla con el hardware directamente. <b>0 intervenciones</b> del hipervisor.</>
        ) : mode === "te" ? (
          <>El kernel del guest corre desprivilegiado: <b>INT, IN/OUT e IRET provocan un trap cada una</b>, y el hipervisor emula el cambio de modo, el controlador y la vuelta. Mucho overhead, más los shadow registers.</>
        ) : (
          <>Con el modo guest pseudoprivilegiado, la llamada al sistema y el IRET los ejecuta el propio guest. <b>Solo la E/S provoca un exit</b>; el hipervisor la emula y vuelve con <code>vmrun</code> cargando el estado del VMCB.</>
        )
      }
    >
      {LANES.map((l, i) => (
        <g key={l} className="tt-lane" data-off={mode === "real" && i === 2 ? "" : undefined}>
          <rect x={0} y={laneY(i) - 20} width={560} height={40} rx={6} />
          <text className="dg-s" x={8} y={laneY(i) + 4}>
            {mode === "hw" && i === 1 ? "Kernel (modo guest)" : l}
          </text>
        </g>
      ))}
      {shown.map((s, i) => {
        const x = X0 + i * W;
        const prev = i ? shown[i - 1] : null;
        return (
          <g key={i} className="tt-seg" data-cost={s.cost} data-on={i === step ? "" : undefined}>
            {prev ? <path className="tt-link" d={`M${x - 6} ${laneY(prev.lane) - 6} L${x} ${laneY(s.lane) - 6}`} /> : null}
            {s.via && prev ? (
              <text className="tt-via" x={x - 3} y={(laneY(prev.lane) + laneY(s.lane)) / 2 - 2} textAnchor="end">
                {s.via}
              </text>
            ) : null}
            <rect x={x} y={laneY(s.lane) - 12} width={W - 8} height={12} rx={4} />
            <text className="tt-t" x={x + (W - 8) / 2} y={laneY(s.lane) + 12} textAnchor="middle">
              {s.text}
            </text>
          </g>
        );
      })}
      <text className="dg-kick" x={552} y={14} textAnchor="end">
        {mode === "hw" ? "exits" : "traps"}: {traps} / {total}
      </text>
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* Hybrid: trap & emulate for guest user mode, binary translation for guest kernel mode */

export function HybridFlow() {
  const [kernel, setKernel] = React.useState(true);
  const on = (k: boolean) => (k === kernel ? "lit" : "dim");
  return (
    <Diagram
      title="Implementación híbrida (VMware, 2002)"
      kicker="Teorema 3"
      label="Diagrama de flujo: si se puede usar trap & emulate se ejecuta directamente el código guest; si no, se traduce y se ejecuta en la caché de traducción. Ambos caminos acaban manejando la instrucción privilegiada."
      viewBox="0 0 560 220"
      controls={
        <Choice
          label="El guest está en"
          value={kernel ? "k" : "u"}
          options={[
            { value: "u", text: "Modo usuario" },
            { value: "k", text: "Modo kernel" },
          ]}
          onChange={(v) => setKernel(v === "k")}
        />
      }
      note={
        kernel ? (
          <>En <b>modo kernel</b> del guest puede haber sensibles que no generan trap (x86), así que se usa <b>traducción binaria</b> y se ejecuta desde la Translation Cache.</>
        ) : (
          <>En <b>modo usuario</b> las instrucciones sensibles sí generan trap: <b>ejecución directa</b> (trap & emulate), mucho más rápida.</>
        )
      }
    >
      <polygon className="hy-dec" points="110,40 190,90 110,140 30,90" />
      <text className="dg-t" x={110} y={86} textAnchor="middle">
        ¿Trap &amp;
      </text>
      <text className="dg-t" x={110} y={102} textAnchor="middle">
        emulate OK?
      </text>
      <g className={`hy-path ${on(false)}`}>
        <path d="M190 90 H250" />
        <text className="dg-s" x={220} y={82} textAnchor="middle">
          sí
        </text>
        <rect x={250} y={66} width={120} height={48} rx={6} />
        <text className="dg-t" x={310} y={88} textAnchor="middle">
          Ejecución directa
        </text>
        <text className="dg-s" x={310} y={104} textAnchor="middle">
          salta al PC del guest
        </text>
        <path d="M370 90 H420" />
        <text className="dg-s" x={395} y={82} textAnchor="middle">
          trap
        </text>
      </g>
      <g className={`hy-path ${on(true)}`}>
        <path d="M110 140 V170 H140" />
        <text className="dg-s" x={96} y={160} textAnchor="end">
          no
        </text>
        <rect x={140} y={150} width={110} height={42} rx={6} />
        <text className="dg-t" x={195} y={176} textAnchor="middle">
          Traducción binaria
        </text>
        <path d="M250 171 H280" />
        <rect x={280} y={150} width={100} height={42} rx={6} />
        <text className="dg-t" x={330} y={176} textAnchor="middle">
          Ejecutar en TC
        </text>
        <path d="M380 171 H420 V140" />
        <text className="dg-s" x={404} y={186} textAnchor="middle">
          callout
        </text>
      </g>
      <rect className="dg-node accent" x={420} y={60} width={136} height={80} rx={8} />
      <text className="dg-t wa-on" x={488} y={96} textAnchor="middle">
        Manejar instrucción
      </text>
      <text className="dg-t wa-on" x={488} y={112} textAnchor="middle">
        privilegiada
      </text>
      <path className="dg-wire" d="M488 60 V20 H110 V40" />
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* Multiplexing the CPU: round robin between VMs, switching on HALT or on timeout */

type Profile = "busy" | "inter" | "idle";
const PROF: Record<Profile, { burst: number; sleep: number; text: string }> = {
  busy: { burst: Infinity, sleep: 0, text: "CPU intensiva (nunca HALT)" },
  inter: { burst: 1, sleep: 2, text: "Interactiva (HALT tras 1 tick)" },
  idle: { burst: 1, sleep: 7, text: "Ociosa (casi siempre en HALT)" },
};
const TICKS = 24;

function simulate(profiles: Profile[], quantum: number) {
  const n = profiles.length;
  const ready = profiles.map(() => 0);
  const left = profiles.map((p) => PROF[p].burst);
  const owner: (number | null)[] = [];
  const why: ("halt" | "timeout" | null)[] = [];
  let next = 0;
  let t = 0;
  let halts = 0;
  let timeouts = 0;
  while (t < TICKS) {
    let pick = -1;
    for (let j = 0; j < n; j++) {
      const c = (next + j) % n;
      if (ready[c] <= t) {
        pick = c;
        break;
      }
    }
    if (pick < 0) {
      owner.push(null);
      why.push(null);
      t++;
      continue;
    }
    let used = 0;
    while (used < quantum && left[pick] > 0 && t < TICKS) {
      owner.push(pick);
      why.push(null);
      used++;
      left[pick]--;
      t++;
    }
    if (left[pick] <= 0) {
      why[why.length - 1] = "halt";
      halts++;
      ready[pick] = t + PROF[profiles[pick]].sleep;
      left[pick] = PROF[profiles[pick]].burst;
    } else if (used >= quantum) {
      why[why.length - 1] = "timeout";
      timeouts++;
    }
    next = (pick + 1) % n;
  }
  return { owner, why, halts, timeouts };
}

const VM_NAMES = ["MV A", "MV B", "MV C"];

export function SchedulerDiagram() {
  const [quantum, setQuantum] = React.useState(3);
  const [b, setB] = React.useState<Profile>("inter");
  const profiles: Profile[] = ["busy", b, "idle"];
  const { owner, why, halts, timeouts } = simulate(profiles, quantum);
  const share = VM_NAMES.map((_, i) => owner.filter((o) => o === i).length);
  const X0 = 70;
  const TW = 19;
  return (
    <Diagram
      title="Round-robin entre máquinas virtuales"
      kicker="Multiplexación de la CPU"
      label="Diagrama de Gantt de una CPU física repartida entre tres máquinas virtuales. Una máquina deja la CPU cuando ejecuta HALT o cuando se le acaba el cuanto."
      viewBox="0 0 560 200"
      controls={
        <>
          <Slider label="Cuanto" value={quantum} min={1} max={6} onChange={setQuantum} format={(v) => `${v} ticks`} />
          <Choice
            label="MV B"
            value={b}
            options={[
              { value: "inter", text: "Interactiva" },
              { value: "busy", text: "CPU intensiva" },
            ]}
            onChange={setB}
          />
        </>
      }
      note={
        <>
          {halts} cambios por <b>HALT</b> (la MV no tiene nada que hacer y el hipervisor lo detecta porque HALT es privilegiada) y {timeouts} por <b>timeout</b> (se acabó su cuanto). Mira la fila de la MV A: los huecos son <b>tiempos de espera inexplicables</b> para su guest, que no sabe que el hipervisor estaba ejecutando otra MV.
        </>
      }
    >
      {VM_NAMES.map((name, i) => (
        <g key={name}>
          <text className="dg-t" x={4} y={34 + i * 40}>
            {name}
          </text>
          <text className="dg-s" x={4} y={48 + i * 40}>
            {Math.round((share[i] / TICKS) * 100)} % CPU
          </text>
          <rect className="sch-row" x={X0} y={22 + i * 40} width={TICKS * TW} height={26} rx={4} />
          {owner.map((o, t) =>
            o === i ? (
              <rect key={t} className="sch-run" data-vm={i} x={X0 + t * TW + 1} y={24 + i * 40} width={TW - 2} height={22} rx={3} />
            ) : null,
          )}
          {why.map((w, t) =>
            w && owner[t] === i ? (
              <text key={`w${t}`} className={w === "halt" ? "sch-halt" : "sch-to"} x={X0 + t * TW + TW / 2} y={62 + i * 40} textAnchor="middle">
                {w === "halt" ? "HLT" : "⏱"}
              </text>
            ) : null,
          )}
        </g>
      ))}
      <text className="dg-s" x={4} y={176}>
        CPU real
      </text>
      {owner.map((o, t) => (
        <rect key={t} className="sch-run" data-vm={o ?? "idle"} x={X0 + t * TW + 1} y={164} width={TW - 2} height={16} rx={3} />
      ))}
      <text className="dg-s" x={X0} y={196}>
        tiempo →
      </text>
      <text className="dg-s" x={X0 + TICKS * TW} y={196} textAnchor="end">
        {PROF[b].text}
      </text>
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* CPU visibility: an old generic model migrates anywhere; the real CPU is fastest but ties you to it */

export function CpuVisibility() {
  const [host, setHost] = React.useState(false);
  return (
    <Diagram
      title="¿Qué CPU ve el guest?"
      kicker="Visibilidad de la CPU"
      label="Dos servidores, uno con CPU nueva y otro con CPU antigua. Con un modelo genérico la máquina virtual se puede migrar a ambos; con la CPU real expuesta, solo a uno igual."
      viewBox="0 0 560 170"
      controls={
        <Choice
          label="QEMU"
          value={host ? "host" : "old"}
          options={[
            { value: "old", text: "-cpu qemu64 (modelo antiguo)" },
            { value: "host", text: "-cpu host (la real)" },
          ]}
          onChange={(v) => setHost(v === "host")}
        />
      }
      note={
        host ? (
          <><b>Visibilidad total:</b> el software detecta y usa las instrucciones avanzadas (más rápido), pero queda atado a ese modelo exacto de CPU: migrar a una CPU más antigua falla.</>
        ) : (
          <><b>CPU más antigua emulada:</b> modelo sencillo y portable; la MV se puede migrar a cualquier servidor y no fallan programas antiguos. A cambio, no aprovecha las mejoras de la CPU nueva.</>
        )
      }
    >
      <rect className="dg-node" x={20} y={20} width={200} height={120} rx={10} />
      <text className="dg-t" x={120} y={42} textAnchor="middle">
        Servidor A · CPU nueva
      </text>
      <text className="dg-s" x={120} y={58} textAnchor="middle">
        SSE4 · AVX2 · AVX-512
      </text>
      <rect className="dg-node out" x={50} y={72} width={140} height={54} rx={8} />
      <text className="dg-t" x={120} y={94} textAnchor="middle">
        MV
      </text>
      <text className="dg-s accent-text" x={120} y={112} textAnchor="middle">
        ve: {host ? "SSE4 · AVX2 · AVX-512" : "SSE2 (qemu64)"}
      </text>
      <rect className="dg-node" x={340} y={20} width={200} height={120} rx={10} />
      <text className="dg-t" x={440} y={42} textAnchor="middle">
        Servidor B · CPU antigua
      </text>
      <text className="dg-s" x={440} y={58} textAnchor="middle">
        SSE4 (sin AVX)
      </text>
      <path className={host ? "dg-wire neg" : "dg-wire pos"} d="M222 99 C270 99 290 99 338 99" data-flow="" />
      <text className={host ? "dg-t bad-text" : "dg-t ok-text"} x={280} y={88} textAnchor="middle">
        {host ? "✗ migración" : "✓ migración"}
      </text>
      <text className="dg-s" x={280} y={160} textAnchor="middle">
        {host ? "el guest usaba AVX-512 y en B no existe" : "B ofrece todo lo que el guest espera"}
      </text>
    </Diagram>
  );
}
