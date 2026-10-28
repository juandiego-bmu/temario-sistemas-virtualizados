"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, useShow } from "./kit";

type Kind = "inocua" | "priv" | "sens" | "sens-np";

interface Instr {
  id: string;
  name: string;
  kind: Kind;
  x86?: Kind; // where it sits on classic x86 when it differs
  what: string;
  at: { a: [number, number]; b: [number, number] };
}

// Positions: a = virtualizable ISA (sensitive inside privileged), b = classic x86 (sensitive sticks out).
const INSTR: Instr[] = [
  { id: "add", name: "ADD r1, r2", kind: "inocua", what: "Suma dos registros. No toca el estado del sistema: se ejecuta directamente, sin hipervisor.", at: { a: [70, 70], b: [70, 70] } },
  { id: "mov", name: "MOV r1, [x]", kind: "inocua", what: "Lee memoria del propio proceso. Inocua: ejecución directa.", at: { a: [80, 250], b: [80, 250] } },
  { id: "hlt", name: "HLT", kind: "sens", what: "Detiene la CPU (sensible de control). Es privilegiada: en modo usuario provoca un trap y el hipervisor aprovecha para planificar otra MV.", at: { a: [300, 148], b: [300, 150] } },
  { id: "cr3", name: "MOV CR3 (PTBR)", kind: "sens", what: "Cambia la tabla de páginas: sensible de control y privilegiada. Trap → el hipervisor emula el cambio de mapa de memoria.", at: { a: [250, 180], b: [318, 182] } },
  { id: "io", name: "IN / OUT", kind: "sens", what: "Habla con los controladores de E/S. Privilegiada: trap → el hipervisor emula el dispositivo.", at: { a: [245, 212], b: [300, 214] } },
  { id: "iret", name: "IRET", kind: "sens", what: "Vuelve de kernel a usuario (cambia de modo). Privilegiada: el hipervisor emula el cambio de modo virtual.", at: { a: [355, 180], b: [400, 150] } },
  {
    id: "popf",
    name: "POPF",
    kind: "sens",
    x86: "sens-np",
    what: "Restaura los flags, incluido el de interrupciones (sensible). En x86 NO es privilegiada: en modo usuario ignora en silencio el cambio de IF, sin trap. El guest cree que ha deshabilitado interrupciones y no es así.",
    at: { a: [340, 212], b: [472, 160] },
  },
  {
    id: "sgdt",
    name: "SGDT / SIDT",
    kind: "sens",
    x86: "sens-np",
    what: "Lee la dirección de tablas del sistema (sensible de comportamiento). En x86 se ejecuta en modo usuario sin trap: el guest ve las tablas reales del hipervisor y se rompe la equivalencia.",
    at: { a: [300, 242], b: [474, 206] },
  },
];

const KIND_TEXT: Record<Kind, string> = {
  inocua: "Inocua",
  priv: "Privilegiada",
  sens: "Sensible y privilegiada",
  "sens-np": "Sensible pero NO privilegiada",
};

