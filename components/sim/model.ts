// Simulated lab for practices 1 and 2: your PC, the VPN, the KVM servers and their VMs, disks and networks.
// Pure logic, no DOM: the terminal prints what exec() returns and the 3D scene draws the state and plays the effects.

export type Kind = "pc" | "server" | "vm" | "monitor";
export type Via = "stdio" | "telnet" | "ssh" | "none";
export interface Frame {
  k: Kind;
  ip?: string;
  pid?: number;
  via?: Via;
  saved?: string; // the server's working directory before this SSH session
}
export type Role = "plain" | "web" | "dhcp";
export type Tone = "err" | "ok" | "dim" | "info" | "warn";
/** One terminal line. d: delay in ms from the command; act: a button that runs a command. */
export interface Line {
  t: string;
  c?: Tone;
  d?: number;
  act?: { label: string; cmd: string };
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
}
export interface Bridge {
  con: string;
  method: "manual" | "auto" | "disabled";
  ip?: string;
  slave?: string;
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
  open: Set<number>;
  perm: Set<number>;
  jobs: number[];
  cwd: string;
  alias: boolean;
  dead: boolean;
  cut: boolean;
  warned: boolean;
  dhcpLog: string[];
}
export type Fx =
  | { k: "packet"; path: string[]; tone?: "ok" | "err" | "data" | "dhcp" }
  | { k: "boot" | "gone" | "flash"; id: string }
  | { k: "boom"; ip: string };
export interface Lab {
  stack: Frame[];
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
    jobs: [],
    cwd: "/root",
    alias: false,
    dead: false,
    cut: false,
    warned: false,
    dhcpLog: [],
  };
}

export function newLab(): Lab {
  return { stack: [{ k: "pc" }], vpn: false, hosts: [newHost("10.0.16.173", "vm-16-173", "KVM1"), newHost("10.0.16.174", "vm-16-174", "KVM2")], nextPid: 4211, seq: 0, done: new Set() };
}

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

export const top = (lab: Lab) => lab.stack[lab.stack.length - 1];
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

/** Bring every VM up to date (DHCP leases once booted): call it before drawing or checking missions. */
export function refresh(lab: Lab, now: number) {
  for (const h of lab.hosts) for (const v of h.vms) ips(lab, h, v, now);
}

export function prompt(lab: Lab): string {
  const f = top(lab);
  if (f.k === "pc") return "PS C:\\Users\\alumno>";
  if (f.k === "monitor") return "(qemu)";
  const h = hostOf(lab, f.ip)!;
  if (f.k === "server") return `[root@${h.name} ${h.cwd === "/root" ? "~" : baseName(h.cwd) || "/"}]#`;
  if (lab.menu?.pid === f.pid) return "boot:";
  if (f.via === "none") return "";
  return "localhost:~#";
}

