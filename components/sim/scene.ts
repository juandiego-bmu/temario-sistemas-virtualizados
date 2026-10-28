// The lab in 3D with three.js: your PC, the VPN, the repository and the two KVM servers with their disks, VMs and networks.
// It redraws from the lab state (sync) and animates what the commands do (play): packets, boots, the camera following you.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { baseName, dirOf, isUp, real, ttyOf, vmName, type Frame, type Fx, type Host, type Img, type Lab, type Vm } from "./model";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const COL = { kvm1: 0x9b7bff, kvm2: 0x58a6ff, vm: 0x3fd6ff, boot: 0xff6bd5, stop: 0xffb547, dead: 0xff4d4d, base: 0x8c9bff, clone: 0x3fd6ff, full: 0x2dd4bf, data: 0x4be38a, link: 0x9aa4b2, br: 0x4be38a, open: 0x4be38a, shut: 0xff5d5d, pc: 0x3fd6ff, vpn: 0xb98cff, repo: 0xffa94d, you: 0xffd84d, tty: 0xffe066 };
const TONE: Record<string, number> = { ok: 0x4be38a, data: 0x3fd6ff, dhcp: 0xffb547, err: 0xff5d5d };

const PC = V(-25, 0, 9);
const VPN = V(-15, 3.2, 3);
const REPO = V(-15, 0, -13);
const SW = 16;
const SH = 6.4;
const SD = 12;
const SRV: Record<string, THREE.Vector3> = { "10.0.16.173": V(6, 0, -7), "10.0.16.174": V(6, 0, -27) };
const SRV_COL: Record<string, number> = { "10.0.16.173": COL.kvm1, "10.0.16.174": COL.kvm2 };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const back = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

export interface World {
  sync: (lab: Lab, now: number) => void;
  play: (fx: Fx[]) => void;
  home: () => void;
  dispose: () => void;
}

