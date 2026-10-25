"use client";

import * as React from "react";
import * as k from "../iso/iso-kit";
import { Dots, Line, Plate, Solid } from "../iso/react/draw";
import { useInView, useStillness } from "../iso/react/live";

export const W = 600;
export const H = 360;

export const fit = (points: k.Point3[], options: k.FitOptions = {}) => k.fitProjection(points, W, H, { pad: 30, ...options });

export const byDepth = <T,>(list: T[], at: (item: T) => k.Point3, P: k.Projection) =>
  [...list].sort((a, b) => k.depthOf(at(a), P) - k.depthOf(at(b), P));

// Screen offset of a world move, as a CSS transform (SVG user units), so moves can ease with a transition.
export const moveCss = (P: k.Projection, by: k.Point3) => {
  const [x, y] = k.axisVector(P, by);
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
};

// Deterministic pseudo-random numbers, so server and client draw the same thing.
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Base plate on feet with a groove, corner screws and a label plate (craft.md, "Base plate on feet").
export function Bench({ plan, P, h = 9, label = true }: { plan: k.Plan; P: k.Projection; h?: number; label?: boolean }) {
  const feet = byDepth(k.corners(plan, 16), ([x, y]) => [x, y, 0], P);
  const screws = k.corners(plan, 8);
  const tag: k.Plan = { x: plan.x + 12, y: plan.y + plan.d - 16, w: 38, d: 10, r: 1.4 };
  return (
    <g>
      <path className="iso-halo" d={k.haloOf(plan, -h - 5, h + 5, P)} />
      {feet.map(([x, y], index) => (
        <g key={index}>
          <Solid paths={k.cylinder(x, y, 6, -h - 5, 1.4, P, 24)} tone="lo" />
          <Solid paths={k.cylinder(x, y, 4.6, -h - 3.6, 3.6, P, 24)} tone="mid" />
        </g>
      ))}
      <Solid paths={k.slabOf(plan, -h, h, P, 8, 1.4)} tone="mid" />
      <Line d={k.planOutline(k.insetPlan(plan, 5), 0, P)} tone="lo" />
      <Line d={screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join("")} tone="lo" />
      <Dots points={k.pointsAt(screws.map(([x, y]) => [x, y, 0] as k.Point3), P)} size={0.5} tone="mid" />
      {label ? (
        <g>
          <Solid paths={k.slabOf(tag, 0, 0.8, P, 3)} tone="lo" crease="none" />
          <Line d={k.planOutline(k.insetPlan(tag, 1.5), 0.8, P, 3)} tone="faint" />
          <Line d={[0.3, 0.55, 0.78].map((f, i) => k.lineOnTop([tag.x + 4, tag.y + 2.6 + i * 2.4], [tag.x + 4 + (tag.w - 8) * f, tag.y + 2.6 + i * 2.4], 0.8, P)).join("")} tone="lo" free />
        </g>
      ) : null}
    </g>
  );
}

// A step counter that only runs while the figure is on screen and the reader allows motion.
export function useTicker(ms: number, enabled = true) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const still = useStillness();
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    if (!inView || still || !enabled) return;
    const id = window.setInterval(() => setStep((s) => s + 1), ms);
    return () => window.clearInterval(id);
  }, [inView, still, enabled, ms]);
  return { ref, step, setStep, still };
}

// True only in the browser after hydration. The figures are drawn client-side only: Node and the
// browser can disagree in the last bit of sin/cos, which flips painter's-order ties and breaks hydration.
const noop = () => () => {};
export const useMounted = () => React.useSyncExternalStore(noop, () => true, () => false);

// Card + svg + optional controls, with a gentle 3D tilt under the pointer.
// `mode` is shown as a badge that pops whenever it changes, so a mode switch is impossible to miss.
export function Figure({
  boxRef,
  fig,
  title,
  hint,
  readout,
  keys,
  caption,
  label,
  mode,
  controls,
  onPointerMove,
  onPointerLeave,
  children,
}: {
  boxRef?: React.Ref<HTMLDivElement>;
  fig: string;
  title: string;
  hint?: string;
  readout: React.ReactNode;
  keys?: { mark: k.LegendKey["mark"]; label: string }[];
  caption?: React.ReactNode;
  label: string;
  mode?: string;
  controls?: React.ReactNode;
  onPointerMove?: (u: number, v: number) => void;
  onPointerLeave?: () => void;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const tilt = React.useRef<HTMLDivElement>(null);
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const u = (event.clientX - box.left) / box.width;
    const v = (event.clientY - box.top) / box.height;
    tilt.current?.style.setProperty("--rx", `${((0.5 - v) * 5).toFixed(2)}deg`);
    tilt.current?.style.setProperty("--ry", `${((u - 0.5) * 7).toFixed(2)}deg`);
    onPointerMove?.(u, v);
  };
  const leave = () => {
    tilt.current?.style.setProperty("--rx", "0deg");
    tilt.current?.style.setProperty("--ry", "0deg");
    onPointerLeave?.();
  };
  return (
    <div className="fig" ref={boxRef}>
      <div className="tilt" ref={tilt} onPointerMove={move} onPointerLeave={leave}>
        {mode ? (
          <div className="mode-badge" key={mode} role="status">
            <span className="mode-dot" aria-hidden="true" />
            {mode}
          </div>
        ) : null}
        <Plate fig={fig} title={title} hint={hint} readout={readout} keys={keys} caption={caption}>
          <svg className="iso-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} focusable="false">
            {mounted ? children : null}
          </svg>
        </Plate>
      </div>
      {controls ? <div className="controls">{controls}</div> : null}
    </div>
  );
}

export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; text: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="choice" role="group" aria-label={label}>
      <span className="choice-label">{label}</span>
      {options.map((option) => (
        <button key={String(option.value)} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.text}
        </button>
      ))}
    </div>
  );
}
