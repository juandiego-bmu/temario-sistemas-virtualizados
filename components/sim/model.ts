// Simulated lab for practices 1 and 2: your PC, the VPN, the KVM servers and their VMs, disks and networks.
// Pure logic, no DOM: the terminal prints what exec() returns and the 3D scene draws the state and plays the effects.

export type Kind = "pc" | "server" | "vm" | "monitor";
export type Via = "stdio" | "telnet" | "ssh" | "none";
/** A terminal window: the two labs run one per KVM, side by side, plus your PC. */
export type Term = "pc" | "kvm1" | "kvm2";
export interface Frame {
  k: Kind;
  ip?: string;
  pid?: number;
  via?: Via;
  to?: string; // ssh into a VM: the address you dialled (what exit prints)
  saved?: string; // the server's working directory before this SSH session
  wait?: boolean; // telnet queued behind another window: frozen
  held?: string[]; // what was typed while queued
  esc?: boolean; // Ctrl+] pressed: at the telnet> prompt
  login?: 0 | 1 | 2; // serial console: 0 blank (press Enter), 1 login:, 2 Password:
  user?: string;
  ask?: Ask; // setup-interfaces dialog
  edit?: { path: string; buf: string[]; dirty: boolean }; // vi
}
export interface Ask {
  q: "pick" | "ip" | "mask" | "gw" | "manual";
  cur?: string;
  addr?: string;
  mask?: string;
  cfg: Record<string, Iface>; // answers so far
  old: Record<string, Iface>; // the file before (its values are the defaults offered)
}
export type Iface = { type: "dhcp" } | { type: "none" } | { type: "static"; addr: string; mask: string; gw?: string };
/** What an Alpine guest keeps on its disk: /etc/network/interfaces and, in the DHCP image, /etc/dhcp/dhcpd.conf. */
export interface Net {
  ifs: Record<string, Iface>;
  conf?: string[];
}
export type Svc = "started" | "stopped" | "failed";
export type Role = "plain" | "web" | "dhcp";
export type Tone = "err" | "ok" | "dim" | "info" | "warn";
/** One terminal line. d: delay in ms from the command; act: a button that runs a command. */
export interface Line {
  t: string;
  c?: Tone;
  d?: number;
  act?: { label: string; cmd: string };
  soft?: boolean; // red, but a result (a service that fails, a lost ping), not a rejected command
}
export interface Snap {
  name: string;
  used: number;
  tty?: boolean;
}
export interface Img {
  path: string;
  kind: "base" | "clone" | "full" | "data" | "link";
  fmt: "qcow2" | "raw";
  backing?: string; // absolute path of the parent
  bname?: string; // the parent as written in -b
  target?: string; // what a symlink points to
  virt: number; // MiB
  used: number; // KiB
  snaps: Snap[];
  tty?: boolean; // its own extlinux.conf has console=ttyS0 (undefined: whatever the parent has)
  role: Role;
  ro: boolean;
  stale?: boolean; // its base changed under it
  net?: Net; // guest config written on this layer (copy-on-write: read the first one up the chain)
}
export interface Fwd {
  host: number;
  guest: number;
}
export interface Nic {
  id: string;
  kind: "user" | "bridge";
  br?: string;
  model: string;
  mac: string;
  fwd: Fwd[];
  ip?: string;
  tried?: boolean;
  tap?: string;
}
export interface Vm {
  pid: number;
  name?: string;
  mem: number;
  smp: number;
  kvm: boolean;
  disk: string;
  extra: { path: string; iface: string }[];
  nics: Nic[];
  telnet?: number;
  mon: boolean;
  qmp?: string;
  stopped: boolean; // T: waiting for the terminal
  paused: boolean;
  upAt: number;
  tmp: boolean; // -snapshot
  role: Role;
  cmd: string;
  fwdOn: boolean;
  routes: { net: string; via: string }[];
  oneTty: boolean;
  logged?: boolean; // someone logged in on its serial console (it stays logged in after Ctrl+])
  svc: Record<string, Svc>; // OpenRC services inside (dhcpd in the DHCP image)
  serves?: Sub; // the subnet the running dhcpd loaded
  log: string[]; // /var/log/messages
  leases: Record<string, string>; // dhcpd: MAC -> IP
}
export interface Bridge {
  con: string;
  method: "manual" | "auto" | "disabled";
  ip?: string;
  slave?: string;
  uuid?: string;
}
/** A VXLAN connection: frames of bridge `master` travel in UDP 8472 to `remote` with this VNI. */
export interface Vx {
  con: string;
  id: number;
  remote: string;
  master?: string; // con-name or ifname of a bridge
  uuid: string;
  dup?: boolean; // same id as another vxlan of this host: the kernel refuses it (never active)
}
export interface Host {
  ip: string;
  name: string;
  label: string;
  dirs: Set<string>;
  files: Map<string, Img>;
  vms: Vm[];
  bridges: Map<string, Bridge>;
  allow: Set<string>;
  open: Set<number>; // tcp ports open now
  perm: Set<number>; // tcp ports saved with --permanent
  udp: Set<number>; // udp ports open now (8472 = VXLAN)
  permUdp: Set<number>;
  vx: Map<string, Vx>; // by ifname
  jobs: number[];
  cwd: string;
  alias: boolean;
  dead: boolean;
  cut: boolean;
  warned: boolean;
}
/*
 * Effects for the 3D scene (scene.play). Node ids used in paths and ids:
 *   pc · vpn · repo · srv:IP (the tower's ens32) · br:IP:BRIDGE · vx:IP:IFNAME (a VXLAN end) · gate:IP (the 8472/udp
 *   firewall gate) · fw:IP:PORT (a tcp port) · vm:PID · nat:PID (its user network) · disk:IP:PATH.
 *   A frame crossing a tunnel shows up in a path as … br:A:x, vx:A:if, srv:A, gate:B, vx:B:if, br:B:y …
 * packet  a frame travelling along `path`.
 * boot/gone/flash  a piece appears / disappears / blinks (ids as above).
 * boom    a server goes down (poweroff on the host, ens32 inside a bridge).
 * dora    one DHCP message, in order discover → offer → request → ack. from/to are vm:PID, path goes from→to, ip is
 *         the address offered; vni is set when it crosses a tunnel; lost: nobody answered (only a discover).
 * tunnel  a VXLAN link went up or down: ends = its two vx:IP:IFNAME ids.
 * encap   a frame wrapped in UDP 8472 with that VNI, from host IP to host IP; ok false: it died on the way.
 * gate    the firewall of `host` for `port` ("8472/udp") was opened/closed, or (blocked) a packet bounced off it.
 * svc     a service inside a VM changed state (dhcpd: the reception desk light).
 * queue   a second telnet to a busy console waits in line (on) or got the console / left (off).
 * edit    vi opened (text = the file) or saved (saved = true, text = new file) a file inside vm.
 * focus   (replay player only) fly the camera to an id: a node id above, or vm:IP:NAME, tunnel:VNI, overview.
 */
export type Fx =
  | { k: "packet"; path: string[]; tone?: "ok" | "err" | "data" | "dhcp" }
  | { k: "boot" | "gone" | "flash"; id: string }
  | { k: "boom"; ip: string }
  | { k: "dora"; stage: "discover" | "offer" | "request" | "ack"; from: string; to: string; path: string[]; ip: string; vni?: number; lost?: boolean }
  | { k: "tunnel"; vni: number; ends: string[]; up: boolean }
  | { k: "encap"; vni: number; from: string; to: string; ok: boolean }
  | { k: "gate"; host: string; port: string; open: boolean; blocked?: boolean }
  | { k: "svc"; vm: string; svc: string; state: Svc }
  | { k: "queue"; host: string; port: number; vm: string; on: boolean }
  | { k: "edit"; vm: string; file: string; text: string; saved?: boolean }
  | { k: "focus"; id: string };
export interface Lab {
  stack: Frame[]; // the active terminal's stack (the same array as stacks[term])
  stacks: Partial<Record<Term, Frame[]>>;
  term: Term;
  real: boolean; // the 2026-11 labs: named guests, login prompts, udhcpc retrying in the background, Ctrl+] then quit
  t0?: number; // sim time of the first command (log clock)
  clock: number; // seconds since midnight shown at t0
  day: string; // log date, e.g. "Nov  4"
  vpn: boolean;
  hosts: Host[];
  nextPid: number;
  seq: number;
  done: Set<string>;
  menu?: { pid: number; tab: boolean };
}

const REPO = "www.ho.ac.uma.es";
const REPO_PATH = "/virt/installed-systems/";
const RAM = 1914;
const BASE_USED = 310272; // KiB: the 303 MiB of alpine-base
const UUID = "a6a13df6-0355-4422-8332-a65919960423";

function newHost(ip: string, name: string, label: string): Host {
  return {
    ip,
    name,
    label,
    dirs: new Set(["/", "/root", "/home", "/etc", "/etc/qemu", "/var", "/var/run", "/var/log", "/tmp", "/boot", "/usr", "/proc"]),
    files: new Map(),
    vms: [],
    bridges: new Map(),
    allow: new Set(["virbr0"]),
    open: new Set(),
    perm: new Set(),
    udp: new Set(),
    permUdp: new Set(),
    vx: new Map(),
    jobs: [],
    cwd: "/root",
    alias: false,
    dead: false,
    cut: false,
    warned: false,
  };
}

export function newLab(): Lab {
  const stack: Frame[] = [{ k: "pc" }];
  return { stack, stacks: { pc: stack }, term: "pc", real: false, clock: 10 * 3600 + 30 * 60, day: "Nov  2", vpn: false, hosts: [newHost("10.0.16.173", "vm-16-173", "KVM1"), newHost("10.0.16.174", "vm-16-174", "KVM2")], nextPid: 4211, seq: 0, done: new Set() };
}

/** A deep copy (the replay rewinds to it after showing a trap). */
export const cloneLab = (lab: Lab): Lab => structuredClone(lab);

/** Deterministic, well-formed UUIDs for nmcli. */
const uuid = (n: number) => {
  let x = (n * 2654435761) >>> 0;
  const s = Array.from({ length: 6 }, () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) >>> 4).toString(16).padStart(7, "0").slice(-6)).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-9${s.slice(17, 20)}-${s.slice(20, 32)}`;
};

/* ------------------------------------------------------------------ paths and images */

const norm = (p: string) => {
  const out: string[] = [];
  for (const s of p.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return "/" + out.join("/");
};
const abs = (h: Host, p: string) => norm(p === "~" ? "/root" : p.startsWith("~/") ? "/root" + p.slice(1) : p.startsWith("/") ? p : `${h.cwd}/${p}`);
export const dirOf = (p: string) => norm(p.replace(/\/[^/]*$/, "") || "/");
export const baseName = (p: string) => p.split("/").pop() || p;

/** Follow symlinks to the real image. */
export function real(h: Host, p: string): Img | undefined {
  let f = h.files.get(p);
  for (let i = 0; f && f.kind === "link" && i < 8; i++) f = h.files.get(f.target!);
  return f && f.kind !== "link" ? f : undefined;
}

/** The image and its backing files, top first; `broken` names the first link that does not exist. */
export function chain(h: Host, p: string): { list: Img[]; broken?: string } {
  const list: Img[] = [];
  let cur: string | undefined = p;
  for (let i = 0; cur && i < 10; i++) {
    const img = real(h, cur);
    if (!img) return { list, broken: cur };
    list.push(img);
    cur = img.backing;
  }
  return { list };
}

export const ttyOf = (h: Host, p: string) => {
  for (const img of chain(h, p).list) if (img.tty !== undefined) return img.tty;
  return false;
};
const roleOf = (h: Host, p: string): Role => chain(h, p).list.find((i) => i.role !== "plain")?.role ?? "plain";

const kib = (k: number) => (k >= 1048576 ? `${(k / 1048576).toFixed(k >= 10485760 ? 0 : 2).replace(/\.00$/, "")} GiB` : k >= 1024 ? `${Math.round(k / 1024)} MiB` : `${k} KiB`);
const gib = (m: number) => (m % 1024 === 0 ? `${m / 1024} GiB` : `${m} MiB`);
const bytes = (m: number) => m * 1048576;
const mib = (s: string) => {
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)i?B?$/i.exec(s.trim());
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return Math.round(n * ({ K: 1 / 1024, M: 1, G: 1024, T: 1048576, "": 1 / 1048576 } as Record<string, number>)[m[2].toUpperCase()]);
};

/* ------------------------------------------------------------------ lab helpers */

export const top = (lab: Lab, term?: Term) => {
  const s = (term && lab.stacks[term]) || lab.stack;
  return s[s.length - 1];
};
export const hostOf = (lab: Lab, ip?: string) => lab.hosts.find((h) => h.ip === ip);
const findHost = (lab: Lab, s: string) => lab.hosts.find((h) => [h.ip, h.name, `${h.name}.ho.ac.uma.es`, h.label.toLowerCase()].includes(s.toLowerCase()));
export const vmOf = (lab: Lab, pid?: number) => {
  for (const h of lab.hosts) {
    const v = h.vms.find((x) => x.pid === pid);
    if (v) return { h, v };
  }
  return undefined;
};
export const vmName = (h: Host, v: Vm) => v.name ?? baseName(v.disk).replace(/\.qcow2$/, "");
export const isUp = (v: Vm, now: number) => !v.stopped && now >= v.upAt;

/** The guest's hostname: the course images say who they are (alpine-dhcp, alpine-base); the P1/P2 sims keep localhost. */
export const vmHostname = (lab: Lab, v: Vm) => (lab.real ? (v.role === "dhcp" ? "alpine-dhcp" : "alpine-base") : "localhost");

/** Bring every VM up to date (static IPs, dhcpd at boot, DHCP leases, udhcpc retrying): call it before drawing or checking. Returns what happened meanwhile (DORA). */
export function refresh(lab: Lab, now: number): Fx[] {
  const fx: Fx[] = [];
  for (const h of lab.hosts) for (const v of h.vms) ips(lab, h, v, now, fx);
  return fx;
}

/** The prompt of a terminal (the active one by default). "Password:" means: mask the input. */
export function prompt(lab: Lab, term?: Term): string {
  const f = top(lab, term);
  if (f.k === "pc") return "PS C:\\Users\\alumno>";
  if (f.k === "monitor") return "(qemu)";
  const h = hostOf(lab, f.ip)!;
  if (f.k === "server") return `[root@${h.name} ${h.cwd === "/root" ? "~" : baseName(h.cwd) || "/"}]#`;
  if (f.esc) return "telnet>";
  if (f.wait || f.edit || f.login === 0) return "";
  const hit = vmOf(lab, f.pid);
  const hn = hit ? vmHostname(lab, hit.v) : "localhost";
  if (f.login === 1) return `${hn} login:`;
  if (f.login === 2) return "Password:";
  if (f.ask && hit) return askText(hit.v, f.ask);
  if (lab.menu?.pid === f.pid) return "boot:";
  if (f.via === "none") return "";
  return `${hn}:~#`;
}

/** The file open in vi in that terminal (for the editor modal). */
export const editing = (lab: Lab, term?: Term) => {
  const e = top(lab, term).edit;
  return e ? { path: e.path, text: e.buf.join("\n") } : undefined;
};

/** Serial consoles in use: who holds each one and who waits in line (the scene's telefonillo cables). */
export const consoles = (lab: Lab) =>
  (Object.entries(lab.stacks) as [Term, Frame[]][]).flatMap(([term, s]) => s.filter((f) => f.k === "vm" && f.via === "telnet").map((f) => ({ term, host: f.ip!, port: vmOf(lab, f.pid)?.v.telnet ?? 0, vm: `vm:${f.pid}`, waiting: !!f.wait })));

/** Bridge NICs whose udhcpc keeps asking with nobody answering (2026 labs): the scene can pulse DISCOVERs from them. */
export const asking = (lab: Lab, now: number) =>
  lab.real ? lab.hosts.flatMap((h) => h.vms.filter((v) => v.role !== "dhcp" && isUp(v, now)).flatMap((v) => v.nics.flatMap((n, i) => (n.kind === "bridge" && !n.ip && netOf(h, v).ifs[`eth${i}`]?.type === "dhcp" ? [{ host: h.ip, vm: `vm:${v.pid}`, br: n.br! }] : [])))) : [];

/* ------------------------------------------------------------------ guest config: interfaces and dhcpd.conf */

export const FACTORY_CONF = ["# dhcpd.conf", "#", "# Sample configuration file for ISC dhcpd", "#", "default-lease-time 600;", "max-lease-time 7200;", "", "subnet 10.0.0.0 netmask 255.255.255.0 {", "  range 10.0.0.100 10.0.0.200;", "  option routers 10.0.0.254;", "}"];
/** dhcpd.conf with one /24 subnet: the factory file after editing it. */
export const dhcpdConf = (net: string, from: string, to: string, routers?: string) => [...FACTORY_CONF.slice(0, 7), `subnet ${net} netmask 255.255.255.0 {`, `  range ${from} ${to};`, ...(routers ? [`  option routers ${routers};`] : []), "}"].join("\n");

/** The guest config as the VM sees it: the first layer up its disk chain that has one, else the image's factory one. */
export function netOf(h: Host, v: Vm): Net {
  for (const img of chain(h, v.disk).list) if (img.net) return img.net;
  return v.role === "dhcp" ? { ifs: { eth0: { type: "static", addr: "10.0.0.253", mask: "255.255.255.0", gw: "10.0.0.254" } }, conf: FACTORY_CONF } : { ifs: { eth0: { type: "dhcp" } } };
}
const setNet = (h: Host, v: Vm, net: Net) => {
  const img = chain(h, v.disk).list[0];
  if (img) img.net = net;
};

const n32 = (ip: string) => ip.split(".").reduce((s, x) => s * 256 + +x, 0);
const ipOf = (n: number) => [24, 16, 8, 0].map((b) => Math.floor(n / 2 ** b) % 256).join(".");
const isIp = (s?: string) => !!s && /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split(".").every((x) => +x < 256);
const inNet = (ip: string, net: string, mask: string) => isIp(ip) && isIp(net) && isIp(mask) && ((n32(ip) & n32(mask)) >>> 0) === ((n32(net) & n32(mask)) >>> 0);

