// The two 2026 labs in 3D: two glass hotels (KVM1 violet, KVM2 blue) with a floor per bridge, a room per VM, the VXLAN
// passages between them, the firewall gates, the street and your terminals. sync() redraws from the lab, play() animates the Fx.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { asking, baseName, consoles, isUp, links, real, serving, vmName, type Frame, type Fx, type Host, type Lab, type Term, type Vm } from "./model";

export type Sfx = "tick" | "whoosh" | "chime" | "thud";
/** A clickable map piece (its node is a scene id: srv:IP, br:IP:BR, vx:IP:IF, vm:IP:NAME, cable:IP:NAME:NIC…). */
export interface HotPiece {
  id: string;
  node: string;
  name: string;
  kind: string;
}
export interface Hotel {
  sync: (lab: Lab, now: number) => void;
  play: (fx: Fx[]) => void;
  focus: (id: string, sheet?: boolean) => void;
  setSpeed: (x: number) => void;
  setMap: (pieces: HotPiece[] | null) => void;
  light: (nodes: string[], sel?: string | null) => void;
  finale: () => number; // ms the light show lasts (0: none)
  lapse: (ms: number) => void;
  sound: (on: boolean) => void;
  sfx: (k: Sfx) => void;
  dispose: () => void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const back = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

const K1 = "10.0.16.173";
const K2 = "10.0.16.174";
const COL = { kvm1: 0x9b7bff, kvm2: 0x58a6ff, pc: 0x3fd6ff, room: 0x3fd6ff, boot: 0xff6bd5, stop: 0xffb547, ok: 0x4be38a, err: 0xff4d5e, tty: 0xffd84d, user: 0xff9f43, repo: 0xffa94d, base: 0x9c8cff, clone: 0x3fd6ff, vpn: 0xb98cff, wire: 0x3b4a7a };
const LAN = [0x2ee6b8, 0xffc857, 0xff7ad9, 0x7ae0ff]; // one colour per floor: LAN1 teal, LAN2 gold…
const TERM: Record<Term, { col: number; name: string }> = { kvm1: { col: COL.kvm1, name: "Terminal KVM1" }, kvm2: { col: COL.kvm2, name: "Terminal KVM2" }, pc: { col: COL.pc, name: "Tu PC" } };
const DORA = { discover: 0xffc857, offer: 0x3fd6ff, request: 0xc39bff, ack: 0x4be38a } as const;
const TONE: Record<string, number> = { ok: 0x4be38a, data: 0x3fd6ff, dhcp: 0xffc857, err: 0xff4d5e };

/* Layout: towers side by side along x, the street in front (+z), the repository behind. */
const TW = 13;
const TD = 9;
const GAP = 7;
const SIDE: Record<string, number> = { [K1]: 1, [K2]: -1 }; // towards the other tower
const TX: Record<string, number> = { [K1]: -(GAP + TW / 2), [K2]: GAP + TW / 2 };
const COLOR: Record<string, number> = { [K1]: COL.kvm1, [K2]: COL.kvm2 };
const inner = (ip: string) => TX[ip] + (SIDE[ip] * TW) / 2;
const outer = (ip: string) => TX[ip] - (SIDE[ip] * TW) / 2;
const LV = (l: number) => (l <= 0 ? 0 : 4.6 + (l - 1) * 7.6); // floor of bridge level l
const ZR = 1.9; // corridors
const ZROOM = -1.5;
const FRONT = TD / 2;
const RW = 2.6;
const RH = 2;
const RD = 2.3;
const GY = 1.5; // ens32 and the firewall gate
const PC = V(0, 0, 15.5);
const VPN = V(0, 2.6, 9.6);
const REPO = V(0, 0, -14);
const rowY = (key: string) => {
  const [k, n] = key.split(":");
  const l = +n;
  return k === "f" ? LV(l) + 0.25 + RH / 2 : (LV(l) + LV(l + 1)) / 2 + (l === 0 ? 0.35 : 0);
};

/* ---------------------------------------------------------------- sound (WebAudio, off by default) */
function makeAudio() {
  let ac: AudioContext | null = null;
  let on = false;
  let last = 0;
  const ctx = () => (ac ??= new AudioContext());
  const blip = (f0: number, f1: number, dur: number, type: OscillatorType, gain: number, at = 0) => {
    const a = ctx();
    const t = a.currentTime + at;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const whoosh = () => {
    const a = ctx();
    const t = a.currentTime;
    const buf = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(380, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t);
  };
  return {
    set(v: boolean) {
      on = v;
      if (v) void ctx().resume();
    },
    play(k: Sfx) {
      if (!on) return;
      const n = performance.now();
      if (k === "tick") {
        if (n - last < 45) return;
        last = n;
        blip(2300, 1900, 0.025, "square", 0.012);
      } else if (k === "whoosh") whoosh();
      else if (k === "chime") {
        blip(880, 880, 0.5, "sine", 0.06);
        blip(1320, 1320, 0.7, "sine", 0.05, 0.11);
      } else blip(130, 42, 0.42, "sine", 0.28);
    },
    close() {
      void ac?.close();
    },
  };
}

/* ---------------------------------------------------------------- the world */
export function createHotel(el: HTMLElement, cb: { pick: (id: string | null) => void; hover: (id: string | null) => void }): Hotel {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = reduced || matchMedia("(pointer: coarse)").matches || el.clientWidth < 640;
  const audio = makeAudio();

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  el.appendChild(renderer.domElement);
  const css = new CSS2DRenderer();
  css.domElement.className = "h-labels";
  el.appendChild(css.domElement);

  const scene = new THREE.Scene();
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const sky = new THREE.CanvasTexture(skyCanvas);
  sky.colorSpace = THREE.SRGBColorSpace;
  const paintSky = (dusk: number) => {
    const g = skyCanvas.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 256);
    const top = new THREE.Color(0x0b0d2a).lerp(new THREE.Color(0x3a1446), dusk);
    const mid = new THREE.Color(0x070a1c).lerp(new THREE.Color(0x4a1f2e), dusk);
    gr.addColorStop(0, `#${top.getHexString()}`);
    gr.addColorStop(0.55, `#${mid.getHexString()}`);
    gr.addColorStop(1, "#03040a");
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    sky.needsUpdate = true;
  };
  paintSky(0);
  scene.background = sky;
  scene.fog = new THREE.FogExp2(0x04050d, 0.0085);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 4;
  controls.maxDistance = 150;
  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x0b0b18, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(12, 30, 22);
  scene.add(sun);

  // Post-processing: bloom for the neon, skipped on phones, low-end and reduced motion.
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (!lite) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.5, 0.3);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  /* ---------------------------------------------------------------- materials, labels, helpers */
  const shared = <M extends THREE.Material>(m: M) => ((m.userData.shared = true), m);
  const neon = (c: number, k = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.35, metalness: 0.1 });
  const glass = (c: number, o = 0.08) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.08, transparent: true, opacity: o, roughness: 0.12, metalness: 0.5, depthWrite: false, side: THREE.DoubleSide });
  const lineM = (c: number, o = 0.9) => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o });
  const solid = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2 });
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.22, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const glowCache = new Map<string, THREE.SpriteMaterial>();
  const spriteMat = (c: number, o: number) => new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowMat = (c: number, o: number) => {
    const k = `${c}:${o.toFixed(2)}`;
    let m = glowCache.get(k);
    if (!m) glowCache.set(k, (m = shared(spriteMat(c, o))));
    return m;
  };
  const glow = (c: number, size: number, o = 0.8, own = false) => {
    const s = new THREE.Sprite(own ? spriteMat(c, o) : glowMat(c, o));
    s.scale.setScalar(size);
    return s;
  };
  const edges = (geo: THREE.BufferGeometry, c: number, o = 0.9) => new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineM(c, o));
  const tube = (pts: THREE.Vector3[], r: number, mat: THREE.Material, seg = 48) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8), mat);
  /** Remove an object for good: its labels leave the DOM and its own geometry and materials are freed. */
  const drop = (o: THREE.Object3D) => {
    o.traverse((x) => {
      if (x instanceof CSS2DObject) x.element.remove();
      const m = x as THREE.Mesh;
      m.geometry?.dispose?.();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      for (const k of [mm].flat()) if (k && !k.userData.shared) k.dispose();
    });
    o.removeFromParent();
  };
  const pick = (o: THREE.Object3D, id: string) => o.traverse((x) => (x.userData.pick = id));

  // Who wins when two labels collide (tidy): towers > effects > terminals/tunnels > rooms > corridors > the rest > disks.
  const RANK = { title: 10, fx: 9, term: 8, tube: 8, room: 7, rail: 6, gate: 6, door: 6, end: 5, wait: 5, misc: 3, disk: 1 } as const;
  type Kind = keyof typeof RANK;
  let dirty = true;
  const label = (cls: Kind, color: number, t = "") => {
    const d = document.createElement("div");
    d.className = `h-lbl h-${cls}`;
    d.dataset.r = String(RANK[cls]);
    d.style.setProperty("--c", hex(color));
    d.textContent = t;
    dirty = true;
    return new CSS2DObject(d);
  };
  /** A label's text; `short` is what it shrinks to when the full text would cover a more important label ("a|b": a, then b). */
  const setText = (o: CSS2DObject, t: string, short = "") => {
    const e = o.element;
    if (e.dataset.full === t && (e.dataset.short ?? "") === short) return;
    e.dataset.full = t;
    e.dataset.short = short;
    delete e.dataset.size;
    e.textContent = t;
    dirty = true;
  };
  const setCol = (o: CSS2DObject, c: number) => o.element.style.setProperty("--c", hex(c));

  /* ---------------------------------------------------------------- animation plumbing */
  const now = () => performance.now();
  let speed = 1;
  const tweens: { at: number; dur: number; step: (q: number) => void; end?: () => void }[] = [];
  const tween = (dur: number, step: (q: number) => void, end?: () => void) => tweens.push({ at: now(), dur: Math.max(1, dur), step, end });
  const timers: { at: number; fn: () => void }[] = [];
  const later = (ms: number, fn: () => void) => timers.push({ at: now() + ms, fn });
  let shakeUntil = 0;
  const shake = () => {
    if (!reduced) shakeUntil = now() + 320;
  };

  /* ---------------------------------------------------------------- the static world */
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 64), shared(solid(0x05060e)));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  scene.add(ground);
  const gridTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.strokeStyle = "rgba(90,120,255,0.55)";
    g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(70, 70);
    t.anisotropy = 4;
    return t;
  })();
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(280, 280), shared(new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, opacity: 0.28, depthWrite: false })));
  grid.rotation.x = -Math.PI / 2;
  scene.add(grid);
  // stars
  {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.08 + Math.random() * 0.9;
      const r = 230;
      pos.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r * 0.7 + 10, Math.sin(a) * Math.cos(e) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, shared(new THREE.PointsMaterial({ color: 0xbfd0ff, size: 1.1, sizeAttenuation: true, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    stars.name = "stars";
    scene.add(stars);
  }
  const stars = scene.getObjectByName("stars")!;

  // the street, your PC and the VPN
  const road = new THREE.Mesh(new THREE.PlaneGeometry(64, 6), shared(solid(0x0a0c16)));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, 9.6);
  scene.add(road);
  for (let x = -30; x <= 30; x += 3) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.12), shared(new THREE.MeshBasicMaterial({ color: 0x39406a })));
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.02, 9.6);
    scene.add(d);
  }
  const pcG = new THREE.Group();
  pcG.position.copy(PC);
  {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 1.8), shared(solid(0x2a2f44)));
    desk.position.y = 1.5;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), shared(neon(COL.pc, 0.7)));
    screen.position.set(0, 2.5, -0.5);
    screen.rotation.y = Math.PI;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 6, 16), shared(neon(COL.pc, 0.35)));
    body.position.set(0, 1.25, 1.4);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), shared(neon(COL.pc, 0.6)));
    head.position.set(0, 2.45, 1.4);
    pcG.add(desk, screen, body, head, glow(COL.pc, 5, 0.25));
    const l = label("misc", COL.pc, "Tu PC (fuera)");
    l.position.set(0, 3.7, 0.4);
    pcG.add(l);
    pick(pcG, "pc");
  }
  scene.add(pcG);
  const vpnRing = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 12, 48), shared(neon(COL.vpn, 1.2)));
  vpnRing.position.copy(VPN);
  const vpnGlow = glow(COL.vpn, 4.5, 0.35);
  vpnGlow.position.copy(VPN);
  scene.add(vpnRing, vpnGlow);
  {
    const l = label("misc", COL.vpn, "VPN");
    l.position.copy(VPN).add(V(0, 1.9, 0));
    scene.add(l);
  }
  const repo = new THREE.Group();
  repo.position.copy(REPO);
  {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.8, 1.6), shared(solid(0x22263a)));
    rack.position.y = 1.9;
    repo.add(rack);
    for (let i = 0; i < 4; i++) {
      const led = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.05), shared(neon(COL.repo, 1.2)));
      led.position.set(0, 0.8 + i * 0.8, 0.82);
      repo.add(led);
    }
    const l = label("misc", COL.repo, "repositorio de imágenes");
    l.position.set(0, 4.7, 0);
    repo.add(l);
  }
  scene.add(repo);

  /* ---------------------------------------------------------------- towers (static shell, height follows the floors) */
  interface Gate {
    ring: THREE.Mesh;
    wall: THREE.Mesh;
    lbl: CSS2DObject;
    open: number; // 0 closed … 1 open (animated towards the lab state)
    to: number;
  }
  interface Tower {
    g: THREE.Group;
    shell: THREE.Group; // scaled in y
    strips: THREE.MeshStandardMaterial;
    glassM: THREE.MeshStandardMaterial;
    rimM: THREE.LineBasicMaterial;
    near: number; // 1 far … 0.15 when the camera is next to the tower (its shell fades: x-ray)
    title: CSS2DObject;
    bands: THREE.LineLoop[];
    h: number;
    hTo: number;
    slabs: Map<number, THREE.Group>;
    gate: Gate;
    pulse: number;
  }
  const towers = new Map<string, Tower>();
  for (const ip of [K1, K2]) {
    const c = COLOR[ip];
    const g = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(9.6, 10.2, 0.32, 6), shared(solid(0x0d1020)));
    plat.position.set(TX[ip], 0.12, 0);
    plat.rotation.y = Math.PI / 6;
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(9.9, 0.07, 6, 6), shared(neon(c, 0.7)));
    rimRing.rotation.set(Math.PI / 2, 0, Math.PI / 6);
    rimRing.position.set(TX[ip], 0.3, 0);
    const shell = new THREE.Group();
    shell.position.set(TX[ip], 0.28, 0);
    const unit = new THREE.BoxGeometry(TW, 1, TD);
    unit.translate(0, 0.5, 0);
    const glassM = shared(glass(c, 0.06));
    const rimM = lineM(c, 0.85);
    rimM.userData.shared = true;
    const box = new THREE.Mesh(unit, glassM);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(unit), rimM);
    const strips = shared(neon(c, 0.9));
    for (const [x, z] of [
      [-TW / 2, -TD / 2],
      [TW / 2, -TD / 2],
      [-TW / 2, TD / 2],
      [TW / 2, TD / 2],
    ]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1, 0.11), strips);
      s.position.set(x, 0.5, z);
      shell.add(s);
    }
    shell.add(box, rim);
    pick(box, `srv:${ip}`);
    // the floors of a tall hotel: faint bands every 3.5 units (the lab's corridors get their own glowing slabs)
    const bandM = shared(lineM(c, 0.2));
    const bands = Array.from({ length: 7 }, (_, k) => {
      const y = 3.5 * (k + 1);
      const b = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([V(-TW / 2, y, -TD / 2), V(TW / 2, y, -TD / 2), V(TW / 2, y, TD / 2), V(-TW / 2, y, TD / 2)]), bandM);
      b.position.x = TX[ip];
      g.add(b);
      return b;
    });
    const title = label("title", c, "");
    // the gate on the inner wall, around ens32: a ring and an energy wall that opens with 8472/udp
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 12, 48), neon(COL.err, 1.4));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(inner(ip) + SIDE[ip] * 0.03, GY, 0);
    const wall = new THREE.Mesh(new THREE.CircleGeometry(0.98, 40), new THREE.MeshBasicMaterial({ color: COL.err, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    wall.rotation.y = Math.PI / 2;
    wall.position.copy(ring.position);
    pick(ring, `gate:${ip}`);
    pick(wall, `gate:${ip}`);
    const gl = label("gate", COL.err, "8472/udp");
    gl.position.set(inner(ip) + SIDE[ip] * 1.4, GY + 1.55, 0);
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.8), shared(neon(COL.ok, 0.9)));
    port.position.set(inner(ip) - SIDE[ip] * 0.12, GY, 0);
    g.add(plat, rimRing, shell, title, ring, wall, gl, port);
    scene.add(g);
    const light = new THREE.PointLight(c, 30, 26, 1.6);
    light.position.set(TX[ip], 5, 6);
    scene.add(light);
    towers.set(ip, { g, shell, strips, glassM, rimM, title, bands, h: 12, hTo: 12, slabs: new Map(), gate: { ring, wall, lbl: gl, open: 0, to: 0 }, pulse: 0, near: 1 });
  }

  // the network of the servers (ens32), the VPN and the repository: static cables
  const srvAt = (ip: string) => V(inner(ip) - SIDE[ip] * 0.45, GY, 0);
  const gateAt = (ip: string) => V(inner(ip) + SIDE[ip] * 0.35, GY, 0);
  const cableMat = shared(neon(COL.wire, 0.55));
  scene.add(tube([V(inner(K1), GY, 0), V(inner(K2), GY, 0)], 0.07, cableMat, 8));
  {
    const l = label("misc", 0x8fa2d8, "ens32 · red de las KVM");
    l.position.set(0, GY - 0.8, 0.4);
    scene.add(l);
  }
  const vpnTo: Record<string, THREE.CatmullRomCurve3> = {};
  for (const ip of [K1, K2]) {
    const end = V(inner(ip) + SIDE[ip] * 0.2, GY - 0.6, 1.2);
    vpnTo[ip] = new THREE.CatmullRomCurve3([VPN.clone(), VPN.clone().lerp(end, 0.5).add(V(0, 0.8, 0)), end]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(vpnTo[ip], 32, 0.05, 6), cableMat));
    scene.add(tube([REPO.clone().add(V(SIDE[ip] * -1.1, 3.2, 0)), REPO.clone().lerp(srvAt(ip), 0.5).add(V(0, 2.4, 0)), V(inner(ip), GY + 0.4, -0.5)], 0.04, cableMat, 32));
  }
  scene.add(tube([PC.clone().add(V(0, 1.6, -0.6)), V(0, 2.2, 12.5), VPN.clone()], 0.05, cableMat, 24));

  /* ---------------------------------------------------------------- dynamic state */
  const A = new Map<string, THREE.Vector3>(); // anchors: every node id the Fx and the map talk about
  const setStatic = () => {
    A.set("pc", PC.clone().add(V(0, 2.4, 0)));
    A.set("vpn", VPN.clone());
    A.set("repo", REPO.clone().add(V(0, 3.4, 0)));
    for (const ip of [K1, K2]) {
      A.set(`srv:${ip}`, srvAt(ip));
      A.set(`gate:${ip}`, gateAt(ip));
    }
  };
  setStatic();
  interface Rail {
    node: string;
    g: THREE.Group;
    bar: THREE.Mesh;
    m: THREE.MeshStandardMaterial;
    lbl: CSS2DObject;
    ip: string;
    level: number;
    x0: number;
    x1: number;
    y: number;
    k: number; // target glow
  }
  interface Room {
    g: THREE.Group;
    box: THREE.Mesh;
    rim: THREE.LineSegments;
    core: THREE.Mesh;
    cg: THREE.Sprite;
    lbl: CSS2DObject;
    desk?: { m: THREE.MeshStandardMaterial; g: THREE.Sprite; col: number };
    ports: THREE.Mesh[];
    tty: THREE.Mesh;
    sig: string;
    state: "boot" | "up" | "stop";
    doc?: CSS2DObject;
  }
  interface End {
    g: THREE.Group;
    lbl: CSS2DObject;
    m: THREE.MeshStandardMaterial;
  }
  interface Pipe {
    g: THREE.Group;
    core: THREE.MeshStandardMaterial;
    skin: THREE.MeshStandardMaterial;
    lbl: CSS2DObject;
    curve: THREE.CatmullRomCurve3;
    flow: THREE.Sprite[];
    sig: string;
    up: boolean;
    vni: number;
    k: number;
  }
  interface Marker {
    g: THREE.Group;
    lbl: CSS2DObject;
    to: THREE.Vector3;
  }
  const rails = new Map<string, Rail>(); // ip:br
  const rooms = new Map<string, Room>(); // ip:pid
  const ends = new Map<string, End>(); // vx:ip:if
  const pipes = new Map<string, Pipe>(); // vni:a|b
  const disks = new Map<string, THREE.Group>(); // disk:ip:path
  const markers = new Map<Term, Marker>();
  const portAt = new Map<string, THREE.Vector3>(); // pid:br → NIC port (world)
  const vniOf = new Map<string, number>(); // vx id → vni
  const wires = new THREE.Group();
  scene.add(wires);
  let wireSig = "";
  let askers: { host: string; vm: string; br: string }[] = [];
  let want: { id: string; until: number } | null = null;
  let lit = new Set<string>();
  let sel: string | null = null;

  function makeRoom(h: Host, v: Vm): Room {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(RW, RH, RD);
    const boxM = glass(COL.room, 0.24);
    boxM.emissiveIntensity = 0.35;
    const box = new THREE.Mesh(geo, boxM);
    const rim = edges(geo, COL.room, 0.95);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), neon(COL.room, 1.5));
    const cg = glow(COL.room, 2.2, 0.55, true);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(RW + 0.5, 0.07, RD + 0.5), neon(COLOR[h.ip], 0.9));
    pad.position.y = -RH / 2 - 0.1;
    const lbl = label("room", COL.room);
    lbl.position.y = RH / 2 + 0.55;
    g.add(box, rim, core, cg, pad, lbl);
    const ports = v.nics.map((n) => {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), neon(n.kind === "user" ? COL.user : COL.ok, 1.5));
      g.add(p);
      return p;
    });
    const tty = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.06), neon(COL.tty, 1.6));
    tty.position.set(RW / 2 - 0.3, RH / 2 - 0.26, RD / 2 + 0.03);
    g.add(tty);
    let desk: Room["desk"];
    if (v.role === "dhcp") {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.32, 0.5), solid(0x30364d));
      d.position.set(-0.35, -RH / 2 + 0.2, 0.35);
      const m = neon(0x444a5e, 0.6);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), m);
      lamp.position.set(-0.35, -RH / 2 + 0.52, 0.35);
      const gl = glow(0x444a5e, 1.6, 0.0, true);
      gl.position.copy(lamp.position);
      g.add(d, lamp, gl);
      pick(d, `dhcpd:${h.ip}:${vmName(h, v)}`);
      pick(lamp, `dhcpd:${h.ip}:${vmName(h, v)}`);
      desk = { m, g: gl, col: 0x444a5e };
    }
    pick(box, `vm:${h.ip}:${vmName(h, v)}`);
    pick(core, `vm:${h.ip}:${vmName(h, v)}`);
    pick(tty, `console:${h.ip}:${v.telnet ?? 0}`);
    g.scale.setScalar(0.01);
    tween(700 / speed, (q) => g.scale.setScalar(Math.max(0.01, back(q))));
    scene.add(g);
    return { g, box, rim, core, cg, lbl, desk, ports, tty, sig: "", state: "boot" };
  }

  function makeRail(h: Host, br: string, level: number): Rail {
    const g = new THREE.Group();
    const x0 = outer(h.ip) + SIDE[h.ip] * 0.8;
    const x1 = inner(h.ip) - SIDE[h.ip] * 0.45;
    const len = Math.abs(x1 - x0);
    const m = neon(LAN[(level - 1) % LAN.length], 0.3);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, len, 14), m);
    bar.rotation.z = Math.PI / 2;
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.5), new THREE.MeshBasicMaterial({ color: LAN[(level - 1) % LAN.length], transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = -0.17;
    g.add(bar, carpet);
    const lbl = label("rail", LAN[(level - 1) % LAN.length]);
    g.add(lbl);
    pick(bar, `br:${h.ip}:${br}`);
    scene.add(g);
    bar.scale.y = 0.01;
    tween(800 / speed, (q) => (bar.scale.y = Math.max(0.01, ease(q))));
    return { node: `br:${h.ip}:${br}`, g, bar, m, lbl, ip: h.ip, level, x0, x1, y: 0, k: 0.3 };
  }

  function makeDisk(path: string, kind: string): THREE.Group {
    const g = new THREE.Group();
    const hh = kind === "base" ? 1.1 : kind === "link" ? 0.6 : 0.45;
    const color = kind === "base" ? COL.base : kind === "link" ? 0x9aa4b2 : COL.clone;
    const geo = new THREE.CylinderGeometry(0.36, 0.36, hh, 24);
    geo.translate(0, hh / 2, 0);
    if (kind === "link") g.add(edges(geo, color, 0.8));
    else g.add(new THREE.Mesh(geo, kind === "clone" ? glass(color, 0.45) : neon(color, 0.5)), edges(geo, color, 0.9));
    const lbl = label("disk", color, baseName(path).replace(/\.qcow2$/, "") + (kind === "link" ? " →" : ""));
    lbl.position.y = hh + 0.35;
    g.add(lbl);
    g.userData.h = hh;
    g.scale.setScalar(0.01);
    tween(600 / speed, (q) => g.scale.setScalar(Math.max(0.01, back(q))));
    scene.add(g);
    return g;
  }

  /* ---------------------------------------------------------------- sync: the lab as it is now */
  function sync(lab: Lab, t: number) {
    A.clear();
    setStatic();
    portAt.clear();
    vniOf.clear();
    const seenRails = new Set<string>();
    const seenRooms = new Set<string>();
    const seenEnds = new Set<string>();
    const seenDisks = new Set<string>();
    const specs: { k: string; node: string; pts: THREE.Vector3[]; col: number; dash?: boolean; r?: number }[] = [];
    const doors: { ip: string; port: number; x: number; open: boolean; fwd: string; node: string }[] = [];
    const vxLevel = new Map<string, number>();

    for (const h of lab.hosts) {
      const T = towers.get(h.ip);
      if (!T) continue;
      const S = SIDE[h.ip];
      const order = [...h.bridges.keys()];
      const levelOf = (br?: string) => (br && order.includes(br) ? order.indexOf(br) + 1 : 0);
      // floors
      const n = order.length;
      T.hTo = Math.max(12, LV(n) + 5.2);
      for (let l = 1; l <= n; l++)
        if (!T.slabs.has(l)) {
          const geo = new THREE.BoxGeometry(TW - 0.5, 0.1, TD - 0.5);
          const slab = new THREE.Group();
          slab.add(new THREE.Mesh(geo, glass(COLOR[h.ip], 0.07)), edges(geo, COLOR[h.ip], 0.55));
          slab.position.set(TX[h.ip], LV(l), 0);
          slab.scale.set(0.01, 1, 1);
          tween(700 / speed, (q) => slab.scale.set(Math.max(0.01, ease(q)), 1, 1));
          scene.add(slab);
          T.slabs.set(l, slab);
        }
      for (const [l, slab] of T.slabs)
        if (l > n) {
          T.slabs.delete(l);
          drop(slab);
        }
      setText(T.title, `Hotel ${h.label} · ${h.ip}${h.dead ? " · APAGADO" : ""}`, h.label);
      T.gate.to = h.udp.has(8472) ? 1 : 0;
      setText(T.gate.lbl, `8472/udp · ${h.udp.has(8472) ? "abierto" : "cerrado"}`, `8472 ${h.udp.has(8472) ? "✓" : "✗"}`);
      setCol(T.gate.lbl, h.udp.has(8472) ? COL.ok : COL.err);
      // corridors
      for (const [br, b] of h.bridges) {
        const key = `${h.ip}:${br}`;
        seenRails.add(key);
        const level = levelOf(br);
        let r = rails.get(key);
        if (r && r.level !== level) {
          drop(r.g);
          rails.delete(key);
          r = undefined;
        }
        if (!r) rails.set(key, (r = makeRail(h, br, level)));
        r.y = LV(level) + 0.24;
        r.g.position.set((r.x0 + r.x1) / 2, r.y, ZR);
        r.lbl.position.set(r.x0 - (r.x0 + r.x1) / 2 - S * 0.2, 0.62, 0);
        const used = h.vms.some((v) => v.nics.some((x) => x.br === br)) || [...h.vx.values()].some((x) => x.master === br || x.master === b.con);
        r.k = used ? 1.25 : 0.28;
        setText(r.lbl, `${br} · pasillo${used ? "" : " (DOWN)"}`, br);
        A.set(`br:${h.ip}:${br}`, V((r.x0 + r.x1) / 2, r.y, ZR));
      }
      // VXLAN ends, at the inner wall of their corridor
      for (const [ifname, x] of h.vx) {
        const id = `vx:${h.ip}:${ifname}`;
        seenEnds.add(id);
        const br = [...h.bridges].find(([name, b]) => !x.dup && (name === x.master || b.con === x.master))?.[0];
        const level = levelOf(br);
        vxLevel.set(id, level);
        const col = level ? LAN[(level - 1) % LAN.length] : 0x9aa4b2;
        let e = ends.get(id);
        if (!e) {
          const g = new THREE.Group();
          const m = neon(col, 1.6);
          const s = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), m);
          const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.07, 10, 40), m);
          ringM.rotation.y = Math.PI / 2;
          g.add(s, ringM, glow(col, 2.4, 0.6));
          const lbl = label("end", col, ifname);
          lbl.position.set(-S * 0.2, -0.75, 0.5);
          g.add(lbl);
          pick(g, id);
          g.scale.setScalar(0.01);
          tween(600 / speed, (q) => g.scale.setScalar(Math.max(0.01, back(q))));
          scene.add(g);
          ends.set(id, (e = { g, lbl, m }));
        }
        const p = V(inner(h.ip) - S * 0.25, level ? LV(level) + 0.24 : GY + 1.4, ZR);
        e.g.position.copy(p);
        e.m.color.setHex(col);
        e.m.emissive.setHex(col);
        A.set(id, p);
      }
      // rooms: one row per floor (or between two floors when the VM is on both)
      const rows = new Map<string, Vm[]>();
      for (const v of h.vms) {
        const ls = [...new Set(v.nics.map((x) => (x.kind === "user" ? 0 : levelOf(x.br))))].sort((a, b) => a - b);
        const key = !ls.length ? "f:0" : ls.length === 1 ? (ls[0] === 0 ? "m:0" : `f:${ls[0]}`) : `m:${ls[0]}`;
        rows.set(key, [...(rows.get(key) ?? []), v]);
      }
      for (const [key, vs] of rows) {
        const a = outer(h.ip) + S * 2.0;
        const b = inner(h.ip) - S * 2.6;
        const step = vs.length > 1 ? Math.min(4.4, Math.abs(b - a) / (vs.length - 1)) : 0;
        vs.forEach((v, k) => {
          const id = `${h.ip}:${v.pid}`;
          seenRooms.add(id);
          const name = vmName(h, v);
          const sig = `${name}|${v.role}|${v.telnet}|${v.nics.map((x) => x.kind + (x.br ?? "")).join(",")}`;
          let o = rooms.get(id);
          if (o && o.sig !== sig) {
            drop(o.g);
            rooms.delete(id);
            o = undefined;
          }
          if (!o) {
            o = makeRoom(h, v);
            o.sig = sig;
            rooms.set(id, o);
          }
          const pos = V((a + b) / 2 + S * (k - (vs.length - 1) / 2) * step, rowY(key), ZROOM);
          o.g.position.copy(pos);
          const up = isUp(v, t);
          o.state = v.stopped || v.paused ? "stop" : up ? "up" : "boot";
          const c = o.state === "stop" ? COL.stop : o.state === "boot" ? COL.boot : COL.room;
          (o.rim.material as THREE.LineBasicMaterial).color.setHex(c);
          (o.box.material as THREE.MeshStandardMaterial).color.setHex(c);
          (o.core.material as THREE.MeshStandardMaterial).color.setHex(c);
          (o.core.material as THREE.MeshStandardMaterial).emissive.setHex(c);
          o.cg.material.color.setHex(c);
          setCol(o.lbl, c);
          const ipsTxt = v.nics.map((x) => (x.kind === "user" ? "NAT" : (x.ip ?? "sin IP"))).join(" · ");
          let line2 = o.state === "boot" ? "arrancando…" : o.state === "stop" ? "parada" : ipsTxt || "sin red";
          if (v.role === "dhcp" && o.desk) {
            const s = v.svc.dhcpd;
            const sub = serving(v);
            o.desk.col = s === "started" ? COL.ok : s === "failed" ? COL.err : 0x444a5e;
            if (o.state === "up") line2 += s === "started" && sub?.from ? `\n🛎 reparte .${sub.from.split(".")[3]}–.${sub.to?.split(".")[3]}` : s === "failed" ? "\n🛎 dhcpd falló" : s === "stopped" ? "\n🛎 cerrada" : "";
            A.set(`dhcpd:${h.ip}:${name}`, pos.clone().add(V(-0.35, -RH / 2 + 0.55, 0.45)));
          }
          const ip1 = v.nics.find((x) => x.ip && x.kind === "bridge")?.ip;
          setText(o.lbl, `${name}\n${line2}`, o.state === "up" && ip1 ? `${name} · .${ip1.split(".")[3]}|${name}` : name);
          A.set(`vm:${v.pid}`, pos.clone());
          A.set(`vm:${h.ip}:${name}`, pos.clone());
          if (v.telnet) A.set(`console:${h.ip}:${v.telnet}`, pos.clone().add(o.tty.position));
          // NIC ports: towards their corridor (below or above the room)
          v.nics.forEach((nic, i) => {
            const p = o.ports[i];
            if (!p) return;
            const dx = (i - (v.nics.length - 1) / 2) * 0.55;
            const lv = nic.kind === "user" ? 0 : levelOf(nic.br);
            const railY = LV(lv) + 0.24;
            const below = nic.kind === "user" || railY < pos.y;
            p.position.set(dx, below ? -RH / 2 + 0.22 : RH / 2 - 0.22, RD / 2 + 0.04);
            const wp = pos.clone().add(p.position);
            const cableNode = nic.kind === "user" ? `user:${h.ip}:${name}` : `cable:${h.ip}:${name}:${i}`;
            if (nic.kind === "user") {
              A.set(`nat:${v.pid}`, wp.clone());
              const door = V(wp.x, 1.0, FRONT + 0.06);
              specs.push({ k: "user", node: cableNode, pts: [wp, V(wp.x, 1.25, wp.z + 1.4), V(wp.x, 1.2, FRONT - 0.6), door], col: COL.user });
              A.set(cableNode, V(wp.x, 1.3, (wp.z + FRONT) / 2 + 0.4));
              const fwd = nic.fwd.map((f) => `${f.host} → ${f.guest}`).join(" · ");
              for (const f of nic.fwd) A.set(`fw:${h.ip}:${f.host}`, door.clone().add(V(0, 1.1, 0.1)));
              doors.push({ ip: h.ip, port: nic.fwd[0]?.host ?? 0, x: wp.x, open: nic.fwd.length > 0 && nic.fwd.every((f) => h.open.has(f.host)), fwd, node: nic.fwd[0] ? `fw:${h.ip}:${nic.fwd[0].host}` : cableNode });
            } else if (nic.br && lv) {
              portAt.set(`${v.pid}:${nic.br}`, wp.clone());
              const rp = V(wp.x, railY, ZR);
              specs.push({ k: "cable", node: cableNode, pts: [wp, V(wp.x, below ? wp.y - 0.25 : wp.y + 0.25, wp.z + 0.5), V(wp.x, railY + (below ? 0.3 : -0.3), ZR - 0.25), rp], col: LAN[(lv - 1) % LAN.length] });
              A.set(cableNode, wp.clone().lerp(rp, 0.5));
            }
          });
          // vi open on this VM in some terminal
          const editing = Object.values(lab.stacks).some((s) => s!.some((f) => f.pid === v.pid && f.edit));
          if (editing && !o.doc) {
            o.doc = label("fx", COL.tty, "✎ vi /etc/dhcp/dhcpd.conf");
            o.doc.position.set(0, RH / 2 + 1.45, 0);
            o.g.add(o.doc);
          } else if (!editing && o.doc) {
            o.doc.removeFromParent();
            o.doc = undefined;
            dirty = true;
          }
        });
      }
      // disks: a shelf at the back of the lobby
      const files = [...h.files.keys()].sort((x, y) => (x.startsWith("/exports") ? -1 : 0) - (y.startsWith("/exports") ? -1 : 0) || x.localeCompare(y));
      files.forEach((path, k) => {
        const id = `disk:${h.ip}:${path}`;
        seenDisks.add(id);
        const f = h.files.get(path)!;
        const kind = f.kind === "link" ? "link" : (real(h, path)?.kind ?? "clone");
        let g = disks.get(id);
        if (g && g.userData.kind !== kind) {
          drop(g);
          disks.delete(id);
          g = undefined;
        }
        if (!g) {
          g = makeDisk(path, kind);
          g.userData.kind = kind;
          disks.set(id, g);
        }
        const step = Math.min(1.25, (TW - 2) / Math.max(1, files.length));
        g.position.set(outer(h.ip) + S * (1.1 + k * step), 0.3, -3.5 + (k % 2) * 0.55);
        A.set(id, g.position.clone().add(V(0, g.userData.h as number, 0)));
      });
      for (const path of files) {
        const f = h.files.get(path)!;
        const to = f.kind === "link" ? f.target : f.backing;
        const a = A.get(`disk:${h.ip}:${path}`);
        const b = to && (A.get(`disk:${h.ip}:${to}`) ?? A.get(`disk:${h.ip}:${real(h, to)?.path}`));
        if (a && b) specs.push({ k: "chain", node: "", pts: [a.clone(), a.clone().lerp(b, 0.5).add(V(0, 0.9, 0)), b.clone()], col: f.kind === "link" ? 0x9aa4b2 : COL.clone, dash: true });
      }
    }
    for (const [k, r] of rails)
      if (!seenRails.has(k)) {
        rails.delete(k);
        drop(r.g);
      }
    for (const [k, o] of rooms)
      if (!seenRooms.has(k)) {
        rooms.delete(k);
        tween(400 / speed, (q) => o.g.scale.setScalar(Math.max(0.01, 1 - q)), () => drop(o.g));
      }
    for (const [k, e] of ends)
      if (!seenEnds.has(k)) {
        ends.delete(k);
        drop(e.g);
      }
    for (const [k, g] of disks)
      if (!seenDisks.has(k)) {
        disks.delete(k);
        tween(350 / speed, (q) => g.scale.setScalar(Math.max(0.01, 1 - q)), () => drop(g));
      }

    // VXLAN passages: one tube per link (a stub when the other end is missing)
    const seenPipes = new Set<string>();
    for (const l of links(lab)) {
      const a = `vx:${l.a.ip}:${l.a.ifname}`;
      const b = l.b ? `vx:${l.b.ip}:${l.b.ifname}` : "";
      vniOf.set(a, l.vni);
      if (b) vniOf.set(b, l.vni);
      const pa = A.get(a);
      const pb = b ? A.get(b) : undefined;
      if (!pa) continue;
      const key = `${l.vni}:${a}|${b}`;
      seenPipes.add(key);
      const lv = vxLevel.get(a) || vxLevel.get(b) || 1;
      const col = LAN[(lv - 1) % LAN.length];
      const end = pb ?? pa.clone().add(V(SIDE[l.a.ip] * (GAP * 0.9), 0, 0));
      const sig = `${pa.toArray().map((x) => x.toFixed(2))}|${end.toArray().map((x) => x.toFixed(2))}|${col}`;
      let p = pipes.get(key);
      if (p && p.sig !== sig) {
        drop(p.g);
        pipes.delete(key);
        p = undefined;
      }
      if (!p) {
        const g = new THREE.Group();
        const mid = pa.clone().lerp(end, 0.5).add(V(0, pb ? 0.5 : 0.2, 0));
        const curve = new THREE.CatmullRomCurve3([pa.clone(), mid, end.clone()]);
        const skin = glass(col, 0.2);
        const core = neon(col, 0.2);
        const skinM = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, pb ? 0.62 : 0.36, 20), skin);
        const coreM = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.1, 8), core);
        g.add(skinM, coreM);
        const lbl = label("tube", col);
        lbl.position.copy(mid).add(V(0, 0.95, 0));
        g.add(lbl);
        const flow = Array.from({ length: pb ? 10 : 0 }, () => {
          const s = glow(col, 1.0, 0.7, true);
          g.add(s);
          return s;
        });
        pick(g, pb ? `tunnel:${l.vni}` : a);
        scene.add(g);
        p = { g, core, skin, lbl, curve, flow, sig, up: false, vni: l.vni, k: 0.2 };
        pipes.set(key, p);
      }
      p.up = l.up;
      p.k = l.up ? 0.95 : 0.18;
      p.skin.opacity = l.up ? 0.22 : 0.1;
      const why = { remote: "remote no es la otra KVM", peer: "falta el otro extremo", id: "id repetido", master: "sin master (bridge)", down: "KVM caída", fw: "8472/udp cerrado" } as const;
      setText(p.lbl, `VXLAN ${l.vni}${l.up ? " · pasadizo abierto" : l.why ? ` · ${why[l.why]}` : ""}`, `VXLAN ${l.vni}${l.up ? "" : " ✗"}`);
      setCol(p.lbl, l.up ? col : COL.err);
      if (pb) A.set(`tunnel:${l.vni}`, p.curve.getPointAt(0.5));
    }
    for (const [k, p] of pipes)
      if (!seenPipes.has(k)) {
        pipes.delete(k);
        drop(p.g);
      }

    // terminals and their telnet cables (telefonillo)
    const spots = new Map<string, Term[]>();
    for (const term of Object.keys(lab.stacks) as Term[]) {
      const f = top(lab, term);
      const where = f.k === "pc" ? "pc" : f.k === "vm" && f.via === "ssh" && !lab.stacks[term]!.some((x) => x.k === "server") ? `door:${f.ip}` : `srv:${f.ip}`;
      spots.set(where, [...(spots.get(where) ?? []), term]);
    }
    for (const [where, terms] of spots)
      terms.forEach((term, i) => {
        let m = markers.get(term);
        if (!m) {
          const g = new THREE.Group();
          const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.72), shared(neon(TERM[term].col, 0.9)));
          const fr = edges(new THREE.PlaneGeometry(1.3, 0.82), 0xffffff, 0.7);
          g.add(scr, fr, glow(TERM[term].col, 2.6, 0.45));
          const lbl = label("term", TERM[term].col);
          setText(lbl, TERM[term].name, term === "pc" ? "PC" : term.toUpperCase());
          lbl.position.y = 0.95;
          g.add(lbl);
          g.position.copy(PC).add(V(0, 3.6, 0));
          scene.add(g);
          markers.set(term, (m = { g, lbl, to: g.position.clone() }));
        }
        const off = (i - (terms.length - 1) / 2) * 1.7;
        if (where === "pc") m.to.copy(PC).add(V({ kvm1: -1.7, kvm2: 1.7, pc: 0 }[term], 3.7, -0.4));
        else if (where.startsWith("door:")) {
          const ip = where.slice(5);
          const d = A.get(`fw:${ip}:${[...doors].find((x) => x.ip === ip)?.port}`) ?? V(TX[ip], 1, FRONT);
          m.to.copy(d).add(V(off, 1.4, 1.6));
        } else {
          const ip = where.slice(4);
          m.to.set(TX[ip] + off * 1.2, 1.25, FRONT + 2.3);
        }
        A.set(`term:${term}`, m.to.clone());
      });
    for (const [term, m] of markers)
      if (!lab.stacks[term]) {
        markers.delete(term);
        drop(m.g);
      }
    for (const c of consoles(lab)) {
      const from = A.get(`term:${c.term}`);
      const to = A.get(`console:${c.host}:${c.port}`);
      if (!from || !to) continue;
      specs.push({ k: c.waiting ? "wait" : "tty", node: `console:${c.host}:${c.port}`, pts: [from.clone().add(V(0, 0.3, 0)), V(from.x, Math.max(from.y, to.y) + 1.2, (from.z + to.z) / 2 + 1.5), to.clone().add(V(0, 0, 0.1))], col: COL.tty, dash: c.waiting });
    }
    for (const d of doors) specs.push({ k: "door", node: d.node, pts: [V(d.x, 1, FRONT + 0.06)], col: d.fwd ? (d.open ? COL.ok : COL.err) : COL.user, r: d.port });

    // cables, consoles and doors: rebuilt only when something changed
    const sig = JSON.stringify(specs.map((s) => [s.k, s.node, s.col, s.dash, s.r, s.pts.map((p) => p.toArray().map((x) => +x.toFixed(2)))]));
    if (sig !== wireSig) {
      wireSig = sig;
      for (const c of [...wires.children]) drop(c);
      for (const s of specs) {
        if (s.k === "door") {
          const g = new THREE.Group();
          const geo = new THREE.BoxGeometry(1.1, 1.9, 0.12);
          const fr = edges(geo, s.col, 1);
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.75), new THREE.MeshBasicMaterial({ color: s.col, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          g.add(fr, pane);
          g.position.copy(s.pts[0]);
          const d = doors.find((x) => x.node === s.node);
          if (d?.fwd) {
            const l = label("door", s.col, `${d.fwd}${d.open ? "" : " · cerrado"}`);
            l.position.set(0, 1.45, 0.2);
            g.add(l);
          }
          pick(g, s.node);
          wires.add(g);
          continue;
        }
        if (s.dash) {
          const curve = new THREE.CatmullRomCurve3(s.pts);
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)), new THREE.LineDashedMaterial({ color: s.col, dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.85 }));
          line.computeLineDistances();
          wires.add(line);
          if (s.k === "wait") {
            const l = label("wait", COL.tty, "⏳ en cola");
            l.position.copy(curve.getPointAt(0.5));
            wires.add(l);
          }
          continue;
        }
        const m = neon(s.col, s.k === "tty" ? 1.6 : 1.1);
        m.userData.node = s.node;
        const t = tube(s.pts, s.k === "tty" ? 0.035 : 0.05, m, 40);
        if (s.node) pick(t, s.node);
        wires.add(t);
        if (s.k === "cable") {
          const plug = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), neon(s.col, 1.8));
          plug.position.copy(s.pts[s.pts.length - 1]);
          wires.add(plug);
        }
      }
      dirty = true;
    }
    askers = asking(lab, t);
    if (want && (A.has(want.id) || now() > want.until)) {
      const id = want.id;
      want = null;
      if (A.has(id)) focus(id);
    }
    applyLight();
    dirty = true;
  }
  const top = (lab: Lab, term: Term): Frame => {
    const s = lab.stacks[term]!;
    return s[s.length - 1];
  };

  /* ---------------------------------------------------------------- the camera */
  let fly: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; at: number; dur: number } | null = null;
  let touched = 0; // last time the user moved the camera
  let swayBase: THREE.Vector3 | null = null;
  let lastFocus = "overview";
  let mapOn = false;
  const narrow = () => el.clientWidth < 700;
  const towerTop = () => Math.max(...[...towers.values()].map((t) => t.hTo));
  /** Distance along dir at which the box fits on screen, leaving room for the HUD (top) and the caption (bottom). */
  /** The free part of the stage in NDC [x0, x1, y0, y1]: what the HUD, the caption and the start card leave visible. */
  const cardX = () => {
    const w = Math.max(1, el.clientWidth);
    return (2 * (w - 12 - Math.min(430, 0.44 * w))) / w - 1 - 0.05; // the left edge of the map card (.l3-card), in NDC
  };
  const bandFor = (id: string) =>
    narrow() ? (sheet ? [-0.9, 0.9, -0.2, 0.68] : [-0.92, 0.92, -0.9, 0.7])
    : mapOn ? [-0.92, sheet ? cardX() : 0.92, -0.78, 0.8]
    : id === "intro" ? [-0.04, 0.95, -0.66, 0.8]
    : id.startsWith("tunnel:") ? [-0.92, 0.92, -0.28, 0.82] // the caption covers the bottom left: ens32, where the capsule travels, stays above it
    : [-0.92, 0.92, -0.5, 0.82];
  const fit = (box: THREE.Box3, dir: THREE.Vector3, id: string) => {
    const [x0, x1, y0, y1] = bandFor(id);
    const target = box.getCenter(new THREE.Vector3());
    const cs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    if (mapOn && id === "overview") cs.push(...spots.map((s) => s.position)); // every map target in the shot (the exterior stands out on the street)
    const cam = camera.clone();
    // the target moves so the box lands in the middle of the free band (searched together with the distance: parallax)
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const right = new THREE.Vector3().crossVectors(V(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const aim = (d: number) => target
      .clone()
      .addScaledVector(right, -((x0 + x1) / 2) * d * tanV * camera.aspect)
      .addScaledVector(up, -((y0 + y1) / 2) * d * tanV);
    let lo = 2;
    let hi = 400;
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2;
      const t = aim(d);
      cam.position.copy(t).addScaledVector(dir, d);
      cam.lookAt(t);
      cam.updateMatrixWorld();
      const ok = cs.every((c) => {
        const p = c.clone().project(cam);
        return p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1 && p.z < 1;
      });
      if (ok) hi = d;
      else lo = d;
    }
    const t2 = aim(hi);
    return { target: t2, pos: t2.clone().addScaledVector(dir, hi) };
  };
  const dirFor = (id: string) => {
    if (mapOn) return V(narrow() ? 1.1 : 0.1, narrow() ? 0.95 : 0.5, 1).normalize();
    if (id === "overview" || id === "intro" || (narrow() && id.startsWith("tunnel:"))) return V(narrow() ? 1.1 : 0.16, narrow() ? 0.62 : 0.3, 1).normalize();
    if (id === "gates" || id.startsWith("tunnel:")) return V(0.05, 0.3, 1).normalize();
    if (id === "street") return V(0.1, 0.55, 1).normalize();
    return V(0.32, 0.42, 1).normalize();
  };
  const boxAround = (p: THREE.Vector3, rx: number, ry: number, rz: number) => new THREE.Box3(V(p.x - rx, p.y - ry, p.z - rz), V(p.x + rx, p.y + ry, p.z + rz));
  function boxFor(id: string): THREE.Box3 | null {
    const H = towerTop();
    if (id === "overview" || id === "intro") return new THREE.Box3(V(-(GAP + TW) - 0.4, 0, -4.6), V(GAP + TW + 0.4, H + 1.2, mapOn ? 4.8 : 5.2));
    if (id === "gates") return new THREE.Box3(V(-GAP - 2.5, 0, -2), V(GAP + 2.5, GY + 2.8, 2.5));
    if (id === "street") return new THREE.Box3(V(-12, 0, 2), V(12, 5.5, 17));
    const [k, ip, rest] = [id.split(":")[0], id.split(":")[1], id.split(":").slice(2).join(":")];
    if (k === "tunnel") {
      // both hotels up to the highest corridor: the DHCP on one side, the client on the other and ens32 in between
      const top = Math.max(LV(1), ...[...rails.values()].map((r) => r.y));
      return new THREE.Box3(V(-(GAP + TW) - 0.4, 0, -3), V(GAP + TW + 0.4, top + 3.5, 3.5));
    }
    if (k === "srv") return new THREE.Box3(V(Math.min(outer(ip), inner(ip)), 0, -4.6), V(Math.max(outer(ip), inner(ip)), H, 4.6));
    if (k === "br") {
      const r = rails.get(`${ip}:${rest}`);
      return r ? new THREE.Box3(V(Math.min(r.x0, r.x1) - 0.5, r.y - 1, -3), V(Math.max(r.x0, r.x1) + 0.5, r.y + 2.4, 3.5)) : null;
    }
    const p = A.get(id);
    if (!p) return null;
    if (k === "vm") return boxAround(p, 5.5, 3, 3.6);
    return boxAround(p, 3.2, 2.4, 3);
  }
  function flyTo(target: THREE.Vector3, pos: THREE.Vector3, dur = 1500) {
    if (reduced) {
      controls.target.copy(target);
      camera.position.copy(pos);
      fly = null;
      return;
    }
    fly = { p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: target, at: now(), dur: dur / Math.sqrt(speed) };
  }
  let sheet = false; // a bottom sheet covers the lower part of the stage (phones, map card)
  function focus(id: string, withSheet = false) {
    sheet = withSheet;
    lastFocus = id;
    want = null; // a newer focus cancels any "fly there when it appears"
    let box = boxFor(id);
    if (!box) {
      // not built yet: look where it will appear and fly to it when it does (generous window: slow devices run the sim slower)
      want = { id, until: now() + 40000 };
      const ip = id.split(":")[1];
      box = boxFor(towers.has(ip) ? `srv:${ip}` : "overview");
    }
    if (!box) return;
    const { target, pos } = fit(box, dirFor(id), id);
    flyTo(target, pos);
  }

  /* ---------------------------------------------------------------- effects */
  const lanColOf = (vx: string) => {
    const e = ends.get(vx);
    return e ? e.m.color.getHex() : LAN[0];
  };
  /** The points of a path of node ids (a corridor is entered and left where the cables plug in). */
  function route(path: string[]) {
    const pts: THREE.Vector3[] = [];
    let cap: [number, number] | undefined;
    let capVx: string | undefined;
    const railOf = (id: string) => {
      const [, ip, ...br] = id.split(":");
      return rails.get(`${ip}:${br.join(":")}`);
    };
    const xOn = (id: string | undefined, br: string) => {
      if (!id) return undefined;
      if (id.startsWith("vm:")) return portAt.get(`${id.slice(3)}:${br.split(":").slice(2).join(":")}`)?.x;
      return A.get(id)?.x;
    };
    path.forEach((id, i) => {
      if (id.startsWith("br:")) {
        const r = railOf(id);
        if (!r) return;
        const lo = Math.min(r.x0, r.x1);
        const hi = Math.max(r.x0, r.x1);
        const a = clamp(xOn(path[i - 1], id) ?? (r.x0 + r.x1) / 2, lo, hi);
        const b = clamp(xOn(path[i + 1], id) ?? (r.x0 + r.x1) / 2, lo, hi);
        pts.push(V(a, r.y + 0.05, ZR), V(b, r.y + 0.05, ZR));
        return;
      }
      if (id.startsWith("vm:") && !id.slice(3).includes(":")) {
        const c = A.get(id);
        if (!c) return;
        const br = path[i - 1]?.startsWith("br:") ? path[i - 1] : path[i + 1]?.startsWith("br:") ? path[i + 1] : undefined;
        const port = br ? portAt.get(`${id.slice(3)}:${br.split(":").slice(2).join(":")}`) : undefined;
        if (i === 0) pts.push(c.clone(), ...(port ? [port.clone()] : []));
        else pts.push(...(port ? [port.clone()] : []), c.clone());
        return;
      }
      const p = A.get(id);
      if (!p) return;
      if (id.startsWith("srv:") && path[i + 1]?.startsWith("gate:") && path[i - 1]?.startsWith("vx:")) {
        cap = [Math.max(0, pts.length - 1), -1];
        capVx = path[i - 1];
      }
      const last = pts[pts.length - 1];
      if (last && last.distanceTo(p) > 7 && !(id.startsWith("gate:") && path[i - 1]?.startsWith("srv:"))) pts.push(last.clone().lerp(p, 0.5).add(V(0, Math.min(3.5, last.distanceTo(p) * 0.14), 0)));
      pts.push(p.clone());
      if (cap && cap[1] < 0 && id.startsWith("vx:") && path[i - 1]?.startsWith("gate:")) cap[1] = pts.length - 1;
    });
    if (cap && cap[1] < 0) cap[1] = pts.length - 1;
    return { pts, cap, capVx };
  }

  /** A glowing particle with a trail along a path; a capsule while it travels inside the VXLAN. */
  function shoot(path: string[], color: number, o: { text?: string; err?: boolean; size?: number; end?: (p: THREE.Vector3) => void } = {}) {
    const { pts, cap, capVx } = route(path);
    if (pts.length < 2) return 0;
    // dedupe consecutive identical points (CatmullRom dislikes them)
    const clean = pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.01);
    if (clean.length < 2) return 0;
    const curve = new THREE.CatmullRomCurve3(clean, false, "centripetal");
    const at = (u: number) => curve.getPointAt(clamp(u, 0, 1)); // getPointAt breaks just outside [0, 1]
    const len = curve.getLength();
    const dur = clamp(650 + len * 42, 900, 3000) / speed;
    // arc-length fractions of the capsule segment
    let c0 = 2;
    let c1 = 2;
    if (cap) {
      const acc = [0];
      for (let i = 1; i < clean.length; i++) acc.push(acc[i - 1] + clean[i].distanceTo(clean[i - 1]));
      const tot = acc[acc.length - 1] || 1;
      const idx = (p: THREE.Vector3) => clean.findIndex((q) => q.distanceTo(p) < 0.02);
      const a = idx(pts[cap[0]]);
      const b = idx(pts[cap[1]]);
      if (a >= 0 && b >= 0) {
        c0 = acc[a] / tot;
        c1 = acc[b] / tot;
      }
    }
    const size = o.size ?? 1;
    const head = glow(color, 1.5 * size, 1, true);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16 * size, 14, 10), neon(color, 2.4));
    const trail = Array.from({ length: 9 }, (_, k) => glow(color, (1.1 - k * 0.1) * size, 0.55 - k * 0.055));
    const g = new THREE.Group();
    g.add(head, dot, ...trail);
    let lbl: CSS2DObject | undefined;
    if (o.text) {
      lbl = label("fx", color, o.text);
      lbl.center.set(0.5, 1.4);
      g.add(lbl);
    }
    let capsule: THREE.Group | undefined;
    let capLbl: CSS2DObject | undefined;
    if (cap) {
      const cc = lanColOf(capVx ?? "");
      capsule = new THREE.Group();
      const cm = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 6, 16), glass(cc, 0.42));
      cm.rotation.z = Math.PI / 2;
      capsule.add(cm, edges(new THREE.CapsuleGeometry(0.34, 0.9, 3, 8).rotateZ(Math.PI / 2), cc, 0.5));
      capsule.visible = false;
      capLbl = label("fx", cc, `UDP 8472 · VNI ${vniOf.get(capVx ?? "") ?? "?"}`);
      capLbl.center.set(0.5, -0.6);
      capsule.add(capLbl);
      g.add(capsule);
    }
    scene.add(g);
    audio.play("whoosh");
    const tmp = new THREE.Vector3();
    tween(
      dur,
      (q) => {
        const u = ease(q);
        const p = at(u);
        head.position.copy(p);
        dot.position.copy(p);
        trail.forEach((s, k) => s.position.copy(at(u - 0.012 * (k + 1))));
        if (lbl) lbl.position.copy(p);
        if (capsule && capLbl) {
          const inCap = u >= c0 && u <= c1;
          if (capsule.visible !== inCap) {
            capsule.visible = inCap;
            capLbl.element.style.visibility = inCap ? "" : "hidden";
            ring(p, lanColOf(capVx ?? ""), 0.7, true); // wrap / unwrap
          }
          capsule.position.copy(p);
          tmp.copy(at(u + 0.01));
          capsule.lookAt(tmp);
          capsule.rotateY(Math.PI / 2);
        }
      },
      () => {
        const p = at(1);
        drop(g);
        if (o.err) {
          sparks(p, COL.err, 34);
          ring(p, COL.err, 1.2, true);
          shake();
          audio.play("thud");
        } else ring(p, color, 0.8);
        o.end?.(p);
      },
    );
    return dur;
  }

  function ring(p: THREE.Vector3, color: number, size = 1, faceCam = false) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 48), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(p);
    if (faceCam) m.lookAt(camera.position);
    else m.rotation.x = -Math.PI / 2;
    scene.add(m);
    tween(
      850 / speed,
      (q) => {
        m.scale.setScalar(size * (1 + q * 3.2));
        (m.material as THREE.MeshBasicMaterial).opacity = 1 - q;
      },
      () => drop(m),
    );
  }

  function sparks(p: THREE.Vector3, color: number, n = 26, spread = 1, life = 750, gravity = 6, size = 0.34) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = Array.from({ length: n }, () => V(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar((2 + Math.random() * 4) * spread));
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    tween(
      life / speed,
      (q) => {
        const tt = q * (life / 1000);
        vel.forEach((v, i) => pos.set([p.x + v.x * tt, p.y + v.y * tt - 0.5 * gravity * tt * tt, p.z + v.z * tt], i * 3));
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 1 - q * q;
      },
      () => drop(pts),
    );
  }

  /** A short text that rises and fades (dhcpd [ ok ], en cola…). */
  function pop(p: THREE.Vector3 | undefined, text: string, color: number, ms = 2200) {
    if (!p) return;
    const l = label("fx", color, text);
    l.position.copy(p);
    scene.add(l);
    const y0 = p.y;
    tween(
      ms / speed,
      (q) => {
        l.position.y = y0 + 0.4 + q * 1.1;
        l.element.style.opacity = String(q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25);
      },
      () => drop(l),
    );
  }

  /** A broadcast: a pulse running along the corridor both ways from x, with rings. */
  function ripple(railKey: string, x: number, color: number, text?: string) {
    const r = rails.get(railKey);
    if (!r) return;
    const lo = Math.min(r.x0, r.x1);
    const hi = Math.max(r.x0, r.x1);
    const xs = clamp(x, lo, hi);
    const start = V(xs, r.y + 0.05, ZR);
    ring(start, color, 0.9);
    for (const to of [lo, hi]) {
      const s = glow(color, 1.6, 0.9, true);
      s.position.copy(start);
      scene.add(s);
      tween(
        900 / speed,
        (q) => {
          s.position.x = xs + (to - xs) * q;
          s.material.opacity = 0.95 * (1 - q * 0.7);
        },
        () => drop(s),
      );
    }
    if (text) pop(start.clone().add(V(0, 0.9, 0)), text, color, 2000);
  }

  function play(fx: Fx[]) {
    let dora = -1;
    for (const f of fx) {
      if (f.k === "packet") {
        const err = f.tone === "err";
        const walker = f.path[0] === "pc" && f.path.some((x) => x.startsWith("fw:")) && !err;
        later(0, () => shoot(f.path, TONE[f.tone ?? ""] ?? 0xb98cff, { err, size: walker ? 1.5 : 1, text: walker ? "🚶 de fuera" : undefined }));
      } else if (f.k === "dora") {
        if (f.stage === "discover") dora++;
        const k = { discover: 0, offer: 1, request: 2, ack: 3 }[f.stage];
        const at = ((Math.max(0, dora) * 1300 + k * 1250) / speed) | 0;
        const oct = f.ip.split(".")[3];
        const text = { discover: "DISCOVER · ¿Hay alguna recepción?", offer: `OFFER · Te ofrezco la ${oct}`, request: `REQUEST · Me quedo la ${oct}`, ack: "ACK · Confirmado ✓" }[f.stage];
        later(at, () => {
          if (f.stage === "discover") {
            const brs = f.path.filter((x) => x.startsWith("br:"));
            for (const b of brs) {
              const [, ip, ...rest] = b.split(":");
              const x = portAt.get(`${f.from.slice(3)}:${rest.join(":")}`)?.x ?? A.get(b)?.x ?? 0;
              ripple(`${ip}:${rest.join(":")}`, b === brs[0] ? x : (A.get(f.path[f.path.indexOf(b) - 1])?.x ?? x), DORA.discover);
            }
          }
          if (f.lost) {
            pop(A.get(f.from)?.clone().add(V(0, 1.6, 0)), "¿Hay alguna recepción? … nadie contesta", DORA.discover, 2600);
            return;
          }
          shoot(f.path, DORA[f.stage], {
            text,
            size: 1.25,
            end: (p) => {
              if (f.stage === "ack") {
                sparks(p, COL.ok, 30, 0.7);
                pop(p.clone().add(V(0, 1.2, 0)), `✓ ${f.ip}`, COL.ok, 2600);
                audio.play("chime");
              }
            },
          });
        });
      } else if (f.k === "tunnel") {
        const [a, b] = f.ends.map((x) => A.get(x));
        if (a && b && f.up) {
          for (const [p, q] of [
            [a, b],
            [b, a],
          ]) {
            const s = glow(lanColOf(f.ends[0]), 2.4, 1, true);
            s.position.copy(p);
            scene.add(s);
            tween(
              1100 / speed,
              (k) => s.position.lerpVectors(p, p.clone().lerp(q, 0.5).add(V(0, 0.5, 0)), ease(k)),
              () => drop(s),
            );
          }
          later(1100 / speed, () => {
            const m = a.clone().lerp(b, 0.5).add(V(0, 0.5, 0));
            ring(m, lanColOf(f.ends[0]), 1.2, true);
            sparks(m, lanColOf(f.ends[0]), 26, 0.8);
            pop(m.clone().add(V(0, 1.6, 0)), "¡Los dos pasillos, una sola LAN!", lanColOf(f.ends[0]), 2600);
            audio.play("chime");
          });
        } else if (a && !f.up) pop(a, `VXLAN ${f.vni} cortada`, COL.err);
      } else if (f.k === "gate") {
        const T = towers.get(f.host);
        if (!T) continue;
        const p = gateAt(f.host);
        if (f.blocked)
          later(900 / speed, () => {
            T.gate.open = 0;
            sparks(p, COL.err, 40, 1.2);
            ring(p, COL.err, 1.4, true);
            pop(p.clone().add(V(0, 1.4, 0)), "rebota: 8472/udp cerrado", COL.err);
            shake();
            audio.play("thud");
          });
        else {
          ring(p, f.open ? COL.ok : COL.err, 1.3, true);
          if (f.open) sparks(p, COL.ok, 24, 0.7);
          pop(p.clone().add(V(0, 2.2, 0)), f.open ? "8472/udp abierto" : "8472/udp cerrado", f.open ? COL.ok : COL.err);
          if (f.open) audio.play("chime");
        }
      } else if (f.k === "svc") {
        const p = A.get(f.vm);
        const ok = f.state === "started";
        later(f.state === "started" ? 300 : 900, () => {
          if (p) ring(p, ok ? COL.ok : f.state === "failed" ? COL.err : 0x8a93a3, 1.1, true);
          pop(p?.clone().add(V(0, 1.3, 0)), ok ? "dhcpd [ ok ]" : f.state === "failed" ? "dhcpd [ !! ] falló" : "dhcpd parado", ok ? COL.ok : f.state === "failed" ? COL.err : 0x8a93a3, 2600);
          if (f.state === "failed" && p) {
            sparks(p, COL.err, 22, 0.6);
            audio.play("thud");
          }
        });
      } else if (f.k === "queue") {
        pop(A.get(`console:${f.host}:${f.port}`) ?? A.get(f.vm), f.on ? "⏳ consola ocupada: esperas en la cola" : "consola libre", f.on ? COL.tty : COL.ok, 2600);
      } else if (f.k === "edit") {
        if (f.saved) pop(A.get(f.vm)?.clone().add(V(0, 1.2, 0)), "dhcpd.conf ✓ guardado", COL.ok);
      } else if (f.k === "focus") focus(f.id);
      else if (f.k === "boot") {
        const p = A.get(f.id);
        if (p && f.id.startsWith("vm:")) {
          ring(p, COL.boot, 1.2, true);
          sparks(p, COL.boot, 20, 0.6);
        } else if (p) ring(p, f.id.startsWith("disk:") ? COL.clone : LAN[0], 0.8, f.id.startsWith("vx:"));
      } else if (f.k === "flash") {
        const p = A.get(f.id);
        if (p) ring(p, COL.ok, 0.9, true);
      } else if (f.k === "boom") {
        const T = towers.get(f.ip);
        if (T) {
          const x0 = T.g.position.x;
          tween(
            700,
            (q) => (T.g.position.x = x0 + Math.sin(q * 60) * 0.3 * (1 - q)),
            () => (T.g.position.x = x0),
          );
          shake();
        }
      }
    }
  }

  /* ---------------------------------------------------------------- map mode: hotspots and highlight */
  let spots: CSS2DObject[] = [];
  const SPOT_RANK: Record<string, number> = { tower: 10, tunnel: 9, vxlan: 9, bridge: 8, vm: 8, gate: 7, door: 7, exterior: 7, service: 6, user: 6, cable: 5, console: 4 };
  function hotAt(node: string): THREE.Vector3 | undefined {
    const [k, ip] = node.split(":");
    if (k === "srv") return V(TX[ip], (towers.get(ip)?.hTo ?? 9) + 1.3, 0);
    if (k === "br") {
      const r = rails.get(node.slice(3));
      return r ? V(r.x0 - SIDE[ip] * 0.2, r.y + 0.62, ZR) : undefined;
    }
    if (k === "gate") return gateAt(ip).add(V(SIDE[ip] * 0.9, 1.45, 0));
    if (k === "vx") return A.get(node)?.clone().add(V(0, 0.75, 0.2));
    if (k === "tunnel") return A.get(node)?.clone().add(V(0, 0.95, 0));
    if (k === "vm") return A.get(node)?.clone().add(V(0, RH / 2 + 0.55, 0));
    if (k === "pc") return VPN.clone().add(V(0, 1.5, 0)); // you come in from outside through the VPN (your desk is out of the map's shot)
    return A.get(node)?.clone();
  }
  function setMap(pieces: HotPiece[] | null) {
    for (const s of spots) drop(s);
    spots = [];
    mapOn = !!pieces;
    css.domElement.toggleAttribute("data-map", mapOn);
    if (!pieces) return;
    for (const p of pieces) {
      const at = hotAt(p.node);
      if (!at) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "h-spot";
      b.dataset.r = String(SPOT_RANK[p.kind] ?? 4);
      b.dataset.k = p.kind;
      b.dataset.node = p.node;
      b.dataset.id = p.id;
      b.setAttribute("aria-label", p.name);
      const i = document.createElement("i");
      const s = document.createElement("span");
      s.textContent = p.kind === "tower" ? p.name : p.name.replace(/ · KVM\d$/, "");
      b.append(i, s);
      b.addEventListener("click", () => cb.pick(p.id));
      b.addEventListener("pointerenter", () => cb.hover(p.id));
      b.addEventListener("pointerleave", () => cb.hover(null));
      b.addEventListener("focus", () => cb.hover(p.id));
      b.addEventListener("blur", () => cb.hover(null));
      const o = new CSS2DObject(b);
      o.position.copy(at);
      scene.add(o);
      spots.push(o);
      b.style.display = "none"; // in the DOM (and reachable) at once; the next frame places and shows it
      css.domElement.appendChild(b);
    }
    dirty = true;
  }
  const halos: THREE.Sprite[] = [];
  function applyLight() {
    for (const h of halos) drop(h);
    halos.length = 0;
    for (const n of lit) {
      const p = n.startsWith("srv:") ? undefined : n === "pc" ? hotAt(n) : A.get(n) ?? hotAt(n);
      if (!p) continue;
      const s = glow(n === sel ? 0xffffff : 0x9fe7ff, n === sel ? 3.4 : 2.6, n === sel ? 0.55 : 0.4, true);
      s.position.copy(p);
      s.userData.halo = true;
      scene.add(s);
      halos.push(s);
    }
    for (const s of spots) {
      const e = s.element as HTMLElement;
      e.classList.toggle("lit", lit.has(e.dataset.node ?? ""));
      e.classList.toggle("sel", e.dataset.node === sel);
    }
    for (const [ip, T] of towers) T.pulse = lit.has(`srv:${ip}`) ? 1 : 0;
    dirty = true; // hover and selection decide whose name shows first: tidy on the next frame
  }
  function light(nodes: string[], s?: string | null) {
    lit = new Set(nodes);
    sel = s ?? null;
    applyLight();
  }

  /* ---------------------------------------------------------------- finale and time-lapse */
  let lapseUntil = 0;
  let lapseFrom = 0;
  let askAt = 0;
  function finale() {
    focus("overview");
    if (reduced) return 0;
    const N = 16;
    for (let i = 0; i < N; i++)
      later(i * 240, () => {
        const ip = i % 2 ? K1 : K2;
        const T = towers.get(ip)!;
        const p = V(TX[ip] + (Math.random() - 0.5) * 9, T.hTo * (0.4 + Math.random() * 0.45), 1 + Math.random() * 4);
        const c = [COLOR[ip], LAN[0], LAN[1], 0xffffff, COL.ok][i % 5];
        sparks(p, c, 90, 1.5, 1700, 2.5, lite ? 1.1 : 0.7);
        const fl = glow(c, 7, 0.9, true);
        fl.position.copy(p);
        scene.add(fl);
        tween(900, (q) => ((fl.material.opacity = 0.9 * (1 - q)), fl.scale.setScalar(7 + q * 5)), () => drop(fl));
        T.pulse = 1;
        later(400, () => (T.pulse = 0));
      });
    audio.play("chime");
    return N * 240 + 1100;
  }
  function lapse(ms: number) {
    lapseFrom = now();
    lapseUntil = now() + ms;
  }

  /* ---------------------------------------------------------------- picking, resize, loop */
  let down: [number, number] | null = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitAt = (e: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(scene.children, true).filter((x) => x.object.userData.pick && x.object.visible && !(x.object as THREE.Sprite).isSprite);
    const best = hits.find((x) => !String(x.object.userData.pick).startsWith("srv:")) ?? hits[0];
    return (best?.object.userData.pick as string | undefined) ?? null;
  };
  const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    if (!mapOn || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    cb.pick(hitAt(e));
  };
  let hoverId: string | null = null;
  let moveAt = 0;
  const onMove = (e: PointerEvent) => {
    if (!mapOn || e.pointerType !== "mouse" || now() - moveAt < 60) return;
    moveAt = now();
    const id = hitAt(e);
    if (id !== hoverId) {
      hoverId = id;
      cb.hover(id);
    }
    renderer.domElement.style.cursor = id ? "pointer" : "";
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);
  controls.addEventListener("start", () => {
    fly = null;
    swayBase = null;
    touched = now();
  });

  const resize = () => {
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    for (const e of css.domElement.children) delete (e as HTMLElement).dataset.size; // fonts change with the width
    renderer.setSize(w, h);
    css.setSize(w, h);
    composer?.setSize(w, h);
    bloom?.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!touched) {
      const box = boxFor(lastFocus) ?? boxFor("overview")!;
      const { target, pos } = fit(box, dirFor(lastFocus), lastFocus);
      controls.target.copy(target);
      camera.position.copy(pos);
      fly = null;
    }
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  let raf = 0;
  let visible = true;
  const io = new IntersectionObserver((es) => (visible = es[es.length - 1].isIntersecting));
  io.observe(el);

  // Map-style decluttering: a label that would cover a more important one hides until there is room again.
  let tidyAt = 0;
  const tidy = (t: number) => {
    dirty = false;
    tidyAt = t;
    // the HUD, captions and cards over the stage count as taken: no label hides under them
    const huds = [...(el.parentElement?.querySelectorAll<HTMLElement>("[data-hud]") ?? [])].map((e) => e.getBoundingClientRect()).filter((r) => r.width);
    const kept: DOMRect[] = [...huds];
    const underHud = (r: DOMRect) => huds.some((k) => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top);
    const els = ([...css.domElement.children] as HTMLElement[]).filter((e) => e.style.display !== "none");
    // the dot under the pointer first, then the focused one, then the selected one (all three show their names), then by rank
    const prio = (e: HTMLElement) =>
      Number(e.dataset.r) + (e.matches(":hover") ? 300 : e === document.activeElement ? 200 : e.classList.contains("sel") ? 100 : 0);
    els.sort((a, b) => prio(b) - prio(a));
    const box = css.domElement.getBoundingClientRect();
    const out = (r: DOMRect) => r.left < box.left + 2 || r.right > box.right - 2 || r.top < box.top + 2 || r.bottom > box.bottom - 2;
    // from = huds.length tests only against what was kept after the HUD boxes
    const hit = (r: DOMRect, from = 0) =>
      kept.some((k, j) => j >= from && r.left < k.right + 3 && r.right + 3 > k.left && r.top < k.bottom + 1 && r.bottom + 1 > k.top);
    // where a spot's name sits: right of its dot, or left of it (.flip)
    const sides = (e: HTMLElement) => {
      const b = e.getBoundingClientRect();
      const s = (e.lastElementChild as HTMLElement).getBoundingClientRect();
      return [new DOMRect(b.right + 3, s.top, s.width, s.height), new DOMRect(b.left - 3 - s.width, s.top, s.width, s.height)];
    };
    // map targets first: the hovered, focused and selected dots with their names, each giving way only to a more important one
    // (a hovered name never covers the selected one); then every dot that fits stays clickable, then names where there is room
    const spotEls = els.filter((e) => e.classList.contains("h-spot"));
    const firsts = new Set<HTMLElement>();
    for (const e of spotEls) {
      const dot = (e.firstElementChild as HTMLElement).getBoundingClientRect();
      if (prio(e) >= 100 && !underHud(dot)) {
        firsts.add(e);
        const hide = hit(dot, huds.length);
        // its name goes left of the dot when a card, the stage edge or a more important name is on the right
        const [right, left] = sides(e);
        const side = hide ? undefined : [right, left].find((r) => r.width && !hit(r) && !out(r));
        e.classList.toggle("hide", hide);
        e.classList.toggle("mute", !side);
        e.classList.toggle("flip", side === left);
        if (!hide) kept.push(dot);
        if (side) kept.push(side);
        continue;
      }
      const hide = hit(dot) || out(dot);
      e.classList.toggle("hide", hide);
      if (!hide) kept.push(dot);
    }
    for (const e of spotEls) {
      if (e.classList.contains("hide") || firsts.has(e)) continue;
      const [txt] = sides(e);
      e.classList.remove("flip");
      const mute = !txt.width || hit(txt) || out(txt);
      e.classList.toggle("mute", mute);
      if (!mute) kept.push(txt);
    }
    // labels, one importance tier at a time: every label of the tier in its short form first, then the full text where it fits
    const labels = els.filter((e) => !e.classList.contains("h-spot"));
    for (let i = 0; i < labels.length; ) {
      const tier: HTMLElement[] = [];
      const r0 = labels[i].dataset.r;
      while (i < labels.length && labels[i].dataset.r === r0) tier.push(labels[i++]);
      const placed: [HTMLElement, number, DOMRect[]][] = [];
      for (const e of tier) {
        const r = e.getBoundingClientRect();
        if (!r.width) continue;
        const { full = "", short } = e.dataset;
        if (!short) {
          const hide = hit(r) || out(r);
          e.classList.toggle("hide", hide);
          if (!hide) kept.push(r);
          continue;
        }
        // every form's size, measured once per text (the label stays centred on its anchor)
        const forms = [full, ...short.split("|")];
        if (!e.dataset.size) {
          const cur = e.textContent;
          e.dataset.size = forms
            .map((f) => {
              e.textContent = f;
              const b = e.getBoundingClientRect();
              return `${b.width},${b.height}`;
            })
            .join(";");
          e.textContent = cur;
        }
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const rects = e.dataset.size.split(";").map((x) => {
          const [w, h] = x.split(",").map(Number);
          return new DOMRect(cx - w / 2, cy - h / 2, w, h);
        });
        const small = rects[rects.length - 1];
        const hide = hit(small) || out(small);
        e.classList.toggle("hide", hide);
        if (hide) continue;
        placed.push([e, kept.push(small) - 1, rects]);
      }
      for (const [e, k, rects] of placed) {
        const forms = [e.dataset.full ?? "", ...(e.dataset.short ?? "").split("|")];
        const best = rects.findIndex((rf) => !out(rf) && !kept.some((q, j) => j !== k && rf.left < q.right + 3 && rf.right + 3 > q.left && rf.top < q.bottom + 1 && rf.bottom + 1 > q.top));
        const f = best < 0 ? rects.length - 1 : best;
        kept[k] = rects[f];
        if (e.textContent !== forms[f]) e.textContent = forms[f];
      }
    }
  };

  let prev = now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const t = now();
    const dt = Math.min(0.1, (t - prev) / 1000);
    prev = t;
    if (!visible) return;
    for (let i = timers.length - 1; i >= 0; i--)
      if (t >= timers[i].at) {
        const fn = timers[i].fn;
        timers.splice(i, 1);
        fn();
      }
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
      controls.target.lerpVectors(fly.t0, fly.t1, u);
      if (q >= 1) fly = null;
      swayBase = null;
    } else if (!reduced && !mapOn && t - touched > 5000) {
      // a slow cinematic sway around the target while nobody touches the camera
      swayBase ??= camera.position.clone().sub(controls.target);
      const a = Math.sin(t / 5200) * 0.11;
      camera.position.copy(controls.target).add(swayBase.clone().applyAxisAngle(V(0, 1, 0), a));
    }
    // towers grow with their floors; gates, corridors and passages ease towards the lab state
    for (const T of towers.values()) {
      T.h += (T.hTo - T.h) * Math.min(1, dt * 3);
      T.shell.scale.y = T.h - 0.28;
      for (const b of T.bands) b.visible = 3.5 * (T.bands.indexOf(b) + 1) < T.h - 0.6;
      T.title.position.set(T.shell.position.x, T.h + 1.3, 0);
      const d = Math.hypot(camera.position.x - T.shell.position.x, camera.position.z);
      T.near += (clamp((d - 12) / 16, 0.08, 1) - T.near) * Math.min(1, dt * 4);
      T.strips.emissiveIntensity = (0.85 + Math.sin(t / 900) * 0.12) * T.near + T.pulse * 2.4;
      T.glassM.opacity = 0.06 * T.near;
      T.rimM.opacity = 0.14 + 0.71 * T.near;
      const G = T.gate;
      G.open += (G.to - G.open) * Math.min(1, dt * 2.5);
      const gm = G.ring.material as THREE.MeshStandardMaterial;
      gm.color.setHex(COL.err).lerp(new THREE.Color(COL.ok), G.open);
      gm.emissive.copy(gm.color);
      (G.wall.material as THREE.MeshBasicMaterial).opacity = (1 - G.open) * (0.32 + Math.sin(t / 160) * 0.06);
      (G.wall.material as THREE.MeshBasicMaterial).color.copy(gm.color);
    }
    for (const r of rails.values()) r.m.emissiveIntensity += (r.k * (lit.has(r.node) ? 2.2 : 1) - r.m.emissiveIntensity) * Math.min(1, dt * 4);
    for (const p of pipes.values()) {
      const boost = lit.has(`tunnel:${p.vni}`) ? 2 : 1;
      p.core.emissiveIntensity += (p.k * boost - p.core.emissiveIntensity) * Math.min(1, dt * 3);
      p.flow.forEach((s, i) => {
        s.visible = p.up;
        if (p.up) s.position.copy(p.curve.getPointAt((((t / (1700 / speed) + i / p.flow.length) % 1) + 1) % 1));
      });
    }
    for (const o of rooms.values()) {
      const k = o.state === "boot" ? 5 : o.state === "up" ? 1 : 0;
      o.core.rotation.y += dt * k * 1.3;
      o.core.rotation.x += dt * k * 0.5;
      const pulse = o.state === "boot" ? 0.5 + 0.5 * Math.sin(t / 120) : 0.85 + 0.15 * Math.sin(t / 700);
      (o.core.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 * pulse + 0.3;
      o.cg.material.opacity = 0.35 + 0.35 * pulse;
      if (o.desk) {
        o.desk.m.color.lerp(new THREE.Color(o.desk.col), Math.min(1, dt * 4));
        o.desk.m.emissive.copy(o.desk.m.color);
        o.desk.g.material.color.copy(o.desk.m.color);
        o.desk.g.material.opacity = o.desk.col === 0x444a5e ? 0.05 : 0.8 + Math.sin(t / 300) * 0.15;
      }
    }
    for (const m of markers.values()) {
      m.g.position.lerp(m.to, 1 - Math.pow(0.003, dt));
      m.g.lookAt(camera.position);
      m.g.position.y += Math.sin(t / 500 + m.to.x) * 0.002;
    }
    for (const h of halos) h.material.opacity = 0.35 + Math.sin(t / 260) * 0.15;
    vpnRing.rotation.y += dt * 0.6;
    // udhcpc asking with nobody answering: a DISCOVER ripple every few seconds (fast during the time-lapse)
    const lapsing = t < lapseUntil;
    if (askers.length && t - askAt > (lapsing ? 140 : 2600 / speed)) {
      askAt = t;
      for (const a of askers) {
        const pid = a.vm.slice(3);
        const x = portAt.get(`${pid}:${a.br}`)?.x;
        if (x !== undefined) ripple(`${a.host}:${a.br}`, x, DORA.discover);
      }
    }
    if (lapsing || lapseFrom) {
      const q = clamp((t - lapseFrom) / Math.max(1, lapseUntil - lapseFrom), 0, 1);
      paintSky(Math.sin(q * Math.PI) * 0.9);
      stars.rotation.y += dt * 1.5;
      if (!lapsing) {
        lapseFrom = 0;
        paintSky(0);
      }
    } else stars.rotation.y += dt * 0.004;
    controls.update();
    if (t < shakeUntil) camera.position.add(V((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.2, 0));
    if (composer) composer.render();
    else renderer.render(scene, camera);
    css.render(scene, camera);
    if (dirty || tweens.length || t - tidyAt > 160) tidy(t);
  };
  loop();

  return {
    sync,
    play,
    focus,
    setSpeed: (x) => (speed = x),
    setMap,
    light,
    finale,
    lapse,
    sound: (on) => audio.set(on),
    sfx: (k) => audio.play(k),
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        for (const k of [m.material as THREE.Material | THREE.Material[] | undefined].flat()) k?.dispose();
      });
      glowTex.dispose();
      gridTex.dispose();
      sky.dispose();
      composer?.dispose();
      renderer.dispose();
      audio.close();
      renderer.domElement.remove();
      css.domElement.remove();
    },
  };
}
