"use client";

import * as React from "react";
import { TOPICS, type TopicId } from "./topics";

const CARDS: { t: TopicId; f: string; b: string }[] = [
  { t: "virtualizar", f: "Virtualizar", b: "Ofrecer recursos hardware ficticios sobre los que el software preexistente funciona sin modificarse. Solo cambian los tiempos." },
  { t: "virtualizar", f: "Host vs guest", b: "Host: SO instalado en el hardware físico. Guest: SO instalado dentro de la máquina virtual." },
  { t: "virtualizar", f: "Hipervisor (VMM)", b: "Virtual Machine Monitor: el software que implementa la virtualización y controla todos los recursos físicos." },
  { t: "virtualizar", f: "Isomorfismo", b: "Definición formal: a cada estado y transición del sistema real le corresponde uno equivalente en el virtual." },
  { t: "hipervisor", f: "Dispatcher", b: "Módulo que, tras un trap, decide a qué módulo llamar." },
  { t: "hipervisor", f: "Allocator", b: "Módulo que asigna recursos físicos reales a las MVs." },
  { t: "hipervisor", f: "Intérprete", b: "Módulo que simula el efecto de las instrucciones que le pasa el dispatcher." },
  { t: "popek", f: "Popek y Goldberg (1974)", b: "Equivalencia (salvo tiempos) · eficiencia (casi todo sin hipervisor) · control de recursos." },
  { t: "popek", f: "Instrucción privilegiada", b: "Genera trap en modo usuario; solo se ejecuta correctamente en modo privilegiado." },
  { t: "popek", f: "Sensible de control", b: "Cambia la configuración de recursos: cambio de modo, tabla de páginas…" },
  { t: "popek", f: "Sensible de comportamiento", b: "Su resultado depende de la configuración (p. ej., del modo usuario/supervisor)." },
  { t: "popek", f: "Teorema 1", b: "Si sensibles ⊆ privilegiadas, se puede construir un VMM (trap & emulate). Condición suficiente." },
  { t: "popek", f: "Teorema 2", b: "Virtualización recursiva: virtualizable + VMM sin dependencias temporales. No siempre posible." },
  { t: "popek", f: "Teorema 3", b: "VMM híbrido si las sensibles de usuario ⊆ privilegiadas. Interpreta el modo kernel del guest: pierde eficiencia." },
  { t: "popek", f: "Por qué x86 no era virtualizable", b: "Sensibles no privilegiadas (POPF, SGDT…) que en modo usuario no generan trap." },
  { t: "tipos", f: "Tipo 1 (bare metal)", b: "Hipervisor = kernel propio sobre el hardware, con sus drivers. VMware ESXi." },
  { t: "tipos", f: "Tipo 2 (hosted)", b: "Hipervisor = aplicación del SO host + módulo en su kernel; la E/S usa el host. VirtualBox, VMware Workstation, QEMU/KVM." },
  { t: "tipos", f: "Dom0", b: "MV privilegiada con acceso al hardware que hace la E/S de las demás con sus drivers. Xen, Hyper-V (partición padre)." },
  { t: "tipos", f: "Paravirtualización", b: "Se modifica el kernel del guest: las instrucciones no virtualizables se cambian por hypercalls." },
  { t: "tecnicas", f: "Emulación", b: "Intérprete que simula instrucción a instrucción. Permite V ≠ R. Lo más lento." },
  { t: "tecnicas", f: "Traducción binaria", b: "Reescribe bloques básicos en una Translation Cache (IDENT, INLINE, CALLOUT) que se ejecuta en modo usuario." },
  { t: "tecnicas", f: "Trap & emulate", b: "El guest corre desprivilegiado; cada privilegiada provoca un trap y el hipervisor la emula. Una syscall con E/S: 3 traps." },
  { t: "tecnicas", f: "Implementación híbrida", b: "Trap & emulate en modo usuario + traducción binaria en modo kernel. VMware, 2002." },
  { t: "tecnicas", f: "VT-x / AMD-V", b: "Modo guest pseudoprivilegiado; solo algunas instrucciones (E/S, interrupciones) provocan exit." },
  { t: "tecnicas", f: "VMCB", b: "Estructura en memoria: shadow registers de la MV, máscara de instrucciones que provocan exit y diagnóstico del exit." },
  { t: "tecnicas", f: "vmrun", b: "Instrucción que pasa del hipervisor al modo guest cargando el estado del VMCB." },
  { t: "cpu", f: "Expulsión de una MV", b: "Por HALT (privilegiada: el hipervisor la detecta) o por timeout del cuanto. Planificación round-robin." },
  { t: "memoria", f: "PTBR", b: "Page Table Base Register: apunta a la tabla de páginas del proceso. Se guarda en el PCB." },
  { t: "memoria", f: "TLB", b: "Caché de pares (página, marco). Hay que vaciarla al cambiar de contexto o etiquetar con el PID." },
  { t: "memoria", f: "Accesos con N niveles", b: "N + 1 accesos a memoria por cada acceso a un dato (sin acierto de TLB)." },
  { t: "ram", f: "ELV → EFV → EFR", b: "Lógico del guest → físico del guest (marcos virtuales) → físico real (máquina)." },
  { t: "ram", f: "Shadow page tables", b: "Software: tabla directa ELV → EFR por proceso de cada MV; muchos exits para mantenerla coherente." },
  { t: "ram", f: "Nested paging / EPT", b: "Hardware: la MMU recorre la tabla del guest y la nested. (G+1)(N+1) accesos; la TLB es crítica." },
  { t: "ram", f: "Hidden page fault", b: "Fallo en una página que el guest cree presente pero que el hipervisor sacó de la RAM real." },
  { t: "ram", f: "Ballooning", b: "Un driver globo dentro del guest reserva memoria para que el hipervisor recupere marcos que el guest no usa." },
  { t: "ram", f: "Overcommit de RAM", b: "La RAM virtual en uso de las MVs supera la física: working set, ballooning y swap privado invisible para el guest." },
  { t: "discos", f: "LUN y LBA", b: "SCSI expone unidades lógicas (LUN) de bloques direccionados por LBA, sin geometría." },
  { t: "discos", f: "By-pass vs fichero", b: "Volumen físico: menos retardo, menos portable. Fichero: más latencia, portable y flexible." },
  { t: "discos", f: "Thick eager-zeroed", b: "Reserva y pone a cero todo al crear: creación lenta, mejor rendimiento." },
  { t: "discos", f: "Thick lazy-zeroed", b: "Reserva todo al crear; pone a cero en la primera escritura." },
  { t: "discos", f: "Thin", b: "Reserva bajo demanda: ocupa lo escrito, 1.ª escritura lenta, fragmenta, permite over-provisioning." },
  { t: "discos", f: "Flat", b: "Bloque N en la posición N del fichero. Sin índice ni CoW: clonar = duplicar todo." },
  { t: "discos", f: "Index (qcow2)", b: "Mapa de bloques: copy-on-write, backing files y snapshots baratos; cada acceso consulta el índice." },
  { t: "snapshots", f: "Snapshot CoW", b: "Escrituras al delta; lecturas al delta y, si no está, al volumen congelado." },
  { t: "snapshots", f: "Checkpoint", b: "Snapshot de una MV completa: discos + RAM + configuración hardware." },
  { t: "snapshots", f: "Revert", b: "Volver a un snapshot: se tira el delta actual y se crea uno nuevo. Muy rápido." },
  { t: "snapshots", f: "Delete + consolidación", b: "Borrar un snapshot obliga a incorporar su delta al siguiente o al base. Tarda según lo que haya." },
  { t: "snapshots", f: "Linked clone", b: "Clon diferencial sobre la plantilla: instantáneo y ligero; no se puede tocar la plantilla. Ideal para VDI." },
  { t: "snapshots", f: "fsfreeze", b: "Congela el sistema de ficheros para que el snapshot de una MV encendida sea consistente." },
  { t: "red", f: "Bridged", b: "La NIC es un puente de nivel 2: la MV es un equipo más de la LAN." },
  { t: "red", f: "NAT", b: "Router con NAT con la IP del host: la MV sale, pero desde fuera no se entra sin redirigir puertos." },
  { t: "red", f: "Host-only", b: "LAN sin NIC real: aislada, solo comunica MVs (y el host)." },
  { t: "red", f: "VLAN 802.1q", b: "Grupos de puertos etiquetados; la NIC real va en modo trunk llevando varias VLAN." },
  { t: "p1", f: "-f / -F / -b", b: "qemu-img create: -f formato del nuevo, -F formato del base, -b el disco base." },
  { t: "p1", f: "Ctrl+A x / Ctrl+A c", b: "x: matar la MV (power off duro). c: alternar con el monitor de QEMU." },
  { t: "p1", f: "console=ttyS0", b: "Manda los mensajes del kernel al puerto serie (el que muestra -nographic). Se pone en la base." },
  { t: "p1", f: "< /dev/null", b: "Entrada vacía para que QEMU en segundo plano con -nographic no se quede parado (estado T)." },
  { t: "p2", f: "SLiRP", b: "Red user: NAT dentro de QEMU. Sin root, sin ping. MV 10.0.2.15, host 10.0.2.2, DNS 10.0.2.3." },
  { t: "p2", f: "hostfwd", b: "hostfwd=tcp::PUERTO_HOST-:PUERTO_GUEST. Host a la izquierda." },
  { t: "p2", f: "/etc/qemu/bridge.conf", b: "ACL de bridges: allow br1 para que QEMU pueda conectarse a br1." },
];

