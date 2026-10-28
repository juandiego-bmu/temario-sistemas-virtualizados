"use client";

import * as React from "react";
import { Choice } from "../figs/common";
import { Diagram, useShow } from "./kit";

/* ------------------------------------------------------------------ */
/* Where am I? The prompt tells you, and poweroff means very different things */

interface Img {
  dir: "/exports/VMs" | "/home/VMs";
  name: string;
  kind: "base" | "link" | "clone" | "full" | "copy";
  backing?: string;
  size: string;
  snaps: string[];
  ro?: boolean;
}

const base = (s: Img[]) => s.find((f) => f.kind === "base");

const FLAG_HELP: [RegExp, string][] = [
  [/^qemu-system-x86_64$/, "El programa que crea el PC virtual de 64 bits (Intel/AMD). Ojo: qemu-system arranca MVs; qemu-img gestiona discos."],
  [/^-name$/, "Nombre de la MV. Es lo que comprueba el corrector (no cambia el hostname de dentro)."],
  [/^-m$/, "Memoria RAM de la MV: 512M, 1G…"],
  [/^-smp$/, "Número de CPUs virtuales."],
  [/^--?enable-kvm$/, "Aceleración por hardware con KVM (VT-x / AMD-V). Sin ella QEMU emula con TCG (traducción binaria) y va lentísimo."],
  [/^-nographic$/, "Sin ventana gráfica: la consola serie de la MV sale por tu terminal (añade console=ttyS0 al kernel para ver el arranque)."],
  [/^-serial$/, "Dónde se conecta el puerto serie (la consola)."],
  [/^mon:telnet/, "Publica la consola (y el monitor de QEMU) por telnet en ese puerto del servidor. server=on,wait=off: arranca sin esperar a que alguien se conecte. Abre el puerto en el firewall."],
  [/^-qmp$/, "Canal de control QMP (JSON) para orquestar la MV desde scripts. El profesor lo usa para corregir."],
  [/^unix:/, "Socket UNIX con nombre único creado por mktemp en /var/run/qemu (crea antes la carpeta con mkdir -p)."],
  [/\.qcow2$/, "El disco de la MV (normalmente un linked clone). No uses el mismo disco en dos MVs a la vez."],
  [/^&$/, "Manda QEMU a segundo plano y te devuelve la terminal."],
  [/^<$/, "Redirección de la entrada."],
  [/^\/dev\/null$/, "Entrada vacía: sin ella, QEMU en segundo plano con -nographic se queda parado (estado T)."],
  [/^-netdev$/, "Backend de red: cómo se conecta la tarjeta al exterior (user, bridge, tap, socket…)."],
  [/^user,/, "Red user (SLiRP): NAT interno de QEMU, sin root, sin ping. hostfwd=tcp::PUERTO_HOST-:PUERTO_GUEST redirige un puerto del host a la MV."],
  [/^bridge,/, "Conecta la MV al bridge indicado (debe existir y estar permitido en /etc/qemu/bridge.conf). id = nombre para emparejarlo con -device."],
  [/^-device$/, "Frontend: el dispositivo que ve el guest."],
  [/^e1000|^virtio-net|^rtl8139/, "Modelo de tarjeta: e1000 (Intel, común), rtl8139 (antigua) o virtio-net (paravirtualizada, la más rápida). netdev= debe coincidir con el id del -netdev. mac= única en la LAN."],
  [/^-drive$/, "Añade un disco."],
  [/^file=/, "Fichero del disco extra; if=virtio lo conecta como disco virtio (/dev/vdb dentro)."],
  [/^-snapshot$/, "Snapshot temporal: los cambios se descartan al apagar la MV."],
];

const PRESETS = {
  basico: "qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm alpine-ssh1.qcow2",
  telnet: "qemu-system-x86_64 -m 1G -smp 1 -nographic --enable-kvm -serial mon:telnet::5000,server=on,wait=off alpine-ssh1.qcow2 &",
  qmp: "qemu-system-x86_64 -name prueba -qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off -nographic -m 512M -smp 2 --enable-kvm alpine-ssh2.qcow2 < /dev/null &",
  user: "qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm -netdev user,id=user.0,hostfwd=tcp::8080-:80 -device e1000,netdev=user.0 alpine-webserver.qcow2",
  bridge: "qemu-system-x86_64 -m 128M -smp 1 -nographic --enable-kvm -serial mon:telnet::5000,server=on,wait=off -device e1000,netdev=net0,mac=DE:AD:BE:EF:E3:19 -netdev bridge,br=br1,id=net0 alpine-dhcp.qcow2 &",
  disco: "qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm -drive file=datos.qcow2,format=qcow2,if=virtio alpine-ssh1.qcow2",
  snap: "qemu-system-x86_64 -nographic -m 1G --enable-kvm alpine-base.qcow2 -snapshot",
} as const;

