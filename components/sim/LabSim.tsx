"use client";

import * as React from "react";
import { MISSIONS } from "./missions";
import { baseName, chain, dirOf, exec, hostOf, newLab, prompt, real, refresh, top, ttyOf, vmName, vmOf, type Lab, type Line } from "./model";
import type { World } from "./scene";

interface Row {
  t: string;
  c?: string;
  cmd?: boolean;
  act?: Line["act"];
}

const INTRO: Row[] = [
  { t: "Laboratorio de Arquitectura de Sistemas Virtualizados · simulado", c: "ok" },
  { t: "Estás en tu PC, en casa. Sigue las misiones de la derecha o escribe help.", c: "dim" },
  { t: "Los comandos son los de verdad; la salida y los tiempos, una simulación fiel a las prácticas.", c: "dim" },
];

const CMDS: Record<string, string[]> = {
  pc: ["vpn", "ssh", "telnet", "curl", "ping", "help", "clear"],
  server: ["mkdir", "cd", "ls", "pwd", "wget", "ln", "chmod", "cp", "mv", "rm", "qemu-img", "qemu-system-x86_64", "pgrep", "ps", "kill", "pkill", "jobs", "fg", "disown", "firewall-cmd", "nmcli", "ip", "telnet", "ssh", "ping", "cat", "echo", "free", "alias", "exit", "help", "clear"],
  vm: ["ip", "ping", "ssh", "wget", "udhcpc", "lsblk", "vi", "cat", "poweroff", "reboot", "exit", "help", "clear"],
  monitor: ["info", "stop", "cont", "system_powerdown", "system_reset", "savevm", "quit", "help"],
};

const where = (lab: Lab) => {
  const f = top(lab);
  if (f.k === "pc") return "tu PC";
  const h = hostOf(lab, f.ip);
  if (f.k === "server") return `${h?.label} (${h?.name})`;
  const hit = vmOf(lab, f.pid);
  const name = hit ? vmName(hit.h, hit.v) : "MV";
  return f.k === "monitor" ? `el monitor de QEMU de ${name}` : `la MV ${name}${f.via === "telnet" ? " por telnet" : f.via === "ssh" ? " por SSH" : ""}`;
};