/** IPs of a VM's NICs; leases a bridge NIC from a DHCP VM the first time it is asked after booting. */
export function ips(lab: Lab, h: Host, v: Vm, now: number) {
  v.nics.forEach((n, i) => {
    if (n.ip || !isUp(v, now)) return;
    if (n.kind === "user") n.ip = "10.0.2.15";
    else if (v.role === "dhcp" && i === 0) n.ip = "10.0.0.253";
    else if (!n.tried) {
      n.tried = true;
      const srv = dhcpOn(h, n.br, v.upAt - 600);
      if (srv) give(h, n, srv);
    }
  });
  return v.nics.map((n) => n.ip);
}
const dhcpOn = (h: Host, br: string | undefined, at: number) => h.vms.find((x) => x.role === "dhcp" && x.nics[0]?.kind === "bridge" && x.nics[0].br === br && !x.stopped && x.upAt <= at);
function give(h: Host, n: Nic, srv: Vm) {
  const used = new Set(h.vms.flatMap((x) => x.nics.map((y) => y.ip)));
  let k = 100;
  while (used.has(`10.0.0.${k}`)) k++;
  n.ip = `10.0.0.${k}`;
  const mac = n.mac.toLowerCase();
  h.dhcpLog.push(`dhcpd: DHCPDISCOVER from ${mac} via eth0`, `dhcpd: DHCPOFFER on ${n.ip} to ${mac} via eth0`, `dhcpd: DHCPREQUEST for ${n.ip} (10.0.0.253) from ${mac} via eth0`, `dhcpd: DHCPACK on ${n.ip} to ${mac} via eth0`);
  void srv;
}
const sameNet = (a?: string, b?: string) => !!a && !!b && a.split(".").slice(0, 3).join(".") === b.split(".").slice(0, 3).join(".");
const bridgeIp = (h: Host, br?: string) => {
  const b = br ? h.bridges.get(br) : undefined;
  if (!b) return undefined;
  if (b.method === "manual") return b.ip?.split("/")[0];
  if (b.method === "auto") return dhcpOn(h, br, Infinity) ? (b.ip ??= "10.0.0.150/24").split("/")[0] : undefined;
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
const say = (c: Ctx, t: string, tone?: Tone, d?: number) => c.out.push({ t, c: tone, d });
const fail = (c: Ctx, t: string) => {
  say(c, t, "err");
  c.ok = false;
};
const tip = (c: Ctx, t: string) => say(c, `ℹ ${t}`, "info");

/** Run what the user typed (one or more lines). Mutates the lab. */
export function exec(lab: Lab, input: string, now: number): { out: Line[]; fx: Fx[] } {
  const c: Ctx = { lab, out: [], fx: [], now, ok: true };
  const key = keyOf(input.trim());
  if (key) {
    special(c, key);
    return { out: c.out, fx: c.fx };
  }
  if (lab.menu) {
    menuInput(c, input);
    return { out: c.out, fx: c.fx };
  }
  const lines = joinLoops(input.replace(/\\\r?\n/g, " ").split(/\r?\n/));
  for (const l of lines) runLine(c, l);
  return { out: c.out, fx: c.fx };
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
  if (key === "]") {
    if (f.via !== "telnet") return tip(c, "Ctrl+] es la tecla de escape de telnet; aquí no estás en telnet.");
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
  const at = c.lab.stack.findIndex((f) => f.pid === v.pid);
  if (at >= 0) {
    const via = c.lab.stack[at].via;
    c.lab.stack.splice(at);
    if (via === "telnet") say(c, "Connection closed by foreign host.");
    if (via === "ssh") say(c, `Connection to ${ipOfVm(v)} closed by remote host.`);
  }
}
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
    if (v.role === "dhcp") L.push({ t: " * Starting dhcpd ...                                   [ ok ]", d: at(2400) });
    L.push({ t: " * Starting sshd ...                                    [ ok ]", d: at(2800) });
  } else L.push({ t: "(pantalla negra: el kernel escribe sus mensajes en la pantalla gráfica, que con -nographic no existe)", c: "dim", d: at(700) });
  L.push(
    { t: "", d: at(3300) },
    { t: "Welcome to Alpine Linux 3.13", d: at(3300) },
    { t: "Kernel 5.10.43-0-virt on an x86_64 (/dev/ttyS0)", d: at(3300) },
    { t: "", d: at(3300) },
    { t: "localhost login: root", d: at(3400) },
    { t: "Password: ", d: at(3500) },
    { t: "Welcome to Alpine!", d: at(3600) },
  );
  void c;
  void h;
  return L;
}
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
        const users = [...h.files.values()].filter((y) => y.backing && real(h, y.backing) === undefined);
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
      return ping(c, { h }, a.filter((x) => !x.startsWith("-") && !/^\d+$/.test(x)).pop() ?? "");
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
  "alpine-dhcp.qcow2": { role: "dhcp", used: 318720 },
};