/** The two sets of Popek & Goldberg: when sensitive ⊆ privileged, every sensitive instruction traps. */
export function PopekSetsDiagram() {
  const [x86, setX86] = React.useState(false);
  const [pick, setPick] = React.useState("popf");
  const sel = INSTR.find((i) => i.id === pick)!;
  const kindOf = (i: Instr) => (x86 && i.x86 ? i.x86 : i.kind);
  const k = kindOf(sel);
  const traps = k === "sens" || k === "priv";
  const [flash, setFlash] = React.useState<"" | "priv" | "sens">("");
  useShow("popek", (key) => {
    if (key === "x86") (setX86(true), setPick("popf"));
    if (key === "ok") setX86(false);
    if (key === "priv") (setPick("hlt"), setFlash("priv"));
    if (key === "sens") (setPick("cr3"), setFlash("sens"));
    window.setTimeout(() => setFlash(""), 1500);
  });
  return (
    <Diagram
      ns="popek"
      title="Sensibles ⊆ privilegiadas"
      kicker="Teorema 1"
      label="Diagrama de conjuntos: las instrucciones privilegiadas en un círculo y las sensibles en otro. En una máquina virtualizable las sensibles quedan dentro de las privilegiadas; en el x86 clásico algunas sensibles quedan fuera."
      viewBox="0 0 560 300"
      controls={
        <Choice
          label="Arquitectura"
          value={x86 ? "x86" : "ok"}
          options={[
            { value: "ok", text: "Virtualizable (clásica)" },
            { value: "x86", text: "x86 clásico (IA-32)" },
          ]}
          onChange={(v) => setX86(v === "x86")}
        />
      }
      note={
        <>
          <b>{sel.name}</b> · {KIND_TEXT[k]}. {sel.what}{" "}
          {k === "inocua" ? null : traps ? <b className="ok-text">Genera trap → trap & emulate funciona.</b> : <b className="bad-text">No genera trap → trap & emulate falla.</b>}
          <br />
          {x86 ? "Hay sensibles fuera de las privilegiadas: no se cumple el teorema 1. Solución: traducción binaria, implementación híbrida o soporte hardware (VT-x / AMD-V)." : "Todas las sensibles están dentro de las privilegiadas: se cumple el teorema 1 y basta con trap & emulate."}
        </>
      }
    >
      <rect className="pg-all" x={8} y={8} width={544} height={284} rx={18} />
      <text className="dg-kick" x={24} y={30}>
        Todas las instrucciones · inocuas fuera de los círculos
      </text>
      <ellipse className="pg-priv" data-flash={flash === "priv" ? "" : undefined} cx={280} cy={168} rx={150} ry={110} />
      <text className="dg-t pg-priv-t" x={280} y={78} textAnchor="middle">
        Privilegiadas
      </text>
      <ellipse className="pg-sens" data-flash={flash === "sens" ? "" : undefined} cx={x86 ? 390 : 300} cy={184} rx={x86 ? 145 : 118} ry={x86 ? 84 : 80} />
      <text className="dg-t pg-sens-t" x={x86 ? 470 : 300} y={x86 ? 96 : 120} textAnchor="middle">
        Sensibles
      </text>
      {x86 ? (
        <text className="dg-s bad-text" x={470} y={284} textAnchor="middle">
          ↑ sensibles sin trap
        </text>
      ) : null}
      {INSTR.map((i) => {
        const [x, y] = x86 ? i.at.b : i.at.a;
        const kk = kindOf(i);
        const w = i.name.length * 6.6 + 18;
        return (
          <g key={i.id} className="pg-chip" data-kind={kk} data-on={i.id === pick ? "" : undefined} style={{ transform: `translate(${x}px, ${y}px)` }} role="button" tabIndex={0} onClick={() => setPick(i.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setPick(i.id)}>
            <rect x={-w / 2} y={-11} width={w} height={22} rx={11} />
            <text x={0} y={4} textAnchor="middle">
              {i.name}
            </text>
          </g>
        );
      })}
    </Diagram>
  );
}

const P = { 1: "Equivalencia", 2: "Control de recursos", 3: "Eficiencia" } as const;

/** The professor's vCPU table: which technique you end up with, and which Popek & Goldberg properties survive. */
export function VcpuMatrix() {
  const [same, setSame] = React.useState(true);
  const [t1, setT1] = React.useState(true);
  const [para, setPara] = React.useState(false);
  useShow("vcpu", (key) => {
    setSame(key !== "emu");
    setT1(key !== "t3");
    setPara(key === "para");
  });
  const row = !same ? "emu" : t1 ? "t1" : "t3";
  const col = !same ? "full" : para ? "para" : "full";
  const cell = (r: string, c: string) => r === row && c === col;
  const kept: Record<string, (1 | 2 | 3)[]> = { emu: [1, 2], t3: [1, 2, 3], t1: [1, 2, 3] };
  const props = col === "para" ? [2, 3] : kept[row];
  const tech = !same ? "Emulación" : para ? "Paravirtualización" : t1 ? "Trap & emulate" : "Traducción binaria (BT) / híbrida";
  const example = !same
    ? "QEMU sin KVM ejecutando una MV ARM en un PC x86 (motor TCG)."
    : para
      ? "Xen con guests paravirtualizados (kernel modificado con hypercalls); drivers virtio en QEMU."
      : t1
        ? "QEMU/KVM con VT-x o AMD-V: el hardware hace que todo lo sensible provoque un exit."
        : "VMware Workstation en x86 antes de VT-x: BT para el modo kernel del guest y ejecución directa para el usuario.";
  return (
    <figure className="dg vm-matrix reveal" data-ns="vcpu">
      <figcaption className="dg-head">
        <span className="dg-kicker">Hoja vCPU</span>
        <strong>La matriz de la CPU virtual</strong>
      </figcaption>
      <div className="controls">
        <Choice label="¿CPU virtual = real?" value={same ? "si" : "no"} options={[{ value: "si", text: "V = R" }, { value: "no", text: "V ≠ R" }]} onChange={(v) => setSame(v === "si")} />
        {same ? (
          <Choice label="¿Sensibles ⊆ privilegiadas?" value={t1 ? "t1" : "t3"} options={[{ value: "t1", text: "Todas (T1)" }, { value: "t3", text: "Solo las de usuario (T3)" }]} onChange={(v) => setT1(v === "t1")} />
        ) : null}
        {same ? <Choice label="¿Puedes modificar el guest?" value={para ? "si" : "no"} options={[{ value: "no", text: "No" }, { value: "si", text: "Sí" }]} onChange={(v) => setPara(v === "si")} /> : null}
      </div>
      <div className="vm-scroll">
        <table className="vm-table">
          <thead>
            <tr>
              <th colSpan={2} />
              <th data-on={col === "full" ? "" : undefined}>
                Full virtualization
                <span className="vm-props">① + ② + ③</span>
              </th>
              <th data-on={col === "para" ? "" : undefined}>
                Paravirtualization
                <span className="vm-props">② + ③</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>—</th>
              <th className="vm-vr">V ≠ R</th>
              <td data-on={cell("emu", "full") ? "" : undefined}>
                Emulación <span className="vm-lost">③ ✗</span>
              </td>
              <td className="vm-empty">—</td>
            </tr>
            <tr>
              <th>
                P&amp;G Teorema 3<small>virt. híbrida</small>
              </th>
              <th className="vm-vr" rowSpan={2}>
                V = R
              </th>
              <td data-on={cell("t3", "full") ? "" : undefined}>Binary Translation (BT)</td>
              <td data-on={cell("t3", "para") ? "" : undefined}>Paravirtualization</td>
            </tr>
            <tr>
              <th>
                P&amp;G Teorema 1<small>virt. estricta</small>
              </th>
              <td data-on={cell("t1", "full") ? "" : undefined}>
                <b>Trap &amp; Emulate</b>
              </td>
              <td data-on={cell("t1", "para") ? "" : undefined}>Paravirtualization</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="dg-note">
        <b>{tech}.</b> Conserva:{" "}
        {([1, 2, 3] as const).map((n) => (
          <span key={n} className="vm-badge" data-on={props.includes(n) ? "" : undefined}>
            {["①", "②", "③"][n - 1]} {P[n]}
          </span>
        ))}
        <br />
        Ejemplo: {example}
      </div>
    </figure>
  );
}