const KEY = "asv-flashcards";

export function Flashcards() {
  const [topic, setTopic] = React.useState<TopicId | "all">("all");
  const [known, setKnown] = React.useState<Set<number>>(new Set());
  const [order, setOrder] = React.useState<number[]>(() => CARDS.map((_, i) => i));
  const [pos, setPos] = React.useState(0);
  const [flip, setFlip] = React.useState(false);
  const [hideKnown, setHideKnown] = React.useState(true);
  React.useEffect(() => {
    try {
      setKnown(new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]")));
    } catch {}
  }, []);
  const persist = (s: Set<number>) => {
    setKnown(s);
    try {
      localStorage.setItem(KEY, JSON.stringify([...s]));
    } catch {}
  };
  const deck = order.filter((i) => (topic === "all" || CARDS[i].t === topic) && (!hideKnown || !known.has(i)));
  const cur = deck.length ? deck[Math.min(pos, deck.length - 1)] : null;
  const card = cur === null ? null : CARDS[cur];
  const go = (d: number) => {
    setFlip(false);
    setPos((p) => (deck.length ? (p + d + deck.length) % deck.length : 0));
  };
  const mark = (ok: boolean) => {
    if (cur === null) return;
    const s = new Set(known);
    if (ok) s.add(cur);
    else s.delete(cur);
    persist(s);
    setFlip(false);
    if (!ok || !hideKnown) go(1);
  };
  const usedTopics = TOPICS.filter((t) => CARDS.some((c) => c.t === t.id));
  const t = card ? TOPICS.find((x) => x.id === card.t)! : null;
  return (
    <section className="fc reveal" aria-label="Flashcards">
      <header className="quiz-head">
        <span className="dg-kicker">Pulsa la tarjeta para darle la vuelta</span>
        <strong>Flashcards</strong>
        <span className="quiz-score">
          {known.size} / {CARDS.length} sabidas
        </span>
      </header>
      <div className="controls">
        <label className="fc-sel">
          Tema
          <select
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value as TopicId | "all");
              setPos(0);
              setFlip(false);
            }}
          >
            <option value="all">Todos</option>
            {usedTopics.map((x) => (
              <option key={x.id} value={x.id}>
                {x.n} · {x.title}
              </option>
            ))}
          </select>
        </label>
        <label className="qb-check">
          <input type="checkbox" checked={hideKnown} onChange={(e) => (setHideKnown(e.target.checked), setPos(0))} /> Ocultar las que ya sé
        </label>
        <button type="button" className="btn ghost" onClick={() => (setOrder((o) => [...o].sort(() => Math.random() - 0.5)), setPos(0), setFlip(false))}>
          Barajar
        </button>
        {known.size ? (
          <button type="button" className="btn ghost" onClick={() => persist(new Set())}>
            Reiniciar
          </button>
        ) : null}
      </div>
      {card && t ? (
        <>
          <button type="button" className="fc-card" data-flip={flip ? "" : undefined} onClick={() => setFlip((f) => !f)} style={{ "--h": t.hue } as React.CSSProperties} aria-label={flip ? `Respuesta: ${card.b}` : `Pregunta: ${card.f}. Pulsa para ver la respuesta`}>
            <span className="fc-inner">
              <span className="fc-face fc-front">
                <span className="fc-topic">
                  {t.n} · {t.title}
                </span>
                <span className="fc-text">{card.f}</span>
                <span className="fc-hint">¿Qué es? · pulsa para girar</span>
              </span>
              <span className="fc-face fc-back">
                <span className="fc-topic">{card.f}</span>
                <span className="fc-text small">{card.b}</span>
              </span>
            </span>
          </button>
          <div className="tb-nav">
            <button type="button" className="btn ghost" onClick={() => go(-1)}>
              ◀
            </button>
            <button type="button" className="btn bad" onClick={() => mark(false)}>
              ✗ Repasar
            </button>
            <button type="button" className="btn good" onClick={() => mark(true)}>
              ✓ Lo sé
            </button>
            <button type="button" className="btn ghost" onClick={() => go(1)}>
              ▶
            </button>
            <span className="steps-count">
              {Math.min(pos, deck.length - 1) + 1} / {deck.length}
            </span>
          </div>
        </>
      ) : (
        <p className="tb-intro">🎉 No quedan tarjetas pendientes en este tema. Desmarca «Ocultar las que ya sé» o reinicia.</p>
      )}
    </section>
  );
}