export interface Sub {
  net: string;
  mask: string;
  from?: string;
  to?: string;
  routers?: string;
}
/** dhcpd.conf the way dhcpd reads it (enough of it): subnets, ranges, routers and the classic errors. */
export function parseConf(lines: string[]): { subs: Sub[]; err?: string[] } {
  const subs: Sub[] = [];
  let cur: Sub | undefined;
  const body = lines.map((l, i) => ({ t: l.replace(/#.*/, "").trim(), n: i + 1, raw: l })).filter((x) => x.t);
  const bad = (at: { n: number; raw: string }, msg: string) => ({ subs, err: [`/etc/dhcp/dhcpd.conf line ${at.n}: ${msg}`, at.raw, "Configuration file errors encountered -- exiting"] });
  for (let i = 0; i < body.length; i++) {
    const { t } = body[i];
    const next = body[i + 1] ?? body[i];
    if (t === "}") {
      if (!cur) return bad(body[i], "expecting a declaration.");
      cur = undefined;
      continue;
    }
    const sub = /^subnet\s+(\S+)\s+netmask\s+(\S+)\s*\{$/.exec(t);
    if (sub) {
      if (!isIp(sub[1]) || !isIp(sub[2])) return bad(body[i], "expecting IP address or hostname.");
      subs.push((cur = { net: sub[1], mask: sub[2] }));
      continue;
    }
    if (!t.endsWith(";")) return bad(next, "semicolon expected.");
    const s = t.slice(0, -1).trim();
    const r = /^range\s+(\S+)\s+(\S+)$/.exec(s);
    if (r && cur) {
      if (!inNet(r[1], cur.net, cur.mask) || !inNet(r[2], cur.net, cur.mask)) return { subs, err: [`Address range ${r[1]} to ${r[2]} not on net ${cur.net}/${cur.mask}!`, "Configuration file errors encountered -- exiting"] };
      cur.from = r[1];
      cur.to = r[2];
    }
    const o = /^option\s+routers\s+(\S+)$/.exec(s);
    if (o && cur) cur.routers = o[1];
  }
  if (cur) return bad({ n: lines.length + 1, raw: "" }, "unexpected end of file");
  return { subs };
}

/** The subnet a DHCP VM is serving right now (what its running dhcpd loaded), if any. */
export const serving = (v: Vm) => (v.role === "dhcp" && v.svc.dhcpd === "started" ? v.serves : undefined);

const clock = (lab: Lab, now: number) => {
  const s = Math.floor(lab.clock + Math.max(0, now - (lab.t0 ?? now)) / 1000) % 86400;
  return [s / 3600, (s / 60) % 60, s % 60].map((x) => String(Math.floor(x)).padStart(2, "0")).join(":");
};
/** wget's "2026-11-04 16:41:23" (every lab day is in November 2026). */
const stamp = (lab: Lab, now: number) => `2026-11-${lab.day.trim().split(/\s+/)[1].padStart(2, "0")} ${clock(lab, now)}`;
/** A line in the guest's /var/log/messages. */
function syslog(lab: Lab, v: Vm, now: number, lvl: "info" | "err", ...msgs: string[]) {
  for (const m of msgs) v.log.push(`${lab.day} ${clock(lab, now)} ${vmHostname(lab, v)} daemon.${lvl} dhcpd[${2400 + (v.pid % 97)}]: ${m}`);
}

/** (Re)start dhcpd inside a DHCP VM: it serves the subnet that contains its own eth0 IP, or exits. */
function startDhcpd(lab: Lab, h: Host, v: Vm, now: number, fx?: Fx[]) {
  const ip = v.nics[0]?.ip;
  const p = parseConf(netOf(h, v).conf ?? []);
  const sub = !p.err && ip ? p.subs.find((s) => s.from && inNet(ip, s.net, s.mask)) : undefined;
  const err = p.err ?? (sub ? [] : [`No subnet declaration for eth0 (${ip ?? "0.0.0.0"}).`, "** Ignoring requests on eth0.  If this is not what", "   you want, please write a subnet declaration", "   in your dhcpd.conf file for the network segment", "   to which interface eth0 is attached. **", "Not configured to listen on any interfaces!", "exiting."]);
  const was = v.svc.dhcpd;
  v.svc.dhcpd = sub ? "started" : "failed";
  v.serves = sub;
  syslog(lab, v, now, "info", "Internet Systems Consortium DHCP Server 4.4.2-P1");
  if (sub) syslog(lab, v, now, "info", `Listening on LPF/eth0/${v.nics[0].mac.toLowerCase()}/${sub.net}/24`, "Server starting service.");
  else syslog(lab, v, now, "err", ...err.filter(Boolean));
  if (sub && was && was !== "started") lab.done.add("dhcpd-back");
  fx?.push({ k: "svc", vm: `vm:${v.pid}`, svc: "dhcpd", state: v.svc.dhcpd });
  return err;
}

/** IPs of a VM's NICs as its /etc/network/interfaces brings them up: static, or by DHCP (in the 2026 labs udhcpc -b keeps retrying in the background). */
export function ips(lab: Lab, h: Host, v: Vm, now: number, fx: Fx[] = []) {
  if (!isUp(v, now)) return v.nics.map((n) => n.ip);
  const cfg = netOf(h, v).ifs;
  v.nics.forEach((n, i) => {
    if (n.ip) return;
    if (n.kind === "user") return void (n.ip = "10.0.2.15");
    const c = cfg[`eth${i}`];
    if (c?.type === "static") return void (n.ip = c.addr);
    if (c?.type !== "dhcp" || !n.br) return;
    if (lab.real) lease(lab, h, v, n, now, fx);
    else if (!n.tried) {
      n.tried = true;
      lease(lab, h, v, n, now, fx, v.upAt - 600);
    }
  });
  if (v.role === "dhcp" && !v.svc.dhcpd) startDhcpd(lab, h, v, now, fx);
  return v.nics.map((n) => n.ip);
}

/* ------------------------------------------------------------------ VXLAN: links and LANs */

export interface End {
  ip: string; // host
  ifname: string;
  br?: string; // the bridge it hangs from (undefined: master missing, or a duplicate id)
}
export interface Link {
  vni: number;
  a: End;
  b?: End; // the matching end on the other host
  up: boolean;
  why?: "remote" | "peer" | "id" | "master" | "down" | "fw";
}
const brOf = (h: Host, x: Vx) => (x.dup ? undefined : [...h.bridges].find(([name, b]) => name === x.master || b.con === x.master)?.[0]);

/** Every VXLAN of the lab, paired end to end. Up when both ends point at each other's ens32 IP with the same id, hang from a bridge, and both firewalls let 8472/udp in. */
export function links(lab: Lab): Link[] {
  const ends = lab.hosts.flatMap((h) => [...h.vx].map(([ifname, x]) => ({ h, x, e: { ip: h.ip, ifname, br: brOf(h, x) } as End })));
  const used = new Set<object>();
  const out: Link[] = [];
  for (const a of ends) {
    if (used.has(a)) continue;
    used.add(a);
    const b = ends.find((o) => !used.has(o) && !o.x.dup && o.h.ip === a.x.remote && o.x.remote === a.h.ip && o.x.id === a.x.id);
    if (b) used.add(b);
    const why = !b ? (a.x.dup ? "id" : hostOf(lab, a.x.remote) ? "peer" : "remote") : !a.e.br || !b.e.br ? "master" : a.h.dead || a.h.cut || b.h.dead || b.h.cut ? "down" : !a.h.udp.has(8472) || !b.h.udp.has(8472) ? "fw" : undefined;
    out.push({ vni: a.x.id, a: a.e, b: b?.e, up: !why, why });
  }
  return out;
}

/** LAN id of a host bridge: bridges joined by an up VXLAN share it. */
function lanKey(lab: Lab) {
  const up = new Map<string, string>();
  const find = (k: string): string => {
    const p = up.get(k);
    return p && p !== k ? find(p) : k;
  };
  for (const l of links(lab))
    if (l.up && l.b) {
      const [x, y] = [find(`${l.a.ip}|${l.a.br}`), find(`${l.b.ip}|${l.b.br}`)].sort();
      if (x !== y) up.set(y, x);
    }
  return (ip: string, br: string) => find(`${ip}|${br}`);
}
export const segOf = (lab: Lab, ip: string, br: string) => lanKey(lab)(ip, br);

/** Every bridge NIC on the same LAN as bridge `br` of host h (across the overlay). */
function lanOf(lab: Lab, h: Host, br: string) {
  const key = lanKey(lab);
  const me = key(h.ip, br);
  return lab.hosts.flatMap((x) => x.vms.flatMap((v) => v.nics.map((n, i) => ({ h: x, v, n, i })))).filter((o) => o.n.kind === "bridge" && key(o.h.ip, o.n.br!) === me);
}

/** Node ids from one bridge to another of the same LAN, through the tunnel if they are on different hosts. */
function hops(lab: Lab, ha: Host, bra: string, hb: Host, brb: string): { path: string[]; vni?: number } {
  if (ha === hb) return { path: [`br:${ha.ip}:${bra}`] };
  const l = links(lab).find((x) => x.up && x.b && [x.a, x.b].some((e) => e.ip === ha.ip && e.br === bra) && [x.a, x.b].some((e) => e.ip === hb.ip && e.br === brb));
  if (!l?.b) return { path: [`br:${ha.ip}:${bra}`, `br:${hb.ip}:${brb}`] };
  const [p, q] = l.a.ip === ha.ip ? [l.a, l.b] : [l.b, l.a];
  return { path: [`br:${ha.ip}:${bra}`, `vx:${p.ip}:${p.ifname}`, `srv:${p.ip}`, `gate:${q.ip}`, `vx:${q.ip}:${q.ifname}`, `br:${hb.ip}:${brb}`], vni: l.vni };
}

/** A frame trying to leave (h, br) through a broken tunnel: it bounces off a closed gate or dies on the way. */
function bounce(lab: Lab, h: Host, br: string, fx: Fx[]) {
  for (const l of links(lab)) {
    const mine = [l.a, l.b].find((e) => e?.ip === h.ip && e.br === br);
    if (l.up || !mine) continue;
    const far = hostOf(lab, h.vx.get(mine.ifname)!.remote);
    const shut = far && !far.udp.has(8472) ? far : l.b && !h.udp.has(8472) ? h : undefined;
    fx.push({ k: "encap", vni: l.vni, from: h.ip, to: far?.ip ?? h.vx.get(mine.ifname)!.remote, ok: false });
    if (shut) fx.push({ k: "gate", host: shut.ip, port: "8472/udp", open: false, blocked: true });
    fx.push({ k: "packet", path: [`br:${h.ip}:${br}`, `vx:${h.ip}:${mine.ifname}`, `srv:${h.ip}`, ...(far ? [`gate:${far.ip}`] : [])], tone: "err" });
  }
}

/** udhcpc on NIC n: DORA with the first DHCP server serving its LAN (any host of the overlay). */
function lease(lab: Lab, h: Host, v: Vm, n: Nic, now: number, fx: Fx[], at = now): boolean {
  for (const s of lanOf(lab, h, n.br!)) {
    if (s.v === v || s.v.role !== "dhcp" || s.i !== 0 || s.v.upAt > at || !isUp(s.v, now)) continue;
    ips(lab, s.h, s.v, now);
    const sub = serving(s.v);
    if (!sub?.from || !sub.to) continue;
    const mac = n.mac.toLowerCase();
    let ip = s.v.leases[mac];
    if (!ip) {
      const used = new Set([...Object.values(s.v.leases), ...lab.hosts.flatMap((x) => x.vms.flatMap((y) => y.nics.map((z) => z.ip)))]);
      for (let k = n32(sub.from); k <= n32(sub.to) && !ip; k++) if (!used.has(ipOf(k))) ip = ipOf(k);
      if (!ip) continue;
      s.v.leases[mac] = ip;
    }
    n.ip = ip;
    const who = lab.real ? " (test)" : "";
    syslog(lab, s.v, now, "info", `DHCPDISCOVER from ${mac}${who} via eth0`, `DHCPOFFER on ${ip} to ${mac}${who} via eth0`, `DHCPREQUEST for ${ip} (${s.v.nics[0].ip}) from ${mac}${who} via eth0`, `DHCPACK on ${ip} to ${mac}${who} via eth0`);
    const { path, vni } = hops(lab, h, n.br!, s.h, s.n.br!);
    const go = [`vm:${v.pid}`, ...path, `vm:${s.v.pid}`];
    const back = [...go].reverse();
    (["discover", "offer", "request", "ack"] as const).forEach((stage, k) => fx.push({ k: "dora", stage, from: k % 2 ? go[go.length - 1] : go[0], to: k % 2 ? go[0] : go[go.length - 1], path: k % 2 ? back : go, ip, vni }));
    if (vni !== undefined) fx.push({ k: "encap", vni, from: h.ip, to: s.h.ip, ok: true });
    lab.done.add("dora");
    if (s.h !== h) lab.done.add("dora-tunnel");
    if (lab.real && sub.net === "10.0.0.0") lab.done.add("trap:factory"); // the DHCP still on its factory range
    return true;
  }
  return false;
}

const sameNet = (a?: string, b?: string) => !!a && !!b && a.split(".").slice(0, 3).join(".") === b.split(".").slice(0, 3).join(".");
const bridgeIp = (h: Host, br?: string) => {
  const b = br ? h.bridges.get(br) : undefined;
  if (!b) return undefined;
  if (b.method === "manual") return b.ip?.split("/")[0];
  if (b.method === "auto") return h.vms.some((x) => x.nics[0]?.br === br && serving(x)) ? (b.ip ??= "10.0.0.150/24").split("/")[0] : undefined;
  return undefined;
};

/* ------------------------------------------------------------------ parsing */

interface Cmd {
  argv: string[];
  bg: boolean;
  nullIn: boolean;
  outFile?: string;
  append: boolean;
  grep?: string;
  raw: string;
}

function tokenize(s: string, sub: (expr: string) => string): string[] {
  const out: string[] = [];
  let cur = "";
  let has = false;
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i) {
        cur += sub(s.slice(i + 1, j));
        has = true;
        i = j;
        continue;
      }
    }
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      q = ch;
      has = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    cur += ch;
    has = true;
  }
  if (cur || has) out.push(cur);
  return out;
}

function split(line: string) {
  const res: { text: string; sep: string }[] = [];
  let cur = "";
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const nx = line[i + 1];
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === ";") {
      res.push({ text: cur, sep: ";" });
      cur = "";
    } else if (ch === "&" && nx === "&") {
      res.push({ text: cur, sep: "&&" });
      cur = "";
      i++;
    } else if (ch === "|" && nx === "|") {
      res.push({ text: cur, sep: "||" });
      cur = "";
      i++;
    } else if (ch === "|") {
      res.push({ text: cur, sep: "|" });
      cur = "";
    } else if (ch === "&" && line[i - 1] !== ">" && nx !== ">") {
      res.push({ text: cur, sep: "&" });
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) res.push({ text: cur, sep: "" });
  return res;
}

/** Pasted multi-line for loops become one line. */
function joinLoops(lines: string[]) {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*for\b.*\bdo\s*$/.test(lines[i])) {
      let s = lines[i].trim();
      let j = i + 1;
      let first = true;
      for (; j < lines.length && !/^\s*done\b/.test(lines[j]); j++) {
        const l = lines[j].trim();
        if (!l) continue;
        s += (first ? " " : /&\s*$/.test(s) ? " " : "; ") + l;
        first = false;
      }
      out.push(`${s}${/&\s*$/.test(s) ? " " : "; "}${(lines[j] ?? "done").trim()}`);
      i = j;
    } else out.push(lines[i]);
  }
  return out;
}

const expandList = (s: string) =>
  s
    .trim()
    .replace(/\$\(seq\s+(\d+)\s+(\d+)\)/g, (_, a, b) => Array.from({ length: Math.max(0, +b - +a + 1) }, (_, k) => +a + k).join(" "))
    .replace(/\{(\d+)\.\.(\d+)\}/g, (_, a, b) => Array.from({ length: Math.max(0, +b - +a + 1) }, (_, k) => +a + k).join(" "))
    .split(/\s+/)
    .filter(Boolean);

/* ------------------------------------------------------------------ the interpreter */

interface Ctx {
  lab: Lab;
  out: Line[];
  fx: Fx[];
  now: number;
  ok: boolean;
}
const say = (c: Ctx, t: string, tone?: Tone, d?: number) => void c.out.push({ t, c: tone, d });
const fail = (c: Ctx, t: string) => {
  say(c, t, "err");
  c.ok = false;
};
const tip = (c: Ctx, t: string) => say(c, `ℹ ${t}`, "info");
/** A red line that is a result, not a mistake of whoever typed (the 3D lab does not count it as an error). */
const soft = (c: Ctx, t: string, d?: number) => {
  c.out.push({ t, c: "err", d, soft: true });
  c.ok = false;
};

/** Run what the user typed (one or more lines) in a terminal (the active one by default). Mutates the lab. */
export function exec(lab: Lab, input: string, now: number, term?: Term): { out: Line[]; fx: Fx[] } {
  if (term && lab.stacks[term]) {
    lab.term = term;
    lab.stack = lab.stacks[term]!;
  }
  lab.t0 ??= now;
  const c: Ctx = { lab, out: [], fx: refresh(lab, now), now, ok: true };
  const before = upLinks(lab);
  feed(c, input);
  after(c, before);
  return { out: c.out, fx: c.fx };
}

function feed(c: Ctx, input: string): void {
  const key = keyOf(input.trim());
  if (key) return special(c, key);
  const f = top(c.lab);
  if (f.esc) return telnetCmd(c, f, input);
  if (f.wait) return void (f.held ??= []).push(input);
  if (f.held?.length) {
    // the console is ours now: everything typed while waiting arrives at once
    const held = f.held;
    f.held = undefined;
    say(c, `(la consola quedó libre: le llega de golpe lo que tecleaste mientras esperabas: ${held.length} línea${held.length === 1 ? "" : "s"})`, "warn");
    for (const x of [...held, input]) feed(c, x);
    return;
  }
  if (f.login !== undefined) return login(c, f, input);
  if (f.ask) return answer(c, f, input);
  if (f.edit) return editor(c, f, input);
  if (c.lab.menu) return menuInput(c, input);
  const lines = joinLoops(input.replace(/\\\r?\n/g, " ").split(/\r?\n/));
  for (const l of lines) runLine(c, l);
}

const upLinks = (lab: Lab) => new Map(links(lab).flatMap((l) => (l.up && l.b ? [[[`${l.a.ip}:${l.a.ifname}`, `${l.b.ip}:${l.b.ifname}`].sort().join("|"), l] as const] : [])));

/** After every command: tunnels that went up or down, and consoles freed for the next window in line. */
function after(c: Ctx, before: Map<string, Link>) {
  const now = upLinks(c.lab);
  const ends = (l: Link) => [`vx:${l.a.ip}:${l.a.ifname}`, `vx:${l.b!.ip}:${l.b!.ifname}`];
  for (const [k, l] of now)
    if (!before.has(k)) {
      c.fx.push({ k: "tunnel", vni: l.vni, ends: ends(l), up: true });
      c.lab.done.add(`tunnel:${l.vni}`);
    }
  for (const [k, l] of before) if (!now.has(k)) c.fx.push({ k: "tunnel", vni: l.vni, ends: ends(l), up: false });
  for (const h of c.lab.hosts)
    for (const v of h.vms) {
      const on = Object.values(c.lab.stacks).flatMap((s) => s!.filter((f) => f.k === "vm" && f.pid === v.pid && f.via === "telnet"));
      const next = on.find((f) => f.wait);
      if (!next || on.some((f) => !f.wait)) continue;
      next.wait = false;
      next.login = c.lab.real ? 0 : undefined;
      c.fx.push({ k: "queue", host: h.ip, port: v.telnet ?? 0, vm: `vm:${v.pid}`, on: false });
    }
}

/** At the telnet> prompt (after Ctrl+]). */
function telnetCmd(c: Ctx, f: Frame, input: string) {
  const t = input.trim();
  if (!t) return void (f.esc = false);
  if (/^(q|quit|c|close)$/.test(t)) {
    say(c, "Connection closed.");
    if (f.wait) c.fx.push({ k: "queue", host: f.ip!, port: vmOf(c.lab, f.pid)?.v.telnet ?? 0, vm: `vm:${f.pid}`, on: false });
    c.lab.stack.pop();
    return;
  }
  say(c, t === "?" || t === "help" ? "close\tclose current connection\nquit\texit telnet\n(Intro: volver a la consola)" : "?Invalid command");
}

/** The serial console's getty: nothing until Enter, then login and password (any password: it is a simulation). */
function login(c: Ctx, f: Frame, input: string): void {
  const hit = vmOf(c.lab, f.pid);
  if (!hit) return;
  const { v } = hit;
  const t = input.trim();
  if (f.login === 0) {
    if (!isUp(v, c.now)) return say(c, "(la MV todavía está arrancando…)", "dim");
    if (v.logged) {
      f.login = undefined;
      return t ? feed(c, input) : undefined;
    }
    say(c, "\nWelcome to Alpine Linux 3.13\nKernel 5.10.43-0-virt on an x86_64 (/dev/ttyS0)\n");
    f.login = 1;
    if (!t) return;
  }
  if (f.login === 1) {
    if (!t) return;
    f.user = t;
    f.login = 2;
    return;
  }
  if (f.user !== "root") {
    say(c, "\nLogin incorrect", "err");
    f.login = 1;
    return;
  }
  f.login = undefined;
  v.logged = true;
  say(c, "Welcome to Alpine!\n\nYou can setup the system with the command: setup-alpine\n");
}

const keyOf = (s: string) => {
  const t = s.toLowerCase().replace(/\s+/g, "");
  if (/^(\^a|ctrl\+a|c-a)x$/.test(t)) return "ax";
  if (/^(\^a|ctrl\+a|c-a)c$/.test(t)) return "ac";
  if (t === "^c" || t === "ctrl+c") return "c";
  if (t === "^]" || t === "ctrl+]") return "]";
  if (t === "tab") return "tab";
  return null;
};

function runLine(c: Ctx, line: string) {
  const m = /^\s*for\s+(\w+)\s+in\s+([^;]+);\s*do\s+([\s\S]*?);?\s*done\s*;?\s*([\s\S]*)$/.exec(line);
  if (m) {
    for (const item of expandList(m[2])) runLine(c, m[3].replace(new RegExp(`\\$\\{?${m[1]}\\}?(?![\\w])`, "g"), item));
    if (m[4].trim()) runLine(c, m[4]);
    return;
  }
  const parts = split(line);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const prev = parts[i - 1]?.sep;
    if (prev === "&&" && !c.ok) continue;
    if (prev === "||" && c.ok) continue;
    if (!p.text.trim()) continue;
    let grep: string | undefined;
    while (parts[i]?.sep === "|" && parts[i + 1]) {
      const g = /^\s*grep\s+(?:-\w+\s+)?["']?([^"']+?)["']?\s*$/.exec(parts[i + 1].text);
      if (g) grep = g[1];
      i++;
    }
    c.ok = true;
    const before = c.out.length;
    one(c, p.text, parts[i].sep === "&" || p.sep === "&");
    if (grep) {
      const kept = c.out.slice(before).filter((l) => l.t.includes(grep!) || l.c === "info");
      c.out.splice(before, c.out.length - before, ...kept);
    }
  }
}

function one(c: Ctx, text: string, bg: boolean) {
  const f = top(c.lab);
  const h = hostOf(c.lab, f.ip);
  const toks = tokenize(text.trim(), (expr) => backtick(c, h, expr));
  const cmd: Cmd = { argv: [], bg, nullIn: false, append: false, raw: text.trim() };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "<" || t.startsWith("<")) {
      const file = t === "<" ? toks[++i] : t.slice(1);
      cmd.nullIn = file === "/dev/null";
    } else if (t === ">" || t === ">>") {
      cmd.outFile = toks[++i];
      cmd.append = t === ">>";
    } else if (/^\d?>>?[^&]/.test(t) && !t.startsWith("2>&")) {
      cmd.append = t.includes(">>");
      cmd.outFile = t.replace(/^\d?>>?/, "");
    } else if (t === "2>&1" || t === "&>" || /^&>/.test(t)) {
      if (t === "&>") i++;
    } else cmd.argv.push(t);
  }
  if (cmd.argv[0] === "nohup") cmd.argv.shift();
  if (!cmd.argv.length) return;
  if (cmd.argv[0] === "sudo") cmd.argv.shift();
  if (f.k === "pc") return pc(c, cmd);
  if (f.k === "server") return server(c, h!, cmd);
  const hit = vmOf(c.lab, f.pid);
  if (!hit) return;
  if (f.k === "monitor") return monitor(c, hit.h, hit.v, cmd);
  return guest(c, hit.h, hit.v, cmd);
}

