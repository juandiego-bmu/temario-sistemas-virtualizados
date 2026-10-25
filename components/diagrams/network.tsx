"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, useShow } from "./kit";

type NetMode = "bridged" | "nat" | "host";
type Test = "out" | "in" | "vmvm" | "host";

const TESTS: { id: Test; text: string }[] = [
  { id: "out", text: "MV1 → Internet" },
  { id: "in", text: "PC de la LAN → MV1" },
  { id: "vmvm", text: "MV1 ↔ MV2" },
  { id: "host", text: "Host → MV1" },
];

const OK: Record<NetMode, Record<Test, boolean>> = {
  bridged: { out: true, in: true, vmvm: true, host: true },
  nat: { out: true, in: false, vmvm: true, host: false },
  host: { out: false, in: false, vmvm: true, host: true },
};

const IPS: Record<NetMode, [string, string]> = {
  bridged: ["192.168.1.50", "192.168.1.51"],
  nat: ["10.0.2.15", "10.0.2.16"],
  host: ["192.168.56.101", "192.168.56.102"],
};

// Packet paths in screen space for each test (the router node only exists in NAT mode).
const PATHS: Record<Test, string> = {
  out: "M398 70 L330 100 L250 100 L172 100 L128 68",
  in: "M122 160 L172 100 L250 100 L330 100 L398 70",
  vmvm: "M398 70 L330 100 L398 160",
  host: "M250 158 L250 130 L330 100 L398 70",
};

