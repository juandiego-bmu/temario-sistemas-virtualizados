// The two labs of 4–5 Nov 2026 as data: the replay script (run through exec() exactly as a player would), the goals for
// Jugar, the traps for «Con las trampas», the Planifica cards and the clickable map. Every command lives once, in `cmds`.
import { chain, dhcpdConf, exec, hostOf, links, netOf, newLab, real, refresh, serving, type Lab, type Term, type Vm } from "./model";

/** One line typed in a terminal. */
export interface Cmd {
  term: Term;
  text: string; // exactly what is typed: "" = Enter, "^]" = Ctrl+]
  wait?: number; // sim ms to let pass before typing it (boots); the player scales it with the speed
  secret?: boolean; // a password: show it masked (any password works)
  edit?: boolean; // the whole new file for the open vi (the player animates the change; :wq comes next)
  note?: string; // a caption for this line (traps)
  lapse?: { from: string; to: string; asks: number }; // time-lapse: jump `wait` ms at once, with a spinning clock
}
export interface Step {
  id: string;
  goal: string; // Jugar shows only this
  why: string; // caption in Ver · Pista 1 (qué y por qué)
  pdf: string[]; // 📍 badges · Pista 2
  essential?: string; // ⚠️ No está en el PDF: …
  analogy?: string; // the hotel, when it helps
  focus: string; // camera: a node id (srv:IP, br:IP:BR, vx:IP:IF, gate:IP), vm:IP:NAME, tunnel:VNI, gates, street, overview
  cmds: Cmd[]; // the replay · Pista 3 (hintCmds)
  plan?: boolean; // the Planifica mini-game (no commands): the UI adds "plan" to lab.done when it is solved
  done: (lab: Lab) => boolean; // Jugar: any valid command counts
}
/** A real mistake: it plays before step `at`, from that step's starting state; then the player rewinds (cloneLab) and plays the step right. */
export interface Trap {
  id: string;
  at: number;
  title: string;
  flag: string; // lab.done flag the simulator sets when the mistake happens live (Cazatrampas)
  cmds: Cmd[]; // the mistake, what it causes and, when the step itself is not the fix, the fix
  lesson: string;
  analogy?: string;
}
export interface PlanCard {
  id: string; // = the step id
  text: string;
  deps: { id: string; why: string }[]; // cards that must come before, and why
}
export interface Ref {
  step: number;
  cmd: number;
}
/** A click target of the map: refs point into steps[step].cmds (the command for that piece or that end). */
export interface Piece {
  id: string;
  kind: "tower" | "bridge" | "gate" | "vxlan" | "tunnel" | "vm" | "service" | "cable" | "console" | "user" | "door" | "exterior";
  host?: "kvm1" | "kvm2";
  node: string; // scene id: srv:IP, br:IP:BR, gate:IP, vx:IP:IF, tunnel:VNI, vm:IP:NAME, dhcpd:IP:NAME, cable:IP:NAME:NIC, console:IP:PORT, user:IP:NAME, fw:IP:PORT, pc
  name: string;
  what: string; // «qué es», one line
  pdf: string[];
  essential?: string;
  refs: Ref[]; // its commands, in order
  inner?: Ref[]; // commands run inside it (DHCP VM, tiers)
  nic?: number; // cables: which NIC of the refs[0] qemu line (nicArgs)
  hl?: string[]; // words to highlight in the command (vxlan ends: remote/master; cables: netdev=/id=)
  pair?: string; // the other end of the same link
  links: string[]; // pieces it connects to (hover)
}
export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  test?: (lab: Lab) => boolean; // unlocked by the lab state; without it the UI decides (sin-pistas, cazatrampas, buen-plan)
}
export interface LabDef {
  id: "clase" | "pizarra";
  title: string;
  intro: string;
  start: () => Lab; // VPN on, one terminal per KVM (still on your PC: step 0 is the ssh), plus the pc one
  steps: Step[];
  traps: Trap[];
  plan?: PlanCard[];
  pieces: Piece[];
}

export const K1 = "10.0.16.173";
export const K2 = "10.0.16.174";
const REPO = "www.ho.ac.uma.es/virt/installed-systems";
const hk = (l: Lab, ip: string) => hostOf(l, ip)!;
/** A running VM by name (its disk without .qcow2) on a host. */
export const vmAt = (l: Lab, ip: string, name: string): Vm | undefined => hk(l, ip).vms.find((v) => v.disk.split("/").pop() === `${name}.qcow2`);
const cloneOf = (l: Lab, ip: string, path: string, base: string) => {
  const img = real(hk(l, ip), path);
  return img?.kind === "clone" && img.bname === base && !chain(hk(l, ip), path).broken;
};
/** eth0 of a DHCP VM written as asked: static, /24, no gateway (setup-interfaces proposes 255.0.0.0 and 10.0.0.254). */
const eth0Ok = (l: Lab, ip: string, name: string) => {
  const v = vmAt(l, ip, name);
  const e = v && netOf(hk(l, ip), v).ifs.eth0;
  return e?.type === "static" && e.mask === "255.255.255.0" && !e.gw;
};
const lanIp = (l: Lab, br: string, prefix: string) => l.hosts.every((h) => h.vms.filter((v) => v.role !== "dhcp").every((v) => v.nics.every((n) => n.br !== br || !!n.ip?.startsWith(prefix))));

/** Lines of a terminal: k("kvm1")("cmd", 4000). */
const k = (term: Term) => (text: string, wait?: number, more: Partial<Cmd> = {}): Cmd => ({ term, text, ...(wait ? { wait } : {}), ...more });
const k1 = k("kvm1");
const k2 = k("kvm2");
const pc = k("pc");
const login = (t: Term): Cmd[] => [k(t)(""), k(t)("root"), k(t)("", 0, { secret: true })];
const leave = (t: Term): Cmd[] => [k(t)("^]"), k(t)("quit")];
/** The same lines in both terminals, interleaved: KVM1, KVM2, KVM1… (the professor's tip). */
const both = (f: (t: Term, ip: string, other: string, n: 1 | 2) => (Cmd | string)[]): Cmd[] => {
  const a = f("kvm1", K1, K2, 1).map((x) => (typeof x === "string" ? k1(x) : x));
  const b = f("kvm2", K2, K1, 2).map((x) => (typeof x === "string" ? k2(x) : x));
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter(Boolean);
};

const bridge = (b: string) => `nmcli connection add type bridge con-name ${b} ifname ${b} ipv4.method disabled ipv6.method disabled stp no autoconnect yes`;
const allow = (b: string) => `echo 'allow ${b}' >> /etc/qemu/bridge.conf`;
const vxlan = (name: string, id: number, remote: string, br: string) => `nmcli connection add type vxlan slave-type bridge con-name ${name} ifname ${name} id ${id} remote ${remote} master ${br}`;
const fw = (port: string) => [`firewall-cmd --add-port=${port} --permanent`, `firewall-cmd --add-port=${port}`];
/** Inside a DHCP VM: new IP for eth0, then the range (same procedure in both labs). */
const dhcpSetup = (t: Term, ip: string, net: string, from: string, to: string): Cmd[] => [
  ...["setup-interfaces", "eth0", ip, "255.255.255.0", "none", "n", "service networking restart"].map((x) => k(t)(x)),
  k(t)("vi /etc/dhcp/dhcpd.conf"),
  k(t)(dhcpdConf(net, from, to), 0, { edit: true }),
  k(t)(":wq"),
  k(t)("service dhcpd restart"),
];

/** Lab start: VPN on, the KVM1/KVM2 terminals on your PC (step 0 enters), KVM1 still has the practice 1 base. */
function start(day: string, clock: number) {
  return () => {
    const lab = newLab();
    lab.real = true;
    lab.vpn = true;
    lab.day = day;
    lab.clock = clock;
    lab.stacks = { pc: lab.stack, kvm1: [{ k: "pc" }], kvm2: [{ k: "pc" }] };
    lab.term = "kvm1";
    lab.stack = lab.stacks.kvm1!;
    const h = hk(lab, K1);
    for (const d of ["/exports", "/exports/VMs", "/home/VMs", "/home/ensayo"]) h.dirs.add(d);
    h.files.set("/exports/VMs/alpine-base.qcow2", { path: "/exports/VMs/alpine-base.qcow2", kind: "base", fmt: "qcow2", virt: 8192, used: 310336, snaps: [], role: "plain", ro: false, tty: true });
    return lab;
  };
}