/** The practices as a game: a real-command terminal driving a 3D lab, with guided missions. */
export function LabSim() {
  const stage = React.useRef<HTMLDivElement>(null);
  const world = React.useRef<World | null>(null);
  const lab = React.useRef<Lab>(newLab());
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  const [rows, setRows] = React.useState<Row[]>(INTRO);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [mission, setMission] = React.useState("p1");
  const [picked, setPicked] = React.useState<string | null>(null);
  const [armed, setArmed] = React.useState(false);
  const [state3d, setState3d] = React.useState<"idle" | "loading" | "on" | "fail">("idle");
  const [hint, setHint] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const history = React.useRef<string[]>([]);
  const hpos = React.useRef(-1);
  const box = React.useRef<HTMLDivElement>(null);
  const field = React.useRef<HTMLInputElement>(null);
  const alive = React.useRef(true);
  const doneBefore = React.useRef<Set<string>>(new Set());
  const rowsReady = React.useRef(false);

  const sync = React.useCallback(() => {
    refresh(lab.current, performance.now());
    world.current?.sync(lab.current, performance.now());
    const now = new Set<string>();
    for (const m of MISSIONS) m.steps.forEach((s, i) => s.done(lab.current) && now.add(`${m.id}:${i}`));
    const fresh = [...now].filter((k) => !doneBefore.current.has(k));
    if (fresh.length && rowsReady.current) {
      const [mid, idx] = fresh[fresh.length - 1].split(":");
      const m = MISSIONS.find((x) => x.id === mid)!;
      const all = m.steps.every((_, i) => now.has(`${m.id}:${i}`));
      setToast(all ? `🏆 ${m.title} completada` : `✓ ${m.steps[+idx].title}`);
      window.setTimeout(() => alive.current && setToast(null), 2600);
      setHint(false);
    }
    doneBefore.current = now;
    bump();
  }, []);

  // Load the 3D world only when the section comes near the screen.
  React.useEffect(() => {
    alive.current = true;
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || world.current) return;
        io.disconnect();
        setState3d("loading");
        import("./scene")
          .then((m) => {
            if (!alive.current) return;
            world.current = m.createWorld(el, setPicked);
            setState3d("on");
            sync();
          })
          .catch(() => setState3d("fail"));
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    const tick = window.setInterval(sync, 800);
    rowsReady.current = true;
    return () => {
      alive.current = false;
      io.disconnect();
      window.clearInterval(tick);
      world.current?.dispose();
      world.current = null;
    };
  }, [sync]);

  React.useEffect(() => {
    const b = box.current;
    if (b) b.scrollTop = b.scrollHeight;
  }, [rows]);

  const push = (r: Row) => setRows((x) => [...x.slice(-400), r]);

  const run = (cmd: string) => {
    const L = lab.current;
    push({ t: `${prompt(L)} ${cmd}`, cmd: true });
    const trimmed = cmd.trim();
    if (trimmed && !trimmed.startsWith("!")) {
      history.current.push(cmd);
      hpos.current = -1;
    }
    if (trimmed === "clear" || trimmed === "cls") return setRows([]);
    const { out, fx } = exec(L, cmd, performance.now());
    let last = 0;
    for (const l of out) {
      const row: Row = { t: l.t, c: l.c, act: l.act };
      if (l.d) {
        last = Math.max(last, l.d);
        window.setTimeout(() => alive.current && push(row), l.d);
      } else push(row);
    }
    if (last) {
      setBusy(true);
      window.setTimeout(() => {
        if (!alive.current) return;
        setBusy(false);
        sync();
        field.current?.focus();
      }, last + 60);
    }
    world.current?.play(fx);
    sync();
  };

  const reset = () => {
    lab.current = newLab();
    doneBefore.current = new Set();
    setRows([...INTRO, { t: "Laboratorio reiniciado.", c: "warn" }]);
    setPicked(null);
    sync();
    world.current?.home();
  };

  const complete = (s: string) => {
    const L = lab.current;
    const f = top(L);
    const words = s.split(" ");
    const lastWord = words.pop() ?? "";
    let pool: string[] = [];
    if (!words.length) pool = CMDS[f.k] ?? [];
    else if (f.k === "server") {
      const h = hostOf(L, f.ip)!;
      const dir = lastWord.includes("/") ? dirOf(`${lastWord.startsWith("/") ? "" : `${h.cwd}/`}${lastWord}x`) : h.cwd;
      const prefix = lastWord.includes("/") ? lastWord.slice(0, lastWord.lastIndexOf("/") + 1) : "";
      pool = [...h.files.keys(), ...h.dirs].filter((p) => dirOf(p) === dir && p !== dir).map((p) => prefix + baseName(p) + (h.dirs.has(p) ? "/" : ""));
    }
    const hits = pool.filter((w) => w.startsWith(lastWord));
    if (hits.length === 1) return [...words, hits[0]].join(" ") + (hits[0].endsWith("/") ? "" : " ");
    if (hits.length > 1) push({ t: hits.join("  "), c: "dim" });
    return s;
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const L = lab.current;
    if (armed) {
      e.preventDefault();
      setArmed(false);
      const k = e.key.toLowerCase();
      if (k === "x" || k === "c") run(`^A${k}`);
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setArmed(true);
      return;
    }
    if (e.ctrlKey && e.key === "]") {
      e.preventDefault();
      return run("^]");
    }
    if (e.ctrlKey && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
      e.preventDefault();
      setInput("");
      return run("^C");
    }
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      return setRows([]);
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (L.menu) return run("TAB");
      return setInput((s) => complete(s));
    }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const H = history.current;
      if (!H.length) return;
      let p = hpos.current < 0 ? H.length : hpos.current;
      p = e.key === "ArrowUp" ? Math.max(0, p - 1) : Math.min(H.length, p + 1);
      hpos.current = p;
      setInput(H[p] ?? "");
    }
  };

  const L = lab.current;
  const f = top(L);
  const m = MISSIONS.find((x) => x.id === mission)!;
  const status = m.steps.map((s) => s.done(L));
  const current = status.indexOf(false);
  const keys: [string, string][] = [];
  if (L.menu) keys.push(["Tab", "TAB"], ["Intro", ""]);
  else if (f.k === "vm" && f.via === "none") keys.push(["Ctrl+C", "^C"]);
  else if (f.k === "vm") {
    if (f.via === "telnet") keys.push(["Ctrl+] (salir de telnet)", "^]"]);
    if (f.via !== "ssh") keys.push(["Ctrl+A x", "^Ax"], ["Ctrl+A c", "^Ac"]);
  } else if (f.k === "monitor") keys.push(["Ctrl+A c (volver)", "^Ac"]);

  return (
    <div className="sim reveal">
      <div className="sim-stage" ref={stage} data-state={state3d}>
        <div className="sim-hud">
          <span className="sim-where" data-k={f.k}>
            Estás en <b>{where(L)}</b>
          </span>
          <button type="button" onClick={() => world.current?.home()}>
            Vista general
          </button>
          <button type="button" onClick={reset}>
            Reiniciar
          </button>
        </div>
        {state3d !== "on" ? <p className="sim-wait">{state3d === "fail" ? "Tu navegador no puede mostrar el 3D (WebGL), pero la terminal y las misiones funcionan igual." : "Cargando el laboratorio en 3D…"}</p> : null}
        {picked ? <Info lab={L} id={picked} close={() => setPicked(null)} /> : null}
        {toast ? (
          <div className="sim-toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>

      <div className="sim-panels">
        <div className="sim-term" onClick={() => field.current?.focus()}>
          <div className="sim-out" ref={box} aria-live="polite">
            {rows.map((r, i) => (
              <div key={i} className="sim-row" data-c={r.c} data-cmd={r.cmd ? "" : undefined}>
                {r.t}
                {r.act ? (
                  <button type="button" className="sim-act" onClick={() => run(r.act!.cmd)}>
                    {r.act.label}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <form
            className="sim-in"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              const v = input;
              setInput("");
              run(v);
            }}
          >
            <span className="sim-prompt" data-k={f.k}>
              {armed ? "^A" : prompt(L)}
            </span>
            <input ref={field} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={busy} spellCheck={false} autoCapitalize="off" autoComplete="off" aria-label="Comando" placeholder={busy ? "…" : L.menu ? "Tab o Intro" : "escribe un comando"} />
          </form>
          {keys.length ? (
            <div className="sim-keys">
              {keys.map(([label, k]) => (
                <button key={label} type="button" onClick={() => run(k)} disabled={busy}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="sim-missions">
          <div className="sim-tabs" role="tablist">
            {MISSIONS.map((x) => {
              const n = x.steps.filter((s) => s.done(L)).length;
              return (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={x.id === mission}
                  onClick={() => {
                    setMission(x.id);
                    setHint(false);
                  }}
                >
                  {x.title} <span>{n}/{x.steps.length}</span>
                </button>
              );
            })}
          </div>
          <div className="sim-bar" aria-hidden="true">
            <i style={{ width: `${(status.filter(Boolean).length / status.length) * 100}%` }} />
          </div>
          <ol className="sim-steps">
            {m.steps.map((s, i) => (
              <li key={s.title} data-done={status[i] ? "" : undefined} data-now={i === current ? "" : undefined}>
                <span className="sim-step-t">{s.title}</span>
                {i === current ? (
                  <div className="sim-step-body">
                    <p>{s.why}</p>
                    {hint ? (
                      <div className="sim-hints">
                        {s.hint.map((h) => (
                          <button
                            key={h}
                            type="button"
                            title="Escribirlo en la terminal"
                            onClick={() => {
                              if (/^(Tab|Ctrl\+)/.test(h)) return run(h === "Tab" ? "TAB" : h.replace("Ctrl+A ", "^A").replace("Ctrl+]", "^]"));
                              setInput(h);
                              field.current?.focus();
                            }}
                          >
                            <code>{h}</code>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button type="button" className="sim-hint-btn" onClick={() => setHint(true)}>
                        💡 Ver pista
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          {current < 0 ? <p className="sim-win">🏆 Misión completada. Prueba la siguiente o el modo libre: el laboratorio es tuyo.</p> : null}
        </aside>
      </div>
    </div>
  );
}

/** The card for whatever you clicked in the 3D world. */
function Info({ lab, id, close }: { lab: Lab; id: string; close: () => void }) {
  const [kind, ip, ...rest] = id.split(":");
  const h = hostOf(lab, ip);
  let title = "";
  let lines: string[] = [];
  if (id === "pc") {
    title = "Tu PC";
    lines = ["Windows 11 (el del laboratorio o el de casa).", "Desde aquí: vpn, ssh root@10.0.16.173, telnet IP PUERTO, curl http://IP:PUERTO.", "En el examen no hay Internet: usa man en los servidores."];
  } else if (id === "vpn") {
    title = "VPN de la universidad";
    lines = [lab.vpn ? "Conectada." : "Sin conectar.", "Desde casa es la única forma de llegar a la LAN de servidores (10.0.16.0/24). En el laboratorio no hace falta."];
  } else if (id === "repo") {
    title = "www.ho.ac.uma.es";
    lines = ["Repositorio local de imágenes: los servidores no tienen Internet.", "wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2", "También alpine-webserver.qcow2 (un linked clone) y alpine-dhcp.qcow2."];
  } else if (kind === "srv" && h) {
    title = `${h.label} · ${h.name}`;
    lines = [`IP ${h.ip} · Fedora 34 · QEMU 5.2 con KVM (VT-x) · ~1,9 GiB de RAM`, h.dead ? "APAGADO: solo el profesor puede encenderlo." : `${h.vms.length} MV en marcha · ${h.files.size} discos`, `Puertos abiertos en el firewall: ${[...h.open].map((p) => `${p}/tcp`).join(", ") || "ninguno (solo ssh)"}`, `Bridges: ${[...h.bridges.keys()].join(", ") || "ninguno"} · bridge.conf: ${[...h.allow].map((a) => `allow ${a}`).join(", ")}`];
  } else if (kind === "disk" && h) {
    const path = rest.join(":");
    const f = h.files.get(path);
    const img = real(h, path);
    title = baseName(path);
    if (f?.kind === "link") lines = [`Enlace simbólico → ${f.target}`, img ? "Apunta a una imagen que existe." : "Apunta a algo que no existe."];
    else if (img) {
      const ch = chain(h, path).list.map((x) => baseName(x.path));
      const what = { base: "Imagen base (plantilla)", clone: "Linked clone: solo guarda lo que cambia", full: "Full clone: copia independiente", data: "Disco vacío", link: "" }[img.kind];
      lines = [what, `${path}`, `Formato ${img.fmt}${img.fmt === "qcow2" ? " (index: copy-on-write)" : " (flat: sin CoW)"} · tamaño virtual ${img.virt >= 1024 ? `${img.virt / 1024} GiB` : `${img.virt} MiB`} · ocupa ${img.used >= 1024 ? `${Math.round(img.used / 1024)} MiB` : `${img.used} KiB`}`];
      if (ch.length > 1) lines.push(`Cadena: ${ch.join(" → ")}`);
      lines.push(`console=ttyS0: ${img.tty === true ? "sí, en su propio disco" : ttyOf(h, path) ? "sí, heredado de su base" : "no (arranca con pantalla negra)"}`);
      if (img.snaps.length) lines.push(`Snapshots: ${img.snaps.map((s) => s.name).join(", ")}`);
      if (img.stale) lines.push("⚠ Su base cambió después de crearlo: datos incoherentes.");
    }
  } else if (kind === "vm") {
    const hit = vmOf(lab, +ip);
    if (hit) {
      const { h: hh, v } = hit;
      title = `${vmName(hh, v)} · PID ${v.pid}`;
      lines = [`${v.mem} MiB · ${v.smp} vCPU · ${v.kvm ? "KVM (VT-x)" : "sin KVM: TCG, lento"}${v.tmp ? " · -snapshot" : ""}`, `Disco: ${chain(hh, v.disk).list.map((x) => baseName(x.path)).join(" → ")}`];
      v.extra.forEach((e) => lines.push(`Disco extra: ${baseName(e.path)} (${e.iface})`));
      v.nics.forEach((n, k) => lines.push(`eth${k}: ${n.model} · MAC ${n.mac} · ${n.kind === "user" ? "user (SLiRP)" : `bridge ${n.br}`} · ${n.ip ?? "sin IP"}${n.fwd.length ? ` · hostfwd ${n.fwd.map((x) => `${x.host}→${x.guest}`).join(", ")}` : ""}`));
      if (v.telnet) lines.push(`Consola: telnet al puerto ${v.telnet}${v.mon ? " (con monitor: mon:)" : ""}`);
      if (v.qmp) lines.push(`QMP: ${v.qmp}`);
      lines.push(`Estado: ${v.stopped ? "parada (T): esperaba el teclado; < /dev/null" : v.paused ? "en pausa" : "en marcha"}`);
    }
  } else if (kind === "br" && h) {
    const name = rest[0];
    const b = h.bridges.get(name);
    title = `Bridge ${name}`;
    if (b) {
      const members = h.vms.flatMap((v) => v.nics.filter((n) => n.br === name).map((n) => `${vmName(h, v)} (${n.mac}${n.ip ? `, ${n.ip}` : ""})`));
      lines = [`Conexión ${b.con} · IPv4 ${b.method === "manual" ? b.ip : b.method}`, `Conectados: ${members.join(", ") || "nadie (NO-CARRIER)"}`, b.slave ? `Con la NIC real ${b.slave}: modo bridged` : "Sin NIC real: LAN privada (host-only)", h.allow.has(name) ? `allow ${name} en bridge.conf ✓` : `Falta allow ${name} en /etc/qemu/bridge.conf`];
    }
  } else if (kind === "fw" && h) {
    const port = +rest[0];
    const vm = h.vms.find((v) => v.telnet === port || v.nics.some((n) => n.fwd.some((x) => x.host === port)));
    title = `Puerto ${port}/tcp de ${h.label}`;
    lines = [h.open.has(port) ? "Abierto en el firewall: se puede entrar desde tu PC." : "Cerrado en el firewall: solo se llega desde el propio servidor.", vm ? (vm.telnet === port ? `Consola por telnet de ${vmName(h, vm)}` : `hostfwd hacia ${vmName(h, vm)}`) : "Ningún servicio escucha aquí."];
  }
  if (!title) return null;
  return (
    <div className="sim-info" role="dialog" aria-label={title}>
      <button type="button" className="sim-info-x" onClick={close} aria-label="Cerrar">
        ×
      </button>
      <strong>{title}</strong>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </div>
  );
}
