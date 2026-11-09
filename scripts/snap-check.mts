// Self-check of the snapshot trainer and of how the test bank grades (node scripts/snap-check.mts).
import assert from "node:assert/strict";
import { PROF, randomExercise, walk, type Exercise, type Part } from "../components/snap-logic.ts";
import { isCorrect, normalize, qid, QUESTIONS, type Question } from "../components/questions.ts";

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
console.log(`OK · ejercicio del profesor 4 2 3 2 2 4 5 2 3 · 3000 ejercicios aleatorios · ${QUESTIONS.length} preguntas (${kinds.una} de una, ${kinds.varias} de varias, ${kinds.corta} cortas; ${QUESTIONS.filter((q) => q.prof).length} del profesor)`);