function backtick(c: Ctx, h: Host | undefined, expr: string) {
  const m = /^\s*mktemp\s+-p\s+(\S+)\s+--suffix=(\S+)\s*$/.exec(expr);
  if (m && h) {
    const dir = abs(h, m[1]);
    if (!h.dirs.has(dir)) {
      say(c, `mktemp: failed to create file via template '${dir}/tmp.XXXXXXXXXX${m[2]}': No such file or directory`, "err");
      return "";
    }
    return `${dir}/tmp.${(++c.lab.seq * 7919).toString(36).padStart(6, "x")}Qm${m[2]}`;
  }
  say(c, `(simulador) no sé ejecutar \`${expr}\``, "warn");
  return "";
}

/* ------------------------------------------------------------------ special keys */

function special(c: Ctx, key: string) {
  const f = top(c.lab);
  const hit = vmOf(c.lab, f.pid);
  if (key === "tab") return menuInput(c, "TAB");
  if (f.k === "pc" || f.k === "server") {
    if (key === "c") say(c, "^C");
    else tip(c, "Esa combinación solo tiene sentido dentro de la consola de una MV.");
    return;
  }
  if (!hit) return;
  const { h, v } = hit;
  if (f.wait && key !== "]") return; // queued: it goes nowhere yet
  if (key === "c" && f.ask) {
    f.ask = undefined;
    return say(c, "^C");
  }
  if (key === "]") {
    if (f.via !== "telnet") return tip(c, "Ctrl+] es la tecla de escape de telnet; aquí no estás en telnet.");
    if (c.lab.real) return void (f.esc = true); // telnet> prompt: then quit
    say(c, "telnet> quit");
    say(c, "Connection closed.");
    c.lab.stack.pop();
    return;
  }
  if (key === "c" && f.via !== "none") {
    say(c, "^C");
    return tip(c, "Con -nographic la entrada va a la MV: Ctrl+C no mata QEMU. Para matarla, Ctrl+A x; para el monitor, Ctrl+A c.");
  }
  if (key === "c") return kill(c, h, v, "qemu-system-x86_64: terminating on signal 2");
  const muxed = f.via === "stdio" || f.k === "monitor" || (f.via === "telnet" && v.mon);
  if (!muxed) return tip(c, f.via === "telnet" ? "Sin «mon:» en -serial, el monitor no viaja por este telnet: Ctrl+A llega tal cual a la MV." : "Esa combinación no hace nada aquí.");
  if (key === "ax") {
    c.lab.done.add("ctrlax");
    c.lab.menu = undefined;
    return kill(c, h, v, "QEMU: Terminated");
  }
  if (key === "ac") {
    if (f.k === "monitor") {
      c.lab.stack.pop();
      return tip(c, "De vuelta en la consola de la MV.");
    }
    c.lab.done.add("monitor");
    c.lab.stack.push({ k: "monitor", ip: h.ip, pid: v.pid });
    say(c, "QEMU 5.2.0 monitor - type 'help' for more information");
  }
}

/** The VM dies at once (power off): QEMU exits and every frame that was inside it closes. */
function kill(c: Ctx, h: Host, v: Vm, msg?: string) {
  if (msg) say(c, msg);
  removeVm(c, h, v);
}
function removeVm(c: Ctx, h: Host, v: Vm) {
  h.vms = h.vms.filter((x) => x !== v);
  h.jobs = h.jobs.filter((p) => p !== v.pid);
  if (c.lab.menu?.pid === v.pid) c.lab.menu = undefined;
  c.fx.push({ k: "gone", id: `vm:${v.pid}` });
  for (const s of Object.values(c.lab.stacks)) {
    const at = s!.findIndex((f) => f.pid === v.pid);
    if (at < 0) continue;
    const { via, to } = s![at];
    s!.splice(at);
    if (s !== c.lab.stack) continue;
    if (via === "telnet") say(c, "Connection closed by foreign host.");
    if (via === "ssh") say(c, `Connection to ${to ?? ipOfVm(v)} closed by remote host.`);
  }
}
/** Every window inside that host loses its session (the server went down or lost ens32). */
const dropHost = (lab: Lab, ip: string) => {
  for (const s of Object.values(lab.stacks)) {
    const at = s!.findIndex((f) => f.ip === ip);
    if (at >= 0) s!.splice(at);
  }
};
const ipOfVm = (v: Vm) => v.nics.find((n) => n.ip)?.ip ?? "la MV";

/* ------------------------------------------------------------------ boot */

const BOOT_MS = 3600;

function bootLines(c: Ctx, h: Host, v: Vm, visible: boolean, from = 0): Line[] {
  const k = v.kvm ? 1 : 2.6;
  const L: Line[] = [];
  const at = (ms: number) => from + Math.round(ms * k);
  if (from === 0) {
    L.push({ t: "SeaBIOS (version 1.14.0-1.fc34)", d: at(0) }, { t: "Booting from Hard Disk...", d: at(300) });
  }
  if (visible) {
    L.push(
      { t: "[    0.000000] Linux version 5.10.43-0-virt (buildozer@build-3-13-x86_64) #1-Alpine SMP", d: at(700), c: "dim" },
      { t: `[    0.000000] Command line: BOOT_IMAGE=vmlinuz-virt initrd=initramfs-virt root=UUID=${UUID} quiet console=ttyS0`, d: at(800), c: "dim" },
      { t: "[    1.204511] Run /init as init process", d: at(1300), c: "dim" },
      { t: " * Starting networking ...                              [ ok ]", d: at(2000) },
    );
    if (v.role === "web") L.push({ t: " * Starting lighttpd ...                                [ ok ]", d: at(2400) });
    if (v.role === "dhcp") L.push(wouldServe(h, v) ? { t: rc("Starting dhcpd", true), d: at(2400) } : { t: `${rc("Starting dhcpd", false)}\n * ERROR: dhcpd failed to start`, c: "err", d: at(2400), soft: true });
    L.push({ t: " * Starting sshd ...                                    [ ok ]", d: at(2800) });
  } else L.push({ t: "(pantalla negra: el kernel escribe sus mensajes en la pantalla gráfica, que con -nographic no existe)", c: "dim", d: at(700) });
  L.push(
    { t: "", d: at(3300) },
    { t: "Welcome to Alpine Linux 3.13", d: at(3300) },
    { t: "Kernel 5.10.43-0-virt on an x86_64 (/dev/ttyS0)", d: at(3300) },
    { t: "", d: at(3300) },
    { t: `${vmHostname(c.lab, v)} login: root`, d: at(3400) },
    { t: "Password: ", d: at(3500) },
    { t: "Welcome to Alpine!", d: at(3600) },
  );
  return L;
}
/** An OpenRC status line: " * Starting dhcpd ...   [ ok ]". */
const rc = (what: string, ok: boolean) => ` * ${what} ...`.padEnd(56) + (ok ? "[ ok ]" : "[ !! ]");
/** Would dhcpd start with this disk's config (static eth0 inside a declared subnet)? */
const wouldServe = (h: Host, v: Vm) => {
  const n = netOf(h, v);
  const e = n.ifs.eth0;
  const p = parseConf(n.conf ?? []);
  return !p.err && e?.type === "static" && p.subs.some((s) => s.from && inNet(e.addr, s.net, s.mask));
};
const bootMs = (v: Vm) => Math.round(BOOT_MS * (v.kvm ? 1 : 2.6));

function menuInput(c: Ctx, input: string) {
  const menu = c.lab.menu;
  const hit = menu && vmOf(c.lab, menu.pid);
  if (!menu || !hit) {
    c.lab.menu = undefined;
    return;
  }
  const { h, v } = hit;
  if (input === "TAB" && !menu.tab) {
    menu.tab = true;
    say(c, `boot: virt initrd=initramfs-virt root=UUID=${UUID} modules=sd-mod,usb-storage,ext4 quiet rootfstype=ext4`);
    return tip(c, "Escribe « console=ttyS0» (se añade al final de la línea) y pulsa Intro.");
  }
  const visible = menu.tab && /console=ttyS0/.test(input);
  c.lab.menu = undefined;
  if (visible) {
    v.oneTty = true;
    c.lab.done.add("tab-tty");
  }
  if (menu.tab && !visible && input.trim()) tip(c, "Sin console=ttyS0: arranca igual, pero sin mensajes.");
  v.upAt = c.now + bootMs(v);
  c.out.push(...bootLines(c, h, v, visible, 1));
}

/* ------------------------------------------------------------------ PC (PowerShell) */

function pc(c: Ctx, cmd: Cmd) {
  const [name, ...a] = cmd.argv;
  const lab = c.lab;
  switch (name) {
    case "vpn":
    case "forticlient":
    case "openvpn":
      if (lab.vpn) return say(c, "La VPN ya está conectada.");
      lab.vpn = true;
      lab.done.add("vpn");
      say(c, "Conectando a la VPN de la universidad... conectado.", "ok");
      say(c, "Ruta añadida: 10.0.16.0/24 (LAN de los servidores de prácticas)", "dim");
      c.fx.push({ k: "flash", id: "vpn" });
      return;
    case "ssh": {
      const port = a.includes("-p") ? +a[a.indexOf("-p") + 1] : 22;
      const dest = a.filter((x, i) => !x.startsWith("-") && a[i - 1] !== "-p").pop() ?? "";
      const host = findHost(lab, dest.replace(/^.*@/, ""));
      if (!host) return fail(c, `ssh: Could not resolve hostname ${dest.replace(/^.*@/, "")}: Name or service not known`);
      if (!lab.vpn) {
        fail(c, `ssh: connect to host ${host.ip} port ${port}: Connection timed out`);
        return tip(c, "Desde casa, los servidores solo se ven a través de la VPN: escribe «vpn» para conectarla.");
      }
      if (host.dead || host.cut) return fail(c, `ssh: connect to host ${host.ip} port ${port}: No route to host`);
      if (port !== 22) return hostfwdSsh(c, host, port, "pc");
      say(c, `root@${host.ip}'s password: ••••••••`);
      say(c, "Last login: Mon Nov  2 10:12:47 2026 from 10.8.0.6", "dim");
      lab.stack.push({ k: "server", ip: host.ip, via: "ssh", saved: host.cwd });
      host.cwd = "/root";
      lab.done.add(`ssh:${host.ip}`);
      c.fx.push({ k: "packet", path: ["pc", "vpn", `srv:${host.ip}`] });
      return;
    }
    case "telnet": {
      const host = findHost(lab, a[0] ?? "");
      const port = +(a[1] ?? 23);
      if (!host) return fail(c, `telnet: could not resolve ${a[0] ?? ""}/${port}: Name or service not known`);
      if (!lab.vpn) return fail(c, `Connecting To ${host.ip}...Could not open connection to the host, on port ${port}: Connect failed`);
      return telnet(c, host, port, "pc");
    }
    case "curl":
    case "start":
    case "navegador":
    case "iwr":
      return web(c, a.find((x) => !x.startsWith("-")) ?? "", "pc");
    case "ping": {
      const host = findHost(lab, a.filter((x) => !x.startsWith("-")).pop() ?? "");
      if (!host || !lab.vpn || host.dead) return fail(c, "Tiempo de espera agotado para esta solicitud.");
      say(c, `Respuesta desde ${host.ip}: bytes=32 tiempo=6ms TTL=63`);
      c.fx.push({ k: "packet", path: ["pc", "vpn", `srv:${host.ip}`], tone: "ok" });
      return;
    }
    case "exit":
      return tip(c, "Ya estás en tu PC.");
    case "help":
      return help(c, "pc");
    default:
      return fail(c, `${name} : El término '${name}' no se reconoce como nombre de un cmdlet, función, archivo de script o programa ejecutable.`);
  }
}

/* ------------------------------------------------------------------ the KVM server (bash) */

function server(c: Ctx, h: Host, cmd: Cmd) {
  const [name, ...a] = cmd.argv;
  const lab = c.lab;
  if (/^[–—]/.test(name) || a.some((x) => /^[–—]/.test(x))) tip(c, "Ese guion es un guion largo copiado del PDF (–): la shell no lo entiende como opción. Escríbelo a mano (-).");
  switch (name) {
    case "help":
      return help(c, "server");
    case "pwd":
      return say(c, h.cwd);
    case "cd": {
      const to = abs(h, a[0] ?? "~");
      if (!h.dirs.has(to)) return fail(c, `-bash: cd: ${a[0]}: No such file or directory`);
      h.cwd = to;
      return;
    }
    case "mkdir": {
      const p = a.includes("-p");
      for (const d of a.filter((x) => !x.startsWith("-"))) {
        const path = abs(h, d);
        if (h.dirs.has(path)) {
          if (!p) fail(c, `mkdir: cannot create directory ‘${d}’: File exists`);
          continue;
        }
        if (!p && !h.dirs.has(dirOf(path))) {
          fail(c, `mkdir: cannot create directory ‘${d}’: No such file or directory`);
          continue;
        }
        let cur = "";
        for (const s of path.split("/").filter(Boolean)) h.dirs.add((cur += "/" + s));
      }
      return;
    }
    case "ls":
    case "ll":
      return ls(c, h, name === "ll" ? ["-l", ...a] : a);
    case "rm": {
      for (const x of a.filter((y) => !y.startsWith("-"))) {
        const path = abs(h, x);
        const f = h.files.get(path);
        if (!f) {
          fail(c, `rm: cannot remove '${x}': No such file or directory`);
          continue;
        }
        h.files.delete(path);
        c.fx.push({ k: "gone", id: `disk:${h.ip}:${path}` });
        const users = [...h.files.values()].filter((y) => y.backing === path);
        if (users.length) tip(c, `Has borrado un disco base: ${users.map((u) => baseName(u.path)).join(", ")} ya no arrancan (su backing file no existe).`);
      }
      return;
    }
    case "mv": {
      const [from, to] = a.filter((y) => !y.startsWith("-"));
      const src = from && abs(h, from);
      const f = src && h.files.get(src);
      if (!f || !to) return fail(c, `mv: cannot stat '${from ?? ""}': No such file or directory`);
      let dst = abs(h, to);
      if (h.dirs.has(dst)) dst = `${dst}/${baseName(src)}`;
      h.files.delete(src);
      h.files.set(dst, { ...f, path: dst });
      c.fx.push({ k: "gone", id: `disk:${h.ip}:${src}` });
      const broken = [...h.files.values()].filter((y) => y.backing === src);
      if (broken.length) tip(c, `Has movido una base: ${broken.map((u) => baseName(u.path)).join(", ")} siguen apuntando a la ruta vieja y no arrancarán (qemu-img rebase -u para arreglarlo).`);
      return;
    }
    case "cp": {
      const [from, to] = a.filter((y) => !y.startsWith("-"));
      const f = from ? real(h, abs(h, from)) : undefined;
      if (!f || !to) return fail(c, `cp: cannot stat '${from ?? ""}': No such file or directory`);
      let dst = abs(h, to);
      if (h.dirs.has(dst)) dst = `${dst}/${baseName(f.path)}`;
      h.files.set(dst, { ...f, path: dst, snaps: [...f.snaps] });
      c.fx.push({ k: "boot", id: `disk:${h.ip}:${dst}` });
      if (f.backing) tip(c, "cp copia solo el delta: la copia sigue apuntando a la misma base. Para un clon independiente, qemu-img convert.");
      return;
    }
    case "ln": {
      const files = a.filter((y) => !y.startsWith("-"));
      if (!a.includes("-s") || a.some((y) => /^[–—]/.test(y))) return fail(c, files.length > 2 ? `ln: target '${files[files.length - 1]}' is not a directory` : "ln: hard links no simulados: usa ln -s");
      const [target, link] = files;
      if (!target) return fail(c, "ln: missing file operand");
      let at = abs(h, link ?? baseName(target));
      if (h.dirs.has(at)) at = `${at}/${baseName(target)}`;
      if (h.files.has(at)) return fail(c, `ln: failed to create symbolic link '${link ?? baseName(target)}': File exists`);
      const to = target.startsWith("/") ? norm(target) : norm(`${dirOf(at)}/${target}`);
      h.files.set(at, { path: at, kind: "link", fmt: "qcow2", target: to, virt: 0, used: 0, snaps: [], role: "plain", ro: false });
      c.fx.push({ k: "boot", id: `disk:${h.ip}:${at}` });
      if (!real(h, at)) tip(c, "El enlace apunta a un fichero que no existe (todavía).");
      return;
    }
    case "chmod": {
      const mode = a.find((y) => /^[ugoa]*[-+=][rwx]+$/.test(y));
      for (const x of a.filter((y) => y !== mode)) {
        const f = real(h, abs(h, x));
        if (!f) fail(c, `chmod: cannot access '${x}': No such file or directory`);
        else if (mode?.includes("w")) f.ro = mode.includes("-");
      }
      return;
    }
    case "wget":
      return wget(c, h, a.find((x) => !x.startsWith("-")) ?? "");
    case "curl":
      return web(c, a.find((x) => !x.startsWith("-")) ?? "", "server", h);
    case "cat":
      return cat(c, h, a[0] ?? "");
    case "echo":
      return echo(c, h, cmd, a);
    case "hostname":
      return say(c, h.name);
    case "whoami":
      return say(c, "root");
    case "uname":
      return say(c, `Linux ${h.name} 5.14.10-200.fc34.x86_64 #1 SMP x86_64 GNU/Linux`);
    case "passwd":
      return say(c, "passwd: all authentication tokens updated successfully.");
    case "alias":
      if (!a.length) return say(c, h.alias ? `alias poweroff=' echo '\\''Acción no permitida'\\'' '` : "");
      if (a.join(" ").startsWith("poweroff=")) h.alias = true;
      return;
    case "ip":
      return hostIp(c, h, a);
    case "nmcli":
      return nmcli(c, h, a);
    case "firewall-cmd":
      return firewall(c, h, a);
    case "free":
      return free(c, h);
    case "lsmod":
      say(c, "kvm_intel             327680  0");
      return say(c, "kvm                   978944  1 kvm_intel");
    case "pgrep":
    case "ps":
      return procs(c, h, name, a);
    case "kill":
    case "pkill":
      return killCmd(c, h, name, a);
    case "jobs":
      return h.jobs.forEach((p, i) => {
        const v = h.vms.find((x) => x.pid === p);
        if (v) say(c, `[${i + 1}]${i === h.jobs.length - 1 ? "+" : "-"}  ${v.stopped ? "Stopped" : "Running"}                 ${v.cmd}`);
      });
    case "fg":
      return fg(c, h, a[0]);
    case "bg": {
      const v = h.vms.find((x) => x.pid === h.jobs[h.jobs.length - 1]);
      if (v?.stopped) tip(c, "bg la vuelve a dejar en segundo plano, pero en cuanto QEMU lea del teclado se parará otra vez. Lánzala con < /dev/null.");
      return;
    }
    case "disown":
      h.jobs = a.length ? h.jobs.filter((_, i) => `%${i + 1}` !== a[0]) : h.jobs.slice(0, -1);
      return;
    case "telnet":
      return telnet(c, findHost(lab, a[0] === "localhost" || a[0] === "127.0.0.1" ? h.ip : a[0] ?? "") ?? h, +(a[1] ?? 23), "server", a[0]);
    case "ssh":
      return sshFromServer(c, h, a);
    case "ping":
      return ping(c, { h }, a.filter((x) => !x.startsWith("-") && !/^\d+$/.test(x)).pop() ?? "", count(a));
    case "poweroff":
    case "shutdown":
    case "halt":
    case "reboot":
    case "init":
      if (h.alias && name === "poweroff") return say(c, "Acción no permitida");
      return boom(c, h);
    case "exit":
    case "logout":
      return logout(c, h);
    case "qemu-img":
      return qemuImg(c, h, a);
    case "qemu-system-x86_64":
      return qemu(c, h, cmd, a);
    case "man":
      return tip(c, `En el examen no hay Internet: man ${a[0] ?? ""} es tu ayuda. Dentro, /texto busca, n salta a la siguiente coincidencia y q sale.`);
    case "vi":
    case "nano":
      return tip(c, "En el servidor no hace falta editar nada en estas prácticas; el que se edita es /boot/extlinux.conf dentro de la MV base.");
    case "vpn":
      return tip(c, "La VPN se conecta desde tu PC, no desde el servidor.");
    default:
      return fail(c, `-bash: ${name}: command not found`);
  }
}

