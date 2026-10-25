"use client";

import * as React from "react";
import { Cmd } from "../code";
import { Choice } from "../figs/common";
import { MiniQuiz } from "./kit";

/* ------------------------------------------------------------------ */
/* Command builder: the four pillars (boot, size, disk, network) in one form */

type Model = "e1000" | "virtio-net-pci" | "rtl8139";
interface Nic {
  key: number;
  kind: "user" | "bridge";
  br: string;
  model: Model;
  fwd: string; // "2222:22" or ""
}

const hash = (s: string) => Array.from(s).reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 7);
const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
const macOf = (name: string, i: number) => {
  const h = hash(name);
  return `52:54:00:${hex(h >> 8)}:${hex(h & 255)}:${hex(i + 1)}`;
};

export function QemuBuilder() {
  const [name, setName] = React.useState("prueba");
  const [ram, setRam] = React.useState("512M");
  const [cpus, setCpus] = React.useState(2);
  const [kvm, setKvm] = React.useState(true);
  const [disk, setDisk] = React.useState<"clone" | "existing">("clone");
  const [file, setFile] = React.useState("alpine-ssh2.qcow2");
  const [extra, setExtra] = React.useState("");
  const [console_, setConsole] = React.useState<"fg" | "telnet" | "bg">("telnet");
  const [port, setPort] = React.useState(5000);
  const [qmp, setQmp] = React.useState(true);
  const [snap, setSnap] = React.useState(false);
  const [nics, setNics] = React.useState<Nic[]>([{ key: 1, kind: "user", br: "br1", model: "e1000", fwd: "2222:22" }]);
  const nextKey = React.useRef(2);
  const safe = name.replace(/[^\w-]/g, "") || "mv";
  const diskFile = disk === "clone" ? `${safe}.qcow2` : file;
  const bridges = Array.from(new Set(nics.filter((n) => n.kind === "bridge").map((n) => n.br)));
  const fwds = nics.filter((n) => n.kind === "user" && /^\d+:\d+$/.test(n.fwd)).map((n) => n.fwd.split(":"));
  const bg = console_ !== "fg";
  const lines: string[] = [];
  const warn: string[] = [];

  lines.push("# 1 · Disco");
  lines.push("cd /home/VMs");
  if (disk === "clone") lines.push(`qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 ${diskFile}`);
  if (extra) lines.push(`qemu-img create -f qcow2 ${safe}-datos.qcow2 ${extra}`);
  if (bridges.length) {
    lines.push("", "# 2 · Bridges (si no existen ya)");
    bridges.forEach((b) => {
      lines.push(`nmcli connection add type bridge con-name ${b} ifname ${b} ipv4.method disabled ipv6.method disabled stp no autoconnect yes`);
      lines.push(`grep -q "allow ${b}" /etc/qemu/bridge.conf || echo "allow ${b}" >> /etc/qemu/bridge.conf`);
    });
  }
  const ports = [...(console_ === "telnet" ? [String(port)] : []), ...fwds.map(([h]) => h)];
  if (ports.length) {
    lines.push("", "# 3 · Abrir puertos en el firewall (para conectar desde fuera)");
    ports.forEach((p) => lines.push(`firewall-cmd --add-port=${p}/tcp`));
  }
  lines.push("", "# 4 · Arrancar");
  if (qmp) lines.push("mkdir -p /var/run/qemu");
  const args: string[] = [`qemu-system-x86_64 -name ${safe}`, `-m ${ram} -smp ${cpus}${kvm ? " --enable-kvm" : ""} -nographic`];
  if (console_ === "telnet") args.push(`-serial mon:telnet::${port},server=on,wait=off`);
  if (qmp) args.push("-qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off");
  if (!nics.length) args.push("-nic none");
  nics.forEach((n, i) => {
    const id = `n${i}`;
    const back = n.kind === "user" ? `-netdev user,id=${id}${/^\d+:\d+$/.test(n.fwd) ? `,hostfwd=tcp::${n.fwd.split(":")[0]}-:${n.fwd.split(":")[1]}` : ""}` : `-netdev bridge,br=${n.br},id=${id}`;
    args.push(`${back} -device ${n.model},netdev=${id},mac=${macOf(safe, i)}`);
  });
  if (extra) args.push(`-drive file=${safe}-datos.qcow2,format=qcow2,if=virtio`);
  args.push(`${diskFile}${snap ? " -snapshot" : ""}${bg ? " < /dev/null &" : ""}`);
  lines.push(args.join(" \\\n  "));
  lines.push("", "# 5 · Comprobar");
  lines.push("pgrep -a qemu");
  if (console_ === "telnet") lines.push(`# consola: telnet IP_KVM ${port}   (en Windows: PuTTY, modo Telnet)`);
  fwds.forEach(([h, g]) => lines.push(`# desde el host: ssh -p ${h} root@localhost  (host:${h} → guest:${g})`));

  if (!kvm) warn.push("Sin --enable-kvm la MV se emula (TCG) y va muy lenta.");
  if (console_ === "fg" && qmp) warn.push("Para dejarla encendida para la corrección, lánzala en segundo plano.");
  if (fwds.some(([h]) => h === "22")) warn.push("El puerto 22 del host es el SSH del propio servidor: usa otro (2222).");
  if (nics.some((n) => n.kind === "bridge" && !/^\w+$/.test(n.br))) warn.push("Nombre de bridge no válido.");
  const brCount = nics.filter((n) => n.kind === "bridge").map((n) => n.br);
  if (new Set(brCount).size !== brCount.length) warn.push("Dos NICs en el mismo bridge: normalmente es un error.");

  const setNic = (key: number, patch: Partial<Nic>) => setNics((ns) => ns.map((n) => (n.key === key ? { ...n, ...patch } : n)));
  return (
    <figure className="dg dg-wide qb reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">Los 4 pilares</span>
        <strong>Constructor de comandos QEMU</strong>
      </figcaption>
      <div className="qb-form">
        <fieldset>
          <legend>1 · Arrancar</legend>
          <label>
            Nombre (-name)
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Consola
            <select value={console_} onChange={(e) => setConsole(e.target.value as typeof console_)}>
              <option value="fg">En esta terminal (primer plano)</option>
              <option value="telnet">Telnet en un puerto (segundo plano)</option>
              <option value="bg">Segundo plano sin consola</option>
            </select>
          </label>
          {console_ === "telnet" ? (
            <label>
              Puerto telnet
              <input type="number" min={1024} max={65535} value={port} onChange={(e) => setPort(Number(e.target.value) || 5000)} />
            </label>
          ) : null}
          <label className="qb-check">
            <input type="checkbox" checked={qmp} onChange={(e) => setQmp(e.target.checked)} /> Socket QMP (para la corrección)
          </label>
          <label className="qb-check">
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> -snapshot (descartar cambios al apagar)
          </label>
        </fieldset>
        <fieldset>
          <legend>2 · Parámetros</legend>
          <label>
            RAM (-m)
            <select value={ram} onChange={(e) => setRam(e.target.value)}>
              {["128M", "256M", "512M", "1G", "2G"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            CPUs (-smp)
            <input type="number" min={1} max={8} value={cpus} onChange={(e) => setCpus(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
          </label>
          <label className="qb-check">
            <input type="checkbox" checked={kvm} onChange={(e) => setKvm(e.target.checked)} /> --enable-kvm
          </label>
        </fieldset>
        <fieldset>
          <legend>3 · Discos</legend>
          <label>
            Disco principal
            <select value={disk} onChange={(e) => setDisk(e.target.value as typeof disk)}>
              <option value="clone">Linked clone nuevo de alpine-base</option>
              <option value="existing">Un disco que ya existe</option>
            </select>
          </label>
          {disk === "existing" ? (
            <label>
              Fichero
              <input value={file} onChange={(e) => setFile(e.target.value)} />
            </label>
          ) : null}
          <label>
            Disco extra
            <select value={extra} onChange={(e) => setExtra(e.target.value)}>
              <option value="">Ninguno</option>
              <option value="1G">1 GB (qcow2)</option>
              <option value="5G">5 GB (qcow2)</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>4 · Redes</legend>
          {nics.map((n, i) => (
            <div key={n.key} className="qb-nic">
              <span className="qb-nic-n">eth{i}</span>
              <select value={n.kind} onChange={(e) => setNic(n.key, { kind: e.target.value as Nic["kind"] })} aria-label={`Backend de eth${i}`}>
                <option value="user">user (NAT, salida)</option>
                <option value="bridge">bridge (LAN)</option>
              </select>
              {n.kind === "bridge" ? (
                <input className="qb-short" value={n.br} onChange={(e) => setNic(n.key, { br: e.target.value })} aria-label={`Bridge de eth${i}`} />
              ) : (
                <input className="qb-short" value={n.fwd} placeholder="host:guest" onChange={(e) => setNic(n.key, { fwd: e.target.value })} aria-label={`hostfwd de eth${i}, host:guest`} title="hostfwd host:guest, p. ej. 2222:22" />
              )}
              <select value={n.model} onChange={(e) => setNic(n.key, { model: e.target.value as Model })} aria-label={`Modelo de eth${i}`}>
                <option value="e1000">e1000</option>
                <option value="virtio-net-pci">virtio-net-pci</option>
                <option value="rtl8139">rtl8139</option>
              </select>
              <button type="button" className="btn ghost" onClick={() => setNics((ns) => ns.filter((x) => x.key !== n.key))} aria-label={`Quitar eth${i}`}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="btn" onClick={() => setNics((ns) => [...ns, { key: nextKey.current++, kind: "bridge", br: `br${ns.filter((x) => x.kind === "bridge").length + 1}`, model: "e1000", fwd: "" }])}>
            + Añadir NIC
          </button>
        </fieldset>
      </div>
      {warn.length ? (
        <ul className="qb-warn">
          {warn.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <Cmd title={`Script para ${safe}`}>{lines.join("\n")}</Cmd>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Topologies: the classic chain Internet → VM1 → LAN → VM2 → LAN → VM3 */

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
      <Cmd title={`Script: ${n} MVs en ${topo === "chain" ? "cadena" : "una LAN"}`}>{lines.join("\n")}</Cmd>
      <p className="dg-note">
        Cada NIC lleva su par <code>-netdev … id=nX</code> + <code>-device … netdev=nX</code> y una <b>MAC única</b>. La vm1 tiene además una NIC <b>user</b>: es su salida a Internet por NAT. {topo === "chain" ? "Las MVs intermedias tienen dos NICs, una en cada LAN: son los routers." : "Con una sola LAN, el bucle for basta para lanzar todas."}
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Exam-like challenges, with solutions and saved progress */

const CHALLENGES = [
  {
    t: "Arranca una MV «web» con 256 MB y 2 CPUs desde un linked clone, en segundo plano, con consola por telnet en el puerto 5005.",
    hint: "Linked clone con qemu-img create -F -f -b; luego -name, -m, -smp, --enable-kvm, -nographic, -serial mon:telnet::5005,… y & con < /dev/null. Abre el 5005 en el firewall.",
    sol: "cd /home/VMs\nqemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 web.qcow2\nfirewall-cmd --add-port=5005/tcp\nqemu-system-x86_64 -name web -m 256M -smp 2 --enable-kvm -nographic \\\n  -serial mon:telnet::5005,server=on,wait=off web.qcow2 < /dev/null &\npgrep -a qemu",
  },
  {
    t: "Conecta a esa MV un segundo disco de 1 GB y comprueba que el guest lo ve.",
    hint: "qemu-img create -f qcow2 … 1G y -drive file=…,format=qcow2,if=virtio. Dentro: lsblk o fdisk -l.",
    sol: "qemu-img create -f qcow2 web-datos.qcow2 1G\nqemu-system-x86_64 -name web -m 256M -smp 2 --enable-kvm -nographic \\\n  -drive file=web-datos.qcow2,format=qcow2,if=virtio web.qcow2\n# dentro de la MV:\nlsblk          # aparece /dev/vdb de 1G",
  },
  {
    t: "Crea un clon, hazle un snapshot «limpio», rompe algo dentro de la MV y vuelve al estado limpio.",
    hint: "Con la MV apagada: qemu-img snapshot -c / -l / -a. (Alternativa sin guardar nada: arrancar con -snapshot.)",
    sol: "qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 prueba-snap.qcow2\nqemu-img snapshot -c limpio prueba-snap.qcow2\nqemu-img snapshot -l prueba-snap.qcow2\n# arrancas, rompes algo (rm -rf /etc/motd…), poweroff\nqemu-img snapshot -a limpio prueba-snap.qcow2   # vuelta atrás",
  },
  {
    t: "Publica el servidor web (puerto 80) de la MV en el puerto 8080 del servidor KVM y compruébalo.",
    hint: "Red user con hostfwd=tcp::8080-:80 (host a la izquierda). Firewall del 8080 para entrar desde fuera.",
    sol: "firewall-cmd --add-port=8080/tcp\nqemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm \\\n  -netdev user,id=user.0,hostfwd=tcp::8080-:80 -device e1000,netdev=user.0 \\\n  alpine-webserver.qcow2\n# en otra terminal del servidor:\nwget localhost:8080      # descarga index.html\n# desde tu PC: http://IP_KVM:8080",
  },
  {
    t: "Lanza 3 MVs con un bucle for, todas en el bridge br1, cada una con su MAC, su puerto telnet y su disco.",
    hint: "Usa $i en el nombre del disco, el puerto (500$i) y la MAC (…:0$i). Redirige la salida a un log.",
    sol: 'for i in 1 2 3; do\n  qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm$i.qcow2\n  qemu-system-x86_64 -name vm$i -m 256M -smp 1 --enable-kvm -nographic \\\n    -serial mon:telnet::500$i,server=on,wait=off \\\n    -netdev bridge,br=br1,id=n0 -device e1000,netdev=n0,mac=52:54:00:00:00:0$i \\\n    vm$i.qcow2 < /dev/null > vm$i.log 2>&1 &\ndone\npgrep -a qemu',
  },
  {
    t: "Monta la cadena Internet → MV1 → LAN1 → MV2 → LAN2 → MV3.",
    hint: "Dos bridges (br1, br2) con allow en bridge.conf. MV1: user + br1. MV2: br1 + br2. MV3: br2. Usa el generador de topologías de arriba.",
    sol: "for b in br1 br2; do\n  nmcli connection add type bridge con-name $b ifname $b ipv4.method disabled ipv6.method disabled stp no autoconnect yes\n  echo \"allow $b\" >> /etc/qemu/bridge.conf\ndone\n# MV1: -netdev user,id=n0 -device e1000,netdev=n0,mac=52:54:00:00:01:00 \\\n#      -netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:01:01\n# MV2: br1 + br2 · MV3: br2 (ver el script completo del generador)",
  },
  {
    t: "Deja encendida en KVM2 la MV «prueba» (512 MB, 2 CPUs, disco alpine-ssh2.qcow2) lista para la corrección.",
    hint: "-name prueba y -qmp unix:`mktemp …`. Crea antes /var/run/qemu. En segundo plano con < /dev/null y que sobreviva al exit (disown).",
    sol: "mkdir -p /var/run/qemu\ncd /home/VMs\nqemu-system-x86_64 -name prueba \\\n  -qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off \\\n  -nographic -m 512M -smp 2 --enable-kvm alpine-ssh2.qcow2 < /dev/null &\ndisown\nps -o pid,stat,cmd -C qemu-system-x86   # STAT S o R, nunca T",
  },
  {
    t: "Deja el servidor limpio: MVs apagadas, puertos cerrados y bridges borrados.",
    hint: "poweroff dentro de cada MV (o kill si se cuelga), firewall-cmd --remove-port, nmcli connection/device delete.",
    sol: "# dentro de cada MV: poweroff\npgrep -a qemu                 # no debe quedar nada\nfirewall-cmd --remove-port=5005/tcp\nfirewall-cmd --list-ports\nnmcli connection delete br1\nnmcli connection show         # solo deben quedar ens32 y ens33",
  },
];

const KEY = "asv-retos";

export function Challenges() {
  const [done, setDone] = React.useState<boolean[]>(() => CHALLENGES.map(() => false));
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setDone(CHALLENGES.map((_, i) => !!saved[i]));
    } catch {}
  }, []);
  const toggle = (i: number) =>
    setDone((d) => {
      const next = d.map((v, j) => (j === i ? !v : v));
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  const count = done.filter(Boolean).length;
  return (
    <section className="ch reveal" aria-label="Retos tipo examen">
      <header className="quiz-head">
        <span className="dg-kicker">Practica como en el examen</span>
        <strong>Retos de laboratorio</strong>
        <span className="quiz-score">
          {count} / {CHALLENGES.length} hechos
        </span>
      </header>
      <ol className="ch-list">
        {CHALLENGES.map((c, i) => (
          <li key={i} className="ch-item" data-done={done[i] ? "" : undefined}>
            <label className="ch-head">
              <input type="checkbox" checked={done[i]} onChange={() => toggle(i)} />
              <span>{c.t}</span>
            </label>
            <details>
              <summary>Pista</summary>
              <p>{c.hint}</p>
            </details>
            <details>
              <summary>Solución</summary>
              <Cmd>{c.sol}</Cmd>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const C = ({ children }: { children: string }) => <code className="fe-code">{children}</code>;

export function FindTheError() {
  return (
    <MiniQuiz
      kicker="Encuentra el error"
      title="Comandos con trampa"
      questions={[
        { q: <C>ln –s /exports/VMs/alpine-base.qcow2 alpine-base.qcow2</C>, options: ["Falta -f", "El guion de –s es un guion largo copiado del PDF", "Las rutas están al revés"], ok: 1, why: "La shell no entiende el guion tipográfico (–). Escríbelo a mano: -s." },
        { q: <C>qemu-img create -f qcow2 -b alpine-base.qcow2 clon.qcow2</C>, options: ["Falta -F qcow2 (formato del disco base)", "Falta el tamaño", "qcow2 no admite backing files"], ok: 0, why: "Sin -F, qemu-img no sabe el formato del base: las versiones modernas fallan o avisan." },
        { q: <C>qemu-img create -F qcow2 -f qcow2 -b clon.qcow2 alpine-base.qcow2</C>, options: ["Está perfecto", "Base y clon están intercambiados: ¡machacas la base!", "Falta -o preallocation"], ok: 1, why: "El último argumento es el disco NUEVO. Así sobrescribes alpine-base.qcow2 con un delta vacío." },
        { q: <C>-netdev bridge,br=br1,id=net0 -device e1000,netdev=n0</C>, options: ["El id del backend y el netdev del device no coinciden", "e1000 no funciona con bridge", "Falta ,server=on"], ok: 0, why: "netdev= tiene que ser exactamente el id= del -netdev (net0)." },
        { q: <C>-netdev user,id=n0,hostfwd=tcp::22-:2222</C>, options: ["Correcto para entrar por SSH", "Invertido: host a la izquierda, guest a la derecha (tcp::2222-:22)", "hostfwd solo vale para UDP"], ok: 1, why: "Además el 22 del host ya es el SSH del servidor. Lo correcto: hostfwd=tcp::2222-:22." },
        { q: <C>qemu-system-x86_64 -nographic -m 1G --enable-kvm alpine-ssh1.qcow2 &</C>, options: ["Falta < /dev/null: en segundo plano la MV se queda parada (estado T)", "Falta -smp", "& no se puede usar con QEMU"], ok: 0, why: "Con -nographic QEMU quiere leer del teclado; en segundo plano bash lo detiene. < /dev/null le da una entrada vacía." },
        { q: <C>dos MVs lanzadas con -serial mon:telnet::5000,server=on,wait=off</C>, options: ["Funciona: telnet multiplexa", "La segunda falla: el puerto 5000 ya está en uso", "Hay que poner wait=on"], ok: 1, why: "Cada MV necesita su propio puerto (5000, 5001…)." },
        { q: <C>dos MVs con -device e1000,netdev=n0,mac=52:54:00:00:00:01 en br1</C>, options: ["Es correcto si tienen discos distintos", "MAC duplicada en la misma LAN: conflictos", "El bridge les asigna otra MAC"], ok: 1, why: "Cada NIC de una LAN necesita una MAC única." },
        { q: <C>cp alpine-ssh1.qcow2 backup.qcow2   # para tener una copia independiente</C>, options: ["Correcto", "cp solo copia el delta: sigue dependiendo de la base. Usa qemu-img convert", "Hay que usar mv"], ok: 1, why: "Un full clone independiente se hace con qemu-img convert -O qcow2 origen destino." },
        { q: <C>access denied by acl file</C>, options: ["Falta allow br1 en /etc/qemu/bridge.conf", "Falta --enable-kvm", "La MAC no es válida"], ok: 0, why: "bridge.conf es la ACL de bridges que QEMU puede usar." },
        { q: <C>[root@vm-16-173 ~]# poweroff</C>, options: ["Apaga la MV", "Apaga el SERVIDOR KVM1 entero", "No hace nada"], ok: 1, why: "Ese prompt es el del servidor. Dentro de la MV el prompt es localhost:~# o alpine-base:~#." },
        { q: <C>qemu-system-x86_64 -m 1G -smp 2 alpine-ssh1.qcow2   # por SSH</C>, options: ["Le faltan --enable-kvm y -nographic", "Le falta -name", "Está bien"], ok: 0, why: "Sin -nographic intenta abrir una ventana (no hay pantalla por SSH) y sin KVM va emulado, lentísimo." },
      ]}
    />
  );
}
