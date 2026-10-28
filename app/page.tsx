import { Cmd } from "@/components/code";
import { Countdown } from "@/components/countdown";
import { TrapTimeline } from "@/components/diagrams/cpu";
import { FlatIndexMatrix } from "@/components/diagrams/disks";
import { IsomorphismDiagram, ModulesDiagram } from "@/components/diagrams/intro";
import { TopologyLab } from "@/components/diagrams/lab";
import { NestedWalkGrid, PagingCalculator, ThreeSpacesDiagram } from "@/components/diagrams/memory";
import { HostedNetModes, VlanDiagram } from "@/components/diagrams/network";
import { PopekSetsDiagram, VcpuMatrix } from "@/components/diagrams/popek";
import { CommandAnatomy, PowerSim, SlirpDiagram } from "@/components/diagrams/practice";
import { DatastoreFigure } from "@/components/figs/datastore";
import { SnapshotFigure } from "@/components/figs/snapshot";
import { StackFigure } from "@/components/figs/stack";
import { Hero3D } from "@/components/hero3d";
import { RouteMap, TrueFalse, type VF } from "@/components/progress";
import { TestBank } from "@/components/testbank";
import { ThemeToggle } from "@/components/theme-toggle";
import { Formula, T, Terms } from "@/components/terms";
import { TopicBar } from "@/components/topic-bar";
import { REVIEW, topic, type TopicId } from "@/components/topics";

const hue = (h: number) => ({ "--h": h }) as React.CSSProperties;

/* ---------------------------------------------------------------- memory hooks and true/false, per topic */

const MNEMO: Record<TopicId, [string, React.ReactNode][]> = {
  virtualizar: [
    ["D · A · I", <>El <b>D</b>ispatcher decide, el <b>A</b>llocator asigna, el <b>I</b>ntérprete imita.</>],
    ["¿Recurso o efecto?", <>Si cambia <b>qué recursos reales</b> tiene la MV, allocator. Si solo hay que <b>fingir</b> la instrucción, intérprete.</>],
    ["Solo el reloj", <>Lo único que delata a una MV es el <b>tiempo</b>, nunca el resultado de una instrucción.</>],
  ],
  popek: [
    ["E · E · C", <><b>E</b>quivalencia, <b>E</b>ficiencia y <b>C</b>ontrol: lo que Popek y Goldberg piden a todo hipervisor.</>],
    ["Un círculo dentro del otro", <>Teorema 1: si el círculo de las sensibles cabe entero en el de las privilegiadas, todo lo peligroso hace trap.</>],
    ["POPF calla", <>La trampa del x86: en modo usuario no protesta (no hay trap), simplemente no hace caso.</>],
  ],
  tipos: [
    ["¿Qué hay debajo?", <>Un <b>SO</b>: tipo 2. <b>Nada</b>: tipo 1. Una MV con drivers <b>al lado</b>: Dom0.</>],
    ["Para = parcheado", <>La <b>para</b>virtualización toca el kernel del guest (hypercalls); la full no lo toca.</>],
  ],
  cpu: [
    ["3 → 1", <>Trap & emulate: <b>3 traps</b> por syscall con E/S (INT, IN/OUT, IRET). Con VT-x solo sale el IN/OUT: <b>1 exit</b>.</>],
    ["La matriz en 3 preguntas", <>¿Misma arquitectura? Si no, emulación. ¿Teorema 1? Trap & emulate; solo el 3, traducción binaria o híbrida. ¿Puedo tocar el guest? Paravirtualización.</>],
    ["I · I · C", <>Traducción binaria: <b>I</b>DENT copia, <b>I</b>NLINE sustituye, <b>C</b>ALLOUT llama a una rutina.</>],
  ],
  memoria: [
    ["Sombra por proceso, nested por máquina", <>Shadow: una tabla por <b>proceso</b> de cada MV. Nested: una por <b>MV</b>.</>],
    ["5 × 5 = 25", <>Cada uno de los G + 1 pasos del guest es una dirección EFV que cuesta N + 1 accesos. Con 4 + 4 niveles, 25.</>],
    ["P de presente, V de válida", <>P = 0: fallo de página, se trae del swap. V = 0: la página no es tuya, fallo de segmentación.</>],
  ],
  discos: [
    ["Cuándo · cómo", <>Thin/thick responde a <b>cuándo</b> se reserva el espacio; flat/index, a <b>cómo</b> se encuentra cada bloque. Son independientes: cuatro combinaciones.</>],
    ["Volver es gratis, borrar cuesta", <>Revert solo tira un delta; delete tiene que consolidar datos.</>],
    ["La plantilla no se toca", <>Los linked clones son diferencias respecto a ella: si cambia, se rompen.</>],
  ],
  red: [
    ["B · N · H", <><b>B</b>ridged: bien visible (nivel 2). <b>N</b>AT: nadie entra. <b>H</b>ost-only: hermético.</>],
    ["Trunk = varias VLAN por un cable", <>Cada trama lleva su etiqueta 802.1q, y el switch de fuera tiene que entenderla.</>],
  ],
  qemu: [
    ["-F de father", <><b>-F</b> mayúscula: el formato del padre (la base). <b>-f</b> minúscula: el del fichero nuevo.</>],
    ["Ctrl+A: x de exit, c de consola", <><b>x</b> mata QEMU (apagado duro); <b>c</b> alterna entre la consola y el monitor.</>],
    ["wait=off: no espera", <>La MV arranca sin esperar a que alguien se conecte por telnet.</>],
  ],
  qemured: [
    ["H-G", <>En hostfwd va primero el <b>host</b> y luego el <b>guest</b>: tcp::HOST-:GUEST.</>],
    ["Mismo id, misma tarjeta", <><code>-netdev …,id=X</code> y <code>-device …,netdev=X</code>: si no coinciden, no hay red.</>],
    [".15 · .2 · .3", <>En SLiRP, .15 eres tú (la MV), .2 la puerta de enlace (el host), .3 el DNS.</>],
  ],
};

