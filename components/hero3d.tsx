"use client";

import * as React from "react";

// The virtualization stack from the metal up, as the tour reads it.
const LAYERS = [
  { id: "hw", name: "Hardware real · host", def: "La máquina física y el sistema instalado en ella (el host): CPU, RAM, disco y NIC de verdad. Lo único que existe." },
  { id: "vmm", name: "Hipervisor · VMM", def: "Crea las máquinas virtuales y controla todos los recursos reales. Cada instrucción delicada del guest acaba aquí con un trap." },
  { id: "vm", name: "Máquina virtual", def: "Hardware ficticio: vCPU, RAM, disco y NIC virtuales. Lo único que puede notar el guest son tiempos raros." },
  { id: "guest", name: "Guest", def: "El sistema operativo instalado en la MV. Cree que el hardware es suyo y no se modifica." },
  { id: "app", name: "Aplicaciones", def: "Procesos del guest. Sus instrucciones normales van directas a la CPU real: eso es la eficiencia." },
] as const;
type Layer = (typeof LAYERS)[number]["id"];

const VMS = [-8.8, 0, 8.8];
const CHIPS = ["CPU", "RAM", "DISCO", "NIC"];

function Slab({ layer, x = 0, y = 0, w, d, t, z, lift = 0, label, on, pick }: { layer: Layer; x?: number; y?: number; w: number; d: number; t: number; z: number; lift?: number; label?: React.ReactNode; on: boolean; pick: (l: Layer) => void }) {
  return (
    <div
      className="slab"
      data-layer={layer}
      data-on={on ? "" : undefined}
      onClick={() => pick(layer)}
      style={{ "--x": `${x}em`, "--y": `${y}em`, "--w": `${w}em`, "--d": `${d}em`, "--t": `${t}em`, "--z": z, "--lift": `${lift}em` } as React.CSSProperties}
    >
      <div className="slab-top">{label}</div>
      <i data-side="s" />
      <i data-side="e" />
      <i data-side="w" />
      <i data-side="n" />
    </div>
  );
}

/** The virtualization stack in 3D: hardware, hypervisor, three VMs, their guests and apps, with a trap going down and back. */
export function Hero3D() {
  const [active, setActive] = React.useState<Layer>("vmm");
  const world = React.useRef<HTMLDivElement>(null);
  const pausedUntil = React.useRef(0);
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setActive((a) => LAYERS[(LAYERS.findIndex((l) => l.id === a) + 1) % LAYERS.length].id);
    }, 3800);
    return () => window.clearInterval(id);
  }, []);
  const pick = (l: Layer) => {
    pausedUntil.current = Date.now() + 15000;
    setActive(l);
  };
  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    world.current?.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    world.current?.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const rest = () => {
    world.current?.style.setProperty("--px", "0");
    world.current?.style.setProperty("--py", "0");
  };
  const layer = LAYERS.find((l) => l.id === active)!;
  const on = (l: Layer) => l === active;
  return (
    <div className="h3d-wrap">
      <div className="h3d" onPointerMove={tilt} onPointerLeave={rest} aria-hidden="true">
        <div className="h3d-world" ref={world}>
          <span className="h3d-shadow" />
          <Slab layer="hw" w={34} d={34} t={1.8} z={0} on={on("hw")} pick={pick} />
          {CHIPS.map((c, i) => (
            <Slab key={c} layer="hw" x={-12.3 + i * 8.2} y={13.4} w={6.4} d={4.4} t={1.3} z={0} lift={1.8} on={on("hw")} pick={pick} label={<span className="slab-chip">{c}</span>} />
          ))}
          <Slab layer="vmm" w={26} d={26} t={1.2} z={1} on={on("vmm")} pick={pick} label={<span className="slab-label">Hipervisor · VMM</span>} />
          {VMS.map((x, i) => (
            <React.Fragment key={x}>
              <Slab layer="vm" x={x} w={7.6} d={21} t={1} z={2} on={on("vm")} pick={pick} label={<span className="slab-label">MV {i + 1}</span>} />
              <Slab layer="guest" x={x} w={6.2} d={15} t={0.8} z={3} on={on("guest")} pick={pick} label={<span className="slab-label">guest</span>} />
              <Slab layer="app" x={x} y={-3.4} w={2.8} d={2.8} t={2.8} z={4} on={on("app")} pick={pick} />
              <Slab layer="app" x={x} y={3.2} w={2.8} d={2.8} t={1.7} z={4} on={on("app")} pick={pick} />
            </React.Fragment>
          ))}
          <span className="h3d-trap" />
        </div>
      </div>
      <div className="h3d-cap" aria-live="polite">
        <span className="h3d-kicker">La pila de la virtualización</span>
        <strong key={layer.id}>{layer.name}</strong>
        <p key={`${layer.id}-d`}>{layer.def}</p>
        <div className="h3d-legend" role="group" aria-label="Capas">
          {LAYERS.map((l) => (
            <button key={l.id} type="button" data-layer={l.id} aria-pressed={l.id === active} onClick={() => pick(l.id)}>
              {l.name.split(" · ")[0]}
            </button>
          ))}
        </div>
        <span className="h3d-note">El punto que baja es un trap: el guest ejecuta algo privilegiado y el hipervisor toma el control.</span>
      </div>
    </div>
  );
}
