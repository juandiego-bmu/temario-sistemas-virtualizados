"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Arrow, Box, Diagram, useShow } from "./kit";

const EI = "M137 80 C104 96 104 124 137 140";
const EVI = "M423 80 C456 96 456 124 423 140";

/** Virtualisation as an isomorphism: the same transition happens on both sides; only the time differs. */
export function IsomorphismDiagram() {
  const [load, setLoad] = React.useState<1 | 3>(1);
  const [run, setRun] = React.useState(0);
  const slow = load === 1 ? 1.3 : 2.4;
  const real = 0.9;
  useShow("iso", (key) => {
    if (key === "load") setLoad(3);
    setRun((r) => r + 1);
  });
  return (
    <Diagram
      ns="iso"
      title="Equivalencia salvo temporizaciones"
      kicker="Definición formal"
      label="Dos dominios, real y virtual. Una instrucción lleva del estado Si al Sj en el real y de S'i a S'j en el virtual. La función f relaciona los estados. El virtual tarda más."
      viewBox="0 0 560 262"
      controls={
        <>
          <button type="button" className="btn" onClick={() => setRun((r) => r + 1)}>
            ▶ Ejecutar una instrucción
          </button>
          <Choice
            label="Host"
            value={load}
            options={[
              { value: 1, text: "MV sola" },
              { value: 3, text: "Con 3 MVs más" },
            ]}
            onChange={(v) => setLoad(v)}
          />
        </>
      }
      note={
        <>
          Lo que pasa en el real pasa igual en el virtual (<b>isomorfismo</b>): mismo estado final. Lo único que el software puede notar son <b>temporizaciones atípicas</b>: retardos de E/S y pausas cuando el hipervisor atiende a otras MVs.
        </>
      }
    >
      <text className="dg-kick" x={123} y={16} textAnchor="middle">
        Dominio real (host)
      </text>
      <text className="dg-kick" x={437} y={16} textAnchor="middle">
        Dominio virtual (guest)
      </text>
      <rect className="iso-dom" x={18} y={26} width={210} height={168} rx={36} />
      <rect className="iso-dom virt" x={332} y={26} width={210} height={168} rx={36} />
      <path className="dg-wire" d={EI} />
      <path className="dg-wire" d={EVI} />
      <text className="dg-s" x={98} y={114} textAnchor="end">
        ei
      </text>
      <text className="dg-s" x={462} y={114}>
        e&apos;i
      </text>
      <Arrow x1={164} y1={70} x2={396} y2={70} tone="lit" />
      <Arrow x1={164} y1={150} x2={396} y2={150} tone="lit" />
      <text className="dg-s accent-text" x={280} y={60} textAnchor="middle">
        f(Si) = S&apos;i
      </text>
      <text className="dg-s accent-text" x={280} y={168} textAnchor="middle">
        f(Sj) = S&apos;j
      </text>
      {[
        [150, 70, "Si"],
        [150, 150, "Sj"],
        [410, 70, "S'i"],
        [410, 150, "S'j"],
      ].map(([x, y, t]) => (
        <g key={t as string}>
          <circle className="dg-node" cx={x as number} cy={y as number} r={14} />
          <text className="dg-t" x={x as number} y={(y as number) + 4} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      {run ? (
        <g key={`${run}-${load}`}>
          {[
            [EI, real, 150],
            [EVI, real * slow, 410],
          ].map(([path, dur, cx]) => (
            <g key={cx as number}>
              <circle className="iso-token" r={6}>
                <animateMotion dur={`${dur}s`} fill="freeze" path={path as string} />
                <animate attributeName="opacity" from="1" to="0" begin={`${dur}s`} dur="0.25s" fill="freeze" />
              </circle>
              <circle className="iso-ring" cx={cx as number} cy={150} r={14} opacity={0}>
                <animate attributeName="r" from="14" to="24" begin={`${dur}s`} dur="0.7s" fill="freeze" />
                <animate attributeName="opacity" values="0;0.9;0" begin={`${dur}s`} dur="0.7s" fill="freeze" />
              </circle>
            </g>
          ))}
          <rect className="iso-bar" x={40} y={214} height={10} rx={3} width={0}>
            <animate attributeName="width" from="0" to={80} dur={`${real}s`} fill="freeze" />
          </rect>
          <rect className="iso-bar virt" x={340} y={214} height={10} rx={3} width={0}>
            <animate attributeName="width" from="0" to={80 * slow} dur={`${real * slow}s`} fill="freeze" />
          </rect>
        </g>
      ) : null}
      <text className="dg-s" x={40} y={244}>
        tiempo real
      </text>
      <text className="dg-s" x={340} y={244}>
        tiempo en la MV (×{slow.toFixed(1)})
      </text>
    </Diagram>
  );
}

const EVENTS = [
  { id: "io", text: "La MV ejecuta OUT al puerto del disco", to: "int", why: "Es una instrucción privilegiada: provoca un trap. El dispatcher la pasa al intérprete, que simula el efecto en el controlador de disco virtual." },
  { id: "ptbr", text: "La MV carga un nuevo mapa de memoria (PTBR)", to: "alloc", why: "Intenta cambiar los recursos que tiene asignados: el dispatcher llama al allocator, que decide qué memoria real le corresponde." },
  { id: "iret", text: "El kernel guest vuelve a modo usuario (IRET)", to: "int", why: "Cambiar de modo es privilegiado. El intérprete emula el cambio de modo de la CPU virtual sin tocar el modo real." },
  { id: "new", text: "Arrancas una MV nueva con 2 vCPU y 1 GB", to: "alloc", why: "Hay que repartir CPU y RAM físicas entre las MVs: es el trabajo del allocator." },
] as const;

/** Popek & Goldberg's three modules: who handles what after a trap. */
export function ModulesDiagram() {
  const [ev, setEv] = React.useState<(typeof EVENTS)[number]["id"]>("io");
  useShow("mod", (key) => EVENTS.some((x) => x.id === key) && setEv(key as (typeof EVENTS)[number]["id"]));
  const e = EVENTS.find((x) => x.id === ev)!;
  const alloc = e.to === "alloc";
  return (
    <Diagram
      ns="mod"
      title="Dispatcher, allocator e intérprete"
      kicker="Módulos del hipervisor"
      label="Un trap llega al dispatcher, que lo pasa al allocator si hay que asignar recursos o al intérprete si hay que simular una instrucción."
      viewBox="0 0 560 230"
      controls={
        <div className="choice" role="group" aria-label="Evento">
          <span className="choice-label">Evento</span>
          {EVENTS.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === ev} onClick={() => setEv(x.id)}>
              {x.text}
            </button>
          ))}
        </div>
      }
      note={
        <>
          <b>{alloc ? "Allocator" : "Intérprete"}:</b> {e.why}
        </>
      }
    >
      <Box x={6} y={86} w={146} h={52} title="MV (guest)" sub="instrucción delicada" />
      <Arrow x1={152} y1={112} x2={204} y2={112} tone="lit" />
      <text className="dg-s accent-text" x={178} y={104} textAnchor="middle">
        trap
      </text>
      <Box x={206} y={84} w={130} h={56} title="Dispatcher" sub="¿quién se encarga?" tone="accent" />
      <Arrow x1={336} y1={104} x2={404} y2={58} tone={alloc ? "lit" : "dim"} />
      <Arrow x1={336} y1={120} x2={404} y2={166} tone={alloc ? "dim" : "lit"} />
      <Box x={406} y={30} w={148} h={56} title="Allocator" sub="asigna recursos reales" tone={alloc ? "accent" : "dim"} />
      <Box x={406} y={140} w={148} h={56} title="Intérprete" sub="simula la instrucción" tone={alloc ? "dim" : "accent"} />
      <text className="dg-s" x={480} y={108} textAnchor="middle">
        CPU · RAM · E/S
      </text>
      <text className="dg-s" x={480} y={216} textAnchor="middle">
        estado de la CPU virtual
      </text>
    </Diagram>
  );
}