function wget(c: Ctx, h: Host, url: string) {
  const u = url.replace(/^https?:\/\//, "");
  const [hostPart, ...rest] = u.split("/");
  const path = "/" + rest.join("/");
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(hostPart) || hostPart.startsWith(h.ip)) return web(c, url, "server", h, true);
  if (hostPart !== REPO) return fail(c, `--2026-11-02 10:15:23--  http://${u}\nResolving ${hostPart} (${hostPart})... failed: Name or service not known.\nwget: unable to resolve host address ‘${hostPart}’`);
  const file = baseName(path);
  const img = path.startsWith(REPO_PATH) ? IMAGES[file] : undefined;
  say(c, `--2026-11-02 10:15:23--  http://${REPO}${path}`);
  say(c, `Connecting to ${REPO} (${REPO})|:80... connected.`);
  if (!img) return fail(c, "HTTP request sent, awaiting response... 404 Not Found\n2026-11-02 10:15:23 ERROR 404: Not Found.");
  let name = file;
  for (let k = 1; h.files.has(`${h.cwd}/${name}`); k++) name = `${file}.${k}`;
  const at = `${h.cwd}/${name}`;
  say(c, "HTTP request sent, awaiting response... 200 OK");
  say(c, `Length: ${img.used * 1024} (${kib(img.used)}) [application/octet-stream]`);
  say(c, `Saving to: ‘${name}’`);
  say(c, `${name.padEnd(24)}100%[===================>] ${kib(img.used).padStart(8)}  94,2MB/s    in 3,1s`, undefined, 900);
  say(c, `2026-11-02 10:15:26 (94,2 MB/s) - ‘${name}’ saved [${img.used * 1024}/${img.used * 1024}]`, "ok", 1000);
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
  if (/^r/.test(sub)) return say(c, `default via 10.0.16.1 dev ens32 proto static metric 100\n10.0.16.0/24 dev ens32 proto kernel scope link src ${h.ip} metric 100${[...h.bridges].map(([b]) => (bridgeIp(h, b) ? `\n10.0.0.0/24 dev ${b} proto kernel scope link src ${bridgeIp(h, b)}` : "")).join("")}`);
  const only = a.includes("show") ? a[a.indexOf("show") + 1] === "dev" ? a[a.indexOf("show") + 2] : a[a.indexOf("show") + 1] : undefined;
  taps(h);
  const rows: [string, string, string?][] = [
    ["lo", "<LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN", "inet 127.0.0.1/8 scope host lo"],
    ["ens32", "<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP", `inet ${h.ip}/24 brd 10.0.16.255 scope global noprefixroute ens32`],
    ["ens33", `<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel ${[...h.bridges.values()].some((b) => b.slave === "ens33") ? "master br1 " : ""}state UP`],
    ["virbr0", "<NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN", "inet 192.168.122.1/24 brd 192.168.122.255 scope global virbr0"],
  ];
  for (const [b] of h.bridges) {
    const members = h.vms.some((v) => v.nics.some((n) => n.br === b));
    const ip = bridgeIp(h, b);
    rows.push([b, members ? "<BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP" : "<NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN", ip ? `inet ${ip}/24 brd 10.0.0.255 scope global noprefixroute ${b}` : undefined]);
  }
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
    const type = opt("type");
    const ifname = opt("ifname");
    if (type === "bridge-slave" || (type === "ethernet" && opt("master"))) {
      const br = h.bridges.get(opt("master") ?? "");
      if (!br) return fail(c, "Error: master bridge not found.");
      if (ifname === "ens32") {
        br.slave = "ens32";
        h.cut = true;
        say(c, `Connection 'bridge-slave-ens32' successfully added.`);
        fail(c, "client_loop: send disconnect: Connection reset");
        tip(c, "Has metido ens32 en el bridge: es la interfaz por la que entras por SSH y la acabas de perder. En el examen, solo el profesor podría arreglarlo.");
        c.lab.stack.splice(c.lab.stack.findIndex((f) => f.ip === h.ip));
        c.fx.push({ k: "boom", ip: h.ip });
        return;
      }
      br.slave = ifname;
      say(c, `Connection 'bridge-slave-${ifname}' successfully added.`);
      return tip(c, `Ahora ${opt("master")} tiene una NIC real (${ifname}): las MVs salen a esa red con su propia MAC. Eso es el modo bridged.`);
    }
    if (type !== "bridge") return fail(c, `Error: invalid or not allowed setting 'type': '${type ?? ""}'`);
    if (!ifname) return fail(c, "Error: 'ifname' argument is required.");
    if (h.bridges.has(ifname)) return fail(c, `Error: Failed to add '${opt("con-name") ?? ifname}' connection: connection.interface-name: '${ifname}' ya existe. Bórralo antes o modifícalo con nmcli device modify.`);
    const method = (opt("ipv4.method") ?? "auto") as Bridge["method"];
    const ip = opt("ipv4.addresses");
    h.bridges.set(ifname, { con: opt("con-name") ?? `bridge-${ifname}`, method, ip: method === "manual" ? ip : undefined });
    say(c, `Connection '${opt("con-name") ?? `bridge-${ifname}`}' (6f1a7c2e-${(++c.lab.seq).toString(16).padStart(4, "0")}-4c1e-9d2b-${ifname}a1b2c3) successfully added.`, "ok");
    c.fx.push({ k: "boot", id: `br:${h.ip}:${ifname}` });
    c.lab.done.add(`bridge:${ifname}`);
    if (method === "auto") tip(c, "Con ipv4.method auto el host pedirá IP por DHCP en el bridge (nmcli device show br1). En la práctica se usa manual con 10.0.0.1/24.");
    return;
  }
  if (isCon && (verb === "delete" || verb === "del")) {
    const name = rest[0];
    const hit = [...h.bridges].find(([, b]) => b.con === name);
    if (!hit) return fail(c, `Error: unknown connection '${name ?? ""}'.\nError: cannot delete unknown connection(s): '${name ?? ""}'.`);
    h.bridges.delete(hit[0]);
    c.fx.push({ k: "gone", id: `br:${h.ip}:${hit[0]}` });
    say(c, `Connection '${name}' (6f1a7c2e-…) successfully deleted.`, "ok");
    c.lab.done.add("clean-con");
    return;
  }
  if (isCon && (verb === "show" || !verb)) {
    say(c, "NAME     UUID                                  TYPE      DEVICE");
    say(c, "ens32    0c63b5a8-2bd3-4c0e-9f07-3d1c5f0b7a11  ethernet  ens32");
    say(c, "ens33    4f2e9a10-7b7c-4a43-8d2a-61f0c2b1d5e9  ethernet  ens33");
    for (const [b, x] of h.bridges) say(c, `${x.con.padEnd(8)} 6f1a7c2e-…                            bridge    ${b}`);
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
    say(c, "virbr0  bridge    connected (externally)                 virbr0");
    return;
  }
  return fail(c, "Error: argumento no simulado. Prueba nmcli connection add|show|delete o nmcli device show|modify|delete.");
}

