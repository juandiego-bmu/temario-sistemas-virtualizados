"use client";

// The two 2026 labs as a game: ▶ Ver la partida (the real script, typed and explained), 🎮 Jugar (only the goal, a hint
// ladder, score and achievements) and 🗺️ Mapa (the finished topology: click any piece or either end of a link for its command).
import * as React from "react";
import { ACHIEVEMENTS, cmdAt, finalLab, hintCmds, nicArgs, planCheck, trapFixed, type Cmd, type LabDef, type Piece, type PlanCard, type Trap } from "./labs";
import { cloneLab, editing, exec, hostOf, prompt, refresh, top, vmOf, vmName, type Lab, type Line, type Term } from "./model";
import type { Hotel } from "./hotel";

type Mode = "inicio" | "ver" | "jugar" | "mapa";
interface Row {
  t: string;
  c?: string;
  cmd?: boolean;
  sep?: boolean;
}
type Rows = Record<Term, Row[]>;
interface Cap {
  kind: "step" | "trap" | "lesson" | "rewind";
  i: number;
  trap?: Trap;
}
interface ViLine {
  t: string;
  s?: "del" | "add" | "gone";
}
interface ViView {
  term: Term;
  path: string;
  lines: ViLine[];
  cmd: string;
}
interface Score {
  t0: number;
  hints: number;
  errors: number;
  unlocked: Set<string>;
  done: boolean[];
  plan: number; // Planifica attempts
  seen: boolean; // Planifica opened by itself once
  over: boolean;
  end?: number;
}
class Stop extends Error {}

const TERMS: Term[] = ["kvm1", "kvm2", "pc"];
const TINFO: Record<Term, { name: string; col: string }> = { kvm1: { name: "KVM1", col: "#9b7bff" }, kvm2: { name: "KVM2", col: "#58a6ff" }, pc: { name: "Tu PC", col: "#3fd6ff" } };
const MODES: [Exclude<Mode, "inicio">, string, string][] = [
  ["ver", "▶", "Ver la partida"],
  ["jugar", "🎮", "Jugar"],
  ["mapa", "🗺️", "Mapa"],
];
const KIND: Record<Piece["kind"], string> = { tower: "Servidor", bridge: "Bridge", gate: "Firewall", vxlan: "Extremo de VXLAN", tunnel: "VXLAN", vm: "Máquina virtual", service: "Servicio", cable: "Tarjeta de red", console: "Consola", user: "Red user", door: "hostfwd", exterior: "Fuera" };
const rowsOf = (): Rows => ({ kvm1: [], kvm2: [], pc: [] });
const shownOf = (c: Cmd) => (c.secret ? "••••••" : c.text);
const keyName = (t: string) => (t === "^]" ? "Ctrl+]" : t);
const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const rowOf = (l: Line): Row => ({ t: l.t, c: l.c });
const SHORT = (s: string) => s.replace(/\s*\([^)]*\)/g, "").trim();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** «remote 10.0.16.174» → 10.0.16.174: the value of a «campo valor» pair in a command. */
const argOf = (t: string, w: string) => new RegExp(`\\b${w}\\s+(\\S+)`).exec(t)?.[1];
/** The map targets for the 3D: names carry the host for screen readers (the dot itself drops it). */
const hotOf = (def: LabDef) => def.pieces.map((p) => ({ id: p.id, node: p.node, kind: p.kind, name: p.host && !p.name.includes("KVM") ? `${p.name} · ${p.host.toUpperCase()}` : p.name }));
/** setup-interfaces asks these, in this order: its answers are not commands. */
const ASKS = ["interfaz", "IP", "máscara", "gateway", "¿a mano?"];