const VFS: Record<TopicId, VF[]> = {
  virtualizar: [
    ["Un programa puede notar que corre en una MV porque sus instrucciones dan otro resultado.", false, "Por el isomorfismo el resultado es idéntico: solo cambian los tiempos."],
    ["Cuando el guest carga un PTBR nuevo, tras el dispatcher actúa el allocator.", true, "Cambia la memoria real que tiene asignada la MV."],
    ["Un OUT al puerto del disco virtual lo resuelve el allocator.", false, "No cambia los recursos asignados: el intérprete emula el controlador."],
    ["El host es el sistema operativo instalado dentro de la máquina virtual.", false, "Ese es el guest. El host es el del hardware físico."],
    ["El aislamiento impide que una MV acceda a recursos que no se le han asignado.", true, "Por eso una MV comprometida no compromete a las demás."],
  ],
  popek: [
    ["El teorema 1 es una condición necesaria para poder virtualizar.", false, "Es suficiente: el teorema 3 virtualiza con una condición más débil."],
    ["El VMM híbrido del teorema 3 sacrifica la eficiencia.", true, "Interpreta todo lo que el guest ejecuta en modo kernel."],
    ["En el x86 clásico, POPF en modo usuario genera un trap al intentar cambiar el flag de interrupciones.", false, "Lo ignora en silencio: por eso el x86 no cumple el teorema 1."],
    ["Cambiar la tabla de páginas es una instrucción sensible de control.", true, "Cambia la configuración de los recursos (la memoria asignada)."],
    ["Una instrucción cuyo resultado depende del modo de la CPU es sensible de comportamiento.", true, "Behaviour sensitive."],
  ],
  tipos: [
    ["Un hipervisor tipo 2 se ejecuta directamente sobre el hardware.", false, "Ese es el tipo 1. El tipo 2 corre sobre un SO host."],
    ["La paravirtualización no necesita modificar el guest.", false, "Cambia su kernel para usar hypercalls y pierde la equivalencia."],
    ["En Xen, la E/S de las DomU la hace el Dom0 con sus drivers.", true, "Es el tipo 1 con dominio 0."],
    ["En la asignatura, QEMU/KVM se clasifica como hosted (tipo 2).", true, "QEMU es un proceso del host y KVM, un módulo de su kernel."],
    ["Sin --enable-kvm, QEMU sigue usando VT-x.", false, "Emula con TCG, traducción binaria: mucho más lento."],
  ],
  cpu: [
    ["Con VT-x, la INT de una llamada al sistema provoca un exit.", false, "El guest ejecuta su syscall solo; lo que sale es el IN/OUT."],
    ["La emulación pierde la propiedad de equivalencia.", false, "Pierde la eficiencia: ninguna instrucción va directa a la CPU."],
    ["En traducción binaria, cli se traduce INLINE: poner a 0 una variable que hace de flag de interrupciones.", true, "No toca las interrupciones reales."],
    ["La implementación híbrida usa traducción binaria en modo usuario y trap & emulate en modo kernel.", false, "Al revés: trap & emulate en usuario y traducción en kernel."],
    ["El hipervisor puede expulsar a una MV de la CPU cuando ejecuta HALT.", true, "HALT es privilegiada: el hipervisor lo ve y planifica otra MV."],
  ],
  memoria: [
    ["Las tablas nested son una por proceso del guest.", false, "Una por MV; las shadow son una por proceso."],
    ["Con shadow page tables hay que modificar el guest.", false, "El guest no se entera: el hipervisor intercepta lo que programa en su MMU."],
    ["Con 4 niveles en el guest y 4 nested, un fallo de TLB cuesta 25 accesos.", true, "(4 + 1) × (4 + 1)."],
    ["El swap privado que usa el hipervisor es visible para el guest.", false, "Es invisible: de ahí los hidden page faults."],
    ["Con 32 bits, 1 GB de RAM y páginas de 4 KB, la tabla de un nivel ocupa 4 MB.", true, "1 M entradas de 4 B."],
  ],
  discos: [
    ["Un disco flat permite snapshots baratos.", false, "No tiene copy-on-write: hay que duplicarlo todo."],
    ["Un disco thick puede hacer over-provisioning.", false, "Reserva todo al crearse: nunca hay overcommit."],
    ["Revertir un snapshot es lento porque hay que consolidar.", false, "Revertir es instantáneo; lo lento es borrar."],
    ["El mejor rendimiento lo da un disco thick eager-zeroed.", true, "Todo reservado y a cero desde el principio."],
    ["En un snapshot, las lecturas van primero al delta.", true, "Si el bloque no está ahí, al volumen congelado."],
    ["Se puede actualizar la plantilla de unos linked clones sin afectarlos.", false, "Sus deltas dejarían de encajar."],
  ],
  red: [
    ["En NAT, un equipo de la LAN externa puede abrir una conexión con la MV sin más.", false, "Hay que redirigir puertos."],
    ["Una LAN host-only está conectada a una NIC real del servidor.", false, "Está aislada del exterior."],
    ["Un trunk 802.1q lleva tramas de varias VLAN, cada una con su etiqueta.", true, "Y el switch externo también tiene que soportarlo."],
    ["El tráfico entre dos MVs del mismo vSwitch sale por la red real.", false, "Se copia entre buffers de memoria del hipervisor."],
    ["En bridged, la MV tiene su propia IP de la LAN externa.", true, "Es un equipo más a nivel 2."],
  ],
  qemu: [
    ["cp vm1.qcow2 copia.qcow2 crea un full clone independiente.", false, "Copia solo el delta, que sigue apuntando a la base: usa qemu-img convert."],
    ["-m 512 sin unidad son 512 MiB.", true, "La unidad por defecto es MiB."],
    ["Ctrl+A x apaga la MV de forma ordenada.", false, "Es un power off duro: el guest no se entera."],
    ["Con wait=on la MV arranca sin esperar al cliente telnet.", false, "wait=on la bloquea hasta la primera conexión; por eso se usa wait=off."],
    ["Una MV lanzada con -nographic y & pero sin < /dev/null se queda parada.", true, "Intenta leer del teclado en segundo plano: estado T."],
  ],
  qemured: [
    ["Con la red user funciona ping.", false, "SLiRP no implementa ICMP."],
    ["En hostfwd=tcp::2222-:22, el 22 es el puerto del host.", false, "El 22 es el del guest; el 2222, el del host."],
    ["Sin «allow br1» en /etc/qemu/bridge.conf, QEMU no puede conectar la MV a br1.", true, "Es la lista de bridges permitidos."],
    ["Dos MVs con red user en el mismo servidor se ven entre sí.", false, "Cada una tiene su red 10.0.2.0/24 aislada: hace falta un bridge."],
    ["Para que MV2 enrute entre LAN1 y LAN2 hay que activar ip_forward.", true, "Si no, descarta lo que no va dirigido a ella."],
  ],
};