/** Pista 3: a step's commands in order, each in its own terminal (no Enter, no passwords; an edit is the whole file for vi). */
export const hintCmds = (s: Step) => s.cmds.filter((c) => c.text && !c.secret);
/** The command a map reference points to. */
export const cmdAt = (lab: LabDef, r: Ref) => lab.steps[r.step].cmds[r.cmd];
/** The -device / -netdev pair of NIC i in a qemu line (map cables): netdev= and id= match. */
export function nicArgs(text: string, i: number): string[] {
  const t = text.split(/\s+/);
  const dev = t.flatMap((x, j) => (x === "-device" && /^(e1000|virtio|rtl8139)/.test(t[j + 1] ?? "") ? [t[j + 1]] : []))[i];
  const id = /netdev=([^,]+)/.exec(dev ?? "")?.[1];
  const nd = t.flatMap((x, j) => (x === "-netdev" ? [t[j + 1]] : [])).find((x) => x.split(",").includes(`id=${id}`));
  return dev && nd ? [`-device ${dev}`, `-netdev ${nd}`] : [];
}
/** Planifica: the dependencies broken by an order of card ids (empty = a valid plan). */
export const planCheck = (cards: PlanCard[], order: string[]) => cards.flatMap((c) => c.deps.filter((d) => order.indexOf(d.id) > order.indexOf(c.id)).map((d) => ({ card: c.id, dep: d.id, why: d.why })));

/** Builds map refs by finding commands in the steps (from step `from` on; "=text" = exactly that), so the map never copies a command. */
function finder(steps: Step[]) {
  const ref = (term: Term, needle: string, from = 0, after?: Ref): Ref => {
    for (let s = after?.step ?? from; s < steps.length; s++) {
      const cmd = steps[s].cmds.findIndex((c, i) => (!after || s > after.step || i > after.cmd) && c.term === term && (needle.startsWith("=") ? c.text === needle.slice(1) : c.text.includes(needle)));
      if (cmd >= 0) return { step: s, cmd };
    }
    throw new Error(`Mapa: ningún comando de ${term} con «${needle}» desde el paso ${from}`);
  };
  /** Every command of that terminal from the one with `a` to the next one with `b`. */
  const span = (term: Term, step: number, a: string, b: string, after?: Ref): Ref[] => {
    const x = ref(term, a, step, after);
    const y = ref(term, b, x.step, x);
    return Array.from({ length: y.cmd - x.cmd + 1 }, (_, i) => ({ step: x.step, cmd: x.cmd + i })).filter((r) => steps[r.step].cmds[r.cmd].term === term);
  };
  return { ref, span };
}

/* ================================================================== Tarea de clase · DHCP + VXLAN */

const SIM = "/home/ensayo/simulacro";
const DHCP1 = "qemu-system-x86_64 -m 128M -smp 1 --enable-kvm -nographic -device e1000,netdev=net0,mac=DE:AD:BE:EF:E3:50 -netdev bridge,br=kvm1-br1,id=net0 -serial mon:telnet::5001,server=on,wait=off dhcp1.qcow2 < /dev/null &";
const CLI1 = "qemu-system-x86_64 -m 128M -smp 1 --enable-kvm -nographic -device e1000,netdev=net0,mac=DE:AD:BE:EF:E3:51 -netdev bridge,br=kvm1-br1,id=net0 -serial mon:telnet::5000,server=on,wait=off cliente1.qcow2 < /dev/null &";
const CLI2 = "qemu-system-x86_64 --enable-kvm -nographic -m 128M -smp 1 -device e1000,netdev=kvm2-net,mac=DE:AD:BE:EF:E3:52 -netdev bridge,br=kvm2-br1,id=kvm2-net -serial mon:telnet::5000,server=on,wait=off cliente2.qcow2 < /dev/null &";
const BOOT = 4000; // a VM with KVM is up after ~3.6 s
const onBr = (l: Lab, ip: string, br: string, net: string) => hk(l, ip).vms.some((v) => v.role !== "dhcp" && v.nics.some((n) => n.br === br && n.ip?.startsWith(net)));
const subOf = (l: Lab, ip: string, name: string) => {
  const v = vmAt(l, ip, name);
  return v && serving(v);
};

