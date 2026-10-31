"use client";

import * as React from "react";
import { Cmd } from "../code";
import { Choice, useMounted } from "../figs/common";
import { useStillness } from "../iso/react/live";
import { MiniQuiz, type QuizItem } from "./kit";

/* ------------------------------------------------------------------ */
/* P2 test bench: the four ways to plug a VM in, with a packet you can follow hop by hop */

type St = Record<string, boolean>;
type Rt = Record<string, string>;
type Dyn<T> = T | ((st: St, rt: Rt) => T);
type Kind = "vm" | "sw" | "nic" | "svc" | "ext";

interface NetNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  t: string;
  s: Dyn<string>;
  k: Kind;
  off?: (st: St) => boolean;
}
interface Link {
  a: string;
  b: string;
  l?: Dyn<string>;
  c?: Dyn<string>;
  when?: (st: St) => boolean;
}
interface Step {
  p: string[][];
  t: string;
  tag?: string;
  fail?: boolean;
  full?: boolean;
  at?: "start";
  why?: string;
  set?: Rt;
}
interface Exp {
  label: string;
  ok: string;
  steps: (st: St) => Step[];
}
interface Mode {
  id: string;
  name: string;
  hue: number;
  lead: string;
  facts: string[];
  analogy: string;
  cmd: string;
  cap: string;
  groups: { x: number; y: number; w: number; h: number; l: string; d?: boolean }[];
  nodes: NetNode[];
  links: Link[];
  toggles: { id: string; label: string; def: boolean }[];
  exps: Exp[];
  wrap?: string[];
}

const N = (id: string, x: number, y: number, w: number, h: number, t: string, s: Dyn<string>, k: Kind, off?: (st: St) => boolean): NetNode => ({ id, x, y, w, h, t, s, k, off });
const L = (a: string, b: string, l?: Dyn<string>, c?: Dyn<string>, when?: (st: St) => boolean): Link => ({ a, b, l, c, when });
const val = <T,>(v: Dyn<T> | undefined, st: St, rt: Rt): T | undefined => (typeof v === "function" ? (v as (s: St, r: Rt) => T)(st, rt) : v);
const ctr = (n: NetNode): [number, number] => [n.x + n.w / 2, n.y + n.h / 2];
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

const aclFail = (a: string, b: string): Step => ({
  p: [[a, b]],
  tag: "arranque",
  t: "Lanzas la MV con -netdev bridge,br=br1…",
  fail: true,
  at: "start",
  why: "QEMU ni siquiera arranca: «access denied by ACL file». Falta allow br1 en /etc/qemu/bridge.conf.",
});

