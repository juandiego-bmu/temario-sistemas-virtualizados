"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Arrow, Diagram, Steps, useShow, useSteps } from "./kit";

/* ------------------------------------------------------------------ */
/* The privilege ladder with VT-x: the guest gets its ring 0 back and the hypervisor goes below it */

type Ev = "all" | "syscall" | "cpuid" | "hlt" | "launch" | "smi";

interface Rung {
  id: string;
  ring: string;
  y: number; // top edge
  title?: string; // without a title it is one of the unused rings 1 and 2
  sub?: string;
  mode?: "nonroot" | "root" | "smm";
}

// From least to most privilege.
const RUNGS: Rung[] = [
  { id: "r3", ring: "3", y: 24, title: "Aplicaciones del guest", sub: "modo usuario", mode: "nonroot" },
  { id: "r2", ring: "2", y: 76 },
  { id: "r1", ring: "1", y: 100 },
  { id: "r0", ring: "0", y: 126, title: "SO guest (su kernel)", sub: "sus sensibles: o trap o semántica correcta", mode: "nonroot" },
  { id: "rm1", ring: "−1", y: 230, title: "Hipervisor (VMM)", sub: "por debajo del anillo 0 del guest", mode: "root" },
  { id: "rm2", ring: "−2", y: 288, title: "SMM · System Management", sub: "firmware de la placa en SMRAM", mode: "smm" },
];
const mid = (r: Rung) => r.y + (r.title ? 22 : 9);
const MAIN = RUNGS.filter((r) => r.title).length;

const EVENTS: Record<Ev, { text: string; on: string[]; note: React.ReactNode }> = {
  all: {
    text: "La escalera",
    on: [],
    note: (
      <>
        Cuanto más abajo, más privilegio. Con VT-x el guest recupera su <b>anillo 0</b> (VMX non-root) y el hipervisor baja al modo root: el <b>«ring −1»</b>. Los anillos 1 y 2 no se usan y, por debajo de todo, el SMM es el <b>anillo −2</b>.
      </>
    ),
  },
  syscall: {
    text: "Una syscall",
    on: ["r3", "r0"],
    note: (
      <>
        Pasa del anillo 3 al 0 del guest <b>sin VM exit</b>: non-root tiene su propio anillo 0. Sin VT-x (trap &amp; emulate), el guest bajaba al anillo 1, el VMM ocupaba el 0 y la syscall entraba primero en el VMM.
      </>
    ),
  },
  cpuid: {
    text: "CPUID",
    on: ["r0", "rm1"],
    note: (
      <>
        <code>CPUID</code> provoca un <b>VM exit incondicional</b>, como <code>INVD</code> y las instrucciones VMX. El VMM lo emula y vuelve a entrar con <code>VMRESUME</code>.
      </>
    ),
  },
  hlt: {
    text: "HLT",
    on: ["r0", "rm1"],
    note: (
      <>
        <code>HLT</code> provoca un <b>VM exit condicional</b> (flecha discontinua): solo si su bit está activo en la máscara de los control fields del VMCS, como <code>IN</code>, <code>OUT</code>, <code>LIDT</code>, <code>SIDT</code> o <code>MOV CR3</code>.
      </>
    ),
  },
  launch: {
    text: "Lanzar la MV",
    on: ["rm1", "r0"],
    note: (
      <>
        <code>VMXON</code> enciende el modo root, siempre <b>desde long mode</b>. El VMM prepara el VMCS y entra con <code>VMLAUNCH</code>: un <b>VM entry</b>, de root a non-root. Tras cada exit vuelve con <code>VMRESUME</code>.
      </>
    ),
  },
  smi: {
    text: "Una SMI#",
    on: ["rm2"],
    note: (
      <>
        Una <b>SMI#</b>, la interrupción no enmascarable del hardware, lleva al SMM desde cualquier modo, incluso desde el hipervisor: es el <b>anillo −2</b>, el de máximo privilegio. Se sale con <code>RSM</code>.
      </>
    ),
  },
};