function ls(c: Ctx, h: Host, a: string[]) {
  const long = a.some((x) => /^-\w*l/.test(x));
  const target = abs(h, a.find((x) => !x.startsWith("-")) ?? ".");
  const row = (n: string, f: Img) =>
    f.kind === "link" ? `lrwxrwxrwx. 1 root root ${String(f.target!.length).padStart(10)} Nov  2 10:20 ${n} -> ${f.target}` : `-rw-r--r--. 1 root root ${String(f.used * 1024).padStart(10)} Nov  2 10:20 ${n}`;
  if (h.files.has(target)) {
    const f = h.files.get(target)!;
    return say(c, long ? row(baseName(target), f) : baseName(target));
  }
  if (!h.dirs.has(target)) return fail(c, `ls: cannot access '${a.find((x) => !x.startsWith("-"))}': No such file or directory`);
  const dirs = [...h.dirs].filter((d) => d !== target && dirOf(d) === target).map((d) => [baseName(d), null] as const);
  const files = [...h.files].filter(([p]) => dirOf(p) === target).map(([p, f]) => [baseName(p), f] as const);
  const all = [...dirs, ...files].sort((x, y) => x[0].localeCompare(y[0]));
  if (!long) return say(c, all.map(([n]) => n).join("  "));
  say(c, `total ${files.reduce((s, [, f]) => s + f.used, 0)}`);
  for (const [n, f] of all) say(c, f ? row(n, f) : `drwxr-xr-x. 2 root root       4096 Nov  2 10:20 ${n}`);
}

const IMAGES: Record<string, { role: Role; clone?: string; used: number }> = {
  "alpine-base.qcow2": { role: "plain", used: BASE_USED },
  "alpine-webserver.qcow2": { role: "web", clone: "alpine-base.qcow2", used: 8320 },
  "alpine-dhcp.qcow2": { role: "dhcp", clone: "alpine-base.qcow2", used: 9856 },
};

function wget(c: Ctx, h: Host, url: string) {
  const u = url.replace(/^https?:\/\//, "");
  const [hostPart, ...rest] = u.split("/");
  const path = "/" + rest.join("/");
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostPart) || hostPart.startsWith(h.ip)) return web(c, url, "server", h, true);
  if (hostPart !== REPO) return fail(c, `--${stamp(c.lab, c.now)}--  http://${u}\nResolving ${hostPart} (${hostPart})... failed: Name or service not known.\nwget: unable to resolve host address ‘${hostPart}’`);
  const file = baseName(path);
  const img = path.startsWith(REPO_PATH) ? IMAGES[file] : undefined;
  say(c, `--${stamp(c.lab, c.now)}--  http://${REPO}${path}`);
  say(c, `Connecting to ${REPO} (${REPO})|:80... connected.`);
  if (!img) return fail(c, `HTTP request sent, awaiting response... 404 Not Found\n${stamp(c.lab, c.now)} ERROR 404: Not Found.`);
  let name = file;
  for (let k = 1; h.files.has(`${h.cwd}/${name}`); k++) name = `${file}.${k}`;
  const at = `${h.cwd}/${name}`;
  say(c, "HTTP request sent, awaiting response... 200 OK");
  say(c, `Length: ${img.used * 1024} (${kib(img.used)}) [application/octet-stream]`);
  say(c, `Saving to: ‘${name}’`);
  say(c, `${name.padEnd(24)}100%[===================>] ${kib(img.used).padStart(8)}  94,2MB/s    in 3,1s`, undefined, 900);
  say(c, `${stamp(c.lab, c.now + 3000)} (94,2 MB/s) - ‘${name}’ saved [${img.used * 1024}/${img.used * 1024}]`, "ok", 1000);
  if (name !== file) tip(c, `${file} ya existía en esta carpeta: wget no lo pisa y guarda la copia como ${name}.`);
  h.files.set(at, { path: at, kind: img.clone ? "clone" : "base", fmt: "qcow2", backing: img.clone ? `${h.cwd}/${img.clone}` : undefined, bname: img.clone, virt: 8192, used: img.used, snaps: [], role: img.role, ro: false, tty: img.role === "plain" ? undefined : true });
  c.fx.push({ k: "packet", path: ["repo", `srv:${h.ip}`, `disk:${h.ip}:${at}`], tone: "data" });
  c.fx.push({ k: "boot", id: `disk:${h.ip}:${at}` });
  c.lab.done.add(`wget:${file}`);
  if (img.clone) tip(c, `Pesa solo ${kib(img.used)}: es un linked clone. Su base (${img.clone}) tiene que estar en la misma carpeta.`);
}

function cat(c: Ctx, h: Host, file: string) {
  const p = abs(h, file);
  if (p === "/etc/qemu/bridge.conf") return [...h.allow].forEach((b) => say(c, b === "all" ? "allow all" : `allow ${b}`));
  if (p === "/etc/os-release") return say(c, 'NAME=Fedora\nVERSION="34 (Server Edition)"');
  if (p === "/proc/sys/net/ipv4/ip_forward") return say(c, "0");
  return fail(c, `cat: ${file}: No such file or directory`);
}

function echo(c: Ctx, h: Host, cmd: Cmd, a: string[]) {
  const text = a.join(" ");
  if (!cmd.outFile) return say(c, text);
  const p = abs(h, cmd.outFile);
  if (p === "/etc/qemu/bridge.conf") {
    if (!cmd.append) h.allow.clear();
    const m = /^allow\s+(\S+)$/.exec(text.trim());
    if (m) h.allow.add(m[1]);
    c.lab.done.add("allow");
    if (!cmd.append) tip(c, "Con un solo > has sobrescrito el fichero entero: lo normal es >> para añadir.");
    return;
  }
  if (p === "/proc/sys/net/ipv4/ip_forward") return tip(c, "Eso activaría el reenvío en el servidor; en la cadena hay que activarlo dentro de la MV que hace de router.");
  if (h.dirs.has(dirOf(p))) return;
  return fail(c, `-bash: ${cmd.outFile}: No such file or directory`);
}

/* ------------------------------------------------------------------ networking on the server */

function taps(h: Host) {
  let k = 0;
  for (const v of h.vms) for (const n of v.nics) if (n.kind === "bridge") n.tap = `tap${k++}`;
}

function hostIp(c: Ctx, h: Host, a: string[]) {
  const sub = a[0] ?? "";
  if (/^r/.test(sub)) return say(c, `default via 10.0.16.1 dev ens32 proto static metric 100\n10.0.16.0/20 dev ens32 proto kernel scope link src ${h.ip} metric 100${[...h.bridges].map(([b]) => (bridgeIp(h, b) ? `\n10.0.0.0/24 dev ${b} proto kernel scope link src ${bridgeIp(h, b)}` : "")).join("")}`);
  const only = a.includes("show") ? a[a.indexOf("show") + 1] === "dev" ? a[a.indexOf("show") + 2] : a[a.indexOf("show") + 1] : undefined;
  taps(h);
  const rows: [string, string, string?][] = [
    ["lo", "<LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN", "inet 127.0.0.1/8 scope host lo"],
    ["ens32", "<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP", `inet ${h.ip}/20 brd 10.0.31.255 scope global noprefixroute ens32`],
    ["ens33", `<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel ${[...h.bridges.values()].some((b) => b.slave === "ens33") ? "master br1 " : ""}state UP`],
    ["virbr0", "<NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN", "inet 192.168.122.1/24 brd 192.168.122.255 scope global virbr0"],
  ];
  for (const [b] of h.bridges) {
    const members = h.vms.some((v) => v.nics.some((n) => n.br === b)) || [...h.vx.values()].some((x) => brOf(h, x) === b);
    const ip = bridgeIp(h, b);
    rows.push([b, members ? "<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP" : "<NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN", ip ? `inet ${ip}/24 brd 10.0.0.255 scope global noprefixroute ${b}` : undefined]);
  }
  for (const [i, x] of h.vx) if (brOf(h, x)) rows.push([i, `<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1450 qdisc noqueue master ${brOf(h, x)} state UNKNOWN`]);
  for (const v of h.vms) for (const n of v.nics) if (n.tap) rows.push([n.tap, `<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel master ${n.br} state UNKNOWN`]);
  let k = 1;
  for (const [dev, flags, inet] of rows) {
    if (!only || only === dev) {
      say(c, `${k}: ${dev}: ${flags} group default qlen 1000`);
      if (inet) say(c, `    ${inet}`);
    }
    k++;
  }
  if (only && !rows.some(([d]) => d === only)) fail(c, `Device "${only}" does not exist.`);
  c.lab.done.add("ip-host");
}

function nmcli(c: Ctx, h: Host, a: string[]) {
  const [obj, verb, ...rest] = a;
  const opt = (k: string) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
  const isCon = obj && "connection".startsWith(obj) && obj.length >= 3;
  const isDev = obj && "device".startsWith(obj) && obj.length >= 3;
  if (obj === "conection") return fail(c, "Error: argument 'conection' not understood. Try passing --help instead.");
  if (isCon && verb === "add") {
    const p = nmPairs(c, rest);
    if (!p) return void c.lab.done.add("trap:pares");
    const type = p["connection.type"];
    const ifname = p["connection.interface-name"];
    if (type === "bridge-slave" || (type === "ethernet" && opt("master"))) {
      const br = h.bridges.get(opt("master") ?? "");
      if (!br) return fail(c, "Error: master bridge not found.");
      if (ifname === "ens32") {
        br.slave = "ens32";
        h.cut = true;
        say(c, `Connection 'bridge-slave-ens32' successfully added.`);
        fail(c, "client_loop: send disconnect: Connection reset");
        tip(c, "Has metido ens32 en el bridge: es la interfaz por la que entras por SSH y la acabas de perder. En el examen, solo el profesor podría arreglarlo.");
        dropHost(c.lab, h.ip);
        c.fx.push({ k: "boom", ip: h.ip });
        return;
      }
      br.slave = ifname;
      say(c, `Connection 'bridge-slave-${ifname}' successfully added.`);
      return tip(c, `Ahora ${opt("master")} tiene una NIC real (${ifname}): las MVs salen a esa red con su propia MAC. Eso es el modo bridged.`);
    }
    if (!type) return fail(c, "Error: 'type' argument is required.");
    if (type !== "bridge" && type !== "vxlan") return fail(c, `Error: invalid or not allowed setting 'type': '${type}'`);
    if (!ifname) return fail(c, "Error: 'ifname' argument is required.");
    const name = p["connection.id"] ?? `${type}-${ifname}`;
    if (h.bridges.has(ifname) || h.vx.has(ifname)) return fail(c, `Error: Failed to add '${name}' connection: connection.interface-name: '${ifname}' ya existe. Bórralo antes con nmcli connection delete.`);
    const id = uuid(++c.lab.seq * 31 + h.ip.length);
    if (type === "vxlan") return vxlanAdd(c, h, p, ifname, name, id);
    const method = (p["ipv4.method"] ?? "auto") as Bridge["method"];
    const ip = p["ipv4.addresses"];
    if (method === "manual" && !ip) return fail(c, `Error: Failed to add '${name}' connection: ipv4.addresses: this property cannot be empty for 'method=manual'`);
    h.bridges.set(ifname, { con: name, method, ip: method === "manual" ? ip : undefined, uuid: id });
    say(c, `Connection '${name}' (${id}) successfully added.`, "ok");
    c.fx.push({ k: "boot", id: `br:${h.ip}:${ifname}` });
    c.lab.done.add(`bridge:${ifname}`);
    if (method === "auto") tip(c, "Con ipv4.method auto el host pedirá IP por DHCP en el bridge (nmcli device show br1). En la práctica se usa manual con 10.0.0.1/24.");
    return;
  }
  if (isCon && (verb === "delete" || verb === "del")) {
    const name = rest[0];
    const hit = [...h.bridges].find(([, b]) => b.con === name);
    const vx = [...h.vx].find(([, x]) => x.con === name);
    if (!hit && !vx) return fail(c, `Error: unknown connection '${name ?? ""}'.\nError: cannot delete unknown connection(s): '${name ?? ""}'.`);
    if (hit) h.bridges.delete(hit[0]);
    if (vx) h.vx.delete(vx[0]);
    c.fx.push({ k: "gone", id: hit ? `br:${h.ip}:${hit[0]}` : `vx:${h.ip}:${vx![0]}` });
    say(c, `Connection '${name}' (${(hit?.[1].uuid ?? vx?.[1].uuid) || "6f1a7c2e-…"}) successfully deleted.`, "ok");
    c.lab.done.add("clean-con");
    return;
  }
  if (isCon && (verb === "show" || !verb)) {
    const rows = [["NAME", "UUID", "TYPE", "DEVICE"], ["ens32", "0c63b5a8-2bd3-4c0e-9f07-3d1c5f0b7a11", "ethernet", "ens32"]];
    for (const [b, x] of h.bridges) rows.push([x.con, x.uuid ?? "6f1a7c2e-0b7d-4c1e-9d2b-5a1b2c3d4e5f", "bridge", b]);
    for (const [i, x] of h.vx) rows.push([x.con, x.uuid, "vxlan", brOf(h, x) ? i : "--"]);
    rows.push(["ens33", "4f2e9a10-7b7c-4a43-8d2a-61f0c2b1d5e9", "ethernet", "ens33"], ["virbr0", "a0bd2c0e-3f63-4f6b-8e0e-5c4b2a1f9d77", "bridge", "virbr0"]);
    const w = [0, 1, 2].map((k) => Math.max(...rows.map((r) => r[k].length)) + 2);
    for (const r of rows) say(c, r.map((x, k) => (k < 3 ? x.padEnd(w[k]) : x)).join(""));
    c.lab.done.add(`nmshow:${h.ip}`);
    return;
  }
  if (isCon && (verb === "up" || verb === "modify" || verb === "mod")) return say(c, "Connection successfully activated.");
  if (isDev && (verb === "delete" || verb === "del")) {
    say(c, `Device '${rest[0] ?? ""}' successfully removed.`, "ok");
    c.lab.done.add("clean-dev");
    return;
  }
  if (isDev && (verb === "modify" || verb === "mod")) {
    const br = h.bridges.get(rest[0] ?? "");
    if (!br) return fail(c, `Error: Device '${rest[0] ?? ""}' not found.`);
    const method = opt("ipv4.method") as Bridge["method"] | undefined;
    if (method) br.method = method;
    const ip = opt("ipv4.addresses");
    if (ip) br.ip = ip;
    return say(c, `Connection successfully reapplied to device '${rest[0]}'.`, "ok");
  }
  if (isDev && verb === "show") {
    const b = rest[0];
    const ip = b ? bridgeIp(h, b) : undefined;
    if (b && !h.bridges.has(b)) return fail(c, `Error: Device '${b}' not found.`);
    say(c, `GENERAL.DEVICE:                         ${b ?? "ens32"}`);
    say(c, `GENERAL.TYPE:                           ${b ? "bridge" : "ethernet"}`);
    return say(c, `IP4.ADDRESS[1]:                         ${b ? (ip ? `${ip}/24` : "--") : `${h.ip}/24`}`);
  }
  if (isDev && (verb === "status" || !verb)) {
    say(c, "DEVICE  TYPE      STATE                                  CONNECTION");
    say(c, "ens32   ethernet  connected                              ens32");
    say(c, "ens33   ethernet  connected                              ens33");
    for (const [b, x] of h.bridges) say(c, `${b.padEnd(7)} bridge    connected                              ${x.con}`);
    for (const [i, x] of h.vx) say(c, `${i.padEnd(7)} vxlan     ${brOf(h, x) ? "connected                             " : "disconnected                          "} ${x.con}`);
    say(c, "virbr0  bridge    connected (externally)                 virbr0");
    return;
  }
  return fail(c, "Error: argumento no simulado. Prueba nmcli connection add|show|delete o nmcli device show|modify|delete.");
}

// nmcli connection add takes «property value» pairs; these are the short names it accepts.
const NM_ALIAS: Record<string, string> = { type: "connection.type", "con-name": "connection.id", ifname: "connection.interface-name", autoconnect: "connection.autoconnect", master: "connection.master", "slave-type": "connection.slave-type", stp: "bridge.stp", id: "vxlan.id", remote: "vxlan.remote", local: "vxlan.local", dev: "vxlan.parent", "destination-port": "vxlan.destination-port" };
const NM_PROPS: Record<string, string[]> = {
  connection: ["id", "type", "interface-name", "autoconnect", "master", "slave-type"],
  bridge: ["stp", "priority", "forward-delay"],
  vxlan: ["id", "remote", "local", "parent", "destination-port"],
  ipv4: ["method", "dns", "dns-search", "dns-options", "addresses", "gateway", "routes", "never-default", "may-fail"],
  ipv6: ["method", "addresses", "gateway", "addr-gen-mode"],
};
function nmPairs(c: Ctx, rest: string[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const k = rest[i];
    const val = rest[i + 1];
    const full = NM_ALIAS[k] ?? k;
    const [set, prop] = full.split(".");
    const no = (msg: string) => void fail(c, msg);
    if (!prop || !NM_PROPS[set]) return no(`Error: invalid or not allowed setting '${set}': '${set}' not among [connection, 802-3-ethernet (ethernet), bridge, bridge-port, vxlan, ipv4, ipv6, …].`);
    if (!NM_PROPS[set].includes(prop)) return no(`Error: invalid property '${prop}': '${prop}' not among [${NM_PROPS[set].join(", ")}, …].`);
    if (val === undefined) return no(`Error: value for '${k}' is missing.`);
    const among = (opts: string[]) => (opts.includes(val) ? undefined : `Error: failed to modify ${full}: '${val}' not among [${opts.join(", ")}].`);
    const err =
      full === "ipv4.method" ? among(["auto", "link-local", "manual", "shared", "disabled"])
      : full === "ipv6.method" ? among(["ignore", "auto", "dhcp", "link-local", "manual", "shared", "disabled"])
      : full === "bridge.stp" || full === "connection.autoconnect" ? among(["yes", "no", "true", "false"])
      : full === "vxlan.id" && !(/^\d+$/.test(val) && +val < 16777216) ? `Error: failed to modify vxlan.id: '${val}' is not valid; use <0-16777215>.`
      : (full === "vxlan.remote" || full === "vxlan.local") && !isIp(val) ? `Error: failed to modify ${full}: '${val}' is not a valid IP address.`
      : full === "ipv4.addresses" && !/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(val) ? `Error: failed to modify ipv4.addresses: invalid IP address: '${val}'.`
      : undefined;
    if (err) return no(err);
    out[full] = val;
  }
  return out;
}

function vxlanAdd(c: Ctx, h: Host, p: Record<string, string>, ifname: string, name: string, id: string) {
  const master = p["connection.master"];
  if (!p["vxlan.id"]) return fail(c, `Error: Failed to add '${name}' connection: vxlan.id: property is missing`);
  if (!p["vxlan.remote"]) return fail(c, `Error: Failed to add '${name}' connection: vxlan.remote: property is missing`);
  if (master && p["connection.slave-type"] !== "bridge") return fail(c, `Error: Failed to add '${name}' connection: connection.slave-type: Cannot set 'master' without 'slave-type'.`);
  const vni = +p["vxlan.id"];
  const remote = p["vxlan.remote"];
  const dup = [...h.vx.values()].some((x) => x.id === vni && !x.dup);
  const x: Vx = { con: name, id: vni, remote, master, uuid: id, dup };
  h.vx.set(ifname, x);
  say(c, `Connection '${name}' (${id}) successfully added.`, "ok");
  c.fx.push({ k: "boot", id: `vx:${h.ip}:${ifname}` });
  c.lab.done.add(`vxlan:${ifname}`);
  if (dup) {
    c.lab.done.add("trap:vni");
    tip(c, `${h.label} ya tiene otra VXLAN con id ${vni}: el kernel no deja dos iguales (RTNETLINK answers: File exists) y ${name} no se activa (DEVICE --). Cada LAN, su id.`);
  }
  if (remote === h.ip) tip(c, "remote apunta a esta misma KVM: tiene que ser la IP de la OTRA (su ens32).");
  else if (!hostOf(c.lab, remote)) tip(c, `${remote} no es ninguna KVM: remote es la IP normal de la otra (ens32, 10.0.16.17x), no la de br0.`);
  if (!master) tip(c, "Sin master la VXLAN no cuelga de ningún bridge: añade slave-type bridge master BRIDGE.");
  else if (!brOf(h, x) && !dup) tip(c, `En ${h.label} no hay ningún bridge «${master}»: la VXLAN queda colgando hasta que exista.`);
}