const MODES: Mode[] = [
  {
    id: "user",
    name: "Red user",
    hue: 65,
    lead: "QEMU lleva dentro una pila TCP/IP completa. Cuando la MV envía algo, QEMU lo desmonta y abre él mismo la conexión desde el host, como cualquier programa. Fuera solo se ve la IP del host: es NAT. Nadie puede iniciar una conexión hacia la MV, salvo por las «ventanillas» que abras con hostfwd.",
    facts: ["sin root", "MV 10.0.2.15", "host = 10.0.2.2", "ping limitado", "cada MV, su burbuja"],
    analogy: "La recepcionista: reenvía tus cartas con el remite de la empresa, pero no pasa llamadas de fuera a nadie que no esté en su lista.",
    cmd: "-netdev user,id=user.0,hostfwd=tcp::8080-:80 -device e1000,netdev=user.0",
    cap: "Cada QEMU monta su propia red de mentira 10.0.2.0/24. Las dos MVs creen ser la 10.0.2.15 y no hay ningún cable entre ellas.",
    groups: [
      { x: 200, y: 18, w: 588, h: 408, l: "KVM1 · el servidor (host)" },
      { x: 362, y: 86, w: 414, h: 112, l: "red de mentira de QEMU 1 · 10.0.2.0/24", d: true },
      { x: 362, y: 256, w: 414, h: 112, l: "red de mentira de QEMU 2 · 10.0.2.0/24", d: true },
    ],
    nodes: [
      N("pc", 14, 60, 162, 58, "Tu PC", "por la VPN", "ext"),
      N("net", 14, 300, 162, 58, "Servidor exterior", "internet / otra red", "ext"),
      N("ens32", 214, 170, 134, 58, "ens32 + firewalld", "10.0.16.173", "nic"),
      N("sshd", 214, 332, 134, 58, "sshd del host", "puerto 22", "svc"),
      N("q1", 376, 116, 132, 62, "QEMU 1 · SLiRP", "gw 10.0.2.2", "sw"),
      N("q2", 376, 286, 132, 62, "QEMU 2 · SLiRP", "gw 10.0.2.2", "sw"),
      N("vm1", 584, 116, 176, 62, "MV ssh1", "10.0.2.15 · web :80", "vm"),
      N("vm2", 584, 286, 176, 62, "MV ssh2", "10.0.2.15", "vm"),
    ],
    links: [L("pc", "ens32"), L("net", "ens32", "conexión del host"), L("ens32", "q1", (st) => (st.hf ? "hostfwd :8080→:80" : "")), L("q2", "ens32"), L("q1", "vm1", "e1000"), L("q2", "vm2", "e1000"), L("q1", "sshd", "10.0.2.2 = host", "p2-dash")],
    toggles: [
      { id: "fw", label: "Puerto 8080/tcp abierto en firewalld", def: true },
      { id: "hf", label: "MV lanzada con hostfwd=tcp::8080-:80", def: true },
    ],
    exps: [
      {
        label: "ssh1 → servidor exterior",
        ok: "Sale a la red con la IP del host. En el laboratorio la VLAN 301 corta la salida a Internet, pero el mecanismo es este.",
        steps: () => [
          { p: [["vm1", "q1"]], tag: "HTTP", t: "ssh1 manda la petición a su puerta de enlace, 10.0.2.2. No es un router de verdad: es QEMU." },
          { p: [["q1", "ens32", "net"]], tag: "socket del host", t: "SLiRP desmonta el paquete y abre una conexión normal desde el host, igual que haría un navegador." },
          { p: [["net", "ens32", "q1"]], tag: "respuesta", t: "El servidor contesta a 10.0.16.173. La MV no aparece por ningún lado: eso es NAT." },
          { p: [["q1", "vm1"]], tag: "respuesta", t: "QEMU sabe que esa conexión era de la MV y le entrega la respuesta." },
        ],
      },
      {
        label: "ssh1 → el host (ssh root@10.0.2.2)",
        ok: "Entras en KVM1: el prompt dirá vm-16-173. Te pide la contraseña del servidor, no la de la MV.",
        steps: () => [
          { p: [["vm1", "q1"]], tag: "SSH", t: "Desde dentro de la MV: ssh root@10.0.2.2." },
          { p: [["q1", "sshd"]], tag: "SSH", t: "QEMU traduce 10.0.2.2 a «el propio host» y conecta con su sshd." },
        ],
      },
      {
        label: "Tu PC → ssh1 directo (10.0.2.15)",
        ok: "",
        steps: () => [{ p: [["pc", "ens32"]], tag: "SSH 10.0.2.15", t: "Tu PC intenta llegar a 10.0.2.15…", fail: true, why: "Imposible: 10.0.2.15 solo existe dentro de QEMU y ningún router de fuera sabe llegar ahí. Sin hostfwd, la MV es invisible." }],
      },
      {
        label: "Tu PC → KVM1:8080 (la web de la MV)",
        ok: "Ves la web de la MV en http://10.0.16.173:8080. Hacen falta las dos cosas: el puerto abierto en firewalld y la ventanilla hostfwd en QEMU.",
        steps: (st) => [
          { p: [["pc", "ens32"]], tag: "HTTP :8080", t: "Tu navegador pide http://10.0.16.173:8080.", fail: !st.fw, why: "firewalld descarta la conexión: el puerto 8080 no está abierto. Falta firewall-cmd --add-port=8080/tcp." },
          { p: [["ens32", "q1"]], tag: "HTTP :8080", t: "firewalld la deja pasar. ¿Hay alguien escuchando en el 8080 del host?", fail: !st.hf, why: "Nadie escucha en el 8080: «connection refused». La MV se lanzó sin hostfwd." },
          { p: [["q1", "vm1"]], tag: "HTTP :80", t: "Sí: QEMU, gracias a hostfwd=tcp::8080-:80. Reenvía la conexión al puerto 80 de la MV." },
          { p: [["vm1", "q1", "ens32", "pc"]], tag: "index.html", t: "El servidor web de la MV responde y la página vuelve por el mismo camino." },
        ],
      },
      {
        label: "ssh1 → ssh2",
        ok: "",
        steps: () => [
          { p: [["vm1", "q1"]], tag: "ping", t: "ssh1 busca a ssh2… pero ssh2 también es 10.0.2.15, igual que ella." },
          { p: [["q1", "q2"]], tag: "ping", t: "QEMU 1 no tiene ningún camino hacia QEMU 2.", fail: true, why: "Cada MV tiene su propio SLiRP y no hay ningún switch entre ellas. Con red user, las MVs están aisladas aunque estén en el mismo host." },
        ],
      },
    ],
  },
  {
    id: "privado",
    name: "Bridge privado",
    hue: 165,
    lead: "br1 es un switch implementado en el kernel del host. Cada MV se enchufa con un cable virtual, una interfaz tap, que crea qemu-bridge-helper (solo si br1 aparece en /etc/qemu/bridge.conf). Ninguna tarjeta real está conectada, así que las MVs y el host forman una LAN cerrada. Las IPs las reparte una MV servidor DHCP.",
    facts: ["host 10.0.0.1 en br1", "DHCP 10.0.0.253", "una MAC por MV", "stp no", "allow br1"],
    analogy: "Una regleta de red en tu cuarto: los ordenadores enchufados se ven entre ellos, pero la regleta no llega a la pared.",
    cmd: "-device e1000,netdev=net0,mac=DE:AD:BE:EF:E3:1A -netdev bridge,br=br1,id=net0",
    cap: "Tres MVs y el propio host conectados al switch br1. La tarjeta real ens33 no está enchufada: nada sale del host.",
    groups: [{ x: 14, y: 18, w: 614, h: 408, l: "KVM1 (host)" }],
    nodes: [
      N("dhcp", 38, 60, 184, 62, "MV dhcp", (st) => (st.macs ? "10.0.0.253 · …E3:19" : "10.0.0.253 · 52:54:00:12:34:56"), "vm", (st) => !st.dhcp || !st.acl),
      N("hostsh", 420, 60, 184, 62, "El propio host", "shell · 10.0.0.1", "svc"),
      N("br1", 232, 190, 176, 62, "br1 · switch", "host = 10.0.0.1", "sw"),
      N("ens33", 484, 194, 120, 54, "ens33", "sin conectar", "nic"),
      N("real", 652, 190, 136, 62, "Red real", "fuera del host", "ext"),
      N("ssh1", 38, 334, 184, 62, "MV ssh1", (st, rt) => rt.ip1 || (st.macs ? "sin IP · …E3:1A" : "sin IP · 52:54:00:12:34:56"), "vm", (st) => !st.acl),
      N("ssh2", 420, 334, 184, 62, "MV ssh2", (st) => (st.macs ? "10.0.0.y · …E3:1B" : "10.0.0.y · 52:54:00:12:34:56"), "vm", (st) => !st.acl),
    ],
    links: [
      L("dhcp", "br1", "tap0", (st) => (st.acl ? "" : "p2-dash")),
      L("ssh1", "br1", "tap1", (st) => (st.acl ? "" : "p2-dash")),
      L("ssh2", "br1", "tap2", (st) => (st.acl ? "" : "p2-dash")),
      L("hostsh", "br1", "10.0.0.1"),
      L("br1", "ens33", "sin cable", "p2-dash"),
      L("ens33", "real"),
    ],
    toggles: [
      { id: "acl", label: "allow br1 en /etc/qemu/bridge.conf", def: true },
      { id: "dhcp", label: "MV dhcp arrancada antes que las demás", def: true },
      { id: "macs", label: "Cada MV con su propia MAC", def: true },
    ],
    exps: [
      {
        label: "ssh1 arranca y pide IP (DHCP)",
        ok: "ssh1 ya tiene IP. Dentro la ves con ip addr; en la MV dhcp, grep dhcpd /var/log/messages muestra DISCOVER, OFFER, REQUEST y ACK.",
        steps: (st) =>
          !st.acl
            ? [aclFail("ssh1", "br1")]
            : [
                { p: [["ssh1", "br1"]], tag: "DISCOVER", t: "ssh1 aún no tiene IP. Grita por broadcast: «¿hay algún servidor DHCP?»." },
                { p: [["br1", "dhcp"], ["br1", "ssh2"], ["br1", "hostsh"]], tag: "DISCOVER", t: "El switch copia el broadcast a todos sus puertos.", fail: !st.dhcp, full: true, why: "Nadie contesta: la MV dhcp no está arrancada. ssh1 se queda sin IP. Por eso el servidor DHCP se lanza el primero." },
                { p: [["dhcp", "br1", "ssh1"]], tag: "OFFER", t: "El servidor (10.0.0.253) contesta: «te ofrezco la 10.0.0.x»." },
                { p: [["ssh1", "br1", "dhcp"]], tag: "REQUEST", t: "ssh1: «me la quedo»." },
                { p: [["dhcp", "br1", "ssh1"]], tag: "ACK", t: "El servidor confirma y lo apunta en su registro.", set: { ip1: "10.0.0.x ✓ · por DHCP" } },
              ],
      },
      {
        label: "ssh1 → ssh2 (ping)",
        ok: "Se ven: mismo switch y misma subred 10.0.0.0/24.",
        steps: (st) =>
          !st.acl
            ? [aclFail("ssh1", "br1")]
            : [
                { p: [["ssh1", "br1"]], tag: "ping", t: "ssh1 hace ping a ssh2. La trama lleva como destino la MAC de ssh2." },
                { p: [["br1", "ssh2"]], tag: "ping", t: "El switch mira la MAC de destino y la manda solo por el puerto de ssh2.", fail: !st.macs, why: "Las tres MVs llevan la MAC por defecto de QEMU (52:54:00:12:34:56). El switch ve la misma MAC en varios puertos y no sabe a quién entregar. Cada MV necesita la suya." },
                { p: [["ssh2", "br1", "ssh1"]], tag: "pong", t: "ssh2 responde." },
              ],
      },
      {
        label: "Host ↔ ssh1 (ssh)",
        ok: "El host y las MVs se ven en las dos direcciones. Respuesta a la pregunta del PDF: desde las MVs, el host está en 10.0.0.1.",
        steps: (st) =>
          !st.acl
            ? [aclFail("ssh1", "br1")]
            : [
                { p: [["hostsh", "br1", "ssh1"]], tag: "SSH", t: "El host tiene la IP 10.0.0.1 en br1: está enchufado al mismo switch que las MVs." },
                { p: [["ssh1", "br1", "hostsh"]], tag: "SSH", t: "Y al revés: desde la MV, ssh root@10.0.0.1 llega al host." },
              ],
      },
      {
        label: "ssh1 → la red real",
        ok: "",
        steps: (st) =>
          !st.acl
            ? [aclFail("ssh1", "br1")]
            : [
                { p: [["ssh1", "br1"]], tag: "salir", t: "ssh1 intenta llegar a una máquina de fuera." },
                { p: [["br1", "ens33"]], tag: "salir", t: "Busca un cable hacia fuera…", fail: true, why: "br1 no tiene ninguna tarjeta real conectada y el host no hace de router. No hay salida: por eso se llama bridge «privado»." },
              ],
      },
    ],
  },
  {
    id: "publico",
    name: "Bridge público",
    hue: 255,
    lead: "Es el mismo switch, pero ahora la tarjeta real ens33 se mete dentro como un puerto más. ens33 deja de tener IP y la IP trasera del host pasa a br0. Las MVs salen a la red trasera como un ordenador más, y el DHCP del departamento les da IP según su MAC: por eso usas las MACs de DOCK3 y DOCK4 de tu tabla.",
    facts: ["br0 10.250.16.173", "DOCK3 …10:A9 → .169", "DOCK4 …10:AA → .170", "ens32 no se toca", "allow br0"],
    analogy: "La regleta ahora sí va a la pared: tus MVs están en la misma red que el resto del edificio.",
    cmd: "nmcli connection add type bridge-slave ifname ens33 master bridge0",
    cap: "ens33 es solo un puerto del switch br0, que llega a la red trasera real. Tu SSH sigue entrando por ens32, que queda fuera del bridge.",
    groups: [{ x: 140, y: 18, w: 402, h: 408, l: "KVM1" }],
    nodes: [
      N("pc", 8, 56, 118, 58, "Tu PC", "por la VPN", "ext"),
      N("ens32", 158, 56, 158, 58, "ens32", (st) => (st.err ? "¡sin IP! (en el bridge)" : "10.0.16.173 · tu SSH"), "nic"),
      N("ens33", 400, 56, 126, 58, "ens33", "puerto · sin IP", "nic"),
      N("br0", 300, 190, 226, 62, "br0 · switch", "IP del host 10.250.16.173", "sw"),
      N("ssh1", 158, 334, 172, 62, "MV ssh1", (st, rt) => rt.ip1 || (st.mac ? "MAC …10:A9 (DOCK3)" : "MAC …10:2B (la del PDF)"), "vm"),
      N("ssh2", 354, 334, 172, 62, "MV ssh2", "MAC …10:AA (DOCK4)", "vm"),
      N("dhcpd", 574, 56, 214, 58, "DHCP del departamento", "reparte IP según la MAC", "svc"),
      N("phys", 574, 190, 214, 62, "Switch de la red trasera", "10.250.16.x · vrouter-1001", "sw"),
      N("kvm2", 574, 334, 214, 62, "KVM2 con el mismo montaje", "br0 10.250.16.174 + MVs", "ext"),
    ],
    links: [L("pc", "ens32", "SSH"), L("br0", "ens33", "puerto esclavo"), L("ens33", "phys", "cable real"), L("phys", "dhcpd"), L("phys", "kvm2"), L("ssh1", "br0", "tap"), L("ssh2", "br0", "tap"), L("ens32", "br0", "¡error!", "p2-err", (st) => st.err)],
    toggles: [
      { id: "mac", label: "ssh1 con la MAC de DOCK3 de tu tabla (no la del ejemplo del PDF)", def: true },
      { id: "err", label: "Meter ens32 en el bridge (el error clásico)", def: false },
    ],
    exps: [
      {
        label: "ssh1 pide IP al DHCP de la red real",
        ok: "ssh1 es un ordenador más de la red trasera, con la IP reservada para DOCK3. ssh2, con la MAC de DOCK4, recibirá 10.250.16.170.",
        steps: (st) => [
          { p: [["ssh1", "br0", "ens33", "phys", "dhcpd"]], tag: "DISCOVER", t: "El grito de ssh1 sale por ens33: el switch virtual está enchufado a la red real.", fail: !st.mac, full: true, why: "El DHCP del departamento no conoce 00:50:56:02:10:2B: es la MAC del ejemplo del PDF, de otro alumno. Usa las de DOCK3 y DOCK4 de tu tabla." },
          { p: [["dhcpd", "phys", "ens33", "br0", "ssh1"]], tag: "OFFER / ACK", t: "Conoce la MAC de DOCK3 y le asigna su IP: 10.250.16.169.", set: { ip1: "10.250.16.169 ✓ · DOCK3" } },
        ],
      },
      {
        label: "Una MV de KVM2 → ssh1 (pregunta del PDF)",
        ok: "Sí se ven. Los dos br0 están enchufados a la misma red trasera (vrouter-1001): es como si todas las MVs estuvieran en el mismo switch físico. Condición: todas con MACs distintas.",
        steps: () => [
          { p: [["kvm2", "phys", "ens33", "br0", "ssh1"]], tag: "ping", t: "Una MV conectada al br0 de KVM2 hace ping a ssh1." },
          { p: [["ssh1", "br0", "ens33", "phys", "kvm2"]], tag: "pong", t: "ssh1 responde por el mismo camino." },
        ],
      },
      {
        label: "Tu PC → KVM1 por SSH",
        ok: "Funciona: ens32 no se ha tocado. El bridge público solo usa ens33.",
        steps: (st) => [{ p: [["pc", "ens32"]], tag: "SSH", t: "Tu sesión SSH entra por ens32 (10.0.16.173).", fail: st.err, why: "Metiste ens32 en el bridge: su IP desapareció y tu SSH se cortó. Te has quedado fuera del servidor." }],
      },
      {
        label: "ssh1 → ssh2",
        ok: "Se ven, igual que en el bridge privado.",
        steps: () => [
          { p: [["ssh1", "br0", "ssh2"]], tag: "ping", t: "Mismo switch: la trama no necesita salir del host." },
          { p: [["ssh2", "br0", "ssh1"]], tag: "pong", t: "ssh2 responde." },
        ],
      },
    ],
  },
  {
    id: "vxlan",
    name: "Overlay VXLAN",
    hue: 305,
    lead: "Cada host tiene su switch ov0-br y una interfaz ov0-vxlan enchufada a él. Lo que entra en ov0-vxlan se mete entero dentro de un paquete UDP y viaja por la red trasera hasta el otro host, que lo desenvuelve y lo deja en su ov0-br. Así, las MVs de los dos servidores quedan en la misma LAN, invisible para la red real.",
    facts: ["VNI 163 (SCSI1 = .163)", "8472/udp en los dos", "remote = br0 del otro", "ov0-br 10.0.1.173 / .174", "MVs 10.0.0.0/24"],
    analogy: "Dos oficinas en edificios distintos: cada carta interna va dentro de un sobre de correo normal hasta el otro edificio, y allí la sacan y la reparten.",
    cmd: "nmcli connection add type vxlan slave-type bridge con-name overlay0-vxlan ifname ov0-vxlan id 163 remote 10.250.16.174 master ov0-br",
    cap: "El túnel une las dos ov0-vxlan por encima de la red trasera. Mientras cruza la red real, el paquete va ensobrado (con un anillo alrededor).",
    wrap: ["vxA", "br0A", "phys", "br0B", "vxB"],
    groups: [
      { x: 8, y: 18, w: 338, h: 408, l: "KVM1 · host A" },
      { x: 454, y: 18, w: 338, h: 408, l: "KVM2 · host B" },
    ],
    nodes: [
      N("dhcp1", 26, 60, 152, 62, "MV dhcp1", "10.0.0.253 · …E3:19", "vm"),
      N("ovA", 26, 200, 152, 62, "ov0-br", "10.0.1.173", "sw"),
      N("vxA", 198, 200, 132, 62, "ov0-vxlan", "VNI 163", "nic"),
      N("br0A", 198, 340, 132, 62, "br0 + ens33", "10.250.16.173", "nic"),
      N("outsider", 350, 60, 100, 62, "Otra máquina", "red real", "ext"),
      N("phys", 350, 340, 100, 62, "Red trasera", "switch real", "ext"),
      N("vxB", 470, 200, 132, 62, "ov0-vxlan", (st) => (st.vni ? "VNI 163" : "VNI 164 (¡distinto!)"), "nic"),
      N("br0B", 470, 340, 132, 62, "br0 + ens33", "10.250.16.174", "nic"),
      N("ovB", 622, 200, 152, 62, "ov0-br", "10.0.1.174", "sw"),
      N("sshB", 622, 60, 152, 62, "MV ssh1", (_st, rt) => rt.ip || "sin IP · …E3:1A", "vm"),
    ],
    links: [L("vxA", "vxB", "túnel VNI 163", "p2-tun"), L("dhcp1", "ovA", "tap"), L("ovA", "vxA", "puerto"), L("vxA", "br0A", "UDP 8472"), L("br0A", "phys"), L("phys", "br0B"), L("br0B", "vxB", "UDP 8472"), L("vxB", "ovB", "puerto"), L("ovB", "sshB", "tap"), L("outsider", "phys")],
    toggles: [
      { id: "fw", label: "Puerto 8472/udp abierto en los dos hosts", def: true },
      { id: "vni", label: "Mismo id (VNI 163) en los dos hosts", def: true },
    ],
    exps: [
      {
        label: "ssh1 (en KVM2) pide IP al DHCP de KVM1",
        ok: "ssh1, en KVM2, ha recibido IP del servidor DHCP de KVM1. Las dos MVs están en la misma LAN aunque vivan en servidores distintos: es justo la prueba que pide la práctica.",
        steps: (st) => [
          { p: [["sshB", "ovB"]], tag: "DISCOVER", t: "ssh1 grita DHCPDISCOVER en su switch local, el ov0-br de KVM2." },
          { p: [["ovB", "vxB"]], tag: "DISCOVER", t: "El switch copia el broadcast a todos sus puertos, también a ov0-vxlan." },
          { p: [["vxB", "br0B"]], tag: "UDP 8472", t: `ov0-vxlan mete la trama entera en un sobre: VXLAN (VNI ${st.vni ? 163 : 164}) + UDP 8472 + IP hacia 10.250.16.173.` },
          { p: [["br0B", "phys", "br0A"]], tag: "UDP 8472", t: "El sobre cruza la red trasera real. Los switches solo ven un paquete UDP normal entre dos servidores." },
          { p: [["br0A", "vxA"]], tag: "UDP 8472", t: "Llega a KVM1, al puerto 8472.", fail: !st.fw, why: "El cortafuegos de KVM1 descarta el paquete. Hay que abrir 8472/udp en los dos hosts (con y sin --permanent)." },
          { p: [["vxA", "ovA"]], tag: "DISCOVER", t: "ov0-vxlan comprueba el VNI, abre el sobre y deja la trama original en ov0-br, como si hubiera llegado por un cable.", fail: !st.vni, at: "start", why: "El sobre trae VNI 164 y KVM1 solo acepta el 163: lo descarta. El id tiene que ser el mismo en los dos hosts." },
          { p: [["ovA", "dhcp1"]], tag: "DISCOVER", t: "La MV dhcp1 recibe el grito de una MV que vive en otro servidor." },
          { p: [["dhcp1", "ovA", "vxA", "br0A", "phys", "br0B", "vxB", "ovB", "sshB"]], tag: "OFFER", t: "La oferta hace el viaje inverso, ensobrada mientras cruza la red real." },
          { p: [["sshB", "ovB", "vxB", "br0B", "phys", "br0A", "vxA", "ovA", "dhcp1"]], tag: "REQUEST", t: "ssh1 la acepta." },
          { p: [["dhcp1", "ovA", "vxA", "br0A", "phys", "br0B", "vxB", "ovB", "sshB"]], tag: "ACK", t: "dhcp1 confirma. ssh1 ya tiene IP.", set: { ip: "10.0.0.x ✓ (de KVM1)" } },
        ],
      },
      {
        label: "ping entre los ov0-br (probar el túnel)",
        ok: "Responde: el túnel VXLAN funciona. Ya puedes conectar MVs a ov0-br en los dos hosts.",
        steps: (st) => [
          { p: [["ovA", "vxA"]], tag: "ping", t: "Desde KVM1: ping 10.0.1.174." },
          { p: [["vxA", "br0A", "phys", "br0B", "vxB"]], tag: "UDP 8472", t: "Ensobrado, cruza la red trasera hasta KVM2.", fail: !st.fw, why: "El cortafuegos de KVM2 descarta el UDP 8472. Hay que abrirlo en los dos hosts." },
          { p: [["vxB", "ovB"]], tag: "ping", t: "KVM2 abre el sobre y entrega el ping a su ov0-br.", fail: !st.vni, at: "start", why: "KVM2 está configurado con otro VNI y descarta el sobre. El id tiene que coincidir." },
          { p: [["ovB", "vxB", "br0B", "phys", "br0A", "vxA", "ovA"]], tag: "pong", t: "La respuesta vuelve por el túnel." },
        ],
      },
      {
        label: "Otra máquina de la red real → ssh1",
        ok: "",
        steps: () => [
          { p: [["outsider", "phys"]], tag: "ping 10.0.0.x", t: "Una máquina de la red trasera intenta llegar a ssh1." },
          { p: [["phys", "br0B"]], tag: "ping 10.0.0.x", t: "¿Dónde está 10.0.0.x?", fail: true, why: "En la red real, 10.0.0.x no existe: esas IPs solo viven dentro del túnel. La overlay está aislada, y por eso dos VXLAN distintas pueden repetir el mismo rango de IPs." },
        ],
      },
    ],
  },
];

