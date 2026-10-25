"use client";

import * as React from "react";
import { Cmd } from "../code";
import { Choice } from "../figs/common";
import { Diagram, Steps, useSteps } from "./kit";

/* ------------------------------------------------------------------ */
/* Where am I? The prompt tells you, and poweroff means very different things */

const HOPS = [
  { id: "pc", t: "PC del laboratorio", s: "Windows 11 · PuTTY" },
  { id: "vpn", t: "VPN DACALUM", s: "red 10.0.16.0/20" },
  { id: "kvm", t: "Servidor KVM1", s: "Linux + QEMU/KVM" },
  { id: "vm", t: "Máquina virtual", s: "Alpine Linux" },
] as const;

const PROMPTS = [
  { p: "C:\\Users\\alumno>", at: "pc", say: "Estás en el PC del laboratorio (Windows). poweroff no existe aquí; para entrar al servidor: ssh root@IP_KVM o PuTTY." },
  { p: "[root@vm-16-173 ~]#", at: "kvm", say: "Estás en el SERVIDOR KVM1 (10.0.16.173 → vm-16-173). Un poweroff aquí apaga el servidor entero y solo el profesor puede encenderlo. Por eso el alias de seguridad." },
  { p: "localhost:~#", at: "vm", say: "Estás DENTRO de la máquina virtual. Aquí poweroff apaga solo la MV (apagado ordenado). Si se cuelga: Ctrl+A y luego x." },
  { p: "alpine-base:~#", at: "vm", say: "También dentro de una MV (el hostname interno de la imagen es alpine-base). poweroff apaga solo la MV." },
] as const;