/** The x86 rings with VT-x, from the applications down to the SMM, with VM entry and VM exit between non-root and root. */
export function RingLadder() {
  const [ev, setEv] = React.useState<Ev>("all");
  const [exam, setExam] = React.useState(false);
  const [shown, setShown] = React.useState<Set<string>>(new Set());
  useShow("ring", (key) => {
    if (!(key in EVENTS)) return;
    setExam(false);
    setEv(key as Ev);
  });
  const e = EVENTS[ev];
  const exits = ev === "cpuid" || ev === "hlt";
  const entryTone = exits || ev === "launch" ? "lit" : ev === "all" ? "" : "dim";
  const exitTone = exits ? "lit" : ev === "all" ? "" : "dim";
  const reveal = (id: string) => setShown((s) => new Set(s).add(id));
  const left = MAIN - shown.size;
  return (
    <Diagram
      ns="ring"
      title="La escalera de privilegios con VT-x"
      kicker="Anillos del x86"
      label="Escalera de anillos de privilegio del x86 con VT-x. De arriba abajo: anillo 3, aplicaciones del guest; anillos 2 y 1, sin uso; anillo 0, el kernel del guest en VMX non-root; anillo menos 1, el hipervisor en VMX root; anillo menos 2, el SMM. Entre non-root y root, el VM entry (VMLAUNCH o VMRESUME) sube y el VM exit baja."
      viewBox="0 0 560 342"
      controls={
        <>
          {exam ? null : <Choice label="Ver" value={ev} options={(Object.keys(EVENTS) as Ev[]).map((k) => ({ value: k, text: EVENTS[k].text }))} onChange={setEv} />}
          <Choice
            label="Modo"
            value={exam ? "exam" : "study"}
            options={[
              { value: "study", text: "Estudiar" },
              { value: "exam", text: "Examen (tapar los anillos)" },
            ]}
            onChange={(v) => {
              setExam(v === "exam");
              setShown(new Set());
              setEv("all");
            }}
          />
        </>
      }
      note={
        exam ? (
          left ? (
            <>
              ¿En qué anillo va cada uno? Dilo en voz alta y pulsa su <b>?</b> para comprobarlo. Te quedan <b>{left}</b>.
            </>
          ) : (
            <>
              Los cuatro: <b>3 · 0 · −1 · −2</b>. Los anillos 1 y 2 existen, pero no se usan.
            </>
          )
        ) : (
          e.note
        )
      }
    >
      <text className="dg-kick" x={36} y={14} textAnchor="middle">
        Anillo
      </text>
      <text className="dg-kick" x={72} y={14}>
        Quién se ejecuta
      </text>
      <text className="dg-kick" x={446} y={14}>
        Modo
      </text>
      {RUNGS.map((r) => {
        const on = e.on.includes(r.id);
        const covered = exam && !!r.title && !shown.has(r.id);
        const open = () => covered && reveal(r.id);
        return (
          <g key={r.id} className="rl-rung" data-mode={r.mode} data-thin={r.title ? undefined : ""} data-on={on ? "" : undefined} data-dim={ev !== "all" && !on ? "" : undefined}>
            <rect x={72} y={r.y} width={r.title ? 332 : 228} height={r.title ? 44 : 18} rx={r.title ? 8 : 5} />
            {r.title ? (
              <>
                <text className="dg-t" x={88} y={mid(r) - 3}>
                  {r.title}
                </text>
                <text className="dg-s" x={88} y={mid(r) + 13}>
                  {r.sub}
                </text>
              </>
            ) : (
              <text className="dg-s" x={88} y={mid(r) + 4}>
                sin uso
              </text>
            )}
            <g
              className="rl-badge"
              data-covered={covered ? "" : undefined}
              {...(covered ? { role: "button", tabIndex: 0, "aria-label": "Anillo tapado: pulsa para verlo", onClick: open, onKeyDown: (k: React.KeyboardEvent) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), open()) } : {})}
            >
              {r.title ? <circle cx={36} cy={mid(r)} r={17} /> : null}
              <text className={r.title ? "rl-n" : "dg-s"} x={36} y={mid(r) + (r.title ? 5 : 4)} textAnchor="middle">
                {covered ? "?" : r.ring}
              </text>
            </g>
          </g>
        );
      })}
      <path className="rl-bracket" d="M452 24 H446 V170 H452" />
      <text className="dg-t" x={458} y={95}>
        VMX non-root
      </text>
      <text className="dg-s" x={458} y={111}>
        el guest
      </text>
      <path className="rl-bracket" d="M452 230 H446 V274 H452" />
      <text className="dg-t" x={458} y={248}>
        VMX root
      </text>
      <text className="dg-s" x={458} y={264}>
        el VMM
      </text>
      <path className="rl-bracket" d="M452 288 H446 V332 H452" />
      <text className="dg-s" x={458} y={306}>
        entra: SMI#
      </text>
      <text className="dg-s" x={458} y={322}>
        sale: RSM
      </text>
      <Arrow x1={116} y1={226} x2={116} y2={174} tone={entryTone} />
      <text className="dg-t" x={128} y={197}>
        VM entry
      </text>
      <text className="dg-s" x={128} y={213}>
        VMLAUNCH / VMRESUME
      </text>
      <Arrow x1={290} y1={174} x2={290} y2={226} tone={exitTone} dashed={ev === "hlt"} />
      <text className="dg-t" x={302} y={197}>
        VM exit
      </text>
      <text className="dg-s" x={302} y={213}>
        sensible o IRQ
      </text>
      {ev === "syscall" ? (
        <g>
          <g className="dg-arrow lit">
            <path d="M404 46 H424 V148 H406" />
            <path d="M406 148 l6.3 -3 M406 148 l6.3 3" />
          </g>
          <text className="dg-s accent-text" x={396} y={103} textAnchor="end">
            syscall
          </text>
          <text className="dg-s accent-text" x={396} y={119} textAnchor="end">
            sin VM exit
          </text>
        </g>
      ) : null}
      {ev === "smi" ? (
        <g className="dg-arrow lit">
          <circle className="rl-from" cx={430} cy={30} r={3} />
          <path d="M430 30 V310 H406" />
          <path d="M406 310 l6.3 -3 M406 310 l6.3 3" />
        </g>
      ) : null}
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* The VMCS step by step: the example sequence of the slides for a VM started for the first time */