function firewall(c: Ctx, h: Host, a: string[]) {
  const perm = a.includes("--permanent");
  const arg = (k: string) => a.find((x) => x.startsWith(k))?.split("=")[1];
  const add = arg("--add-port");
  const rem = arg("--remove-port");
  if (a.some((x) => /^[–—]/.test(x) || x.includes("–"))) return fail(c, "usage: see firewall-cmd man page\nfirewall-cmd: error: unrecognized arguments (¿guion largo copiado del PDF?)");
  const spec = add ?? rem;
  if (spec !== undefined) {
    const m = /^(\d+)\/(tcp|udp)$/.exec(spec);
    if (!m) return fail(c, "Error: INVALID_PORT: bad port (most likely missing protocol), correct syntax is portid[-portid]/protocol");
    const port = +m[1];
    const udp = m[2] === "udp";
    const set = udp ? (perm ? h.permUdp : h.udp) : perm ? h.perm : h.open;
    if (add) {
      if (set.has(port)) say(c, `Warning: ALREADY_ENABLED: ${perm ? `${port}:${m[2]}` : `'${port}:${m[2]}' already in 'public'`}`);
      set.add(port);
      say(c, "success", "ok");
      if (!perm) {
        c.fx.push(udp ? { k: "gate", host: h.ip, port: spec, open: true } : { k: "flash", id: `fw:${h.ip}:${port}` });
        c.lab.done.add(udp ? `fwu:${port}` : `fw:${port}`);
      } else tip(c, "Con --permanent se guarda para el próximo arranque, pero NO se aplica ahora: repite el comando sin --permanent.");
      return;
    }
    set.delete(port);
    c.fx.push(udp ? { k: "gate", host: h.ip, port: spec, open: false } : { k: "gone", id: `fw:${h.ip}:${port}` });
    return say(c, "success", "ok");
  }
  const list = (t: Set<number>, u: Set<number>) => [...[...t].map((p) => `${p}/tcp`), ...[...u].map((p) => `${p}/udp`)].join(" ");
  if (a.includes("--list-ports")) return say(c, perm ? list(h.perm, h.permUdp) : list(h.open, h.udp));
  if (a.includes("--list-all")) return say(c, `public (active)\n  target: default\n  interfaces: ens32 ens33\n  services: cockpit dhcpv6-client ssh\n  ports: ${list(h.open, h.udp)}`);
  if (a.includes("--reload")) {
    h.open = new Set(h.perm);
    h.udp = new Set(h.permUdp);
    return say(c, "success", "ok");
  }
  if (a.includes("--state")) return say(c, "running");
  return fail(c, "usage: firewall-cmd --add-port=PUERTO/tcp|udp [--permanent] | --remove-port=… | --list-ports");
}

function free(c: Ctx, h: Host) {
  const used = 420 + h.vms.reduce((s, v) => s + Math.min(v.mem, 190), 0);
  say(c, "              total        used        free      shared  buff/cache   available");
  say(c, `Mem:           ${RAM}        ${String(used).padStart(4)}        ${String(RAM - used - 300).padStart(4)}          10         300        ${RAM - used}`);
  say(c, "Swap:          2047           0        2047");
  const asked = h.vms.reduce((s, v) => s + v.mem, 0);
  if (asked > RAM * 0.8) tip(c, `Has pedido ${asked} MiB para MVs en un servidor de ~1,9 GiB: overcommit. Arrancan porque la RAM se da bajo demanda, pero si la usan de verdad habrá swap.`);
}

function procs(c: Ctx, h: Host, name: string, a: string[]) {
  const list = h.vms;
  if (name === "pgrep") {
    if (!list.length) c.ok = false;
    return list.forEach((v) => say(c, `${v.pid} ${a.includes("-a") ? v.cmd : "qemu-system-x86"}`));
  }
  if (a.includes("-o") || a.includes("-C")) {
    say(c, "    PID STAT CMD");
    return list.forEach((v) => say(c, `${String(v.pid).padStart(7)} ${v.stopped ? "Tl  " : "Sl  "} ${v.cmd}`));
  }
  say(c, "USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND");
  list.forEach((v) => say(c, `root      ${String(v.pid).padStart(6)}  3.1  9.4 ${String(v.mem * 1100).padStart(7)} 180244 pts/0    ${v.stopped ? "Tl" : "Sl"}   10:31   0:04 ${v.cmd}`));
}

function killCmd(c: Ctx, h: Host, name: string, a: string[]) {
  const args = a.filter((x) => !/^-\d+$|^-(9|KILL|TERM|15)$|^-s$/.test(x));
  let targets: Vm[] = [];
  if (name === "pkill") {
    const pat = args.filter((x) => x !== "-f").join(" ");
    targets = h.vms.filter((v) => (args.includes("-f") ? v.cmd : "qemu-system-x86_64").includes(pat));
  } else
    for (const x of args) {
      const v = x.startsWith("%") ? h.vms.find((y) => y.pid === h.jobs[+x.slice(1) - 1]) : h.vms.find((y) => y.pid === +x);
      if (v) targets.push(v);
      else fail(c, `-bash: kill: (${x}) - No such process`);
    }
  if (!targets.length && name === "pkill") c.ok = false;
  for (const v of targets) {
    const job = h.jobs.indexOf(v.pid);
    kill(c, h, v);
    if (job >= 0) say(c, `[${job + 1}]+  Terminated              ${v.cmd}`);
  }
  if (targets.length) tip(c, "kill es un power off duro: el guest no se entera. Lo limpio es poweroff dentro de la MV o system_powerdown en el monitor.");
}

function fg(c: Ctx, h: Host, which?: string) {
  const pid = which ? h.jobs[+which.replace("%", "") - 1] : h.jobs[h.jobs.length - 1];
  const v = h.vms.find((x) => x.pid === pid);
  if (!v) return fail(c, "-bash: fg: current: no such job");
  say(c, v.cmd);
  h.jobs = h.jobs.filter((p) => p !== pid);
  const was = v.stopped;
  v.stopped = false;
  if (was) v.upAt = c.now + bootMs(v);
  const console = v.telnet === undefined;
  c.lab.stack.push({ k: "vm", ip: h.ip, pid: v.pid, via: console ? "stdio" : "none" });
  if (was && console) c.out.push(...bootLines(c, h, v, v.oneTty || ttyOf(h, v.disk)));
  if (!console) tip(c, `QEMU está en primer plano pero su consola está en telnet:${v.telnet}. Ctrl+C la mata.`);
}

function logout(c: Ctx, h: Host) {
  const stopped = h.vms.filter((v) => h.jobs.includes(v.pid) && v.stopped);
  if (stopped.length && !h.warned) {
    h.warned = true;
    return say(c, "There are stopped jobs.");
  }
  h.warned = false;
  const dying = h.vms.filter((v) => h.jobs.includes(v.pid));
  for (const v of dying) kill(c, h, v);
  if (dying.length) tip(c, `Al cerrar la sesión, bash manda SIGHUP a sus trabajos y ${dying.length === 1 ? "esa MV muere" : `esas ${dying.length} MVs mueren`}. Para que sobrevivan: disown (o nohup) antes de salir.`);
  say(c, "logout");
  say(c, `Connection to ${h.ip} closed.`);
  const at = c.lab.stack.map((f) => f.k === "server" && f.ip === h.ip).lastIndexOf(true);
  const saved = c.lab.stack[at]?.saved;
  c.lab.stack.splice(at);
  if (saved) h.cwd = saved;
}

function boom(c: Ctx, h: Host) {
  for (const v of [...h.vms]) removeVm(c, h, v);
  h.dead = true;
  say(c, "Broadcast message from root@" + h.name + ": The system is going down for poweroff NOW!", "warn");
  say(c, `Connection to ${h.ip} closed by remote host.`);
  fail(c, `Has apagado el SERVIDOR ${h.label}, no una máquina virtual. En el laboratorio solo el profesor puede volver a encenderlo.`);
  tip(c, "Mira siempre el prompt: [root@vm-16-17x ~]# es el servidor; localhost:~# es la MV. Truco: alias poweroff=\" echo 'Acción no permitida' \" en el servidor.");
  dropHost(c.lab, h.ip);
  c.fx.push({ k: "boom", ip: h.ip });
}

/* ------------------------------------------------------------------ qemu-img */

function qemuImg(c: Ctx, h: Host, a: string[]) {
  const [sub, ...rest] = a;
  const opt = (k: string) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : undefined);
  const pos = rest.filter((x, i) => !x.startsWith("-") && !["-f", "-F", "-b", "-O", "-o", "-c", "-a", "-d"].includes(rest[i - 1]));
  const busy = (img: Img) => h.vms.some((v) => chain(h, v.disk).list[0] === img || v.extra.some((e) => real(h, e.path) === img));
  switch (sub) {
    case "create": {
      const file = pos[0];
      if (!file) return fail(c, "qemu-img: Expecting image file name");
      const at = abs(h, file);
      if (!h.dirs.has(dirOf(at))) return fail(c, `qemu-img: ${file}: Could not create '${at}': No such file or directory`);
      const fmt = (opt("-f") ?? "raw") as Img["fmt"];
      const b = opt("-b");
      const old = h.files.get(at);
      if (old && busy(old)) return fail(c, `qemu-img: ${file}: Failed to get "write" lock\nIs another process using the image [${file}]?`);
      if (b) {
        const bpath = b.startsWith("/") ? norm(b) : norm(`${dirOf(at)}/${b}`);
        const parent = real(h, bpath);
        if (!parent) return fail(c, `qemu-img: ${file}: Could not open '${bpath}': No such file or directory\nCould not open backing image.`);
        const broken = chain(h, bpath).broken;
        if (broken) {
          c.lab.done.add("trap:base");
          fail(c, `qemu-img: ${file}: Could not open '${baseName(broken)}': No such file or directory\nCould not open backing image.`);
          return tip(c, `${b} es a su vez un linked clone: necesita SU base, con el nombre exacto (${baseName(broken)}), en su misma carpeta.`);
        }
        if (!opt("-F")) say(c, `qemu-img: warning: Deprecated use of backing file without explicit backing format (detected format of ${parent.fmt})`, "warn");
        if (fmt !== "qcow2") return fail(c, `qemu-img: ${file}: Backing file not supported for file format '${fmt}'`);
        const size = pos[1] ? mib(pos[1]) : parent.virt;
        h.files.set(at, { path: at, kind: "clone", fmt, backing: bpath, bname: b, virt: size, used: 196, snaps: [], role: "plain", ro: false });
        say(c, `Formatting '${file}', fmt=qcow2 cluster_size=65536 extended_l2=off compression_type=zlib size=${bytes(size)} backing_file=${b} backing_fmt=${opt("-F") ?? parent.fmt} lazy_refcounts=off refcount_bits=16`);
        c.fx.push({ k: "boot", id: `disk:${h.ip}:${at}` }, { k: "packet", path: [`disk:${h.ip}:${bpath}`, `disk:${h.ip}:${at}`], tone: "data" });
        c.lab.done.add(`clone:${baseName(at)}`);
        if (old?.kind === "clone" || old?.kind === "base") tip(c, `${file} ya existía: qemu-img create lo ha sobrescrito sin preguntar.`);
        return;
      }
      const size = pos[1] ? mib(pos[1]) : NaN;
      if (!size) return fail(c, "qemu-img: Image creation needs a size parameter");
      const full = (opt("-o") ?? "").includes("preallocation=full");
      h.files.set(at, { path: at, kind: "data", fmt, virt: size, used: full ? size * 1024 : fmt === "raw" ? 0 : 196, snaps: [], role: "plain", ro: false });
      say(c, `Formatting '${file}', fmt=${fmt}${fmt === "qcow2" ? " cluster_size=65536 extended_l2=off compression_type=zlib" : ""} size=${bytes(size)}${full ? " preallocation=full" : ""}${fmt === "qcow2" ? " lazy_refcounts=off refcount_bits=16" : ""}`);
      c.fx.push({ k: "boot", id: `disk:${h.ip}:${at}` });
      c.lab.done.add(`data:${baseName(at)}`);
      tip(c, full ? "preallocation=full: thick, ocupa todo desde ya." : `Disco vacío de ${gib(size)}: thin, solo ocupará lo que escribas.`);
      return;
    }
    case "info": {
      const file = pos[0];
      if (!file) return fail(c, "qemu-img: Expecting one image file name");
      const at = abs(h, file);
      const ch = chain(h, at);
      if (!ch.list.length) return fail(c, `qemu-img: Could not open '${file}': Could not open '${file}': No such file or directory`);
      if (ch.broken) {
        c.lab.done.add("trap:base");
        return fail(c, `qemu-img: Could not open '${file}': Could not open backing file: Could not open '${baseName(ch.broken)}': No such file or directory`);
      }
      const deep = rest.includes("--backing-chain");
      const names = [file, ...ch.list.slice(0, -1).map((i) => i.bname ?? "")];
      ch.list.slice(0, deep ? undefined : 1).forEach((img, i) => {
        if (i) say(c, "");
        say(c, `image: ${names[i]}`);
        say(c, `file format: ${img.fmt}`);
        say(c, `virtual size: ${gib(img.virt)} (${bytes(img.virt)} bytes)`);
        say(c, `disk size: ${kib(img.used)}`);
        if (img.fmt === "qcow2") say(c, "cluster_size: 65536");
        if (img.backing) {
          say(c, `backing file: ${img.bname}${img.bname?.startsWith("/") ? "" : ` (actual path: ${img.backing})`}`);
          say(c, "backing file format: qcow2");
        }
        if (img.snaps.length) {
          say(c, "Snapshot list:");
          say(c, "ID        TAG               VM SIZE                DATE     VM CLOCK     ICOUNT");
          img.snaps.forEach((s, k) => say(c, `${String(k + 1).padEnd(9)} ${s.name.padEnd(17)}     0 B 2026-11-02 10:40:00 00:00:00.000          0`));
        }
        if (img.fmt === "qcow2") say(c, "Format specific information:\n    compat: 1.1\n    compression type: zlib\n    lazy refcounts: false\n    refcount bits: 16\n    corrupt: false\n    extended l2: false");
      });
      if (deep) c.lab.done.add("info-chain");
      if (ch.list[0].stale) tip(c, "Ojo: su base cambió después de crearlo (commit o cambios en la base): sus datos pueden ser incoherentes.");
      return;
    }
    case "convert": {
      const [src, dst] = pos;
      const out = opt("-O") ?? "raw";
      const from = src ? chain(h, abs(h, src)) : { list: [] as Img[], broken: undefined as string | undefined };
      if (!src || !dst) return fail(c, "qemu-img: Expecting image file name");
      if (!from.list.length || from.broken) return fail(c, `qemu-img: Could not open '${src}': No such file or directory`);
      const at = abs(h, dst);
      const used = Math.round(from.list.reduce((s, i) => s + i.used, 0) * (rest.includes("-c") ? 0.55 : 0.97));
      h.files.set(at, { path: at, kind: "full", fmt: out as Img["fmt"], virt: from.list[0].virt, used, snaps: [], role: roleOf(h, abs(h, src)), ro: false, tty: ttyOf(h, abs(h, src)) });
      say(c, "    (100.00/100%)", undefined, 600);
      c.fx.push({ k: "packet", path: [...from.list.map((i) => `disk:${h.ip}:${i.path}`).reverse(), `disk:${h.ip}:${at}`], tone: "data" }, { k: "boot", id: `disk:${h.ip}:${at}` });
      c.lab.done.add(`full:${baseName(at)}`);
      return tip(c, `Full clone: ${baseName(at)} no depende de nadie (lee toda la cadena y la escribe en un disco nuevo).`);
    }
    case "commit": {
      const file = pos[0];
      const img = file ? real(h, abs(h, file)) : undefined;
      if (!img) return fail(c, `qemu-img: Could not open '${file ?? ""}': No such file or directory`);
      if (!img.backing) return fail(c, `qemu-img: Image '${file}' does not have a backing file`);
      if (busy(img)) return fail(c, `qemu-img: Could not open '${file}': Failed to get "write" lock`);
      const parent = real(h, img.backing);
      if (!parent) return fail(c, `qemu-img: Could not open backing file`);
      parent.used += Math.round(img.used * 0.8);
      if (img.tty !== undefined) parent.tty = img.tty;
      img.used = 196;
      img.tty = undefined;
      const others = [...h.files.values()].filter((x) => x !== img && x.backing && real(h, x.backing) === parent);
      others.forEach((x) => (x.stale = true));
      say(c, "Image committed.", "ok");
      c.fx.push({ k: "packet", path: [`disk:${h.ip}:${img.path}`, `disk:${h.ip}:${img.backing}`], tone: "data" });
      if (others.length) tip(c, `La base la comparten ${others.map((x) => baseName(x.path)).join(", ")}: ahora ven datos que no esperaban (incoherentes).`);
      return;
    }
    case "rebase": {
      const file = pos[0];
      const img = file ? real(h, abs(h, file)) : undefined;
      const nb = opt("-b");
      if (!img || nb === undefined) return fail(c, "qemu-img: Expecting one image file name");
      const bpath = nb.startsWith("/") ? norm(nb) : norm(`${dirOf(img.path)}/${nb}`);
      if (!rest.includes("-u") && !real(h, bpath)) return fail(c, `qemu-img: Could not open new backing file '${bpath}': No such file or directory`);
      img.backing = bpath;
      img.bname = nb;
      img.stale = false;
      return tip(c, rest.includes("-u") ? "Rebase inseguro (-u): solo cambia el puntero de la cabecera (útil tras mover la base)." : "Rebase seguro: QEMU copia al clon las diferencias para que el guest siga viendo lo mismo.");
    }
    case "snapshot": {
      const file = pos[pos.length - 1];
      const img = file ? real(h, abs(h, file)) : undefined;
      if (!img) return fail(c, `qemu-img: Could not open '${file ?? ""}': No such file or directory`);
      if (busy(img) && !rest.includes("-l")) return fail(c, `qemu-img: Could not open '${file}': Failed to get "write" lock\nIs another process using the image [${file}]?`);
      const cName = opt("-c");
      const aName = opt("-a");
      const dName = opt("-d");
      if (cName) {
        img.snaps.push({ name: cName, used: img.used, tty: img.tty });
        c.lab.done.add("snap-c");
        c.fx.push({ k: "flash", id: `disk:${h.ip}:${img.path}` });
        return;
      }
      if (rest.includes("-l")) {
        if (!img.snaps.length) return;
        say(c, "Snapshot list:");
        say(c, "ID        TAG               VM SIZE                DATE     VM CLOCK     ICOUNT");
        return img.snaps.forEach((s, k) => say(c, `${String(k + 1).padEnd(9)} ${s.name.padEnd(17)}     0 B 2026-11-02 10:40:00 00:00:00.000          0`));
      }
      const s = img.snaps.find((x) => x.name === (aName ?? dName));
      if (!s) return fail(c, `qemu-img: Could not ${aName ? "apply" : "delete"} snapshot '${aName ?? dName ?? ""}': snapshot not found`);
      if (aName) {
        img.used = s.used;
        img.tty = s.tty;
        c.lab.done.add("snap-a");
        c.fx.push({ k: "flash", id: `disk:${h.ip}:${img.path}` });
        return tip(c, `El disco vuelve a como estaba en «${s.name}»: todo lo escrito después desaparece.`);
      }
      img.snaps = img.snaps.filter((x) => x !== s);
      return;
    }
    case "resize": {
      const img = pos[0] ? real(h, abs(h, pos[0])) : undefined;
      if (!img) return fail(c, `qemu-img: Could not open '${pos[0] ?? ""}': No such file or directory`);
      const m = /^([+-]?)(.+)$/.exec(pos[1] ?? "");
      if (!m) return fail(c, "qemu-img: Expecting image file name and size");
      const n = mib(m[2]);
      img.virt = m[1] === "+" ? img.virt + n : m[1] === "-" ? img.virt - n : n;
      return say(c, "Image resized.", "ok");
    }
    case "check":
      if (!pos[0] || !real(h, abs(h, pos[0]))) return fail(c, `qemu-img: Could not open '${pos[0] ?? ""}': No such file or directory`);
      return say(c, "No errors were found on the image.\n3/131072 = 0.00% allocated, 0.00% fragmented, 0.00% compressed clusters\nImage end offset: 262144", "ok");
    default:
      return fail(c, `qemu-img: Command not found: ${sub ?? ""}`);
  }
}

/* ------------------------------------------------------------------ qemu-system-x86_64 */

const NIC_MODELS = ["e1000", "e1000e", "rtl8139", "virtio-net-pci", "virtio-net", "pcnet", "ne2k_pci"];
const kv = (s: string) => Object.fromEntries(s.split(",").map((p) => (p.includes("=") ? [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)] : [p, ""])));

