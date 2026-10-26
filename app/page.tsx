import { Cmd, Exam } from "@/components/code";
import { CompareTables } from "@/components/compare";
import { Countdown } from "@/components/countdown";
import { BalloonDiagram, CowForkDiagram, NestedWalkGrid, PagingCalculator, ShadowVsNested, ThreeSpacesDiagram, TranslationFlow } from "@/components/diagrams/memory";
import { BinaryTranslationStepper, CpuVisibility, EmulatorStepper, HybridFlow, SchedulerDiagram, TrapTimeline } from "@/components/diagrams/cpu";
import { FlatIndexMatrix, ProvisionChart, ScsiDiagram } from "@/components/diagrams/disks";
import { HvVsOsDiagram, IsomorphismDiagram, ModulesDiagram, MotivationsQuiz } from "@/components/diagrams/intro";
import { Challenges, FindTheError, QemuBuilder, TopologyLab } from "@/components/diagrams/lab";
import { HostedNetModes, VlanDiagram } from "@/components/diagrams/network";
import { PopekSetsDiagram, TaxonomyDiagram, TypesQuiz, VcpuMatrix } from "@/components/diagrams/popek";
import { BridgeLab, CommandAnatomy, NetdevPairing, PowerSim, QemuImgLab, SlirpDiagram, WhereAmI } from "@/components/diagrams/practice";
import { FsfreezeDiagram, VolatilityDiagram } from "@/components/diagrams/snapshots";
import { ClonesFigure } from "@/components/figs/clones";
import { DatastoreFigure } from "@/components/figs/datastore";
import { SnapshotFigure } from "@/components/figs/snapshot";
import { StackFigure } from "@/components/figs/stack";
import { Flashcards } from "@/components/flashcards";
import { MindMap } from "@/components/mindmap";
import { TestBank } from "@/components/testbank";
import { ThemeToggle } from "@/components/theme-toggle";
import { Formula, T, Terms } from "@/components/terms";
import { TopicBar } from "@/components/topic-bar";
import { EXTRAS, PARTS, TOPICS, type TopicId } from "@/components/topics";

const hue = (h: number) => ({ "--h": h }) as React.CSSProperties;
const extra = (id: (typeof EXTRAS)[number]["id"]) => EXTRAS.find((e) => e.id === id)!;

function Part({ id }: { id: (typeof PARTS)[number]["id"] }) {
  const p = PARTS.find((x) => x.id === id)!;
  const topics = TOPICS.filter((t) => t.part === id);
  return (
    <div className="part reveal" style={hue(topics[0].hue)}>
      <span className="part-id">Parte {p.id}</span>
      <h2 className="part-title">{p.title}</h2>
      <span className="part-meta">
        {p.source} · temas {topics[0].n}–{topics[topics.length - 1].n}
      </span>
    </div>
  );
}

function Section({ id, lead, children, figure, diagrams }: { id: TopicId; lead: React.ReactNode; children: React.ReactNode; figure?: React.ReactNode; diagrams?: React.ReactNode }) {
  const s = TOPICS.find((t) => t.id === id)!;
  return (
    <section id={s.id} className="sec" style={hue(s.hue)}>
      <header className="sec-banner reveal">
        <span className="sec-n" aria-hidden="true">
          {s.n}
        </span>
        <div>
          <p className="sec-tag">
            Tema {s.n} · Parte {s.part} · <span className="chip">{s.tag}</span>
          </p>
          <h2>{s.title}</h2>
          <p className="lead">{lead}</p>
        </div>
      </header>
      <div className={figure ? "sec-body" : "sec-body solo"}>
        <Terms>{children}</Terms>
        {figure ? <div className="sec-fig reveal">{figure}</div> : null}
      </div>
      {diagrams ? <div className="dg-grid">{diagrams}</div> : null}
    </section>
  );
}

