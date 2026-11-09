// Self-check of the snapshot trainer and of how the test bank grades (node scripts/snap-check.mts).
import assert from "node:assert/strict";
import { PROF, randomExercise, walk, type Exercise, type Part } from "../components/snap-logic.ts";
import { examDraw, isCorrect, normalize, points, qid, QUESTIONS, type Question } from "../components/questions.ts";
import { TOPICS } from "../components/topics.ts";

// The professor's exercise, as the campus corrects it.
const cost = (ex: Exercise, p: Part) => p.asks.map((a) => walk(ex, p, a).length);
assert.deepEqual(PROF.parts.flatMap((p) => cost(PROF, p)), [4, 2, 3, 2, 2, 4, 5, 2, 3]);

// Thick base: no metadata, 1 access to read from it. Δ2 is newer than snap1, so from snap1 it does not count.
const thick: Exercise = { thick: true, base: [], deltas: [[1, 2], [3]], parts: [] };
const r = (b: number) => ({ op: "leer" as const, b });
const w = (b: number) => ({ op: "escribir" as const, b });
const at2: Part = { from: 2, delta: [5], asks: [r(5), r(3), r(1), r(9), w(5), w(9)] };
assert.deepEqual(cost(thick, at2), [2, 3, 4, 4, 2, 3]);
assert.deepEqual(cost({ ...thick, thick: false, base: [9] }, at2), [2, 3, 4, 5, 2, 3], "thin: la base es un volumen más");
const at1: Part = { from: 1, delta: [5], asks: [r(3), r(1)] };
assert.deepEqual(cost(thick, at1), [3, 3]);
assert.deepEqual(cost(thick, { from: 0, delta: [5], asks: [r(3), r(1)] }), [2, 2]);

// Random exercises: always answerable (thin: the block is somewhere), and writes never go down the chain.
for (let i = 0; i < 3000; i++) {
  const ex = randomExercise();
  assert.equal(ex.parts.length, 2);
  assert(ex.parts[0].from < ex.parts[1].from && ex.parts[1].from <= ex.deltas.length);
  for (const p of ex.parts) {
    assert(p.asks.length >= 3 && p.asks.every((a) => Number.isInteger(a.b)));
    for (const a of p.asks) {
      const steps = walk(ex, p, a);
      assert.equal(steps.at(-1)!.act, "dato", `el bloque ${a.b} no está en ningún volumen`);
      if (a.op === "escribir") assert(steps.every((s) => s.vol === "Δ") && steps.length === (p.delta.includes(a.b) ? 2 : 3));
    }
  }
}

// Grading: one answer, one or more, short answer.
const single: Question = { t: "popek", q: "1", o: ["a", "b", "c"], a: 1, why: "" };
assert(isCorrect(single, 1) && !isCorrect(single, 0) && !isCorrect(single, undefined) && !isCorrect(single, [1]));
const multi: Question = { t: "cpu", q: "2", o: ["a", "b", "c", "d"], a: [1, 3], why: "" };
assert(isCorrect(multi, [3, 1]));
assert(!isCorrect(multi, [1]) && !isCorrect(multi, [1, 2, 3]) && !isCorrect(multi, [0, 2]) && !isCorrect(multi, 1) && !isCorrect(multi, []));
const short: Question = { t: "popek", q: "3", s: ["Equivalencia; Eficiencia; Control de recursos"], why: "" };
assert(isCorrect(short, "  equivalencia ;EFICIENCIA;   control  de   recursos "));
assert(isCorrect(short, "Equivalencia; eficiéncia; contról de recursos;"));
assert(!isCorrect(short, "eficiencia; equivalencia; control de recursos"), "el orden cuenta");
assert(!isCorrect(short, "equivalencia; eficiencia") && !isCorrect(short, "") && !isCorrect(short, 0));
const alt: Question = { t: "cpu", q: "4", s: ["Traducción binaria", "binary translation"], why: "" };
assert(isCorrect(alt, "TRADUCCION  BINARIA") && isCorrect(alt, "Binary Translation") && !isCorrect(alt, "virtualización binaria"));
assert.equal(normalize("  Intérprete \t ÁRBOL  Ñu "), "interprete arbol nu");