const TOTALS = Object.fromEntries(Object.entries(VFS).map(([k, v]) => [k, v.length]));

/* ---------------------------------------------------------------- layout */

function Topic({ id, lead, figure, more, children }: { id: TopicId; lead: React.ReactNode; figure?: React.ReactNode; more?: React.ReactNode; children: React.ReactNode }) {
  const t = topic(id);
  return (
    <section id={t.id} className="sec" style={hue(t.hue)}>
      <header className="sec-banner reveal">
        <span className="sec-n" aria-hidden="true">
          {t.n}
        </span>
        <div>
          <p className="sec-tag">
            {t.kind} · <span className="chip">{t.tag}</span>
          </p>
          <h2>{t.title}</h2>
          <p className="lead">{lead}</p>
        </div>
      </header>
      <div className={figure ? "sec-body" : "sec-body solo"}>
        <Terms>{children}</Terms>
        {figure ? <div className="sec-fig reveal">{figure}</div> : null}
      </div>
      {more ? <div className="dg-grid">{more}</div> : null}
      <div className="sec-memo">
        <aside className="mnemo reveal">
          <span className="mnemo-kicker">🧠 Para recordarlo</span>
          {MNEMO[id].map(([key, text]) => (
            <div key={key} className="mnemo-item">
              <b className="mnemo-key">{key}</b>
              <p>{text}</p>
            </div>
          ))}
        </aside>
        <TrueFalse topic={id} items={VFS[id]} />
      </div>
    </section>
  );
}

function Divider({ h, kicker, title, meta }: { h: number; kicker: string; title: string; meta: string }) {
  return (
    <div className="part reveal" style={hue(h)}>
      <span className="part-id">{kicker}</span>
      <h2 className="part-title">{title}</h2>
      <span className="part-meta">{meta}</span>
    </div>
  );
}

