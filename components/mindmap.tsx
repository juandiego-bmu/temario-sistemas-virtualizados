"use client";

import * as React from "react";
import { useMounted } from "./figs/common";
import { topic, type TopicId } from "./topics";

interface Branch {
  title: string;
  hue: number;
  leaves: { text: string; to: TopicId }[];
}

const BRANCHES: Branch[] = [
  {
    title: "Conceptos",
    hue: topic("virtualizar").hue,
    leaves: [
      { text: "Host · guest · MV · VMM", to: "virtualizar" },
      { text: "Equivalencia salvo tiempos", to: "virtualizar" },
      { text: "Dispatcher · allocator · intérprete", to: "hipervisor" },
    ],
  },
  {
    title: "Popek y Goldberg",
    hue: topic("popek").hue,
    leaves: [
      { text: "Equivalencia · eficiencia · control", to: "popek" },
      { text: "T1: sensibles ⊆ privilegiadas", to: "popek" },
      { text: "T3: híbrida · siempre emulación", to: "popek" },
    ],
  },
  {
    title: "Hipervisores",
    hue: topic("tipos").hue,
    leaves: [
      { text: "Tipo 1 · tipo 2 · Dom0", to: "tipos" },
      { text: "Full vs paravirtualización", to: "tipos" },
    ],
  },
  {
    title: "CPU",
    hue: topic("tecnicas").hue,
    leaves: [
      { text: "Emulación · traducción binaria", to: "tecnicas" },
      { text: "Trap & emulate · híbrida", to: "tecnicas" },
      { text: "VT-x: modo guest · VMCB · vmrun", to: "tecnicas" },
      { text: "Round-robin · HALT · timeout", to: "cpu" },
    ],
  },
  {
    title: "Memoria",
    hue: topic("ram").hue,
    leaves: [
      { text: "Paginación · TLB · fallos", to: "memoria" },
      { text: "ELV → EFV → EFR", to: "ram" },
      { text: "Shadow vs nested · (G+1)(N+1)", to: "ram" },
      { text: "Overcommit · ballooning", to: "ram" },
    ],
  },
  {
    title: "Almacenamiento",
    hue: topic("discos").hue,
    leaves: [
      { text: "LUN · LBA · by-pass vs fichero", to: "discos" },
      { text: "Thin / thick · flat / index", to: "discos" },
      { text: "Snapshots CoW · revert", to: "snapshots" },
      { text: "Full vs linked clones", to: "snapshots" },
    ],
  },
  {
    title: "Red",
    hue: topic("red").hue,
    leaves: [
      { text: "vNIC: e1000 · virtio", to: "red" },
      { text: "Bridged · NAT · host-only", to: "red" },
      { text: "vSwitch · VLAN 802.1q · trunk", to: "red" },
    ],
  },
  {
    title: "Prácticas",
    hue: topic("lab").hue,
    leaves: [
      { text: "qemu-img: clones y snapshots", to: "p1" },
      { text: "qemu-system: -m -smp -kvm", to: "p1" },
      { text: "user + hostfwd · bridge", to: "p2" },
      { text: "Cadena de 3 MVs", to: "lab" },
    ],
  },
];

const CX = 600;
const CY = 300;
const ROWS = [78, 224, 376, 522];

/** A two-sided mind map of the whole first exam; click a branch to focus it, click a leaf to jump. */
export function MindMap() {
  const mounted = useMounted();
  const [focus, setFocus] = React.useState<number | null>(null);
  return (
    <div className="mm-wrap">
      <svg className="mm" viewBox="0 0 1200 600" role="img" aria-label="Mapa mental del primer parcial: en el centro, sistemas virtualizados, con ocho ramas: conceptos, Popek y Goldberg, hipervisores, CPU, memoria, almacenamiento, red y prácticas.">
        {mounted
          ? BRANCHES.map((b, i) => {
              const right = i >= 4;
              const by = ROWS[i % 4];
              const bx = right ? 810 : 390;
              const dim = focus !== null && focus !== i;
              return (
                <g key={b.title} className="mm-branch" data-dim={dim ? "" : undefined} style={{ "--h": b.hue } as React.CSSProperties}>
                  <path className="mm-trunk" d={`M${CX + (right ? 60 : -60)} ${CY}C${CX + (right ? 120 : -120)} ${CY} ${bx + (right ? -80 : 80)} ${by} ${bx} ${by}`} />
                  {b.leaves.map((leaf, j) => {
                    const lx = right ? 960 : 240;
                    const ly = by + (j - (b.leaves.length - 1) / 2) * 30;
                    return (
                      <a key={leaf.text} href={`#${leaf.to}`} className="mm-leaf">
                        <path className="mm-twig" d={`M${bx + (right ? 80 : -80)} ${by}C${(bx + lx) / 2 + (right ? 20 : -20)} ${by} ${(bx + lx) / 2} ${ly} ${lx} ${ly}`} />
                        <circle cx={lx} cy={ly} r={4} />
                        <text x={lx + (right ? 9 : -9)} y={ly + 4} textAnchor={right ? "start" : "end"}>
                          {leaf.text}
                        </text>
                      </a>
                    );
                  })}
                  <g className="mm-node" role="button" tabIndex={0} onClick={() => setFocus(focus === i ? null : i)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFocus(focus === i ? null : i)}>
                    <rect x={bx - 80} y={by - 20} width={160} height={40} rx={20} />
                    <text x={bx} y={by + 5} textAnchor="middle">
                      {b.title}
                    </text>
                  </g>
                </g>
              );
            })
          : null}
        <g className="mm-centre">
          <circle cx={CX} cy={CY} r={66} />
          <text x={CX} y={CY - 6} textAnchor="middle">
            Sistemas
          </text>
          <text x={CX} y={CY + 18} textAnchor="middle">
            virtualizados
          </text>
        </g>
      </svg>
      <p className="mm-hint">Pulsa una rama para destacarla y pulsa una hoja para ir a ese tema.</p>
    </div>
  );
}