const claseSteps: Step[] = [
  {
    id: "ssh",
    goal: "Abre una terminal en cada KVM: KVM1 a la izquierda, KVM2 a la derecha",
    why: "Todo se hace dentro de los servidores. Con una terminal por KVM, lo que es igual en las dos lo escribes a la vez.",
    pdf: ["P1 pág. 3"],
    focus: "overview",
    cmds: [k1(`ssh root@${K1}`), k2(`ssh root@${K2}`)],
    done: (l) => l.done.has(`ssh:${K1}`) && l.done.has(`ssh:${K2}`),
  },
  {
    id: "br1",
    goal: "Crea en KVM1 un bridge kvm1-br1 sin IP en el host",
    why: "Un bridge es un switch virtual. Sin IP, el host no entra en esa LAN: solo la usan las MVs.",
    pdf: ["P2-1 pág. 6"],
    essential: "No está en el PDF: ipv4.method disabled (sin IP); sale en man nm-settings-nmcli. Que la IP es opcional lo dice P2-2 pág. 4.",
    analogy: "El pasillo del hotel: las habitaciones abren su puerta aquí.",
    focus: `br:${K1}:kvm1-br1`,
    cmds: [k1(bridge("kvm1-br1"))],
    done: (l) => hk(l, K1).bridges.get("kvm1-br1")?.method === "disabled",
  },
  {
    id: "allow1",
    goal: "Deja que QEMU use ese bridge",
    why: "/etc/qemu/bridge.conf es la lista de bridges que QEMU puede usar. Con >> añades una línea; con > borrarías las demás.",
    pdf: ["P2-1 pág. 6", "P2-2 pág. 2"],
    focus: `br:${K1}:kvm1-br1`,
    cmds: [k1(allow("kvm1-br1"))],
    done: (l) => hk(l, K1).allow.has("kvm1-br1"),
  },
  {
    id: "imgs",
    goal: `Descarga las imágenes en ${SIM}`,
    why: "alpine-dhcp.qcow2 es a su vez un linked clone de alpine-base.qcow2: necesita su base al lado y con ese nombre exacto.",
    pdf: ["P1 pág. 3", "P2-1 pág. 5"],
    focus: `srv:${K1}`,
    cmds: [k1(`mkdir -p ${SIM}`), k1(`cd ${SIM}`), k1(`wget ${REPO}/alpine-dhcp.qcow2`), k1(`wget ${REPO}/alpine-base.qcow2`)],
    done: (l) => ["alpine-dhcp", "alpine-base"].every((n) => !!real(hk(l, K1), `${SIM}/${n}.qcow2`) && !chain(hk(l, K1), `${SIM}/${n}.qcow2`).broken),
  },
  {
    id: "clones",
    goal: "Crea los linked clones dhcp1.qcow2 (de alpine-dhcp) y cliente1.qcow2 (de alpine-base)",
    why: "Las imágenes descargadas no se arrancan nunca: cada MV escribe en su propio clon. -F es el formato de la base, -f el del clon y -b la base.",
    pdf: ["P1 pág. 4"],
    focus: `srv:${K1}`,
    cmds: [k1("qemu-img create -F qcow2 -f qcow2 -b alpine-dhcp.qcow2 dhcp1.qcow2"), k1("qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 cliente1.qcow2")],
    done: (l) => cloneOf(l, K1, `${SIM}/dhcp1.qcow2`, "alpine-dhcp.qcow2") && cloneOf(l, K1, `${SIM}/cliente1.qcow2`, "alpine-base.qcow2"),
  },
  {
    id: "dhcp-up",
    goal: "Arranca el DHCP (dhcp1.qcow2) en el bridge (MAC …:50, consola 5001)",
    why: "-device es la tarjeta y -netdev su enchufe al bridge: netdev= e id= son la misma etiqueta. Con < /dev/null & y disown queda en segundo plano y sobrevive al exit.",
    pdf: ["P2-1 pág. 7", "P1 pág. 8"],
    essential: "No está en el PDF: < /dev/null y disown (el PDF acaba en &): así la MV sigue viva al hacer exit.",
    analogy: "Abre la recepción del hotel.",
    focus: `vm:${K1}:dhcp1`,
    cmds: [k1(DHCP1), k1("disown")],
    done: (l) => !!vmAt(l, K1, "dhcp1")?.nics.some((n) => n.br === "kvm1-br1" && n.mac === "DE:AD:BE:EF:E3:50") && vmAt(l, K1, "dhcp1")?.telnet === 5001,
  },
  {
    id: "dhcp-ip",
    goal: "Pasa el DHCP a 10.250.0.253/24",
    why: "setup-interfaces escribe /etc/network/interfaces y service networking restart lo aplica. Ese reinicio arranca también dhcpd, que falla: es lo esperado (su fichero aún es el de fábrica).",
    pdf: [],
    essential: "No está en el PDF: setup-interfaces y service networking restart (pizarra del 4/11). Ojo: propone máscara 255.0.0.0 y gateway 10.0.0.254; no los aceptes.",
    focus: `vm:${K1}:dhcp1`,
    cmds: [k1("telnet localhost 5001", BOOT), ...login("kvm1"), ...dhcpSetup("kvm1", "10.250.0.253", "", "", "").slice(0, 7)],
    done: (l) => vmAt(l, K1, "dhcp1")?.nics[0].ip === "10.250.0.253" && eth0Ok(l, K1, "dhcp1"),
  },
  {
    id: "dhcp-conf",
    goal: "Que reparta 10.250.0.20–30, sin puerta de enlace",
    why: "dhcpd.conf dice qué se reparte: subnet, netmask y range; option routers fuera (no hay router). Cada fichero, su servicio: dhcpd.conf → service dhcpd restart.",
    pdf: ["P2-1 pág. 7"],
    essential: "No está en el PDF: service dhcpd restart. Mira que acabe en [\u00a0ok\u00a0].",
    analogy: "Cambiar la lista de habitaciones no sirve si el recepcionista no la vuelve a leer.",
    focus: `vm:${K1}:dhcp1`,
    cmds: dhcpSetup("kvm1", "", "10.250.0.0", "10.250.0.20", "10.250.0.30").slice(7),
    done: (l) => {
      const s = subOf(l, K1, "dhcp1");
      return s?.net === "10.250.0.0" && s.from === "10.250.0.20" && s.to === "10.250.0.30" && !s.routers;
    },
  },
  {
    id: "cliente1",
    goal: "Arranca el cliente (cliente1.qcow2, MAC …:51, consola 5000) y comprueba su IP",
    why: "Otra MAC, otro puerto y otro disco. Al arrancar pide IP por DHCP: DISCOVER, OFFER, REQUEST y ACK.",
    pdf: ["P2-1 pág. 7"],
    essential: "No está en el PDF: salir de una consola sin apagar la MV (Ctrl+] y quit).",
    analogy: "«¿Hay alguna recepción?» · «Te ofrezco la 20» · «Me quedo la 20» · «Confirmado».",
    focus: `vm:${K1}:cliente1`,
    cmds: [...leave("kvm1"), k1(CLI1), k1("disown"), k1("telnet localhost 5000", BOOT), ...login("kvm1"), k1("ip addr")],
    done: (l) => onBr(l, K1, "kvm1-br1", "10.250.0."),
  },
  {
    id: "br2",
    goal: "En KVM2: bridge kvm2-br1 sin IP, y su permiso",
    why: "Igual que en KVM1: cada KVM tiene sus bridges y su propio bridge.conf. Sale DOWN hasta que le enchufas algo, y es normal.",
    pdf: ["P2-1 pág. 6", "P2-2 pág. 4"],
    focus: `br:${K2}:kvm2-br1`,
    cmds: [k2(bridge("kvm2-br1")), k2(allow("kvm2-br1"))],
    done: (l) => hk(l, K2).bridges.get("kvm2-br1")?.method === "disabled" && hk(l, K2).allow.has("kvm2-br1"),
  },
  {
    id: "fw",
    goal: "Abre el puerto de la VXLAN en las dos KVM (ahora y para siempre)",
    why: "La VXLAN viaja en UDP 8472. --permanent lo guarda pero no lo aplica: por eso van los dos. Antes, sal de la consola del cliente.",
    pdf: ["P2-2 págs. 3–4"],
    analogy: "La puerta de seguridad de cada hotel: cerrada, el pasadizo choca contra la pared.",
    focus: "gates",
    cmds: [...leave("kvm1"), ...both(() => [...fw("8472/udp"), "firewall-cmd --list-ports"])],
    done: (l) => l.hosts.every((h) => h.udp.has(8472) && h.permUdp.has(8472)),
  },
  {
    id: "vxlan",
    goal: "Une los dos bridges con una VXLAN (id 250)",
    why: "Mete las tramas de un bridge en UDP hacia la otra KVM: los dos bridges pasan a ser una sola LAN. El mismo id en las dos; remote, la otra KVM.",
    pdf: ["P2-2 pág. 4"],
    essential: "Ojo, cambia respecto al PDF: allí remote es la IP de br0; aquí, la IP normal de la otra KVM (ens32). Sus pasos 1.A/1.B (ov0-br) son nuestros bridges.",
    analogy: "Un pasadizo entre hoteles: id = número del pasadizo, remote = dirección del otro hotel, master = pasillo donde abres la puerta.",
    focus: "tunnel:250",
    cmds: both((t, ip, other, n) => [vxlan("vxlan250", 250, other, `kvm${n}-br1`)]),
    done: (l) => links(l).some((x) => x.vni === 250 && x.up),
  },
  {
    id: "cliente2",
    goal: "Cliente en KVM2 (MAC …:52, consola 5000) que coja IP del DHCP de KVM1 y haga ping a cliente1",
    why: "Su DISCOVER cruza el túnel y le contesta el DHCP de KVM1: la .21. El ping a la .20 va y vuelve por el mismo pasadizo.",
    pdf: ["P1 págs. 3–4", "P2-2 pág. 5"],
    focus: "tunnel:250",
    cmds: [k2("mkdir -p /home/ensayo"), k2("cd /home/ensayo"), k2(`wget ${REPO}/alpine-base.qcow2`), k2("qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 cliente2.qcow2"), k2(CLI2), k2("disown"), k2("telnet localhost 5000", BOOT), ...login("kvm2"), k2("ip addr"), k2("ping -c 3 10.250.0.20"), ...leave("kvm2")],
    done: (l) => onBr(l, K2, "kvm2-br1", "10.250.0.") && l.done.has("ping-vni:250"),
  },
];

