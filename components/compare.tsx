"use client";

import * as React from "react";

interface Col {
  short: string;
  name: string;
  hue: number;
  tag?: string;
}

interface Table {
  id: string;
  title: string;
  cols: Col[];
  rows: { k: string; v: string[] }[];
  same?: string[];
}

const TABLES: Table[] = [
  {
    id: "hv",
    title: "Tipos de hipervisor",
    cols: [
      { short: "Tipo 1", name: "Native / bare metal", hue: 290, tag: "ESXi" },
      { short: "Tipo 2", name: "Hosted", hue: 240, tag: "VirtualBox · QEMU/KVM" },
      { short: "Dom0", name: "Native con dominio 0", hue: 320, tag: "Xen · Hyper-V" },
    ],
    rows: [
      { k: "Qué hay debajo", v: ["Nada: el hipervisor es un kernel propio sobre el hardware", "Un SO host completo (Linux, Windows, macOS)", "Nada: el hipervisor arranca sobre el hardware"] },
      { k: "Cómo es el hipervisor", v: ["Kernel propietario", "Una aplicación (proceso) del host + un módulo en su kernel", "Hipervisor mínimo + una MV privilegiada (Dom0 / partición padre)"] },
      { k: "Quién hace la E/S real", v: ["Sus propios drivers", "Los drivers del SO host", "Los drivers nativos del SO que corre en el Dom0"] },
      { k: "Emulación de dispositivos", v: ["En el hipervisor", "En el hipervisor (proceso de usuario)", "En el Dom0"] },
      { k: "Uso típico", v: ["Servidores y centros de datos", "Escritorio, desarrollo, prácticas", "Servidores (aprovecha drivers de Linux/Windows)"] },
    ],
  },
  {
    id: "cpu",
    title: "Técnicas de CPU",
    cols: [
      { short: "Emu", name: "Emulación", hue: 15 },
      { short: "BT", name: "Traducción binaria", hue: 40 },
      { short: "T&E", name: "Trap & emulate", hue: 320 },
      { short: "Híbrida", name: "T&E + BT", hue: 265 },
      { short: "HW", name: "VT-x / AMD-V", hue: 175 },
      { short: "PV", name: "Paravirtualización", hue: 150 },
    ],
    rows: [
      { k: "CPU virtual = real", v: ["No hace falta (V ≠ R)", "Sí", "Sí", "Sí", "Sí", "Sí"] },
      { k: "Guest modificado", v: ["No", "No", "No", "No", "No", "Sí: hypercalls"] },
      { k: "Requisito P&G", v: ["Ninguno", "Teorema 3", "Teorema 1", "Teorema 3", "El hardware lo cumple", "—"] },
      { k: "Cómo se intercepta", v: ["Se interpreta todo", "Se reescriben bloques básicos (IDENT / INLINE / CALLOUT)", "Excepción por falta de privilegio (trap)", "Trap en usuario, BT en kernel", "Exit desde el modo guest; vmrun para volver", "El guest llama al hipervisor"] },
      { k: "Propiedades", v: ["① ② (pierde ③ eficiencia)", "① ② ③", "① ② ③", "① ② ③", "① ② ③", "② ③ (pierde ① equivalencia)"] },
      { k: "Coste", v: ["Muy lento", "Coste de traducir; luego se reutiliza", "Muchos traps + shadow registers", "Menos traps", "Pocos exits", "Muy eficiente"] },
      { k: "Ejemplo", v: ["QEMU TCG con otra arquitectura", "VMware Workstation (x86 antiguo)", "Mainframes IBM clásicos", "VMware (patente 2002)", "QEMU con --enable-kvm", "Xen PV · drivers virtio"] },
    ],
  },
  {
    id: "mmu",
    title: "MMU virtual",
    cols: [
      { short: "Shadow", name: "Shadow page tables", hue: 35 },
      { short: "Nested", name: "Nested paging / EPT / NPT (RVI)", hue: 195 },
    ],
    rows: [
      { k: "Implementación", v: ["Software (hipervisor)", "Hardware (la MMU recorre dos niveles)"] },
      { k: "Qué usa la MMU real", v: ["Una tabla directa ELV → EFR", "Tabla del guest (ELV → EFV) + tabla nested (EFV → EFR)"] },
      { k: "Tablas extra", v: ["Una por proceso de cada MV", "Una por MV"] },
      { k: "Punteros base", v: ["El PTBR real apunta a la sombra", "Dos: gCR3 (guest) y nCR3 (nested)"] },
      { k: "Exits", v: ["Muchos: PTBR, fallos de página, escrituras en tablas (protegidas RO)", "Pocos: el guest gestiona sus tablas"] },
      { k: "Fallo de TLB", v: ["G + 1 accesos", "(G + 1)(N + 1) accesos"] },
      { k: "Clave", v: ["Mantener la sombra coherente", "La TLB es crítica"] },
    ],
    same: ["Ninguna de las dos modifica el guest.", "Las dos guardan en la TLB la traducción final ELV → EFR."],
  },
  {
    id: "disk",
    title: "Discos y clones",
    cols: [
      { short: "Eager", name: "Thick eager-zeroed", hue: 58 },
      { short: "Lazy", name: "Thick lazy-zeroed", hue: 80 },
      { short: "Thin", name: "Thin", hue: 35 },
      { short: "Full", name: "Full clone", hue: 150 },
      { short: "Linked", name: "Linked clone", hue: 175 },
    ],
    rows: [
      { k: "Espacio", v: ["Todo reservado al crear", "Todo reservado al crear", "Solo lo escrito", "Copia entera del original", "Solo las diferencias con la plantilla"] },
      { k: "Crear", v: ["Lento (pone todo a cero)", "Rápido", "Instantáneo", "Lento (copia)", "Instantáneo"] },
      { k: "Escribir", v: ["El más rápido", "1.ª escritura más lenta (pone a cero)", "1.ª escritura lenta (busca, pone a cero, escribe)", "Normal", "CoW sobre la plantilla"] },
      { k: "Riesgo", v: ["Puede no caber", "Puede no caber", "Over-provisioning y fragmentación", "Ocupa mucho", "No se puede tocar la plantilla"] },
      { k: "En QEMU", v: ["-o preallocation=full", "-o preallocation=falloc", "qcow2 por defecto", "qemu-img convert -O qcow2 …", "qemu-img create -F qcow2 -f qcow2 -b base …"] },
    ],
  },
  {
    id: "net",
    title: "Redes",
    cols: [
      { short: "Bridged", name: "Puente nivel 2", hue: 150 },
      { short: "NAT", name: "Router con NAT", hue: 195 },
      { short: "Host-only", name: "LAN aislada", hue: 240 },
    ],
    rows: [
      { k: "Asociada a NIC real", v: ["Sí, como bridge Ethernet", "Sí, a través de un router NAT", "No"] },
      { k: "Visibilidad", v: ["Total, nivel 2: un equipo más de la LAN", "Nivel IP, con la IP del host", "Solo entre MVs (y el host)"] },
      { k: "Desde fuera se entra", v: ["Sí", "No (salvo redirección de puertos)", "No"] },
      { k: "Salida a Internet", v: ["Sí", "Sí", "No"] },
      { k: "En QEMU", v: ["-netdev bridge con un br unido a la NIC real", "-netdev user (SLiRP) + hostfwd", "Bridge privado: br1 sin NIC real (P2)"] },
    ],
    same: ["Cada vNIC tiene su propia MAC única.", "Entre MVs del mismo switch virtual los paquetes se copian en memoria del hipervisor."],
  },
  {
    id: "backend",
    title: "Backends de QEMU",
    cols: [
      { short: "user", name: "SLiRP", hue: 195 },
      { short: "tap", name: "Interfaz TAP", hue: 175 },
      { short: "bridge", name: "TAP automático en un bridge", hue: 150 },
      { short: "socket", name: "Sockets UNIX/TCP", hue: 240 },
      { short: "VDE", name: "Virtual Distributed Ethernet", hue: 290 },
    ],
    rows: [
      { k: "Root", v: ["No", "Sí, para configurarla", "El bridge debe existir (y bridge.conf)", "No", "Infraestructura VDE"] },
      { k: "Rendimiento", v: ["Bajo", "Bueno", "Bueno", "Medio", "—"] },
      { k: "Para qué", v: ["Salir a Internet de forma sencilla (sin ping)", "Servicios de red, papel activo en la red", "Simplificar TAP + bridge", "Unir MVs sin root", "Redes virtuales complejas"] },
      { k: "Opción", v: ["-netdev user,id=n0[,hostfwd=tcp::H-:G]", "-netdev tap,id=n0,…", "-netdev bridge,br=br1,id=n0", "-netdev socket,id=n0,…", "-netdev vde,id=n0,…"] },
    ],
  },
];

