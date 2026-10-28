// The syllabus of the first exam, cut to what gets asked: every topic has its own hue so a change of topic is obvious at a glance.
export const TOPICS = [
  { id: "virtualizar", n: "01", title: "Virtualizar e hipervisor", tag: "T1", hue: 220, kind: "Teoría" },
  { id: "popek", n: "02", title: "Popek y Goldberg", tag: "T1", hue: 262, kind: "Teoría" },
  { id: "tipos", n: "03", title: "Tipos de hipervisor", tag: "T1", hue: 300, kind: "Teoría" },
  { id: "cpu", n: "04", title: "CPU virtual", tag: "T2", hue: 340, kind: "Teoría" },
  { id: "memoria", n: "05", title: "Memoria virtual", tag: "T2", hue: 25, kind: "Teoría" },
  { id: "discos", n: "06", title: "Discos, snapshots y clones", tag: "T2", hue: 65, kind: "Teoría" },
  { id: "red", n: "07", title: "Redes virtuales", tag: "T2", hue: 150, kind: "Teoría" },
  { id: "qemu", n: "08", title: "QEMU: máquinas y discos", tag: "P1", hue: 185, kind: "Práctica" },
  { id: "qemured", n: "09", title: "QEMU: redes", tag: "P2", hue: 205, kind: "Práctica" },
] as const;

// Review tools after the syllabus.
export const REVIEW = [
  { id: "test", n: "?", title: "Test de examen", tag: "banco de preguntas", hue: 280, kind: "Repaso" },
  { id: "chuleta", n: "✓", title: "Chuleta del laboratorio", tag: "comandos y trampas", hue: 160, kind: "Repaso" },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export const topic = (id: TopicId) => TOPICS.find((t) => t.id === id)!;
