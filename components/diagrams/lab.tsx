"use client";

import * as React from "react";
import { Cmd } from "../code";
import { Choice } from "../figs/common";

/* ------------------------------------------------------------------ */
/* Command builder: the four pillars (boot, size, disk, network) in one form */

export function TopologyLab() {
  const [n, setN] = React.useState(3);
  const [topo, setTopo] = React.useState<"chain" | "lan">("chain");
  const [ips, setIps] = React.useState(false);
  const vms = Array.from({ length: n }, (_, i) => i + 1);
  // NICs per VM: [backend, bridge?]
  const nicsOf = (v: number): { kind: "user" | "bridge"; br?: string }[] => {
    if (topo === "lan") return v === 1 ? [{ kind: "user" }, { kind: "bridge", br: "br1" }] : [{ kind: "bridge", br: "br1" }];
    const out: { kind: "user" | "bridge"; br?: string }[] = [];
    if (v === 1) out.push({ kind: "user" });
    if (v > 1) out.push({ kind: "bridge", br: `br${v - 1}` });
    if (v < n) out.push({ kind: "bridge", br: `br${v}` });
    return out;
  };
  const bridges = topo === "lan" ? ["br1"] : Array.from({ length: n - 1 }, (_, i) => `br${i + 1}`);
  const lines: string[] = [];
  lines.push("# 1 · Bridges (LANs privadas) y permiso para QEMU");
  lines.push(`for b in ${bridges.join(" ")}; do`);
  lines.push("  nmcli connection add type bridge con-name $b ifname $b ipv4.method disabled ipv6.method disabled stp no autoconnect yes");
  lines.push('  echo "allow $b" >> /etc/qemu/bridge.conf');
  lines.push("done", "", "# 2 · Un linked clone por MV");
  lines.push("cd /home/VMs");
  lines.push(`for i in $(seq 1 ${n}); do qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm$i.qcow2; done`);
  lines.push("", "# 3 · Arrancar (MAC, puerto telnet y disco distintos por MV)");
  vms.forEach((v) => {
    const parts = nicsOf(v).map((nic, j) => {
      const back = nic.kind === "user" ? `-netdev user,id=n${j}` : `-netdev bridge,br=${nic.br},id=n${j}`;
      return `${back} -device e1000,netdev=n${j},mac=52:54:00:00:0${v}:0${j}`;
    });
    lines.push([`qemu-system-x86_64 -name vm${v} -m 256M -smp 1 --enable-kvm -nographic`, `-serial mon:telnet::500${v},server=on,wait=off`, ...parts, `vm${v}.qcow2 < /dev/null > vm${v}.log 2>&1 &`].join(" \\\n  "));
  });
  lines.push("", "pgrep -a qemu   # deben salir " + n + " procesos");
  if (ips) {
    lines.push("", "# 4 · (Opcional) IPs dentro de cada MV · entra con telnet IP_KVM 500X");
    vms.forEach((v) => {
      lines.push(`# --- vm${v}`);
      nicsOf(v).forEach((nic, j) => {
        if (nic.kind === "user") lines.push(`udhcpc -i eth${j}            # 10.0.2.15 por la red user`);
        else {
          const lan = topo === "lan" ? 1 : Number(nic.br!.slice(2));
          const host = topo === "lan" ? v : v === lan ? 1 : 2;
          lines.push(`ip link set eth${j} up && ip addr add 192.168.${lan}.${host}/24 dev eth${j}`);
        }
      });
      if (topo === "chain") {
        if (v > 1 && v < n) lines.push("sysctl -w net.ipv4.ip_forward=1   # hace de router entre sus dos LANs");
        if (v > 1) lines.push(`ip route add default via 192.168.${v - 1}.1`);
        for (let lan = v + 1; lan < n; lan++) lines.push(`ip route add 192.168.${lan}.0/24 via 192.168.${v}.2`);
      }
    });
  }
  const W = 560;
  const chainW = (W - 4 - 96 - (2 * n - 2) * 8) / (2 * n - 1);
  const boxW = topo === "chain" ? Math.min(96, chainW) : Math.min(96, (W - 120) / (n + 1));
  return (
    <figure className="dg dg-wide topo reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">Ejercicio típico de examen</span>
        <strong>Topologías con varias MVs</strong>
      </figcaption>
      <div className="controls">
        <Choice
          label="Topología"
          value={topo}
          options={[
            { value: "chain", text: "Cadena: Internet → MV → LAN → MV …" },
            { value: "lan", text: "Todas en una LAN" },
          ]}
          onChange={setTopo}
        />
        <Choice label="MVs" value={n} options={[2, 3, 4, 5].map((x) => ({ value: x, text: String(x) }))} onChange={setN} />
        <label className="qb-check">
          <input type="checkbox" checked={ips} onChange={(e) => setIps(e.target.checked)} /> Configurar IPs dentro
        </label>
      </div>
      <div className="dg-scroll">
        <svg className="dg-svg" viewBox="0 0 560 150" role="img" aria-label="Diagrama de la topología elegida con Internet, las máquinas virtuales y las LANs entre ellas.">
          <ellipse className="nm-cloud" cx={44} cy={70} rx={38} ry={24} />
          <text className="dg-s" x={44} y={74} textAnchor="middle">
            Internet
          </text>
          {topo === "chain"
            ? vms.flatMap((v, i) => {
                const x = 96 + 2 * i * (boxW + 8);
                const items = [
                  <g key={`v${v}`}>
                    <rect className="dg-node out" x={x} y={46} width={boxW} height={48} rx={8} />
                    <text className="dg-t" x={x + boxW / 2} y={66} textAnchor="middle">
                      vm{v}
                    </text>
                    <text className="dg-s" x={x + boxW / 2} y={82} textAnchor="middle">
                      {nicsOf(v).length} NIC{nicsOf(v).length > 1 ? "s" : ""}
                    </text>
                    <path className="dg-wire" d={`M${x - (i ? 8 : 14)} 70 L${x} 70`} />
                  </g>,
                ];
                if (v < n)
                  items.push(
                    <g key={`l${v}`}>
                      <rect className="br-bar" x={x + boxW + 8} y={60} width={boxW} height={20} rx={10} />
                      <text className="dg-s br-t" x={x + boxW + 8 + boxW / 2} y={74} textAnchor="middle">
                        br{v}
                      </text>
                      <text className="dg-s" x={x + boxW + 8 + boxW / 2} y={100} textAnchor="middle">
                        {ips ? `192.168.${v}.0/24` : `LAN ${v}`}
                      </text>
                      <path className="dg-wire" d={`M${x + boxW} 70 L${x + boxW + 8} 70`} />
                    </g>,
                  );
                return items;
              })
            : [
                <g key="lan">
                  <rect className="br-bar" x={96} y={118} width={440} height={20} rx={10} />
                  <text className="dg-s br-t" x={316} y={132} textAnchor="middle">
                    br1 {ips ? "· 192.168.1.0/24" : ""}
                  </text>
                  <path className="dg-wire" d="M82 70 L110 70" />
                </g>,
                ...vms.map((v, i) => {
                  const x = 110 + i * (boxW + 14);
                  return (
                    <g key={v}>
                      <rect className="dg-node out" x={x} y={40} width={boxW} height={48} rx={8} />
                      <text className="dg-t" x={x + boxW / 2} y={68} textAnchor="middle">
                        vm{v}
                      </text>
                      <path className="dg-wire" d={`M${x + boxW / 2} 88 L${x + boxW / 2} 118`} />
                    </g>
                  );
                }),
              ]}
        </svg>
      </div>
      <Cmd title={`Script: ${n} MVs en ${topo === "chain" ? "cadena" : "una LAN"}`}>{lines.join("\n")}</Cmd>
      <p className="dg-note">
        Cada NIC lleva su par <code>-netdev … id=nX</code> + <code>-device … netdev=nX</code> y una <b>MAC única</b>. La vm1 tiene además una NIC <b>user</b>: es su salida a Internet por NAT. {topo === "chain" ? "Las MVs intermedias tienen dos NICs, una en cada LAN: son los routers." : "Con una sola LAN, el bucle for basta para lanzar todas."}
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Exam-like challenges, with solutions and saved progress */