function firewall(c: Ctx, h: Host, a: string[]) {
  const perm = a.includes("--permanent");
  const set = perm ? h.perm : h.open;
  const arg = (k: string) => a.find((x) => x.startsWith(k))?.split("=")[1];
  const add = arg("--add-port");
  const rem = arg("--remove-port");
  if (a.some((x) => /^[–—]/.test(x) || x.includes("–"))) return fail(c, "usage: see firewall-cmd man page\nfirewall-cmd: error: unrecognized arguments (¿guion largo copiado del PDF?)");
  if (add) {
    const port = parseInt(add, 10);
    if (set.has(port)) say(c, `Warning: ALREADY_ENABLED: ${add}`);
    set.add(port);
    say(c, "success", "ok");
    if (!perm) {
      c.fx.push({ k: "flash", id: `fw:${h.ip}:${port}` });
      c.lab.done.add(`fw:${port}`);
    } else tip(c, "Con --permanent se guarda para el próximo arranque, pero NO se aplica ahora: repite el comando sin --permanent.");
    return;
  }
  if (rem) {
    set.delete(parseInt(rem, 10));
    c.fx.push({ k: "gone", id: `fw:${h.ip}:${parseInt(rem, 10)}` });
    return say(c, "success", "ok");
  }
  if (a.includes("--list-ports")) return say(c, [...set].map((p) => `${p}/tcp`).join(" "));
  if (a.includes("--list-all")) return say(c, `public (active)\n  target: default\n  interfaces: ens32 ens33\n  services: cockpit dhcpv6-client ssh\n  ports: ${[...set].map((p) => `${p}/tcp`).join(" ")}`);
  if (a.includes("--reload")) {
    h.open = new Set(h.perm);
    return say(c, "success", "ok");
  }
  if (a.includes("--state")) return say(c, "running");
  return fail(c, "usage: firewall-cmd --add-port=PUERTO/tcp [--permanent] | --remove-port=… | --list-ports");
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
  c.lab.stack.splice(c.lab.stack.findIndex((f) => f.ip === h.ip));
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
      if (deep && ch.broken) fail(c, `qemu-img: Could not open '${ch.broken}': No such file or directory`);
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
        if (NIC_MODELS.includes(model)) spec.devices.push({ ...kv(more.join(",")), model });
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
  if (ch.broken) return fail(c, `qemu-system-x86_64: Could not open backing file: Could not open '${baseName(ch.broken)}': No such file or directory`);
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
    if (!d.netdev || !nd) return fail(c, `qemu-system-x86_64: -device ${d.model},netdev=${d.netdev ?? ""}${d.mac ? `,mac=${d.mac}` : ""}: Property '${d.model}.netdev' can't find value '${d.netdev ?? ""}'`);
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
      if (h.vms.some((v) => v.nics.some((x) => x.fwd.some((y) => y.host === f.host)))) return fail(c, `qemu-system-x86_64: -netdev user,id=${n.id},hostfwd=tcp::${f.host}-:${f.guest}: Could not set up host forwarding rule 'tcp::${f.host}-:${f.guest}'`);
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
  };
  h.vms.push(v);
  taps(h);
  c.fx.push({ k: "boot", id: `vm:${pid}` });
  for (const n of nics) if (n.kind === "bridge") c.fx.push({ k: "packet", path: [`vm:${pid}`, `br:${h.ip}:${n.br}`], tone: "ok" });
  if (!spec.kvm) tip(c, "Sin --enable-kvm QEMU emula la CPU con TCG (traducción binaria): funciona, pero mucho más lento.");
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
  c.lab.stack.push({ k: "vm", ip: h.ip, pid: v.pid, via: "telnet" });
  c.fx.push({ k: "packet", path: from === "pc" ? ["pc", "vpn", `fw:${h.ip}:${port}`, `vm:${v.pid}`] : [`srv:${h.ip}`, `vm:${v.pid}`] });
  c.lab.done.add(`telnet-${from}`);
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
    fail(c, `ssh: connect to host ${h.ip} port ${port}: No route to host`);
    return tip(c, `Desde fuera, el firewall tiene que dejar pasar el ${port}: firewall-cmd --add-port=${port}/tcp.`);
  }
  if (!v || !isUp(v, c.now)) return fail(c, `ssh: connect to host ${from === "pc" ? h.ip : "localhost"} port ${port}: Connection refused`);
  say(c, `root@${from === "pc" ? h.ip : "localhost"}'s password: ••••••••`);
  say(c, "Welcome to Alpine!");
  c.lab.stack.push({ k: "vm", ip: h.ip, pid: v.pid, via: "ssh" });
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
  const t = target(c, h, dest);
  const myIp = (() => {
    for (const [b] of h.bridges) if (sameNet(bridgeIp(h, b), dest)) return bridgeIp(h, b);
    return undefined;
  })();
  if (!t || !myIp || !isUp(t.v, c.now)) return fail(c, `ssh: connect to host ${dest} port 22: No route to host`);
  say(c, `root@${dest}'s password: ••••••••`);
  say(c, "Welcome to Alpine!");
  c.lab.stack.push({ k: "vm", ip: h.ip, pid: t.v.pid, via: "ssh" });
  c.fx.push({ k: "packet", path: [`srv:${h.ip}`, `br:${h.ip}:${t.n.br}`, `vm:${t.v.pid}`] });
  c.lab.done.add("ssh-bridge");
}

