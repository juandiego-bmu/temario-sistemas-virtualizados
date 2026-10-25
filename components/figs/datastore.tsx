"use client";

import * as React from "react";
import * as k from "../iso/iso-kit";
import { Dots, FaceText, Line, Solid, Wire } from "../iso/react/draw";
import { Slider, useShow } from "../diagrams/kit";
import { Bench, Choice, Figure, fit } from "./common";

const GB = 0.62; // world units per GB of height
const CAP = 100;
const DS = { x: 70, y: 0, r: 46 };
const BENCH: k.Plan = { x: -170, y: -118, w: 300, d: 236, r: 10 };
const P = fit([...k.boxCorners(BENCH, -12, 0), [DS.x, DS.y, 150 * GB + 16], [-140, -100, 80]], { azimuth: 40, pad: 20 });

type Policy = "mix" | "thick" | "thin";
const DISKS = [
  { name: "MV1", size: 20, y: -78 },
  { name: "MV2", size: 40, y: 0 },
  { name: "MV3", size: 80, y: 78 },
];

/** A datastore cylinder filled by three virtual disks; a ghost shows what thin provisioning promised. */
export function DatastoreFigure() {
  const [policy, setPolicy] = React.useState<Policy>("mix");
  const [w2, setW2] = React.useState(15);
  const [w3, setW3] = React.useState(30);
  useShow("ds", (key) => {
    if (key === "thick" || key === "thin" || key === "mix") setPolicy(key);
    if (key === "full") (setPolicy("mix"), setW2(40), setW3(70));
  });
  const thin = (i: number) => (policy === "thin" ? true : policy === "thick" ? false : i > 0);
  const written = [12, w2, w3];
  // Thick disks reserve their full size at creation; under all-thick, MV3 no longer fits.
  let used = 0;
  const alloc = DISKS.map((d, i) => {
    const want = thin(i) ? Math.min(written[i], d.size) : d.size;
    const ok = thin(i) || used + want <= CAP;
    const a = ok ? Math.min(want, Math.max(0, CAP - used)) : 0;
    used += a;
    return { a, ok, want };
  });
  const promised = DISKS.reduce((s, d, i) => s + (alloc[i].ok ? d.size : 0), 0);
  const full = alloc.some((x, i) => thin(i) && x.a < Math.min(written[i], DISKS[i].size));
  const blocked = alloc.some((x) => !x.ok);

  const bands: { z: number; h: number; i: number }[] = [];
  let z = 0;
  alloc.forEach((x, i) => {
    if (x.a > 0) bands.push({ z, h: x.a * GB, i });
    z += x.a * GB;
  });
  const capZ = CAP * GB;

  let say = `Ocupado ${Math.round(used)} / ${CAP} GB · prometido ${promised} GB`;
  if (blocked) say = "No se puede crear el disco de MV3: thick no permite overcommit";
  else if (full) say = "¡Datastore lleno! Las MVs thin no pueden escribir más";

  return (
    <Figure
      ns="ds"
      fig="Fig 2"
      title="Datastore: thin vs thick"
      hint="Las MVs escriben datos"
      mode={policy === "mix" ? "Mezcla: MV1 thick, MV2 y MV3 thin" : policy === "thick" ? "Todo thick" : "Todo thin"}
      readout={say}
      label="Tres discos virtuales sobre una bancada conectados a un datastore cilíndrico de 100 GB. Cada disco muestra su tamaño prometido con un contorno a trazos y lo ocupado en relieve; el datastore apila lo que ocupa cada uno."
      keys={[
        { mark: "dashed", label: "Tamaño prometido (provisionado)" },
        { mark: "raised", label: "Espacio realmente ocupado" },
        { mark: "red", label: "Over-provisioning: lo prometido que no cabe" },
      ]}
      caption={
        <>
          Como en el ejemplo de las transparencias: un datastore de 100 GB con discos de 20, 40 y 80 GB. <b>Thick</b> reserva su tamaño entero al crearse (nunca hay overcommit, pero puede no caber). <b>Thin</b> solo ocupa lo escrito: caben los tres, se han prometido 140 GB y, si los datos crecen, el datastore se llena.
        </>
      }
      controls={
        <>
          <Choice
            label="Discos"
            value={policy}
            options={[
              { value: "mix", text: "Mezcla" },
              { value: "thick", text: "Todo thick" },
              { value: "thin", text: "Todo thin" },
            ]}
            onChange={setPolicy}
          />
          <Slider label="Datos de MV2" value={w2} min={0} max={40} onChange={setW2} format={(v) => `${v} GB`} />
          <Slider label="Datos de MV3" value={w3} min={0} max={80} onChange={setW3} format={(v) => `${v} GB`} />
        </>
      }
    >
      <Bench plan={BENCH} P={P} h={10} />
      {DISKS.map((d, i) => {
        const x = -110;
        const plan: k.Plan = { x: x - 30, y: d.y - 30, w: 60, d: 60, r: 6 };
        const r = 22;
        const fullH = d.size * GB;
        const h = alloc[i].a * GB;
        const t = thin(i);
        return (
          <g key={d.name}>
            <Solid paths={k.slabOf(plan, 0, 10, P, 6, 0.6)} tone="lo" />
            <FaceText transform={k.sideMatrix([plan.x + plan.w, d.y + 26], 7.6, P, "right")} size={6.4} tone="hi">
              {`${d.name} ${t ? "THIN" : "THICK"}`}
            </FaceText>
            <Line d={k.cylinder(x, d.y, r, 10, fullH, P, 40).outline} tone={alloc[i].ok ? "mid" : "red"} dashed />
            {h > 0.5 ? <Solid className={`ds-band b${i}`} paths={k.cylinder(x, d.y, r - 1, 10, h, P, 40, 0.6)} tone="hi" inner={<Line d={k.sideArc(x, d.y, r - 1, 10 + h / 2, P)} tone="faint" />} /> : null}
            {!alloc[i].ok ? <Line d={k.segment([x - 14, d.y, 33], [x + 14, d.y, 53], P) + k.segment([x + 14, d.y, 33], [x - 14, d.y, 53], P)} tone="red" /> : null}
            <Wire from={k.iso([x + 26, d.y, 4], P)} via={[k.iso([DS.x - 60, d.y * 0.4, 4], P)]} to={k.iso([DS.x - DS.r, 0, 4], P)} tone={i === 2 && full ? "red" : "lo"} />
          </g>
        );
      })}
      <path className="iso-halo" d={k.cylinder(DS.x, DS.y, DS.r + 4, 0, 4, P, 56).fill} />
      <Solid paths={k.cylinder(DS.x, DS.y, DS.r + 4, 0, 5, P, 56, 0.8)} tone="lo" />
      <Line d={k.cylinder(DS.x, DS.y, DS.r, 5, capZ, P, 64).outline} tone="hi" />
      {bands.map((b) => (
        <Solid key={b.i} className={`ds-band b${b.i}`} paths={k.cylinder(DS.x, DS.y, DS.r - 1, 5 + b.z, b.h, P, 64, 0.5)} tone="hi" lit={b.i === 0 && !thin(0)} inner={<Line d={k.sideArc(DS.x, DS.y, DS.r - 1, 5 + b.z + b.h / 2, P)} tone="faint" />} />
      ))}
      <Line d={Array.from({ length: 11 }, (_, j) => k.sideArc(DS.x, DS.y, DS.r, 5 + j * 10 * GB, P, 32)).join("")} tone="faint" />
      {promised > CAP ? <Line d={k.cylinder(DS.x, DS.y, DS.r, 5 + capZ, (promised - CAP) * GB, P, 64).outline} tone="red" dashed /> : null}
      <Dots points={k.pointsAt([[DS.x + DS.r * 0.7, DS.y + DS.r * 0.7, 3]], P)} size={1.2} tone={full ? "hi" : "mid"} pulse={full} />
      <FaceText transform={k.topMatrix([DS.x - 24, DS.y + 6], 5 + capZ, P, "y")} size={7} tone="mid">
        100 GB
      </FaceText>
    </Figure>
  );
}
