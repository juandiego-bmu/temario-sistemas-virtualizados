"use client";

import * as React from "react";
import * as k from "../iso/iso-kit";
import { Dots, FaceText, Line, Solid } from "../iso/react/draw";
import { Bench, Choice, Figure, fit, useTicker } from "./common";

type Mode = "t2" | "t1" | "dom0";
type Part = "vm" | "hyp" | "host" | "dom0" | "hw";

const BASE: k.Plan = { x: -122, y: -102, w: 244, d: 204, r: 10 };
const HW: k.Plan = { x: -100, y: -80, w: 200, d: 160, r: 6 };
const HW_H = 18;
const P = fit([...k.boxCorners(BASE, -15, 0), ...k.boxCorners(HW, 72, 72)], { azimuth: 38 });

const front = (plan: k.Plan) => plan.y + plan.d;

// A rectangle drawn flat on the +y face (the left-front face) between two x and two z.
const faceRect = (x0: number, x1: number, y: number, z0: number, z1: number) =>
  k.pathOf([k.iso([x0, y, z0], P), k.iso([x1, y, z0], P), k.iso([x1, y, z1], P), k.iso([x0, y, z1], P)], true);

const STEPS: Record<Mode, { text: string; part: Part; at: k.Point3 }[]> = {
  t2: [
    { text: "1 · La app del guest escribe en un fichero", part: "vm", at: [1, 54, 66] },
    { text: "2 · El driver del guest hace OUT → trap al módulo kvm", part: "host", at: [-40, 72, 28] },
    { text: "3 · El hipervisor (QEMU) emula el controlador de disco", part: "hyp", at: [-40, 62, 40] },
    { text: "4 · Lo traduce a escribir en un fichero del SO host", part: "host", at: [-62, 72, 24] },
    { text: "5 · Los drivers del host escriben en el disco real", part: "hw", at: [-65, 80, 10] },
  ],
  t1: [
    { text: "1 · La app del guest escribe en un fichero", part: "vm", at: [7, 56, 54] },
    { text: "2 · El driver del guest hace OUT → trap / exit", part: "hyp", at: [0, 72, 28] },
    { text: "3 · El hipervisor emula el controlador de disco", part: "hyp", at: [-40, 72, 25] },
    { text: "4 · Sus propios drivers escriben en el disco real", part: "hw", at: [-65, 80, 10] },
  ],
  dom0: [
    { text: "1 · La app de un DomU escribe en un fichero", part: "vm", at: [7, 56, 54] },
    { text: "2 · El driver del DomU pasa la E/S al hipervisor", part: "hyp", at: [0, 72, 26] },
    { text: "3 · El hipervisor la reenvía al Dom0", part: "hyp", at: [-58, 72, 26] },
    { text: "4 · El Dom0 (Linux) la emula con sus drivers nativos", part: "dom0", at: [-59, 56, 46] },
    { text: "5 · Los drivers del Dom0 acceden al disco real", part: "hw", at: [-65, 80, 10] },
  ],
};

const MODE_NAME: Record<Mode, string> = { t2: "Tipo 2 · hosted", t1: "Tipo 1 · native / bare metal", dom0: "Tipo 1 con dominio 0" };
const EXAMPLES: Record<Mode, string> = { t2: "VirtualBox · VMware Workstation · QEMU/KVM", t1: "VMware ESXi", dom0: "Xen · Microsoft Hyper-V" };