export function CompareTables() {
  const [tab, setTab] = React.useState(TABLES[0].id);
  const [col, setCol] = React.useState<number | null>(null);
  const t = TABLES.find((x) => x.id === tab)!;
  return (
    <div className="cmp">
      <div className="choice cmp-tabs" role="tablist" aria-label="Comparativa">
        {TABLES.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === tab} aria-pressed={x.id === tab} onClick={() => (setTab(x.id), setCol(null))}>
            {x.title}
          </button>
        ))}
      </div>
      <div className="cmp-scroll" tabIndex={0} role="region" aria-label={`Tabla: ${t.title}`}>
        <table className="cmp-table" style={{ minWidth: Math.max(560, 150 + t.cols.length * 170) }}>
          <thead>
            <tr>
              <th className="cmp-corner">{t.title}</th>
              {t.cols.map((c, i) => (
                <th key={c.short} className="cmp-col" style={{ "--h": c.hue } as React.CSSProperties} data-on={col === i ? "" : undefined} onMouseEnter={() => setCol(i)} onMouseLeave={() => setCol(null)}>
                  <span className="cmp-short">{c.short}</span>
                  <span className="cmp-name">{c.name}</span>
                  {c.tag ? <span className="cmp-practice">{c.tag}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.k}>
                <th scope="row">{r.k}</th>
                {r.v.map((v, i) => (
                  <td key={i} style={{ "--h": t.cols[i].hue } as React.CSSProperties} data-on={col === i ? "" : undefined} data-dim={col !== null && col !== i ? "" : undefined} onMouseEnter={() => setCol(i)} onMouseLeave={() => setCol(null)}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t.same ? (
        <div className="cmp-same">
          <h3>Lo que tienen en común</h3>
          <ul>
            {t.same.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