const step = (steps: Step[], id: string) => steps.findIndex((s) => s.id === id);
const claseTraps: Trap[] = [
  {
    id: "pares",
    at: step(claseSteps, "br1"),
    title: "nmcli sin pares «campo valor»",
    flag: "trap:pares",
    cmds: [
      k1(bridge("kvm1-br1").replace(/ipv4\.method disabled.*/, "ipv4.manual ipv4.addresses 10.250.0.1/24"), 0, { note: "Primero quisimos darle IP… y escribimos ipv4.manual." }),
      k1(bridge("kvm1-br1").replace(/ipv4\.method disabled.*/, "ipv4.method ipv4.addresses 10.250.0.1/24"), 0, { note: "Luego, ipv4.method sin su valor." }),
    ],
    lesson: "nmcli va por parejas «campo valor»: ipv4.method manual + ipv4.addresses IP/máscara, o ipv4.method disabled (sin IP).",
  },
  {
    id: "base",
    at: step(claseSteps, "imgs"),
    title: "La base, con otro nombre",
    flag: "trap:base",
    cmds: [
      k1(`mkdir -p ${SIM}`),
      k1(`cd ${SIM}`),
      k1(`wget ${REPO}/alpine-dhcp.qcow2`),
      k1("ln -s /exports/VMs/alpine-base.qcow2 alpine-clone.qcow2", 0, { note: "Para no descargarla, un enlace a la base de la P1… con otro nombre." }),
      k1("qemu-img create -F qcow2 -f qcow2 -b alpine-dhcp.qcow2 dhcp1.qcow2", 0, { note: "alpine-dhcp busca su base por su nombre exacto, en su carpeta." }),
      k1("rm alpine-clone.qcow2", 0, { note: "Arreglo: fuera el enlace (la base de la P1 no se toca: tiene console=ttyS0) y la base de verdad, al lado." }),
      k1(`wget ${REPO}/alpine-base.qcow2`),
      k1("qemu-img info alpine-dhcp.qcow2"),
    ],
    lesson: "Un linked clone necesita su base al lado y con el nombre exacto: qemu-img info → backing file.",
  },
  {
    id: "mac",
    at: step(claseSteps, "dhcp-up"),
    title: "Una MAC con un par de tres",
    flag: "trap:mac",
    cmds: [k1(DHCP1.replace("BE:EF", "BE:EEF"), 0, { note: "DE:AD:BE:EEF:E3:50: un par con tres dígitos." })],
    lesson: "Una MAC son 6 pares de dígitos hexadecimales: DE:AD:BE:EF:E3:50.",
  },
  {
    id: "netdev",
    at: step(claseSteps, "dhcp-up"),
    title: "netdev= con el nombre del bridge",
    flag: "trap:netdev",
    cmds: [k1(DHCP1.replace("netdev=net0", "netdev=kvm1-br1"), 0, { note: "netdev=kvm1-br1, pero el -netdev se llama net0." })],
    lesson: "netdev= (en -device) e id= (en -netdev) son la misma etiqueta, local a cada QEMU. El bridge va en br=.",
  },
  {
    id: "telnet2",
    at: step(claseSteps, "dhcp-conf"),
    title: "Dos ventanas en la misma consola",
    flag: "trap:telnet2",
    cmds: [
      pc(`ssh root@${K1}`, 0, { note: "Otra ventana en KVM1…" }),
      pc("telnet localhost 5001", 0, { note: "…a la consola que ya tiene abierta la terminal de KVM1." }),
      pc("service dhcpd status", 0, { note: "Escribes y no pasa nada: queda en cola, congelado." }),
      ...leave("pc"),
      pc("exit"),
    ],
    lesson: "QEMU atiende a un cliente por consola: una MV = un puerto = una ventana. Sal con Ctrl+] y quit.",
  },
  {
    id: "networking",
    at: step(claseSteps, "dhcp-conf"),
    title: "networking en vez de dhcpd (3 horas)",
    flag: "trap:networking",
    cmds: [
      ...dhcpSetup("kvm1", "", "10.250.0.0", "10.250.0.20", "10.250.0.30").slice(7, 10),
      k1("service networking restart", 0, { note: "El fichero ya estaba bien… pero reiniciamos networking." }),
      ...leave("kvm1"),
      k1(CLI1),
      k1("disown"),
      k1("telnet localhost 5000", BOOT),
      ...login("kvm1"),
      k1("ip addr", 0, { note: "Sin IP." }),
      k1("ip addr", 10_560_000, { lapse: { from: "16:57", to: "19:53", asks: 1500 }, note: "El cliente pide IP unas 1.500 veces. Nadie contesta." }),
      ...leave("kvm1"),
      k1("telnet localhost 5001"),
      k1(""),
      k1("service dhcpd statuss", 0, { note: "Con una s de más: no hace nada." }),
      k1("service dhcpd status", 0, { note: "Ahí está: dhcpd parado desde el paso 6." }),
      k1("service dhcpd restart"),
      ...leave("kvm1"),
      k1("telnet localhost 5000"),
      k1(""),
      k1("ip addr", 0, { note: "El cliente no ha hecho nada: udhcpc seguía pidiendo y ya tiene la .20." }),
    ],
    lesson: "Cada fichero, su servicio: /etc/network/interfaces → networking; /etc/dhcp/dhcpd.conf → dhcpd. networking solo vuelve a arrancar lo que estaba funcionando.",
    analogy: "Reiniciar la línea de la recepción no hace volver al recepcionista que se había ido a casa.",
  },
  {
    id: "kvm",
    at: step(claseSteps, "cliente1"),
    title: "Sin --enable-kvm",
    flag: "trap:kvm",
    cmds: [...leave("kvm1"), k1(CLI1.replace(" --enable-kvm", ""), 0, { note: "Se nos olvidó --enable-kvm." }), k1("disown"), k1("telnet localhost 5000", 1000), k1("", 0, { note: "A los 4 s, la de antes ya estaba lista; esta sigue arrancando." }), k1("", 8000)],
    lesson: "Sin --enable-kvm la CPU se emula (TCG): funciona, pero muchísimo más lenta. Está en casi todos los qemu-system del PDF.",
  },
  {
    id: "vxlan",
    at: step(claseSteps, "vxlan"),
    title: "El cliente de KVM2, antes que la VXLAN",
    flag: "trap:vxlan",
    cmds: [
      ...claseSteps[step(claseSteps, "cliente2")].cmds.slice(0, 10).map((c, i) => (i === 4 ? { ...c, note: "Lanzamos el cliente 2… sin haber hecho la 2.A y la 2.B." } : c)),
      k2("ip addr", 0, { note: "Sin IP: su DISCOVER no sale de kvm2-br1." }),
      ...leave("kvm2"),
      k2("nmcli connection show", 0, { note: "Diagnóstico: ni rastro de la VXLAN…" }),
      k1("nmcli connection show", 0, { note: "…en ninguna de las dos KVM." }),
      ...claseSteps[step(claseSteps, "vxlan")].cmds,
      k2("telnet localhost 5000"),
      k2(""),
      k2("ip addr", 0, { note: "Sin tocar el cliente: udhcpc seguía pidiendo y, con el túnel, ya tiene la .21." }),
    ],
    lesson: "Si el cliente de la otra KVM no coge IP: nmcli connection show en las dos KVM. Tiene que salir la VXLAN (2.A en KVM1, 2.B en KVM2).",
  },
];

// Map texts shared by both labs.
const TXT = {
  tower: (n: number, ip: string) => `Hotel KVM${n}: el servidor (hipervisor). Su ens32, ${ip}, es por donde entras por SSH y por donde viaja la VXLAN.`,
  bridge: (b: string) => `Pasillo ${b}: un switch virtual sin IP en el host. Sin su «allow» en /etc/qemu/bridge.conf, QEMU no puede enchufar nada.`,
  gate: (n: number) => `Firewall de KVM${n}: la VXLAN entra por 8472/udp. Uno con --permanent (para siempre) y otro sin él (para ya).`,
  vx: (n: number, id: number) => `Extremo KVM${n} del pasadizo ${id}: id = número del pasadizo (igual en las dos), remote = dirección del otro hotel, master = pasillo donde abres la puerta.`,
  cable: "La puerta de la habitación: la tarjeta (-device …,netdev=X,mac=…) y su enchufe al pasillo (-netdev bridge,br=…,id=X). netdev= e id= son la misma etiqueta.",
  console: (port: number) => `Telefonillo: la consola serie de la MV en el puerto ${port}. En la propia KVM, telnet localhost ${port}; desde fuera, telnet IP_KVM ${port} con el puerto abierto en su firewall. Un cliente cada vez; se sale con Ctrl+] y quit.`,
};
const VX_ESSENTIAL = "Ojo, cambia respecto al PDF: allí remote es la IP de br0; aquí, la IP normal de la otra KVM (ens32).";
const CONSOLE_ESSENTIAL = "No está en el PDF: salir con Ctrl+] y quit sin apagar la MV.";
const BRIDGE_ESSENTIAL = "No está en el PDF: ipv4.method disabled (sin IP); sale en man nm-settings-nmcli.";
const SETUP_ESSENTIAL = "No está en el PDF: setup-interfaces y service … restart (pizarra del 4/11).";
const DHCPD_ESSENTIAL = "No está en el PDF: service dhcpd restart.";
const ETH1_ESSENTIAL = "No está en el PDF: su eth1 no pide IP sola (udhcpc -i eth1).";