/** Build the world inside `el`; `onPick` gets the id of what was clicked (or null). */
export function createWorld(el: HTMLElement, onPick: (id: string | null) => void): World {
  const css = getComputedStyle(document.body);
  const tone = () => new THREE.Color(css.getPropertyValue("--anatomy-page").trim() || "#0b0b0b");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  el.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = "w-labels";
  el.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = tone();
  scene.fog = new THREE.Fog(tone(), 70, 150);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 4;
  controls.maxDistance = 160;

  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x2a2a36, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(14, 30, 18);
  scene.add(sun);

  /* ---------------------------------------------------------------- materials and helpers */
  const mats: THREE.Material[] = [];
  const keep = <M extends THREE.Material>(m: M) => (mats.push(m), m);
  const neon = (color: number, k = 0.75) => keep(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.35, metalness: 0.1 }));
  const glass = (color: number, opacity = 0.07) => keep(new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.1, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }));
  const lineMat = (color: number, opacity = 0.95) => keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  const dashMat = (color: number) => keep(new THREE.LineDashedMaterial({ color, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.9 }));
  const solid = (color: number) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.15 }));
  const edges = (geo: THREE.BufferGeometry, color: number, opacity = 0.95) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat(color, opacity));
  // Neon glow without post-processing: an additive sprite with a soft radial gradient.
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const glowOf = (color: number, size: number, opacity = 0.8) => {
    const sp = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })));
    sp.scale.setScalar(size);
    return sp;
  };
  // Who wins when two labels collide (see tidy): you > servers > VMs > the rest > ports > folders > disks.
  const RANK: Record<string, number> = { you: 7, big: 6, vm: 5, "": 4, small: 3, tray: 2, disk: 1 };
  const label = (cls: string, color: number) => {
    const div = document.createElement("div");
    div.className = `w-lbl ${cls}`;
    div.dataset.r = String(RANK[cls]);
    div.style.setProperty("--c", `#${color.toString(16).padStart(6, "0")}`);
    const o = new CSS2DObject(div);
    return o;
  };
  const text = (o: CSS2DObject, t: string) => {
    if (o.element.textContent !== t) o.element.textContent = t;
  };
  const line = (a: THREE.Vector3, b: THREE.Vector3, mat: THREE.Material) => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
    l.computeLineDistances();
    return l;
  };
  const dispose = (o: THREE.Object3D) => {
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    o.removeFromParent();
  };
  const pick = (o: THREE.Object3D, id: string) => o.traverse((x) => (x.userData.pick = id));

  /* ---------------------------------------------------------------- the static world */
  const floor = new THREE.Mesh(new THREE.CircleGeometry(95, 64), keep(new THREE.MeshStandardMaterial({ color: tone(), roughness: 1 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  scene.add(floor);
  const grid = new THREE.GridHelper(190, 95, 0x3a3a4a, 0x22222c);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.45;
  scene.add(grid);

  // Your PC
  const pc = new THREE.Group();
  pc.position.copy(PC);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 2.6), solid(0x4a5060));
  desk.position.y = 2.1;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2, 0.12), solid(0x22252c));
  screen.position.set(0, 3.45, -0.6);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 1.7), neon(COL.pc, 0.55));
  glow.position.set(0, 3.45, -0.53);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 2), solid(0x3a3f4b));
  tower.position.set(3.2, 1, 0);
  for (const x of [-2.2, 2.2]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.1, 2.2), solid(0x4a5060));
    leg.position.set(x, 1.02, 0);
    pc.add(leg);
  }
  const screenGlow = glowOf(COL.pc, 6, 0.35);
  screenGlow.position.set(0, 3.45, -0.3);
  pc.add(desk, screen, glow, tower, screenGlow);
  const pcLbl = label("big", COL.pc);
  text(pcLbl, "Tu PC · Windows");
  pcLbl.position.set(0, 5.1, 0);
  pc.add(pcLbl);
  pick(pc, "pc");
  scene.add(pc);

  // The VPN gate
  const vpnRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.16, 16, 64), neon(COL.vpn, 0.2));
  vpnRing.position.copy(VPN);
  vpnRing.rotation.y = Math.PI / 2.6;
  const vpnGlow = glowOf(COL.vpn, 7, 0);
  vpnGlow.position.copy(VPN);
  scene.add(vpnGlow);
  const vpnLbl = label("", COL.vpn);
  vpnLbl.position.copy(VPN).add(V(0, 2.3, 0));
  scene.add(vpnRing, vpnLbl);
  pick(vpnRing, "vpn");

  // The image repository
  const repo = new THREE.Group();
  repo.position.copy(REPO);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.2, 2.2), solid(0x3a3f4b));
  rack.position.y = 2.1;
  repo.add(rack);
  for (let i = 0; i < 4; i++) {
    const led = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.05), neon(COL.repo, 0.9));
    led.position.set(0, 0.9 + i * 0.9, 1.12);
    repo.add(led);
  }
  const repoGlow = glowOf(COL.repo, 6, 0.3);
  repoGlow.position.set(0, 2.2, 1.4);
  repo.add(repoGlow);
  const repoLbl = label("", COL.repo);
  text(repoLbl, "www.ho.ac.uma.es · imágenes");
  repoLbl.position.set(0, 5.2, 0);
  repo.add(repoLbl);
  pick(repo, "repo");
  scene.add(repo);

  // Cables: PC → VPN → servers, and the repository to the servers
  const curve = (pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts);
  const ens32 = (ip: string) => SRV[ip].clone().add(V(-SW / 2, 0.9, -SD / 2 + 1.2));
  const cables: Record<string, THREE.CatmullRomCurve3> = {
    pcVpn: curve([PC.clone().add(V(1, 3, -0.8)), V(-20, 4.6, 6), VPN.clone()]),
  };
  for (const ip of Object.keys(SRV)) {
    const end = ens32(ip);
    cables[`vpn:${ip}`] = curve([VPN.clone(), VPN.clone().lerp(end, 0.5).add(V(0, 2.5, 0)), end]);
    cables[`repo:${ip}`] = curve([REPO.clone().add(V(1.1, 3.4, 0)), REPO.clone().lerp(end, 0.5).add(V(0, 3.4, 0)), end]);
  }
  const tubes: Record<string, THREE.Mesh> = {};
  for (const [k, c] of Object.entries(cables)) {
    const t = new THREE.Mesh(new THREE.TubeGeometry(c, 48, 0.06, 6), keep(new THREE.MeshStandardMaterial({ color: 0x5b5f6b, emissive: 0x000000, transparent: true, opacity: 0.8 })));
    tubes[k] = t;
    scene.add(t);
  }
  const flow: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), neon(COL.vpn, 1.4));
    p.add(glowOf(COL.vpn, 1.6, 0.9));
    p.visible = false;
    flow.push(p);
    scene.add(p);
  }

  /* ---------------------------------------------------------------- servers */
  interface Srv {
    group: THREE.Group;
    box: THREE.Mesh;
    rim: THREE.LineSegments;
    title: CSS2DObject;
    dyn: THREE.Group; // rebuilt pieces: trays, links, wires, ports
    disks: Map<string, THREE.Group>;
    vms: Map<number, VmObj>;
    bars: Map<string, THREE.Group>;
  }
  interface VmObj {
    group: THREE.Group;
    box: THREE.Mesh;
    rim: THREE.LineSegments;
    core: THREE.Mesh;
    lbl: CSS2DObject;
    nat?: THREE.Mesh;
    born: number;
  }
  const servers = new Map<string, Srv>();
  for (const [ip, at] of Object.entries(SRV)) {
    const group = new THREE.Group();
    group.position.copy(at);
    const geo = new THREE.BoxGeometry(SW, SH, SD);
    const box = new THREE.Mesh(geo, glass(SRV_COL[ip], 0.05));
    box.position.y = SH / 2;
    const rim = edges(geo, SRV_COL[ip]);
    rim.position.y = SH / 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(SW - 0.4, 0.3, SD - 0.4), solid(0x262833));
    base.position.y = 0.15;
    const title = label("big", SRV_COL[ip]);
    title.position.set(7, SH + 2.3, 0);
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.9), neon(COL.open, 0.6));
    port.position.set(-SW / 2, 0.9, -SD / 2 + 1.2);
    const portLbl = label("", COL.open);
    text(portLbl, "ens32");
    portLbl.position.set(-SW / 2 - 0.2, 2.4, -SD / 2 + 1.2);
    const dyn = new THREE.Group();
    group.add(box, rim, base, title, port, portLbl, dyn);
    pick(box, `srv:${ip}`);
    pick(base, `srv:${ip}`);
    scene.add(group);
    servers.set(ip, { group, box, rim, title, dyn, disks: new Map(), vms: new Map(), bars: new Map() });
    const light = new THREE.PointLight(SRV_COL[ip], 18, 22, 1.6);
    light.position.set(at.x, 4, at.z);
    scene.add(light);
  }

  /* ---------------------------------------------------------------- "you" */
  const you = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 20), neon(COL.you, 1.1));
  cone.rotation.x = Math.PI;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 40), neon(COL.you, 1.3));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = -0.7;
  const youGlow = glowOf(COL.you, 3.4, 0.7);
  youGlow.position.y = -0.2;
  const youLbl = label("you", COL.you);
  text(youLbl, "Tú");
  youLbl.position.y = 1;
  you.add(cone, halo, youGlow, youLbl);
  scene.add(you);
  const youTo = PC.clone().add(V(0, 6.4, 0));
  you.position.copy(youTo);
  let session: THREE.Mesh[] = [];

  /* ---------------------------------------------------------------- dynamic state */
  let dirty = true;
  const nodes = new Map<string, THREE.Vector3>();
  nodes.set("pc", PC.clone().add(V(0, 3.4, 0)));
  nodes.set("vpn", VPN.clone());
  nodes.set("repo", REPO.clone().add(V(0, 3.6, 0)));
  for (const ip of Object.keys(SRV)) nodes.set(`srv:${ip}`, ens32(ip));
  let frameKey = "pc:::";
  let fly: { p0: THREE.Vector3; p1: THREE.Vector3; t0v: THREE.Vector3; t1v: THREE.Vector3; at: number; dur: number } | null = null;
  const tweens: { at: number; dur: number; step: (k: number) => void; end?: () => void }[] = [];
  const now = () => performance.now();
  const tween = (dur: number, step: (k: number) => void, end?: () => void) => tweens.push({ at: now(), dur, step, end });

  // Disk shelves along the left wall: one tray per folder, from the back; each row reads folder | disk | name.
  const diskLayout = (h: Host) => {
    const dirs = [...new Set([...h.files.keys()].map(dirOf))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const counts = dirs.map((d) => [...h.files.keys()].filter((p) => dirOf(p) === d).length);
    const total = counts.reduce((s, n) => s + n * 1.6 + 0.6, 0);
    const k = Math.min(1, (SD - 0.8) / total);
    const out = new Map<string, { z: number; d: number; row: number; first: number }>();
    let z = -SD / 2 + 0.4;
    dirs.forEach((d, i) => {
      const depth = (counts[i] * 1.6 + 0.2) * k;
      out.set(d, { z, d: depth, row: 1.6 * k, first: z + 0.9 * k });
      z += depth + 0.4 * k;
    });
    return out;
  };
  const rank = (d: string) => (d === "/exports/VMs" ? 0 : d === "/home/VMs" ? 1 : 2);

  function diskMesh(img: Img): THREE.Group {
    const g = new THREE.Group();
    const raw = img.fmt === "raw";
    const hgt = img.kind === "link" ? 0.9 : img.kind === "clone" ? 0.22 + Math.min(1.1, img.used / 60000) : img.kind === "data" ? 0.3 + Math.min(1, img.used / 400000) : 1.5;
    const color = img.kind === "link" ? COL.link : img.kind === "clone" ? COL.clone : img.kind === "full" ? COL.full : img.kind === "data" ? COL.data : COL.base;
    const geo = raw ? new THREE.BoxGeometry(1, hgt, 1) : new THREE.CylinderGeometry(0.55, 0.55, hgt, 28);
    if (img.kind === "link") {
      const e = edges(geo, color, 0.8);
      e.position.y = hgt / 2;
      g.add(e);
    } else {
      const m = new THREE.Mesh(geo, img.kind === "clone" ? glass(color, 0.35) : neon(color, img.stale ? 0.15 : 0.4));
      m.position.y = hgt / 2;
      const e = edges(geo, img.stale ? COL.dead : color, 0.9);
      e.position.y = hgt / 2;
      g.add(m, e);
    }
    g.userData.h = hgt;
    return g;
  }

  function sync(lab: Lab, t: number) {
    // VPN
    (vpnRing.material as THREE.MeshStandardMaterial).emissiveIntensity = lab.vpn ? 1.2 : 0.12;
    (vpnGlow.material as THREE.SpriteMaterial).opacity = lab.vpn ? 0.55 : 0;
    text(vpnLbl, lab.vpn ? "VPN conectada" : "VPN · sin conectar");
    const live = lab.vpn ? 0x7a62d6 : 0x3a3d48;
    (tubes.pcVpn.material as THREE.MeshStandardMaterial).emissive.setHex(live);
    for (const ip of Object.keys(SRV)) {
      const h = lab.hosts.find((x) => x.ip === ip)!;
      ((tubes[`vpn:${ip}`].material as THREE.MeshStandardMaterial).emissive as THREE.Color).setHex(lab.vpn && !h.dead && !h.cut ? 0x3d6fd6 : 0x111111);
      syncServer(lab, h, t);
    }
    syncYou(lab);
    dirty = true;
  }

  function syncServer(lab: Lab, h: Host, t: number) {
    const s = servers.get(h.ip)!;
    const color = h.dead ? COL.dead : SRV_COL[h.ip];
    (s.rim.material as THREE.LineBasicMaterial).color.setHex(color);
    (s.box.material as THREE.MeshStandardMaterial).color.setHex(color);
    text(s.title, `${h.label} · ${h.ip}${h.dead ? " · APAGADO" : h.cut ? " · SIN RED" : ""}`);
    s.title.element.classList.toggle("bad", h.dead || h.cut);

    // disks
    const layout = diskLayout(h);
    const seen = new Set<string>();
    const slots = new Map<string, number>();
    for (const [path, img] of h.files) {
      const id = `disk:${h.ip}:${path}`;
      seen.add(id);
      const dir = dirOf(path);
      const tray = layout.get(dir)!;
      const k = slots.get(dir) ?? 0;
      slots.set(dir, k + 1);
      const x = -SW / 2 + 1.6;
      const z = tray.first + k * tray.row;
      let g = s.disks.get(path);
      const sig = `${img.kind}|${img.fmt}|${img.used > 60000 ? 9 : Math.round(img.used / 6000)}|${img.stale}`;
      if (g && g.userData.sig !== sig) {
        dispose(g);
        s.disks.delete(path);
        g = undefined;
      }
      if (!g) {
        g = diskMesh(img);
        g.userData.sig = sig;
        const lbl = label("disk", img.kind === "link" ? COL.link : img.kind === "clone" ? COL.clone : img.kind === "base" ? COL.base : img.kind === "full" ? COL.full : COL.data);
        lbl.center.set(0, 0.5);
        lbl.position.set(0.75, 0.45, 0);
        g.add(lbl);
        g.userData.lbl = lbl;
        const ledM = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), neon(COL.tty, 1.6));
        ledM.position.y = (g.userData.h as number) + 0.1;
        g.add(ledM);
        g.userData.led = ledM;
        pick(g, id);
        s.group.add(g);
        s.disks.set(path, g);
        g.scale.setScalar(0.01);
        const gg = g;
        tween(650, (q) => gg.scale.setScalar(Math.max(0.01, back(q))));
      }
      g.position.set(x, 0.3, z);
      const own = img.kind !== "link" && img.tty === true;
      const inherited = img.kind !== "link" && !own && ttyOf(h, path);
      const led = g.userData.led as THREE.Mesh;
      led.visible = own || inherited;
      led.scale.setScalar(own ? 1 : 0.6);
      text(g.userData.lbl as CSS2DObject, `${baseName(path).replace(/\.qcow2$/, "")}${img.kind === "link" ? " →" : ""}${img.ro ? " 🔒" : ""}`);
      nodes.set(id, s.group.position.clone().add(V(x, 0.3 + (g.userData.h as number), z)));
    }
    for (const [path, g] of s.disks)
      if (!seen.has(`disk:${h.ip}:${path}`)) {
        s.disks.delete(path);
        nodes.delete(`disk:${h.ip}:${path}`);
        tween(380, (q) => g.scale.setScalar(Math.max(0.01, 1 - q)), () => dispose(g));
      }

    // VMs
    const alive = new Set<number>();
    h.vms.forEach((v, i) => {
      alive.add(v.pid);
      const col = i % 2;
      const row = Math.floor(i / 2);
      const pos = V(0.2 + col * 5.7, 1.5, -3.6 + row * (h.vms.length > 4 ? 3.1 : 4));
      let o = s.vms.get(v.pid);
      if (!o) {
        o = makeVm(v);
        s.group.add(o.group);
        s.vms.set(v.pid, o);
        const oo = o;
        oo.group.scale.setScalar(0.01);
        tween(800, (q) => oo.group.scale.setScalar(Math.max(0.01, back(q))));
      }
      o.group.position.copy(pos);
      const booting = !isUp(v, t) && !v.stopped;
      const c = v.stopped || v.paused ? COL.stop : booting ? COL.boot : COL.vm;
      (o.rim.material as THREE.LineBasicMaterial).color.setHex(c);
      (o.box.material as THREE.MeshStandardMaterial).color.setHex(c);
      (o.core.material as THREE.MeshStandardMaterial).color.setHex(c);
      (o.core.material as THREE.MeshStandardMaterial).emissive.setHex(c);
      ((o.core.userData.glow as THREE.Sprite).material as THREE.SpriteMaterial).color.setHex(c);
      o.core.userData.spin = v.stopped || v.paused ? 0 : booting ? 3 : 1;
      const state = v.stopped ? "parada (T)" : v.paused ? "en pausa" : booting ? "arrancando…" : v.nics.map((n) => (n.kind === "user" ? `${n.ip ?? "…"} NAT` : n.ip ?? "sin IP")).join(" · ") || "sin red";
      text(o.lbl, `${vmName(h, v)}\n${state}`);
      const world = s.group.position.clone().add(pos);
      nodes.set(`vm:${v.pid}`, world.clone().add(V(0, 0.2, 0)));
      const user = v.nics.some((n) => n.kind === "user");
      if (user && !o.nat) {
        o.nat = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.07, 10, 36), neon(0xff9f43, 0.9));
        o.nat.position.set(1.05, 1.5, -0.8);
        o.group.add(o.nat);
        pick(o.nat, `vm:${v.pid}`);
      }
      if (o.nat) nodes.set(`nat:${v.pid}`, world.clone().add(V(1.05, 1.5, -0.8)));
    });
    for (const [pid, o] of s.vms)
      if (!alive.has(pid)) {
        s.vms.delete(pid);
        nodes.delete(`vm:${pid}`);
        tween(450, (q) => o.group.scale.setScalar(Math.max(0.01, 1 - q)), () => dispose(o.group));
      }

    // rebuilt every time: trays, backing links, bridges and wires, ports
    for (const c of [...s.dyn.children]) dispose(c);
    for (const [dir, tray] of layout) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, tray.d), solid(0x2c2f3a));
      g.position.set(-SW / 2 + 2.5, 0.3, tray.z + tray.d / 2);
      const l = label("tray", 0x9aa4b2);
      text(l, dir);
      l.center.set(1, 0.5);
      l.position.set(-SW / 2 + 0.95, 0.75, tray.first);
      s.dyn.add(g, l);
    }
    for (const [path, img] of h.files) {
      const from = nodes.get(`disk:${h.ip}:${path}`);
      const target = img.kind === "link" ? img.target : img.backing;
      if (!from || !target) continue;
      const realImg = img.kind === "link" ? h.files.get(target) : real(h, target);
      const to = realImg && nodes.get(`disk:${h.ip}:${realImg.path}`);
      if (!to) continue;
      const a = from.clone().sub(s.group.position);
      const b = to.clone().sub(s.group.position);
      const mid = a.clone().lerp(b, 0.5).add(V(0, 1.2, 0));
      const pts = new THREE.QuadraticBezierCurve3(a, mid, b).getPoints(20);
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dashMat(img.kind === "link" ? COL.link : COL.clone));
      l.computeLineDistances();
      s.dyn.add(l);
    }
    let bi = 0;
    for (const [name, b] of h.bridges) {
      const z = SD / 2 - 1 + bi * 0.55;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 11.4, 12), neon(COL.br, 0.9));
      bar.rotation.z = Math.PI / 2;
      bar.position.set(1.7, 0.55, z);
      pick(bar, `br:${h.ip}:${name}`);
      const l = label("", COL.br);
      const ip = b.method === "manual" ? b.ip : b.method === "auto" ? "DHCP" : "sin IP";
      text(l, `${name} · ${ip}${b.slave ? ` · + ${b.slave}` : ""}`);
      l.position.set(2, 1.1 + bi * 0.75, z);
      s.dyn.add(bar, l);
      nodes.set(`br:${h.ip}:${name}`, s.group.position.clone().add(V(1.7, 0.55, z)));
      if (b.method === "manual" && b.ip) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 14), neon(SRV_COL[h.ip], 1));
        dot.position.set(7.4, 0.55, z);
        const dl = label("small", SRV_COL[h.ip]);
        text(dl, `host ${b.ip.split("/")[0]}`);
        dl.position.set(7.4, 1.2 + bi * 0.75, z);
        s.dyn.add(dot, dl);
      }
      for (const v of h.vms)
        v.nics.forEach((n) => {
          if (n.br !== name) return;
          const p = s.vms.get(v.pid)?.group.position;
          if (!p) return;
          s.dyn.add(line(V(p.x, 0.4, p.z + 1.1), V(p.x, 0.55, z), lineMat(COL.br, 0.85)));
        });
      bi++;
    }
    const ports = new Map<number, { what: string; vm?: Vm; fwd?: boolean }>();
    for (const v of h.vms) {
      if (v.telnet) ports.set(v.telnet, { what: `${v.telnet} telnet`, vm: v });
      for (const n of v.nics) for (const f of n.fwd) ports.set(f.host, { what: `${f.host}→${f.guest}`, vm: v, fwd: true });
    }
    for (const p of h.open) if (!ports.has(p)) ports.set(p, { what: `${p}/tcp` });
    [...ports.keys()]
      .sort((a, b) => a - b)
      .forEach((p, k) => {
        const info = ports.get(p)!;
        const open = h.open.has(p);
        const at = V(-SW / 2 + 0.9 + Math.floor(k / 4) * 3.4, SH - 0.9 - (k % 4) * 1.35, -SD / 2 + 0.1);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 10, 32), neon(open ? COL.open : COL.shut, 1));
        ring.position.copy(at);
        pick(ring, `fw:${h.ip}:${p}`);
        const l = label("small", open ? COL.open : COL.shut);
        text(l, `${info.what}${open ? "" : " 🔒"}`);
        l.center.set(0, 0.5);
        l.position.copy(at).add(V(0.5, 0, 0));
        s.dyn.add(ring, l);
        nodes.set(`fw:${h.ip}:${p}`, s.group.position.clone().add(at));
        if (info.vm) {
          const to = s.vms.get(info.vm.pid)?.group.position;
          if (to) s.dyn.add(line(at, info.fwd && s.vms.get(info.vm.pid)?.nat ? to.clone().add(V(1.05, 1.5, -0.8)) : to.clone().add(V(0, 1.1, 1.2)), dashMat(open ? COL.open : 0x8a8f9c)));
        }
      });
  }

  function makeVm(v: Vm): VmObj {
    const group = new THREE.Group();
    const geo = new THREE.BoxGeometry(2.8, 2.2, 2.4);
    const box = new THREE.Mesh(geo, glass(COL.vm, 0.12));
    const rim = edges(geo, COL.vm);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), neon(COL.vm, 1.1));
    const coreGlow = glowOf(COL.vm, 2.6, 0.55);
    core.userData.glow = coreGlow;
    const lbl = label("vm", COL.vm);
    lbl.position.y = 1.75;
    group.add(box, rim, core, coreGlow, lbl);
    v.nics.forEach((n, k) => {
      const port = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 10), neon(n.kind === "user" ? 0xff9f43 : COL.br, 1.2));
      port.position.set(-0.8 + k * 0.45, -1.1, 1.2);
      group.add(port);
    });
    pick(group, `vm:${v.pid}`);
    return { group, box, rim, core, lbl, born: now() };
  }

  /* ---------------------------------------------------------------- where you are */
  function frameNode(f: Frame): THREE.Vector3 | undefined {
    if (f.k === "pc") return PC.clone().add(V(0, 6.4, 0));
    if (f.k === "server") return SRV[f.ip!].clone().add(V(0, SH + 2.4, 0));
    const p = nodes.get(`vm:${f.pid}`);
    return p?.clone().add(V(0, f.k === "monitor" ? 2.9 : 2.4, 0));
  }

  function syncYou(lab: Lab) {
    const f = lab.stack[lab.stack.length - 1];
    labels.domElement.dataset.focus = f.k;
    const p = frameNode(f);
    if (p) youTo.copy(p);
    text(youLbl, f.k === "pc" ? "Tú · en tu PC" : f.k === "server" ? `Tú · shell de ${lab.hosts.find((h) => h.ip === f.ip)?.label}` : f.k === "monitor" ? "Tú · monitor de QEMU" : `Tú · dentro de la MV${f.via === "telnet" ? " (telnet)" : f.via === "ssh" ? " (ssh)" : ""}`);
    const key = lab.stack.map((x) => `${x.k}:${x.ip ?? ""}:${x.pid ?? ""}:${x.via ?? ""}`).join(">");
    if (key !== frameKey) {
      frameKey = key;
      focus(f);
      drawSession(lab);
    }
  }

  function drawSession(lab: Lab) {
    session.forEach((m) => dispose(m));
    session = [];
    for (let i = 1; i < lab.stack.length; i++) {
      const a = lab.stack[i - 1];
      const b = lab.stack[i];
      if (b.k === "monitor") continue;
      let pts: THREE.Vector3[] | undefined;
      if (a.k === "pc" && b.k === "server") pts = [...cables.pcVpn.getPoints(20), ...cables[`vpn:${b.ip}`].getPoints(20)];
      else {
        const from = a.k === "pc" ? nodes.get("pc") : a.k === "server" ? nodes.get(`srv:${a.ip}`) : nodes.get(`vm:${a.pid}`);
        const to = b.k === "server" ? nodes.get(`srv:${b.ip}`) : nodes.get(`vm:${b.pid}`);
        if (from && to) pts = [from, from.clone().lerp(to, 0.5).add(V(0, 2.4, 0)), to];
      }
      if (!pts) continue;
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.09, 8), neon(COL.you, 0.9));
      session.push(tube);
      scene.add(tube);
    }
  }

  function focus(f: Frame) {
    let target: THREE.Vector3;
    let off: THREE.Vector3;
    if (f.k === "pc") {
      target = PC.clone().add(V(0, 2.6, 0));
      off = V(8, 7, 13);
    } else if (f.k === "server") {
      target = SRV[f.ip!].clone().add(V(-0.5, 1.8, 0));
      off = V(-4, 18, 14);
    } else {
      target = nodes.get(`vm:${f.pid}`)?.clone() ?? SRV[f.ip!].clone();
      off = f.k === "monitor" ? V(3.8, 3.6, 8) : V(-3.4, 4.2, 9);
    }
    flyTo(target, target.clone().add(off.multiplyScalar(fit(1.2))));
    nearTo(f.k === "pc" ? null : f.ip!);
  }
  function nearTo(ip: string | null) {
    servers.forEach((s, k) => (s.title.element.dataset.r = k === ip ? "4" : "6"));
  }

  function flyTo(target: THREE.Vector3, pos: THREE.Vector3) {
    fly = { p0: camera.position.clone(), p1: pos, t0v: controls.target.clone(), t1v: target, at: now(), dur: reduced ? 1 : 1500 };
  }

  /* ---------------------------------------------------------------- effects */
  function play(fx: Fx[]) {
    fx.forEach((f, i) => {
      if (f.k === "packet") window.setTimeout(() => packet(f.path, TONE[f.tone ?? ""] ?? COL.vpn), i * 220);
      else if (f.k === "flash") flash(nodes.get(f.id));
      else if (f.k === "boom") boom(f.ip);
    });
  }

  function packet(path: string[], color: number) {
    const pts: THREE.Vector3[] = [];
    path.forEach((id, i) => {
      if (id.startsWith("br:")) {
        const bar = nodes.get(id);
        if (!bar) return;
        const prev = nodes.get(path[i - 1] ?? "");
        const next = nodes.get(path[i + 1] ?? "");
        if (prev) pts.push(V(prev.x, bar.y, bar.z));
        if (next) pts.push(V(next.x, bar.y, bar.z));
        return;
      }
      if (id === "vpn" || (id.startsWith("srv:") && path[i - 1] === "vpn")) {
        const p = nodes.get(id);
        if (p) {
          if (id === "vpn" && path[i - 1] === "pc") pts.push(...cables.pcVpn.getPoints(14).slice(1));
          else if (id.startsWith("srv:")) pts.push(...cables[`vpn:${id.slice(4)}`].getPoints(14).slice(1));
          else pts.push(p);
        }
        return;
      }
      const p = nodes.get(id);
      if (!p) return;
      const last = pts[pts.length - 1];
      if (last && last.distanceTo(p) > 6) pts.push(last.clone().lerp(p, 0.5).add(V(0, Math.min(5, last.distanceTo(p) * 0.18), 0)));
      pts.push(p.clone());
    });
    if (pts.length < 2) return;
    const c = new THREE.CatmullRomCurve3(pts);
    const len = c.getLength();
    const dur = Math.min(2600, Math.max(900, 500 + len * 38));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 14), neon(color, 2.2));
    head.add(glowOf(color, 2.4, 1));
    const tail = [0.18, 0.13, 0.09].map((r) => new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), neon(color, 1.4)));
    scene.add(head, ...tail);
    tween(
      dur,
      (q) => {
        const u = ease(q);
        head.position.copy(c.getPointAt(u));
        tail.forEach((m, k) => m.position.copy(c.getPointAt(Math.max(0, u - 0.025 * (k + 1)))));
      },
      () => {
        flash(pts[pts.length - 1], color);
        [head, ...tail].forEach(dispose);
      },
    );
  }

  function flash(p?: THREE.Vector3, color = COL.you) {
    if (!p) return;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 40), keep(new THREE.MeshBasicMaterial({ color, transparent: true })));
    ring.position.copy(p);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    tween(
      700,
      (q) => {
        ring.scale.setScalar(1 + q * 3);
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - q;
      },
      () => dispose(ring),
    );
  }

  function boom(ip: string) {
    const s = servers.get(ip);
    if (!s) return;
    const at = s.group.position.clone();
    for (let i = 0; i < 3; i++) window.setTimeout(() => flash(at.clone().add(V(0, 2 + i, 0)), COL.dead), i * 180);
    tween(
      700,
      (q) => s.group.position.set(at.x + Math.sin(q * 60) * 0.25 * (1 - q), at.y, at.z),
      () => s.group.position.copy(at),
    );
  }

  /* ---------------------------------------------------------------- loop, picking, resize */
  let down: [number, number] | null = null;
  const ray = new THREE.Raycaster();
  const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(scene.children, true).find((x) => x.object.userData.pick && x.object.visible);
    onPick((hit?.object.userData.pick as string) ?? null);
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  controls.addEventListener("start", () => (fly = null));

  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    renderer.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();
  // The whole lab in view. Narrow (portrait) stages step the camera back, here and in focus().
  const fit = (w: number) => Math.max(1, w / camera.aspect);
  const overview = () => {
    const t = V(-7, 0, -9);
    return [t, t.clone().add(V(0, 36, 40).multiplyScalar(fit(1.6)))] as const;
  };
  const [t0, p0] = overview();
  controls.target.copy(t0);
  camera.position.copy(p0);

  const themeObs = new MutationObserver(() => {
    const c = tone();
    scene.background = c;
    (scene.fog as THREE.Fog).color = c;
    (floor.material as THREE.MeshStandardMaterial).color = c;
  });
  themeObs.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });

  let raf = 0;
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(el);
  // Map-style decluttering: a label that would cover a more important one hides until there is room again.
  // Inside a VM the shelves (folders and disks) step aside too. Runs right after new labels appear, so they never flash.
  let tidyAt = 0;
  const tidy = (t: number) => {
    dirty = false;
    tidyAt = t;
    const inside = labels.domElement.dataset.focus === "vm" || labels.domElement.dataset.focus === "monitor";
    const kept: DOMRect[] = [];
    const els = [...labels.domElement.children] as HTMLElement[];
    els.sort((a, b) => Number(b.dataset.r) - Number(a.dataset.r));
    for (const e of els) {
      if (e.style.display === "none") continue;
      const r = e.getBoundingClientRect();
      const hide = (inside && Number(e.dataset.r) <= 2) || kept.some((k) => r.left < k.right + 2 && r.right + 2 > k.left && r.top < k.bottom && r.bottom > k.top);
      e.classList.toggle("hide", hide);
      if (!hide) kept.push(r);
    }
  };

  let prev = now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = now();
    const dt = Math.min(0.1, (t - prev) / 1000);
    prev = t;
    if (!visible) return;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const q = Math.min(1, (t - tw.at) / tw.dur);
      tw.step(q);
      if (q >= 1) {
        tweens.splice(i, 1);
        tw.end?.();
      }
    }
    if (fly) {
      const q = Math.min(1, (t - fly.at) / fly.dur);
      const u = ease(q);
      camera.position.lerpVectors(fly.p0, fly.p1, u);
      controls.target.lerpVectors(fly.t0v, fly.t1v, u);
      if (q >= 1) fly = null;
    }
    you.position.lerp(youTo, 1 - Math.pow(0.002, dt));
    cone.position.y = Math.sin(t / 380) * 0.18;
    halo.rotation.z += dt * 1.6;
    vpnRing.rotation.x += dt * 0.4;
    for (const s of servers.values())
      for (const o of s.vms.values()) {
        o.core.rotation.y += dt * (o.core.userData.spin ?? 1) * 1.4;
        o.core.rotation.x += dt * (o.core.userData.spin ?? 1) * 0.6;
        if (o.nat) o.nat.rotation.y += dt * 1.2;
      }
    const vpnOn = (vpnRing.material as THREE.MeshStandardMaterial).emissiveIntensity > 0.5;
    flow.forEach((p, i) => {
      p.visible = vpnOn && !reduced;
      if (!p.visible) return;
      const c = i < 4 ? cables.pcVpn : cables["vpn:10.0.16.173"];
      p.position.copy(c.getPointAt(((t / 2600 + i / 4) % 1 + 1) % 1));
    });
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
    if (dirty || t - tidyAt > 120) tidy(t);
  };
  loop();

  return {
    sync,
    play,
    home: () => {
      flyTo(...overview());
      nearTo(null);
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeObs.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      glowTex.dispose();
      scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.());
      mats.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
