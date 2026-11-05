// Self-check for the concept bank (node scripts/concepts-check.mts): well-formed questions, real PDF pages, fair mock exams.
import assert from "node:assert/strict";
import { AREAS, CONCEPTS, PAGES, pickExam } from "../components/concepts.ts";

const REF = /^(P1|P2-1|P2-2) (?:pág\. (\d+)|págs\. (\d+)(?:–| y )(\d+))$/;
const ids = new Set<string>();
let longest = 0;
for (const c of CONCEPTS) {
  assert(!ids.has(c.id), `id repetido: ${c.id}`);
  ids.add(c.id);
  assert(AREAS.some((a) => a.id === c.area), `${c.id}: área desconocida`);
  for (const t of [c.q, c.why, ...(c.o ?? []), ...(c.k ?? [])]) assert(t.split("`").length % 2 === 1, `${c.id}: comillas invertidas desparejadas en «${t}»`);
  if (c.o) {
    assert(!c.k && c.o.length === 4 && c.a !== undefined && c.a >= 0 && c.a < 4, `${c.id}: test mal formado`);
    assert.equal(new Set(c.o).size, 4, `${c.id}: opciones repetidas`);
    const len = c.o.map((o) => o.length);
    if (len.filter((l) => l >= len[c.a!]).length === 1) longest++;
  } else {
    assert(c.k && c.k.length >= 2 && c.k.length <= 5 && c.a === undefined, `${c.id}: abierta mal formada`);
  }
  for (const ref of c.pdf?.split(" · ") ?? []) {
    const m = REF.exec(ref);
    assert(m, `${c.id}: referencia mal escrita «${ref}»`);
    const max = PAGES[m[1] as keyof typeof PAGES];
    for (const p of m.slice(2).filter(Boolean).map(Number)) assert(p >= 1 && p <= max, `${c.id}: ${m[1]} no tiene pág. ${p}`);
  }
}
for (const a of AREAS) assert(CONCEPTS.filter((c) => c.area === a.id).length >= 6, `pocas preguntas de ${a.id}`);

// A mock exam has 3 per area and no repeats, and the next one brings questions not seen yet.
const area = (id: string) => CONCEPTS.find((c) => c.id === id)!.area;
const first = pickExam({});
assert.equal(first.length, AREAS.length * 3);
assert.equal(new Set(first).size, first.length);
for (const a of AREAS) assert.equal(first.filter((id) => area(id) === a.id).length, 3);
const seen = Object.fromEntries(first.map((id) => [id, 1]));
assert(pickExam(seen).every((id) => !seen[id]), "el segundo simulacro repite preguntas");

const tests = CONCEPTS.filter((c) => c.o).length;
const perArea = AREAS.map((a) => `${a.title} ${CONCEPTS.filter((c) => c.area === a.id).length}`).join(", ");
console.log(`OK · ${CONCEPTS.length} preguntas (${perArea}) · ${tests} test y ${CONCEPTS.length - tests} abiertas · ${CONCEPTS.filter((c) => !c.pdf).length} no están en los PDFs`);
console.log(`La correcta es la opción más larga en ${longest} de ${tests} tests`);