function clasePieces(): Piece[] {
  const { ref, span } = finder(claseSteps);
  const s = (id: string) => step(claseSteps, id);
  const out: Piece[] = [];
  for (const n of [1, 2] as const) {
    const t: "kvm1" | "kvm2" = n === 1 ? "kvm1" : "kvm2";
    const ip = n === 1 ? K1 : K2;
    const br = `kvm${n}-br1`;
    out.push(
      { id: `kvm${n}`, kind: "tower", host: t, node: `srv:${ip}`, name: `KVM${n} · ${ip}`, what: TXT.tower(n, ip), pdf: ["P1 pág. 3"], refs: [ref(t, `ssh root@${ip}`)], links: [br, `kvm${n}-gate`, `vxlan250-kvm${n}`] },
      { id: br, kind: "bridge", host: t, node: `br:${ip}:${br}`, name: `Bridge ${br}`, what: TXT.bridge(br), pdf: ["P2-1 pág. 6", "P2-2 pág. 2"], essential: BRIDGE_ESSENTIAL, refs: [ref(t, `con-name ${br} `), ref(t, `allow ${br}`)], links: n === 1 ? ["dhcp1-nic", "cliente1-nic", "vxlan250-kvm1", "kvm1"] : ["cliente2-nic", "vxlan250-kvm2", "kvm2"] },
      { id: `kvm${n}-gate`, kind: "gate", host: t, node: `gate:${ip}`, name: `Firewall de KVM${n} · 8472/udp`, what: TXT.gate(n), pdf: ["P2-2 págs. 3–4"], refs: [ref(t, "8472/udp --permanent"), ref(t, "=firewall-cmd --add-port=8472/udp"), ref(t, "--list-ports")], links: [`kvm${n}`, "tunnel250"] },
      { id: `vxlan250-kvm${n}`, kind: "vxlan", host: t, node: `vx:${ip}:vxlan250`, name: `VXLAN 250 · extremo KVM${n}`, what: TXT.vx(n, 250), pdf: ["P2-2 pág. 4"], essential: VX_ESSENTIAL, refs: [ref(t, "type vxlan")], pair: `vxlan250-kvm${3 - n}`, links: [br, "tunnel250", `vxlan250-kvm${3 - n}`] },
    );
  }
  out.push({ id: "tunnel250", kind: "tunnel", node: "tunnel:250", name: "Pasadizo VXLAN 250", what: "Una sola LAN, 10.250.0.0/24, a los dos lados: las tramas viajan dentro de UDP 8472 por la red de las KVM.", pdf: ["P2-2 págs. 3–4"], refs: [ref("kvm1", "type vxlan"), ref("kvm2", "type vxlan")], hl: ["remote", "master"], links: ["vxlan250-kvm1", "vxlan250-kvm2", "kvm1-gate", "kvm2-gate"] });
  const vm = (t: "kvm1" | "kvm2", ip: string, name: string, at: string, what: string, pdf: string[], inner: Ref[], essential?: string) => {
    const launch = ref(t, `${name}.qcow2 <`);
    const br = t === "kvm1" ? "kvm1-br1" : "kvm2-br1";
    const [dev, nd] = nicArgs(cmdText(claseSteps, launch), 0);
    out.push(
      { id: name, kind: "vm", host: t, node: `vm:${ip}:${name}`, name, what, pdf, essential, refs: [launch, ref(t, "=disown", s(at))], inner, links: [`${name}-nic`, `${name}-console`, ...(name === "dhcp1" ? ["dhcp1-dhcpd"] : [])] },
      { id: `${name}-nic`, kind: "cable", host: t, node: `cable:${ip}:${name}:0`, name: `${name} ↔ ${br}`, what: TXT.cable, pdf: ["P2-1 pág. 7"], refs: [launch], nic: 0, hl: [/netdev=[^,]+/.exec(dev)![0], /id=[^,]+/.exec(nd)![0]], links: [name, br] },
    );
  };
  vm("kvm1", K1, "dhcp1", "dhcp-up", "La recepción: servidor DHCP en 10.250.0.253/24 que reparte de la .20 a la .30, sin puerta de enlace.", ["P2-1 pág. 7"], [...span("kvm1", s("dhcp-ip"), "setup-interfaces", "service networking restart"), ...span("kvm1", s("dhcp-conf"), "vi /etc/dhcp", "service dhcpd restart")], SETUP_ESSENTIAL);
  vm("kvm1", K1, "cliente1", "cliente1", "Habitación de cliente1: al arrancar pide IP por DHCP (udhcpc) y le dan la 10.250.0.20.", ["P2-1 pág. 7"], [ref("kvm1", "=ip addr", s("cliente1"))]);
  vm("kvm2", K2, "cliente2", "cliente2", "Habitación de cliente2, en el otro hotel: su IP (la .21) se la da el DHCP de KVM1 a través del pasadizo.", ["P2-2 pág. 5", "P1 págs. 3–4"], [ref("kvm2", "=ip addr", s("cliente2")), ref("kvm2", "ping -c 3")]);
  out.push(
    { id: "dhcp1-dhcpd", kind: "service", host: "kvm1", node: `dhcpd:${K1}:dhcp1`, name: "dhcpd · el recepcionista", what: "Reparte las IPs de /etc/dhcp/dhcpd.conf. Cada fichero, su servicio: dhcpd.conf → service dhcpd restart (networking solo rearranca lo que funcionaba).", pdf: ["P2-1 pág. 7"], essential: DHCPD_ESSENTIAL, refs: span("kvm1", s("dhcp-conf"), "vi /etc/dhcp", "service dhcpd restart"), links: ["dhcp1"] },
    { id: "dhcp1-console", kind: "console", host: "kvm1", node: `console:${K1}:5001`, name: "Consola de dhcp1 · 5001", what: TXT.console(5001), pdf: ["P1 pág. 8"], essential: CONSOLE_ESSENTIAL, refs: [ref("kvm1", "telnet localhost 5001"), ref("kvm1", "=^]", s("cliente1")), ref("kvm1", "=quit", s("cliente1"))], links: ["dhcp1"] },
    { id: "cliente1-console", kind: "console", host: "kvm1", node: `console:${K1}:5000`, name: "Consola de cliente1 · 5000", what: TXT.console(5000), pdf: ["P1 pág. 8"], essential: CONSOLE_ESSENTIAL, refs: [ref("kvm1", "telnet localhost 5000"), ref("kvm1", "=^]", s("fw")), ref("kvm1", "=quit", s("fw"))], links: ["cliente1"] },
    { id: "cliente2-console", kind: "console", host: "kvm2", node: `console:${K2}:5000`, name: "Consola de cliente2 · 5000", what: TXT.console(5000), pdf: ["P1 pág. 8"], essential: CONSOLE_ESSENTIAL, refs: [ref("kvm2", "telnet localhost 5000"), ref("kvm2", "=^]", s("cliente2")), ref("kvm2", "=quit", s("cliente2"))], links: ["cliente2"] },
  );
  return out;
}
const cmdText = (steps: Step[], r: Ref) => steps[r.step].cmds[r.cmd].text;

/* ================================================================== Pizarra · users fuera y 2 overlays */

const PIZ = "/home/ensayo/pizarra";
const QEMU = "qemu-system-x86_64 -m 128M -smp 1 --enable-kvm -nographic";
const tel = (port: number) => `-serial mon:telnet::${port},server=on,wait=off`;
const lanNic = (lan: 1 | 2, mac: string) => `-netdev bridge,br=lan${lan},id=n${lan} -device e1000,netdev=n${lan},mac=DE:AD:BE:EF:0${lan}:${mac}`;
/** MAC rule: DE:AD:BE:EF:<LAN>:<tier><KVM>. */
const TIER = (t: 1 | 2 | 3, n: 1 | 2) =>
  t === 1 ? `${QEMU} -netdev user,id=n0,hostfwd=tcp::222${n}-:22 -device e1000,netdev=n0 ${lanNic(1, `1${n}`)} ${tel(5001)} t1.qcow2 < /dev/null &`
  : t === 2 ? `${QEMU} ${lanNic(1, `2${n}`)} ${lanNic(2, `2${n}`)} ${tel(5002)} t2.qcow2 < /dev/null &`
  : `${QEMU} ${lanNic(2, `3${n}`)} ${tel(5003)} t3.qcow2 < /dev/null &`;
const DHCPL = (lan: 1 | 2) => `${QEMU} -device e1000,netdev=net0,mac=DE:AD:BE:EF:0${lan}:01 -netdev bridge,br=lan${lan},id=net0 ${tel(5010 + lan)} dhcp-lan${lan}.qcow2 < /dev/null &`;
const tiersOk = (l: Lab) =>
  l.hosts.every((h) => {
    const has = (brs: string[]) => h.vms.some((v) => v.nics.length === brs.length && brs.every((b, i) => (b === "user" ? v.nics[i].kind === "user" : v.nics[i].br === b)));
    return has(["user", "lan1"]) && has(["lan1", "lan2"]) && has(["lan2"]);
  });
const dhcpOk = (l: Lab, lan: 1 | 2) => {
  const s = subOf(l, K1, `dhcp-lan${lan}`);
  return s?.net === `10.250.${lan}.0` && s.from === `10.250.${lan}.100` && s.to === `10.250.${lan}.150` && !s.routers && vmAt(l, K1, `dhcp-lan${lan}`)?.nics[0].br === `lan${lan}` && eth0Ok(l, K1, `dhcp-lan${lan}`);
};