/** The three hosted LAN modes, tested with four connections. */
export function HostedNetModes() {
  const [mode, setMode] = React.useState<NetMode>("nat");
  const [test, setTest] = React.useState<Test>("in");
  const [run, setRun] = React.useState(0);
  useShow("net", (key) => {
    if (key === "bridged" || key === "nat" || key === "host") (setMode(key), setTest(key === "host" ? "vmvm" : "in"), setRun((r) => r + 1));
  });
  const ok = OK[mode][test];
  const why: Record<NetMode, Record<Test, string>> = {
    bridged: {
      out: "La NIC real hace de puente de nivel 2: la MV es un equipo más de la LAN, con su propia IP de la LAN.",
      in: "Visibilidad total de nivel 2: desde la LAN se llega a la MV por su IP, como a cualquier PC.",
      vmvm: "Están en la misma LAN.",
      host: "El host también está en esa LAN.",
    },
    nat: {
      out: "Sale por el router NAT con la IP del host (en QEMU: red user/SLiRP).",
      in: "Desde fuera nadie puede iniciar una conexión hacia la MV: solo con redirección de puertos (hostfwd).",
      vmvm: "Las MVs de la misma LAN virtual se ven entre sí (en QEMU, cada red user es privada de su MV).",
      host: "La MV está detrás del NAT: hace falta redirigir un puerto. Al revés sí: la MV llega al host por la puerta de enlace (10.0.2.2 en SLiRP).",
    },
    host: {
      out: "La LAN no está asociada a ninguna NIC real: no hay salida.",
      in: "Aislada del exterior.",
      vmvm: "Sirve justo para eso: comunicar MVs entre sí.",
      host: "El host tiene una interfaz en esa red (en P2: el bridge privado br1 con 10.0.0.1).",
    },
  };
  return (
    <Diagram
      ns="net"
      title="Bridged, NAT y host-only"
      kicker="LANs virtuales en hosted"
      label="Un host con su NIC real conectada a la LAN e Internet, una LAN virtual con dos máquinas virtuales, y cuatro pruebas de conexión que funcionan o no según el modo."
      viewBox="0 0 560 230"
      controls={
        <>
          <Choice
            label="Modo"
            value={mode}
            options={[
              { value: "bridged", text: "Bridged" },
              { value: "nat", text: "NAT" },
              { value: "host", text: "Host-only" },
            ]}
            onChange={(v) => (setMode(v), setRun((r) => r + 1))}
          />
          <div className="choice" role="group" aria-label="Prueba">
            <span className="choice-label">Prueba</span>
            {TESTS.map((t) => (
              <button key={t.id} type="button" aria-pressed={t.id === test} onClick={() => (setTest(t.id), setRun((r) => r + 1))}>
                {t.text}
              </button>
            ))}
          </div>
        </>
      }
      note={
        <>
          <b className={ok ? "ok-text" : "bad-text"}>{ok ? "✓ Funciona." : "✗ No llega."}</b> {why[mode][test]}
        </>
      }
    >
      <ellipse className="nm-cloud" cx={70} cy={60} rx={56} ry={30} />
      <text className="dg-t" x={70} y={58} textAnchor="middle">
        Internet
      </text>
      <text className="dg-s" x={70} y={74} textAnchor="middle">
        LAN externa
      </text>
      <rect className="dg-node" x={30} y={146} width={90} height={34} rx={6} />
      <text className="dg-s" x={75} y={167} textAnchor="middle">
        PC de la LAN
      </text>
      <rect className="nm-host" x={140} y={20} width={410} height={200} rx={14} />
      <text className="dg-kick" x={152} y={38}>
        Host
      </text>
      <rect className="dg-node" x={150} y={84} width={44} height={32} rx={5} />
      <text className="dg-s" x={172} y={104} textAnchor="middle">
        NIC
      </text>
      {mode === "nat" ? (
        <g>
          <circle className="dg-node accent" cx={250} cy={100} r={22} />
          <text className="dg-t nm-r" x={250} y={104} textAnchor="middle">
            NAT
          </text>
        </g>
      ) : (
        <path className="dg-wire" data-off={mode === "host" ? "" : undefined} d="M194 100 L330 100" />
      )}
      {mode === "nat" ? <path className="dg-wire" d="M194 100 L228 100 M272 100 L330 100" /> : null}
      {mode === "host" ? <path className="nm-cut" d="M210 86 L232 114 M232 86 L210 114" /> : null}
      <path className="dg-wire" d="M120 160 L150 104 M126 70 L150 96" />
      <rect className="dg-node out" x={300} y={84} width={60} height={32} rx={6} />
      <text className="dg-s" x={330} y={104} textAnchor="middle">
        vSwitch
      </text>
      <rect className="dg-node" x={226} y={160} width={48} height={30} rx={5} />
      <text className="dg-s" x={250} y={179} textAnchor="middle">
        host
      </text>
      <path className="dg-wire" data-off={mode === "nat" ? "" : undefined} d="M250 160 L330 116" />
      {[0, 1].map((i) => (
        <g key={i}>
          <path className="dg-wire" d={`M360 100 L${400} ${i ? 160 : 70}`} />
          <rect className="dg-node out" x={400} y={i ? 140 : 50} width={130} height={40} rx={8} />
          <text className="dg-t" x={465} y={i ? 158 : 68} textAnchor="middle">
            MV{i + 1}
          </text>
          <text className="dg-s" x={465} y={i ? 172 : 82} textAnchor="middle">
            {IPS[mode][i]}
          </text>
        </g>
      ))}
      {run ? (
        <circle key={`${run}-${mode}-${test}`} className={ok ? "nm-pkt" : "nm-pkt bad"} r={6}>
          <animateMotion dur="1.6s" fill="freeze" path={PATHS[test]} keyPoints={ok ? "0;1" : "0;0.45"} keyTimes="0;1" calcMode="linear" />
        </circle>
      ) : null}
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */

type Flow = "g1" | "g2" | "iso" | "nat";
const FLOWS: { id: Flow; text: string; note: string }[] = [
  { id: "g1", text: "MV1 (grupo 1) → fuera", note: "vSwitch1 sale por la NIC1, un trunk que solo lleva la VLAN 101. El switch externo ve la trama con la etiqueta 802.1q = 101." },
  { id: "g2", text: "MV2 (grupo 3) → fuera", note: "vSwitch2 tiene dos grupos de puertos (VLAN 102 y 103) y los dos salen por la misma NIC2 en modo trunk: cada trama lleva su etiqueta 802.1q para que el switch externo las separe." },
  { id: "iso", text: "MV3 ↔ MV4 (grupo aislado)", note: "Un vSwitch sin NIC real está aislado: tráfico solo entre servidores locales, copiado entre buffers de memoria del hipervisor (rapidísimo)." },
  { id: "nat", text: "MV5 (grupo NAT) → fuera", note: "El grupo NAT sale a través de un router NAT del hipervisor, con una única dirección hacia fuera." },
];

/** The slides' server: vSwitches, port groups with 802.1q tags and trunk uplinks. */
export function VlanDiagram() {
  const [f, setF] = React.useState<Flow>("g2");
  useShow("vlan", (key) => FLOWS.some((x) => x.id === key) && setF(key as Flow));
  const flow = FLOWS.find((x) => x.id === f)!;
  const on = (id: Flow | Flow[]) => ((Array.isArray(id) ? id : [id]).includes(f) ? "" : undefined);
  return (
    <Diagram
      ns="vlan"
      title="vSwitches, VLANs 802.1q y trunks"
      kicker="LANs virtuales en native"
      label="Servidor físico con cinco máquinas virtuales, grupos de puertos con VLAN 101 a 105, tres switches virtuales, dos NICs reales en modo trunk y un switch externo."
      viewBox="0 0 560 316"
      wide
      controls={
        <div className="choice" role="group" aria-label="Tráfico">
          <span className="choice-label">Tráfico</span>
          {FLOWS.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === f} onClick={() => setF(x.id)}>
              {x.text}
            </button>
          ))}
        </div>
      }
      note={flow.note}
    >
      <rect className="nm-host" x={8} y={8} width={544} height={236} rx={14} />
      <text className="dg-kick" x={20} y={26}>
        Servidor físico
      </text>
      {[
        ["MV1", 40],
        ["MV2", 150],
        ["MV3", 280],
        ["MV4", 350],
        ["MV5", 460],
      ].map(([t, x]) => (
        <g key={t as string}>
          <rect className="dg-node out" x={x as number} y={34} width={56} height={26} rx={5} />
          <text className="dg-t" x={(x as number) + 28} y={52} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      {[
        { id: "g1", x: 30, t: "Grupo 1", v: 101 },
        { id: "g2a", x: 120, t: "Grupo 2", v: 102 },
        { id: "g2", x: 200, t: "Grupo 3", v: 103 },
        { id: "iso", x: 300, t: "Aislado", v: 104 },
        { id: "nat", x: 450, t: "Grupo NAT", v: 105 },
      ].map((g) => (
        <g key={g.id} className="vl-group" data-on={on(g.id as Flow)}>
          <rect x={g.x} y={84} width={78} height={34} rx={17} />
          <text className="dg-t" x={g.x + 39} y={99} textAnchor="middle">
            {g.t}
          </text>
          <text className="dg-s" x={g.x + 39} y={112} textAnchor="middle">
            VLAN {g.v}
          </text>
        </g>
      ))}
      <path className="vl-link" data-on={on("g1")} d="M60 60 L69 84" />
      <path className="vl-link" d="M86 60 L150 84" />
      <path className="vl-link" d="M170 60 L165 84" />
      <path className="vl-link" data-on={on("g2")} d="M196 60 L230 84" />
      <path className="vl-link" data-on={on("iso")} d="M308 60 L330 84 M378 60 L360 84" />
      <path className="vl-link" data-on={on("nat")} d="M488 60 L489 84" />
      {[
        ["vSwitch1", 30, "g1"],
        ["vSwitch2", 150, "g2"],
        ["vSwitch3", 300, "iso"],
        ["vSwitch4", 450, "nat"],
      ].map(([t, x, id]) => (
        <g key={t as string} className="vl-sw" data-on={on(id as Flow)}>
          <rect x={x as number} y={140} width={80} height={24} rx={4} />
          <text className="dg-s" x={(x as number) + 40} y={156} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      <path className="vl-link" data-on={on("g1")} d="M69 118 L70 140" />
      <path className="vl-link" d="M159 118 L180 140" />
      <path className="vl-link" data-on={on("g2")} d="M239 118 L210 140" />
      <path className="vl-link" data-on={on("iso")} d="M339 118 L340 140" />
      <path className="vl-link" data-on={on("nat")} d="M489 118 L490 140" />
      <circle className="dg-node" data-on={on("nat")} cx={430} cy={190} r={14} />
      <text className="dg-s" x={430} y={194} textAnchor="middle">
        NAT
      </text>
      <path className="vl-link" data-on={on("nat")} d="M490 164 L441 181" />
      {[
        ["NIC1", 40, "g1"],
        ["NIC2", 170, "g2"],
      ].map(([t, x, id]) => (
        <g key={t as string} className="vl-sw" data-on={on(id as Flow)}>
          <rect x={x as number} y={200} width={60} height={24} rx={4} />
          <text className="dg-s" x={(x as number) + 30} y={216} textAnchor="middle">
            {t}
          </text>
        </g>
      ))}
      <path className="vl-link" data-on={on("g1")} d="M70 164 L70 200" />
      <path className="vl-link" data-on={on("g2")} d="M190 164 L200 200" />
      <path className="vl-link" data-on={on("nat")} d="M416 193 L230 210" />
      <path className="vl-link trunk" data-on={on("g1")} d="M70 224 L240 284" />
      <path className="vl-link trunk" data-on={on(["g2", "nat"])} d="M200 224 L262 284" />
      <text className="dg-s" x={22} y={272}>
        trunk {"{101}"}
      </text>
      <text className="dg-s" x={300} y={266}>
        trunk {"{102, 103}"}
      </text>
      <rect className="dg-node" x={214} y={284} width={110} height={22} rx={4} />
      <text className="dg-s" x={269} y={299} textAnchor="middle">
        switch externo
      </text>
      {f !== "iso" ? (
        <g className="vl-tag">
          <rect x={f === "g1" ? 132 : 197} y={250} width={80} height={20} rx={10} />
          <text x={f === "g1" ? 172 : 237} y={264} textAnchor="middle">
            {f === "g1" ? "tag 101" : f === "g2" ? "tag 103" : "IP del NAT"}
          </text>
        </g>
      ) : (
        <text className="dg-s accent-text" x={340} y={184} textAnchor="middle">
          no sale del servidor
        </text>
      )}
    </Diagram>
  );
}