function qemu(c: Ctx, h: Host, cmd: Cmd, a: string[]) {
  const lab = c.lab;
  if (a.includes("-netdev") && a[a.indexOf("-netdev") + 1] === "help") return say(c, "Available netdev backend types:\nsocket\nhubport\ntap\nuser\nl2tpv3\nbridge\nvhost-user\nvhost-vdpa");
  if (a.includes("-device") && a[a.indexOf("-device") + 1] === "help") return say(c, 'Network devices:\nname "e1000", bus PCI, alias "e1000-82540em", desc "Intel Gigabit Ethernet"\nname "rtl8139", bus PCI\nname "virtio-net-pci", bus virtio-bus');
  const spec = { mem: 128, smp: 1, kvm: false, nographic: false, snapshot: false, nodefaults: false, disks: [] as string[], drives: [] as Record<string, string>[], netdevs: [] as Record<string, string>[], devices: [] as Record<string, string>[], name: undefined as string | undefined, serial: undefined as string | undefined, qmp: undefined as string | undefined, nics: [] as Record<string, string>[] };
  const VAL = new Set(["-name", "-m", "-smp", "-serial", "-monitor", "-qmp", "-drive", "-hda", "-hdb", "-cdrom", "-boot", "-netdev", "-device", "-nic", "-net", "-cpu", "-accel", "-display", "-vga", "-machine", "-k"]);
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (/^[–—]/.test(t)) {
      fail(c, `qemu-system-x86_64: ${t}: Could not open '${t}': No such file or directory`);
      return tip(c, "Guion largo copiado del PDF: QEMU lo toma como el nombre de un disco. Escribe -nographic con el guion normal.");
    }
    const o = t.replace(/^--/, "-");
    if (!t.startsWith("-")) {
      spec.disks.push(t);
      continue;
    }
    if (VAL.has(o)) {
      const v = a[++i];
      if (v === undefined) return fail(c, `qemu-system-x86_64: ${t}: requires an argument`);
      if (o === "-name") spec.name = v;
      else if (o === "-m") spec.mem = /^\d+$/.test(v) ? +v : mib(v.replace(/^size=/, ""));
      else if (o === "-smp") spec.smp = +(kv(v).cpus || v.split(",")[0]) || 1;
      else if (o === "-serial") spec.serial = v;
      else if (o === "-qmp") spec.qmp = v;
      else if (o === "-drive") spec.drives.push(kv(v));
      else if (o === "-hda") spec.disks.unshift(v);
      else if (o === "-netdev") {
        const [kind, ...more] = v.split(",");
        const fwd = more.filter((p) => p.startsWith("hostfwd=")).map((p) => p.slice(8));
        spec.netdevs.push({ ...kv(more.join(",")), kind, hostfwd: fwd.join(" ") });
      } else if (o === "-device") {
        const [model, ...more] = v.split(",");
        if (NIC_MODELS.includes(model)) spec.devices.push({ ...kv(more.join(",")), model, raw: v });
      } else if (o === "-nic") {
        const [kind, ...more] = v.split(",");
        const fwd = more.filter((p) => p.startsWith("hostfwd=")).map((p) => p.slice(8));
        spec.nics.push({ ...kv(more.join(",")), kind, hostfwd: fwd.join(" ") });
      } else if (o === "-net" && v.startsWith("user")) spec.nics.push({ kind: "user", hostfwd: "" });
      else if (o === "-accel" && v.startsWith("kvm")) spec.kvm = true;
      continue;
    }
    if (o === "-enable-kvm") spec.kvm = true;
    else if (o === "-nographic") spec.nographic = true;
    else if (o === "-snapshot") spec.snapshot = true;
    else if (o === "-nodefaults") spec.nodefaults = true;
    else if (o === "-daemonize") continue;
    else return fail(c, `qemu-system-x86_64: ${t}: invalid option`);
  }
  // disks
  const boot = spec.disks[0] ?? spec.drives[0]?.file;
  const extra = [...spec.disks.slice(1).map((p) => ({ file: p, if: "ide" })), ...spec.drives.slice(spec.disks.length ? 0 : 1)].map((d) => ({ path: abs(h, d.file ?? ""), iface: d.if || "ide", file: d.file ?? "" }));
  if (!boot) return fail(c, "qemu-system-x86_64: no se ha indicado ningún disco (sin disco la MV no tiene nada que arrancar)");
  const disk = abs(h, boot);
  const ch = chain(h, disk);
  if (!ch.list.length) return fail(c, `qemu-system-x86_64: Could not open '${boot}': No such file or directory`);
  if (ch.broken) {
    lab.done.add("trap:base");
    return fail(c, `qemu-system-x86_64: ${boot}: Could not open backing file: Could not open '${baseName(ch.broken)}': No such file or directory`);
  }
  for (const e of extra) if (!real(h, e.path)) return fail(c, `qemu-system-x86_64: -drive file=${e.file}: Could not open '${e.file}': No such file or directory`);
  // image locks: a writer excludes everyone else; backing files can be shared by readers
  const mine = { w: spec.snapshot ? [] : [ch.list[0]], r: spec.snapshot ? ch.list : ch.list.slice(1) };
  for (const e of extra) mine.w.push(real(h, e.path)!);
  for (const v of h.vms) {
    const vc = chain(h, v.disk).list;
    const theirs = { w: v.tmp ? [] : [vc[0], ...v.extra.map((e) => real(h, e.path)!)], r: v.tmp ? vc : vc.slice(1) };
    const clash = mine.w.find((x) => theirs.w.includes(x) || theirs.r.includes(x)) ?? mine.r.find((x) => theirs.w.includes(x));
    if (clash) {
      fail(c, `qemu-system-x86_64: Failed to get "write" lock\nIs another process using the image [${baseName(clash.path)}]?`);
      return tip(c, theirs.r.includes(clash) ? `La MV ${vmName(h, v)} usa ${baseName(clash.path)} como base: mientras esté encendida no puedes arrancar la base escribiendo en ella.` : `La MV ${vmName(h, v)} (PID ${v.pid}) ya usa ese disco. Cada MV necesita su propio disco.`);
    }
  }
  // networks
  const nics: Nic[] = [];
  const macs = ["52:54:00:12:34:56", "52:54:00:12:34:57", "52:54:00:12:34:58"];
  const fwdOf = (s: string) =>
    s
      .split(" ")
      .filter(Boolean)
      .map((r) => /tcp:[^:]*:(\d+)-[^:]*:(\d+)/.exec(r))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => ({ host: +m[1], guest: +m[2] }));
  for (const d of spec.devices) {
    const nd = spec.netdevs.find((n) => n.id === d.netdev);
    if (!d.netdev || !nd) {
      lab.done.add("trap:netdev");
      fail(c, `qemu-system-x86_64: -device ${d.raw}: Property '${d.model}.netdev' can't find value '${d.netdev ?? ""}'`);
      return tip(c, `netdev= (en -device) e id= (en -netdev) son la misma etiqueta, local a esta MV: aquí ${spec.netdevs.map((n) => `id=${n.id}`).join(", ") || "no hay ningún -netdev"}. El bridge va en br=.`);
    }
    if (d.mac !== undefined && !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(d.mac)) {
      lab.done.add("trap:mac");
      fail(c, `qemu-system-x86_64: -device ${d.raw}: Property '${d.model}.mac' doesn't take value '${d.mac}'`);
      return tip(c, "Una MAC son 6 pares de dígitos hexadecimales separados por «:» (DE:AD:BE:EF:E3:50).");
    }
    nics.push({ id: nd.id, kind: nd.kind === "bridge" ? "bridge" : "user", br: nd.br || (nd.kind === "bridge" ? "br0" : undefined), model: d.model, mac: (d.mac ?? macs[nics.length]).toUpperCase(), fwd: fwdOf(nd.hostfwd ?? "") });
  }
  for (const nd of spec.netdevs) if (!spec.devices.some((d) => d.netdev === nd.id)) say(c, `qemu-system-x86_64: warning: netdev ${nd.id} has no peer`, "warn");
  for (const n of spec.nics) {
    if (n.kind !== "user" && n.kind !== "bridge") return fail(c, `qemu-system-x86_64: -nic ${n.kind}: backend no simulado`);
    nics.push({ id: `nic${nics.length}`, kind: n.kind, br: n.br || (n.kind === "bridge" ? "br0" : undefined), model: n.model || "e1000", mac: (n.mac ?? macs[nics.length]).toUpperCase(), fwd: fwdOf(n.hostfwd ?? "") });
  }
  if (!spec.devices.length && !spec.nics.length && !spec.netdevs.length && !spec.nodefaults) nics.push({ id: "hub0port0", kind: "user", model: "e1000", mac: macs[0], fwd: [] });
  for (const nd of spec.netdevs) {
    if (!["user", "bridge"].includes(nd.kind)) return fail(c, `qemu-system-x86_64: -netdev ${nd.kind}: backend no simulado (en las prácticas se usan user y bridge)`);
  }
  for (const n of nics) {
    if (n.kind !== "bridge") continue;
    if (!h.bridges.has(n.br!)) return fail(c, `failed to get mtu of bridge \`${n.br}': No such device\nqemu-system-x86_64: -netdev bridge,br=${n.br},id=${n.id}: bridge helper failed`);
    if (!h.allow.has(n.br!) && !h.allow.has("all")) {
      fail(c, `access denied by acl file\nqemu-system-x86_64: -netdev bridge,br=${n.br},id=${n.id}: bridge helper failed`);
      return tip(c, `Falta «allow ${n.br}» en /etc/qemu/bridge.conf.`);
    }
    if (parseInt(n.mac.split(":")[0], 16) % 2 === 1) {
      fail(c, `qemu-system-x86_64: -device ${n.model},netdev=${n.id},mac=${n.mac}: Property '${n.model}.mac' doesn't take value '${n.mac}'`);
      return tip(c, "El primer byte de la MAC es impar: es una dirección de multicast. Tiene que ser par (52, DE…).");
    }
  }
  for (const n of nics)
    for (const f of n.fwd)
      if (h.vms.some((v) => v.nics.some((x) => x.fwd.some((y) => y.host === f.host)))) {
        lab.done.add("trap:hostfwd");
        fail(c, `qemu-system-x86_64: -netdev user,id=${n.id},hostfwd=tcp::${f.host}-:${f.guest}: Could not set up host forwarding rule 'tcp::${f.host}-:${f.guest}'`);
        return tip(c, `El ${f.host} de ${h.label} ya lo usa otra MV: cada hostfwd, su puerto del host.`);
      }
  // serial and qmp
  let telnet: number | undefined;
  let mon = !spec.serial;
  if (spec.serial) {
    const s = /^(mon:)?telnet:[^:]*:(\d+)(.*)$/.exec(spec.serial);
    if (s) {
      telnet = +s[2];
      mon = !!s[1];
      if (!/server(=on)?/.test(s[3])) return fail(c, `qemu-system-x86_64: -serial ${spec.serial}: Failed to connect to 'localhost:${telnet}': Connection refused\n(sin server=on, QEMU intenta conectarse él como cliente)`);
      if (h.vms.some((v) => v.telnet === telnet)) return fail(c, `qemu-system-x86_64: -serial ${spec.serial}: Failed to bind socket: Address already in use`);
      if (!/wait=off|nowait/.test(s[3]) && cmd.bg) tip(c, "Sin wait=off la MV no arranca hasta que alguien se conecte por telnet.");
    } else if (spec.serial !== "stdio" && spec.serial !== "mon:stdio") return fail(c, `qemu-system-x86_64: -serial ${spec.serial}: valor no simulado`);
  }
  let qmp: string | undefined;
  if (spec.qmp !== undefined) {
    const q = /^unix:([^,]*)/.exec(spec.qmp);
    if (!q || !q[1]) return fail(c, `qemu-system-x86_64: -qmp ${spec.qmp}: Failed to bind socket to : No such file or directory`);
    if (!h.dirs.has(dirOf(q[1]))) return fail(c, `qemu-system-x86_64: -qmp ${spec.qmp}: Failed to bind socket to ${q[1]}: No such file or directory`);
    qmp = q[1];
  }
  // launch
  const pid = (lab.nextPid += 37);
  const v: Vm = {
    pid,
    name: spec.name,
    mem: spec.mem || 128,
    smp: spec.smp,
    kvm: spec.kvm,
    disk,
    extra: extra.map((e) => ({ path: e.path, iface: e.iface })),
    nics,
    telnet,
    mon,
    qmp,
    stopped: false,
    paused: false,
    upAt: c.now + bootMs({ kvm: spec.kvm } as Vm),
    tmp: spec.snapshot,
    role: roleOf(h, disk),
    cmd: `qemu-system-x86_64 ${a.join(" ")}`,
    fwdOn: false,
    routes: [],
    oneTty: false,
    svc: {},
    log: [],
    leases: {},
  };
  h.vms.push(v);
  taps(h);
  c.fx.push({ k: "boot", id: `vm:${pid}` });
  for (const n of nics) if (n.kind === "bridge") c.fx.push({ k: "packet", path: [`vm:${pid}`, `br:${h.ip}:${n.br}`], tone: "ok" });
  if (!spec.kvm) {
    lab.done.add("trap:kvm");
    tip(c, "Sin --enable-kvm QEMU emula la CPU con TCG (traducción binaria): funciona, pero mucho más lento.");
  }
  const asked = h.vms.reduce((s, x) => s + x.mem, 0);
  if (asked > RAM * 0.8) tip(c, `Overcommit: ya hay ${asked} MiB de RAM pedidos para MVs en un servidor de ~1,9 GiB.`);
  if (qmp) lab.done.add(`qmp:${spec.name ?? ""}`);
  if (spec.snapshot) tip(c, "-snapshot: lo que escribas en los discos va a un fichero temporal y se pierde al apagar.");
  const tty = ttyOf(h, disk);
  if (cmd.bg) {
    h.jobs.push(pid);
    say(c, `[${h.jobs.length}] ${pid}`);
    if (spec.nographic && telnet === undefined && !cmd.nullIn) {
      v.stopped = true;
      say(c, `[${h.jobs.length}]+  Stopped                 ${v.cmd}`, "warn");
      return tip(c, "QEMU quería leer del teclado en segundo plano y bash la ha parado (estado T). Lánzala con < /dev/null.");
    }
    if (!spec.nographic) tip(c, "Sin -nographic QEMU abre una pantalla gráfica (aquí, un servidor VNC): no verás la consola.");
    if (telnet !== undefined) tip(c, `Consola en telnet:${telnet}. Desde el servidor: telnet localhost ${telnet}. Desde tu PC, abre antes el puerto en el firewall.`);
    lab.done.add(`bg:${baseName(disk)}`);
    return;
  }
  if (!spec.nographic) {
    say(c, "VNC server running on ::1:5900");
    tip(c, "Sin -nographic QEMU abre una pantalla gráfica (VNC): en la terminal no verás nada. Ctrl+C para matarla.");
    lab.stack.push({ k: "vm", ip: h.ip, pid, via: "none" });
    return;
  }
  if (telnet !== undefined) {
    lab.stack.push({ k: "vm", ip: h.ip, pid, via: "none" });
    return tip(c, `QEMU ocupa la terminal, pero su consola está en telnet:${telnet}. Ctrl+C la mata; la próxima vez lánzala con & al final.`);
  }
  lab.stack.push({ k: "vm", ip: h.ip, pid, via: "stdio" });
  lab.done.add(`fg:${baseName(disk)}`);
  if (!tty) {
    v.upAt = Infinity;
    lab.menu = { pid, tab: false };
    c.out.push({ t: "SeaBIOS (version 1.14.0-1.fc34)" }, { t: "Booting from Hard Disk...", d: 300 }, { t: "", d: 500 }, { t: "boot: virt", d: 600 });
    c.out.push({ t: "ℹ Menú del cargador (extlinux), con cuenta atrás. Pulsa «Tab» para editar la línea del kernel, o Intro para arrancar tal cual.", c: "info", d: 700 });
    return;
  }
  c.out.push(...bootLines(c, h, v, true));
}

/* ------------------------------------------------------------------ connections into the VMs */

function telnet(c: Ctx, h: Host, port: number, from: "pc" | "server", label?: string) {
  const v = h.vms.find((x) => x.telnet === port);
  const who = label ?? h.ip;
  say(c, `Trying ${from === "server" && (who === "localhost" || who === "127.0.0.1") ? "::1" : h.ip}...`);
  if (h.dead || h.cut) return fail(c, `telnet: Unable to connect to remote host: No route to host`);
  if (from === "pc" && !h.open.has(port)) {
    fail(c, "telnet: Unable to connect to remote host: No route to host");
    return tip(c, `El firewall de ${h.label} no deja entrar al puerto ${port}: firewall-cmd --add-port=${port}/tcp en el servidor.`);
  }
  if (!v) return fail(c, "telnet: Unable to connect to remote host: Connection refused");
  say(c, `Connected to ${who}.`);
  say(c, "Escape character is '^]'.");
  // QEMU serves one client per console: a second one waits in line, and so does what it types
  const busy = Object.values(c.lab.stacks).some((s) => s!.some((f) => f.k === "vm" && f.pid === v.pid && f.via === "telnet" && !f.wait));
  const frame: Frame = { k: "vm", ip: h.ip, pid: v.pid, via: "telnet", login: c.lab.real ? 0 : undefined, wait: busy || undefined };
  c.lab.stack.push(frame);
  c.fx.push({ k: "packet", path: from === "pc" ? ["pc", "vpn", `fw:${h.ip}:${port}`, `vm:${v.pid}`] : [`srv:${h.ip}`, `vm:${v.pid}`] });
  c.lab.done.add(`telnet-${from}`);
  if (busy) {
    c.lab.done.add("trap:telnet2");
    c.fx.push({ k: "queue", host: h.ip, port, vm: `vm:${v.pid}`, on: true });
    return;
  }
  if (c.lab.real) return; // the console shows nothing until you press Enter
  if (!isUp(v, c.now)) say(c, "(la MV todavía está arrancando…)", "dim");
  else {
    say(c, "");
    say(c, "localhost login: root");
    say(c, "Password: ");
    say(c, "Welcome to Alpine!");
  }
}

function hostfwdSsh(c: Ctx, h: Host, port: number, from: "pc" | "server") {
  const v = h.vms.find((x) => x.nics.some((n) => n.fwd.some((f) => f.host === port && f.guest === 22)));
  if (from === "pc" && !h.open.has(port)) {
    c.lab.done.add("trap:fw");
    c.fx.push({ k: "packet", path: ["pc", "vpn", `fw:${h.ip}:${port}`], tone: "err" });
    fail(c, `ssh: connect to host ${h.ip} port ${port}: No route to host`);
    return tip(c, `Desde fuera, el firewall tiene que dejar pasar el ${port}: firewall-cmd --add-port=${port}/tcp.`);
  }
  if (!v || !isUp(v, c.now)) return fail(c, `ssh: connect to host ${from === "pc" ? h.ip : "localhost"} port ${port}: Connection refused`);
  say(c, `root@${from === "pc" ? h.ip : "localhost"}'s password: ••••••••`);
  say(c, "Welcome to Alpine!");
  c.lab.stack.push({ k: "vm", ip: h.ip, pid: v.pid, via: "ssh", to: from === "pc" ? h.ip : "localhost" });
  c.fx.push({ k: "packet", path: from === "pc" ? ["pc", "vpn", `fw:${h.ip}:${port}`, `nat:${v.pid}`, `vm:${v.pid}`] : [`srv:${h.ip}`, `nat:${v.pid}`, `vm:${v.pid}`] });
  c.lab.done.add(`ssh-fwd-${from}`);
}

function sshFromServer(c: Ctx, h: Host, a: string[]) {
  const port = a.includes("-p") ? +a[a.indexOf("-p") + 1] : 22;
  const dest = (a.filter((x, i) => !x.startsWith("-") && a[i - 1] !== "-p").pop() ?? "").replace(/^.*@/, "");
  if (/^(localhost|127\.0\.0\.1)$/.test(dest) || dest === h.ip) {
    if (port !== 22) return hostfwdSsh(c, h, port, "server");
    return tip(c, "Ya estás en ese servidor.");
  }
  const other = findHost(c.lab, dest);
  if (other) {
    if (other.dead || other.cut) return fail(c, `ssh: connect to host ${other.ip} port 22: No route to host`);
    say(c, `root@${other.ip}'s password: ••••••••`);
    c.lab.stack.push({ k: "server", ip: other.ip, via: "ssh", saved: other.cwd });
    other.cwd = "/root";
    c.fx.push({ k: "packet", path: [`srv:${h.ip}`, `srv:${other.ip}`] });
    return;
  }
  if (dest.startsWith("10.0.2.")) {
    fail(c, `ssh: connect to host ${dest} port 22: No route to host`);
    return tip(c, "La 10.0.2.x de la red user solo existe dentro del proceso QEMU de esa MV: desde el host no se llega. Hace falta hostfwd (o un bridge).");
  }
  const t = target(c, dest);
  const myBr = t && [...h.bridges.keys()].find((b) => sameNet(bridgeIp(h, b), dest) && segOf(c.lab, h.ip, b) === segOf(c.lab, t.h.ip, t.n.br!));
  if (!t || !myBr || !isUp(t.v, c.now)) return fail(c, `ssh: connect to host ${dest} port 22: No route to host`);
  say(c, `root@${dest}'s password: ••••••••`);
  say(c, "Welcome to Alpine!");
  c.lab.stack.push({ k: "vm", ip: t.h.ip, pid: t.v.pid, via: "ssh", to: dest });
  c.fx.push({ k: "packet", path: [`srv:${h.ip}`, ...hops(c.lab, h, myBr, t.h, t.n.br!).path, `vm:${t.v.pid}`] });
  c.lab.done.add("ssh-bridge");
}

/** The VM bridge NIC that owns an IP, on any host. */
function target(c: Ctx, ip: string) {
  for (const h of c.lab.hosts)
    for (const v of h.vms) {
      ips(c.lab, h, v, c.now, c.fx);
      const n = v.nics.find((x) => x.kind === "bridge" && x.ip === ip);
      if (n) return { h, v, n };
    }
  return undefined;
}

