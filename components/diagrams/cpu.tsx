"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, Steps, useShow, useSteps } from "./kit";

/* ------------------------------------------------------------------ */
/* Emulator: the interpreter loop of the slides, one guest instruction at a time */

type Lane = 0 | 1 | 2 | 3;
interface Seg {
  lane: Lane;
  via?: string;
  cost?: "trap" | "exit";
  text: string;
}

const SEQ: Record<"real" | "te" | "hw", Seg[]> = {
  real: [
    { lane: 0, text: "El programa de usuario se ejecuta en modo usuario." },
    { lane: 1, via: "INT", text: "INT: el SO real entra en modo kernel (privilegiado)." },
    { lane: 3, via: "I/O", text: "El kernel hace IN/OUT directamente sobre el controlador." },
    { lane: 1, text: "El kernel termina la llamada al sistema." },
    { lane: 0, via: "IRET", text: "IRET: vuelta a modo usuario. Ninguna intervención de un hipervisor." },
  ],
  te: [
    { lane: 0, text: "El programa de usuario del guest se ejecuta directamente." },
    { lane: 2, via: "INT", cost: "trap", text: "INT en modo usuario real → TRAP. El hipervisor emula el paso a modo kernel del guest." },
    { lane: 1, text: "El kernel del guest se ejecuta desprivilegiado (en modo usuario real)." },
    { lane: 2, via: "I/O", cost: "trap", text: "IN/OUT es privilegiada → TRAP. El hipervisor emula el controlador de E/S…" },
    { lane: 3, text: "…y hace la E/S real si hace falta." },
    { lane: 2, text: "Termina la emulación." },
    { lane: 1, text: "Vuelve al kernel del guest." },
    { lane: 2, via: "IRET", cost: "trap", text: "IRET también es privilegiada → TRAP: el hipervisor emula la vuelta a modo usuario." },
    { lane: 0, text: "El programa sigue. Han hecho falta 3 traps." },
  ],
  hw: [
    { lane: 0, text: "El programa de usuario del guest se ejecuta (modo guest)." },
    { lane: 1, via: "INT", text: "INT sin exit: el guest entra en su kernel en modo pseudoprivilegiado." },
    { lane: 2, via: "I/O", cost: "exit", text: "IN/OUT → EXIT. El hipervisor lee el diagnóstico del VMCB (puerto, tamaño, dirección) y emula el controlador." },
    { lane: 3, text: "E/S real." },
    { lane: 2, text: "El hipervisor ejecuta vmrun." },
    { lane: 1, via: "vmrun", text: "vmrun: vuelta al kernel del guest con el estado del VMCB." },
    { lane: 0, via: "IRET", text: "IRET sin exit. Ha bastado 1 exit." },
  ],
};

export function TrapTimeline() {
  const [mode, setMode] = React.useState<keyof typeof SEQ>("te");
  const seq = SEQ[mode];
  const { step, playing, play, go } = useSteps(seq.length, 1500);
  useShow("trap", (key) => {
    if (!(key in SEQ)) return;
    setMode(key as keyof typeof SEQ);
    go(0);
    play();
  });
  const lanes = ["Usuario", mode === "real" ? "Kernel (PRIV)" : "Kernel guest", "Hipervisor", "Hardware"];
  const X0 = 112;
  const W = (550 - X0) / seq.length;
  const mid = (l: number) => 26 + l * 46;
  const total = seq.filter((x) => x.cost).length;
  const done = seq.slice(0, step + 1).filter((x) => x.cost).length;
  const unit = mode === "hw" ? "exits" : "traps";
  return (
    <Diagram
      ns="trap"
      title="Una llamada al sistema con una E/S"
      kicker="Trap & emulate vs hardware"
      label="Línea temporal con cuatro carriles: usuario, kernel del guest, hipervisor y hardware. Con trap & emulate la llamada provoca tres traps; con soporte hardware, un solo exit."
      viewBox="0 0 560 190"
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
        <>
          <p className="tt-sum">
            {mode === "real" ? (
              <>Sin virtualizar el kernel corre privilegiado y habla con el hardware: <b>0 intervenciones</b>.</>
            ) : (
              <>
                Llevamos <b>{done} de {total} {unit}</b>. {mode === "te" ? "El guest corre desprivilegiado: INT, IN/OUT e IRET provocan un trap cada una." : "Con el modo guest, solo la E/S sale al hipervisor."}
              </>
            )}{" "}
            Pulsa un paso para ir a él.
          </p>
          <ol className="tt-list">
            {seq.map((x, i) => (
              <li key={i} data-state={i < step ? "past" : i === step ? "now" : undefined} data-cost={x.cost}>
                <button type="button" onClick={() => go(i)}>
                  {x.via ? (
                    <span className="tt-tag">
                      {x.via}
                      {x.cost ? ` → ${x.cost.toUpperCase()}` : ""}
                    </span>
                  ) : null}
                  {x.text}
                </button>
              </li>
            ))}
          </ol>
        </>
      }
    >
      {lanes.map((l, i) => (
        <g key={i} className="tt-lane" data-off={mode === "real" && i === 2 ? "" : undefined}>
          <rect x={0} y={mid(i) - 20} width={560} height={40} rx={6} />
          <text className="dg-s" x={10} y={mid(i) + 4}>
            {l}
          </text>
        </g>
      ))}
      {seq.map((x, i) => {
        const cx = X0 + i * W;
        const prev = i ? seq[i - 1] : null;
        const state = i < step ? "past" : i === step ? "now" : "next";
        const w = x.via ? x.via.length * 6.4 + 14 : 0;
        return (
          <g key={i} className="tt-seg" data-state={state} data-cost={x.cost}>
            {prev ? <path className="tt-link" d={`M${cx} ${mid(prev.lane)} L${cx} ${mid(x.lane)}`} /> : null}
            <rect className="tt-block" x={cx + 3} y={mid(x.lane) - 7} width={W - 6} height={14} rx={4} />
            {x.via && prev ? (
              <g className="tt-pill">
                <rect x={cx - w / 2} y={(mid(prev.lane) + mid(x.lane)) / 2 - 8} width={w} height={16} rx={8} />
                <text x={cx} y={(mid(prev.lane) + mid(x.lane)) / 2 + 3.5} textAnchor="middle">
                  {x.via}
                </text>
              </g>
            ) : null}
          </g>
        );
      })}
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* Hybrid: trap & emulate for guest user mode, binary translation for guest kernel mode */