const pizarraSteps: Step[] = [
  { ...claseSteps[0] },
  {
    id: "plan",
    goal: "Planifica: ordena los pasos antes de escribir nada",
    why: "En el examen importa qué ejecutar, por qué y en qué orden: cada tarjeta depende de otras.",
    pdf: [],
    focus: "overview",
    cmds: [],
    plan: true,
    done: (l) => l.done.has("plan"),
  },
  {
    id: "bridges",
    goal: "Bridges lan1 y lan2 sin IP en las dos KVM, con su allow",
    why: "Cada LAN es un pasillo en cada hotel; luego cada VXLAN unirá el pasillo de una KVM con el de la otra (los llamamos igual para no liarnos). Simétrico: las dos terminales a la vez.",
    pdf: ["P2-1 pág. 6"],
    essential: BRIDGE_ESSENTIAL,
    focus: `br:${K1}:lan1`,
    cmds: both(() => [bridge("lan1"), bridge("lan2"), allow("lan1"), allow("lan2")]),
    done: (l) => l.hosts.every((h) => ["lan1", "lan2"].every((b) => h.bridges.get(b)?.method === "disabled" && h.allow.has(b))),
  },
  {
    id: "fw",
    goal: "Firewall: 8472/udp en las dos KVM y el puerto de SSH de fuera (2221 en KVM1, 2222 en KVM2), ahora y para siempre",
    why: "Por el 8472/udp viajan las VXLAN; por el 2221/2222 entra la calle hasta T1 (hostfwd). --permanent no lo aplica ahora: van los dos.",
    pdf: ["P2-2 págs. 3–4", "P2-1 pág. 4"],
    focus: "gates",
    cmds: both((t, ip, o, n) => [...fw("8472/udp"), ...fw(`222${n}/tcp`)]),
    done: (l) => l.hosts.every((h, i) => h.udp.has(8472) && h.permUdp.has(8472) && h.open.has(2221 + i) && h.perm.has(2221 + i)),
  },
  {
    id: "vxlan",
    goal: "Dos VXLAN por KVM: id 251 para lan1 e id 252 para lan2",
    why: "Un pasadizo por LAN, cada uno con su id: si repites id, las dos LAN se mezclan (o la segunda no se activa).",
    pdf: ["P2-2 pág. 4", "P2-2 pág. 3"],
    essential: VX_ESSENTIAL,
    analogy: "Dos pasadizos entre hoteles: el 251 une los pasillos lan1 y el 252 los lan2.",
    focus: "tunnel:251",
    cmds: both((t, ip, other) => [vxlan("vx251", 251, other, "lan1"), vxlan("vx252", 252, other, "lan2")]),
    done: (l) => [1, 2].every((n) => links(l).some((x) => x.up && x.vni === 250 + n && x.a.br === `lan${n}` && x.b?.br === `lan${n}`)),
  },
  {
    id: "imgs",
    goal: `Imágenes y linked clones en ${PIZ}: t1–t3 en las dos KVM y dhcp-lan1/dhcp-lan2 en KVM1`,
    why: "Un for crea los tres clones de golpe: $i da a cada uno su nombre. Los DHCP salen de alpine-dhcp (que necesita alpine-base al lado).",
    pdf: ["P1 págs. 3–4"],
    essential: "No está en el PDF: el for (lo pidió el profe).",
    focus: `srv:${K1}`,
    cmds: both((t, ip, o, n) => [`mkdir -p ${PIZ}`, `cd ${PIZ}`, ...(n === 1 ? [`wget ${REPO}/alpine-dhcp.qcow2`] : []), `wget ${REPO}/alpine-base.qcow2`, "for i in 1 2 3; do qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 t$i.qcow2; done", ...(n === 1 ? ["for l in 1 2; do qemu-img create -F qcow2 -f qcow2 -b alpine-dhcp.qcow2 dhcp-lan$l.qcow2; done"] : [])]),
    done: (l) => [K1, K2].every((ip) => [1, 2, 3].every((i) => cloneOf(l, ip, `${PIZ}/t${i}.qcow2`, "alpine-base.qcow2"))) && [1, 2].every((i) => cloneOf(l, K1, `${PIZ}/dhcp-lan${i}.qcow2`, "alpine-dhcp.qcow2")),
  },
  {
    id: "dhcp",
    goal: "Los dos DHCP en KVM1: 10.250.1.1 y 10.250.2.1 (/24), cada uno reparte .100–.150 en su LAN, sin puerta de enlace",
    why: "Igual que en la tarea de clase, dos veces: IP con setup-interfaces + service networking restart; rango en dhcpd.conf + service dhcpd restart.",
    pdf: ["P2-1 pág. 7"],
    essential: "No está en el PDF: setup-interfaces, service … restart (pizarra del 4/11), < /dev/null y disown.",
    analogy: "Una recepción por pasillo.",
    focus: `vm:${K1}:dhcp-lan1`,
    cmds: [
      k1(DHCPL(1)),
      k1("disown"),
      k1(DHCPL(2)),
      k1("disown"),
      ...([1, 2] as const).flatMap((lan) => [k1(`telnet localhost 501${lan}`, lan === 1 ? BOOT : 0), ...login("kvm1"), ...dhcpSetup("kvm1", `10.250.${lan}.1`, `10.250.${lan}.0`, `10.250.${lan}.100`, `10.250.${lan}.150`), ...leave("kvm1")]),
    ],
    done: (l) => dhcpOk(l, 1) && dhcpOk(l, 2),
  },
  {
    id: "tiers",
    goal: "T1, T2 y T3 en las dos KVM: T1 en la red user (hostfwd 2221/2222) y lan1, T2 en lan1 y lan2, T3 en lan2",
    why: "Cada tarjeta, su -netdev con su id y su MAC (DE:AD:BE:EF:<LAN>:<tier><KVM>). T1 da a la calle con hostfwd; T3 solo ve la LAN2.",
    pdf: ["P2-1 págs. 3–5", "P2-1 pág. 7"],
    essential: "No está en el PDF: dos tarjetas en una MV. Manda el orden de los -device: el primero es eth0 y el segundo eth1 (la LAN1 de T1 y la LAN2 de T2 son su eth1).",
    focus: "overview",
    cmds: both((t, ip, o, n) => [TIER(1, n), "disown", TIER(2, n), "disown", TIER(3, n), "disown"]),
    done: tiersOk,
  },
  {
    id: "eth1",
    goal: "Que la segunda tarjeta (eth1) de T1 y de T2 tenga IP, en las dos KVM",
    why: "La imagen solo configura eth0: eth1 no pide IP sola. udhcpc -i eth1 la pide ya (para siempre: setup-interfaces + service networking restart).",
    pdf: [],
    essential: "No está en el PDF: eth1 no pide IP sola (udhcpc -i eth1). La trampa clásica de los tiers.",
    focus: `vm:${K1}:t2`,
    cmds: both((t, ip, o, n) => [k(t)("telnet localhost 5001", n === 1 ? BOOT : 0), ...login(t), "udhcpc -i eth1", ...leave(t), "telnet localhost 5002", ...login(t), "udhcpc -i eth1", ...leave(t)]),
    done: (l) => tiersOk(l) && lanIp(l, "lan1", "10.250.1.") && lanIp(l, "lan2", "10.250.2."),
  },
  {
    id: "check",
    goal: "Comprueba las dos LAN de lado a lado (T1 de KVM1 → T2 de KVM2 por la LAN1; T3 → T3 y T3 de KVM2 → T2 de KVM1 por la LAN2) y entra en T1 desde fuera con ssh -p 2221",
    why: "Cada ping cruza su pasadizo (251 o 252). Desde tu PC, el 2221 de KVM1 lleva al 22 de T1 (hostfwd).",
    pdf: ["P2-1 pág. 5", "P2-2 pág. 5"],
    focus: "street",
    cmds: [
      k1("telnet localhost 5001"),
      k1(""),
      k1("ping -c 3 10.250.1.101"),
      ...leave("kvm1"),
      k1("telnet localhost 5003"),
      ...login("kvm1"),
      k1("ping -c 3 10.250.2.101"),
      ...leave("kvm1"),
      k2("telnet localhost 5003"),
      ...login("kvm2"),
      k2("ping -c 3 10.250.2.102"),
      ...leave("kvm2"),
      pc(`ssh -p 2221 root@${K1}`),
      pc("ip addr"),
      pc("exit"),
    ],
    done: (l) => l.done.has("ping-vni:251") && l.done.has("ping-vni:252") && l.done.has("ssh-fwd-pc"),
  },
];