export function WhereAmI() {
  const [i, setI] = React.useState(1);
  const pr = PROMPTS[i];
  return (
    <Diagram
      title="¿Dónde estoy? Mira el prompt"
      kicker="Antes de teclear poweroff"
      label="Camino de la conexión: PC del laboratorio, VPN, servidor KVM y máquina virtual. Según el prompt se ilumina dónde estás."
      viewBox="0 0 560 130"
      controls={
        <div className="choice" role="group" aria-label="Prompt">
          <span className="choice-label">Prompt</span>
          {PROMPTS.map((x, j) => (
            <button key={x.p} type="button" aria-pressed={j === i} onClick={() => setI(j)}>
              <code>{x.p}</code>
            </button>
          ))}
        </div>
      }
      note={pr.say}
    >
      {HOPS.map((h, j) => {
        const x = 8 + j * 140;
        const on = h.id === pr.at;
        return (
          <g key={h.id}>
            {j ? <path className="dg-wire" data-flow="" d={`M${x - 22} 60 L${x} 60`} /> : null}
            <rect className={on ? "dg-node accent" : "dg-node"} x={x} y={30} width={118} height={60} rx={10} />
            <text className={on ? "dg-t wa-on" : "dg-t"} x={x + 59} y={56} textAnchor="middle">
              {h.t}
            </text>
            <text className={on ? "dg-s wa-on" : "dg-s"} x={x + 59} y={74} textAnchor="middle">
              {h.s}
            </text>
          </g>
        );
      })}
      <text className="dg-s" x={150} y={112}>
        túnel
      </text>
      <text className="dg-s" x={290} y={112}>
        ssh root@IP
      </text>
      <text className="dg-s" x={430} y={112}>
        qemu-system-x86_64 …
      </text>
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* qemu-img lab: run the practice's commands and watch the files */

interface Img {
  dir: "/exports/VMs" | "/home/VMs";
  name: string;
  kind: "base" | "link" | "clone" | "full" | "copy";
  backing?: string;
  size: string;
  snaps: string[];
  ro?: boolean;
}

type Op = { id: string; cmd: string; need: (s: Img[]) => boolean; run: (s: Img[]) => { files: Img[]; out: string } };

const has = (s: Img[], name: string) => s.some((f) => f.name === name);
const base = (s: Img[]) => s.find((f) => f.kind === "base");

const OPS: Op[] = [
  {
    id: "wget",
    cmd: "cd /exports/VMs && wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2",
    need: (s) => !base(s),
    run: (s) => ({ files: [...s, { dir: "/exports/VMs", name: "alpine-base.qcow2", kind: "base", size: "303 MB", snaps: [] }], out: "alpine-base.qcow2   100%[===================>] 303M  …  guardado" }),
  },
  {
    id: "ln",
    cmd: "cd /home/VMs && ln -s /exports/VMs/alpine-base.qcow2 alpine-base.qcow2",
    need: (s) => !!base(s) && !s.some((f) => f.kind === "link"),
    run: (s) => ({ files: [...s, { dir: "/home/VMs", name: "alpine-base.qcow2", kind: "link", size: "→", snaps: [] }], out: "ls -l\nlrwxrwxrwx 1 root root 30 alpine-base.qcow2 -> /exports/VMs/alpine-base.qcow2" }),
  },
  ...["alpine-ssh1.qcow2", "alpine-ssh2.qcow2"].map(
    (name): Op => ({
      id: name,
      cmd: `qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 ${name}`,
      need: (s) => s.some((f) => f.kind === "link") && !has(s, name),
      run: (s) => ({ files: [...s, { dir: "/home/VMs", name, kind: "clone", backing: "alpine-base.qcow2", size: "196 KB", snaps: [] }], out: `Formatting '${name}', fmt=qcow2 … backing_file=alpine-base.qcow2 backing_fmt=qcow2` }),
    }),
  ),
  {
    id: "info",
    cmd: "qemu-img info --backing-chain alpine-ssh1.qcow2",
    need: (s) => has(s, "alpine-ssh1.qcow2"),
    run: (s) => ({
      files: s,
      out: "image: alpine-ssh1.qcow2\nfile format: qcow2\ndisk size: 196 KiB\nbacking file: alpine-base.qcow2\nbacking file format: qcow2\n\nimage: alpine-base.qcow2\nfile format: qcow2\ndisk size: 303 MiB",
    }),
  },
  {
    id: "snap",
    cmd: "qemu-img snapshot -c limpio alpine-ssh1.qcow2",
    need: (s) => has(s, "alpine-ssh1.qcow2") && !s.find((f) => f.name === "alpine-ssh1.qcow2")!.snaps.length,
    run: (s) => ({ files: s.map((f) => (f.name === "alpine-ssh1.qcow2" ? { ...f, snaps: ["limpio"] } : f)), out: "(sin salida) · snapshot interno «limpio» guardado dentro del qcow2. Con la MV apagada." }),
  },
  {
    id: "list",
    cmd: "qemu-img snapshot -l alpine-ssh1.qcow2",
    need: (s) => !!s.find((f) => f.name === "alpine-ssh1.qcow2")?.snaps.length,
    run: (s) => ({ files: s, out: "Snapshot list:\nID  TAG     VM SIZE  DATE        VM CLOCK\n1   limpio  0 B      2026-11-12  00:00:00.000" }),
  },
  {
    id: "convert",
    cmd: "qemu-img convert -O qcow2 alpine-ssh1.qcow2 ssh1-full.qcow2",
    need: (s) => has(s, "alpine-ssh1.qcow2") && !has(s, "ssh1-full.qcow2"),
    run: (s) => ({ files: [...s, { dir: "/home/VMs", name: "ssh1-full.qcow2", kind: "full", size: "≈ 300 MB", snaps: [] }], out: "(sin salida) · full clone: copia completa, sin backing file. Independiente de la base." }),
  },
  {
    id: "cp",
    cmd: "cp alpine-ssh2.qcow2 copia.qcow2   # ¡trampa!",
    need: (s) => has(s, "alpine-ssh2.qcow2") && !has(s, "copia.qcow2"),
    run: (s) => ({ files: [...s, { dir: "/home/VMs", name: "copia.qcow2", kind: "clone", backing: "alpine-base.qcow2", size: "196 KB", snaps: [] }], out: "cp copia el fichero tal cual: solo el delta. ¡copia.qcow2 sigue dependiendo de alpine-base.qcow2!" }),
  },
  {
    id: "chmod",
    cmd: "chmod -w /exports/VMs/alpine-base.qcow2",
    need: (s) => !!base(s) && !base(s)!.ro,
    run: (s) => ({ files: s.map((f) => (f.kind === "base" ? { ...f, ro: true } : f)), out: "La base queda de solo lectura: nadie puede estropearla por error (los clones solo la leen)." }),
  },
  {
    id: "rm",
    cmd: "rm /exports/VMs/alpine-base.qcow2   # ¡no lo hagas!",
    need: (s) => !!base(s),
    run: (s) => ({ files: s.filter((f) => f.kind !== "base"), out: "Los clones enlazados apuntan a una base que ya no existe:\nqemu-system-x86_64: Could not open backing file … No such file or directory" }),
  },
];

export function QemuImgLab() {
  const [files, setFiles] = React.useState<Img[]>([]);
  const [out, setOut] = React.useState("mkdir -p /exports/VMs /home/VMs  # carpetas creadas");
  const [last, setLast] = React.useState("");
  const baseOk = !!base(files);
  return (
    <figure className="dg dg-wide qil reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">Simulador</span>
        <strong>Laboratorio de qemu-img (Práctica 1)</strong>
      </figcaption>
      <div className="qil-ops">
        {OPS.map((op) => (
          <button
            key={op.id}
            type="button"
            className="qil-op"
            disabled={!op.need(files)}
            data-done={last === op.id ? "" : undefined}
            onClick={() => {
              const r = op.run(files);
              setFiles(r.files);
              setOut(r.out);
              setLast(op.id);
            }}
          >
            <code>{op.cmd}</code>
          </button>
        ))}
        <button type="button" className="btn ghost" onClick={() => (setFiles([]), setOut("mkdir -p /exports/VMs /home/VMs  # carpetas creadas"), setLast(""))}>
          Reiniciar
        </button>
      </div>
      <div className="qil-dirs">
        {(["/exports/VMs", "/home/VMs"] as const).map((d) => (
          <div key={d} className="qil-dir">
            <span className="emu-h">{d}</span>
            {files.filter((f) => f.dir === d).length === 0 ? <p className="qil-empty">vacía</p> : null}
            {files
              .filter((f) => f.dir === d)
              .map((f) => {
                const broken = (f.kind === "clone" || f.kind === "link") && !baseOk;
                return (
                  <div key={f.name} className="qil-file" data-kind={f.kind} data-broken={broken ? "" : undefined}>
                    <strong>{f.name}</strong>
                    <span>
                      {f.kind === "base" ? `base · ${f.size}${f.ro ? " · solo lectura" : ""}` : f.kind === "link" ? "enlace simbólico → /exports/VMs/alpine-base.qcow2" : f.kind === "full" ? `full clone · ${f.size} · independiente` : `linked clone · ${f.size} · backing: ${f.backing}`}
                      {f.snaps.length ? ` · snapshots: ${f.snaps.join(", ")}` : ""}
                      {broken ? " · ✗ ROTO" : ""}
                    </span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <pre className="qil-out">
        <span className="cmd-c">$ {OPS.find((o) => o.id === last)?.cmd ?? "mkdir -p /exports/VMs /home/VMs"}</span>
        {"\n"}
        {out}
      </pre>
      <p className="dg-note">
        Salidas simplificadas. Recuerda: <b>-f</b> es el formato del disco nuevo, <b>-F</b> el del base y <b>-b</b> el base. Nunca muevas ni borres la base de un linked clone.
      </p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Anatomy of a qemu-system-x86_64 command */

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
  const help = (t: string) => FLAG_HELP.find(([re]) => re.test(t.replace(/^`|`$/g, "")))?.[1] ?? "Valor del parámetro anterior.";
  React.useEffect(() => setSel(0), [preset]);
  return (
    <figure className="dg dg-wide ca reveal">
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

export function NetdevPairing() {
  const [bad, setBad] = React.useState(false);
  return (
    <Diagram
      title="-netdev + -device: el mismo id"
      kicker="Frontend y backend"
      label="Dos fragmentos del comando: el backend -netdev con id net0 y el frontend -device con netdev=net0, unidos por una línea. Con un id distinto la unión se rompe."
      viewBox="0 0 560 150"
      controls={
        <Choice
          label="Comando"
          value={bad ? "b" : "g"}
          options={[
            { value: "g", text: "Bien emparejado" },
            { value: "b", text: "Con un error" },
          ]}
          onChange={(v) => setBad(v === "b")}
        />
      }
      note={
        bad ? (
          <>QEMU no arranca: <code>Property &apos;e1000.netdev&apos; can&apos;t find value &apos;net1&apos;</code>. El <code>netdev=</code> del dispositivo tiene que ser exactamente el <code>id=</code> de un <code>-netdev</code>.</>
        ) : (
          <><b>Frontend</b> (<code>-device</code>): la tarjeta que ve el guest. <b>Backend</b> (<code>-netdev</code>): cómo sale al exterior. Se emparejan por el id. Atajo: <code>-nic user,model=virtio-net-pci</code> hace las dos cosas.</>
        )
      }
    >
      <rect className="dg-node out" x={14} y={30} width={250} height={56} rx={10} />
      <text className="dg-kick" x={24} y={24}>
        backend
      </text>
      <text className="dg-t mono" x={30} y={63}>
        -netdev user,id=net0
      </text>
      <rect className="dg-node out" x={296} y={30} width={250} height={56} rx={10} />
      <text className="dg-kick" x={306} y={24}>
        frontend (vNIC)
      </text>
      <text className="dg-t mono" x={310} y={63}>
        -device e1000,netdev={bad ? "net1" : "net0"}
      </text>
      <path className={bad ? "dg-wire neg" : "dg-wire accent-line"} d="M190 86 C200 128 440 128 456 86" strokeDasharray={bad ? "6 8" : undefined} />
      <text className={bad ? "dg-t bad-text" : "dg-t ok-text"} x={280} y={136} textAnchor="middle">
        {bad ? "✗ net0 ≠ net1" : "✓ mismo id"}
      </text>
    </Diagram>
  );
}

/* ------------------------------------------------------------------ */
/* User networking (SLiRP): NAT, hostfwd and the firewall */

type SlTest = "ext" | "loc" | "vmhost" | "ping" | "direct";
export function SlirpDiagram() {
  const [fwd, setFwd] = React.useState(true);
  const [fw, setFw] = React.useState(false);
  const [t, setT] = React.useState<SlTest>("ext");
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
      <text className="dg-s" x={127} y={140} textAnchor="middle">
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

const BR_STEPS = [
  {
    t: "Crear el bridge br1 con IP fija para el host",
    cmd: "nmcli connection add type bridge con-name bridge1 ifname br1 \\\n  ipv4.method manual ipv4.addresses 10.0.0.1/24 \\\n  ipv6.method disabled stp no autoconnect yes\nip addr show br1   # NO-CARRIER, state DOWN hasta que se conecte una MV",
  },
  { t: "Permitir a QEMU usar br1", cmd: 'echo "allow br1" >> /etc/qemu/bridge.conf   # ACL de bridges' },
  {
    t: "Lanzar el servidor DHCP (IP fija 10.0.0.253)",
    cmd: "qemu-system-x86_64 -m 128M -smp 1 -nographic --enable-kvm \\\n  -serial mon:telnet::5000,server=on,wait=off \\\n  -device e1000,netdev=net0,mac=DE:AD:BE:EF:E3:19 \\\n  -netdev bridge,br=br1,id=net0 alpine-dhcp.qcow2 &",
  },
  {
    t: "Lanzar los clientes: MAC, puerto y disco distintos",
    cmd: "qemu-system-x86_64 -m 256M -nographic --enable-kvm \\\n  -serial mon:telnet::5001,server=on,wait=off \\\n  -device e1000,netdev=n0,mac=DE:AD:BE:EF:E3:1A \\\n  -netdev bridge,br=br1,id=n0 alpine-ssh1.qcow2 &\n# y otra con :5002, ...:E3:1B y alpine-ssh2.qcow2",
  },
  { t: "DHCP: los clientes piden IP (DISCOVER → OFFER → REQUEST → ACK)", cmd: "# dentro del servidor DHCP\ncat /etc/dhcp/dhcpd.conf\ngrep dhcpd /var/log/messages" },
  { t: "Probar: host ↔ MVs y MV ↔ MV", cmd: "ssh root@10.0.0.X        # desde el host (10.0.0.1)\nping 10.0.0.1            # desde una MV: el host está en el bridge" },
];

export function BridgeLab() {
  const { step, playing, play, go } = useSteps(BR_STEPS.length, 2600);
  const s = BR_STEPS[step];
  const vms = [
    { name: "DHCP", ip: "10.0.0.253", mac: "…:E3:19", from: 2 },
    { name: "ssh1", ip: step >= 4 ? "10.0.0.x (DHCP)" : "sin IP", mac: "…:E3:1A", from: 3 },
    { name: "ssh2", ip: step >= 4 ? "10.0.0.y (DHCP)" : "sin IP", mac: "…:E3:1B", from: 3 },
  ];
  return (
    <figure className="dg dg-wide reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">Práctica 2 paso a paso</span>
        <strong>Bridge privado br1 con servidor DHCP</strong>
      </figcaption>
      <svg className="dg-svg" viewBox="0 0 560 190" role="img" aria-label="Un bridge br1 al que se conectan el host, un servidor DHCP y dos clientes. El bridge no está conectado a ninguna NIC real.">
        <rect className="nm-host" x={8} y={8} width={544} height={174} rx={14} />
        <text className="dg-kick" x={20} y={26}>
          Servidor KVM · el bridge no toca ninguna NIC real (red privada)
        </text>
        <rect className="dg-node" x={18} y={120} width={92} height={40} rx={6} />
        <text className="dg-s" x={64} y={144} textAnchor="middle">
          ens32 / ens33
        </text>
        <path className="nm-cut" d="M112 130 L126 150 M126 130 L112 150" />
        {step >= 0 ? (
          <g>
            <rect className="br-bar" x={130} y={126} width={400} height={20} rx={10} />
            <text className="dg-t br-t" x={330} y={140} textAnchor="middle">
              br1 · host 10.0.0.1/24 {step >= 1 ? "· allow br1 ✓" : ""}
            </text>
          </g>
        ) : null}
        {vms.map((v, i) =>
          step >= v.from ? (
            <g key={v.name} className="br-vm">
              <path className="dg-wire" data-flow={step === 4 && i > 0 ? "" : undefined} d={`M${190 + i * 130} 96 L${190 + i * 130} 126`} />
              <rect className={i === 0 ? "dg-node accent" : "dg-node out"} x={130 + i * 130} y={44} width={120} height={52} rx={8} />
              <text className={i === 0 ? "dg-t wa-on" : "dg-t"} x={190 + i * 130} y={64} textAnchor="middle">
                {v.name}
              </text>
              <text className={i === 0 ? "dg-s wa-on" : "dg-s"} x={190 + i * 130} y={80} textAnchor="middle">
                {v.ip} · {v.mac}
              </text>
            </g>
          ) : null,
        )}
      </svg>
      <Steps step={step} total={BR_STEPS.length} playing={playing} onPlay={play} onStep={go} labels={BR_STEPS.map((x, i) => `${i + 1}/${BR_STEPS.length} · ${x.t}`)} />
      <Cmd>{s.cmd}</Cmd>
    </figure>
  );
}