function web(c: Ctx, url: string, from: "pc" | "server" | "vm", h?: Host, save = false, me?: Vm) {
  const u = url.replace(/^https?:\/\//, "");
  const m = /^([^/:]+)(?::(\d+))?/.exec(u);
  if (!m) return fail(c, "curl: (3) URL using bad/illegal format or missing URL");
  const host = m[1];
  const port = +(m[2] ?? 80);
  let srv = h;
  if (from === "pc") srv = findHost(c.lab, host);
  else if (from === "vm" && me && host === "10.0.2.2") srv = h;
  else if (from === "server" && !/^(localhost|127\.0\.0\.1)$/.test(host) && host !== h?.ip) {
    const t = h ? target(c, host) : undefined;
    if (t && t.h === h && t.v.role === "web" && port === 80 && isUp(t.v, c.now)) return page(c, save, [`srv:${h.ip}`, `br:${h.ip}:${t.n.br}`, `vm:${t.v.pid}`]);
    return fail(c, `curl: (7) Failed to connect to ${host} port ${port}: No route to host`);
  }
  if (!srv) return fail(c, `curl: (6) Could not resolve host: ${host}`);
  if (from === "pc" && !c.lab.vpn) return fail(c, `curl: (28) Failed to connect to ${host} port ${port}: Timed out`);
  if (from === "pc" && !srv.open.has(port)) {
    fail(c, `curl: (7) Failed to connect to ${host} port ${port}: No route to host`);
    return tip(c, `El firewall de ${srv.label} bloquea el ${port}. En el servidor: firewall-cmd --add-port=${port}/tcp.`);
  }
  const v = srv.vms.find((x) => x.nics.some((n) => n.fwd.some((f) => f.host === port)));
  const f = v?.nics.flatMap((n) => n.fwd).find((x) => x.host === port);
  if (!v || !f || !isUp(v, c.now)) return fail(c, `${save ? `Connecting to ${host}|:${port}... failed` : `curl: (7) Failed to connect to ${host} port ${port}`}: Connection refused.`);
  if (f.guest !== 80 || v.role !== "web") return fail(c, `curl: (56) Recv failure: Connection reset by peer\n(en la MV no hay ningún servidor web escuchando en el puerto ${f.guest})`);
  const path = from === "pc" ? ["pc", "vpn", `fw:${srv.ip}:${port}`, `nat:${v.pid}`, `vm:${v.pid}`] : [`srv:${srv.ip}`, `nat:${v.pid}`, `vm:${v.pid}`];
  c.lab.done.add(from === "pc" ? "web-pc" : "web-server");
  page(c, save, path);
}

function page(c: Ctx, save: boolean, path: string[]) {
  c.fx.push({ k: "packet", path, tone: "data" });
  if (save) {
    say(c, "HTTP request sent, awaiting response... 200 OK");
    say(c, "Length: 182 [text/html]");
    return say(c, "‘index.html’ saved [182/182]", "ok", 400);
  }
  say(c, "<html><body><h1>alpine-webserver</h1><p>Servidor web de la MV (simulado)</p></body></html>", "ok");
}

/* ------------------------------------------------------------------ inside a VM (Alpine) */

function guest(c: Ctx, h: Host, v: Vm, cmd: Cmd) {
  const f = top(c.lab);
  const [name, ...a] = cmd.argv;
  if (f.via === "none") return tip(c, "Esta terminal está ocupada por QEMU sin consola. Ctrl+C para matarla.");
  if (v.paused) return tip(c, "La MV está en pausa (stop en el monitor): no responde. Ctrl+A c y cont para reanudarla.");
  if (!isUp(v, c.now)) return say(c, "(la MV todavía está arrancando…)", "dim");
  ips(c.lab, h, v, c.now, c.fx);
  const hn = vmHostname(c.lab, v);
  switch (name) {
    case "help":
      return help(c, "vm");
    case "hostname":
      return say(c, hn);
    case "whoami":
      return say(c, "root");
    case "uname":
      return say(c, `Linux ${hn} 5.10.43-0-virt #1-Alpine SMP x86_64 Linux`);
    case "cat": {
      const net = netOf(h, v);
      if (a[0] === "/etc/os-release") return say(c, 'NAME="Alpine Linux"\nVERSION_ID=3.13.5');
      if (a[0] === "/boot/extlinux.conf") return extlinux(c, h, v, false);
      if (a[0] === "/proc/sys/net/ipv4/ip_forward") return say(c, v.fwdOn ? "1" : "0");
      if (a[0] === "/etc/hostname") return say(c, hn);
      if (a[0] === "/etc/network/interfaces") return say(c, ifacesText(net));
      if (a[0] === "/var/log/messages") return say(c, v.log.join("\n"));
      if (a[0] === "/etc/dhcp/dhcpd.conf" && net.conf) return say(c, net.conf.join("\n"));
      if (a[0] === "/var/lib/dhcp/dhcpd.leases" && v.role === "dhcp") return say(c, Object.entries(v.leases).map(([mac, ip]) => `lease ${ip} {\n  binding state active;\n  hardware ethernet ${mac};\n}`).join("\n") || "# The format of this file is documented in the dhcpd.leases(5) manual page.");
      return fail(c, `cat: can't open '${a[0] ?? ""}': No such file or directory`);
    }
    case "setup-interfaces": {
      const old = netOf(h, v).ifs;
      say(c, `Available interfaces are: ${v.nics.map((_, i) => `eth${i}`).join(" ")}.\nEnter '?' for help on bridges, bonding and vlans.`);
      f.ask = { q: "pick", cfg: {}, old };
      return;
    }
    case "service":
    case "rc-service":
      return service(c, h, v, a[0], a[1]);
    case "rc-status":
      say(c, "Runlevel: default");
      for (const s of ["networking", "sshd", ...(v.role === "dhcp" ? ["dhcpd"] : [])]) say(c, ` ${s.padEnd(50)}[  ${(v.svc[s] ?? "started") === "started" ? "started" : "stopped"}  ]`);
      return;
    case "dhcpd": {
      if (v.role !== "dhcp") return fail(c, "-ash: dhcpd: not found");
      say(c, "Internet Systems Consortium DHCP Server 4.4.2-P1\nCopyright 2004-2021 Internet Systems Consortium.\nAll rights reserved.\nFor info, please visit https://www.isc.org/software/dhcp/");
      say(c, "Config file: /etc/dhcp/dhcpd.conf\nDatabase file: /var/lib/dhcp/dhcpd.leases\nPID file: /run/dhcp/dhcpd.pid");
      const p = parseConf(netOf(h, v).conf ?? []);
      if (p.err) return fail(c, p.err.join("\n"));
      if (!a.includes("-t")) tip(c, "dhcpd -t solo revisa el fichero; el servicio se arranca con service dhcpd restart.");
      return;
    }
    case "vi":
    case "nano":
      if (a[0] === "/boot/extlinux.conf") return extlinux(c, h, v, true);
      if (a[0] === "/etc/dhcp/dhcpd.conf" && netOf(h, v).conf) {
        const text = netOf(h, v).conf!;
        f.edit = { path: a[0], buf: [...text], dirty: false };
        c.fx.push({ k: "edit", vm: `vm:${v.pid}`, file: a[0], text: text.join("\n") });
        return say(c, `"${a[0]}" ${text.length}L, ${text.join("\n").length + 1}C (editor: cambia el texto y guarda con :wq; sin guardar, :q!)`, "dim");
      }
      if (a[0] === "/etc/network/interfaces") return tip(c, "Para la IP de la MV usa setup-interfaces: escribe este fichero por ti.");
      return tip(c, "Editor simulado solo para /boot/extlinux.conf.");
    case "sed":
      if (a.some((x) => x.includes("console=ttyS0")) && a.includes("/boot/extlinux.conf")) return fixTty(c, h, v);
      return fail(c, "sed: (simulador) solo entiendo el cambio de console=ttyS0 en /boot/extlinux.conf");
    case "!fix-ttyS0":
      return fixTty(c, h, v);
    case "ip":
      return guestIp(c, h, v, a);
    case "udhcpc":
      return udhcpc(c, h, v, a);
    case "ping":
      return ping(c, { h, v }, a.filter((x) => !x.startsWith("-") && !/^\d+$/.test(x)).pop() ?? "", count(a));
    case "wget":
    case "curl": {
      const url = a.find((x) => !x.startsWith("-")) ?? "";
      if (url.includes(REPO)) return say(c, "Connecting to www.ho.ac.uma.es... connected. (la MV llega al repositorio a través del NAT de QEMU)", "ok");
      if (/10\.0\.2\.2/.test(url) && v.nics.some((n) => n.kind === "user")) return fail(c, "wget: can't connect to remote host (10.0.2.2): Connection refused\n(en el servidor no hay ningún servidor web escuchando)");
      const t = target(c, /^(?:https?:\/\/)?([^/:]+)/.exec(url)?.[1] ?? "");
      if (t && t.v.role === "web" && reachable(c, h, v, t.n.ip!)) return page(c, name === "wget", [`vm:${v.pid}`, `br:${t.h.ip}:${t.n.br}`, `vm:${t.v.pid}`]);
      return fail(c, `wget: bad address '${url}'\n(en la VLAN 301 no hay salida a Internet)`);
    }
    case "ssh": {
      const dest = (a.filter((x, i) => !x.startsWith("-") && a[i - 1] !== "-p").pop() ?? "").replace(/^.*@/, "");
      if (dest === "10.0.2.2" && v.nics.some((n) => n.kind === "user")) {
        say(c, "root@10.0.2.2's password: ••••••••");
        say(c, "(estás en el servidor otra vez: la 10.0.2.2 es el host visto desde la red user)", "dim");
        c.lab.stack.push({ k: "server", ip: h.ip, via: "ssh", saved: h.cwd });
        h.cwd = "/root";
        c.fx.push({ k: "packet", path: [`vm:${v.pid}`, `nat:${v.pid}`, `srv:${h.ip}`] });
        c.lab.done.add("ssh-gw");
        return;
      }
      const hostBr = [...h.bridges.keys()].find((b) => bridgeIp(h, b) === dest);
      if (hostBr && v.nics.some((n) => n.br === hostBr && n.ip)) {
        say(c, `root@${dest}'s password: ••••••••`);
        c.lab.stack.push({ k: "server", ip: h.ip, via: "ssh", saved: h.cwd });
        h.cwd = "/root";
        c.fx.push({ k: "packet", path: [`vm:${v.pid}`, `br:${h.ip}:${hostBr}`, `srv:${h.ip}`] });
        c.lab.done.add("ssh-vm-host");
        return;
      }
      const t = target(c, dest);
      if (!t || t.v === v || !reachable(c, h, v, dest) || !isUp(t.v, c.now)) return fail(c, `ssh: connect to host ${dest} port 22: Host is unreachable`);
      say(c, `root@${dest}'s password: ••••••••`);
      say(c, "Welcome to Alpine!");
      c.lab.stack.push({ k: "vm", ip: t.h.ip, pid: t.v.pid, via: "ssh", to: dest });
      const mine = v.nics.find((n) => n.kind === "bridge" && sameNet(n.ip, dest));
      c.fx.push({ k: "packet", path: [`vm:${v.pid}`, ...(mine ? hops(c.lab, h, mine.br!, t.h, t.n.br!).path : [`br:${t.h.ip}:${t.n.br}`]), `vm:${t.v.pid}`] });
      c.lab.done.add("ssh-vm-vm");
      return;
    }
    case "lsblk":
    case "fdisk": {
      say(c, "NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT");
      say(c, `sda      8:0    0  ${gib(chain(h, v.disk).list[0].virt).padStart(4)}  0 disk`);
      say(c, "├─sda1   8:1    0  100M  0 part /boot");
      say(c, "└─sda3   8:3    0  7.4G  0 part /");
      let ide = 1;
      let vio = 0;
      for (const e of v.extra) {
        const img = real(h, e.path);
        const dev = e.iface === "virtio" ? `vd${"abcd"[vio++]}` : `sd${"abcd"[ide++]}`;
        say(c, `${dev.padEnd(6)} ${e.iface === "virtio" ? "252:0" : "8:16"}    0  ${gib(img?.virt ?? 1024).padStart(4)}  0 disk`);
        c.lab.done.add(`lsblk:${dev}`);
      }
      return;
    }
    case "mkfs.ext4":
      return say(c, `Creating filesystem with 262144 4k blocks and 65536 inodes\nWriting superblocks and filesystem accounting information: done`, "ok");
    case "mount":
      return a.length ? undefined : say(c, "/dev/sda3 on / type ext4 (rw,relatime)");
    case "echo":
      if (cmd.outFile === "/proc/sys/net/ipv4/ip_forward") {
        v.fwdOn = a[0] === "1";
        return;
      }
      return say(c, a.join(" "));
    case "sysctl":
      if (a.some((x) => x.includes("ip_forward=1"))) {
        v.fwdOn = true;
        return say(c, "net.ipv4.ip_forward = 1");
      }
      return say(c, `net.ipv4.ip_forward = ${v.fwdOn ? 1 : 0}`);
    case "grep": {
      const [pat, file] = a.filter((x) => !x.startsWith("-"));
      if (file !== "/var/log/messages") return fail(c, "grep: (simulador) prueba: grep dhcpd /var/log/messages en el servidor DHCP");
      const hits = v.log.filter((l) => l.includes(pat ?? ""));
      if (!hits.length) return void (c.ok = false);
      return say(c, hits.join("\n"));
    }
    case "poweroff":
    case "halt":
      if (a.includes("-f")) return kill(c, h, v, "(apagado inmediato: el guest no hace nada)");
      return shutdown(c, h, v);
    case "reboot":
      if (a.includes("-f")) {
        v.upAt = c.now + bootMs(v);
        say(c, "(reinicio inmediato)", "dim");
        if (f.via === "stdio" || f.via === "telnet") c.out.push(...bootLines(c, h, v, v.oneTty || ttyOf(h, v.disk)));
        return;
      }
      return reboot(c, h, v);
    case "exit":
    case "logout":
      if (f.via === "ssh") {
        say(c, `Connection to ${f.to ?? ipOfVm(v)} closed.`);
        c.lab.stack.pop();
        return;
      }
      if (c.lab.real) {
        v.logged = false;
        f.login = 1;
        say(c, "");
        return tip(c, "Has cerrado la sesión, pero sigues en la consola (login:). Para salir del telnet sin apagar la MV: Ctrl+] y quit.");
      }
      say(c, "");
      say(c, "localhost login: root");
      say(c, "Password: ");
      say(c, "Welcome to Alpine!");
      return tip(c, f.via === "telnet" ? "Para salir del telnet sin apagar la MV: Ctrl+] y quit." : "Para salir de la consola: Ctrl+A x la mata; poweroff la apaga bien.");
    case "ls":
      return say(c, a[0]?.includes("boot") ? "System.map-virt  config-virt  extlinux.conf  initramfs-virt  vmlinuz-virt" : a[0] === "/etc/init.d" ? `${v.role === "dhcp" ? "dhcpd  " : ""}networking  sshd  udhcpc` : "");
    default:
      return fail(c, `-ash: ${name}: not found`);
  }
}

function extlinux(c: Ctx, h: Host, v: Vm, edit: boolean) {
  const tty = v.oneTty ? ttyOf(h, v.disk) : ttyOf(h, v.disk);
  say(c, "DEFAULT menu.c32\nPROMPT 0\nMENU TITLE Alpine/Linux Boot Menu\nTIMEOUT 10\n\nLABEL virt\n  MENU LABEL Linux virt\n  LINUX vmlinuz-virt\n  INITRD initramfs-virt");
  say(c, `  APPEND root=UUID=${UUID} modules=sd-mod,usb-storage,ext4 quiet rootfstype=ext4${tty ? " console=ttyS0" : ""}`, tty ? "ok" : undefined);
  if (edit && !tty) c.out.push({ t: "ℹ Editor simulado: falta console=ttyS0 al final de la línea APPEND.", c: "info", act: { label: "Añadir console=ttyS0 y guardar (:wq)", cmd: "!fix-ttyS0" } });
  else if (edit) tip(c, "Ya tiene console=ttyS0. Sal con :q");
}

function fixTty(c: Ctx, h: Host, v: Vm) {
  const img = chain(h, v.disk).list[0];
  say(c, `"/boot/extlinux.conf" 11L, 312C written`, "ok");
  if (v.tmp) {
    v.oneTty = true;
    return tip(c, "Arrancaste con -snapshot: este cambio se perderá al apagar.");
  }
  img.tty = true;
  c.fx.push({ k: "flash", id: `disk:${h.ip}:${img.path}` });
  const kids = [...h.files.values()].filter((x) => x.backing && chain(h, x.path).list.includes(img) && x !== img && x.tty === undefined);
  if (img.kind === "base") {
    c.lab.done.add("tty-base");
    tip(c, kids.length ? `Lo has cambiado en la BASE: ${kids.map((k) => baseName(k.path)).join(", ")} lo heredan (leen de la base los bloques que no han tocado: copy-on-write).` : "Lo has cambiado en la base: los clones que crees a partir de ahora lo heredarán.");
  } else tip(c, `Lo has cambiado solo en ${baseName(img.path)}: va a su delta, la base y los demás clones no lo ven.`);
}

function guestIp(c: Ctx, h: Host, v: Vm, a: string[]) {
  const sub = a[0] ?? "a";
  if (sub === "addr" && a[1] === "add") {
    const [ip, , dev] = a.slice(2);
    const n = v.nics[+(dev ?? "eth0").replace("eth", "")];
    if (!n || !ip) return fail(c, "ip: can't find device");
    n.ip = ip.split("/")[0];
    return;
  }
  if (sub === "link") return;
  if (sub.startsWith("r")) {
    if (a[1] === "add") {
      const net = a[2];
      const via = a[a.indexOf("via") + 1];
      v.routes.push({ net: net === "default" ? "0.0.0.0/0" : net, via });
      return;
    }
    say(c, v.routes.map((r) => `${r.net === "0.0.0.0/0" ? "default" : r.net} via ${r.via}`).join("\n") || "");
    v.nics.forEach((n, i) => n.ip && say(c, `${n.ip.split(".").slice(0, 3).join(".")}.0/24 dev eth${i} scope link  src ${n.ip}`));
    return;
  }
  say(c, "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n    inet6 ::1/128 scope host");
  const cfg = netOf(h, v).ifs;
  v.nics.forEach((n, i) => {
    const up = !!n.ip || n.kind === "user" || ["dhcp", "static"].includes(cfg[`eth${i}`]?.type ?? "");
    say(c, up ? `${i + 2}: eth${i}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP qlen 1000` : `${i + 2}: eth${i}: <BROADCAST,MULTICAST> mtu 1500 qdisc noop state DOWN qlen 1000`);
    say(c, `    link/ether ${n.mac.toLowerCase()} brd ff:ff:ff:ff:ff:ff`);
    if (n.ip) say(c, `    inet ${n.ip}/24 scope global eth${i}`, "ok");
    if (up) say(c, `    inet6 ${eui64(n.mac)}/64 scope link`);
  });
  if (v.nics.some((n) => n.kind === "user")) tip(c, "Red user: la MV es 10.0.2.15, el host (gateway) 10.0.2.2 y el DNS 10.0.2.3.");
  v.nics.forEach((n, i) => {
    if (n.kind !== "bridge" || n.ip) return;
    if (!c.lab.real) return tip(c, `Esa interfaz del bridge no tiene IP: ¿estaba ya arrancado el servidor DHCP cuando arrancó esta MV? Prueba udhcpc -i eth${i}.`);
    if (cfg[`eth${i}`]?.type !== "dhcp") {
      c.lab.done.add("trap:eth1");
      return tip(c, `eth${i} no está en /etc/network/interfaces: no pide IP sola. udhcpc -i eth${i} (o setup-interfaces + service networking restart).`);
    }
    const near = lanOf(c.lab, h, n.br!).some((o) => serving(o.v));
    if (!near && c.lab.hosts.some((x) => x !== h && x.vms.some((y) => serving(y)))) c.lab.done.add("trap:vxlan");
    tip(c, `udhcpc sigue pidiendo IP en segundo plano por eth${i}, pero no contesta nadie: ¿dhcpd parado? ¿falta la VXLAN o el 8472/udp?`);
  });
  c.lab.done.add("ip-vm");
}

const eui64 = (mac: string) => {
  const b = mac.split(":").map((x) => parseInt(x, 16));
  return `fe80::${[(b[0] ^ 2) * 256 + b[1], b[2] * 256 + 0xff, 0xfe00 + b[3], b[4] * 256 + b[5]].map((x) => x.toString(16)).join(":")}`;
};
const count = (a: string[]) => (a.includes("-c") ? Math.max(1, Math.min(10, +a[a.indexOf("-c") + 1] || 4)) : 4);
const ifacesText = (n: Net) =>
  ["auto lo", "iface lo inet loopback", ...Object.entries(n.ifs).flatMap(([e, x]) => (x.type === "dhcp" ? ["", `auto ${e}`, `iface ${e} inet dhcp`] : x.type === "static" ? ["", `auto ${e}`, `iface ${e} inet static`, `        address ${x.addr}`, `        netmask ${x.mask}`, ...(x.gw ? [`        gateway ${x.gw}`] : [])] : []))].join("\n");

function udhcpc(c: Ctx, h: Host, v: Vm, a: string[]) {
  const dev = a.includes("-i") ? a[a.indexOf("-i") + 1] : "eth0";
  const n = v.nics[+(dev ?? "eth0").replace("eth", "")];
  if (!n) return fail(c, `udhcpc: SIOCGIFINDEX: No such device`);
  say(c, `udhcpc: started, v1.32.1`);
  if (n.kind === "user") {
    n.ip = "10.0.2.15";
    return say(c, "udhcpc: sending discover\nudhcpc: sending select for 10.0.2.15\nudhcpc: lease of 10.0.2.15 obtained, lease time 86400", "ok");
  }
  if (dhcpTry(c, h, v, n, a.includes("-b"))) c.lab.done.add("dhcp");
}

/** One udhcpc run on a bridge NIC (the same MAC gets the same IP back). */
function dhcpTry(c: Ctx, h: Host, v: Vm, n: Nic, bg: boolean) {
  const had = n.ip;
  n.ip = undefined;
  if (lease(c.lab, h, v, n, c.now, c.fx)) {
    say(c, `udhcpc: sending discover\nudhcpc: sending select for ${n.ip}\nudhcpc: lease of ${n.ip} obtained, lease time 600`, "ok", 400);
    return true;
  }
  n.ip = had;
  bounce(c.lab, h, n.br!, c.fx);
  c.fx.push({ k: "dora", stage: "discover", from: `vm:${v.pid}`, to: "", path: [`vm:${v.pid}`, `br:${h.ip}:${n.br}`], ip: "", lost: true });
  say(c, "udhcpc: sending discover\nudhcpc: sending discover\nudhcpc: sending discover", undefined, 600);
  if (bg) say(c, "udhcpc: no lease, forking to background", undefined, 1200);
  else fail(c, "udhcpc: no lease, failing");
  return false;
}

/** Can VM v reach `ip` (same LAN, across the overlay too, or one router hop with ip_forward)? */
function reachable(c: Ctx, h: Host, v: Vm, ip: string): boolean {
  const t = target(c, ip);
  if (t && v.nics.some((n) => n.kind === "bridge" && n.ip && sameNet(n.ip, ip) && segOf(c.lab, h.ip, n.br!) === segOf(c.lab, t.h.ip, t.n.br!))) return true;
  const route = v.routes.find((r) => r.net === "0.0.0.0/0" || sameNet(r.net.split("/")[0], ip));
  if (!route) return false;
  const router = h.vms.find((x) => x !== v && x.nics.some((n) => n.ip === route.via));
  return !!router && router.fwdOn && router.nics.some((n) => n.ip && sameNet(n.ip, ip));
}

function ping(c: Ctx, from: { h: Host; v?: Vm }, dest: string, n = 4) {
  const { h, v } = from;
  if (!dest) return fail(c, "ping: usage error: Destination address required");
  const ok = (path: string[], dup = false, far = false) => {
    say(c, `PING ${dest} (${dest}): 56 data bytes`);
    for (let i = 0; i < n; i++) say(c, `64 bytes from ${dest}: seq=${i} ttl=64 time=${far ? ["5.638", "1.204", "0.987", "1.112"][i % 4] : `0.${4 + (i % 6)}12`} ms${dup && i % 2 ? " (DUP!)" : ""}`, undefined, 300 * (i + 1));
    say(c, `--- ${dest} ping statistics ---\n${n} packets transmitted, ${n} packets received, 0% packet loss`, "ok", 300 * n + 100);
    c.fx.push({ k: "packet", path, tone: "ok" }, { k: "packet", path: [...path].reverse(), tone: "ok" });
  };
  const lost = (why?: string) => {
    say(c, `PING ${dest} (${dest}): 56 data bytes`);
    soft(c, `--- ${dest} ping statistics ---\n${n} packets transmitted, 0 packets received, 100% packet loss`, 300 * n + 100);
    if (why) tip(c, why);
  };
  if (!v) {
    if (dest === REPO) return ok([`srv:${h.ip}`, "repo"]);
    const other = findHost(c.lab, dest);
    if (other) return other.dead ? lost() : ok([`srv:${h.ip}`, `srv:${other.ip}`]);
    if (dest.startsWith("10.0.2.")) return lost("La red user (10.0.2.0/24) vive dentro de cada proceso QEMU: el host no la ve.");
    const t = target(c, dest);
    const br = t && [...h.bridges.keys()].find((b) => sameNet(bridgeIp(h, b), dest) && segOf(c.lab, h.ip, b) === segOf(c.lab, t.h.ip, t.n.br!));
    if (t && br && isUp(t.v, c.now)) return ok([`srv:${h.ip}`, ...hops(c.lab, h, br, t.h, t.n.br!).path, `vm:${t.v.pid}`]);
    return lost(/^\d+\.\d+\.\d+\.\d+$/.test(dest) && !dest.startsWith("10.") ? "La VLAN 301 de prácticas no tiene salida a Internet." : undefined);
  }
  const mine = v.nics.find((x) => x.kind === "bridge" && x.ip && sameNet(x.ip, dest));
  if (!mine && v.nics.some((x) => x.kind === "user") && (dest.startsWith("10.0.2.") || !/^10\.0\.0\.|^10\.0\.[1-9]\./.test(dest)))
    return lost(target(c, dest) ? `${vmName(h, v)} no tiene tarjeta en la LAN de ${dest} y nadie enruta hacia ella: el ping sale por la red user y se pierde.` : "La red user (SLiRP) no implementa ICMP: el ping no funciona, pero TCP sí (prueba ssh root@10.0.2.2).");
  const hostBr = [...h.bridges.keys()].find((b) => bridgeIp(h, b) === dest);
  if (hostBr && v.nics.some((x) => x.br === hostBr && x.ip)) return ok([`vm:${v.pid}`, `br:${h.ip}:${hostBr}`, `srv:${h.ip}`]);
  const t = target(c, dest);
  if (t && t.v !== v && isUp(t.v, c.now) && reachable(c, h, v, dest)) {
    const dup = t.h.vms.some((x) => x !== t.v && x.nics.some((y) => y.br === t.n.br && y.mac === t.n.mac));
    if (dup) tip(c, `Hay dos tarjetas con la MAC ${t.n.mac} en ${t.n.br}: los paquetes se duplican o se pierden. Cada NIC, su MAC.`);
    const way = mine ? hops(c.lab, h, mine.br!, t.h, t.n.br!) : { path: [`br:${h.ip}:${t.n.br}`], vni: undefined };
    c.lab.done.add(mine ? "ping-lan" : "ping-route");
    if (way.vni !== undefined) {
      c.lab.done.add("ping-tunnel").add(`ping-vni:${way.vni}`);
      c.fx.push({ k: "encap", vni: way.vni, from: h.ip, to: t.h.ip, ok: true });
    }
    return ok([`vm:${v.pid}`, ...way.path, `vm:${t.v.pid}`], dup, way.vni !== undefined);
  }
  if (v.nics.every((x) => !x.ip)) return lost("Esta MV no tiene IP en ninguna interfaz.");
  if (!mine && !v.routes.length && !v.nics.some((x) => x.kind === "user")) {
    if (v.nics.some((x) => x.kind === "bridge" && !x.ip)) c.lab.done.add("trap:eth1");
    say(c, `PING ${dest} (${dest}): 56 data bytes`);
    return soft(c, "ping: sendto: Network unreachable");
  }
  if (mine) bounce(c.lab, h, mine.br!, c.fx);
  lost();
}

/* ------------------------------------------------------------------ OpenRC, setup-interfaces and vi inside Alpine */

function service(c: Ctx, h: Host, v: Vm, name?: string, act?: string) {
  if (!name) return fail(c, "Usage: service <service> <start|stop|restart|status>");
  if (!["networking", "sshd", "udhcpc"].includes(name) && !(name === "dhcpd" && v.role === "dhcp")) return fail(c, ` * service: service \`${name}' does not exist`);
  if (!act || !["start", "stop", "restart", "status"].includes(act)) return fail(c, ` * ${name}: unknown function '${act ?? ""}'`);
  const st = name === "dhcpd" ? (v.svc.dhcpd ?? "started") : "started";
  if (act === "status") {
    return st === "started" ? say(c, " * status: started", "ok") : soft(c, " * status: stopped");
  }
  if (name === "networking") return networking(c, h, v, act);
  if (name !== "dhcpd") return say(c, [...(act !== "start" ? [rc(`Stopping ${name}`, true)] : []), ...(act !== "stop" ? [rc(`Starting ${name}`, true)] : [])].join("\n"));
  if (act === "start" && st === "started") return say(c, " * WARNING: dhcpd has already been started");
  if (st === "started") {
    say(c, rc("Stopping dhcpd", true));
    v.svc.dhcpd = "stopped";
    v.serves = undefined;
    c.fx.push({ k: "svc", vm: `vm:${v.pid}`, svc: "dhcpd", state: "stopped" });
  }
  if (act !== "stop") dhcpdUp(c, h, v);
}

/** dhcpd starting, as OpenRC prints it; the reasons of a failure go to /var/log/messages. */
function dhcpdUp(c: Ctx, h: Host, v: Vm) {
  if (!startDhcpd(c.lab, h, v, c.now, c.fx).length) return say(c, rc("Starting dhcpd", true), "ok");
  soft(c, `${rc("Starting dhcpd", false)}\n * ERROR: dhcpd failed to start`);
  tip(c, "El porqué está en el log: grep dhcpd /var/log/messages");
}

/** service networking: NICs down and up again with /etc/network/interfaces; it restarts only the dependents that were running. */
function networking(c: Ctx, h: Host, v: Vm, act: string) {
  const dep = v.role === "dhcp" && v.svc.dhcpd === "started";
  if (v.role === "dhcp" && !dep) c.lab.done.add("trap:networking");
  const cfg = netOf(h, v).ifs;
  const eths = v.nics.map((_, i) => `eth${i}`).filter((e) => cfg[e] && cfg[e].type !== "none");
  if (act !== "start") {
    say(c, " * WARNING: you are stopping a boot service", "warn");
    if (dep) {
      say(c, rc("Stopping dhcpd", true));
      v.svc.dhcpd = "stopped";
      v.serves = undefined;
    }
    say(c, [" * Stopping networking ...", rc("  lo", true), ...eths.map((e) => rc(`  ${e}`, true))].join("\n"));
    for (const n of v.nics) if (n.kind === "bridge") n.ip = undefined;
  }
  if (act === "stop") return;
  say(c, ` * Starting networking ...\n${rc("  lo", true)}`);
  v.nics.forEach((n, i) => {
    const k = cfg[`eth${i}`];
    if (n.kind !== "bridge" || !k || k.type === "none") return;
    if (k.type === "static") n.ip = k.addr;
    else dhcpTry(c, h, v, n, true);
    say(c, rc(`  eth${i}`, true));
  });
  if (dep) dhcpdUp(c, h, v);
}

const classMask = (ip: string) => (+ip.split(".")[0] < 128 ? "255.0.0.0" : +ip.split(".")[0] < 192 ? "255.255.0.0" : "255.255.255.0");
/** The current setup-interfaces question, with its default in brackets (what Enter accepts). */
function askText(v: Vm, a: Ask): string {
  const old = a.cur ? a.old[a.cur] : undefined;
  if (a.q === "pick") return `Which one do you want to initialize? (or '?' or 'done') [${v.nics.map((_, i) => `eth${i}`).find((e) => !a.cfg[e]) ?? "done"}]`;
  if (a.q === "ip") return `Ip address for ${a.cur}? (or 'dhcp', 'none', '?') [${old?.type === "static" ? old.addr : "dhcp"}]`;
  if (a.q === "mask") return `Netmask? [${classMask(a.addr!)}]`;
  if (a.q === "gw") return `Gateway? (or 'none') [${old?.type === "static" && old.gw ? old.gw : "none"}]`;
  return "Do you want to do any manual network configuration? (y/n) [n]";
}

function answer(c: Ctx, f: Frame, input: string) {
  const hit = vmOf(c.lab, f.pid);
  const a = f.ask!;
  if (!hit) return void (f.ask = undefined);
  const { h, v } = hit;
  const val = input.trim() || /\[([^\]]*)\]$/.exec(askText(v, a))?.[1] || "";
  const eths = v.nics.map((_, i) => `eth${i}`);
  const next = () => {
    a.cur = undefined;
    a.q = eths.every((e) => a.cfg[e]) ? "manual" : "pick";
  };
  if (val === "?") return say(c, "(simulador) responde a lo que pide: Intro acepta lo que sale entre corchetes.", "dim");
  if (a.q === "pick") {
    if (val === "done") return void (a.q = "manual");
    if (!eths.includes(val)) return say(c, `${val} is not a valid interface`, "err");
    a.cur = val;
    a.q = "ip";
    return;
  }
  if (a.q === "ip") {
    if (val === "dhcp" || val === "none") {
      a.cfg[a.cur!] = val === "dhcp" ? { type: "dhcp" } : { type: "none" };
      return next();
    }
    if (!isIp(val)) return say(c, `${val} is not a valid IPv4 address`, "err");
    a.addr = val;
    a.q = "mask";
    return;
  }
  if (a.q === "mask") {
    if (!isIp(val)) return say(c, `${val} is not a valid netmask`, "err");
    a.mask = val;
    a.q = "gw";
    return;
  }
  if (a.q === "gw") {
    const gw = val === "none" ? undefined : val;
    a.cfg[a.cur!] = { type: "static", addr: a.addr!, mask: a.mask!, gw };
    say(c, `Configuration for ${a.cur}:\n  type=static\n  address=${a.addr}\n  netmask=${a.mask}\n  gateway=${gw ?? ""}`);
    return next();
  }
  // writes /etc/network/interfaces with what was answered (and nothing else); applies nothing yet
  f.ask = undefined;
  setNet(h, v, { ...netOf(h, v), ifs: a.cfg });
  c.lab.done.add("setup-interfaces");
  for (const [e, x] of Object.entries(a.cfg))
    if (x.type === "static") {
      if (x.mask === "255.0.0.0") tip(c, `${e}: máscara 255.0.0.0 (la que propone por clase): una /8 que se pisa con la red de los KVM. Escribe la del enunciado (255.255.255.0).`);
      const old = a.old[e];
      if (x.gw && !inNet(x.gw, x.addr, x.mask)) tip(c, `${e}: la puerta de enlace ${x.gw} ni siquiera está en tu red (es la de la configuración vieja). Si no hay router: none.`);
      else if (x.gw && old?.type === "static" && x.gw === old.gw) tip(c, `${e}: la puerta de enlace ${x.gw} es la de la configuración vieja y en esta LAN no hay router. Si no hay router: none.`);
    }
  const lost = eths.filter((e) => !a.cfg[e] && a.old[e]);
  if (lost.length) tip(c, `No has configurado ${lost.join(", ")}: desaparece del fichero y, al reiniciar la red, se queda sin IP.`);
  tip(c, "setup-interfaces solo escribe /etc/network/interfaces: la tarjeta sigue con la IP vieja hasta service networking restart.");
}