function whereOf(lab: Lab, term: Term) {
  const f = top(lab, term);
  if (f.k === "pc") return "en tu PC";
  const h = hostOf(lab, f.ip);
  if (f.k === "server") return `shell de ${h?.name}`;
  const hit = vmOf(lab, f.pid);
  const n = hit ? vmName(hit.h, hit.v) : "la MV";
  if (f.wait) return `en cola para ${n}`;
  if (f.esc) return "telnet>";
  if (f.edit) return `vi en ${n}`;
  return f.via === "telnet" ? `dentro de ${n} · telnet ${hit?.v.telnet ?? ""}` : f.via === "ssh" ? `dentro de ${n} · ssh` : `dentro de ${n}`;
}
/** Why a terminal shows no prompt. */
function idleHint(lab: Lab, term: Term) {
  const f = top(lab, term);
  if (f.wait) return "Congelado: otra ventana tiene esta consola. Lo que escribas queda en cola (sal con Ctrl+] y quit).";
  if (f.login === 0) return "Consola en negro: pulsa Intro.";
  if (f.k === "vm" && f.via === "none") return "QEMU ocupa esta terminal.";
  return "";
}
/** Line diff (LCS): deletions before additions, for the vi animation. */
function diffLines(a: string[], b: string[]): ViLine[] {
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: ViLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      out.push({ t: a[i] });
      i++;
      j++;
    } else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) out.push({ t: a[i++], s: "del" });
    else out.push({ t: b[j++], s: "add" });
  }
  return out;
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A command with the parts that matter highlighted: "remote" = the word and its value, "mac=" = key and value, "id=net0" = exactly that. */
function Marked({ text, hl = [] }: { text: string; hl?: string[] }) {
  const spans: [number, number][] = [];
  for (const h of hl) {
    const re = h.endsWith("=") ? new RegExp(`${esc(h)}[^,\\s]*`, "g") : h.includes("=") ? new RegExp(`(?<![\\w-])${esc(h)}(?![\\w-])`, "g") : new RegExp(`\\b${esc(h)}\\s+\\S+`, "g");
    for (const m of text.matchAll(re)) spans.push([m.index!, m.index! + m[0].length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out: React.ReactNode[] = [];
  let at = 0;
  for (const [a, b] of spans) {
    if (a < at) continue;
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={a}>{text.slice(a, b)}</mark>);
    at = b;
  }
  out.push(text.slice(at));
  return <>{out}</>;
}

/* ================================================================== the component */

export function Lab3D({ def }: { def: LabDef }) {
  const stage = React.useRef<HTMLDivElement>(null);
  const world = React.useRef<Hotel | null>(null);
  const [state3d, setState3d] = React.useState<"idle" | "loading" | "on" | "fail">("idle");
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  const [mode, setModeS] = React.useState<Mode>("inicio");
  const modeR = React.useRef<Mode>("inicio");
  const fin = React.useMemo(() => finalLab(def), [def]);
  const lab = React.useRef<Lab>(def.start());
  const rows = React.useRef<Rows>(rowsOf());
  const [ver, setVer] = React.useState<Record<Term, number>>({ kvm1: 0, kvm2: 0, pc: 0 });
  const sim = React.useRef(0);
  const paused = React.useRef(true);
  const speedR = React.useRef(1);
  const trapsR = React.useRef(false);
  const token = React.useRef(0);
  const running = React.useRef(false);
  const alive = React.useRef(true);
  const [stepI, setStepI] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [speed, setSpeedS] = React.useState(1);
  const [traps, setTraps] = React.useState(false);
  const [cap, setCap] = React.useState<Cap | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [typing, setTyping] = React.useState<Partial<Record<Term, string>>>({});
  const [active, setActive] = React.useState<Term>("kvm1");
  const [showPc, setShowPc] = React.useState(false);
  const [vi, setVi] = React.useState<ViView | null>(null);
  const [lapseUI, setLapseUI] = React.useState<{ from: string; to: string; asks: number; ms: number } | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [finale, setFinale] = React.useState(false);
  const [plan, setPlan] = React.useState<"demo" | "play" | null>(null);
  const [piece, setPiece] = React.useState<string | null>(null);
  const [repaso, setRepaso] = React.useState(false);
  const [sound, setSound] = React.useState(false);
  const [hint, setHint] = React.useState(0);
  const [busy, setBusy] = React.useState<Partial<Record<Term, boolean>>>({});
  const [fill, setFill] = React.useState<{ term: Term; text: string; n: number } | null>(null);
  const score = React.useRef<Score | null>(null);
  const jug = React.useRef<{ lab: Lab; rows: Rows } | null>(null);
  const toastT = React.useRef(0);

  const W = () => world.current;
  const push = (term: Term, r: Row) => {
    const R = rows.current[term];
    R.push(r);
    if (R.length > 500) R.splice(0, R.length - 500);
    setVer((v) => ({ ...v, [term]: v[term] + 1 }));
  };
  const say = (t: string) => {
    setToast(t);
    window.clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => alive.current && setToast(null), 3200);
  };

  /* ---------------------------------------------------------------- the 3D world, loaded when the section comes near */
  const pickR = React.useRef<(id: string | null) => void>(() => {});
  const hoverR = React.useRef<(id: string | null) => void>(() => {});
  React.useEffect(() => {
    alive.current = true;
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es[es.length - 1].isIntersecting || world.current) return; // the last entry is the newest state
        io.disconnect();
        setState3d("loading");
        import("./hotel")
          .then((m) => {
            if (!alive.current) return;
            const w = (world.current = m.createHotel(el, { pick: (id) => pickR.current(id), hover: (id) => hoverR.current(id) }));
            const md = modeR.current;
            w.setSpeed(speedR.current);
            if (md === "ver" || md === "jugar") w.sync(lab.current, sim.current);
            else w.sync(fin.lab, fin.now);
            if (md === "mapa") w.setMap(hotOf(def));
            w.focus(md === "inicio" ? "intro" : "overview");
            setState3d("on");
          })
          .catch(() => setState3d("fail"));
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      alive.current = false;
      token.current++;
      io.disconnect();
      world.current?.dispose();
      world.current = null;
    };
  }, [fin, def]);

  /* ---------------------------------------------------------------- the sim clock and the tick */
  const tickR = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sec = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(250, t - last); // slow frames still keep the sim near real time; a hidden tab does not jump it
      last = t;
      const m = modeR.current;
      if (m === "jugar") sim.current += dt;
      else if (m === "ver" && !paused.current) sim.current += dt * speedR.current;
      acc += dt;
      sec += dt;
      if (acc >= 200) {
        acc = 0;
        tickR.current();
      }
      if (sec >= 1000 && m === "jugar") {
        sec = 0;
        bump();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  tickR.current = () => {
    const m = modeR.current;
    if (m !== "ver" && m !== "jugar") return;
    const fx = refresh(lab.current, sim.current);
    W()?.sync(lab.current, sim.current);
    if (fx.length) W()?.play(fx);
    if (m === "jugar") check();
  };

  /* ---------------------------------------------------------------- ▶ Ver: the replay director (sim time, pausable) */
  const wait = (ms: number, my: number) =>
    new Promise<void>((res, rej) => {
      const end = sim.current + ms;
      const f = () => {
        if (token.current !== my) return rej(new Stop());
        if (sim.current >= end) return res();
        requestAnimationFrame(f);
      };
      f();
    });
  /** A moment to read (a lesson, the plan): real time at any speed, still pausable. */
  const hold = (ms: number, my: number) => wait(ms * speedR.current, my);
  const frame = (my: number) => new Promise<void>((res, rej) => requestAnimationFrame(() => (token.current !== my ? rej(new Stop()) : res())));

  async function typeIn(term: Term, shown: string, my: number) {
    if (!shown) {
      setTyping((x) => ({ ...x, [term]: "⏎" }));
      await wait(260, my);
      return;
    }
    const per = Math.min(42, 1900 / shown.length);
    const start = sim.current;
    for (;;) {
      const k = Math.min(shown.length, Math.floor((sim.current - start) / per) + 1);
      setTyping((x) => (x[term] === shown.slice(0, k) ? x : { ...x, [term]: shown.slice(0, k) }));
      W()?.sfx("tick");
      if (k >= shown.length) break;
      await frame(my);
    }
    await wait(240, my);
  }

  async function animateEdit(c: Cmd, my: number) {
    const ed = editing(lab.current, c.term);
    if (!ed) return;
    const ops = diffLines(ed.text.split("\n"), c.text.split("\n"));
    const lines: ViLine[] = ops.map((o) => (o.s === "add" ? { t: "", s: "add" } : { t: o.t }));
    const show = () => setVi({ term: c.term, path: ed.path, lines: lines.map((l) => ({ ...l })), cmd: "" });
    show();
    await wait(500, my);
    for (let k = 0; k < ops.length; k++)
      if (ops[k].s === "del") {
        lines[k].s = "del";
        show();
        await wait(300, my);
      }
    for (let k = 0; k < ops.length; k++) if (ops[k].s === "del") lines[k].s = "gone";
    show();
    await wait(250, my);
    for (let k = 0; k < ops.length; k++) {
      if (ops[k].s !== "add") continue;
      const full = ops[k].t;
      const start = sim.current;
      const per = Math.min(40, 700 / Math.max(1, full.length));
      for (;;) {
        const n = Math.min(full.length, Math.floor((sim.current - start) / per) + 1);
        lines[k].t = full.slice(0, n);
        show();
        W()?.sfx("tick");
        if (n >= full.length) break;
        await frame(my);
      }
    }
    await wait(500, my);
  }

  async function playCmd(c: Cmd, my: number) {
    const L = () => lab.current;
    if (c.lapse) {
      const ms = Math.max(1800, 3800 / speedR.current);
      setLapseUI({ ...c.lapse, ms });
      W()?.lapse(ms);
      await wait(ms * speedR.current, my);
      sim.current += c.wait ?? 0;
      setLapseUI(null);
    } else if (c.wait) await wait(c.wait, my);
    setActive(c.term);
    if (c.term === "pc") setShowPc(true);
    setNote(c.note ?? null);
    const p = prompt(L(), c.term);
    const inVi = !!editing(L(), c.term);
    const shown = shownOf(c);
    if (c.edit) await animateEdit(c, my);
    else if (inVi) {
      for (let k = 1; k <= shown.length; k++) {
        setVi((v) => (v ? { ...v, cmd: shown.slice(0, k) } : v));
        await wait(110, my);
      }
      await wait(250, my);
    } else await typeIn(c.term, shown, my);
    setTyping((x) => ({ ...x, [c.term]: undefined }));
    const r = exec(L(), c.text, sim.current, c.term);
    if (!c.edit && !inVi && (p || shown)) push(c.term, { t: p ? `${p} ${keyName(shown)}` : keyName(shown), cmd: true });
    W()?.sync(L(), sim.current);
    W()?.play(r.fx);
    const ed = editing(L(), c.term);
    setVi(ed ? { term: c.term, path: ed.path, lines: ed.text.split("\n").map((t) => ({ t })), cmd: "" } : null);
    const t0 = sim.current;
    for (const l of r.out) {
      if (l.d) await wait(Math.max(0, t0 + l.d - sim.current), my);
      push(c.term, rowOf(l));
    }
    const has = (k: string) => r.fx.some((f) => f.k === k);
    await wait(has("dora") ? 3600 : has("tunnel") || has("gate") ? 1900 : r.fx.some((f) => f.k === "packet") ? 900 : 450, my);
  }

  async function playTrap(tr: Trap, i: number, my: number) {
    const snap = cloneLab(lab.current);
    setCap({ kind: "trap", i, trap: tr });
    W()?.focus(def.steps[i].focus);
    for (const c of tr.cmds) await playCmd(c, my);
    setNote(null);
    setCap({ kind: "lesson", i, trap: tr });
    await hold(7000, my);
    lab.current = snap;
    for (const t of new Set(tr.cmds.map((c) => c.term))) if (rows.current[t].length) push(t, { t: "⏪ Ahora, bien", sep: true });
    const ed = TERMS.map((t) => [t, editing(snap, t)] as const).find(([, e]) => e);
    setVi(ed ? { term: ed[0], path: ed[1]!.path, lines: ed[1]!.text.split("\n").map((t) => ({ t })), cmd: "" } : null);
    W()?.sync(snap, sim.current);
    setCap({ kind: "rewind", i, trap: tr });
    await hold(1800, my);
  }

  async function runFrom(i0: number, my: number) {
    running.current = true;
    try {
      for (let i = i0; i < def.steps.length; i++) {
        setStepI(i);
        const s = def.steps[i];
        if (trapsR.current) for (const tr of def.traps.filter((t) => t.at === i)) await playTrap(tr, i, my);
        setCap({ kind: "step", i });
        setNote(null);
        W()?.play([{ k: "focus", id: s.focus }]);
        if (s.plan) {
          setPlan("demo");
          await hold(10000, my);
          setPlan(null);
          lab.current.done.add("plan");
        }
        for (const c of s.cmds) await playCmd(c, my);
        await wait(1600, my);
      }
      endShow();
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
    } finally {
      if (token.current === my) running.current = false;
    }
  }

  /** The end of a replay: the light show over the towers, then the summary card. */
  function endShow() {
    const my = ++token.current;
    running.current = false;
    paused.current = true;
    setPlaying(false);
    setCap(null);
    setNote(null);
    setTyping({});
    setVi(null);
    setLapseUI(null);
    setStepI(def.steps.length - 1);
    const show = W()?.finale() ?? 0;
    window.setTimeout(() => alive.current && token.current === my && setFinale(true), show + 400);
  }

  /** Rebuild the lab at the start of step i (every earlier command, instantly) and play from there. */
  function goto(i: number, play: boolean) {
    token.current++;
    running.current = false;
    const L = def.start();
    const R = rowsOf();
    let t = sim.current;
    for (const s of def.steps.slice(0, i)) {
      if (s.plan) L.done.add("plan");
      for (const c of s.cmds) {
        t += (c.wait ?? 0) + 300;
        const p = prompt(L, c.term);
        const inVi = !!editing(L, c.term);
        const r = exec(L, c.text, t, c.term);
        if (!c.edit && !inVi && (p || c.text)) R[c.term].push({ t: p ? `${p} ${keyName(shownOf(c))}` : keyName(shownOf(c)), cmd: true });
        R[c.term].push(...r.out.map(rowOf));
      }
    }
    refresh(L, t);
    sim.current = t;
    for (const term of TERMS) if (R[term].length > 500) R[term].splice(0, R[term].length - 500);
    lab.current = L;
    rows.current = R;
    setVer((v) => ({ kvm1: v.kvm1 + 1, kvm2: v.kvm2 + 1, pc: v.pc + 1 }));
    setShowPc(R.pc.length > 0);
    setTyping({});
    setVi(null);
    setNote(null);
    setPlan(null);
    setFinale(false);
    setLapseUI(null);
    setStepI(Math.min(i, def.steps.length - 1));
    setCap(i < def.steps.length ? { kind: "step", i } : null);
    W()?.sync(L, t);
    W()?.focus(def.steps[i]?.focus ?? "overview");
    if (play) start(i);
    else {
      paused.current = true;
      setPlaying(false);
    }
  }
  function start(i: number) {
    const my = ++token.current;
    paused.current = false;
    setPlaying(true);
    void runFrom(i, my);
  }
  function togglePlay() {
    if (!running.current) return goto(stepI >= def.steps.length - 1 && finale ? 0 : stepI, true);
    paused.current = !paused.current;
    setPlaying(!paused.current);
  }
  const setSpeed = (x: number) => {
    speedR.current = x;
    setSpeedS(x);
    W()?.setSpeed(x);
  };

  /* ---------------------------------------------------------------- 🎮 Jugar */
  function newGame() {
    const L = def.start();
    const R = rowsOf();
    R.kvm1.push({ t: "Terminal de KVM1 (la de la izquierda). Ahora mismo estás en tu PC.", c: "dim" });
    R.kvm2.push({ t: "Terminal de KVM2 (la de la derecha). Ahora mismo estás en tu PC.", c: "dim" });
    R.pc.push({ t: "Una terminal más en tu PC: para entrar desde fuera.", c: "dim" });
    jug.current = { lab: L, rows: R };
    score.current = { t0: performance.now(), hints: 0, errors: 0, unlocked: new Set(), done: def.steps.map(() => false), plan: 0, seen: false, over: false };
    setHint(0);
  }
  function check() {
    const S = score.current;
    if (!S || S.over) return;
    const L = lab.current;
    const done = def.steps.map((s) => s.done(L));
    const cur = done.indexOf(false);
    done.forEach((d, i) => {
      if (d && !S.done[i] && !def.steps[i].plan) {
        say(`✓ Paso ${i}: ${SHORT(def.steps[i].goal)}`);
        W()?.sfx("chime");
      }
    });
    if (cur !== S.done.indexOf(false)) {
      setHint(0);
      if (cur >= 0) W()?.focus(def.steps[cur].focus);
    }
    S.done = done;
    const unlock = (id: string) => {
      if (S.unlocked.has(id)) return;
      S.unlocked.add(id);
      const a = ACHIEVEMENTS.find((x) => x.id === id)!;
      window.setTimeout(() => alive.current && say(`${a.icon} Logro: ${a.title}`), 900);
    };
    for (const a of ACHIEVEMENTS) if (a.test?.(L)) unlock(a.id);
    if (trapFixed(def, L)) unlock("cazatrampas");
    if (cur >= 0 && def.steps[cur].plan && !S.seen) {
      S.seen = true;
      setPlan("play");
    }
    setStepI(cur < 0 ? def.steps.length - 1 : cur);
    if (cur < 0) {
      S.over = true;
      S.end = performance.now();
      if (!S.hints) unlock("sin-pistas");
      window.setTimeout(() => {
        if (!alive.current || modeR.current !== "jugar") return;
        const show = W()?.finale() ?? 0; // the light show first, then the summary over it
        window.setTimeout(() => alive.current && modeR.current === "jugar" && setFinale(true), show + 400);
      }, 1400);
    }
  }
  function run(term: Term, text: string) {
    if (modeR.current !== "jugar" || busy[term]) return;
    const L = lab.current;
    const p = prompt(L, term);
    const inVi = !!editing(L, term);
    const masked = p === "Password:" ? "•".repeat(Math.min(8, text.length)) : text;
    if (!inVi && (p || masked)) push(term, { t: p ? `${p} ${keyName(masked)}` : keyName(masked), cmd: true });
    if (!inVi && text.trim() === "clear") {
      rows.current[term] = [];
      setVer((v) => ({ ...v, [term]: v[term] + 1 }));
      return;
    }
    const r = exec(L, text, sim.current, term);
    setActive(term);
    if (r.out.some((l) => l.c === "err" && !l.soft) && score.current) score.current.errors++; // a failing service or a lost ping is a result, not an error
    W()?.sync(L, sim.current);
    W()?.play(r.fx);
    let last = 0;
    for (const l of r.out) {
      if (l.d) {
        last = Math.max(last, l.d);
        window.setTimeout(() => alive.current && modeR.current === "jugar" && lab.current === L && push(term, rowOf(l)), l.d);
      } else push(term, rowOf(l));
    }
    if (last) {
      setBusy((b) => ({ ...b, [term]: true }));
      window.setTimeout(() => alive.current && setBusy((b) => ({ ...b, [term]: false })), last + 60);
    }
    check();
    bump();
  }
  const runR = React.useRef(run);
  runR.current = run;
  const onRun = React.useCallback((term: Term, text: string) => runR.current(term, text), []);
  const onFocusTerm = React.useCallback((term: Term) => setActive(term), []);

  /* ---------------------------------------------------------------- modes */
  function enter(m: Mode, step = 0) {
    token.current++;
    running.current = false;
    paused.current = true;
    setPlaying(false);
    setPiece(null);
    setFinale(false);
    setPlan(null);
    setVi(null);
    setTyping({});
    setNote(null);
    setLapseUI(null);
    if (modeR.current === "jugar" && jug.current) jug.current = { lab: lab.current, rows: rows.current };
    modeR.current = m;
    setModeS(m);
    W()?.setMap(null);
    W()?.light([]);
    if (m === "ver") {
      setShowPc(false);
      return goto(step, true);
    }
    if (m === "jugar") {
      if (!jug.current) newGame();
      lab.current = jug.current!.lab;
      rows.current = jug.current!.rows;
      setVer((v) => ({ kvm1: v.kvm1 + 1, kvm2: v.kvm2 + 1, pc: v.pc + 1 }));
      setShowPc(rows.current.pc.length > 1);
      setCap(null);
      W()?.sync(lab.current, sim.current);
      W()?.focus("overview");
      check();
      return;
    }
    setCap(null);
    W()?.sync(fin.lab, fin.now);
    if (m === "mapa") W()?.setMap(hotOf(def));
    W()?.focus("overview");
  }
  function restartGame() {
    newGame();
    lab.current = jug.current!.lab;
    rows.current = jug.current!.rows;
    setVer((v) => ({ kvm1: v.kvm1 + 1, kvm2: v.kvm2 + 1, pc: v.pc + 1 }));
    setFinale(false);
    setPlan(null);
    W()?.sync(lab.current, sim.current);
    W()?.focus("overview");
    check();
  }

  /* ---------------------------------------------------------------- 🗺️ Mapa: pick and hover */
  const byId = (id: string | null) => (id ? def.pieces.find((p) => p.id === id) ?? def.pieces.find((p) => p.node === id) : undefined);
  const lightFor = (p: Piece | undefined, sel: Piece | undefined) => {
    const ids = new Set<string>();
    for (const x of [p, sel]) if (x) [x.id, ...x.links].forEach((i) => ids.add(i));
    W()?.light([...ids].map((i) => byId(i)?.node).filter((n): n is string => !!n), sel?.node ?? null);
  };
  const phone = () => (stage.current?.clientWidth ?? 999) < 700;
  pickR.current = (id) => {
    const p = byId(id);
    if (!p || modeR.current !== "mapa") return; // only the map gives answers away
    setPiece(p.id);
    lightFor(undefined, p);
    // phones: the card is a bottom sheet, so the stage goes to the top of the screen and the piece is framed above the sheet;
    // wider: the card sits on the right, so the whole map moves to its left (once, so a camera you moved stays put)
    if (phone()) {
      stage.current?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      W()?.focus(p.node, true);
    } else if (!piece) W()?.focus("overview", true);
  };
  hoverR.current = (id) => {
    if (modeR.current !== "mapa") return;
    lightFor(byId(id), byId(piece));
  };

  /* ---------------------------------------------------------------- render */
  const L = lab.current;
  const steps = def.steps;
  const S = score.current;
  const visTerms: Term[] = showPc ? TERMS : ["kvm1", "kvm2"];
  const viFor = (t: Term): ViView | null => {
    if (mode === "ver") return vi?.term === t ? vi : null;
    if (mode !== "jugar") return null;
    const e = editing(L, t);
    return e ? { term: t, path: e.path, lines: e.text.split("\n").map((x) => ({ t: x })), cmd: "" } : null;
  };
  const p = byId(piece);

  return (
    <div className="l3" data-mode={mode}>
      <div className="l3-view">
        <div className="l3-stage" ref={stage} data-state={state3d}>
          <div className="l3-hud">
            <div className="l3-modes" role="tablist" aria-label="Modo" data-hud="">
              {MODES.map(([m, icon, name]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => mode !== m && enter(m)}>
                  <span aria-hidden="true">{icon}</span> <span className="l3-mname">{name}</span>
                  <span className="l3-mshort">{name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
            <div className="l3-tools" data-hud="">
              <button type="button" onClick={() => W()?.focus(mode === "inicio" ? "intro" : "overview", mode === "mapa" && !!piece)} title="Vista general" aria-label="Vista general">
                ⌖<span className="l3-tname"> Vista general</span>
              </button>
              <button
                type="button"
                aria-pressed={sound}
                title={sound ? "Quitar el sonido" : "Poner sonido"}
                aria-label="Sonido"
                onClick={() => {
                  setSound(!sound);
                  W()?.sound(!sound);
                }}
              >
                {sound ? "🔊" : "🔇"}
              </button>
            </div>
          </div>
          {state3d !== "on" ? <p className="l3-wait">{state3d === "fail" ? "Tu navegador no puede mostrar el 3D (WebGL), pero las terminales y los pasos funcionan igual." : "Cargando el laboratorio en 3D…"}</p> : null}
          {lapseUI ? <Lapse {...lapseUI} /> : null}
          {toast ? (
            <div className="l3-toast" role="status" data-hud="">
              {toast}
            </div>
          ) : null}
        </div>
        {mode === "inicio" ? (
          <div className="l3-intro" data-hud="">
            <p className="l3-kicker">Laboratorio 3D · {def.id === "clase" ? "lo que hicimos en clase" : "el ejercicio de la pizarra"}</p>
            <h3>{def.title}</h3>
            <p>{def.intro}</p>
            <div className="l3-go">
              <button type="button" className="l3-cta" onClick={() => enter("ver")}>
                ▶ Ver la partida
              </button>
              <button type="button" onClick={() => enter("jugar")}>
                🎮 Jugar
              </button>
              <button type="button" onClick={() => enter("mapa")}>
                🗺️ Mapa
              </button>
            </div>
          </div>
        ) : null}
        {mode === "ver" && cap ? <Caption def={def} cap={cap} note={note} /> : null}
        {mode === "ver" && plan === "demo" ? <Planifica cards={def.plan ?? []} demo /> : null}
        {mode === "jugar" && S && !S.over ? (
          <Goal
            def={def}
            i={stepI}
            hint={hint}
            onHint={() => {
              setHint(hint + 1);
              S.hints++;
            }}
            onFill={(t, text) => {
              if (text.includes("\n") && !editing(lab.current, t)) return say(`Primero abre el fichero con vi en ${TINFO[t].name}.`);
              setActive(t);
              if (t === "pc") setShowPc(true);
              setFill((f) => ({ term: t, text, n: (f?.n ?? 0) + 1 }));
            }}
            onPlan={() => setPlan("play")}
          />
        ) : null}
        {mode === "mapa" ? (
          <div className="l3-maphint" data-hud="">
            <span>Pulsa cualquier pieza (o recórrelas con Tab) para ver su comando.</span>
            <label className="l3-switch">
              <input type="checkbox" checked={repaso} onChange={(e) => setRepaso(e.target.checked)} />
              <span>Modo repaso</span>
            </label>
          </div>
        ) : null}
        {p ? <PieceCard key={p.id} def={def} p={p} repaso={repaso} onClose={() => {
              setPiece(null);
              lightFor(undefined, undefined);
              if (mode === "mapa") W()?.focus(phone() ? p.node : "overview");
            }} onPick={(id) => pickR.current(id)} onStep={(i) => enter("ver", i)} /> : null}
      </div>

      {mode === "ver" ? (
        <div className="l3-bar" role="group" aria-label="Reproducción">
          <button type="button" onClick={() => goto(Math.max(0, stepI - 1), playing)} aria-label="Paso anterior">
            ⏮
          </button>
          <button type="button" className="l3-play" onClick={togglePlay} aria-label={playing ? "Pausa" : "Reproducir"}>
            {playing ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (stepI >= steps.length - 1) endShow();
              else goto(stepI + 1, playing);
            }}
            aria-label="Paso siguiente"
          >
            ⏭
          </button>
          <div className="l3-speed" role="group" aria-label="Velocidad">
            {[1, 2, 4].map((x) => (
              <button key={x} type="button" aria-pressed={speed === x} onClick={() => setSpeed(x)}>
                {x}×
              </button>
            ))}
          </div>
          <label className="l3-switch">
            <input
              type="checkbox"
              checked={traps}
              onChange={(e) => {
                trapsR.current = e.target.checked;
                setTraps(e.target.checked);
              }}
            />
            <span>Con las trampas</span>
          </label>
          <span className="l3-count">
            Paso {stepI} de {steps.length - 1}
          </span>
          <div className="l3-prog" aria-hidden="true">
            <i style={{ width: `${(stepI / (steps.length - 1)) * 100}%` }} />
          </div>
        </div>
      ) : null}

      {mode === "ver" || mode === "jugar" ? (
        <div className="l3-desk">
          <div className="l3-terms" data-n={visTerms.length}>
            <div className="l3-ttabs" role="tablist" aria-label="Terminales">
              {visTerms.map((t) => (
                <button key={t} type="button" role="tab" aria-selected={active === t} onClick={() => setActive(t)} style={{ "--c": TINFO[t].col } as React.CSSProperties}>
                  {TINFO[t].name}
                  {typing[t] !== undefined ? " ✎" : ""}
                </button>
              ))}
              {!showPc && mode === "jugar" ? (
                <button type="button" className="l3-addpc" onClick={() => setShowPc(true)}>
                  + Tu PC
                </button>
              ) : null}
            </div>
            {visTerms.map((t) => (
              <TermPane
                key={t}
                id={`l3-in-${def.id}-${t}`}
                term={t}
                where={whereOf(L, t)}
                prompt={prompt(L, t)}
                idle={idleHint(L, t)}
                rows={rows.current[t]}
                ver={ver[t]}
                typing={typing[t]}
                live={mode === "jugar"}
                on={active === t}
                busy={!!busy[t]}
                vi={viFor(t)}
                fill={fill?.term === t ? fill : null}
                onRun={onRun}
                onFocus={onFocusTerm}
              />
            ))}
          </div>
          <aside className="l3-side">
            {mode === "jugar" && S ? (
              <div className="l3-score" aria-label="Marcador">
                <span title="Tiempo">⏱ {mmss((S.end ?? performance.now()) - S.t0)}</span>
                <span title="Pistas">💡 {S.hints}</span>
                <span title="Errores">❌ {S.errors}</span>
                <button type="button" onClick={restartGame}>
                  ↺ Reiniciar
                </button>
              </div>
            ) : null}
            <ol className="l3-steps" start={0}>
              {steps.map((s, i) => {
                const done = mode === "jugar" ? !!S?.done[i] : i < stepI || (finale && mode === "ver");
                return (
                  <li key={s.id} data-done={done ? "" : undefined} data-now={i === stepI && !done ? "" : undefined}>
                    {mode === "ver" ? (
                      <button type="button" onClick={() => goto(i, true)}>
                        <b>{i}</b> {SHORT(s.goal)}
                      </button>
                    ) : (
                      <span>
                        <b>{i}</b> {SHORT(s.goal)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {mode === "jugar" && S ? (
              <div className="l3-achs">
                <p>Logros</p>
                <ul>
                  {ACHIEVEMENTS.filter((a) => def.id === "pizarra" || (a.id !== "buen-plan" && a.id !== "desde-la-calle")).map((a) => (
                    <li key={a.id} data-on={S.unlocked.has(a.id) ? "" : undefined} title={a.desc}>
                      <span aria-hidden="true">{a.icon}</span> {a.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {mode === "mapa" ? <MapList def={def} sel={piece} onPick={(id) => pickR.current(id)} /> : null}

      {plan === "play" && mode === "jugar" ? (
        <Modal label="Planifica" onClose={() => setPlan(null)}>
          <Planifica
            cards={def.plan ?? []}
            onCheck={(ok) => {
              const sc = score.current;
              if (!sc) return;
              sc.plan++;
              if (!ok) return;
              lab.current.done.add("plan");
              if (sc.plan === 1 && !sc.unlocked.has("buen-plan")) {
                sc.unlocked.add("buen-plan");
                window.setTimeout(() => alive.current && say("🗺️ Logro: Buen plan"), 900);
              }
              window.setTimeout(() => alive.current && (setPlan(null), check()), 2200);
            }}
          />
        </Modal>
      ) : null}
      {finale ? (
        <Modal label="Resumen" onClose={() => setFinale(false)}>
          <Finale def={def} score={mode === "jugar" ? S : null} onAgain={() => enter("ver")} onPlay={() => (setFinale(false), mode === "jugar" ? restartGame() : enter("jugar"))} onMap={() => enter("mapa")} />
        </Modal>
      ) : null}
    </div>
  );
}

/* ================================================================== pieces of the UI */

const RowsView = React.memo(function RowsView({ rows }: { rows: Row[]; ver: number }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="l3-row" data-c={r.c} data-cmd={r.cmd ? "" : undefined} data-sep={r.sep ? "" : undefined}>
          {r.t}
        </div>
      ))}
    </>
  );
}, (a, b) => a.ver === b.ver && a.rows === b.rows);

interface PaneProps {
  id: string;
  term: Term;
  where: string;
  prompt: string;
  idle: string;
  rows: Row[];
  ver: number;
  typing?: string;
  live: boolean;
  on: boolean;
  busy: boolean;
  vi: ViView | null;
  fill: { text: string; n: number } | null;
  onRun: (t: Term, s: string) => void;
  onFocus: (t: Term) => void;
}
function TermPane({ id, term, where, prompt: pr, idle, rows, ver, typing, live, on, busy, vi, fill, onRun, onFocus }: PaneProps) {
  const box = React.useRef<HTMLDivElement>(null);
  const field = React.useRef<HTMLInputElement>(null);
  const [input, setInput] = React.useState("");
  const hist = React.useRef<string[]>([]);
  const hpos = React.useRef(-1);
  React.useEffect(() => {
    const b = box.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [ver, typing, vi]);
  // Pista 3: the command goes into this terminal's input, ready to edit or send (with vi open, vi takes it)
  React.useEffect(() => {
    if (!fill || vi) return;
    if (fill.text === "^]") return onRun(term, "^]");
    setInput(fill.text);
    field.current?.focus();
  }, [fill?.n]);
  const send = (s: string) => {
    if (busy) return;
    if (s.trim() && s !== "^]") {
      hist.current.push(s);
      hpos.current = -1;
    }
    onRun(term, s);
  };
  const keys: [string, string][] = [];
  if (live) {
    if (pr === "telnet>") keys.push(["quit", "quit"]);
    else if (/login:$|^Password:$|\?.*\]$/.test(pr) || !pr) keys.push(["Intro ⏎", ""]);
    if (where.startsWith("dentro") || where.startsWith("en cola")) keys.push(["Ctrl+]", "^]"]);
  }
  return (
    <section className="l3-term" data-on={on ? "" : undefined} style={{ "--c": TINFO[term].col } as React.CSSProperties} onClick={() => live && field.current?.focus()} aria-label={`Terminal ${TINFO[term].name}`}>
      <header>
        <b>{TINFO[term].name}</b>
        <span>{where}</span>
      </header>
      {vi ? (
        <Vi view={vi} live={live} fill={fill} onSave={(text) => onRun(term, `${text}\n:wq`)} onQuit={() => onRun(term, ":q!")} />
      ) : (
        <div className="l3-out" ref={box} aria-live={live ? "polite" : "off"}>
          <RowsView rows={rows} ver={ver} />
          {typing !== undefined ? (
            <div className="l3-row" data-cmd="">
              {pr ? `${pr} ` : ""}
              {keyName(typing)}
              <i className="l3-caret" />
            </div>
          ) : null}
          {!live && typing === undefined && !pr && idle ? (
            <div className="l3-row" data-c="dim">
              {idle}
            </div>
          ) : null}
        </div>
      )}
      {live && !vi ? (
        <form
          className="l3-in"
          onSubmit={(e) => {
            e.preventDefault();
            const v = input;
            setInput("");
            send(v);
          }}
        >
          <label className="l3-prompt" htmlFor={id}>
            {pr || "⏎"}
          </label>
          <input
            id={id}
            ref={field}
            value={input}
            type={pr === "Password:" ? "password" : "text"}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => onFocus(term)}
            onKeyDown={(e) => {
              if (e.ctrlKey && (e.key === "]" || e.code === "BracketRight")) {
                e.preventDefault();
                return send("^]");
              }
              if (e.ctrlKey && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
                e.preventDefault();
                setInput("");
                return send("^C");
              }
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const H = hist.current;
                if (!H.length) return;
                let p = hpos.current < 0 ? H.length : hpos.current;
                p = e.key === "ArrowUp" ? Math.max(0, p - 1) : Math.min(H.length, p + 1);
                hpos.current = p;
                setInput(H[p] ?? "");
              }
            }}
            disabled={busy}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            data-lpignore="true"
            placeholder={busy ? "…" : idle || "escribe un comando"}
          />
        </form>
      ) : null}
      {keys.length && !vi ? (
        <div className="l3-keys">
          {keys.map(([l, k]) => (
            <button key={l} type="button" onClick={() => send(k)} disabled={busy}>
              {l}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** vi in the terminal: the replay animates the change; in Jugar you edit the text and save with :wq. */
function Vi({ view, live, fill, onSave, onQuit }: { view: ViView; live: boolean; fill?: { text: string; n: number } | null; onSave: (t: string) => void; onQuit: () => void }) {
  const [text, setText] = React.useState(() => view.lines.map((l) => l.t).join("\n"));
  const [cmd, setCmd] = React.useState("");
  const cmdIn = React.useRef<HTMLInputElement>(null);
  // Pista 3 while vi is open: the file goes into the buffer, :wq into vi's own command line (only hints clicked from now on)
  const seen = React.useRef(fill?.n);
  React.useEffect(() => {
    if (!fill || fill.n === seen.current) return;
    seen.current = fill.n;
    if (fill.text.includes("\n")) setText(fill.text);
    else setCmd(fill.text);
    cmdIn.current?.focus();
  }, [fill?.n]);
  if (live)
    return (
      <div className="l3-vi">
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label={`Editando ${view.path}`} rows={12} />
        <form
          className="l3-vi-cmd"
          onSubmit={(e) => {
            e.preventDefault();
            const c = cmd.trim();
            setCmd("");
            if (/^:(wq|x)!?$|^ZZ$/.test(c)) onSave(text);
            else if (c === ":q!") onQuit();
          }}
        >
          <input ref={cmdIn} value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder=":wq guarda y sale · :q! sale sin guardar" aria-label="Orden de vi" spellCheck={false} autoCapitalize="off" />
          <button type="button" onClick={() => onSave(text)}>
            :wq
          </button>
          <button type="button" onClick={onQuit}>
            :q!
          </button>
        </form>
        <p className="l3-vi-path">"{view.path}"</p>
      </div>
    );
  return (
    <div className="l3-vi" aria-label={`vi ${view.path}`}>
      <div className="l3-vi-buf">
        {view.lines.map((l, i) =>
          l.s === "gone" ? null : (
            <div key={i} data-s={l.s}>
              {l.t || " "}
            </div>
          ),
        )}
        {Array.from({ length: Math.max(0, 4 - view.lines.length) }, (_, i) => (
          <div key={`t${i}`} className="l3-vi-tilde">
            ~
          </div>
        ))}
      </div>
      <p className="l3-vi-path">{view.cmd ? view.cmd : `"${view.path}"`}</p>
    </div>
  );
}

function Badges({ pdf, essential }: { pdf: string[]; essential?: string }) {
  return (
    <div className="l3-badges">
      {pdf.map((x) => (
        <span key={x} className="l3-pdf">
          📍 {x}
        </span>
      ))}
      {essential ? <span className="l3-ess">⚠️ {essential}</span> : null}
    </div>
  );
}

function Caption({ def, cap, note }: { def: LabDef; cap: Cap; note: string | null }) {
  const s = def.steps[cap.i];
  const tr = cap.trap;
  if (cap.kind === "trap" && tr)
    return (
      <div className="l3-cap" data-k="trap" aria-live="polite" data-hud="">
        <p className="l3-kicker">🪤 Trampa · antes del paso {cap.i}</p>
        <h3>{tr.title}</h3>
        {note ? <p className="l3-note">{note}</p> : null}
      </div>
    );
  if (cap.kind === "lesson" && tr)
    return (
      <div className="l3-cap" data-k="lesson" aria-live="polite" data-hud="">
        <p className="l3-kicker">💡 Lo que aprendimos</p>
        <h3>{tr.lesson}</h3>
        {tr.analogy ? <p className="l3-hotel">🏨 {tr.analogy}</p> : null}
      </div>
    );
  return (
    <div className="l3-cap" data-k={cap.kind} aria-live="polite" data-hud="">
      <p className="l3-kicker">{cap.kind === "rewind" ? "⏪ Ahora, bien · " : ""}Paso {cap.i}</p>
      <h3>{s.goal}</h3>
      <p>{s.why}</p>
      <Badges pdf={s.pdf} essential={s.essential} />
      {s.analogy ? <p className="l3-hotel">🏨 {s.analogy}</p> : null}
      {note ? <p className="l3-note">{note}</p> : null}
    </div>
  );
}

function Goal({ def, i, hint, onHint, onFill, onPlan }: { def: LabDef; i: number; hint: number; onHint: () => void; onFill: (t: Term, text: string) => void; onPlan: () => void }) {
  const s = def.steps[i];
  if (!s) return null;
  const cmds = hintCmds(s);
  const terms = TERMS.filter((t) => cmds.some((c) => c.term === t));
  return (
    <div className="l3-cap l3-goal" aria-live="polite" data-hud="">
      <p className="l3-kicker">🎮 Paso {i} · objetivo</p>
      <h3>{s.goal}</h3>
      {s.plan ? (
        <button type="button" className="l3-cta" onClick={onPlan}>
          🗺️ Abrir Planifica
        </button>
      ) : null}
      {hint >= 1 ? (
        <p>
          <b>Pista 1 ·</b> {s.why}
          {s.analogy ? <span className="l3-hotel"> 🏨 {s.analogy}</span> : null}
        </p>
      ) : null}
      {hint >= 2 ? <Badges pdf={s.pdf} essential={s.essential ?? (s.pdf.length ? undefined : "No sale en el PDF.")} /> : null}
      {hint >= 3 ? (
        <div className="l3-hcmds">
          {terms.map((t) => (
            <div key={t} className="l3-hterm" style={{ "--c": TINFO[t].col } as React.CSSProperties}>
              <p>En {TINFO[t].name}, por orden</p>
              {cmds
                .filter((c) => c.term === t)
                .map((c, k) =>
                  c.edit ? (
                    <div key={k} className="l3-hfile">
                      <pre>{c.text}</pre>
                      <button type="button" onClick={() => onFill(t, c.text)}>
                        ✎ Ponerlo en vi
                      </button>
                    </div>
                  ) : (
                    <button key={k} type="button" title={`Escribirlo en la terminal ${TINFO[t].name}`} onClick={() => onFill(t, c.text)}>
                      <code>{keyName(c.text)}</code>
                    </button>
                  ),
                )}
            </div>
          ))}
        </div>
      ) : null}
      {hint < 3 && !s.plan ? (
        <button type="button" className="l3-hintbtn" onClick={onHint}>
          {["💡 Pista 1: qué y por qué", "📍 Pista 2: dónde está en el PDF", "⌨️ Pista 3: el comando"][hint]}
        </button>
      ) : null}
    </div>
  );
}

function Lapse({ from, to, asks, ms }: { from: string; to: string; asks: number; ms: number }) {
  const [k, setK] = React.useState(0);
  React.useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const f = () => {
      const q = Math.min(1, (performance.now() - t0) / ms);
      setK(q);
      if (q < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [ms]);
  const m0 = +from.split(":")[0] * 60 + +from.split(":")[1];
  const m1 = +to.split(":")[0] * 60 + +to.split(":")[1];
  const m = Math.round(m0 + (m1 - m0) * k);
  return (
    <div className="l3-lapse" role="status" style={{ "--q": k } as React.CSSProperties} data-hud="">
      <div className="l3-clock" aria-hidden="true">
        <i className="l3-hh" style={{ transform: `rotate(${(m / 720) * 360}deg)` }} />
        <i className="l3-mh" style={{ transform: `rotate(${(m / 60) * 360}deg)` }} />
      </div>
      <p className="l3-time">
        {String(Math.floor(m / 60)).padStart(2, "0")}:{String(m % 60).padStart(2, "0")}
      </p>
      <p>
        DISCOVER ×{Math.round(asks * k).toLocaleString("es-ES")} · nadie contesta
      </p>
    </div>
  );
}

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const close = React.useRef(onClose);
  close.current = onClose;
  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("keydown", k);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className="l3-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="l3-dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <button type="button" className="l3-x" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

const PLAN_NAME: Record<string, string> = { bridges: "bridges", fw: "firewall", vxlan: "VXLAN", imgs: "imágenes", dhcp: "DHCP", tiers: "tiers", eth1: "eth1" };
/** Planifica: order the step cards; each broken dependency explains itself. The demo (Ver) shows the right order. */
function Planifica({ cards, demo, onCheck }: { cards: PlanCard[]; demo?: boolean; onCheck?: (ok: boolean) => void }) {
  const [order, setOrder] = React.useState(() => {
    if (demo) return cards.map((c) => c.id);
    const ids = cards.map((c) => c.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return planCheck(cards, ids).length ? ids : [...ids.slice(1), ids[0]];
  });
  const [errs, setErrs] = React.useState<ReturnType<typeof planCheck> | null>(null);
  const [drag, setDrag] = React.useState<string | null>(null);
  const move = (id: string, d: number) => {
    const i = order.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const o = [...order];
    [o[i], o[j]] = [o[j], o[i]];
    setOrder(o);
    setErrs(null);
  };
  const card = (id: string) => cards.find((c) => c.id === id)!;
  const ok = errs !== null && errs.length === 0;
  // the demo is taller than its box on laptops: it scrolls along as each card pops in
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!demo || !el) return;
    const behavior = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const ts = [...el.querySelectorAll("li")].map((li, i) => window.setTimeout(() => el.scrollTo({ top: Math.max(0, li.offsetTop + li.offsetHeight + 14 - el.clientHeight), behavior }), i * 600 + 350));
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, [demo]);
  return (
    <div className={demo ? "l3-plan l3-card" : "l3-plan"} data-hud={demo ? "" : undefined} ref={box}>
      <p className="l3-kicker">🗺️ Planifica</p>
      <h3>{demo ? "El orden, y por qué" : "Ordena los pasos antes de escribir nada"}</h3>
      {!demo ? <p className="l3-plan-tip">Arrastra las tarjetas o usa ↑ ↓. Lo que importa: qué necesita cada paso antes.</p> : null}
      <ol>
        {order.map((id, i) => {
          const c = card(id);
          const bad = errs?.filter((e) => e.card === id) ?? [];
          return (
            <li
              key={id}
              data-bad={bad.length ? "" : undefined}
              data-ok={ok ? "" : undefined}
              draggable={!demo}
              onDragStart={() => setDrag(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!drag || drag === id) return;
                const o = order.filter((x) => x !== drag);
                o.splice(o.indexOf(id) + (order.indexOf(drag) < order.indexOf(id) ? 1 : 0), 0, drag);
                setOrder(o);
                setErrs(null);
                setDrag(null);
              }}
              style={demo ? ({ animationDelay: `${i * 0.6}s` } as React.CSSProperties) : undefined}
            >
              <span className="l3-plan-n">{i + 1}</span>
              <span className="l3-plan-t">
                {c.text}
                {demo && c.deps.length ? <small>después de: {c.deps.map((d) => PLAN_NAME[d.id] ?? card(d.id).text.split(":")[0]).join(" · ")}</small> : null}
                {bad.map((b) => (
                  <small key={b.dep} className="l3-why">
                    ✗ {b.why}
                  </small>
                ))}
              </span>
              {!demo ? (
                <span className="l3-plan-mv">
                  <button type="button" aria-label={`Subir «${c.text}»`} onClick={() => move(id, -1)} disabled={i === 0}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Bajar «${c.text}»`} onClick={() => move(id, 1)} disabled={i === order.length - 1}>
                    ↓
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!demo ? (
        <div className="l3-plan-go">
          <button
            type="button"
            className="l3-cta"
            onClick={() => {
              const e = planCheck(cards, order);
              setErrs(e);
              onCheck?.(!e.length);
            }}
          >
            Comprobar el plan
          </button>
          {errs ? <span role="status">{errs.length ? `${errs.length} dependencia${errs.length > 1 ? "s" : ""} rota${errs.length > 1 ? "s" : ""}: mira las tarjetas en rojo.` : "✅ ¡Plan correcto! A ejecutarlo."}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function CmdBox({ text, hl, file }: { text: string; hl?: string[]; file?: string }) {
  const [ok, setOk] = React.useState(false);
  const shown = keyName(text);
  return (
    <div className="l3-cmd" data-file={file ? "" : undefined}>
      {file ? <p className="l3-cmd-file">{file}</p> : null}
      <code>
        <Marked text={shown} hl={hl} />
      </code>
      {text !== "^]" && text ? (
        <button
          type="button"
          className="l3-copy"
          aria-label="Copiar"
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => {
                setOk(true);
                window.setTimeout(() => setOk(false), 1400);
              },
              () => {},
            );
          }}
        >
          {ok ? "✓" : "⧉"}
        </button>
      ) : null}
    </div>
  );
}

/** The map card: what the piece is, its exact command(s) with our values, the PDF page and the step. */
function PieceCard({ def, p, repaso, onClose, onPick, onStep }: { def: LabDef; p: Piece; repaso: boolean; onClose: () => void; onPick: (id: string) => void; onStep: (i: number) => void }) {
  const [reveal, setReveal] = React.useState(!repaso);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (prev?.isConnected && prev !== document.body) prev.focus({ preventScroll: true });
    };
  }, []);
  const at = (i: number) => cmdAt(def, p.refs[i]);
  const pair = p.pair ? def.pieces.find((x) => x.id === p.pair) : undefined;
  const host = (x: Piece) => (x.host === "kvm2" ? "KVM2" : "KVM1");
  const lines: React.ReactNode[] = [];
  if (p.kind === "cable" || p.kind === "user") nicArgs(at(0).text, p.nic ?? 0).forEach((x) => lines.push(<CmdBox key={x} text={x} hl={p.hl} />));
  else if (p.kind === "vxlan" && pair) {
    const [a, b] = [at(0).text, cmdAt(def, pair.refs[0]).text];
    const hl = ["remote", "master", "id"].filter((w) => argOf(a, w) !== argOf(b, w)); // only what changes between the ends
    lines.push(
      <p key="a" className="l3-end">
        Este extremo · {host(p)}
      </p>,
      <CmdBox key="ca" text={a} hl={hl} />,
      <p key="b" className="l3-end">
        El otro extremo · {host(pair)}
      </p>,
      <CmdBox key="cb" text={b} hl={hl} />,
      <EndDiff key="d" a={a} b={b} />,
    );
  } else if (p.kind === "tunnel")
    p.refs.forEach((r, i) => {
      lines.push(
        <p key={`h${i}`} className="l3-end">
          {r.cmd >= 0 && cmdAt(def, r).term === "kvm2" ? "En KVM2" : "En KVM1"}
        </p>,
        <CmdBox key={`c${i}`} text={cmdAt(def, r).text} hl={p.hl} />,
      );
    });
  else
    p.refs.forEach((r, i) => {
      const c = cmdAt(def, r);
      lines.push(<CmdBox key={i} text={c.text} hl={p.hl} file={c.edit ? "/etc/dhcp/dhcpd.conf (el fichero entero)" : undefined} />);
    });
  const inner = (p.inner ?? []).map((r) => cmdAt(def, r)).filter((c) => !c.secret && c.text);
  const innerRows: React.ReactNode[] = [];
  for (let k = 0; k < inner.length; k++) {
    const c = inner[k];
    innerRows.push(<CmdBox key={k} text={c.text} file={c.edit ? "/etc/dhcp/dhcpd.conf (el fichero entero)" : undefined} />);
    if (c.text !== "setup-interfaces") continue;
    const ans: string[] = [];
    while (inner[k + 1] && !inner[k + 1].text.startsWith("service ")) ans.push(inner[++k].text);
    innerRows.push(
      <p key={`a${k}`} className="l3-ans">
        Sus preguntas:{" "}
        {ans.map((x, j) => (
          <React.Fragment key={j}>
            {j ? " · " : ""}
            {ASKS[j]} <code>{x}</code>
          </React.Fragment>
        ))}
        . Ojo: propone 255.0.0.0 y 10.0.0.254.
      </p>,
    );
  }
  const names = p.links.map((id) => def.pieces.find((x) => x.id === id)).filter((x): x is Piece => !!x);
  const stepN = p.refs[0]?.step ?? 0;
  return (
    <div className="l3-card l3-piece" role="dialog" aria-label={p.name} tabIndex={-1} ref={ref} onKeyDown={(e) => e.key === "Escape" && onClose()} data-hud="">
      <button type="button" className="l3-x" onClick={onClose} aria-label="Cerrar">
        ×
      </button>
      <p className="l3-kicker">
        {KIND[p.kind]}
        {p.host ? ` · ${host(p)}` : ""}
      </p>
      <h3>{p.name}</h3>
      <p>{p.what}</p>
      <div className="l3-cardrow">
        <Badges pdf={p.pdf} essential={p.essential} />
        <button type="button" className="l3-steppill" onClick={() => onStep(stepN)}>
          ▶ Ver el paso {stepN}
        </button>
      </div>
      {reveal ? (
        <>
          <div className="l3-cmds">{lines}</div>
          {inner.length ? (
            <>
              <p className="l3-end">Dentro de la MV</p>
              <div className="l3-cmds">{innerRows}</div>
            </>
          ) : null}
        </>
      ) : (
        <button type="button" className="l3-cta" onClick={() => setReveal(true)}>
          Mostrar el comando
        </button>
      )}
      <div className="l3-piece-go">
        {names.length ? (
          <span className="l3-links">
            Conecta con:
            {names.map((x) => (
              <button key={x.id} type="button" onClick={() => onPick(x.id)}>
                {x.name}
              </button>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** What changes between the two ends of a VXLAN (and what must stay the same). */
function EndDiff({ a, b }: { a: string; b: string }) {
  const what: Record<string, string> = { remote: "la IP normal de la otra KVM", master: "el bridge de cada KVM", id: "el número del pasadizo" };
  const diff = ["remote", "master", "id"].filter((w) => argOf(a, w) !== argOf(b, w));
  const same = ["id", "master"].filter((w) => argOf(a, w) === argOf(b, w));
  return (
    <p className="l3-diff">
      {diff.length === 1 ? "Solo cambia " : "Cambian "}
      {diff.map((w, i) => (
        <React.Fragment key={w}>
          {i ? " y " : ""}
          <mark>{w}</mark> ({what[w]})
        </React.Fragment>
      ))}
      .{" "}
      {same.map((w) => (w === "id" ? "El id, igual en los dos. " : `master es ${argOf(a, w)} en los dos: los bridges se llaman igual. `))}
    </p>
  );
}

/** Every piece as a list too (keyboard, screen readers and small screens). */
function MapList({ def, sel, onPick }: { def: LabDef; sel: string | null; onPick: (id: string) => void }) {
  const groups: [string, Piece[]][] = [
    ["KVM1", def.pieces.filter((p) => p.host === "kvm1")],
    ["Entre las dos", def.pieces.filter((p) => !p.host)],
    ["KVM2", def.pieces.filter((p) => p.host === "kvm2")],
  ];
  return (
    <details className="l3-maplist">
      <summary>Todas las piezas, en lista ({def.pieces.length})</summary>
      <div>
        {groups.map(([g, ps]) => (
          <div key={g}>
            <p>{g}</p>
            {ps.map((p) => (
              <button key={p.id} type="button" aria-pressed={sel === p.id} onClick={() => onPick(p.id)} data-k={p.kind}>
                {p.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function Finale({ def, score, onAgain, onPlay, onMap }: { def: LabDef; score: Score | null; onAgain: () => void; onPlay: () => void; onMap: () => void }) {
  return (
    <div className="l3-fin">
      <p className="l3-kicker">🏁 {score ? "Laboratorio superado" : "Fin de la partida"}</p>
      <h3>{def.title}</h3>
      {score ? (
        <p className="l3-score">
          <span>⏱ {mmss((score.end ?? performance.now()) - score.t0)}</span>
          <span>💡 {plural(score.hints, "pista", "pistas")}</span>
          <span>❌ {plural(score.errors, "error", "errores")}</span>
        </p>
      ) : null}
      <ol className="l3-sum" start={0}>
        {def.steps.map((s) => (
          <li key={s.id}>
            <b>{SHORT(s.goal)}</b>
            <span>{s.pdf.length ? <i className="l3-pdf">✅ {s.pdf.join(" · ")}</i> : null}</span>
            {s.essential ? <i className="l3-ess">⚠️ {s.essential}</i> : null}
          </li>
        ))}
      </ol>
      <p className="l3-end">Logros{score ? "" : " (se consiguen en 🎮 Jugar)"}</p>
      <ul className="l3-achs-big">
        {ACHIEVEMENTS.filter((a) => def.id === "pizarra" || (a.id !== "buen-plan" && a.id !== "desde-la-calle")).map((a) => (
          <li key={a.id} data-on={score?.unlocked.has(a.id) ? "" : undefined}>
            <span aria-hidden="true">{a.icon}</span>
            <b>{a.title}</b>
            <small>{a.desc}</small>
          </li>
        ))}
      </ul>
      <div className="l3-go">
        <button type="button" className="l3-cta" onClick={onPlay}>
          🎮 {score ? "Jugar otra vez" : "Ahora, juega tú"}
        </button>
        <button type="button" onClick={onMap}>
          🗺️ Ver el mapa
        </button>
        {!score ? (
          <button type="button" onClick={onAgain}>
            ↺ Ver otra vez
          </button>
        ) : null}
      </div>
    </div>
  );
}
