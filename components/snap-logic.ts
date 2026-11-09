// Snapshot chains like the professor's exercise, and how many real disk accesses a read or a write costs there.
// His rules, with no disk cache: a read goes down the chain from the current delta, +1 for the metadata of each volume
// and +1 for the data where the block is. A thin base is one more volume; a thick base has no metadata, so reading from
// it is 1 access. A write always goes to the current delta: +1 metadata, then +1 data if the block was there (2), or
// +1 new offset in the metadata and +1 data if it was not (3).

export interface Ask {
  op: "leer" | "escribir";
  b: number;
}
// The current state hangs from snap<from> and writes to its own delta.
export interface Part {
  from: number;
  delta: number[];
  asks: Ask[];
}
// deltas[k - 1] is Δk, frozen by snap<k>; snap0 froze the base.
export interface Exercise {
  thick: boolean;
  base: number[];
  deltas: number[][];
  parts: Part[];
}
export interface Step {
  vol: string; // "Δ" (current), "Δ1"…, "Base"
  act: "meta" | "dato" | "offset";
  hit?: boolean; // meta: the block is in that volume
}

export const BLOCKS = 21; // LBA 0 to 20, as in the professor's figure

const r = (b: number): Ask => ({ op: "leer", b });
const w = (b: number): Ask => ({ op: "escribir", b });

export const PROF: Exercise = {
  thick: false,
  base: [0, 1, 2, 4, 5, 6, 7, 8, 12, 14, 15, 20],
  deltas: [
    [0, 2, 3, 6],
    [2, 5, 15],
  ],
  parts: [
    { from: 1, delta: [2, 3, 12], asks: [r(1), r(2), w(1), w(2)] },
    { from: 2, delta: [0, 1], asks: [r(0), r(3), r(20), w(0), w(3)] },
  ],
};

/** Every step is one access, so the answer is walk(...).length. Deltas newer than snap<from> never count. */
export function walk(ex: Exercise, p: Part, a: Ask): Step[] {
  if (a.op === "escribir") {
    const hit = p.delta.includes(a.b);
    const steps: Step[] = [{ vol: "Δ", act: "meta", hit }];
    if (!hit) steps.push({ vol: "Δ", act: "offset" });
    return [...steps, { vol: "Δ", act: "dato" }];
  }
  const chain = [{ vol: "Δ", blocks: p.delta }, ...ex.deltas.slice(0, p.from).map((blocks, k) => ({ vol: `Δ${k + 1}`, blocks })).reverse()];
  if (!ex.thick) chain.push({ vol: "Base", blocks: ex.base });
  const steps: Step[] = [];
  for (const v of chain) {
    const hit = v.blocks.includes(a.b);
    steps.push({ vol: v.vol, act: "meta", hit });
    if (hit) return [...steps, { vol: v.vol, act: "dato" }];
  }
  return ex.thick ? [...steps, { vol: "Base", act: "dato" }] : steps; // thin and nowhere: never asked
}

const ALL = Array.from({ length: BLOCKS }, (_, b) => b);
const int = (lo: number, hi: number, rnd: () => number) => lo + Math.floor(rnd() * (hi - lo + 1));
const sample = (list: number[], n: number, rnd: () => number) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n).sort((x, y) => x - y);
};
const pick = (list: number[], rnd: () => number) => list[Math.floor(rnd() * list.length)];

/** A new exercise like the professor's: 1 to 3 deltas and two states hanging from different snapshots, 2–3 reads and 2 writes each. */
export function randomExercise(rnd: () => number = Math.random): Exercise {
  const thick = rnd() < 0.3;
  const n = int(1, 3, rnd);
  const ex: Exercise = {
    thick,
    base: thick ? ALL : sample(ALL, int(8, 12, rnd), rnd),
    deltas: Array.from({ length: n }, () => sample(ALL, int(2, 4, rnd), rnd)),
    parts: [],
  };
  ex.parts = sample(ALL.slice(0, n + 1), 2, rnd).map((from) => {
    const p: Part = { from, delta: sample(ALL, int(1, 3, rnd), rnd), asks: [] };
    // Reads: blocks found in different volumes, so every depth gets asked. Thin and nowhere is left out.
    const found = new Map<string, number[]>();
    for (const b of ALL) {
      const last = walk(ex, p, r(b)).at(-1)!;
      if (last.act === "dato") found.set(last.vol, [...(found.get(last.vol) ?? []), b]);
    }
    const groups = [...found.values()];
    const reads = sample(groups.map((_, i) => i), int(2, 3, rnd), rnd).map((i) => pick(groups[i], rnd));
    // Writes: one block already in Δ and one that a read would find further down (the trap is to go down).
    const deeper = [...found].flatMap(([vol, bs]) => (vol === "Δ" ? [] : bs));
    const writes = [pick(p.delta, rnd), pick(deeper.length ? deeper : ALL.filter((b) => !p.delta.includes(b)), rnd)];
    p.asks = [...reads.sort((x, y) => x - y).map(r), ...writes.sort((x, y) => x - y).map(w)];
    return p;
  });
  return ex;
}