/** A virtual machine: virtual hardware tray, guest OS slab and two app blocks on top. */
function Vm({ plan, z, label, lit, special }: { plan: k.Plan; z: number; label: string; lit: boolean; special?: boolean }) {
  const os = k.insetPlan(plan, 3);
  const apps: k.Plan[] = [
    { x: os.x + 6, y: os.y + 8, w: os.w - 12, d: os.d * 0.36, r: 2 },
    { x: os.x + 6, y: os.y + os.d * 0.5, w: os.w - 12, d: os.d * 0.36, r: 2 },
  ];
  const y = front(os);
  return (
    <g>
      <path className="iso-halo" d={k.haloOf(plan, z, 4, P)} />
      <Solid paths={k.slabOf(plan, z, 6, P, 3, 0.5)} tone="lo" inner={<Line d={k.sideSeam(plan, z + 3, P, 3)} tone="faint" />} />
      <Solid paths={k.slabOf(os, z + 6, 10, P, 3, 0.6)} tone={special ? "hi" : "mid"} lit={lit} />
      <FaceText transform={k.sideMatrix([os.x + 5, y], z + 13, P, "left")} size={6} tone={lit ? "hi" : "mid"}>
        {label}
      </FaceText>
      {special ? (
        <>
          <Line d={faceRect(os.x + os.w - 18, os.x + os.w - 6, y, z + 8, z + 13)} tone="mid" />
          <Dots points={k.pointsAt([[os.x + os.w - 12, y, z + 10.5]], P)} size={0.9} tone="hi" />
        </>
      ) : null}
      {apps.map((a, i) => (
        <Solid key={i} paths={k.slabOf(a, z + 16, 7 - i * 2, P, 2, 0.4)} tone="hi" lit={lit && i === 1} />
      ))}
    </g>
  );
}

function Hardware({ lit }: { lit: boolean }) {
  const y = front(HW);
  const bays = [-84, -46, -8];
  const vents = Array.from({ length: 9 }, (_, i) => 40 + i * 6);
  return (
    <g>
      <Solid paths={k.slabOf(HW, 0, HW_H, P, 6, 1)} tone="mid" inner={<Line d={k.sideSeam(HW, 3, P, 6)} tone="faint" />} />
      {bays.map((x, i) => (
        <g key={x}>
          <path className="stk-bay" data-on={lit && i === 0 ? "" : undefined} d={faceRect(x, x + 32, y, 6, 15)} />
          <Line d={faceRect(x, x + 32, y, 6, 15)} tone={lit && i === 0 ? "lit" : "lo"} />
          <Dots points={k.pointsAt([[x + 27, y, 10.5]], P)} size={0.8} tone={lit && i === 0 ? "hi" : "lo"} pulse={lit && i === 0} />
        </g>
      ))}
      <Line d={vents.map((x) => k.segment([x, y, 7], [x, y, 14], P)).join("")} tone="lo" />
      <Line d={k.sideRing([88, y, 10.5], 2.4, "y", P)} tone="mid" />
      <Line d={Array.from({ length: 6 }, (_, i) => k.segment([HW.x + HW.w, -60 + i * 12, 8], [HW.x + HW.w, -52 + i * 12, 8], P)).join("")} tone="lo" />
      <FaceText transform={k.sideMatrix([HW.x + HW.w, 70], 15, P, "right")} size={6.4} tone="mid">
        HARDWARE REAL
      </FaceText>
    </g>
  );
}