// Negative marking: guessing averages 0, a blank is 0, and one or more right answers get partial credit, never below 0.
const four: Question = { t: "cpu", q: "5", o: ["a", "b", "c", "d"], a: 2, why: "" };
assert.equal(points(four, 2), 1);
assert.equal(points(four, 0), -1 / 3);
assert.equal(points(four, undefined), 0);
assert(Math.abs([0, 1, 2, 3].reduce((s, k) => s + points(four, k), 0)) < 1e-12, "adivinar no da 0 de media");
assert.equal(points({ t: "popek", q: "6", o: ["Verdadero", "Falso"], a: 0, why: "" }, 1), -1);
assert.equal(points(single, 0), -1 / 2);
assert.deepEqual([[1, 3], [1], [1, 0], [0, 2], [], [1, 3, 0]].map((x) => points(multi, x)), [1, 0.5, 0, 0, 0, 0.5]);
assert.equal(points(short, ""), 0);
assert.equal(points(short, "equivalencia; eficiencia; control de recursos"), 1);

// The full exam: 60 different test questions from the theory topics, each topic with its share of the bank, and the
// least seen first (here, the even indices).
const THEORY = TOPICS.filter((t) => t.kind === "Teoría").map((t) => t.id);
const testable = QUESTIONS.filter((q) => THEORY.includes(q.t) && !q.s);
for (let i = 0; i < 500; i++) {
  const ex = examDraw(60, THEORY, (j) => j % 2);
  assert.equal(new Set(ex).size, 60);
  assert(ex.every((j) => THEORY.includes(QUESTIONS[j].t) && !QUESTIONS[j].s && j % 2 === 0));
  for (const t of THEORY) {
    const share = (60 * testable.filter((q) => q.t === t).length) / testable.length;
    const got = ex.filter((j) => QUESTIONS[j].t === t).length;
    assert(got === Math.floor(share) || got === Math.ceil(share), `${t}: ${got} preguntas para una cuota de ${share.toFixed(2)}`);
  }
}
// With weights: the professor's mix by tema (11, 15 and 4 of 30) gives 22, 30 and 8 of 60.
const mix: Record<string, number> = { T1: 11, T2: 15, T3: 4 };
const tagOf = (id: string) => TOPICS.find((t) => t.id === id)!.tag;
const per = (id: string) => testable.filter((q) => q.t === id).length;
const weight = (id: string) => (mix[tagOf(id)] * per(id)) / THEORY.filter((t) => tagOf(t) === tagOf(id)).reduce((s, t) => s + per(t), 0);
for (let i = 0; i < 500; i++) {
  const ex = examDraw(60, THEORY, () => 0, weight);
  assert.equal(new Set(ex).size, 60);
  const byTag = { T1: 0, T2: 0, T3: 0 } as Record<string, number>;
  ex.forEach((j) => byTag[tagOf(QUESTIONS[j].t)]++);
  assert(Math.abs(byTag.T1 - 22) <= 1 && Math.abs(byTag.T2 - 30) <= 1 && byTag.T3 === 8, JSON.stringify(byTag));
}

// The bank: well formed, and one id per statement (the stats are kept by id).
assert.equal(new Set(QUESTIONS.map(qid)).size, QUESTIONS.length, "dos preguntas con el mismo enunciado");
for (const q of QUESTIONS) {
  if (q.s) assert(q.s.length && q.s.every((s) => normalize(s)) && !q.o && q.a === undefined, `respuesta corta mal formada: ${q.q}`);
  else {
    const ks = [q.a].flat();
    assert(q.o && q.o.length >= 2 && ks.length && ks.every((k) => Number.isInteger(k) && k! >= 0 && k! < q.o!.length), `test mal formado: ${q.q}`);
    assert.equal(new Set(ks).size, ks.length, `opción correcta repetida: ${q.q}`);
  }
}

const kinds = { una: 0, varias: 0, corta: 0 };
for (const q of QUESTIONS) kinds[q.s ? "corta" : Array.isArray(q.a) ? "varias" : "una"]++;
console.log(`OK · ejercicio del profesor 4 2 3 2 2 4 5 2 3 · 3000 ejercicios aleatorios · penalización y examen de 60 · ${QUESTIONS.length} preguntas (${kinds.una} de una, ${kinds.varias} de varias, ${kinds.corta} cortas; ${QUESTIONS.filter((q) => q.prof).length} del profesor)`);
