"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, Slider } from "./kit";

const DAYS = 10;

/** From the blackboard: how big a delta gets depends on how volatile the data is, and on hotspots. */
export function VolatilityDiagram() {
  const [v, setV] = React.useState(25);
  const [hot, setHot] = React.useState(false);
  const H = 0.1;
  const frac = (t: number) => {
    const p = v / 100;
    return hot ? H * (1 - Math.pow(1 - Math.min(1, p / H), t)) : 1 - Math.pow(1 - p, t);
  };
  const x = (t: number) => 50 + (t / DAYS) * 490;
  const y = (f: number) => 170 - f * 150;
  const pts = Array.from({ length: DAYS * 4 + 1 }, (_, i) => i / 4);
  const at7 = frac(7);
  return (
    <Diagram
      title="Volatilidad y hotspots: ¿cuánto crece el delta?"
      kicker="De la pizarra"
      label="Gráfica del tamaño del volumen delta frente al tiempo, según el porcentaje de bloques que cambia cada día y según si las escrituras se concentran en una zona caliente."
      viewBox="0 0 560 200"
      controls={
        <>
          <Slider label="Bloques que cambian al día" value={v} min={1} max={90} onChange={setV} format={(n) => `${n} %`} />
          <Choice
            label="Escrituras"
            value={hot ? "h" : "u"}
            options={[
              { value: "u", text: "Repartidas" },
              { value: "h", text: "Hotspot (10 % del disco)" },
            ]}
            onChange={(c) => setHot(c === "h")}
          />
        </>
      }
      note={
        <>
          Un bloque solo se copia al delta <b>la primera vez</b> que se modifica. Con una volatilidad del {v} % {hot ? "concentrada en un hotspot" : "repartida"}, a los 7 días el delta ocupa el <b>{Math.round(at7 * 100)} %</b> del disco.{" "}
          {at7 > 0.6 ? "Casi una copia completa: el snapshot CoW apenas ahorra espacio y además penaliza las lecturas." : "El snapshot sale muy a cuenta frente a una copia completa."}
        </>
      }
    >
      <line className="dg-axis" x1={50} y1={170} x2={545} y2={170} />
      <line className="dg-axis" x1={50} y1={14} x2={50} y2={170} />
      <line className="dg-cursor" x1={50} y1={y(1)} x2={545} y2={y(1)} />
      <text className="dg-s" x={545} y={y(1) - 5} textAnchor="end">
        copia completa (100 %)
      </text>
      <text className="dg-s" x={44} y={y(0.5) + 4} textAnchor="end">
        50 %
      </text>
      <text className="dg-s" x={44} y={y(0) + 4} textAnchor="end">
        0
      </text>
      {Array.from({ length: DAYS + 1 }, (_, t) => (
        <text key={t} className="dg-s" x={x(t)} y={188} textAnchor="middle">
          {t}
        </text>
      ))}
      <text className="dg-s" x={545} y={200} textAnchor="end">
        días desde el snapshot
      </text>
      <path className="dg-curve vo-curve" d={pts.map((t, i) => `${i ? "L" : "M"}${x(t).toFixed(1)} ${y(frac(t)).toFixed(1)}`).join("")} />
      <circle className="dg-dot" cx={x(7)} cy={y(at7)} r={5} />
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */

const WRITES = [
  { id: "W1", what: "bitmap: el bloque libre pasa a ocupado" },
  { id: "W2", what: "inodo: apunta al bloque nuevo" },
  { id: "W3", what: "datos: se escribe el contenido (D)" },
];

/** Snapshot of a running disk: without fsfreeze it can catch the file system half-written. */
export function FsfreezeDiagram() {
  const [at, setAt] = React.useState(1);
  const [freeze, setFreeze] = React.useState(false);
  const seen = freeze ? 3 : at;
  const verdict = seen === 0 || seen === 3 ? "ok" : "bad";
  const why =
    seen === 0
      ? "El snapshot no contiene nada del fichero nuevo: es coherente (el fichero simplemente aún no existe)."
      : seen === 1
        ? "El bloque figura como ocupado pero ningún inodo lo usa: espacio perdido y un fsck tendrá que repararlo."
        : seen === 2
          ? "El inodo apunta a un bloque cuyos datos todavía no se han escrito: el fichero tiene basura. Snapshot inconsistente."
          : "Las tres escrituras están dentro: el snapshot es consistente.";
  return (
    <Diagram
      title="Snapshot de una MV encendida: fsfreeze"
      kicker="Consistencia"
      label="Tres escrituras para crear un fichero: bitmap, inodo y datos. Según en qué momento se tome el snapshot, el sistema de ficheros guardado queda consistente o no. Con fsfreeze siempre queda consistente."
      viewBox="0 0 560 200"
      controls={
        <>
          <Slider label="El snapshot llega tras" value={at} min={0} max={3} onChange={setAt} format={(n) => `${n} escrituras`} />
          <Choice
            label="fsfreeze"
            value={freeze ? "on" : "off"}
            options={[
              { value: "off", text: "Sin congelar" },
              { value: "on", text: "fsfreeze -f / … -u" },
            ]}
            onChange={(c) => setFreeze(c === "on")}
          />
        </>
      }
      note={
        <>
          {freeze ? (
            <><b>fsfreeze</b> vacía las escrituras pendientes y bloquea las nuevas mientras se hace el snapshot (<code>fsfreeze -f /punto</code>, luego <code>fsfreeze -u /punto</code>; el agente del guest puede hacerlo por ti). </>
          ) : null}
          <b className={verdict === "ok" ? "ok-text" : "bad-text"}>{verdict === "ok" ? "Consistente." : "Inconsistente."}</b> {why}
        </>
      }
    >
      <text className="dg-kick" x={20} y={18}>
        El guest crea un fichero
      </text>
      {WRITES.map((w, i) => (
        <g key={w.id}>
          <rect className={i < seen ? "dg-node out" : "dg-node"} x={20 + i * 180} y={30} width={160} height={52} rx={8} />
          <text className="dg-t" x={100 + i * 180} y={52} textAnchor="middle">
            {w.id}
          </text>
          <text className="dg-s" x={100 + i * 180} y={70} textAnchor="middle">
            {w.what.split(":")[0]}
          </text>
        </g>
      ))}
      <line className={freeze ? "fz-cut frozen" : "fz-cut"} x1={freeze ? 556 : 14 + seen * 180} y1={24} x2={freeze ? 556 : 14 + seen * 180} y2={92} />
      <text className="dg-s accent-text" x={freeze ? 552 : 18 + seen * 180} y={104} textAnchor={freeze || seen === 3 ? "end" : "start"}>
        📸 snapshot
      </text>
      <text className="dg-kick" x={20} y={130}>
        Lo que guarda el snapshot
      </text>
      {["bitmap", "inodo", "datos"].map((t, i) => (
        <g key={t}>
          <rect className={i < seen ? "dg-px hot" : "dg-px"} x={20 + i * 180} y={140} width={160} height={40} rx={6} />
          <text className="dg-t" x={100 + i * 180} y={165} textAnchor="middle">
            {t}: {i < seen ? "nuevo" : "antiguo"}
          </text>
        </g>
      ))}
    </Diagram>
  );
}
