"use client";

import * as React from "react";
import * as k from "../iso/iso-kit";
import { Dots, FaceText, Line, Solid, Wire } from "../iso/react/draw";
import { Bench, Choice, Figure, fit } from "./common";

const COLS = 3;
const ROWS = 4;
const BLOCKS = COLS * ROWS;
const TRAY: k.Plan = { x: 0, y: -48, w: 64, d: 96, r: 4 };
const STEP = 82;
const X0 = -176;
const Z = 6;
const H = 6;
const TOP = Z + H;
const BENCH: k.Plan = { x: -192, y: -64, w: 440, d: 128, r: 10 };
const P = fit([...k.boxCorners(BENCH, -12, 0), ...k.boxCorners({ ...BENCH, d: 100 }, 34, 34)], { azimuth: 60, pad: 22 });

const cellPlan = (b: number): k.Plan => {
  const c = b % COLS;
  const r = Math.floor(b / COLS);
  return { x: 6 + c * 18.6, y: -40 + r * 21.5, w: 15, d: 18, r: 2 };
};
const cellTop = (x: number, b: number, z = TOP): k.Point3 => {
  const p = cellPlan(b);
  return [x + p.x + p.w / 2, p.y + p.d / 2, z];
};

interface Layer {
  id: number;
  name: string;
  snap: string | null; // name of the snapshot that froze it; null for the live delta
  blocks: number[];
}

const fresh = (): Layer[] => [
  { id: 0, name: "BASE", snap: "snap0", blocks: Array.from({ length: BLOCKS }, (_, i) => i) },
  { id: 1, name: "Δ1", snap: "snap1", blocks: [2, 5] },
  { id: 2, name: "Δ actual", snap: null, blocks: [5, 9] },
];

function Tray({ layer, x, live, hot, gone }: { layer: Layer; x: number; live: boolean; hot: number[]; gone?: boolean }) {
  const plan = { ...TRAY, x };
  const feet = k.corners(plan, 7);
  const frontY = plan.y + plan.d;
  return (
    <g className="mv" style={{ opacity: gone ? 0 : 1 }}>
      <path className="iso-halo" d={k.haloOf(plan, 0, Z, P)} />
      {feet.map(([fx, fy], i) => (
        <Solid key={i} paths={k.cylinder(fx, fy, 3, 0, Z, P, 16)} tone="lo" />
      ))}
      <Solid paths={k.slabOf(plan, Z, H, P, 4, 0.6)} tone={live ? "hi" : "mid"} lit={live} inner={<Line d={k.sideSeam(plan, Z + 2, P, 4)} tone="faint" />} />
      <FaceText transform={k.sideMatrix([x + 5, frontY], Z + 4.6, P, "left")} size={5} tone={live ? "hi" : "mid"}>
        {layer.name}
      </FaceText>
      {Array.from({ length: BLOCKS }, (_, b) => {
        const has = layer.blocks.includes(b);
        const p = { ...cellPlan(b), x: x + cellPlan(b).x };
        return has ? (
          <Solid key={b} className="snap-block" paths={k.slabOf(p, TOP, 3, P, 2, 0.4)} tone="hi" lit={hot.includes(b)} />
        ) : (
          <Line key={b} d={k.planOutline(p, TOP, P, 2)} tone="faint" />
        );
      })}
      {layer.snap ? (
        <g>
          <Solid paths={k.slabOf({ x: x + 46, y: frontY - 14, w: 12, d: 8, r: 1.5 }, TOP, 6, P, 2, 0.4)} tone="mid" />
          <Line d={k.sideRing([x + 52, frontY - 6, TOP + 8], 3.2, "y", P)} tone="mid" />
        </g>
      ) : (
        <Dots points={k.pointsAt([[x + 56, frontY, Z + 3]], P)} size={1.1} tone="hi" pulse />
      )}
    </g>
  );
}

type Probe = { at: number; b: number; found: boolean } | null;