const defaults = () => Object.fromEntries(MODES.map((m) => [m.id, Object.fromEntries(m.toggles.map((t) => [t.id, t.def]))])) as Record<string, St>;
const SVGNS = "http://www.w3.org/2000/svg";

export function NetBench() {
  const mounted = useMounted();
  const still = useStillness();
  const [mode, setMode] = React.useState("user");
  const [toggles, setToggles] = React.useState(defaults);
  const [rt, setRt] = React.useState<Rt>({});
  const [log, setLog] = React.useState<{ tag?: string; t: string; bad?: boolean }[]>([]);
  const [verdict, setVerdict] = React.useState<{ ok: boolean; txt: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [active, setActive] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const pkRef = React.useRef<SVGGElement>(null);
  const marksRef = React.useRef<SVGGElement>(null);
  const runId = React.useRef(0);
  const M = MODES.find((m) => m.id === mode)!;
  const st = toggles[mode];
  const map = React.useMemo(() => Object.fromEntries(M.nodes.map((n) => [n.id, n])), [M]);

  React.useEffect(() => () => void runId.current++, []);

  const reset = () => {
    marksRef.current?.replaceChildren();
    setRt({});
    setLog([]);
    setVerdict(null);
    setActive(null);
  };

  const hit = (id: string) => {
    const el = svgRef.current?.querySelector(`[data-node="${id}"]`);
    if (!el) return;
    el.setAttribute("data-hit", "");
    window.setTimeout(() => el.removeAttribute("data-hit"), 450);
  };
  const corner = (id: string): [number, number] => [map[id].x + map[id].w - 6, map[id].y + 6];
  const mark = ([x, y]: [number, number]) => {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "p2-x");
    g.setAttribute("transform", `translate(${x},${y})`);
    g.innerHTML = '<circle r="11"/><path class="nm-cut" d="M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5"/>';
    marksRef.current?.appendChild(g);
  };

  // One packet along one chain of nodes. A failing step stops short (or at the start) and leaves a red ✗.
  const animChain = (ch: string[], step: Step, primary: boolean) =>
    new Promise<void>((done) => {
      if (step.fail && step.at === "start") {
        hit(ch[0]);
        if (primary) mark(corner(ch[0]));
        return done();
      }
      const segs = ch.slice(0, -1).map((from, i) => {
        const a = ctr(map[from]);
        const b = ctr(map[ch[i + 1]]);
        return { a, b, from, next: ch[i + 1], to: ch[i + 1] as string | null, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
      });
      if (step.fail && !step.full) {
        const s = segs[segs.length - 1];
        s.b = [s.a[0] + (s.b[0] - s.a[0]) * 0.55, s.a[1] + (s.b[1] - s.a[1]) * 0.55];
        s.len *= 0.55;
        s.to = null;
      }
      const total = segs.reduce((t, s) => t + s.len, 0);
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "p2-pkt");
      g.innerHTML = '<circle class="p2-env" r="12"/><circle class="nm-pkt" r="6"/><text class="dg-s p2-pkt-tag" y="-17" text-anchor="middle"></text>';
      g.querySelector("text")!.textContent = step.tag ?? "";
      pkRef.current?.appendChild(g);
      const wrapSet = M.wrap ?? [];
      const dur = still ? 0 : Math.max(450, total / 0.3);
      const t0 = performance.now();
      let last = -1;
      const frame = (now: number) => {
        const d = dur ? Math.min(1, (now - t0) / dur) * total : total;
        let acc = 0;
        let i = 0;
        while (i < segs.length - 1 && acc + segs[i].len < d) acc += segs[i++].len;
        if (i !== last) {
          for (let j = Math.max(0, last); j < i; j++) if (segs[j].to) hit(segs[j].to!);
          last = i;
          g.toggleAttribute("data-wrap", wrapSet.includes(segs[i].from) && wrapSet.includes(segs[i].next));
        }
        const s = segs[i];
        const f = s.len ? Math.min(1, (d - acc) / s.len) : 1;
        const x = s.a[0] + (s.b[0] - s.a[0]) * f;
        const y = s.a[1] + (s.b[1] - s.a[1]) * f;
        g.setAttribute("transform", `translate(${x},${y})`);
        if (d < total) return void requestAnimationFrame(frame);
        const end = segs[segs.length - 1];
        if (end.to) hit(end.to);
        if (step.fail && primary) mark(step.full ? corner(ch[ch.length - 1]) : [x, y]);
        window.setTimeout(() => (g.remove(), done()), step.fail ? 0 : 160);
      };
      requestAnimationFrame(frame);
    });

  const run = async (i: number) => {
    if (busy) return;
    const id = ++runId.current;
    reset();
    setActive(i);
    setBusy(true);
    const exp = M.exps[i];
    let failed = false;
    for (const step of exp.steps(st)) {
      setLog((l) => [...l, { tag: step.tag, t: step.t }]);
      await Promise.all(step.p.map((ch, k) => animChain(ch, step, k === 0)));
      if (runId.current !== id) return;
      if (step.fail) {
        setLog((l) => l.map((e, j) => (j === l.length - 1 ? { ...e, bad: true } : e)));
        setVerdict({ ok: false, txt: step.why ?? "" });
        failed = true;
        break;
      }
      if (step.set) setRt((r) => ({ ...r, ...step.set }));
      await wait(still ? 30 : 200);
    }
    if (!failed) setVerdict({ ok: true, txt: exp.ok });
    setBusy(false);
  };

  return (
    <figure className="dg dg-wide p2-bench reveal" style={{ "--h": M.hue } as React.CSSProperties}>
      <figcaption className="dg-head">
        <span className="dg-kicker">Banco de pruebas</span>
        <strong>¿Quién ve a quién? · {M.name}</strong>
      </figcaption>
      <div className="controls">
        <div className="choice" role="group" aria-label="Configuración">
          <span className="choice-label">Configuración</span>
          {MODES.map((m, i) => (
            <button key={m.id} type="button" disabled={busy} aria-pressed={m.id === mode} onClick={() => (setMode(m.id), reset())}>
              {i + 1} · {m.name}
            </button>
          ))}
        </div>
      </div>
      <div className="p2-intro">
        <p className="p2-lead">{M.lead}</p>
        <div className="p2-facts">
          {M.facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        <p className="p2-analogy">{M.analogy}</p>
        <Cmd>{M.cmd}</Cmd>
      </div>
      <div className="p2-body">
        <div className="p2-draw">
          <div className="dg-scroll">
            <svg ref={svgRef} className="dg-svg p2-svg" viewBox="0 0 800 440" role="img" aria-label={`Esquema de la ${M.name.toLowerCase()}. ${M.cap}`}>
              {mounted ? (
                <>
                  {M.groups.map((g) => (
                    <g key={g.l}>
                      <rect className={g.d ? "nm-slirp" : "nm-host"} x={g.x} y={g.y} width={g.w} height={g.h} rx={14} />
                      <text className="dg-kick" x={g.x + 14} y={g.y + 22}>
                        {g.l}
                      </text>
                    </g>
                  ))}
                  {M.links.map((l) => {
                    if (l.when && !l.when(st)) return null;
                    const [x1, y1] = ctr(map[l.a]);
                    const [x2, y2] = ctr(map[l.b]);
                    const c = val(l.c, st, rt) ?? "";
                    return <path key={l.a + l.b} className={`dg-wire ${c}`} data-flow={c === "p2-tun" ? "" : undefined} d={`M${x1} ${y1} L${x2} ${y2}`} />;
                  })}
                  {M.nodes.map((n) => {
                    const [cx, cy] = ctr(n);
                    const sw = n.k === "sw";
                    return (
                      <g key={n.id} data-node={n.id} className={`p2-node k-${n.k}`} data-off={n.off?.(st) ? "" : undefined}>
                        <rect className={sw ? "dg-node accent" : n.k === "vm" ? "dg-node out" : "dg-node"} x={n.x} y={n.y} width={n.w} height={n.h} rx={9} />
                        <text className={sw ? "dg-t nm-r" : "dg-t"} x={cx} y={cy - 4} textAnchor="middle">
                          {n.t}
                        </text>
                        <text className={sw ? "dg-s nm-r" : "dg-s"} x={cx} y={cy + 14} textAnchor="middle">
                          {val(n.s, st, rt)}
                        </text>
                      </g>
                    );
                  })}
                  {M.links.map((l) => {
                    const txt = l.when && !l.when(st) ? "" : val(l.l, st, rt);
                    if (!txt) return null;
                    const [x1, y1] = ctr(map[l.a]);
                    const [x2, y2] = ctr(map[l.b]);
                    const c = val(l.c, st, rt) ?? "";
                    return (
                      <text key={`t${l.a}${l.b}`} className={`dg-s p2-ll ${c}`} x={(x1 + x2) / 2} y={(y1 + y2) / 2 + (Math.abs(y1 - y2) < 2 ? -9 : 4)} textAnchor="middle">
                        {txt}
                      </text>
                    );
                  })}
                </>
              ) : null}
              <g ref={marksRef} />
              <g ref={pkRef} />
            </svg>
          </div>
          <p className="dg-note">{M.cap}</p>
        </div>
        <div className="p2-side">
          <div>
            <span className="choice-label">Experimentos</span>
            <div className="p2-exps">
              {M.exps.map((e, i) => (
                <button key={e.label} type="button" disabled={busy} aria-pressed={active === i} onClick={() => run(i)}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="choice-label">Cambia el montaje</span>
            <div className="p2-toggles">
              {M.toggles.map((t) => (
                <label key={t.id} className="qb-check">
                  <input type="checkbox" disabled={busy} checked={st[t.id]} onChange={(e) => (setToggles((all) => ({ ...all, [mode]: { ...all[mode], [t.id]: e.target.checked } })), reset())} />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div className="p2-logbox" aria-live="polite">
            <span className="choice-label">{active === null ? "Recorrido del paquete" : M.exps[active].label}</span>
            {log.length ? (
              <ol className="p2-log">
                {log.map((e, i) => (
                  <li key={i} data-bad={e.bad ? "" : undefined} data-now={busy && i === log.length - 1 ? "" : undefined}>
                    {e.tag ? <span className="p2-tag">{e.tag}</span> : null}
                    {e.t}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="dg-note">Elige un experimento: verás cada salto del paquete y por qué pasa o se bloquea.</p>
            )}
            {verdict ? (
              <p className="dg-note p2-verdict" data-ok={verdict.ok ? "" : undefined}>
                <b className={verdict.ok ? "ok-text" : "bad-text"}>{verdict.ok ? "✓ Llega." : "✗ No llega."}</b> {verdict.txt}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* VXLAN: the VM's frame inside envelope after envelope */

const LAYERS = [
  { k: "eth", name: "Ethernet real", b: 14, hue: null, txt: "MAC de la tarjeta trasera de KVM2 → MAC de la de KVM1. Es lo único que miran los switches de la red trasera." },
  { k: "ip", name: "IP 10.250.16.174 → .173", b: 20, hue: 255, txt: "De br0 de KVM2 a br0 de KVM1: el «remote» que configuraste. Los routers solo leen esto." },
  { k: "udp", name: "UDP · puerto 8472", b: 8, hue: 65, txt: "Por eso hay que abrir 8472/udp en el cortafuegos de los dos hosts." },
  { k: "vx", name: "VXLAN · VNI 163", b: 8, hue: 305, txt: "El número de red virtual (24 bits: unos 16 millones de redes, frente a las 4094 VLAN). El receptor solo acepta su VNI." },
];
const INNER = { name: "Trama original de ssh1", txt: "Ethernet DE:AD:BE:EF:E3:1A → broadcast, con su DHCPDISCOVER dentro. Viaja intacta: nadie la toca por el camino." };

export function VxlanEnvelope() {
  const [lv, setLv] = React.useState(4);
  let nest: React.ReactNode = (
    <div className="p2-lay" style={{ "--h": 165 } as React.CSSProperties}>
      <span className="p2-lay-h">
        <span>{INNER.name}</span>
        <span>lo que ve la MV</span>
      </span>
      <code className="p2-inner">
        DE:AD:BE:EF:E3:1A → ff:ff:ff:ff:ff:ff
        <br />
        DHCPDISCOVER · «¿hay algún servidor DHCP?»
      </code>
    </div>
  );
  for (let i = 3; i >= 4 - lv; i--) {
    const l = LAYERS[i];
    nest = (
      <div key={i === 4 - lv ? `${l.k}-${lv}` : l.k} className={i === 4 - lv ? "p2-lay p2-fresh" : "p2-lay"} data-plain={l.hue === null ? "" : undefined} style={l.hue === null ? undefined : ({ "--h": l.hue } as React.CSSProperties)}>
        <span className="p2-lay-h">
          <span>{l.name}</span>
          <span>+{l.b} B</span>
        </span>
        {nest}
      </div>
    );
  }
  const bytes = LAYERS.slice(4 - lv).reduce((t, l) => t + l.b, 0);
  const items = [{ name: INNER.name, txt: INNER.txt, on: true, cur: lv === 0 }, ...[3, 2, 1, 0].map((i, n) => ({ name: LAYERS[i].name, txt: LAYERS[i].txt, on: n < lv, cur: n === lv - 1 }))];
  return (
    <figure className="dg p2-env-fig reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">VXLAN por dentro</span>
        <strong>Un sobre dentro de otro sobre</strong>
      </figcaption>
      <p className="dg-note">Así viaja el DHCPDISCOVER de ssh1 desde KVM2 hasta KVM1. Mete la trama en sobres hasta que pueda cruzar la red real, y vuelve a abrirlos como hace el host que la recibe.</p>
      <div className="controls">
        <button type="button" className="btn ghost" disabled={lv === 0} onClick={() => setLv((v) => Math.max(0, v - 1))}>
          ← Abrir un sobre
        </button>
        <button type="button" className="btn" disabled={lv === 4} onClick={() => setLv((v) => Math.min(4, v + 1))}>
          Meter en otro sobre →
        </button>
        <span className="p2-bytes">{lv ? `+${bytes} bytes de cabeceras` : "sin sobres"}</span>
      </div>
      <div className="p2-nest" aria-live="polite">
        {nest}
      </div>
      <ol className="p2-layers">
        {items.map((it) => (
          <li key={it.name} data-cur={it.cur ? "" : undefined} data-dim={it.on ? undefined : ""}>
            <b>{it.name}.</b> {it.txt}
          </li>
        ))}
      </ol>
      <p className="dg-note">La red real solo lee las capas de fuera; la MV solo ve la de dentro. Son 50 bytes extra por trama: si la red real admite 1500, a la MV solo le caben 1450, y con paquetes grandes puede haber problemas de MTU.</p>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* The four side by side, and a quick self-check */

const ROWS: [string, string[]][] = [
  ["Opción QEMU", ["-netdev user", "-netdev bridge,br=br1", "-netdev bridge,br=br0", "-netdev bridge,br=ov0-br"]],
  ["¿Root en el host?", ["No", "Sí, para crear el bridge", "Sí", "Sí"]],
  ["¿Quién da la IP?", ["QEMU: siempre 10.0.2.15", "Una MV DHCP (10.0.0.253)", "El DHCP de la red real, según la MAC", "Una MV DHCP dentro de la overlay"]],
  ["¿Se ven las MVs?", ["No, cada una en su burbuja", "Sí, las del mismo host", "Sí, incluso de otros hosts", "Sí, las del mismo VNI aunque estén en otro host"]],
  ["¿El host llega a la MV?", ["Solo con hostfwd", "Sí, desde 10.0.0.1", "Sí", "Solo si tiene IP en esa subred"]],
  ["¿La red real llega a la MV?", ["Solo con hostfwd y el puerto abierto", "No", "Sí", "No"]],
  ["No olvides", ["firewall-cmd con y sin --permanent", "allow br1, stp no, una MAC por MV, el DHCP primero", "no tocar ens32; MACs de DOCK3 y DOCK4", "mismo id (163) y 8472/udp abierto en los dos"]],
];

export function P2Table() {
  return (
    <figure className="dg dg-wide reveal">
      <figcaption className="dg-head">
        <span className="dg-kicker">Para el examen</span>
        <strong>Las cuatro, cara a cara</strong>
      </figcaption>
      <div className="dg-scroll">
        <table className="p2-table">
          <thead>
            <tr>
              <th scope="col" />
              {MODES.map((m) => (
                <th key={m.id} scope="col" style={{ "--h": m.hue } as React.CSSProperties}>
                  {m.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([k, cells]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                {cells.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

const QUIZ: QuizItem[] = [
  { q: "Dos MVs en el mismo host, las dos con red user. ¿Se ven entre sí?", options: ["Sí, están en la misma red 10.0.2.0/24", "No: cada una tiene su propio SLiRP", "Solo si abres el puerto en firewalld"], ok: 1, why: "Cada QEMU monta su propia red de mentira y las dos MVs reciben la 10.0.2.15. No hay switch entre ellas." },
  { q: "¿Qué hace hostfwd=tcp::8080-:80?", options: ["Lleva el puerto 80 del host al 8080 de la MV", "Lleva el puerto 8080 del host al 80 de la MV", "Abre el 8080 en el cortafuegos"], ok: 1, why: "Primero el host y luego el guest. El texto del PDF lo dice al revés; manda el comando. El cortafuegos se abre aparte." },
  { q: "Ejecutas solo firewall-cmd --add-port=8080/tcp --permanent. ¿Está abierto el puerto ahora mismo?", options: ["Sí, ahora y tras reiniciar", "No: queda guardado, pero no se aplica hasta recargar o reiniciar", "Solo hasta el próximo reinicio"], ok: 1, why: "--permanent solo escribe la configuración guardada. Por eso se ejecuta también sin --permanent, que lo aplica al momento." },
  { q: "¿Por qué se crea el bridge con stp no?", options: ["Porque STP es inseguro", "Para evitar que cada puerto nuevo espere unos 30 s antes de dejar pasar tráfico", "Porque sin STP no hay broadcast"], ok: 1, why: "STP evita bucles entre switches, pero cada puerto nuevo espera escuchando. Con un solo switch no hay bucles, y la espera haría fallar el DHCP de la MV recién arrancada." },
  { q: "En el bridge público, ¿dónde va la IP 10.250.16.173?", options: ["En ens33", "En br0", "En ens32"], ok: 1, why: "ens33 pasa a ser solo un puerto del switch. Quien habla por el host en esa red es br0." },
  { q: "¿Por qué usas las MACs de DOCK3 y DOCK4 en el bridge público?", options: ["Porque QEMU no acepta otras", "Porque el DHCP de la red real reparte las IPs según la MAC", "Para que el bridge no haga bucles"], ok: 1, why: "Con 00:50:56:02:10:A9 recibes 10.250.16.169, y con …:AA, 10.250.16.170. La MAC del ejemplo del PDF es de otro alumno." },
  { q: "En la VXLAN, ¿qué pones en id?", options: ["163, el mismo en los dos hosts", "173 en KVM1 y 174 en KVM2", "8472"], ok: 0, why: "Es el último número de tu servidor iSCSI (SCSI1 = 10.0.16.163). Si no coinciden, cada host descarta los sobres del otro. 8472 es el puerto UDP." },
  { q: "alpine-webserver.qcow2 pesa unos 8 MB. ¿Qué es?", options: ["Un disco comprimido", "Un clon enlazado de alpine-base.qcow2", "Una imagen ISO de instalación"], ok: 1, why: "Solo guarda las diferencias. Necesita la alpine-base.qcow2 original en la misma carpeta: qemu-img info la muestra como backing file." },
];

export function P2Quiz() {
  return <MiniQuiz title="¿Quién ve a quién?" questions={QUIZ} />;
}
