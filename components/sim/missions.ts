// Guided missions over the simulated lab: each step is checked against the lab state, so any valid command counts.
import { baseName, hostOf, real, type Lab } from "./model";

export interface Step {
  title: string;
  why: string;
  hint: string[];
  done: (lab: Lab) => boolean;
}
export interface Mission {
  id: string;
  title: string;
  steps: Step[];
}

const K1 = "10.0.16.173";
const K2 = "10.0.16.174";
const h1 = (lab: Lab) => hostOf(lab, K1)!;
const isClone = (lab: Lab, ip: string, path: string) => {
  const h = hostOf(lab, ip)!;
  const img = real(h, path);
  return !!img && img.kind === "clone" && !!img.backing && real(h, img.backing)?.kind === "base";
};
const onBridge = (lab: Lab, br: string) => h1(lab).vms.filter((v) => v.nics.some((n) => n.kind === "bridge" && n.br === br));

export const MISSIONS: Mission[] = [
  {
    id: "p1",
    title: "Práctica 1",
    steps: [
      { title: "Conéctate a la VPN", why: "Desde casa, la LAN de los servidores (10.0.16.0/24) solo se ve a través de la VPN.", hint: ["vpn"], done: (l) => l.vpn },
      { title: "Entra en KVM1 por SSH", why: "Tu PC es solo la puerta: todo se hace en el servidor KVM1, que es el hipervisor.", hint: ["ssh root@10.0.16.173"], done: (l) => l.done.has(`ssh:${K1}`) },
      { title: "Prepara las carpetas", why: "La base vive en /exports/VMs; los clones de cada práctica, en /home/VMs.", hint: ["mkdir -p /exports/VMs /home/VMs"], done: (l) => h1(l).dirs.has("/exports/VMs") && h1(l).dirs.has("/home/VMs") },
      { title: "Descarga la imagen base", why: "Los servidores no tienen Internet: las imágenes salen del repositorio local de la asignatura.", hint: ["cd /exports/VMs", "wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2"], done: (l) => real(h1(l), "/exports/VMs/alpine-base.qcow2")?.kind === "base" },
      { title: "Enlázala desde /home/VMs", why: "Un enlace simbólico: los clones la ven en su carpeta sin moverla de /exports.", hint: ["cd /home/VMs", "ln -s /exports/VMs/alpine-base.qcow2 alpine-base.qcow2"], done: (l) => h1(l).files.get("/home/VMs/alpine-base.qcow2")?.kind === "link" && !!real(h1(l), "/home/VMs/alpine-base.qcow2") },
      { title: "Crea los dos linked clones", why: "Cada clon guarda solo lo que cambie respecto a la base: -F es el formato de la base, -f el del clon y -b la base.", hint: ["qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh1.qcow2", "qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh2.qcow2"], done: (l) => isClone(l, K1, "/home/VMs/alpine-ssh1.qcow2") && isClone(l, K1, "/home/VMs/alpine-ssh2.qcow2") },
      { title: "Comprueba la cadena de discos", why: "Tiene que salir «backing file: alpine-base.qcow2» y, debajo, la base.", hint: ["qemu-img info --backing-chain alpine-ssh1.qcow2"], done: (l) => l.done.has("info-chain") },
      { title: "Arranca alpine-ssh1", why: "-nographic: sin pantalla, la terminal pasa a ser el puerto serie de la MV. Fíjate en cómo entras dentro del servidor.", hint: ["qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm alpine-ssh1.qcow2"], done: (l) => l.done.has("fg:alpine-ssh1.qcow2") },
      { title: "Mira los mensajes de arranque una vez", why: "En el menú del cargador, Tab y añade console=ttyS0: el kernel escribe en el puerto serie y deja de verse negro.", hint: ["Tab", " console=ttyS0"], done: (l) => l.done.has("tab-tty") },
      { title: "Sal con Ctrl+A x", why: "Ctrl+C va a la MV; Ctrl+A x mata QEMU (es un apagado duro). Ctrl+A c abre el monitor.", hint: ["Ctrl+A x"], done: (l) => l.done.has("ctrlax") },
      { title: "Arréglalo para siempre en la base", why: "Arranca la base, añade console=ttyS0 en /boot/extlinux.conf y apágala: los clones lo heredan por copy-on-write.", hint: ["qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm alpine-base.qcow2", "vi /boot/extlinux.conf", "poweroff"], done: (l) => l.done.has("tty-base") },
      { title: "Apaga una MV de forma ordenada", why: "poweroff dentro de la MV es un apagado suave: el guest cierra servicios y discos. Mira antes el prompt: localhost:~#.", hint: ["poweroff"], done: (l) => l.done.has("poweroff-vm") },
      { title: "Consola por telnet desde tu PC", why: "En segundo plano y con la consola en un puerto: hay que abrirlo en el firewall para entrar desde fuera.", hint: ["qemu-system-x86_64 -m 1G -smp 1 -nographic --enable-kvm -serial mon:telnet::5000,server=on,wait=off alpine-ssh1.qcow2 &", "firewall-cmd --add-port=5000/tcp", "exit", "telnet 10.0.16.173 5000"], done: (l) => l.done.has("telnet-pc") },
      {
        title: "Deja la MV «prueba» en KVM2",
        why: "Para el corrector: en KVM2, con 512M, 2 CPUs, el clon ssh2, -name prueba y el socket QMP. Repite allí carpetas, base, enlace y clon.",
        hint: ["ssh root@10.0.16.174", "mkdir -p /exports/VMs /home/VMs /var/run/qemu", "qemu-system-x86_64 -name prueba -qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off -nographic -m 512M -smp 2 --enable-kvm alpine-ssh2.qcow2 < /dev/null &"],
        done: (l) => hostOf(l, K2)!.vms.some((v) => v.name === "prueba" && v.mem === 512 && v.smp === 2 && !!v.qmp && baseName(v.disk) === "alpine-ssh2.qcow2" && isClone(l, K2, v.disk) && !v.stopped),
      },
    ],
  },
  {
    id: "p2",
    title: "Práctica 2",
    steps: [
      { title: "Ten listos la base y los clones", why: "Lo mismo que en la práctica 1, en KVM1: VPN, SSH, carpetas, base, enlace y alpine-ssh1/ssh2.", hint: ["vpn", "ssh root@10.0.16.173", "mkdir -p /home/VMs", "cd /home/VMs", "wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2", "qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh1.qcow2"], done: (l) => isClone(l, K1, "/home/VMs/alpine-ssh1.qcow2") },
      { title: "Red user (SLiRP)", why: "Frontend (-device) y backend (-netdev) con el mismo id. Dentro, ip addr: la MV es 10.0.2.15.", hint: ["qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm -netdev user,id=user.0 -device e1000,netdev=user.0 alpine-ssh1.qcow2", "ip addr"], done: (l) => l.done.has("ip-vm") },
      { title: "Del guest al host por 10.0.2.2", why: "La 10.0.2.2 es el host visto desde la red user. El ping no va (no hay ICMP); TCP sí.", hint: ["ping 10.0.2.2", "ssh root@10.0.2.2"], done: (l) => l.done.has("ssh-gw") },
      { title: "Abre el 8080 en el firewall", why: "Uno con --permanent para que dure tras reiniciar y otro sin él para que se aplique ya.", hint: ["firewall-cmd --add-port=8080/tcp --permanent", "firewall-cmd --add-port=8080/tcp"], done: (l) => h1(l).open.has(8080) },
      {
        title: "Servidor web con hostfwd",
        why: "hostfwd=tcp::8080-:80: lo que llega al 8080 del host va al 80 del guest. Lánzala en segundo plano para seguir usando la shell.",
        hint: ["cd /home/VMs", "wget www.ho.ac.uma.es/virt/installed-systems/alpine-webserver.qcow2", "qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm -netdev user,id=user.0,hostfwd=tcp::8080-:80 -device e1000,netdev=user.0 alpine-webserver.qcow2 < /dev/null &", "wget localhost:8080"],
        done: (l) => l.done.has("web-server"),
      },
      { title: "Entra desde tu PC", why: "Desde fuera hace falta el firewall abierto. Para que la MV sobreviva al exit, disown antes de salir.", hint: ["disown", "exit", "curl http://10.0.16.173:8080"], done: (l) => l.done.has("web-pc") },
      { title: "Crea el bridge br1", why: "Un switch virtual en el host, sin NIC real: una LAN privada (host-only) con el host en 10.0.0.1.", hint: ["nmcli connection add type bridge con-name bridge1 ifname br1 ipv4.method manual ipv4.addresses 10.0.0.1/24 ipv6.method disabled stp no autoconnect yes", "ip addr show br1"], done: (l) => h1(l).bridges.get("br1")?.ip === "10.0.0.1/24" },
      { title: "Autoriza br1 para QEMU", why: "/etc/qemu/bridge.conf es la lista de bridges que QEMU puede usar: sin «allow br1», access denied.", hint: ['echo "allow br1" >> /etc/qemu/bridge.conf'], done: (l) => h1(l).allow.has("br1") },
      {
        title: "Lanza el servidor DHCP",
        why: "Tiene IP fija (10.0.0.253) y reparte IPs en br1. Espera a que arranque antes de lanzar los clientes.",
        hint: ["wget www.ho.ac.uma.es/virt/installed-systems/alpine-dhcp.qcow2", "qemu-system-x86_64 -m 128M -smp 1 -nographic --enable-kvm -serial mon:telnet::5000,server=on,wait=off -device e1000,netdev=net0,mac=DE:AD:BE:EF:E3:19 -netdev bridge,br=br1,id=net0 alpine-dhcp.qcow2 &"],
        done: (l) => onBridge(l, "br1").some((v) => v.role === "dhcp"),
      },
      {
        title: "Lanza dos clientes",
        why: "Cada uno con su MAC, su puerto telnet y su disco. Sus IPs se las da el DHCP.",
        hint: [
          "qemu-system-x86_64 -m 256M -nographic --enable-kvm -serial mon:telnet::5001,server=on,wait=off -device e1000,netdev=n1,mac=DE:AD:BE:EF:E3:1A -netdev bridge,br=br1,id=n1 alpine-ssh1.qcow2 &",
          "qemu-system-x86_64 -m 256M -nographic --enable-kvm -serial mon:telnet::5002,server=on,wait=off -device e1000,netdev=n1,mac=DE:AD:BE:EF:E3:1B -netdev bridge,br=br1,id=n1 alpine-ssh2.qcow2 &",
        ],
        done: (l) => onBridge(l, "br1").filter((v) => v.role !== "dhcp" && v.nics.some((n) => n.br === "br1" && n.ip)).length >= 2,
      },
      { title: "Comprueba la LAN", why: "Entra en un cliente por telnet y haz ping al otro, o entra desde el host por SSH a la IP de un cliente.", hint: ["telnet localhost 5001", "ip a", "ping 10.0.0.101"], done: (l) => l.done.has("ping-lan") || l.done.has("ssh-bridge") },
      {
        title: "Deja el servidor limpio",
        why: "MVs apagadas, bridge y su dispositivo borrados y puertos cerrados: al final solo ens32 y ens33.",
        hint: ["pkill -f qemu", "nmcli connection delete bridge1", "nmcli device delete br1", "firewall-cmd --remove-port=8080/tcp", "firewall-cmd --remove-port=5000/tcp"],
        done: (l) => l.done.has("clean-con") && !h1(l).vms.length && !h1(l).bridges.size && !h1(l).open.size,
      },
    ],
  },
  {
    id: "reto",
    title: "Reto de examen",
    steps: [
      { title: "Dos LANs privadas", why: "La cadena Internet → MV1 → LAN1 → MV2 → LAN2 → MV3 necesita dos bridges, los dos autorizados.", hint: ["nmcli connection add type bridge con-name br1 ifname br1 ipv4.method disabled ipv6.method disabled stp no autoconnect yes", "nmcli connection add type bridge con-name br2 ifname br2 ipv4.method disabled ipv6.method disabled stp no autoconnect yes", 'echo "allow br1" >> /etc/qemu/bridge.conf', 'echo "allow br2" >> /etc/qemu/bridge.conf'], done: (l) => ["br1", "br2"].every((b) => h1(l).bridges.has(b) && h1(l).allow.has(b)) },
      { title: "Tres linked clones con un bucle", why: "$i da a cada MV su disco.", hint: ["cd /home/VMs", "for i in 1 2 3; do qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm$i.qcow2; done"], done: (l) => [1, 2, 3].every((i) => isClone(l, K1, `/home/VMs/vm${i}.qcow2`)) },
      {
        title: "Cablea las tres MVs",
        why: "MV1: user + br1. MV2 (el router): br1 + br2. MV3: br2. Cada NIC con su MAC y cada MV con su puerto telnet.",
        hint: [
          "qemu-system-x86_64 -name vm1 -m 256M --enable-kvm -nographic -serial mon:telnet::5001,server=on,wait=off -netdev user,id=n0 -device e1000,netdev=n0,mac=52:54:00:00:00:11 -netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:01:11 vm1.qcow2 < /dev/null &",
          "qemu-system-x86_64 -name vm2 -m 256M --enable-kvm -nographic -serial mon:telnet::5002,server=on,wait=off -netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:01:12 -netdev bridge,br=br2,id=n2 -device e1000,netdev=n2,mac=52:54:00:00:02:12 vm2.qcow2 < /dev/null &",
          "qemu-system-x86_64 -name vm3 -m 256M --enable-kvm -nographic -serial mon:telnet::5003,server=on,wait=off -netdev bridge,br=br2,id=n2 -device e1000,netdev=n2,mac=52:54:00:00:02:13 vm3.qcow2 < /dev/null &",
        ],
        done: (l) => {
          const vs = h1(l).vms;
          const has = (brs: string[]) => vs.some((v) => brs.every((b) => v.nics.some((n) => (b === "user" ? n.kind === "user" : n.br === b))) && v.nics.length === brs.length);
          return has(["user", "br1"]) && has(["br1", "br2"]) && has(["br2"]);
        },
      },
      {
        title: "Direcciones, rutas y reenvío",
        why: "LAN1 10.0.1.0/24 y LAN2 10.0.3.0/24 (no la 10.0.2.0, que es la del SLiRP). MV2 enruta: ip_forward a 1. Haz ping de MV3 a MV1.",
        hint: ["telnet localhost 5002", "ip addr add 10.0.1.2/24 dev eth0", "ip addr add 10.0.3.1/24 dev eth1", "echo 1 > /proc/sys/net/ipv4/ip_forward", "Ctrl+]", "telnet localhost 5001", "ip addr add 10.0.1.1/24 dev eth1", "ip route add 10.0.3.0/24 via 10.0.1.2", "Ctrl+]", "telnet localhost 5003", "ip addr add 10.0.3.2/24 dev eth0", "ip route add default via 10.0.3.1", "ping 10.0.1.1"],
        done: (l) => l.done.has("ping-route"),
      },
    ],
  },
];