/** The VM NIC that owns an IP on this host. */
function target(c: Ctx, h: Host, ip: string) {
  for (const v of h.vms) {
    ips(c.lab, h, v, c.now);
    const n = v.nics.find((x) => x.kind === "bridge" && x.ip === ip);
    if (n) return { v, n };
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
    const t = h ? target(c, h, host) : undefined;
    if (t && t.v.role === "web" && port === 80 && isUp(t.v, c.now)) return page(c, save, [`srv:${h!.ip}`, `br:${h!.ip}:${t.n.br}`, `vm:${t.v.pid}`]);
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
  ips(c.lab, h, v, c.now);
  switch (name) {
    case "help":
      return help(c, "vm");
    case "hostname":
      return say(c, "localhost");
    case "whoami":
      return say(c, "root");
    case "uname":
      return say(c, "Linux localhost 5.10.43-0-virt #1-Alpine SMP x86_64 Linux");
    case "cat":
      if (a[0] === "/etc/os-release") return say(c, 'NAME="Alpine Linux"\nVERSION_ID=3.13.5');
      if (a[0] === "/boot/extlinux.conf") return extlinux(c, h, v, false);
      if (a[0] === "/proc/sys/net/ipv4/ip_forward") return say(c, v.fwdOn ? "1" : "0");
      return fail(c, `cat: can't open '${a[0] ?? ""}': No such file or directory`);
    case "vi":
    case "nano":
      if (a[0] === "/boot/extlinux.conf") return extlinux(c, h, v, true);
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
      return ping(c, { h, v }, a.filter((x) => !x.startsWith("-") && !/^\d+$/.test(x)).pop() ?? "");
    case "wget":
    case "curl": {
      const url = a.find((x) => !x.startsWith("-")) ?? "";
      if (url.includes(REPO)) return say(c, "Connecting to www.ho.ac.uma.es... connected. (la MV llega al repositorio a través del NAT de QEMU)", "ok");
      if (/10\.0\.2\.2/.test(url) && v.nics.some((n) => n.kind === "user")) return fail(c, "wget: can't connect to remote host (10.0.2.2): Connection refused\n(en el servidor no hay ningún servidor web escuchando)");
      const t = target(c, h, /^(?:https?:\/\/)?([^/:]+)/.exec(url)?.[1] ?? "");
      if (t && t.v.role === "web" && reachable(c, h, v, t.n.ip!)) return page(c, name === "wget", [`vm:${v.pid}`, `br:${h.ip}:${t.n.br}`, `vm:${t.v.pid}`]);
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
      const t = target(c, h, dest);
      if (!t || t.v === v || !reachable(c, h, v, dest) || !isUp(t.v, c.now)) return fail(c, `ssh: connect to host ${dest} port 22: Host is unreachable`);
      say(c, `root@${dest}'s password: ••••••••`);
      say(c, "Welcome to Alpine!");
      c.lab.stack.push({ k: "vm", ip: h.ip, pid: t.v.pid, via: "ssh" });
      c.fx.push({ k: "packet", path: [`vm:${v.pid}`, `br:${h.ip}:${t.n.br}`, `vm:${t.v.pid}`] });
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
    case "grep":
      if (v.role === "dhcp" && a.includes("dhcpd")) return h.dhcpLog.length ? h.dhcpLog.forEach((l) => say(c, `Nov  2 10:3${Math.min(9, h.dhcpLog.indexOf(l))}:12 localhost daemon.info ${l}`)) : say(c, "(todavía no ha repartido ninguna IP)", "dim");
      return fail(c, "grep: (simulador) prueba: grep dhcpd /var/log/messages en el servidor DHCP");
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
        say(c, `Connection to ${ipOfVm(v)} closed.`);
        c.lab.stack.pop();
        return;
      }
      say(c, "");
      say(c, "localhost login: root");
      say(c, "Password: ");
      say(c, "Welcome to Alpine!");
      return tip(c, f.via === "telnet" ? "Para salir del telnet sin apagar la MV: Ctrl+] y quit." : "Para salir de la consola: Ctrl+A x la mata; poweroff la apaga bien.");
    case "ls":
      return say(c, a[0]?.includes("boot") ? "System.map-virt  config-virt  extlinux.conf  initramfs-virt  vmlinuz-virt" : "");
    case "rc-service":
    case "service":
      return say(c, ` * status: started`, "ok");
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
  say(c, "1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000\n    inet 127.0.0.1/8 scope host lo");
  v.nics.forEach((n, i) => {
    say(c, `${i + 2}: eth${i}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc pfifo_fast state UP qlen 1000`);
    say(c, `    link/ether ${n.mac.toLowerCase()} brd ff:ff:ff:ff:ff:ff`);
    if (n.ip) say(c, `    inet ${n.ip}/24 scope global eth${i}`, "ok");
  });
  if (v.nics.some((n) => n.kind === "user")) tip(c, "Red user: la MV es 10.0.2.15, el host (gateway) 10.0.2.2 y el DNS 10.0.2.3.");
  if (v.nics.some((n) => n.kind === "bridge" && !n.ip)) tip(c, "Esa interfaz del bridge no tiene IP: ¿estaba ya arrancado el servidor DHCP cuando arrancó esta MV? Prueba udhcpc -i eth0.");
  c.lab.done.add("ip-vm");
}

function udhcpc(c: Ctx, h: Host, v: Vm, a: string[]) {
  const dev = a.includes("-i") ? a[a.indexOf("-i") + 1] : "eth0";
  const n = v.nics[+(dev ?? "eth0").replace("eth", "")];
  if (!n) return fail(c, `udhcpc: SIOCGIFINDEX: No such device`);
  say(c, `udhcpc: started, v1.32.1`);
  if (n.kind === "user") {
    n.ip = "10.0.2.15";
    return say(c, "udhcpc: sending discover\nudhcpc: sending select for 10.0.2.15\nudhcpc: lease of 10.0.2.15 obtained, lease time 86400", "ok");
  }
  const srv = dhcpOn(h, n.br, c.now);
  if (!srv || srv === v) return fail(c, "udhcpc: sending discover\nudhcpc: sending discover\nudhcpc: sending discover\nudhcpc: no lease, failing");
  if (!n.ip) give(h, n, srv);
  say(c, `udhcpc: sending discover\nudhcpc: sending select for ${n.ip}\nudhcpc: lease of ${n.ip} obtained, lease time 600`, "ok");
  c.fx.push({ k: "packet", path: [`vm:${v.pid}`, `br:${h.ip}:${n.br}`, `vm:${srv.pid}`], tone: "dhcp" }, { k: "packet", path: [`vm:${srv.pid}`, `br:${h.ip}:${n.br}`, `vm:${v.pid}`], tone: "dhcp" });
  c.lab.done.add("dhcp");
}

/** Can VM v reach `ip` on one of the host's bridges (same LAN, or one router hop with ip_forward)? */
function reachable(c: Ctx, h: Host, v: Vm, ip: string): boolean {
  for (const n of v.nics) if (n.kind === "bridge" && n.ip && sameNet(n.ip, ip)) return true;
  const route = v.routes.find((r) => r.net === "0.0.0.0/0" || sameNet(r.net.split("/")[0], ip));
  if (!route) return false;
  const router = h.vms.find((x) => x !== v && x.nics.some((n) => n.ip === route.via));
  return !!router && router.fwdOn && router.nics.some((n) => n.ip && sameNet(n.ip, ip));
}

function ping(c: Ctx, from: { h: Host; v?: Vm }, dest: string) {
  const { h, v } = from;
  if (!dest) return fail(c, "ping: usage error: Destination address required");
  const ok = (path: string[], n = 4, dup = false) => {
    say(c, `PING ${dest} (${dest}): 56 data bytes`);
    for (let i = 0; i < n; i++) say(c, `64 bytes from ${dest}: seq=${i} ttl=64 time=0.${4 + i}12 ms${dup && i % 2 ? " (DUP!)" : ""}`, undefined, 300 * (i + 1));
    say(c, `--- ${dest} ping statistics ---\n${n} packets transmitted, ${n} packets received, 0% packet loss`, "ok", 300 * n + 100);
    c.fx.push({ k: "packet", path, tone: "ok" }, { k: "packet", path: [...path].reverse(), tone: "ok" });
  };
  const lost = (why?: string) => {
    say(c, `PING ${dest} (${dest}): 56 data bytes`);
    say(c, `--- ${dest} ping statistics ---\n4 packets transmitted, 0 packets received, 100% packet loss`, "err", 1300);
    c.ok = false;
    if (why) tip(c, why);
  };
  if (!v) {
    if (dest === REPO) return ok([`srv:${h.ip}`, "repo"]);
    const other = findHost(c.lab, dest);
    if (other) return other.dead ? lost() : ok([`srv:${h.ip}`, `srv:${other.ip}`]);
    if (dest.startsWith("10.0.2.")) return lost("La red user (10.0.2.0/24) vive dentro de cada proceso QEMU: el host no la ve.");
    const t = target(c, h, dest);
    const viaBr = t && [...h.bridges.keys()].some((b) => b === t.n.br && sameNet(bridgeIp(h, b), dest));
    if (t && viaBr && isUp(t.v, c.now)) return ok([`srv:${h.ip}`, `br:${h.ip}:${t.n.br}`, `vm:${t.v.pid}`]);
    return lost(/^\d+\.\d+\.\d+\.\d+$/.test(dest) && !dest.startsWith("10.") ? "La VLAN 301 de prácticas no tiene salida a Internet." : undefined);
  }
  if (v.nics.some((n) => n.kind === "user") && (dest.startsWith("10.0.2.") || !/^10\.0\.0\.|^10\.0\.[1-9]\./.test(dest))) return lost("La red user (SLiRP) no implementa ICMP: el ping no funciona, pero TCP sí (prueba ssh root@10.0.2.2).");
  const hostBr = [...h.bridges.keys()].find((b) => bridgeIp(h, b) === dest);
  if (hostBr && v.nics.some((n) => n.br === hostBr && n.ip)) return ok([`vm:${v.pid}`, `br:${h.ip}:${hostBr}`, `srv:${h.ip}`]);
  const t = target(c, h, dest);
  if (t && t.v !== v && isUp(t.v, c.now) && reachable(c, h, v, dest)) {
    const dup = h.vms.some((x) => x !== t.v && x.nics.some((n) => n.br === t.n.br && n.mac === t.n.mac));
    if (dup) tip(c, `Hay dos tarjetas con la MAC ${t.n.mac} en ${t.n.br}: los paquetes se duplican o se pierden. Cada NIC, su MAC.`);
    c.lab.done.add(v.nics.some((n) => sameNet(n.ip, dest)) ? "ping-lan" : "ping-route");
    return ok([`vm:${v.pid}`, `br:${h.ip}:${t.n.br}`, `vm:${t.v.pid}`], 4, dup);
  }
  if (v.nics.every((n) => !n.ip)) return lost("Esta MV no tiene IP en ninguna interfaz.");
  lost();
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
  v.nics.forEach((n) => n.kind === "bridge" && v.role !== "dhcp" && ((n.tried = false), (n.ip = undefined)));
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