const pizarraTraps: Trap[] = [
  {
    id: "vni",
    at: step(pizarraSteps, "vxlan"),
    title: "El mismo id para las dos LAN",
    flag: "trap:vni",
    cmds: [k1(vxlan("vx251", 251, K2, "lan1")), k1(vxlan("vx252", 251, K2, "lan2"), 0, { note: "Copiamos la línea y nos dejamos el id: 251 otra vez." }), k1("nmcli connection show", 0, { note: "vx252 sin DEVICE: no se ha activado." })],
    lesson: "Cada LAN, su id. En una KVM no caben dos VXLAN con el mismo id; entre KVM distintas, el mismo id une LANs que deberían estar separadas.",
  },
  {
    id: "factory",
    at: step(pizarraSteps, "dhcp"),
    title: "El DHCP, tal como viene de fábrica",
    flag: "trap:factory",
    cmds: [k1(DHCPL(1)), k1("disown"), k1("telnet localhost 5011", BOOT), ...login("kvm1"), k1("ip addr", 0, { note: "Recién descargado: 10.0.0.253." }), k1("cat /etc/dhcp/dhcpd.conf", 0, { note: "Y reparte 10.0.0.100–200 con un router que no existe." })],
    lesson: "Sin tocarlo, el DHCP es el de fábrica: hay que cambiar su IP (setup-interfaces), su dhcpd.conf (subnet, range, sin routers) y reiniciar cada servicio.",
  },
  {
    id: "hostfwd",
    at: step(pizarraSteps, "tiers"),
    title: "El mismo puerto de hostfwd dos veces",
    flag: "trap:hostfwd",
    cmds: [k1(TIER(1, 1)), k1("disown"), k1(TIER(2, 1).replace(`${QEMU} `, `${QEMU} -netdev user,id=n0,hostfwd=tcp::2221-:22 -device e1000,netdev=n0 `), 0, { note: "Copiamos la red user de T1 en T2, con su 2221." })],
    lesson: "Un puerto del host se redirige a una sola MV de ese host. Si otra MV de la misma KVM necesita entrar desde fuera, otro puerto (p. ej. 2223). En KVM2 el 2221 también estaría libre: el 2222 es solo para distinguirlos.",
  },
  {
    id: "eth1",
    at: step(pizarraSteps, "eth1"),
    title: "eth1 sin IP",
    flag: "trap:eth1",
    cmds: [k1("telnet localhost 5002", BOOT), ...login("kvm1"), k1("ip addr", 0, { note: "eth1 está DOWN y sin IP." }), k1("ping -c 3 10.250.2.100", 0, { note: "T2 no llega a la LAN2: sin IP ahí no hay ruta." })],
    lesson: "La imagen solo configura eth0. eth1: udhcpc -i eth1 (para ya) o setup-interfaces + service networking restart (para siempre).",
  },
  {
    id: "fw",
    at: step(pizarraSteps, "check"),
    title: "El 2221/tcp cerrado",
    flag: "trap:fw",
    cmds: [k1("firewall-cmd --remove-port=2221/tcp", 0, { note: "Supón que se te olvidó abrirlo…" }), pc(`ssh -p 2221 root@${K1}`), k1("firewall-cmd --add-port=2221/tcp", 0, { note: "Arreglo: abrirlo (y con --permanent, para siempre)." }), pc(`ssh -p 2221 root@${K1}`), pc("exit")],
    lesson: "Desde fuera, el firewall de la KVM tiene que dejar pasar el puerto del hostfwd. Desde la propia KVM no hace falta.",
  },
];

const pizarraPlan: PlanCard[] = [
  { id: "bridges", text: "Bridges lan1 y lan2 sin IP, con su allow, en las dos KVM", deps: [] },
  { id: "fw", text: "Firewall: 8472/udp en las dos; 2221/tcp y 2222/tcp para entrar desde fuera", deps: [] },
  { id: "vxlan", text: "VXLAN 251 (lan1) y 252 (lan2) en las dos KVM", deps: [{ id: "bridges", why: "master es un bridge: tiene que existir antes de colgarle la VXLAN." }] },
  { id: "imgs", text: "Imágenes y linked clones (con un for)", deps: [] },
  {
    id: "dhcp",
    text: "Los dos DHCP en KVM1: su IP, su dhcpd.conf y service dhcpd restart",
    deps: [
      { id: "bridges", why: "Sin allow, QEMU no puede usar el bridge (access denied by acl file)." },
      { id: "imgs", why: "Sin su clon no hay disco que arrancar." },
    ],
  },
  {
    id: "tiers",
    text: "T1, T2 y T3 en las dos KVM",
    deps: [
      { id: "dhcp", why: "El DHCP tiene que estar en su rango antes de que los clientes pidan IP." },
      { id: "vxlan", why: "Los tiers de KVM2 cogen IP del DHCP de KVM1 a través de la VXLAN." },
      { id: "fw", why: "La VXLAN necesita el 8472/udp abierto en las dos." },
      { id: "imgs", why: "Cada tier arranca de su clon." },
    ],
  },
  { id: "eth1", text: "La segunda tarjeta (eth1) de T1 y T2: udhcpc -i eth1", deps: [{ id: "tiers", why: "Solo puedes configurar la tarjeta de una MV que ya está en marcha." }] },
  {
    id: "check",
    text: "Comprobar: pings por las dos LAN y ssh -p 2221 desde fuera",
    deps: [
      { id: "eth1", why: "Sin IP en eth1, T1 no está en la LAN1 ni T2 en la LAN2." },
      { id: "fw", why: "Desde fuera, el 2221/tcp tiene que estar abierto." },
    ],
  },
];