/** Three hypervisor architectures built as one physical stack; a lit dot follows a disk write down the layers. */
export function StackFigure() {
  const [mode, setMode] = React.useState<Mode>("t2");
  const { ref, step, setStep } = useTicker(1500);
  const steps = STEPS[mode];
  const s = steps[step % steps.length];
  const on = (part: Part) => s.part === part;
  const path = k.pathOf(steps.map((x) => k.iso(x.at, P)));
  const dot = k.iso(s.at, P);

  const hostPlan: k.Plan = { x: -92, y: -72, w: 184, d: 144, r: 5 };
  let body: React.ReactNode;
  if (mode === "t2") {
    const hyp: k.Plan = { x: -86, y: -62, w: 116, d: 124, r: 4 };
    const vms: k.Plan[] = [
      { x: -80, y: -54, w: 50, d: 108, r: 3 },
      { x: -24, y: -54, w: 50, d: 108, r: 3 },
    ];
    const apps: [k.Plan, number][] = [
      [{ x: 44, y: -60, w: 36, d: 40, r: 3 }, 22],
      [{ x: 44, y: 8, w: 36, d: 40, r: 3 }, 15],
    ];
    body = (
      <>
        <Solid paths={k.slabOf(hostPlan, HW_H, 14, P, 5, 0.8)} tone="mid" lit={on("host")} />
        <FaceText transform={k.sideMatrix([hostPlan.x + 8, front(hostPlan)], HW_H + 10, P, "left")} size={6.4} tone={on("host") ? "hi" : "mid"}>
          SO HOST · drivers · módulo kvm
        </FaceText>
        {apps.map(([a, h], i) => (
          <g key={i}>
            <Solid paths={k.slabOf(a, HW_H + 14, h, P, 3, 0.6)} tone="mid" />
            <Line d={k.planOutline(k.insetPlan(a, 5), HW_H + 14 + h, P, 3)} tone="faint" />
          </g>
        ))}
        <Solid paths={k.slabOf(hyp, HW_H + 14, 12, P, 4, 0.8)} tone="hi" lit={on("hyp")} />
        <FaceText transform={k.sideMatrix([hyp.x + 6, front(hyp)], HW_H + 23, P, "left")} size={6} tone={on("hyp") ? "hi" : "mid"}>
          HIPERVISOR (app)
        </FaceText>
        {vms.map((v, i) => (
          <Vm key={i} plan={v} z={HW_H + 26} label={`MV ${i + 1}`} lit={on("vm") && i === 1} />
        ))}
      </>
    );
  } else {
    const vms: k.Plan[] = [
      { x: -84, y: -56, w: 50, d: 112, r: 3 },
      { x: -26, y: -56, w: 50, d: 112, r: 3 },
      { x: 32, y: -56, w: 50, d: 112, r: 3 },
    ];
    body = (
      <>
        <Solid paths={k.slabOf(hostPlan, HW_H, 14, P, 5, 0.8)} tone="hi" lit={on("hyp")} />
        <FaceText transform={k.sideMatrix([hostPlan.x + 8, front(hostPlan)], HW_H + 10, P, "left")} size={6.4} tone={on("hyp") ? "hi" : "mid"}>
          {mode === "t1" ? "HIPERVISOR TIPO 1 · drivers propios" : "HIPERVISOR TIPO 1 · sin drivers"}
        </FaceText>
        {vms.map((v, i) =>
          mode === "dom0" && i === 0 ? (
            <Vm key={i} plan={v} z={HW_H + 14} label="Dom0" lit={on("dom0")} special />
          ) : (
            <Vm key={i} plan={v} z={HW_H + 14} label={mode === "dom0" ? `DomU${i}` : `MV ${i + 1}`} lit={on("vm") && i === 1} />
          ),
        )}
      </>
    );
  }

  return (
    <Figure
      boxRef={ref}
      fig="Fig 1"
      title="Tipos de hipervisor"
      hint="Una escritura en disco baja por las capas"
      mode={MODE_NAME[mode]}
      readout={s.text}
      label="Un servidor construido como una pila de capas sobre una bancada: hardware real abajo, después el sistema operativo host o el hipervisor, y encima las máquinas virtuales. Un punto iluminado recorre el camino de una escritura en disco."
      keys={[
        { mark: "lit", label: "Capa que trabaja en este paso" },
        { mark: "dashed", label: "Camino de la E/S" },
      ]}
      caption={
        <>
          <b>{MODE_NAME[mode]}</b> ({EXAMPLES[mode]}).{" "}
          {mode === "t2"
            ? "El hipervisor es una aplicación más del SO host: un módulo en el kernel del host intercepta lo privilegiado y la E/S acaba usando los servicios y drivers del host."
            : mode === "t1"
              ? "El hipervisor es un kernel propio sin SO debajo y controla el hardware con sus propios drivers."
              : "El hipervisor no tiene drivers: la E/S de los DomU la resuelve una MV privilegiada (Dom0 o partición padre) con los drivers de un SO existente."}
        </>
      }
      controls={
        <Choice
          label="Tipo"
          value={mode}
          options={[
            { value: "t2", text: "Tipo 2 (hosted)" },
            { value: "t1", text: "Tipo 1 (bare metal)" },
            { value: "dom0", text: "Tipo 1 + Dom0" },
          ]}
          onChange={(v) => {
            setMode(v);
            setStep(0);
          }}
        />
      }
    >
      <Bench plan={BASE} P={P} h={10} />
      <Hardware lit={on("hw")} />
      {body}
      <Line d={path} tone="lit" dashed />
      <circle className="stk-dot" cx={0} cy={0} r={4.2} style={{ transform: `translate(${dot[0].toFixed(1)}px, ${dot[1].toFixed(1)}px)` }} />
    </Figure>
  );
}