/** vi: the UI edits the whole buffer; a multi-line input replaces it, then :wq / :w / :q / :q! as in vi. */
function editor(c: Ctx, f: Frame, input: string) {
  const hit = vmOf(c.lab, f.pid);
  const e = f.edit!;
  if (!hit) return void (f.edit = undefined);
  const lines = input.replace(/\r/g, "").split("\n");
  const last = lines[lines.length - 1].trim();
  const cmd = /^(:wq!?|:x|ZZ|:w!?|:q!?)$/.test(last) ? last : undefined;
  if (lines.length > 1) {
    e.buf = cmd ? lines.slice(0, -1) : lines;
    e.dirty = true;
  } else if (!cmd) return say(c, "(vi) cambia el texto en el editor y guarda con :wq; para salir sin guardar, :q!", "dim");
  if (!cmd) return;
  if (cmd === ":q" && e.dirty) return say(c, "E37: No write since last change (add ! to override)", "err");
  if (cmd.startsWith(":q")) return void (f.edit = undefined);
  const { h, v } = hit;
  if (e.path === "/etc/dhcp/dhcpd.conf") setNet(h, v, { ...netOf(h, v), conf: [...e.buf] });
  const text = e.buf.join("\n");
  say(c, `"${e.path}" ${e.buf.length}L, ${text.length + 1}C written`, "ok");
  c.fx.push({ k: "edit", vm: `vm:${v.pid}`, file: e.path, text, saved: true });
  c.lab.done.add(`edit:${e.path}`);
  e.dirty = false;
  if (!cmd.startsWith(":w") || cmd.startsWith(":wq")) f.edit = undefined;
}

function shutdown(c: Ctx, h: Host, v: Vm) {
  const tty = v.oneTty || ttyOf(h, v.disk);
  if (tty) {
    say(c, "The system is going down NOW!");
    say(c, " * Stopping sshd ...                                    [ ok ]", undefined, 300);
    say(c, "Sent SIGTERM to all processes", undefined, 600);
    say(c, " * Unmounting filesystems ...                          [ ok ]", undefined, 900);
    say(c, "reboot: Power down", undefined, 1200);
  } else say(c, "(pantalla negra unos segundos: los mensajes del apagado van a la pantalla gráfica)", "dim", 600);
  c.lab.done.add("poweroff-vm");
  const f = top(c.lab);
  const back = f.via === "stdio";
  removeVm(c, h, v);
  if (back) tip(c, "QEMU ha terminado: vuelves a la shell del servidor.");
}

function reboot(c: Ctx, h: Host, v: Vm) {
  const tty = v.oneTty || ttyOf(h, v.disk);
  say(c, "The system is going down NOW!");
  say(c, "reboot: Restarting system", undefined, 600);
  v.upAt = c.now + 900 + bootMs(v);
  for (const n of v.nics) if (n.kind === "bridge") [n.tried, n.ip] = [false, undefined];
  v.svc = {};
  v.serves = undefined;
  v.logged = false;
  c.out.push(...bootLines(c, h, v, tty, 900));
}

/* ------------------------------------------------------------------ the QEMU monitor */

function monitor(c: Ctx, h: Host, v: Vm, cmd: Cmd) {
  const [name, ...a] = cmd.argv;
  switch (name) {
    case "help":
    case "?":
      return say(c, "info status | info kvm | info cpus | info block | info network | stop | cont | system_powerdown | system_reset | savevm NOMBRE | loadvm NOMBRE | quit\nCtrl+A c vuelve a la consola de la MV.");
    case "info": {
      const what = a[0];
      if (what === "status") return say(c, `VM status: ${v.paused ? "paused" : "running"}`);
      if (what === "kvm") return say(c, `kvm support: ${v.kvm ? "enabled" : "disabled"}`);
      if (what === "name") return say(c, v.name ?? "");
      if (what === "cpus") return Array.from({ length: v.smp }, (_, i) => say(c, `${i ? " " : "*"} CPU #${i}: thread_id=${v.pid + 3 + i}`));
      if (what === "block") {
        const img = chain(h, v.disk).list[0];
        say(c, `ide0-hd0 (#block147): ${baseName(v.disk)} (${img.fmt})`);
        if (img.backing) say(c, `    Backing file:     ${img.bname} (chain depth: ${chain(h, v.disk).list.length - 1})`);
        v.extra.forEach((e, i) => say(c, `${e.iface === "virtio" ? "virtio0" : `ide0-hd${i + 1}`} (#block${300 + i}): ${baseName(e.path)} (qcow2)`));
        return;
      }
      if (what === "network")
        return v.nics.forEach((n, i) => {
          say(c, `${n.model}.${i}: index=0,type=nic,model=${n.model},macaddr=${n.mac.toLowerCase()}`);
          say(c, n.kind === "user" ? ` \\ ${n.id}: index=0,type=user,net=10.0.2.0,restrict=off${n.fwd.length ? `,hostfwd=${n.fwd.map((f) => `tcp::${f.host}-:${f.guest}`).join(",")}` : ""}` : ` \\ ${n.id}: index=0,type=tap,helper=/usr/libexec/qemu-bridge-helper,br=${n.br}`);
        });
      if (what === "snapshots") {
        const img = chain(h, v.disk).list[0];
        return say(c, img.snaps.length ? img.snaps.map((s) => s.name).join("\n") : "There is no snapshot available.");
      }
      return fail(c, "info: subcomando no simulado (status, kvm, cpus, block, network, snapshots)");
    }
    case "stop":
      v.paused = true;
      return;
    case "cont":
    case "c":
      v.paused = false;
      return;
    case "system_powerdown":
      c.lab.done.add("acpi");
      say(c, "(evento ACPI enviado: el guest se apaga ordenadamente)", "dim");
      return shutdown(c, h, v);
    case "system_reset":
      say(c, "(reset duro: como pulsar el botón de reinicio)", "dim");
      c.lab.stack.pop();
      return reboot(c, h, v);
    case "quit":
    case "q":
      return kill(c, h, v);
    case "savevm": {
      const img = chain(h, v.disk).list[0];
      img.snaps.push({ name: a[0] ?? "snap", used: img.used, tty: img.tty });
      return tip(c, "savevm guarda un checkpoint: RAM + estado de los dispositivos + discos, dentro del qcow2.");
    }
    case "loadvm":
    case "delvm":
      return;
    default:
      return fail(c, `unknown command: '${name}'`);
  }
}

/* ------------------------------------------------------------------ help */

function help(c: Ctx, where: "pc" | "server" | "vm") {
  const t: Record<typeof where, string> = {
    pc: "Tu PC: vpn · ssh root@10.0.16.173 (KVM1) · ssh root@10.0.16.174 (KVM2) · telnet IP PUERTO · curl http://IP:PUERTO",
    server: "Servidor: mkdir -p · cd · ls -l · wget · ln -s · qemu-img create|info|convert|commit|snapshot · qemu-system-x86_64 … · pgrep -a qemu · kill · jobs · fg · disown · firewall-cmd · nmcli · ip a · telnet · ssh · ping · exit",
    vm: "MV: ip a · udhcpc -i eth0 · ping · ssh · wget · lsblk · vi /boot/extlinux.conf · poweroff · reboot · Ctrl+A x (matar) · Ctrl+A c (monitor) · Ctrl+] (salir de telnet)",
  };
  say(c, t[where], "dim");
}