function pizarraPieces(): Piece[] {
  const { ref, span } = finder(pizarraSteps);
  const s = (id: string) => step(pizarraSteps, id);
  const out: Piece[] = [];
  for (const n of [1, 2] as const) {
    const t: "kvm1" | "kvm2" = n === 1 ? "kvm1" : "kvm2";
    const ip = n === 1 ? K1 : K2;
    const door = 2220 + n;
    out.push(
      { id: `kvm${n}`, kind: "tower", host: t, node: `srv:${ip}`, name: `KVM${n} · ${ip}`, what: TXT.tower(n, ip), pdf: ["P1 pág. 3"], refs: [ref(t, `ssh root@${ip}`)], links: [`kvm${n}-lan1`, `kvm${n}-lan2`, `kvm${n}-gate`, `kvm${n}-door`] },
      { id: `kvm${n}-gate`, kind: "gate", host: t, node: `gate:${ip}`, name: `Firewall de KVM${n} · 8472/udp`, what: TXT.gate(n), pdf: ["P2-2 págs. 3–4"], refs: [ref(t, "8472/udp --permanent"), ref(t, "=firewall-cmd --add-port=8472/udp")], links: [`kvm${n}`, "tunnel251", "tunnel252"] },
      { id: `kvm${n}-door`, kind: "door", host: t, node: `fw:${ip}:${door}`, name: `Puerta de la calle · ${door}/tcp`, what: `Lo que llega al ${door} de KVM${n} va al 22 de su T1 (hostfwd). Desde fuera, el firewall tiene que dejarlo pasar.`, pdf: ["P2-1 págs. 4–5"], refs: [ref(t, `${door}/tcp --permanent`), ref(t, `=firewall-cmd --add-port=${door}/tcp`)], links: [`kvm${n}-t1-user`, "exterior"] },
    );
    for (const lan of [1, 2] as const) {
      const vni = 250 + lan;
      out.push(
        { id: `kvm${n}-lan${lan}`, kind: "bridge", host: t, node: `br:${ip}:lan${lan}`, name: `Bridge lan${lan} · KVM${n}`, what: `${TXT.bridge(`lan${lan}`)} LAN${lan}: 10.250.${lan}.0/24.`, pdf: ["P2-1 pág. 6"], essential: BRIDGE_ESSENTIAL, refs: [ref(t, `con-name lan${lan} `), ref(t, `allow lan${lan}`)], links: [`vx${vni}-kvm${n}`, `kvm${n}`] },
        { id: `vx${vni}-kvm${n}`, kind: "vxlan", host: t, node: `vx:${ip}:vx${vni}`, name: `VXLAN ${vni} · extremo KVM${n}`, what: TXT.vx(n, vni), pdf: ["P2-2 pág. 4"], essential: VX_ESSENTIAL, refs: [ref(t, `con-name vx${vni} `)], pair: `vx${vni}-kvm${3 - n}`, links: [`kvm${n}-lan${lan}`, `tunnel${vni}`, `vx${vni}-kvm${3 - n}`] },
      );
    }
    const vm = (name: string, what: string, pdf: string[], at: string, port: number, inner: Ref[] = [], essential?: string) => {
      const launch = ref(t, ` ${name}.qcow2 <`);
      const id = n === 1 && name.startsWith("dhcp") ? name : `kvm${n}-${name}`;
      const text = cmdText(pizarraSteps, launch);
      const tn = ref(t, `telnet localhost ${port}`, s(at));
      out.push({ id, kind: "vm", host: t, node: `vm:${ip}:${name}`, name: `${name} · KVM${n}`, what, pdf, essential, refs: [launch, ref(t, "=disown", launch.step, launch)], inner, links: [] });
      const me = out[out.length - 1];
      for (let i = 0; nicArgs(text, i).length; i++) {
        const [dev, nd] = nicArgs(text, i);
        const lan = /br=(lan\d)/.exec(nd)?.[1];
        const cid = lan ? `${id}-${lan}` : `${id}-user`;
        me.links.push(cid);
        out.push(
          lan
            ? { id: cid, kind: "cable", host: t, node: `cable:${ip}:${name}:${i}`, name: `${name} ↔ ${lan}`, what: TXT.cable, pdf: ["P2-1 pág. 7"], refs: [launch], nic: i, hl: [/netdev=[^,]+/.exec(dev)![0], /id=[^,]+/.exec(nd)![0], "mac="], links: [id, `kvm${n}-${lan}`] }
            : { id: cid, kind: "user", host: t, node: `user:${ip}:${name}`, name: `${name} ↔ la calle (red user)`, what: `Red user (SLiRP): T1 sale a la calle por NAT y, con hostfwd, lo que llega al ${2220 + n} del host entra a su 22.`, pdf: ["P2-1 págs. 3–5"], refs: [launch], nic: i, hl: ["hostfwd=", /netdev=[^,]+/.exec(dev)![0], /id=[^,]+/.exec(nd)![0]], links: [id, `kvm${n}-door`] },
        );
      }
      me.links.push(`${id}-console`);
      out.push({ id: `${id}-console`, kind: "console", host: t, node: `console:${ip}:${port}`, name: `Consola de ${name} · ${port}`, what: TXT.console(port), pdf: ["P1 pág. 8"], essential: CONSOLE_ESSENTIAL, refs: [tn, ref(t, "=^]", tn.step, tn), ref(t, "=quit", tn.step, tn)], links: [id] });
      return me;
    };
    const u1 = ref(t, "udhcpc -i eth1", s("eth1"));
    vm("t1", "T1, el frontal: da a la calle por la red user (hostfwd) y está en la LAN1.", ["P2-1 págs. 3–5"], "eth1", 5001, [u1], ETH1_ESSENTIAL);
    vm("t2", "T2, la aplicación: está en la LAN1 y en la LAN2 (dos tarjetas), sin enrutar entre ellas.", ["P2-1 pág. 7"], "eth1", 5002, [ref(t, "udhcpc -i eth1", s("eth1"), u1)], ETH1_ESSENTIAL);
    vm("t3", "T3, los datos: solo en la LAN2. Nadie de fuera llega aquí directamente.", ["P2-1 pág. 7"], "check", 5003);
    if (n === 1)
      for (const lan of [1, 2] as const) {
        const tn = ref("kvm1", `telnet localhost 501${lan}`, s("dhcp"));
        const inner = span("kvm1", s("dhcp"), "setup-interfaces", "service dhcpd restart", tn);
        const me = vm(`dhcp-lan${lan}`, `Recepción de la LAN${lan}: 10.250.${lan}.1/24, reparte .100–.150 sin puerta de enlace.`, ["P2-1 pág. 7"], "dhcp", 5010 + lan, inner, SETUP_ESSENTIAL);
        me.links.push(`dhcp-lan${lan}-dhcpd`);
        out.push({ id: `dhcp-lan${lan}-dhcpd`, kind: "service", host: "kvm1", node: `dhcpd:${K1}:dhcp-lan${lan}`, name: `dhcpd · LAN${lan}`, what: "El recepcionista: reparte las IPs de /etc/dhcp/dhcpd.conf. Tras editarlo, service dhcpd restart.", pdf: ["P2-1 pág. 7"], essential: DHCPD_ESSENTIAL, refs: span("kvm1", s("dhcp"), "vi /etc/dhcp", "service dhcpd restart", tn), links: [`dhcp-lan${lan}`] });
      }
  }
  for (const lan of [1, 2] as const) {
    const vni = 250 + lan;
    out.push({ id: `tunnel${vni}`, kind: "tunnel", node: `tunnel:${vni}`, name: `Pasadizo VXLAN ${vni} · LAN${lan}`, what: `La LAN${lan} (10.250.${lan}.0/24) a los dos lados: lan${lan} de KVM1 y lan${lan} de KVM2 son el mismo switch.`, pdf: ["P2-2 págs. 3–4"], refs: [ref("kvm1", `con-name vx${vni} `), ref("kvm2", `con-name vx${vni} `)], hl: ["id", "remote", "master"], links: [`vx${vni}-kvm1`, `vx${vni}-kvm2`, "kvm1-gate", "kvm2-gate"] });
  }
  out.push({ id: "exterior", kind: "exterior", node: "pc", name: "Tú, desde fuera", what: "Con la VPN, desde tu PC: el 2221 de KVM1 te lleva al 22 de su T1 (y el 2222 de KVM2, al suyo).", pdf: ["P2-1 pág. 5"], refs: [ref("pc", "ssh -p 2221")], links: ["kvm1-door", "kvm2-door"] });
  return out;
}

/* ================================================================== achievements and the two labs */

export const ACHIEVEMENTS: Achievement[] = [
  { id: "sin-pistas", icon: "🧠", title: "Sin pistas", desc: "Termina un laboratorio sin abrir ninguna pista." },
  { id: "dora", icon: "📨", title: "DORA completo", desc: "Un cliente consigue su IP: Discover, Offer, Request y Ack.", test: (l) => l.done.has("dora") },
  { id: "tunel", icon: "🌉", title: "Túnel abierto", desc: "Una VXLAN levantada entre KVM1 y KVM2.", test: (l) => [...l.done].some((x) => x.startsWith("tunnel:")) },
  { id: "cazatrampas", icon: "🪤", title: "Cazatrampas", desc: "Caes en una de nuestras trampas y la arreglas." },
  { id: "recepcionista", icon: "🛎️", title: "Recepcionista de vuelta", desc: "dhcpd vuelve a arrancar después de haber fallado.", test: (l) => l.done.has("dhcpd-back") },
  { id: "entre-hoteles", icon: "🏓", title: "Ping entre hoteles", desc: "Un ping que cruza la VXLAN.", test: (l) => l.done.has("ping-tunnel") },
  { id: "desde-la-calle", icon: "🚪", title: "Desde la calle", desc: "Entras en T1 desde tu PC por el hostfwd (ssh -p 2221).", test: (l) => l.done.has("ssh-fwd-pc") },
  { id: "buen-plan", icon: "🗺️", title: "Buen plan", desc: "Ordenas el Planifica a la primera." },
];

/** The lab as it is at the end (the map's complete topology): the whole replay typed at once. Use `now` as the sim clock. */
export function finalLab(def: LabDef) {
  const lab = def.start();
  let now = 0;
  for (const s of def.steps) {
    if (s.plan) lab.done.add("plan");
    for (const c of s.cmds) exec(lab, c.text, (now += (c.wait ?? 0) + 300), c.term);
  }
  refresh(lab, now);
  return { lab, now };
}

/** Cazatrampas: the trap's mistake happened live and its step is now done. */
export const trapFixed = (lab: LabDef, l: Lab) => lab.traps.some((t) => l.done.has(t.flag) && lab.steps[t.at].done(l));

export const LABS: LabDef[] = [
  {
    id: "clase",
    title: "Tarea de clase · DHCP + VXLAN",
    intro: "Lo que hicimos el 4 y el 5 de noviembre, con nuestros valores y nuestros errores: un DHCP en un bridge sin IP de KVM1 y un cliente en KVM2 que coge IP a través de una VXLAN.",
    start: start("Nov  4", 16 * 3600 + 40 * 60),
    steps: claseSteps,
    traps: claseTraps,
    pieces: clasePieces(),
  },
  {
    id: "pizarra",
    title: "Pizarra · users fuera y 2 overlays",
    intro: "Interpretación de la pizarra: tres tiers en cada KVM. T1 da a la calle por la red user (hostfwd 2221/2222) y está en la LAN1; T2 está en la LAN1 y en la LAN2 (no enruta entre ellas); T3 solo está en la LAN2. Las dos LAN son VXLAN entre KVM1 y KVM2 (id 251 y 252), con un DHCP para cada una en KVM1.",
    start: start("Nov  5", 10 * 3600),
    steps: pizarraSteps,
    traps: pizarraTraps,
    plan: pizarraPlan,
    pieces: pizarraPieces(),
  },
];