function Review({ id, lead, children }: { id: (typeof REVIEW)[number]["id"]; lead: string; children: React.ReactNode }) {
  const e = REVIEW.find((r) => r.id === id)!;
  return (
    <section id={e.id} className="sec special" style={hue(e.hue)}>
      <header className="sec-banner reveal">
        <span className="sec-n" aria-hidden="true">
          {e.n}
        </span>
        <div>
          <p className="sec-tag">{e.tag}</p>
          <h2>{e.title}</h2>
          <p className="lead">{lead}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export default function Page() {
  return (
    <>
      <div className="progress" aria-hidden="true" />
      <TopicBar />
      <header className="hero">
        <div className="hero-floor" aria-hidden="true" />
        <div className="hero-top">
          <span className="brand">Arquitectura de Sistemas Virtualizados · primer parcial</span>
          <ThemeToggle />
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <h1>
              Sistemas
              <br />
              virtualizados
              <br />
              <span>lo esencial</span>
            </h1>
            <p className="hero-sub">Nueve temas y solo lo que se pregunta. En cada uno: las ideas clave, una figura que se mueve, un truco para recordarlo y un verdadero o falso para comprobar que te lo sabes.</p>
            <div className="hero-chips">
              <Countdown at="2026-11-06T12:45:00+01:00" label="Examen de laboratorio" when="vie 6 nov, 12:45" />
              <Countdown at="2026-11-12T08:00:00+01:00" label="Test de teoría" when="12–14 nov" />
              <span className="countdown ghost">Más de un 4 en cada parcial</span>
            </div>
          </div>
          <Hero3D />
        </div>
        <RouteMap totals={TOTALS} />
      </header>

      <main>
        <Divider h={230} kicker="Teoría" title="Temas 1 y 2" meta="7 temas · lo que entra en el test" />

        <Topic id="virtualizar" lead="Virtualizar es fabricar hardware ficticio tan fiel que el software de siempre funciona sin tocarlo. El hipervisor lo fabrica, lo reparte y lo vigila." figure={<ModulesDiagram />} more={<IsomorphismDiagram />}>
          <T k="Virtualizar" hot>
            Ofrecer hardware <b>ficticio</b> sobre el que el software existente funciona <b>sin modificarse</b>. Formalmente, un <b>isomorfismo</b>: cada estado y cada operación del sistema real tiene su equivalente en el virtual.
          </T>
          <T k="Lo único que se nota" hot show={[["Ver el retardo", "iso:load"]]}>
            Los <b>tiempos</b>: retardos en la E/S y pausas de CPU sin motivo aparente, porque emular cuesta y el hardware se comparte con otras MVs.
          </T>
          <T k="Host · guest · MV · VMM">
            <b>Host</b>: el SO del hardware físico. <b>Guest</b>: el SO de dentro de la MV. <b>MV</b>: el hardware virtual (vCPU, RAM, disco, NIC). <b>Hipervisor o VMM</b>: el software que crea y controla las MVs.
          </T>
          <T k="Para qué sirve">
            <b>Aislamiento</b>: si una MV cae o la comprometen, las demás siguen (sandboxes, análisis de malware). También consolidar servidores, failover y migración, software antiguo y pruebas what-if.
          </T>
          <T
            k="Dispatcher · allocator · intérprete"
            hot
            show={[
              ["Un OUT al disco", "mod:io"],
              ["Un PTBR nuevo", "mod:ptbr"],
              ["Un IRET", "mod:iret"],
            ]}
          >
            <b>Dispatcher</b>: recibe todos los traps y decide a quién llamar. <b>Allocator</b>: asigna recursos reales (CPU, marcos, dispositivos); actúa cuando la MV cambia lo que tiene asignado. <b>Intérprete</b>: simula la instrucción sobre el estado virtual.
          </T>
          <T k="Hipervisor frente a SO">
            Los dos ocultan el hardware. El SO da procesos, espacio lógico, ficheros y sockets a <b>procesos</b>; el hipervisor da vCPU, RAM, disco y NIC virtuales a <b>MVs</b> que ejecutan sistemas operativos.
          </T>
        </Topic>

        <Topic id="popek" lead="Qué tiene que cumplir un hipervisor y cuándo una CPU se puede virtualizar con trap & emulate. Es lo más preguntado del tema 1." figure={<PopekSetsDiagram />}>
          <T k="Las 3 propiedades" hot>
            <b>Equivalencia</b>: el programa se comporta igual que en la máquina real, salvo los tiempos. <b>Eficiencia</b>: casi todas las instrucciones van directas a la CPU real. <b>Control de recursos</b>: el hipervisor lo controla todo.
          </T>
          <T k="Privilegiadas" show={[["Ver el conjunto", "popek:priv"]]}>
            Provocan un <b>trap</b> si se ejecutan en modo usuario; solo funcionan en modo privilegiado.
          </T>
          <T k="Sensibles" show={[["Ver el conjunto", "popek:sens"]]}>
            <b>De control</b>: cambian la configuración de recursos (el modo, la tabla de páginas). <b>De comportamiento</b>: su resultado depende de esa configuración. El resto son <b>inocuas</b>.
          </T>
          <Formula title="Teorema 1 · virtualización clásica" show={[["Ver en el diagrama", "popek:ok"]]} example="Toda sensible hace trap: trap & emulate. Condición suficiente, no necesaria.">
            sensibles ⊆ privilegiadas
          </Formula>
          <Formula title="Teorema 2 · recursiva" example="Una MV dentro de otra MV… No siempre se puede.">
            virtualizable + VMM sin dependencias temporales
          </Formula>
          <Formula title="Teorema 3 · híbrida" example="Se interpreta todo el modo kernel del guest: se pierde eficiencia. Y siempre queda la emulación.">
            sensibles de usuario ⊆ privilegiadas
          </Formula>
          <T k="El x86 clásico" hot show={[["Verlo en x86", "popek:x86"]]}>
            <b>No cumple el teorema 1</b>: tiene 17 sensibles no privilegiadas. <code>POPF</code> en modo usuario <b>ignora en silencio</b> el cambio del flag de interrupciones; <code>PUSHF</code> o <code>SGDT</code> dejan ver el estado real. Solución: traducción binaria, híbrida y, desde 2005, VT-x / AMD-V.
          </T>
        </Topic>

        <Topic id="tipos" lead="Dónde vive el hipervisor: encima de un SO (tipo 2), directamente sobre el hardware (tipo 1) o sobre el hardware con una MV privilegiada que hace la E/S (Dom0)." figure={<StackFigure />}>
          <T k="Full virtualization">El guest no sabe que está virtualizado y <b>no se modifica</b>.</T>
          <T k="Paravirtualización" hot>
            Se <b>modifica el kernel del guest</b>: lo no virtualizable pasa a ser <b>hypercalls</b> (syscalls al hipervisor). Pierde la equivalencia y gana eficiencia. En QEMU, los dispositivos <b>virtio</b>.
          </T>
          <T k="Tipo 2 · hosted" hot show={[["Verlo en 3D", "stack:t2"]]}>
            Una aplicación del <b>SO host</b> más un módulo en su kernel que intercepta lo privilegiado; la E/S usa los drivers del host. VirtualBox, VMware Workstation, <b>QEMU/KVM</b>.
          </T>
          <T k="Tipo 1 · bare metal" show={[["Verlo en 3D", "stack:t1"]]}>
            Un kernel propio <b>sin SO debajo</b>, con sus propios drivers. VMware ESXi.
          </T>
          <T k="Tipo 1 con Dom0" show={[["Verlo en 3D", "stack:dom0"]]}>
            Bare metal, pero la E/S va por una <b>MV privilegiada</b> (Dom0, partición padre) con los drivers de un SO existente. Xen, Hyper-V.
          </T>
          <T k="QEMU/KVM por dentro">
            KVM es el módulo del kernel (<code>kvm</code>, <code>kvm_intel</code>, <code>/dev/kvm</code>) que usa VT-x; QEMU, el proceso que crea la MV y emula los dispositivos. <b>Cada MV es un proceso y cada vCPU, un hilo.</b> Sin <code>--enable-kvm</code>, TCG: traducción binaria, muy lento.
          </T>
          <T k="Kind III">JVM y contenedores: virtualización a nivel de SO, no son MVs. Entran en el segundo parcial.</T>
        </Topic>

        <Topic id="cpu" lead="Cinco formas de ejecutar el guest sin perder el control: emular, traducir, atrapar y emular, mezclar las dos o pedir ayuda al hardware." figure={<TrapTimeline />} more={<VcpuMatrix />}>
          <T k="Emulación (V ≠ R)">
            Un intérprete lee, decodifica y simula <b>instrucción a instrucción</b>. Vale para cualquier arquitectura y es lo más lento: <b>pierde la eficiencia</b>.
          </T>
          <T k="Traducción binaria (V = R)" hot>
            Reescribe el código del guest por <b>bloques básicos</b> y lo guarda en la <b>Translation Cache</b>: IDENT (se copia), INLINE (unas instrucciones sobre el estado virtual) o CALLOUT (llamada a una rutina). <code>cli</code> → INLINE; <code>mov cr3</code> → INLINE + CALLOUT. Problemas: código automodificable o autorreferente y sincronizar el PC virtual con las interrupciones.
          </T>
          <T k="Trap & emulate" hot show={[["Ver los 3 traps", "trap:te"]]}>
            El guest corre <b>desprivilegiado</b>: cada privilegiada provoca un trap y el hipervisor emula su efecto, con <b>shadow registers</b> para todo el estado privilegiado. Syscall con E/S: <b>3 traps</b>. No vale en el x86 clásico.
          </T>
          <T k="Híbrida">
            Trap & emulate en el <b>modo usuario</b> del guest y traducción binaria en su <b>modo kernel</b>. VMware, 2002.
          </T>
          <T k="Hardware: VT-x / AMD-V" hot show={[["Ver el único exit", "trap:hw"]]}>
            Nuevo <b>modo guest</b>: las syscalls no salen; IN/OUT e interrupciones provocan un <b>exit</b>. El <b>VMCB</b> guarda los shadow registers, la máscara de exits y el diagnóstico; <code>vmrun</code> entra en modo guest. Syscall con E/S: <b>1 exit</b>.
          </T>
          <T k="Reparto de la CPU">
            Round-robin entre MVs: una MV deja la CPU por <b>HALT</b> (no tiene trabajo) o por <b>timeout</b>. Visibilidad: <code>-cpu host</code> (rendimiento, atada al modelo) o <code>-cpu qemu64</code> (portable).
          </T>
        </Topic>

        <Topic
          id="memoria"
          lead="Con virtualización hay tres espacios de direcciones y dos MMUs. O el hipervisor mantiene tablas sombra por software, o el hardware recorre dos niveles de tablas."
          figure={<ThreeSpacesDiagram />}
          more={
            <>
              <PagingCalculator />
              <NestedWalkGrid />
            </>
          }
        >
          <T k="Paginación en un minuto" show={[["Calcularlo", "calc:example"]]}>
            La MMU traduce página → marco con la tabla del proceso (base en el <b>PTBR</b>). Bit <b>V</b>: la página es del proceso. Bit <b>P</b>: está en RAM; si no, <b>fallo de página</b>: se trae del swap y se reintenta la instrucción. Con N niveles, <b>N + 1</b> accesos; la <b>TLB</b> lo ahorra.
          </T>
          <Formula title="Ejercicio tipo" show={[["Calcularlo", "calc:example"]]} example="32 bits, 1 GB de RAM y páginas de 4 KB: 2^20 entradas × 4 B = 4 MB por proceso">
            tabla = nº de páginas × tamaño de entrada
          </Formula>
          <T k="Tres espacios" hot show={[["Ver el camino", "spaces:n"]]}>
            <b>ELV</b> (lógico del guest) → <b>EFV</b> (lo que el guest cree que es su RAM) → <b>EFR</b> (RAM real). Hay que emular la RAM y la MMU de la MV.
          </T>
          <T k="Shadow page tables" hot show={[["Ver la tabla sombra", "spaces:s"]]}>
            Software: el hipervisor carga en la MMU real una tabla <b>directa ELV → EFR</b>, <b>una por proceso de cada MV</b>, y pone las tablas del guest en solo lectura para enterarse de sus cambios: muchos exits. <b>Hidden page fault</b>: el guest cree la página en RAM, pero el hipervisor le quitó el marco.
          </T>
          <T k="Nested paging / EPT" hot show={[["Ver el recorrido", "walk:play"]]}>
            Hardware (Intel <b>EPT</b>, AMD <b>NPT/RVI</b>): tablas del guest (ELV → EFV) más tablas nested (EFV → EFR), <b>una por MV</b>. El guest gestiona sus tablas sin exits; la <b>TLB</b> es crítica.
          </T>
          <Formula title="Fallo de TLB con nested paging" show={[["Animarlo", "walk:play"]]} example="G = N = 4: 25 accesos (sin virtualizar, 5)">
            (G + 1) × (N + 1)
          </Formula>
          <T k="Overcommit">
            La RAM virtual en uso puede superar la física. Cada MV recibe su <b>working set</b>; el hipervisor recupera memoria con <b>ballooning</b> (un driver del guest que le hace liberar páginas) y, si no basta, usa un <b>swap privado invisible para el guest</b>.
          </T>
        </Topic>

        <Topic
          id="discos"
          lead="El guest siempre ve un disco SCSI. Detrás hay un volumen o un fichero, reservado de golpe o poco a poco, plano o indexado. Snapshots y linked clones son copy-on-write."
          figure={<SnapshotFigure />}
          more={
            <>
              <FlatIndexMatrix />
              <div className="dg-pair">
                <DatastoreFigure />
              </div>
            </>
          }
        >
          <T k="LUN y LBA">
            SCSI expone unidades lógicas (<b>LUN</b>) de bloques uniformes direccionados por <b>LBA</b>, sin geometría: siempre el mismo dispositivo y el mismo driver. Detrás, un volumen físico (<b>by-pass</b>: menos retardo, poco portable) o un <b>fichero</b> (portable y flexible, más latencia).
          </T>
          <T
            k="Thick o thin: cuándo se reserva"
            hot
            show={[
              ["Todo thick", "ds:thick"],
              ["Llenar el datastore", "ds:full"],
            ]}
          >
            <b>Thick</b>: todo al crear, nunca hay overcommit, y a cero por seguridad (<b>eager-zeroed</b> al crear, el mejor rendimiento; <b>lazy-zeroed</b> en la primera escritura). <b>Thin</b>: bajo demanda; solo ocupa lo escrito, fragmenta y permite <b>over-provisioning</b>.
          </T>
          <T k="Flat o index: cómo se encuentra el bloque" hot show={[["Rellenar la matriz", "fi:go"]]}>
            <b>Flat</b> (raw): el bloque N está en la posición N; rápido, pero <b>sin copy-on-write</b> (clonar es copiarlo todo). <b>Index</b> (qcow2): un mapa de bloques con CoW, backing files y snapshots baratos, a cambio de consultar el índice.
          </T>
          <T
            k="Snapshot copy-on-write"
            hot
            show={[
              ["Escribir", "snap:write"],
              ["Leer", "snap:read"],
              ["Congelar", "snap:snap"],
            ]}
          >
            El volumen pasa a <b>solo lectura</b> y se crea un <b>delta</b> vacío. Escrituras al delta; lecturas al delta y, si no está, al volumen congelado. <b>Checkpoint</b>: discos más RAM.
          </T>
          <T
            k="Revert y delete"
            show={[
              ["Revert", "snap:revert"],
              ["Delete", "snap:delete"],
            ]}
          >
            <b>Revert</b>: instantáneo, se tira el delta y se crea otro sobre el snapshot. <b>Delete</b>: hay que <b>consolidar</b> el delta en el siguiente volumen, y tarda según los datos.
          </T>
          <T k="Full o linked clone">
            <b>Full</b>: copia completa e independiente. <b>Linked</b>: un delta sobre la plantilla; instantáneo, ligero y con mejor caché, pero <b>la plantilla no se puede tocar</b>. Ideal para escritorios virtuales (VDI) con un broker.
          </T>
        </Topic>

        <Topic id="red" lead="Cada MV tiene NICs virtuales con su propia MAC, enchufadas a switches virtuales que salen al mundo por las NICs reales del servidor." figure={<HostedNetModes />} more={<VlanDiagram />}>
          <T k="NIC virtual">
            Cada una con su <b>MAC única</b>. Se emulan tarjetas populares (Intel <b>e1000</b>, PCnet) para usar drivers estándar, o paravirtualizadas (<b>virtio-net</b>), más rápidas.
          </T>
          <T k="Bridged" hot show={[["Probarlo", "net:bridged"]]}>
            La NIC real hace de <b>puente de nivel 2</b>: la MV es un equipo más de la LAN, con su MAC y su IP.
          </T>
          <T k="NAT" hot show={[["Probarlo", "net:nat"]]}>
            Un router NAT con la <b>IP del host</b>: la MV sale, pero <b>desde fuera no se entra</b> sin redirigir puertos.
          </T>
          <T k="Host-only" show={[["Probarlo", "net:host"]]}>
            Una LAN <b>sin NIC real</b>: aislada, solo entre MVs y el host.
          </T>
          <T
            k="vSwitch y VLAN 802.1q"
            hot
            show={[
              ["Dos VLAN por un trunk", "vlan:g2"],
              ["Grupo aislado", "vlan:iso"],
            ]}
          >
            En servidores: vSwitches con grupos de puertos etiquetados por VLAN. La NIC real va en modo <b>trunk</b> (tramas etiquetadas) y el switch externo también debe soportar 802.1q. Un vSwitch sin NIC real está aislado.
          </T>
          <T k="Por dentro">
            Entre MVs del mismo vSwitch, <b>copia de buffers</b> en memoria. Hacia fuera, cada MV emite con su MAC y la NIC real recibe en <b>modo promiscuo</b>.
          </T>
          <T k="En QEMU">
            NAT = backend <code>user</code> (SLiRP) · host-only = bridge privado sin NIC real · bridged = bridge con una NIC real.
          </T>
        </Topic>

        <Divider h={190} kicker="Práctica" title="QEMU/KVM en el laboratorio" meta="2 temas · lo que hay que teclear el viernes 6" />

        <Topic
          id="qemu"
          lead="Lo que hay que saber teclear: un linked clone con qemu-img, una MV con qemu-system-x86_64 y cómo controlarla."
          more={
            <>
              <CommandAnatomy />
              <PowerSim />
            </>
          }
        >
          <T k="Dónde estás">
            <code>ssh root@IP</code> a KVM1 o KVM2. Sin Internet: las imágenes se bajan con <code>wget</code> de www.ho.ac.uma.es. Antes de un <code>poweroff</code>, mira el prompt: <code>[root@vm-16-173 ~]#</code> es el <b>servidor</b>; <code>localhost:~#</code>, la MV.
          </T>
          <T k="Linked clone" hot>
            <Cmd>{"qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm1.qcow2\nqemu-img info --backing-chain vm1.qcow2"}</Cmd>
            <code>-F</code>: formato de la base · <code>-f</code>: formato del nuevo · <code>-b</code>: la base · el último argumento es el disco <b>nuevo</b>.
          </T>
          <T k="Más qemu-img">
            <code>convert -O qcow2 a.qcow2 b.qcow2</code>: full clone (<code>cp</code> solo copia el delta) · <code>commit</code>: consolida el clon en su base · <code>rebase -b</code>: cambia la base · <code>snapshot -c / -l / -a / -d</code>: crear, listar, aplicar y borrar · <code>create -f qcow2 datos.qcow2 1G</code>: disco nuevo.
          </T>
          <T k="Arrancar" hot show={[["Anatomía del comando", "anat:basico"]]}>
            <Cmd>{"qemu-system-x86_64 -name vm1 -m 512M -smp 2 --enable-kvm -nographic vm1.qcow2"}</Cmd>
            <code>-m</code> sin unidad son MiB. Disco extra: <code>-drive file=datos.qcow2,format=qcow2,if=virtio</code> (en el guest, /dev/vda). Nunca el mismo disco en dos MVs.
          </T>
          <T k="Consolas" hot show={[["Telnet", "anat:telnet"]]}>
            Con <code>-nographic</code>, la terminal es el puerto serie: <b>Ctrl+A x</b> mata QEMU y <b>Ctrl+A c</b> abre el monitor. ¿Pantalla negra? <code>console=ttyS0</code> en <code>/boot/extlinux.conf</code> de la <b>base</b> (los clones lo heredan). Por red: <code>-serial mon:telnet::5000,server=on,wait=off</code> y <code>firewall-cmd --add-port=5000/tcp</code>.
          </T>
          <T k="Energía">
            Power off y reset son <b>duros</b> (Ctrl+A x, <code>quit</code>, <code>system_reset</code>). Shutdown es <b>suave</b>: un evento <b>ACPI</b> (<code>system_powerdown</code>) o <code>poweroff</code> dentro de la MV.
          </T>
          <T k="Segundo plano y corrector" show={[["Comando de corrección", "anat:qmp"]]}>
            <code>{"< /dev/null > vm1.log 2>&1 &"}</code>: sin <code>{"< /dev/null"}</code> la MV se para (estado T). Para el corrector, <code>-name</code> y <code>{"-qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off"}</code>, tras <code>mkdir -p /var/run/qemu</code>.
          </T>
        </Topic>

        <Topic
          id="qemured"
          lead="Cada tarjeta de red son dos piezas con el mismo id: el dispositivo que ve el guest (-device) y el backend que lo conecta (-netdev)."
          more={
            <>
              <SlirpDiagram />
              <TopologyLab />
            </>
          }
        >
          <T k="Frontend + backend" hot>
            <Cmd>{"-netdev user,id=n0 -device e1000,netdev=n0,mac=52:54:00:00:00:01"}</Cmd>
            El <code>id</code> del <code>-netdev</code> tiene que coincidir con el <code>netdev=</code> del <code>-device</code>. Modelos: <b>e1000</b> (por defecto), rtl8139 y <b>virtio-net</b> (paravirtualizada, la más rápida). Sin opciones de red, QEMU pone e1000 + user.
          </T>
          <T k="user (SLiRP)" hot show={[["Probarlo", "slirp:vmhost"]]}>
            NAT dentro del propio QEMU: <b>sin root</b>, limitado y <b>sin ping</b> (no hay ICMP). La MV es <b>10.0.2.15</b>, el host es la puerta de enlace <b>10.0.2.2</b> y el DNS, <b>10.0.2.3</b>. Cada MV tiene su red aislada y desde fuera no se entra.
          </T>
          <T k="hostfwd" hot show={[["Probarlo", "slirp:fwd"]]}>
            <Cmd>{"-netdev user,id=n0,hostfwd=tcp::8080-:80"}</Cmd>
            Lo que llega al <b>8080 del host</b> va al <b>80 del guest</b>: primero el host. Abre el puerto con <code>firewall-cmd --add-port=8080/tcp</code> (y otra vez con <code>--permanent</code> para que dure).
          </T>
          <T k="Bridge privado" hot>
            <Cmd>{'nmcli connection add type bridge con-name bridge1 ifname br1 \\\n  ipv4.method manual ipv4.addresses 10.0.0.1/24 ipv6.method disabled stp no autoconnect yes\necho "allow br1" >> /etc/qemu/bridge.conf\n-netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:01:01'}</Cmd>
            Sin NIC real es host-only. Sin <code>allow br1</code>, QEMU no se conecta. Nunca enganches <code>ens32</code> a un bridge: pierdes el SSH.
          </T>
          <T k="MACs">
            Sin <code>mac=</code>, todas las MVs salen con <b>52:54:00:12:34:56</b> y se pisan: una distinta por tarjeta. El primer byte tiene que ser <b>par</b> (unicast).
          </T>
          <T k="La cadena del examen" hot>
            Internet → MV1 → LAN1 → MV2 → LAN2 → MV3: dos bridges, tres linked clones, MV1 con <code>user</code> y br1, MV2 de <b>router</b> (br1 y br2, <code>ip_forward=1</code>) y MV3 en br2. Disco, MAC y puerto telnet distintos por MV (bucle <code>for</code> con <code>$i</code>).
          </T>
          <T k="Limpiar">
            <code>nmcli connection delete bridge1</code>, <code>nmcli device delete br1</code> y cierra los puertos con <code>firewall-cmd --remove-port</code>.
          </T>
        </Topic>

        <Divider h={280} kicker="Repaso" title="Ponte a prueba" meta="test tipo examen y chuleta para el laboratorio" />

        <Review id="test" lead="Preguntas como las del cuestionario del profesor, con la explicación de cada respuesta. Filtra por tema y repasa las que falles.">
          <TestBank />
        </Review>

        <Review id="chuleta" lead="Todo lo que hay que poder teclear el día del examen práctico, y las trampas que más caen.">
          <div className="cheat">
            <Cmd title="Discos (qemu-img)">{"mkdir -p /exports/VMs /home/VMs\ncd /exports/VMs && wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2\ncd /home/VMs && ln -s /exports/VMs/alpine-base.qcow2 alpine-base.qcow2\nqemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm1.qcow2   # linked clone\nqemu-img info --backing-chain vm1.qcow2\nqemu-img convert -O qcow2 vm1.qcow2 full.qcow2                    # full clone\nqemu-img commit vm1.qcow2                                         # consolidar en la base\nqemu-img snapshot -c limpio vm1.qcow2   # crear (-l listar, -a volver, -d borrar)\nqemu-img create -f qcow2 datos.qcow2 1G                           # disco extra"}</Cmd>
            <Cmd title="Arrancar en segundo plano">{"mkdir -p /var/run/qemu\nqemu-system-x86_64 -name vm1 -m 512M -smp 2 --enable-kvm -nographic \\\n  -serial mon:telnet::5001,server=on,wait=off \\\n  -qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off \\\n  -drive file=datos.qcow2,format=qcow2,if=virtio \\\n  vm1.qcow2 < /dev/null > vm1.log 2>&1 &\nfirewall-cmd --add-port=5001/tcp          # para entrar por telnet desde fuera"}</Cmd>
            <Cmd title="Controlar">{"pgrep -a qemu                               # MVs encendidas\nps -o pid,stat,cmd -C qemu-system-x86_64    # STAT S/R bien, T = parada\n# consola: Ctrl+A x (matar) · Ctrl+A c (monitor)\n# monitor: info status · system_powerdown · system_reset · savevm · quit"}</Cmd>
            <Cmd title="Red user + hostfwd">{"-netdev user,id=n0,hostfwd=tcp::2222-:22 -device e1000,netdev=n0\nfirewall-cmd --add-port=2222/tcp            # (+ --permanent para que dure)\nssh -p 2222 root@localhost                  # desde el propio servidor"}</Cmd>
            <Cmd title="Bridge (LAN entre MVs)">{'nmcli connection add type bridge con-name br1 ifname br1 \\\n  ipv4.method manual ipv4.addresses 10.0.0.1/24 ipv6.method disabled stp no autoconnect yes\necho "allow br1" >> /etc/qemu/bridge.conf\n-netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:01:01\nnmcli connection delete br1                 # limpiar'}</Cmd>
            <Cmd title="Varias MVs con un bucle">{"for i in 1 2 3; do\n  qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm$i.qcow2\n  qemu-system-x86_64 -name vm$i -m 256M --enable-kvm -nographic \\\n    -serial mon:telnet::500$i,server=on,wait=off \\\n    -netdev bridge,br=br1,id=n0 -device e1000,netdev=n0,mac=52:54:00:00:00:0$i \\\n    vm$i.qcow2 < /dev/null > vm$i.log 2>&1 &\ndone"}</Cmd>
          </div>
          <div className="cheat-traps">
            <h3>Trampas que caen</h3>
            <ul>
              <li>
                Mira el prompt antes de un <code>poweroff</code>: en el servidor lo apagarías entero.
              </li>
              <li>
                Guiones largos copiados del PDF (<code>–s</code>, <code>–nographic</code>): escríbelos a mano.
              </li>
              <li>
                <code>-f</code> es el formato del nuevo y <code>-F</code> el de la base; el último argumento es el disco nuevo.
              </li>
              <li>Nunca borres ni muevas la base de un linked clone, ni uses el mismo disco en dos MVs.</li>
              <li>
                <code>cp</code> de un linked clone solo copia el delta: para independizarlo, <code>qemu-img convert</code>.
              </li>
              <li>MAC, puerto telnet y disco distintos por MV; el id del -netdev igual al netdev= del -device.</li>
              <li>
                <code>hostfwd=tcp::HOST-:GUEST</code>; abre el puerto en el firewall y ciérralo al acabar.
              </li>
              <li>
                Segundo plano con <code>-nographic</code>: siempre <code>{"< /dev/null &"}</code>. Antes de <code>-qmp</code>, <code>mkdir -p /var/run/qemu</code>.
              </li>
              <li>
                La red user no hace ping. Para un bridge, <code>allow brX</code> en <code>/etc/qemu/bridge.conf</code>.
              </li>
            </ul>
          </div>
        </Review>

        <footer className="foot">
          Resumen hecho a partir de las transparencias de Arquitectura de Sistemas Virtualizados (Depto. de Arquitectura de Computadores, Universidad de Málaga), los enunciados de las prácticas 1 y 2 y los apuntes de clase. Las figuras isométricas usan el kit{" "}
          <a href="https://github.com/wheresryan22/anatomy">anatomy</a> (licencia MIT). Las cifras de algunas gráficas son ilustrativas.
        </footer>
      </main>
    </>
  );
}