function Special({ id, lead, children }: { id: (typeof EXTRAS)[number]["id"]; lead: string; children: React.ReactNode }) {
  const e = extra(id);
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

const MAP = [EXTRAS[0], ...TOPICS, ...EXTRAS.slice(1)];

export default function Page() {
  return (
    <>
      <div className="progress" aria-hidden="true" />
      <TopicBar />
      <header className="hero">
        <div className="hero-floor" aria-hidden="true" />
        <div className="hero-top">
          <span className="brand">Arquitectura de Sistemas Virtualizados · resumen visual</span>
          <ThemeToggle />
        </div>
        <h1>
          Sistemas virtualizados
          <br />
          <span>de un vistazo</span>
        </h1>
        <p className="hero-sub">Todo el primer parcial (temas 1 y 2, prácticas 1 y 2) convertido en máquinas que se mueven, diagramas con los que puedes jugar y un banco de preguntas tipo test. Cada tema tiene su color; la barra de arriba te dice siempre dónde estás.</p>
        <div className="hero-chips">
          <Countdown at="2026-11-06T12:45:00+01:00" label="Examen de laboratorio" when="vie 6 nov, 12:45" />
          <Countdown at="2026-11-12T08:00:00+01:00" label="Primer parcial" when="12–14 nov" />
          <span className="countdown ghost">Laboratorio: preguntas de QEMU + ejercicio con KVM · labs 2.1.9a/b</span>
          <span className="countdown ghost">Hay que sacar más de un 4 en cada parcial</span>
        </div>
        <nav className="map" aria-label="Temario">
          {MAP.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} className={"part" in s ? "map-card" : "map-card special"} style={{ ...hue(s.hue), "--i": i } as React.CSSProperties}>
              <span className="map-n">{s.n}</span>
              <span className="map-title">{s.title}</span>
              <span className="map-tag">{"part" in s ? `Parte ${s.part} · ${s.tag}` : s.tag}</span>
            </a>
          ))}
        </nav>
      </header>

      <main>
        <Special id="mapa" lead="Todo el primer parcial en una imagen. Cada rama tiene el color de sus temas.">
          <MindMap />
        </Special>

        {/* ------------------------------------------------------------ PARTE I */}
        <Part id="I" />

        <Section
          id="virtualizar"
          lead="Hacer que un programa (normalmente un sistema operativo entero) crea que se ejecuta sobre hardware real cuando en realidad corre sobre hardware ficticio que fabrica una capa de software."
          figure={<IsomorphismDiagram />}
          diagrams={<MotivationsQuiz />}
        >
          <T k="Virtualizar">Ofrecer recursos hardware ficticios usando implementaciones software o hardware. El software preexistente, escrito para el hardware real, debe funcionar <b>sin ninguna modificación</b>.</T>
          <T k="Isomorfismo (definición formal)" show={[["Ejecutar una instrucción", "iso:run"]]}>Cada estado del sistema real (host) tiene su equivalente en el virtual (guest), y cada transición también: lo que pasa en uno pasa igual en el otro.</T>
          <T k="Lo único que se nota" show={[["Ver el retardo con 3 MVs más", "iso:load"]]}>Temporizaciones atípicas: retardos extra en la E/S y pausas de CPU sin razón aparente, por la implementación y por compartir el hardware con otras MVs.</T>
          <T k="Motivaciones">Emular otras máquinas o SO · ejecutar software obsoleto (legacy) · simulación y experimentación (prototipos, sandboxes, what-if) · seguridad y fiabilidad por <b>aislamiento</b> · consolidación (varios SO en un hardware, despliegue masivo) · failover (migración y clonación) · balanceo de carga · green computing.</T>
          <T k="Host · guest · MV · hipervisor">Host: SO instalado en el hardware físico. Guest: SO instalado en la MV. MV: el conjunto de recursos virtualizados (CPU, RAM, disco, red). Hipervisor o VMM: el software que lo hace.</T>
          <T k="Ejemplo">Portátil → Fedora (host) → VirtualBox (hipervisor) → MV (CPU, RAM, disco y red virtuales) → Kali Linux (guest).</T>
          <Exam>Pregunta clásica: «¿qué puede notar el software virtualizado?». Solo los tiempos. Todo lo demás es equivalente.</Exam>
        </Section>

        <Section
          id="hipervisor"
          lead="El software que implementa la virtualización. Se parece mucho al kernel de un SO, pero sus clientes no son procesos sino máquinas virtuales."
          figure={<ModulesDiagram />}
          diagrams={<HvVsOsDiagram />}
        >
          <T k="El nombre">Los primeros sistemas operativos se llamaban «supervisores»; el hipervisor nace como su evolución.</T>
          <T k="Qué hace">Capa software (puede estar asistida por hardware) con <b>control completo</b> de los recursos físicos. Ejecuta varias MVs sobre el mismo hardware, sin modificar sus aplicaciones, y las <b>aísla</b>: una MV no accede a recursos que no se le han asignado.</T>
          <T k="Dispatcher" show={[["Ver un trap", "mod:io"]]}>Tras un trap (interrupción o excepción), decide a qué módulo llamar.</T>
          <T k="Allocator" show={[["Ver al allocator", "mod:new"]]}>Asigna los recursos físicos reales a las MVs (CPU, memoria, E/S).</T>
          <T k="Intérprete" show={[["Ver al intérprete", "mod:iret"]]}>Simula el efecto de las instrucciones que le pasa el dispatcher.</T>
          <T k="Hipervisor vs SO" show={[["Como SO", "hvos:so"], ["Como hipervisor", "hvos:hv"]]}>Ambos ocultan el hardware real y gestionan CPU, memoria y E/S. El SO lo ofrece como servicios de alto nivel (procesos, espacio lógico, ficheros, sockets) a procesos; el hipervisor, como hardware virtual (vCPU, RAM, disco y NIC virtuales) a MVs que ejecutan sistemas operativos.</T>
        </Section>

        <Section
          id="popek"
          lead="El artículo de 1974 que dice qué tiene que cumplir un hipervisor y cuándo una arquitectura se puede virtualizar de forma eficiente. Es lo más preguntado del tema 1."
          figure={<PopekSetsDiagram />}
          diagrams={<VcpuMatrix />}
        >
          <T k="❶ Equivalencia" show={[["¿Quién la pierde?", "vcpu:para"]]}>Un programa en la MV se comporta igual que en la máquina real simulada. Excepción: las temporizaciones.</T>
          <T k="❷ Control de recursos" show={[["Ver en la matriz", "vcpu:t1"]]}>El hipervisor controla por completo los recursos reales y virtuales. De aquí salen el aislamiento y la seguridad.</T>
          <T k="❸ Eficiencia" show={[["¿Quién la pierde?", "vcpu:emu"]]}>Una fracción importante de las instrucciones se ejecuta directamente, sin intervención del hipervisor.</T>
          <T k="Privilegiadas" show={[["Ver el conjunto", "popek:priv"]]}>Generan un trap en modo usuario y solo funcionan bien en modo privilegiado.</T>
          <T k="Sensibles" show={[["Ver el conjunto", "popek:sens"]]}>De control: cambian la configuración de recursos (cambio de modo, tabla de páginas). De comportamiento: su resultado depende de esa configuración (del modo usuario o supervisor). El resto son inocuas.</T>
          <Formula title="Teorema 1 · virtualización estricta" show={[["Ver en el diagrama", "popek:ok"]]} example="Toda sensible genera trap → trap & emulate. Condición suficiente.">
            sensibles ⊆ privilegiadas
          </Formula>
          <Formula title="Teorema 2 · virtualización recursiva" example="Una MV dentro de una MV dentro de… No siempre posible (Inception).">
            virtualizable + VMM sin dependencias temporales
          </Formula>
          <Formula title="Teorema 3 · virtualización híbrida" show={[["Ver en la matriz", "vcpu:t3"]]} example="Se interpreta todo lo que el guest ejecuta en modo kernel: pierde eficiencia. Y siempre nos quedará la emulación.">
            sensibles de usuario ⊆ privilegiadas
          </Formula>
          <T k="El x86 clásico" show={[["Verlo en x86", "popek:x86"]]}>No cumple el teorema 1: tiene sensibles no privilegiadas (POPF, SGDT/SIDT…; un estudio del año 2000 encontró 17) que en modo usuario no generan trap. Por eso se inventaron la traducción binaria, la implementación híbrida y luego VT-x / AMD-V.</T>
        </Section>

        <Section
          id="tipos"
          lead="Dónde se coloca el hipervisor: encima de un sistema operativo, directamente sobre el hardware, o sobre el hardware pero con una MV privilegiada que hace la E/S."
          figure={<StackFigure />}
          diagrams={
            <>
              <TaxonomyDiagram />
              <TypesQuiz />
            </>
          }
        >
          <T k="Full virtualization" show={[["Ver en la taxonomía", "taxo:full"]]}>El SO guest está totalmente desacoplado del hardware por el hipervisor: no sabe que está virtualizado y no se modifica.</T>
          <T k="Paravirtualización" show={[["Ver en la taxonomía", "taxo:para"]]}>Comunicación explícita guest–hipervisor: se modifica el kernel del guest para cambiar las instrucciones no virtualizables por <b>hypercalls</b>, y se usan hypercalls para memoria, interrupciones y reloj. Más eficiente. Los drivers <b>virtio</b> de QEMU son paravirtualizados.</T>
          <T k="Tipo 2 · hosted" show={[["Verlo en 3D", "stack:t2"]]}>El código de la vCPU corre en un proceso normal del SO host, en modo usuario; un módulo en el kernel del host intercepta lo privilegiado; la E/S se emula con los servicios del host (el disco virtual es un fichero). VirtualBox, VMware Workstation/Player/Fusion, Parallels, <b>QEMU/KVM</b>.</T>
          <T k="Tipo 1 · native / bare metal" show={[["Verlo en 3D", "stack:t1"]]}>El hipervisor es un kernel propio sin SO debajo y hace la E/S con sus propios drivers. VMware ESXi.</T>
          <T k="Tipo 1 con dominio 0" show={[["Verlo en 3D", "stack:dom0"]]}>La E/S se implementa a través de una MV privilegiada (Dom0, partición padre) con acceso al hardware y los drivers de un SO existente. Xen (con Linux), Hyper-V.</T>
          <T k="Kind III" show={[["Ver en la taxonomía", "taxo:other"]]}>Runtimes de lenguajes (JVM) y contenedores: no son MVs sino virtualización a nivel de sistema operativo.</T>
        </Section>

        {/* ------------------------------------------------------------ PARTE II */}
        <Part id="II" />

        <Section
          id="tecnicas"
          lead="¿Cómo dejo que el guest use la CPU casi directamente sin que tome el control de la máquina? Las instrucciones normales se ejecutan tal cual; las delicadas provocan un trap y el hipervisor decide, simula o asigna."
          diagrams={
            <>
              <EmulatorStepper />
              <BinaryTranslationStepper />
              <HybridFlow />
              <TrapTimeline />
            </>
          }
        >
          <T k="Emulación (V ≠ R)" show={[["Paso a paso", "emu:syscall"]]}>Un intérprete decodifica y simula una a una las instrucciones de la vCPU sobre estructuras de datos (registros, PIC, timers, controladores). Lo más flexible y lo más lento.</T>
          <T k="Traducción binaria" show={[["Bloque con privilegiadas", "bt:priv"], ["Saltos", "bt:flow"]]}>Con V = R: el hipervisor revisa el código del guest por <b>bloques básicos</b>, sustituye las privilegiadas por código seguro y llamadas a rutinas de emulación, y lo guarda en la Translation Cache, que se ejecuta en modo usuario. Problemas: código automodificable o autorreferente y sincronizar el vPC con las interrupciones.</T>
          <T k="Trap & emulate" show={[["Ver los 3 traps", "trap:te"]]}>El guest corre <b>desprivilegiado</b>: cada privilegiada provoca una excepción y el hipervisor emula su efecto, también la E/S (IN/OUT). Rápido, pero con overhead por excepción y con shadow registers para todo el estado privilegiado. No sirve en CPUs no virtualizables (x86).</T>
          <T k="Híbrida" show={[["Ver el flujo", "hybrid:k"]]}>Trap & emulate para el modo usuario del guest y traducción binaria solo para su modo kernel. Patente de VMware (2002).</T>
          <T k="Hardware (Intel VT-x, AMD-V)" show={[["Ver el único exit", "trap:hw"]]}>Nuevo modo guest pseudoprivilegiado: el guest ejecuta parte de lo privilegiado (sus syscalls) sin salir; IN/OUT e interrupciones provocan <b>exits</b>. El <b>VMCB</b> guarda en memoria los shadow registers, la máscara de instrucciones que salen y el diagnóstico del exit. <code>vmrun</code> entra en modo guest.</T>
          <T k="Resumen del tema">Hace falta un mecanismo para <b>interceptar</b> los accesos al hardware y software para <b>emular</b> los recursos. El hardware de virtualización solo acelera la intercepción.</T>
          <Exam>QEMU sin <code>--enable-kvm</code> usa TCG, traducción binaria dinámica (incluso de otra arquitectura). Con KVM usa VT-x / AMD-V.</Exam>
        </Section>

        <Section
          id="cpu"
          lead="La CPU real se reparte entre las máquinas virtuales igual que un SO reparte la CPU entre procesos."
          figure={<SchedulerDiagram />}
          diagrams={<CpuVisibility />}
        >
          <T k="Emulación de la vCPU">Por software o con soporte hardware. Mejor rendimiento: híbrida o trap & emulate (con VT-x / AMD-V). Siempre se construye un modo pseudoprivilegiado para la MV.</T>
          <T k="Visibilidad" show={[["-cpu host", "cpuvis:host"], ["-cpu qemu64", "cpuvis:old"]]}>CPU más antigua emulada: sencilla, portable (migración) y sin incompatibilidades con programas antiguos. Visibilidad total de la CPU real: aprovecha instrucciones avanzadas, pero ata al modelo exacto.</T>
          <T k="Round-robin">El hipervisor reparte la CPU real entre MVs y permite definir políticas de reparto.</T>
          <T k="Expulsión por HALT" show={[["Ver los HLT", "sched:inter"]]}>El guest ejecuta HALT cuando no tiene trabajo (el proceso idle lo hace). Es privilegiada: el hipervisor la detecta y planifica otra MV.</T>
          <T k="Expulsión por timeout" show={[["Ver los timeouts", "sched:busy"]]}>Si una MV no hace HALT durante su cuanto, el hipervisor la interrumpe.</T>
          <T k="Consecuencia">Dentro de la MV se ven tiempos de espera inexplicables mientras se ejecutan otras MVs.</T>
        </Section>

        <Section
          id="memoria"
          lead="Repaso de Sistemas Operativos: la base para entender la doble traducción de memoria de las máquinas virtuales."
          figure={<CowForkDiagram />}
          diagrams={
            <>
              <PagingCalculator />
              <TranslationFlow />
            </>
          }
        >
          <T k="Objetivos">Espacio lógico por proceso, espacios grandes, compartir memoria, maximizar la multiprogramación, protección, rendimiento y bajo coste.</T>
          <T k="Paginación" show={[["Calcularlo", "calc:example"]]}>Páginas (lógico) y marcos (físico) del mismo tamaño (4 KB a 1 GB, normalmente 4 KB). Una tabla de páginas por proceso. Sin fragmentación externa, con fragmentación interna. La MMU usa el <b>PTBR</b> (en el PCB) y concatena marco + desplazamiento.</T>
          <Formula title="Ejemplo de clase" show={[["Calcularlo", "calc:example"]]} example="32 bits, 1 GB de RAM, páginas de 4 KB: 1 M entradas de 18 + 1 bits → 4 B → 4 MB por proceso">
            tamaño TP = nº páginas × tamaño de entrada
          </Formula>
          <T k="Multinivel" show={[["Calcularlo", "calc:example"]]}>Se pagina la tabla. En el ejemplo: 10 + 10 + 12 bits; un proceso de 16 MB pasa de 4 MB de tabla a 5 marcos = 20 KB. Coste: N + 1 accesos con N niveles (3–5 niveles es lo habitual).</T>
          <T k="TLB" show={[["Acierto de TLB", "flow:hit"]]}>Caché de pares (página, marco). En cada cambio de contexto se vacía o se etiqueta con el PID.</T>
          <T k="Memoria virtual" show={[["Fallo de página", "flow:free"], ["Sin marco libre", "flow:evict"]]}>Bit P de presencia (y V, dirty, acceso, permisos). Si P = 0, fallo de página: la RTI trae la página del swap (quizá echando otra), actualiza la tabla y reintenta la instrucción. Carga bajo demanda, prepaginación o prefetch.</T>
          <T k="Copy-on-write" show={[["Ver fork()", "cow:2"]]}>fork() comparte los marcos del padre marcados COW; la primera escritura crea un marco nuevo. Es la misma idea que los snapshots de disco.</T>
          <T k="DLL / .so">Un stub carga la rutina en la primera llamada (PIC, GOT y PLT en Linux). Ejecutables más pequeños y código compartido; a cambio dependen de las bibliotecas instaladas.</T>
        </Section>

        <Section
          id="ram"
          lead="Con virtualización hay tres espacios de direcciones y dos MMUs. O el hipervisor mantiene tablas sombra por software, o el hardware recorre dos niveles de tablas."
          figure={<ThreeSpacesDiagram />}
          diagrams={
            <>
              <NestedWalkGrid />
              <ShadowVsNested />
              <BalloonDiagram />
            </>
          }
        >
          <T k="Tres espacios" show={[["Ver el camino", "spaces:n"]]}>Lógico virtual (ELV) → físico virtual (EFV, lo que el guest cree que es su RAM) → físico real (EFR). Hay que emular la RAM física de la MV y su MMU.</T>
          <T k="Shadow page tables" show={[["Ver la tabla sombra", "spaces:s"]]}>Software: el hipervisor intercepta todo lo que programa la MMU virtual y carga en la real una tabla <b>directa ELV → EFR</b>, una por proceso de cada MV. Marca las tablas del guest como solo lectura para enterarse de sus cambios. Sin modificar el guest, pero con mucho overhead de memoria y exits.</T>
          <T k="True y hidden page faults" show={[["Provocar uno", "svn:rec"]]}>True: la página no está ni en la MV ni en la máquina real. Hidden: el guest cree que está (P = 1) pero el hipervisor le quitó el marco.</T>
          <T k="Nested paging / EPT" show={[["Ver el recorrido 2D", "walk:play"]]}>Hardware (AMD NPT o RVI, Intel EPT): tablas del guest (ELV → EFV) + tablas nested (EFV → EFR), dos punteros (gCR3, nCR3). Una tabla nested por MV. La TLB guarda la traducción final y es crítica.</T>
          <Formula title="Accesos por un fallo de TLB con nested paging" show={[["Animarlo", "walk:play"]]} example="G = N = 4 → 25 accesos (sin virtualizar, 5)">
            (G + 1) × (N + 1)
          </Formula>
          <T k="Working set" show={[["Verlo", "balloon:3"]]}>El hipervisor da a cada MV solo la memoria que usa (bajo demanda) y mantiene las páginas accedidas en una ventana de tiempo.</T>
          <T k="Overcommit" show={[["Ballooning", "balloon:6"], ["Swap privado", "balloon:8"]]}>La RAM virtual en uso puede superar la física. El hipervisor reclama memoria no usada (<b>ballooning</b>) y, si no basta, usa un <b>swap privado por MV, invisible para el guest</b>.</T>
        </Section>

        <Section
          id="discos"
          lead="El guest siempre ve el mismo disco SCSI. Detrás puede haber un volumen real o un fichero, reservado de golpe o poco a poco, plano o indexado."
          figure={<ScsiDiagram />}
          diagrams={
            <>
              <div className="dg-pair">
                <DatastoreFigure />
              </div>
              <ProvisionChart />
              <FlatIndexMatrix />
            </>
          }
        >
          <T k="LUN y LBA" show={[["Ver el LUN", "scsi:file"]]}>SCSI expone unidades lógicas (LUN) de bloques uniformes direccionados por LBA; la geometría no se ve. Siempre el mismo modelo de dispositivo y el mismo driver en el guest.</T>
          <T k="Volumen físico (by-pass)" show={[["Verlo", "scsi:vol"]]}>Menos retardo, menos portable. Para aplicaciones críticas o migrar un servidor existente.</T>
          <T k="Fichero en el FS del hipervisor" show={[["Verlo", "scsi:file"]]}>Más latencia y menos velocidad, pero portable y flexible; puede no reservar el espacio libre (ventaja y riesgo: fragmentación y over-provisioning).</T>
          <T k="Thick" show={[["Datastore todo thick", "ds:thick"], ["Coste eager", "prov:eager"]]}>Todo reservado al crear (nunca hay overcommit). <b>Eager-zeroed</b>: todo a cero al crear, lento, el mejor rendimiento. <b>Lazy-zeroed</b>: a cero en la primera escritura. Los bloques se ponen a cero por seguridad.</T>
          <T k="Thin" show={[["Llenar el datastore", "ds:full"], ["Coste thin", "prov:thin"]]}>Reserva bajo demanda: solo ocupa lo escrito. Cada primera escritura busca bloque libre, lo pone a cero y escribe. Fragmenta (en HDD el acceso aleatorio es más lento) y permite over-provisioning.</T>
          <T k="Flat vs index" show={[["Rellenar la matriz", "fi:go"]]}>Flat: el bloque N está en la posición N; sin copy-on-write, clonar es duplicar todo. Index (qcow2): un mapa de bloques con copy-on-write, backing files y snapshots baratos, a cambio de consultar el índice.</T>
          <Exam>Saber rellenar la matriz thin/thick × flat/index y sus ventajas: thin ocupa solo lo escrito; thick nunca hace overcommit; flat no tiene CoW; index sí, y es mucho más económico al clonar.</Exam>
        </Section>

        <Section
          id="snapshots"
          lead="Congelar un disco o una máquina entera para poder volver atrás, y clonar máquinas sin copiar sus discos. Todo se apoya en el copy-on-write."
          diagrams={
            <>
              <div className="dg-pair">
                <SnapshotFigure />
              </div>
              <div className="dg-pair">
                <ClonesFigure />
              </div>
              <VolatilityDiagram />
              <FsfreezeDiagram />
            </>
          }
        >
          <T k="Snapshot" show={[["Hacer un snapshot", "snap:snap"]]}>Estado congelado de un sistema para poder volver atrás. De un disco, o de una MV completa con RAM y varios discos (<b>checkpoint</b>).</T>
          <T k="Cómo funciona (CoW)" show={[["Leer un bloque", "snap:read"], ["Escribir uno", "snap:write"]]}>El volumen actual pasa a solo lectura y se crea un <b>delta</b> vacío. Escrituras → delta. Lecturas → delta y, si no está, el volumen congelado. Penaliza: reservar espacio al escribir y consultar el índice al leer.</T>
          <T k="Snapshot de una MV">Discos + RAM + configuración hardware. Recupera desastres al instante: malas configuraciones, virus, actualizaciones inestables, pruebas what-if (software healing).</T>
          <T k="Revert" show={[["Revertir", "snap:revert"]]}>Muy rápido: se descarta el delta actual y se crea uno nuevo sobre el snapshot elegido (y se carga su RAM si es un checkpoint).</T>
          <T k="Delete" show={[["Eliminar y consolidar", "snap:delete"]]}>Elimina un delta y suele implicar <b>consolidar</b> (incorporarlo al siguiente o al base); si no, corrupción. Delete all: los deltas al base en orden de creación. Tarda según lo que haya que consolidar.</T>
          <T k="Clones y plantillas" show={[["Tocar la plantilla", "clones:touch"]]}>Copias de MVs que ahorran instalar y configurar. Un prototipo bloqueado es una plantilla (template).</T>
          <T k="Full vs linked" show={[["Linked", "clones:linked"], ["Full", "clones:full"]]}>Full: copia completa e independiente. Linked: snapshot de la plantilla que solo guarda lo que cambia el clon; instantáneo, ligero y con mejor caché de lectura, pero no se puede tocar la plantilla. Ideal para escritorios virtuales con un broker (Leostream, Citrix).</T>
        </Section>

        <Section
          id="red"
          lead="Cada MV tiene una o más NICs virtuales conectadas a switches virtuales, y estos al mundo real a través de las NICs del servidor."
          figure={<HostedNetModes />}
          diagrams={<VlanDiagram />}
        >
          <T k="NIC virtual">Cada una con su MAC única, conectada a la LAN virtual que elija el administrador. Se emulan tarjetas populares (Intel e1000, PCnet) para usar drivers estándar, u optimizadas con driver especial (virtio, vmxnet).</T>
          <T k="Bridged" show={[["Probarlo", "net:bridged"]]}>La NIC real hace de puente Ethernet (nivel 2): visibilidad total de la LAN externa.</T>
          <T k="NAT" show={[["Probarlo", "net:nat"]]}>Un router con NAT con la IP del host: visibilidad a nivel IP con las limitaciones de NAT (desde fuera no se entra).</T>
          <T k="Host-only" show={[["Probarlo", "net:host"]]}>LAN sin NIC real, aislada del exterior: para comunicar MVs.</T>
          <T k="vSwitch (native)" show={[["Grupo aislado", "vlan:iso"]]}>Con 0 NICs reales está aislado; con varias, balanceo o fail-over. Cada NIC real es un enlace punto a punto con un switch externo.</T>
          <T k="VLAN 802.1q" show={[["Ver la etiqueta", "vlan:g2"]]}>Grupos de puertos con una etiqueta de VLAN. Las NICs reales trabajan en modo <b>trunk</b> llevando varias VLAN etiquetadas; el switch externo también debe soportar 802.1q.</T>
          <T k="Implementación">Entre MVs del mismo vSwitch, copia entre buffers de memoria (rapidísimo). Hacia fuera, cada MV emite con su MAC y la NIC real recibe en modo promiscuo y reparte por MAC.</T>
        </Section>

        {/* ------------------------------------------------------------ PARTE III */}
        <Part id="III" />

        <Section
          id="p1"
          lead="Crear discos con qemu-img (linked clones de una base), arrancar máquinas con qemu-system-x86_64 y controlarlas por consola, telnet o QMP."
          figure={<WhereAmI />}
          diagrams={
            <>
              <QemuImgLab />
              <CommandAnatomy />
              <PowerSim />
            </>
          }
        >
          <T k="Entorno" show={[["¿Dónde estoy?", "where:1"]]}>VPN DACALUM → <code>ssh root@IP</code> a KVM1 o KVM2. Los servidores no tienen Internet: las imágenes se bajan con <code>wget</code> de www.ho.ac.uma.es. DNS: 10.0.SS.NNN → vm-SS-NNN.ho.ac.uma.es.</T>
          <T k="Control de MVs">Desde el hipervisor: consola (pocas MVs), <b>QMP</b> (scripts, varias MVs), vCenter (clúster). Desde el guest: SSH (Ansible para muchas) o un agente (qemu-guest-agent, VMware Tools).</T>
          <T k="Discos" show={[["Simulador de qemu-img", "qil:go"]]}>
            Base en <code>/exports/VMs</code>, enlace simbólico en <code>/home/VMs</code> y linked clones:
            <Cmd>{"qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh1.qcow2\nqemu-img info --backing-chain alpine-ssh1.qcow2"}</Cmd>
          </T>
          <T k="Arrancar" show={[["Anatomía del comando", "anat:basico"]]}>
            <Cmd>{"qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm alpine-ssh1.qcow2"}</Cmd>
            <b>Ctrl+A x</b> la mata; <b>Ctrl+A c</b> abre el monitor de QEMU; <code>poweroff</code> dentro la apaga bien.
          </T>
          <T k="Pantalla negra">El kernel escribe en una pantalla que no existe con <code>-nographic</code>. Añade <code>console=ttyS0</code> (Tab en el menú, o para siempre en <code>/boot/extlinux.conf</code> de la <b>base</b>: los clones lo heredan).</T>
          <T k="Telnet y corrección" show={[["Comando de corrección", "anat:qmp"], ["Telnet", "anat:telnet"]]}>
            <code>-serial mon:telnet::5000,server=on,wait=off</code> + <code>firewall-cmd --add-port=5000/tcp</code>. Para la corrección: <code>-name</code> y <code>-qmp unix:…sock</code>, en segundo plano con <code>{"< /dev/null &"}</code>.
          </T>
          <Exam>Antes de un <code>poweroff</code>, mira el prompt: <code>[root@vm-16-173 ~]#</code> es el servidor (lo apagarías entero); <code>localhost:~#</code> es la MV.</Exam>
        </Section>

        <Section
          id="p2"
          lead="Una tarjeta de red en QEMU son dos piezas emparejadas: el dispositivo que ve el guest (frontend) y el mecanismo que lo conecta al exterior (backend)."
          figure={<NetdevPairing />}
          diagrams={
            <>
              <SlirpDiagram />
              <BridgeLab />
            </>
          }
        >
          <T k="Frontend" show={[["Emparejarlo", "pair:good"], ["Con un error", "pair:bad"]]}>
            <code>-device tipo,netdev=ID</code>: e1000 (Intel, común), rtl8139 (antigua) o virtio-net (la más rápida, driver paravirtualizado). Sin red: <code>-nic none</code> o <code>-nodefaults</code>.
          </T>
          <T k="Backends">
            <b>user</b> (SLiRP, por defecto: sin root, limitado, sin ping) · <b>tap</b> (interfaz del host, root, mejor rendimiento) · <b>bridge</b> (tap automático en un bridge existente) · <b>VDE</b> (redes complejas) · <b>socket</b> (unir MVs sin root).
          </T>
          <T k="Red user" show={[["Probar SLiRP", "slirp:vmhost"]]}>NAT interno: la MV recibe 10.0.2.15, el host es 10.0.2.2 (la puerta de enlace) y el DNS 10.0.2.3. Desde fuera no se entra: como un cortafuegos que bloquea todo lo entrante.</T>
          <T k="hostfwd" show={[["Probar hostfwd", "slirp:fwd"]]}>
            <code>-netdev user,id=n0,hostfwd=tcp::8080-:80</code>: lo que llega al 8080 del host va al 80 del guest (host a la izquierda). Abre el puerto en el firewall para entrar desde fuera (y con <code>--permanent</code> para que dure).
          </T>
          <T k="Bridge privado" show={[["Montarlo paso a paso", "bridge:play"]]}>
            <code>nmcli connection add type bridge … ifname br1 …</code>, <code>allow br1</code> en <code>/etc/qemu/bridge.conf</code> y <code>-netdev bridge,br=br1,id=…</code>. MAC, disco y puerto distintos por MV. Sin NIC real: red privada (host-only).
          </T>
          <T k="Limpiar">
            <code>nmcli connection delete nombre</code> y <code>nmcli device delete nombre</code>: al final solo ens32 y ens33.
          </T>
        </Section>

        <Section
          id="lab"
          lead="Los cuatro pilares del examen práctico: arrancar una máquina, ajustar sus parámetros, conectarle un disco y conectarle redes. Practícalos aquí y genera los comandos exactos."
          diagrams={
            <>
              <QemuBuilder />
              <TopologyLab />
              <Challenges />
              <FindTheError />
            </>
          }
        >
          <T k="1 · Arrancar">Disco (linked clone) + <code>qemu-system-x86_64 … --enable-kvm -nographic disco.qcow2</code>, en primer plano o en segundo con telnet.</T>
          <T k="2 · Parámetros">
            <code>-name</code>, <code>-m 512M</code>, <code>-smp 2</code>. Para la corrección, <code>-qmp</code>.
          </T>
          <T k="3 · Disco">
            <code>qemu-img create -f qcow2 datos.qcow2 1G</code> + <code>-drive file=datos.qcow2,format=qcow2,if=virtio</code>.
          </T>
          <T k="4 · Redes">
            Un par <code>-netdev</code> + <code>-device</code> por tarjeta, cada una con su MAC. user para salir, bridge para las LANs.
          </T>
          <T k="En el laboratorio">Los PCs son Windows 11: usa escritorios virtuales (Ctrl + Win + ←/→) para tener a mano varias consolas, y <code>man</code> (con / para buscar y n para el siguiente) si dudas de una opción.</T>
        </Section>

        {/* ------------------------------------------------------------ EXTRAS */}
        <Special id="comparativas" lead="Los conceptos que el test enfrenta entre sí, cara a cara. Pasa el ratón por una columna para resaltarla.">
          <CompareTables />
        </Special>

        <Special id="test" lead="Preguntas de concepto como las del cuestionario del profesor, con la explicación de cada respuesta.">
          <TestBank />
        </Special>

        <Special id="flashcards" lead="Los términos clave para memorizar. Gira la tarjeta, márcala como sabida y vuelve solo a las que fallas.">
          <Flashcards />
        </Special>

        <Special id="chuleta" lead="Todo lo que tienes que poder teclear el día del examen práctico, y las trampas que más caen.">
          <div className="cheat">
            <Cmd title="Orientarse">{"ssh root@IP_KVM                 # entrar al servidor (tras conectar la VPN)\nhostname                        # ¿servidor (vm-16-173) o MV (localhost)?\nalias poweroff=\"echo 'Acción no permitida'\"   # en ~/.bashrc del servidor"}</Cmd>
            <Cmd title="Discos (qemu-img)">{"mkdir -p /exports/VMs /home/VMs\ncd /exports/VMs && wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2\ncd /home/VMs && ln -s /exports/VMs/alpine-base.qcow2 alpine-base.qcow2\nqemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 clon.qcow2   # linked clone\nqemu-img info --backing-chain clon.qcow2\nqemu-img convert -O qcow2 clon.qcow2 full.qcow2                    # full clone\nqemu-img commit clon.qcow2                                          # consolidar en la base\nqemu-img rebase -b nueva-base.qcow2 clon.qcow2                      # cambiar la base\nqemu-img snapshot -c snap1 clon.qcow2   # crear  (-l listar, -a volver, -d borrar)\nqemu-img create -f qcow2 datos.qcow2 1G                             # disco extra\nchmod -w /exports/VMs/alpine-base.qcow2                             # proteger la base"}</Cmd>
            <Cmd title="Arrancar">{"qemu-system-x86_64 -name vm1 -m 512M -smp 2 --enable-kvm -nographic \\\n  -serial mon:telnet::5000,server=on,wait=off \\\n  -drive file=datos.qcow2,format=qcow2,if=virtio \\\n  clon.qcow2 < /dev/null &\n# para la corrección:\nmkdir -p /var/run/qemu\n-qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off\n# cambios temporales: añadir -snapshot"}</Cmd>
            <Cmd title="Controlar">{"pgrep -a qemu                               # MVs encendidas\nps -o pid,stat,cmd -C qemu-system-x86       # STAT S/R bien, T = parada\nkill PID                                    # último recurso\n# en la consola de la MV: Ctrl+A x (matar) · Ctrl+A c (monitor)\n# monitor: info status · system_powerdown · system_reset · savevm snap · loadvm snap · quit"}</Cmd>
            <Cmd title="Red user + hostfwd">{"firewall-cmd --add-port=2222/tcp           # (+ --permanent para que dure)\n-netdev user,id=n0,hostfwd=tcp::2222-:22 -device e1000,netdev=n0\nssh -p 2222 root@localhost                  # desde el propio servidor\n# desde la MV: el host es 10.0.2.2"}</Cmd>
            <Cmd title="Bridge (LAN entre MVs)">{"nmcli connection add type bridge con-name br1 ifname br1 \\\n  ipv4.method manual ipv4.addresses 10.0.0.1/24 ipv6.method disabled stp no autoconnect yes\necho \"allow br1\" >> /etc/qemu/bridge.conf\n-netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:00:01\nnmcli connection delete br1                 # limpiar"}</Cmd>
            <Cmd title="Varias MVs con un bucle">{"for i in 1 2 3; do\n  qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm$i.qcow2\n  qemu-system-x86_64 -name vm$i -m 256M --enable-kvm -nographic \\\n    -serial mon:telnet::500$i,server=on,wait=off \\\n    -netdev bridge,br=br1,id=n0 -device e1000,netdev=n0,mac=52:54:00:00:00:0$i \\\n    vm$i.qcow2 < /dev/null > vm$i.log 2>&1 &\ndone"}</Cmd>
          </div>
          <div className="cheat-traps">
            <h3>Trampas que caen</h3>
            <ul>
              <li>
                Guiones largos copiados del PDF (<code>–s</code>, <code>–nographic</code>): escríbelos a mano.
              </li>
              <li>
                <code>-f</code> (formato del nuevo) vs <code>-F</code> (formato del base). El último argumento es el disco NUEVO.
              </li>
              <li>Nunca borres ni muevas la base de un linked clone. Nunca uses el mismo disco en dos MVs.</li>
              <li>
                <code>cp</code> de un linked clone solo copia el delta: para independizarlo, <code>qemu-img convert</code>.
              </li>
              <li>MAC, puerto telnet y disco distintos por MV; el id del -netdev igual al netdev= del -device.</li>
              <li>
                <code>hostfwd=tcp::HOST-:GUEST</code>; abre el puerto en el firewall y ciérralo al acabar.
              </li>
              <li>
                Segundo plano con <code>-nographic</code>: siempre <code>{"< /dev/null &"}</code>.
              </li>
              <li>
                La red user no hace ping. Para un bridge, <code>allow brX</code> en <code>/etc/qemu/bridge.conf</code>.
              </li>
              <li>Test: tipo 2 ≠ bare metal · la paravirtualización SÍ modifica el guest · nested = una tabla por MV (shadow, una por proceso) · revert es rápido, delete consolida · thick nunca overcommit.</li>
            </ul>
          </div>
        </Special>

        <footer className="foot">
          Resumen hecho a partir de las transparencias de Arquitectura de Sistemas Virtualizados (Depto. de Arquitectura de Computadores, Universidad de Málaga), los enunciados de las prácticas 1 y 2 y los apuntes de clase. Las figuras isométricas usan el kit{" "}
          <a href="https://github.com/wheresryan22/anatomy">anatomy</a> (licencia MIT). Las cifras de algunas gráficas son ilustrativas.
        </footer>
      </main>
    </>
  );
}