export function CommandAnatomy() {
  const [preset, setPreset] = React.useState<keyof typeof PRESETS>("qmp");
  const tokens = PRESETS[preset].split(" ");
  const [sel, setSel] = React.useState(0);
  useShow("anat", (key) => key in PRESETS && setPreset(key as keyof typeof PRESETS));
  const help = (t: string) => FLAG_HELP.find(([re]) => re.test(t.replace(/^`|`$/g, "")))?.[1] ?? "Valor del parámetro anterior.";
  React.useEffect(() => setSel(0), [preset]);
  return (
    <figure className="dg dg-wide ca reveal" data-ns="anat">
      <figcaption className="dg-head">
        <span className="dg-kicker">Pasa el ratón o pulsa</span>
        <strong>Anatomía de un comando qemu-system</strong>
      </figcaption>
      <div className="controls">
        <Choice
          label="Ejemplo"
          value={preset}
          options={[
            { value: "basico", text: "Básico" },
            { value: "telnet", text: "Telnet" },
            { value: "qmp", text: "Corrección (QMP)" },
            { value: "user", text: "Red user + hostfwd" },
            { value: "bridge", text: "Bridge" },
            { value: "disco", text: "Disco extra" },
            { value: "snap", text: "-snapshot" },
          ]}
          onChange={setPreset}
        />
      </div>
      <p className="ca-cmd">
        {tokens.map((t, i) => (
          <button key={i} type="button" className="ca-tok" data-flag={t.startsWith("-") || i === 0 ? "" : undefined} aria-pressed={i === sel} onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onClick={() => setSel(i)}>
            {t}
          </button>
        ))}
      </p>
      <p className="dg-note">
        <code>{tokens[sel]}</code> · {help(tokens[sel])}
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Frontend and backend are paired by the same id */

type SlTest = "ext" | "loc" | "vmhost" | "ping" | "direct";
export function SlirpDiagram() {
  const [fwd, setFwd] = React.useState(true);
  const [fw, setFw] = React.useState(false);
  const [t, setT] = React.useState<SlTest>("ext");
  useShow("slirp", (key) => {
    if (key === "fwd") (setFwd(true), setFw(true), setT("ext"));
    else if (["ext", "loc", "vmhost", "ping", "direct"].includes(key)) setT(key as SlTest);
  });
  const res: Record<SlTest, [boolean, string]> = {
    ext: [fwd && fw, !fwd ? "Sin hostfwd nadie puede entrar en la MV desde fuera." : !fw ? "La regla hostfwd existe, pero el firewall del servidor bloquea el puerto 2222: firewall-cmd --add-port=2222/tcp." : "PC → KVM1:2222 → la redirección lo manda al puerto 22 de la MV."],
    loc: [fwd, fwd ? "Desde el propio servidor no hace falta abrir el firewall: ssh -p 2222 root@localhost." : "Sin hostfwd la MV no es accesible ni desde el propio host."],
    vmhost: [true, "Siempre: la puerta de enlace de SLiRP (10.0.2.2) es el host. ssh root@10.0.2.2 desde la MV llega al servidor."],
    ping: [false, "La red user no permite ICMP: ping no funciona aunque haya conexión TCP."],
    direct: [false, "10.0.2.15 es una dirección interna de QEMU: el host no tiene ruta hacia ella. Usa hostfwd."],
  };
  const [ok, why] = res[t];
  return (
    <Diagram
      ns="slirp"
      title="Red user (SLiRP): NAT dentro de QEMU"
      kicker="Backend por defecto"
      label="Un servidor KVM con su firewall y dentro el proceso QEMU con la red SLiRP: la MV 10.0.2.15, la puerta de enlace 10.0.2.2 y el DNS 10.0.2.3. Una regla hostfwd conecta el puerto 2222 del host con el 22 de la MV."
      viewBox="0 0 560 210"
      controls={
        <>
          <Choice label="hostfwd tcp::2222-:22" value={fwd ? "on" : "off"} options={[{ value: "on", text: "Sí" }, { value: "off", text: "No" }]} onChange={(v) => setFwd(v === "on")} />
          <Choice label="Firewall 2222/tcp" value={fw ? "on" : "off"} options={[{ value: "off", text: "Cerrado" }, { value: "on", text: "Abierto" }]} onChange={(v) => setFw(v === "on")} />
          <div className="choice" role="group" aria-label="Prueba">
            <span className="choice-label">Prueba</span>
            {(
              [
                ["ext", "PC → KVM1:2222"],
                ["loc", "KVM1 → localhost:2222"],
                ["vmhost", "MV → 10.0.2.2"],
                ["ping", "ping desde la MV"],
                ["direct", "KVM1 → 10.0.2.15"],
              ] as const
            ).map(([id, text]) => (
              <button key={id} type="button" aria-pressed={id === t} onClick={() => setT(id)}>
                {text}
              </button>
            ))}
          </div>
        </>
      }
      note={
        <>
          <b className={ok ? "ok-text" : "bad-text"}>{ok ? "✓" : "✗"}</b> {why}
        </>
      }
    >
      <rect className="dg-node" x={10} y={70} width={84} height={44} rx={8} />
      <text className="dg-t" x={52} y={96} textAnchor="middle">
        Tu PC
      </text>
      <rect className="nm-host" x={120} y={14} width={430} height={186} rx={14} />
      <text className="dg-kick" x={132} y={32}>
        Servidor KVM1
      </text>
      <rect className={fw ? "sl-fw open" : "sl-fw"} x={120} y={60} width={14} height={64} rx={3} />
      <text className="dg-s" x={142} y={136}>
        firewall
      </text>
      <rect className="nm-slirp" x={250} y={46} width={286} height={140} rx={12} />
      <text className="dg-kick" x={262} y={64}>
        proceso QEMU · red SLiRP 10.0.2.0/24
      </text>
      <circle className="dg-node accent" cx={300} cy={120} r={34} />
      <text className="dg-s nm-r" x={300} y={117} textAnchor="middle">
        10.0.2.2
      </text>
      <text className="dg-s nm-r" x={300} y={131} textAnchor="middle">
        gw = host
      </text>
      <text className="dg-s" x={300} y={166} textAnchor="middle">
        DNS 10.0.2.3
      </text>
      <rect className="dg-node out" x={410} y={96} width={110} height={48} rx={8} />
      <text className="dg-t" x={465} y={118} textAnchor="middle">
        MV
      </text>
      <text className="dg-s" x={465} y={134} textAnchor="middle">
        10.0.2.15 · :22
      </text>
      <path className="dg-wire" d="M334 120 L410 120" />
      <path className="dg-wire" d="M94 92 L120 92" />
      <path className={fwd ? "dg-wire accent-line" : "dg-wire"} data-flow={fwd ? "" : undefined} d="M134 92 C190 92 210 84 250 84 L420 84 L440 96" />
      <text className={fwd ? "dg-s accent-text" : "dg-s"} x={160} y={80}>
        {fwd ? ":2222 → MV:22" : "sin hostfwd"}
      </text>
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* Private bridge (P2) built step by step */

const BOOT: [number, string][] = [
  [0, "SeaBIOS (version 1.16)"],
  [350, "Booting from Hard Disk..."],
  [750, "OpenRC is starting up Linux (x86_64)"],
  [1100, " * Starting sshd ...          [ ok ]"],
  [1450, ""],
  [1500, "alpine-base login:"],
];

const POWER = [
  { id: "on", name: "Power on", soft: false, hv: "Sí", agent: "—", guest: "—", lines: BOOT, end: true, why: "Encender: arranca la BIOS virtual y después el SO guest." },
  { id: "off", name: "Power off", soft: false, hv: "Sí", agent: "Sí", guest: "poweroff -f -n -d0", lines: [[0, "▮ corte inmediato: el guest no se entera"]] as [number, string][], end: false, why: "Duro: como tirar del cable. Lo que no se había escrito a disco se pierde y el sistema de ficheros puede quedar inconsistente. En la consola de QEMU: Ctrl+A x." },
  { id: "reset", name: "Reset", soft: false, hv: "Sí", agent: "Sí", guest: "reboot -f -n -d0", lines: [[0, "▮ reinicio inmediato, sin apagado ordenado"] as [number, string], ...BOOT.map(([t, l]) => [t + 500, l] as [number, string])], end: true, why: "Duro: igual de brusco que power off, pero vuelve a arrancar." },
  {
    id: "shutdown",
    name: "Shutdown",
    soft: true,
    hv: "Evento ACPI",
    agent: "Sí",
    guest: "poweroff",
    lines: [
      [0, "(ACPI) power button pressed"],
      [400, "The system is going down NOW!"],
      [800, " * Stopping sshd ...          [ ok ]"],
      [1200, "Sent SIGTERM to all processes"],
      [1600, " * Unmounting filesystems ... [ ok ]"],
      [2000, "reboot: Power down"],
    ] as [number, string][],
    end: false,
    why: "Suave: el guest ejecuta su secuencia de apagado (para servicios, vacía cachés, desmonta discos) y se apaga él solo. Desde el hipervisor se pide con un evento ACPI (system_powerdown en el monitor).",
  },
  {
    id: "reboot",
    name: "Reboot",
    soft: true,
    hv: "—",
    agent: "Sí",
    guest: "reboot",
    lines: [
      [0, "The system is going down NOW!"],
      [400, " * Stopping sshd ...          [ ok ]"],
      [800, " * Unmounting filesystems ... [ ok ]"],
      [1200, "reboot: Restarting system"],
      ...BOOT.map(([t, l]) => [t + 1600, l] as [number, string]),
    ] as [number, string][],
    end: true,
    why: "Suave: apagado ordenado desde dentro y nuevo arranque.",
  },
];

export function PowerSim() {
  const [run, setRun] = React.useState<{ id: string; n: number } | null>(null);
  const [lines, setLines] = React.useState<string[]>(["alpine-base login:"]);
  const [on, setOn] = React.useState(true);
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const act = (id: string) => {
    const a = POWER.find((x) => x.id === id)!;
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setRun({ id, n: (run?.n ?? 0) + 1 });
    setLines([]);
    if (!a.soft && a.id !== "on") setOn(false);
    a.lines.forEach(([t, l], i) =>
      timers.current.push(
        window.setTimeout(() => {
          setLines((ls) => [...ls.slice(-6), l]);
          if (i === a.lines.length - 1) setOn(a.end);
          else if (a.end && t >= (a.id === "on" ? 0 : 500)) setOn(true);
        }, t),
      ),
    );
  };
  const cur = POWER.find((x) => x.id === run?.id);
  return (
    <figure className="dg dg-wide reveal" data-ns="power">
      <figcaption className="dg-head">
        <span className="dg-kicker">Acciones de energía · pulsa una fila</span>
        <strong>Duro vs suave</strong>
      </figcaption>
      <div className="pw-sim">
        <table className="pw-table">
          <thead>
            <tr>
              <th>Acción</th>
              <th>Hipervisor</th>
              <th>Agente</th>
              <th>Dentro del guest</th>
            </tr>
          </thead>
          <tbody>
            {POWER.map((a) => (
              <tr key={a.id} className="pw-row" data-on={run?.id === a.id ? "" : undefined} data-soft={a.soft ? "" : undefined} onClick={() => act(a.id)}>
                <th>
                  <button type="button" onClick={(e) => (e.stopPropagation(), act(a.id))}>
                    ▶ {a.name} <span className="pw-kind">{a.id === "on" ? "" : a.soft ? "suave" : "duro"}</span>
                  </button>
                </th>
                <td>{a.hv}</td>
                <td>{a.agent}</td>
                <td>{a.guest === "—" ? "—" : <code>{a.guest}</code>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="pw-screen" data-off={on ? undefined : ""}>
          <div className="pw-bar">
            <span className="pw-led" data-on={on ? "" : undefined} /> consola de la MV
          </div>
          <pre className="pw-console" aria-live="polite">
            {lines.join("\n")}
            {on ? <span className="pw-caret">▌</span> : null}
          </pre>
        </div>
      </div>
      <p className="dg-note">{cur ? <><b>{cur.name}:</b> {cur.why}</> : "Pulsa una acción y mira qué le da tiempo a hacer al guest."}</p>
    </figure>
  );
}
