// The syllabus of the first exam: every topic has its own hue so a change of topic is obvious at a glance.
export const PARTS = [
  { id: "I", title: "Fundamentos de la virtualización", source: "Tema 1" },
  { id: "II", title: "Virtualización de los recursos HW", source: "Tema 2" },
  { id: "III", title: "Prácticas con QEMU y KVM", source: "P1 · P2" },
] as const;

export const TOPICS = [
  { id: "virtualizar", n: "01", title: "Qué es virtualizar", tag: "T1", hue: 215, part: "I" },
  { id: "hipervisor", n: "02", title: "El hipervisor", tag: "T1", hue: 240, part: "I" },
  { id: "popek", n: "03", title: "Popek y Goldberg", tag: "T1", hue: 265, part: "I" },
  { id: "tipos", n: "04", title: "Tipos de hipervisor", tag: "T1", hue: 290, part: "I" },
  { id: "tecnicas", n: "05", title: "Cómo se implementa: emulación, BT, trap & emulate, HW", tag: "T2", hue: 320, part: "II" },
  { id: "cpu", n: "06", title: "CPU virtual", tag: "T2", hue: 345, part: "II" },
  { id: "memoria", n: "07", title: "Repaso de memoria", tag: "T2 · SO", hue: 15, part: "II" },
  { id: "ram", n: "08", title: "RAM virtual", tag: "T2", hue: 35, part: "II" },
  { id: "discos", n: "09", title: "Discos virtuales", tag: "T2", hue: 58, part: "II" },
  { id: "snapshots", n: "10", title: "Snapshots y clones", tag: "T2", hue: 85, part: "II" },
  { id: "red", n: "11", title: "Red virtual", tag: "T2", hue: 150, part: "II" },
  { id: "p1", n: "12", title: "P1 · Máquinas virtuales con QEMU/KVM", tag: "P1", hue: 175, part: "III" },
  { id: "p2", n: "13", title: "P2 · Redes en QEMU", tag: "P2", hue: 195, part: "III" },
  { id: "lab", n: "14", title: "Laboratorio de examen", tag: "P1 · P2", hue: 125, part: "III" },
] as const;

// Study tools around the syllabus.
export const EXTRAS = [
  { id: "mapa", n: "★", title: "Mapa mental", tag: "todo de un vistazo", hue: 265 },
  { id: "comparativas", n: "⇄", title: "Comparativas", tag: "tablas cara a cara", hue: 190 },
  { id: "test", n: "?", title: "Test de examen", tag: "banco de preguntas", hue: 300 },
  { id: "flashcards", n: "⚡", title: "Flashcards", tag: "memoriza los términos", hue: 45 },
  { id: "chuleta", n: "✓", title: "Chuleta final", tag: "comandos y trampas", hue: 150 },
] as const;

export type TopicId = (typeof TOPICS)[number]["id"];
export const topic = (id: TopicId) => TOPICS.find((t) => t.id === id)!;
