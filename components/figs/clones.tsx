"use client";

import * as React from "react";
import * as k from "../iso/iso-kit";
import { Dots, FaceText, Line, Solid, Wire } from "../iso/react/draw";
import { Slider, useShow } from "../diagrams/kit";
import { Bench, Choice, Figure, fit } from "./common";

const BASE_MB = 303;
const LINK_MB = 0.19;
const BENCH: k.Plan = { x: -150, y: -100, w: 320, d: 200, r: 10 };
const P = fit([...k.boxCorners(BENCH, -12, 0), ...k.boxCorners(BENCH, 66, 66)], { azimuth: 52, pad: 20 });
const BASE = { x: -100, y: 0, r: 30, h: 46 };
const SPOTS: k.Plane[] = [
  [10, -62],
  [70, -62],
  [130, -62],
  [10, 4],
  [70, 4],
  [130, 4],
  [10, 70],
  [70, 70],
  [130, 70],
];

/** A template disk and its clones: full copies stand tall, linked clones are thin and hang off the template. */
export function ClonesFigure() {
  const [n, setN] = React.useState(4);
  const [linked, setLinked] = React.useState(true);
  const [touched, setTouched] = React.useState(false);
  const [boot, setBoot] = React.useState(false);
  useShow("clones", (key) => {
    setLinked(key !== "full");
    setTouched(key === "touch");
    setBoot(key === "boot");
  });
  const space = linked ? BASE_MB + n * LINK_MB : BASE_MB * (n + 1);
  const spots = SPOTS.slice(0, n);
  let say = `${n} clones · disco usado ${space >= 1000 ? `${(space / 1000).toFixed(2)} GB` : `${space.toFixed(1)} MB`}`;
  if (touched && linked) say = "La plantilla ha cambiado: los deltas de los clones ya no encajan";
  else if (boot && linked) say = `Arrancan ${n} clones: todos leen los mismos bloques de la plantilla (aciertos de caché)`;
  return (
    <Figure
      ns="clones"
      fig="Fig 4"
      title="Full clones vs linked clones"
      hint="Crea clones de la plantilla"
      mode={linked ? "Linked clones (diferenciales)" : "Full clones (copias completas)"}
      readout={say}
      label="Un disco plantilla con candado a la izquierda y varios discos clon en una rejilla. Los full clones son copias altas e independientes; los linked clones son discos finos unidos a la plantilla por cables."
      keys={[
        { mark: "lit", label: "Plantilla (template)" },
        { mark: "dotted", label: "Backing file: el clon lee de la plantilla lo que no ha cambiado" },
      ]}
      caption={
        linked ? (
          <>
            <b>Linked clone:</b> <code>qemu-img create -F qcow2 -f qcow2 -b base.qcow2 clon.qcow2</code>. Se crea al instante y pesa ~{LINK_MB} MB (solo guardará lo que el clon escriba). Si arrancan a la vez, leen los mismos bloques de la plantilla: la caché del hipervisor acierta más. Pero <b>no se puede tocar la plantilla</b> sin destruir los clones. Ideal para escritorios virtuales (VDI) con un broker.
          </>
        ) : (
          <>
            <b>Full clone:</b> <code>qemu-img convert -O qcow2 base.qcow2 clon.qcow2</code>. Una copia completa e independiente: tarda en crearse y ocupa {BASE_MB} MB cada una, pero la plantilla se puede cambiar o borrar sin afectar a nadie.
          </>
        )
      }
      controls={
        <>
          <Choice
            label="Tipo"
            value={linked ? "l" : "f"}
            options={[
              { value: "l", text: "Linked" },
              { value: "f", text: "Full" },
            ]}
            onChange={(v) => (setLinked(v === "l"), setTouched(false), setBoot(false))}
          />
          <Slider label="Clones" value={n} min={1} max={9} onChange={(v) => (setN(v), setBoot(false))} />
          <button type="button" className="btn" onClick={() => (setBoot((b) => !b), setTouched(false))} aria-pressed={boot}>
            ⏻ Arrancar todos
          </button>
          <button type="button" className="btn ghost" onClick={() => (setTouched((t) => !t), setBoot(false))} aria-pressed={touched}>
            ✎ Modificar la plantilla
          </button>
        </>
      }
    >
      <Bench plan={BENCH} P={P} h={10} />
      <path className="iso-halo" d={k.cylinder(BASE.x, BASE.y, BASE.r + 3, 0, 4, P, 48).fill} />
      <Solid paths={k.cylinder(BASE.x, BASE.y, BASE.r + 4, 0, 5, P, 48, 0.6)} tone="lo" />
      <Solid paths={k.cylinder(BASE.x, BASE.y, BASE.r, 5, BASE.h, P, 56, 0.8)} tone="hi" lit inner={<Line d={[0.3, 0.6].map((f) => k.sideArc(BASE.x, BASE.y, BASE.r, 5 + BASE.h * f, P)).join("")} tone="faint" />} />
      <Solid paths={k.slabOf({ x: BASE.x - 8, y: BASE.y + BASE.r - 4, w: 16, d: 8, r: 2 }, 5 + BASE.h, 8, P, 2, 0.4)} tone="mid" />
      <Line d={k.sideRing([BASE.x, BASE.y + BASE.r + 4, 5 + BASE.h + 10], 4, "y", P)} tone="mid" />
      <FaceText transform={k.topMatrix([BASE.x - 20, BASE.y - 6], 5 + BASE.h, P)} size={7} tone="hi">
        plantilla
      </FaceText>
      {touched ? <Dots points={k.pointsAt([[BASE.x, BASE.y, 5 + BASE.h + 2]], P)} size={3} tone="hi" pulse /> : null}
      {spots.map(([x, y], i) => {
        const h = linked ? 4 : BASE.h * 0.72;
        const broken = touched && linked;
        return (
          <g key={i} className="mv">
            <Solid paths={k.cylinder(x, y, 21, 0, 4, P, 40, 0.5)} tone="lo" />
            <Solid paths={k.cylinder(x, y, 18, 4, h, P, 44, 0.6)} tone={broken ? "mid" : "hi"} lit={boot && !linked} />
            {broken ? <Line d={k.segment([x - 9, y, 4 + h], [x + 9, y, 4 + h], P) + k.segment([x, y - 9, 4 + h], [x, y + 9, 4 + h], P)} tone="red" /> : null}
            <FaceText transform={k.topMatrix([x - 9, y + 2], 4 + h, P)} size={6} tone="mid">
              {`clon ${i + 1}`}
            </FaceText>
          </g>
        );
      })}
      {linked
        ? spots.map(([x, y], i) => (
            <Wire key={`w${i}`} from={k.iso([x - 18, y, 6], P)} via={[k.iso([BASE.x + 46, y * 0.5, 6], P)]} to={k.iso([BASE.x + BASE.r, BASE.y, 10], P)} tone={touched ? "red" : boot ? "lit" : "mid"} dotted={!boot} flow={boot} />
          ))
        : null}
    </Figure>
  );
}
