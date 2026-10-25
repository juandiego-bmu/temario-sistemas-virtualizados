"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Arrow, Box, Diagram, MiniQuiz } from "./kit";

/** Virtualisation as an isomorphism: the same transition happens on both sides; only the time differs. */
export function IsomorphismDiagram() {
  const [load, setLoad] = React.useState<1 | 3>(1);
  const [run, setRun] = React.useState(0);
  const slow = load === 1 ? 1.3 : 2.4;
  const real = 0.9;
  return (
    <Diagram
      title="Equivalencia salvo temporizaciones"
      kicker="Definición formal"
      label="Dos dominios, real y virtual. Una instrucción lleva del estado Si al Sj en el real y de S'i a S'j en el virtual. La función f relaciona los estados. El virtual tarda más."
      viewBox="0 0 560 270"
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
      <rect className="iso-dom" x={18} y={34} width={210} height={150} rx={40} />
      <rect className="iso-dom virt" x={332} y={34} width={210} height={150} rx={40} />
      <text className="dg-kick" x={123} y={24} textAnchor="middle">
        Dominio real (host)
      </text>
      <text className="dg-kick" x={437} y={24} textAnchor="middle">
        Dominio virtual (guest)
      </text>
      <path id="iso-ei" className="dg-wire" d="M86 74 C40 100 40 130 86 152" />
      <path id="iso-evi" className="dg-wire" d="M474 74 C520 100 520 130 474 152" />
      <path className="dg-wire accent-line" d="M100 64 C200 18 360 18 460 64" />
      <path className="dg-wire accent-line" d="M100 162 C200 214 360 214 460 162" />
      <text className="dg-s accent-text" x={280} y={32} textAnchor="middle">
        f(Si) = S'i
      </text>
      <text className="dg-s accent-text" x={280} y={210} textAnchor="middle">
        f(Sj) = S'j
      </text>
      <text className="dg-s" x={36} y={118}>
        ei
      </text>
      <text className="dg-s" x={514} y={118}>
        e'i
      </text>
      {[
        [94, 66, "Si"],
        [94, 160, "Sj"],
        [466, 66, "S'i"],
        [466, 160, "S'j"],
      ].map(([x, y, t]) => (
        <g key={t as string}>
          <circle className="dg-node" cx={x as number} cy={y as number} r={13} />
          <text className="dg-t" x={x as number} y={(y as number) + 4} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      {run ? (
        <g key={`${run}-${load}`}>
          <circle className="iso-token" r={6}>
            <animateMotion dur={`${real}s`} fill="freeze" path="M86 74 C40 100 40 130 86 152" />
          </circle>
          <circle className="iso-token" r={6}>
            <animateMotion dur={`${real * slow}s`} fill="freeze" path="M474 74 C520 100 520 130 474 152" />
          </circle>
          <rect className="iso-bar" x={60} y={234} height={12} rx={3} width={0}>
            <animate attributeName="width" from="0" to={140} dur={`${real}s`} fill="freeze" />
          </rect>
          <rect className="iso-bar virt" x={360} y={234} height={12} rx={3} width={0}>
            <animate attributeName="width" from="0" to={Math.min(180, 140 * slow * 0.55)} dur={`${real * slow}s`} fill="freeze" />
          </rect>
        </g>
      ) : null}
      <text className="dg-s" x={60} y={262}>
        tiempo real
      </text>
      <text className="dg-s" x={360} y={262}>
        tiempo en la MV (×{slow.toFixed(1)})
      </text>
    </Diagram>
  );
}

const OS_MAP = [
  ["CPU", "Procesos", "CPU virtual"],
  ["RAM", "Espacio lógico", "RAM virtual"],
  ["Disco", "Ficheros", "Disco virtual"],
  ["NIC", "Sockets", "NIC virtual"],
] as const;

/** The same picture read twice: what an OS makes of the hardware, and what a hypervisor makes of it. */
export function HvVsOsDiagram() {
  const [hv, setHv] = React.useState(true);
  return (
    <Diagram
      title="Hipervisor vs sistema operativo"
      kicker="Comparativa"
      label="Los dos ocultan el hardware real. El sistema operativo lo ofrece como procesos, espacio lógico, ficheros y sockets a sus procesos. El hipervisor lo ofrece como CPU, RAM, disco y NIC virtuales a sus máquinas virtuales."
      viewBox="0 0 560 300"
      controls={
        <Choice
          label="Mira con ojos de"
          value={hv ? "hv" : "so"}
          options={[
            { value: "so", text: "Sistema operativo" },
            { value: "hv", text: "Hipervisor" },
          ]}
          onChange={(v) => setHv(v === "hv")}
        />
      }
      note={
        hv ? (
          <>
            El hipervisor ofrece el hardware como <b>recursos hardware virtuales</b>. Sus clientes son <b>máquinas virtuales</b> y lo que se ejecuta en ellas son <b>sistemas operativos</b>.
          </>
        ) : (
          <>
            El sistema operativo ofrece el hardware como <b>servicios de alto nivel</b>. Sus clientes son <b>procesos</b> y lo que se ejecuta en ellos son <b>programas y aplicaciones</b>.
          </>
        )
      }
    >
      {[0, 1, 2].map((i) => (
        <g key={i} className="swap">
          <rect className={hv ? "dg-node hvc" : "dg-node osc"} x={40 + i * 170} y={14} width={140} height={58} rx={10} />
          <text className="dg-t" x={110 + i * 170} y={38} textAnchor="middle">
            {hv ? `Máquina virtual ${i + 1}` : `Proceso ${i + 1}`}
          </text>
          <text className="dg-s" x={110 + i * 170} y={56} textAnchor="middle">
            {hv ? "ejecuta un SO guest" : "ejecuta un programa"}
          </text>
          <Arrow x1={110 + i * 170} y1={110} x2={110 + i * 170} y2={78} />
        </g>
      ))}
      <rect className={hv ? "dg-node kern hv" : "dg-node kern"} x={30} y={110} width={500} height={36} rx={8} />
      <text className="dg-t" x={280} y={133} textAnchor="middle">
        {hv ? "Kernel del hipervisor (VMM)" : "Kernel del sistema operativo"}
      </text>
      {OS_MAP.map(([res, os, vm], i) => {
        const x = 30 + i * 128;
        return (
          <g key={res}>
            <rect className="dg-node" x={x} y={170} width={116} height={40} rx={8} />
            <text className="dg-t accent-text" x={x + 58} y={195} textAnchor="middle" key={hv ? "a" : "b"}>
              {hv ? vm : os}
            </text>
            <Arrow x1={x + 58} y1={240} x2={x + 58} y2={214} />
            <Arrow x1={x + 58} y1={170} x2={x + 58} y2={150} />
            <rect className="dg-node hw" x={x + 18} y={244} width={80} height={30} rx={6} />
            <text className="dg-t" x={x + 58} y={264} textAnchor="middle">
              {res}
            </text>
          </g>
        );
      })}
      <text className="dg-kick" x={280} y={294} textAnchor="middle">
        hardware real
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
  const e = EVENTS.find((x) => x.id === ev)!;
  const alloc = e.to === "alloc";
  return (
    <Diagram
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
      <Box x={20} y={86} w={120} h={52} title="MV (guest)" sub="instrucción delicada" />
      <Arrow x1={140} y1={112} x2={204} y2={112} tone="lit" />
      <text className="dg-s accent-text" x={172} y={104} textAnchor="middle">
        trap
      </text>
      <Box x={206} y={84} w={130} h={56} title="Dispatcher" sub="¿quién se encarga?" tone="accent" />
      <Arrow x1={336} y1={104} x2={404} y2={58} tone={alloc ? "lit" : "dim"} />
      <Arrow x1={336} y1={120} x2={404} y2={166} tone={alloc ? "dim" : "lit"} />
      <Box x={406} y={30} w={140} h={56} title="Allocator" sub="asigna recursos reales" tone={alloc ? "accent" : "dim"} />
      <Box x={406} y={140} w={140} h={56} title="Intérprete" sub="simula la instrucción" tone={alloc ? "dim" : "accent"} />
      <text className="dg-s" x={476} y={104} textAnchor="middle">
        CPU · RAM · E/S
      </text>
      <text className="dg-s" x={476} y={214} textAnchor="middle">
        estado de la CPU virtual
      </text>
    </Diagram>
  );
}

export function MotivationsQuiz() {
  return (
    <MiniQuiz
      title="¿Qué motivación es?"
      questions={[
        {
          q: "Una empresa pasa de 20 servidores físicos medio vacíos a 3 servidores con 20 MVs.",
          options: ["Consolidación (y green computing)", "Software obsoleto", "Emulación de otra arquitectura", "Balanceo de carga"],
          ok: 0,
          why: "Varios sistemas sobre el mismo hardware: menos máquinas que comprar, alimentar y gestionar.",
        },
        {
          q: "Abres un adjunto sospechoso dentro de una MV desechable.",
          options: ["Despliegue masivo", "Seguridad y aislamiento (sandbox)", "Migración", "Consolidación"],
          ok: 1,
          why: "El aislamiento impide que lo que pase en esa MV afecte al resto del sistema.",
        },
        {
          q: "Un banco necesita seguir usando un programa que solo funciona en un sistema de los 90.",
          options: ["Green computing", "Failover", "Ejecución de software obsoleto (legacy)", "What-if"],
          ok: 2,
          why: "La MV ofrece el hardware y el SO antiguos que ese programa espera.",
        },
        {
          q: "Un servidor físico entra en mantenimiento y sus MVs se mueven a otro sin parar el servicio.",
          options: ["Infraestructura a prueba de fallos (migración)", "Emulación", "Software obsoleto", "Sandbox"],
          ok: 0,
          why: "Failover: las MVs no están atadas a un hardware concreto y se pueden migrar o clonar.",
        },
        {
          q: "Pruebas una actualización arriesgada y, si sale mal, vuelves atrás en segundos.",
          options: ["Balanceo de carga", "Simulación y experimentación (what-if)", "Consolidación", "Emulación"],
          ok: 1,
          why: "Pruebas what-if: con un snapshot vuelves al estado anterior al instante.",
        },
      ]}
    />
  );
}