type Side = "vmm" | "mv";
type Area = "guest" | "host" | "ctl" | "exit";

const AREAS: { id: Area; t: string }[] = [
  { id: "guest", t: "guest-state area" },
  { id: "host", t: "host-state area" },
  { id: "ctl", t: "control fields" },
  { id: "exit", t: "exit information fields" },
];
const areaY = (a: Area) => 47 + AREAS.findIndex((x) => x.id === a) * 40;

// flows: [side, area, "in" = into the VMCS | "out" = out of it]; run: who is on the CPU after the step.
const VSTEPS: { op: string; cost?: "exit"; run: Side; mark: Area[]; flows: [Side, Area, "in" | "out"][]; text: string }[] = [
  { op: "VMXON", run: "vmm", mark: [], flows: [], text: "El VMM enciende el modo root, siempre desde long mode." },
  { op: "VMCLEAR", run: "vmm", mark: ["guest", "host", "ctl", "exit"], flows: [], text: "Deja limpio el VMCS de la MV nueva." },
  { op: "VMWRITE", run: "vmm", mark: ["guest", "ctl"], flows: [["vmm", "guest", "in"], ["vmm", "ctl", "in"]], text: "El VMM escribe el estado inicial del guest y qué instrucciones provocarán un exit." },
  { op: "VMLAUNCH", run: "mv", mark: ["host", "guest"], flows: [["vmm", "host", "in"], ["mv", "guest", "out"]], text: "VM entry: la CPU guarda el contexto del VMM en la host-state area, carga el del guest y pasa a non-root." },
  { op: "VM EXIT", cost: "exit", run: "vmm", mark: ["guest", "exit", "host"], flows: [["mv", "guest", "in"], ["vmm", "host", "out"]], text: "La CPU guarda el contexto del guest en la guest-state area, apunta la causa en los exit information fields y carga el del VMM." },
  { op: "VMREAD", run: "vmm", mark: ["exit"], flows: [["vmm", "exit", "out"]], text: "El VMM lee la causa del exit y emula lo que haga falta." },
  { op: "VMRESUME", run: "mv", mark: ["host", "guest"], flows: [["vmm", "host", "in"], ["mv", "guest", "out"]], text: "VM entry otra vez, ahora con VMRESUME: VMLAUNCH solo vale para la primera." },
];