/** A disk with snapshots built as trays on a bench: base, frozen deltas and the live delta. */
export function SnapshotFigure() {
  const [layers, setLayers] = React.useState<Layer[]>(fresh);
  const [act, setAct] = React.useState<"w" | "r">("r");
  const [hot, setHot] = React.useState<{ id: number; b: number[] } | null>(null);
  const [probe, setProbe] = React.useState<Probe>(null);
  const [say, setSay] = React.useState("Pulsa un bloque para leerlo o escribirlo");
  const [cmd, setCmd] = React.useState("qemu-img snapshot -l disco.qcow2");
  const [next, setNext] = React.useState(3);
  const [snapN, setSnapN] = React.useState(2);
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));
  const live = layers[layers.length - 1];
  const xOf = (i: number) => X0 + i * STEP;

  const write = (b: number) => {
    setLayers((ls) => ls.map((l, i) => (i === ls.length - 1 && !l.blocks.includes(b) ? { ...l, blocks: [...l.blocks, b] } : l)));
    setHot({ id: live.id, b: [b] });
    setProbe(null);
    setSay(`Escritura del bloque ${b} → va SIEMPRE al delta actual${live.blocks.includes(b) ? " (ya estaba: se sobrescribe)" : " (se reserva espacio para él)"}`);
    setCmd("# la MV escribe: el hipervisor lo guarda en el delta (copy-on-write)");
  };
  const read = (b: number) => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setHot(null);
    let checks = 0;
    for (let i = layers.length - 1; i >= 0; i--) {
      checks++;
      const found = layers[i].blocks.includes(b);
      const at = i;
      const n = checks;
      later((n - 1) * 420, () => {
        setProbe({ at, b, found });
        if (found) {
          setHot({ id: layers[at].id, b: [b] });
          setSay(`Lectura del bloque ${b} → encontrado en ${layers[at].name} tras consultar ${n} índice${n > 1 ? "s" : ""}`);
        }
      });
      if (found) break;
    }
    setCmd("# lectura: primero el delta actual; si no está, el volumen anterior");
  };
  const snapshot = () => {
    if (layers.length >= 5) return setSay("Máximo de snapshots en esta figura: elimina o revierte alguno");
    const name = `snap${snapN}`;
    setLayers((ls) => [...ls.slice(0, -1), { ...ls[ls.length - 1], name: `Δ${ls.length - 1}`, snap: name }, { id: next, name: "Δ actual", snap: null, blocks: [] }]);
    setNext((n) => n + 1);
    setSnapN((n) => n + 1);
    setHot(null);
    setProbe(null);
    setSay(`${name}: el delta actual se congela (solo lectura) y se crea un delta nuevo vacío encima`);
    setCmd(`qemu-img snapshot -c ${name} disco.qcow2`);
  };
  const revert = (i: number) => {
    const target = layers[i];
    setLayers((ls) => [...ls.slice(0, i + 1), { id: next, name: "Δ actual", snap: null, blocks: [] }]);
    setNext((n) => n + 1);
    setHot(null);
    setProbe(null);
    setSay(`Revert a ${target.snap}: se tiran los deltas posteriores y se crea uno nuevo sobre ${target.name}. Muy rápido: no se copia nada`);
    setCmd(`qemu-img snapshot -a ${target.snap} disco.qcow2`);
  };
  const remove = (i: number) => {
    const gone = layers[i];
    const child = layers[i + 1];
    const moved = gone.blocks.filter((b) => !child.blocks.includes(b));
    setHot({ id: child.id, b: moved });
    setProbe(null);
    setLayers((ls) => ls.filter((_, j) => j !== i).map((l) => (l.id === child.id ? { ...l, blocks: [...l.blocks, ...moved] } : l)));
    setSay(`Eliminar ${gone.snap}: hay que consolidar ${moved.length} bloque${moved.length === 1 ? "" : "s"} de ${gone.name} en el siguiente volumen. Tarda según lo que haya que copiar`);
    setCmd(`qemu-img snapshot -d ${gone.snap} disco.qcow2`);
  };
  const deleteAll = () => {
    const all = Array.from(new Set(layers.flatMap((l) => l.blocks)));
    setLayers([{ id: next, name: "BASE (sin snapshots)", snap: null, blocks: all }]);
    setNext((n) => n + 1);
    setHot(null);
    setProbe(null);
    setSay("Delete all: los deltas se escriben en el disco base en orden de creación y se sigue sin snapshots");
    setCmd("qemu-img commit actual.qcow2   # vuelca un overlay en su base");
  };
  const reset = () => {
    timers.current.forEach(window.clearTimeout);
    setLayers(fresh());
    setNext(3);
    setSnapN(2);
    setHot(null);
    setProbe(null);
    setSay("Pulsa un bloque para leerlo o escribirlo");
    setCmd("qemu-img snapshot -l disco.qcow2");
  };

  const frozen = layers.filter((l) => l.snap);
  const probeAt = probe ? k.iso(cellTop(xOf(probe.at), probe.b, probe.found ? TOP + 4 : TOP + 14), P) : null;

  return (
    <Figure
      fig="Fig 3"
      title="Snapshots copy-on-write"
      hint="Escribe, lee, congela y vuelve atrás"
      mode={`${frozen.length} snapshot${frozen.length === 1 ? "" : "s"} · ${layers.length} volúmenes`}
      readout={say}
      label="Bandejas sobre una bancada: el volumen base con todos los bloques, deltas congelados con candado y el delta actual activo. Los bloques escritos se ven en relieve."
      keys={[
        { mark: "raised", label: "Bloque guardado en ese volumen" },
        { mark: "lit", label: "Delta actual (lectura y escritura) / bloque tocado" },
        { mark: "dotted", label: "Backing file: cada volumen se apoya en el anterior" },
      ]}
      caption={
        <>
          <code>{cmd}</code> · Las <b>escrituras</b> van al delta actual; las <b>lecturas</b> buscan primero en el delta actual y, si el bloque no está, bajan al volumen anterior (más consultas = más lento). Volver atrás es instantáneo; borrar un snapshot obliga a <b>consolidar</b>.
        </>
      }
      controls={
        <div className="snap-ctl">
          <Choice
            label="Acción"
            value={act}
            options={[
              { value: "r", text: "Leer" },
              { value: "w", text: "Escribir" },
            ]}
            onChange={setAct}
          />
          <div className="snap-grid" role="group" aria-label="Bloques">
            {Array.from({ length: BLOCKS }, (_, b) => (
              <button key={b} type="button" onClick={() => (act === "w" ? write(b) : read(b))}>
                {b}
              </button>
            ))}
          </div>
          <div className="snap-ops">
            <button type="button" className="btn" onClick={snapshot}>
              📸 Snapshot
            </button>
            {frozen.map((l) => (
              <button key={`r${l.id}`} type="button" className="btn ghost" onClick={() => revert(layers.indexOf(l))}>
                ↩ Revert a {l.snap}
              </button>
            ))}
            {layers.slice(1, -1).map((l) => (
              <button key={`d${l.id}`} type="button" className="btn ghost" onClick={() => remove(layers.indexOf(l))}>
                🗑 Eliminar {l.snap}
              </button>
            ))}
            {layers.length > 1 ? (
              <button type="button" className="btn ghost" onClick={deleteAll}>
                Delete all
              </button>
            ) : null}
            <button type="button" className="btn ghost" onClick={reset}>
              Reiniciar
            </button>
          </div>
        </div>
      }
    >
      <Bench plan={BENCH} P={P} h={10} />
      {layers.map((l, i) => (
        <Tray key={l.id} layer={l} x={xOf(i)} live={i === layers.length - 1} hot={hot && hot.id === l.id ? hot.b : []} />
      ))}
      {layers.slice(1).map((l, i) => (
        <Wire key={`w${l.id}`} from={k.iso([xOf(i + 1), -30, Z + 3], P)} to={k.iso([xOf(i) + TRAY.w, -30, Z + 3], P)} tone="mid" dotted size={1.4} />
      ))}
      {probeAt ? (
        <g className="snap-probe" style={{ transform: `translate(${probeAt[0].toFixed(1)}px, ${probeAt[1].toFixed(1)}px)` }}>
          <circle r={5.5} data-found={probe?.found ? "" : undefined} />
          <path d="M0 5.5 L0 14" />
        </g>
      ) : null}
    </Figure>
  );
}