/** VMCLEAR → VMWRITE → VMLAUNCH → VM EXIT → VMREAD → VMRESUME, with what each step reads or writes in the VMCS. */
export function VmcsSteps() {
  const { step, playing, play, go } = useSteps(VSTEPS.length, 1900);
  useShow("vmcs", () => {
    go(0);
    play();
  });
  const s = VSTEPS[step];
  return (
    <Diagram
      ns="vmcs"
      title="El VMCS paso a paso"
      kicker="Una MV que arranca por primera vez"
      label="El VMM a la izquierda, la MV a la derecha y en medio el VMCS con sus cuatro áreas: guest-state, host-state, control fields y exit information fields. Cada paso de la secuencia VMXON, VMCLEAR, VMWRITE, VMLAUNCH, VM exit, VMREAD y VMRESUME ilumina lo que se escribe o se lee."
      viewBox="0 0 560 202"
      wide
      controls={<Steps step={step} total={VSTEPS.length} playing={playing} onPlay={play} onStep={go} />}
      note={
        <>
          <p className="tt-sum">
            La CPU lee y escribe el VMCS ella sola en cada entry y cada exit. <b>Guest-state</b>: el guest se guarda en el exit y se carga en el entry; <b>host-state</b>, el VMM, al revés. Pulsa un paso para ir a él.
          </p>
          <ol className="tt-list">
            {VSTEPS.map((x, i) => (
              <li key={x.op} data-state={i < step ? "past" : i === step ? "now" : undefined} data-cost={x.cost}>
                <button type="button" onClick={() => go(i)}>
                  <span className="tt-tag">{x.op}</span>
                  {x.text}
                </button>
              </li>
            ))}
          </ol>
        </>
      }
    >
      {(["vmm", "mv"] as const).map((side) => {
        const x = side === "vmm" ? 8 : 424;
        return (
          <g key={side} className="vx-box" data-side={side} data-on={s.run === side ? "" : undefined}>
            <rect x={x} y={30} width={128} height={154} rx={10} />
            <text className="dg-t" x={x + 64} y={100} textAnchor="middle">
              {side === "vmm" ? "VMM" : "MV (guest)"}
            </text>
            <text className="dg-s" x={x + 64} y={116} textAnchor="middle">
              {side === "vmm" ? "VMX root" : "VMX non-root"}
            </text>
          </g>
        );
      })}
      <rect className="vx-vmcs" x={186} y={8} width={188} height={186} rx={12} />
      <text className="dg-kick" x={280} y={22} textAnchor="middle">
        VMCS
      </text>
      {AREAS.map((a) => (
        <g key={a.id} className="vx-area" data-on={s.mark.includes(a.id) ? "" : undefined}>
          <rect x={196} y={areaY(a.id) - 17} width={168} height={34} rx={6} />
          <text className="dg-s" x={280} y={areaY(a.id) + 4} textAnchor="middle">
            {a.t}
          </text>
        </g>
      ))}
      {s.flows.map(([side, a, dir]) => {
        const [near, far] = side === "vmm" ? [184, 140] : [376, 420];
        const [x1, x2] = dir === "in" ? [far, near] : [near, far];
        return <Arrow key={side + a} x1={x1} y1={areaY(a)} x2={x2} y2={areaY(a)} tone="lit" />;
      })}
    </Diagram>
  );
}
