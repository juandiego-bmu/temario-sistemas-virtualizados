// Self-check of the lab simulator: walks practices 1 and 2 command by command, then replays the two 2026 labs
// (with their traps) and checks their map. Run: node scripts/sim-check.mts
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { asking, cloneLab, consoles, exec, hostOf, links, newLab, prompt, real, top, ttyOf, type Fx, type Lab } from "../components/sim/model.ts";

let lab: Lab;
let now = 0;
const run = (cmd: string, wait = 0) => {
  now += wait;
  const r = exec(lab, cmd, now);
  return r.out.map((l) => l.t).join("\n");
};
const has = (out: string, s: string) => assert.ok(out.includes(s), `esperaba «${s}» en:\n${out}`);
const kvm1 = () => hostOf(lab, "10.0.16.173")!;

/* ---------------------------------------------------------------- práctica 1 */
lab = newLab();
has(run("ssh root@10.0.16.173"), "Connection timed out");
run("vpn");
run("ssh root@10.0.16.173");
assert.equal(prompt(lab), "[root@vm-16-173 ~]#");
run("mkdir -p /exports/VMs /home/VMs");
run("cd /exports/VMs");
has(run("wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2"), "saved");
run("cd /home/VMs");
has(run("ln –s /exports/VMs/alpine-base.qcow2 alpine-base.qcow2"), "is not a directory");
run("ln -s /exports/VMs/alpine-base.qcow2 alpine-base.qcow2");
has(run("ls -l"), "alpine-base.qcow2 -> /exports/VMs/alpine-base.qcow2");
run("qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh1.qcow2");
run("qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh2.qcow2");
const info = run("qemu-img info --backing-chain alpine-ssh1.qcow2");
has(info, "backing file: alpine-base.qcow2");
has(info, "image: alpine-base.qcow2");
has(info, "virtual size: 8 GiB");
has(run("qemu-system-x86_64 –nographic -m 1G -smp 1 --enable-kvm alpine-ssh1.qcow2"), "Could not open '–nographic'");

// first boot: boot menu, Tab, console=ttyS0 for this boot only
run("qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm alpine-ssh1.qcow2");
assert.equal(prompt(lab), "boot:");
run("TAB");
has(run(" console=ttyS0"), "Linux version");
assert.equal(prompt(lab), "localhost:~#");
has(run("ip a", 5000), "10.0.2.15");
has(run("ping 10.0.2.2"), "100% packet loss");
run("^Ac");
assert.equal(prompt(lab), "(qemu)");
has(run("info status"), "running");
run("^Ac");
run("poweroff");
assert.equal(top(lab).k, "server");
assert.equal(kvm1().vms.length, 0);

// fix it for good on the base: clones inherit it
run("qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm alpine-base.qcow2");
run("");
has(run("vi /boot/extlinux.conf", 5000), "APPEND");
run("!fix-ttyS0");
run("poweroff");
assert.ok(ttyOf(kvm1(), "/home/VMs/alpine-ssh2.qcow2"), "ssh2 hereda console=ttyS0 de la base");
has(run("qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm alpine-ssh2.qcow2"), "Linux version");
run("^Ax");
assert.equal(top(lab).k, "server");

// telnet console in the background, the base locked while a clone runs
has(run("qemu-system-x86_64 -m 1G -smp 1 -nographic --enable-kvm -serial mon:telnet::5000,server=on,wait=off alpine-ssh1.qcow2 &"), "[1]");
has(run("qemu-system-x86_64 -nographic -m 1G --enable-kvm alpine-base.qcow2"), 'Failed to get "write" lock');
has(run("qemu-system-x86_64 -nographic -m 1G --enable-kvm alpine-ssh1.qcow2"), 'Failed to get "write" lock');
has(run("telnet localhost 5000", 5000), "Welcome to Alpine!");
run("^]");
run("disown");
run("exit");
assert.equal(top(lab).k, "pc");
assert.equal(kvm1().vms.length, 1, "con disown la MV sobrevive al exit");
has(run("telnet 10.0.16.173 5000"), "No route to host");
run("ssh root@10.0.16.173");
has(run("firewall-cmd --add-port=5000/tcp --permanent"), "success");
assert.ok(!kvm1().open.has(5000), "--permanent no lo aplica ahora");
run("firewall-cmd --add-port=5000/tcp");
run("exit");
has(run("telnet 10.0.16.173 5000"), "Connected to 10.0.16.173");
run("^Ax");
assert.equal(kvm1().vms.length, 0);

// the grader: -name and -qmp; /var/run/qemu has to exist
run("ssh root@10.0.16.173");
run("cd /home/VMs");
const qmp = "qemu-system-x86_64 -name prueba -qmp unix:`mktemp -p /var/run/qemu --suffix=.sock`,server=on,wait=off -nographic -m 512M -smp 2 --enable-kvm alpine-ssh2.qcow2 < /dev/null &";
has(run(qmp), "mktemp: failed");
run("mkdir -p /var/run/qemu");
has(run(qmp), "[1]");
assert.ok(lab.done.has("qmp:prueba"));
has(run("pgrep -a qemu"), "-name prueba");
// in the background without < /dev/null: stopped (T)
has(run("qemu-system-x86_64 -nographic -m 256M --enable-kvm alpine-ssh1.qcow2 &"), "Stopped");
has(run("ps -o pid,stat,cmd -C qemu-system-x86_64"), "Tl");
run("kill %2");
// loops, full clones, snapshots, an extra disk
run("for i in 1 2 3; do qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm$i.qcow2; done");
assert.ok(real(kvm1(), "/home/VMs/vm3.qcow2"));
run("qemu-img convert -O qcow2 alpine-ssh1.qcow2 full.qcow2");
assert.equal(real(kvm1(), "/home/VMs/full.qcow2")?.backing, undefined);
has(run("cp vm1.qcow2 copia.qcow2"), "cp copia solo el delta");
run("qemu-img snapshot -c limpio vm1.qcow2");
has(run("qemu-img snapshot -l vm1.qcow2"), "limpio");
run("qemu-img create -f qcow2 datos.qcow2 1G");
run("qemu-system-x86_64 -nographic -m 256M --enable-kvm -drive file=vm2.qcow2,format=qcow2 -drive file=datos.qcow2,format=qcow2,if=virtio");
has(run("lsblk", 5000), "vda");
run("^Ax");
// the classic disaster
run('alias poweroff=" echo \'Acción no permitida\' "');
has(run("poweroff"), "Acción no permitida");

/* ---------------------------------------------------------------- práctica 2 */
lab = newLab();
now = 0;
run("vpn");
run("ssh root@10.0.16.173");
run("mkdir -p /home/VMs");
run("cd /home/VMs");
run("wget www.ho.ac.uma.es/virt/installed-systems/alpine-base.qcow2");
run("qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh1.qcow2");
run("qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 alpine-ssh2.qcow2");
has(run("qemu-system-x86_64 -nographic -m 1G --enable-kvm -netdev user,id=n0 -device e1000,netdev=n1 alpine-ssh1.qcow2"), "can't find value 'n1'");

// user network: 10.0.2.15, the host is 10.0.2.2 (TCP yes, ICMP no)
run("qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm -netdev user,id=user.0 -device e1000,netdev=user.0 alpine-ssh1.qcow2");
run("");
has(run("ip addr", 5000), "inet 10.0.2.15/24");
has(run("ping 10.0.2.2"), "100% packet loss");
run("ssh root@10.0.2.2");
assert.equal(prompt(lab), "[root@vm-16-173 ~]#");
run("exit");
assert.equal(prompt(lab), "localhost:~#");
run("^Ax");
has(run("ssh root@10.0.2.15"), "No route to host");

// hostfwd to the web server, from the server and from the PC
has(run("wget www.ho.ac.uma.es/virt/installed-systems/alpine-webserver.qcow2"), "linked clone");
run("qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm -netdev user,id=user.0,hostfwd=tcp::8080-:80 -device e1000,netdev=user.0 alpine-webserver.qcow2 < /dev/null &");
has(run("wget localhost:8080", 5000), "index.html");
run("exit");
assert.equal(kvm1().vms.length, 0, "sin disown, el exit mata la MV (SIGHUP)");
run("ssh root@10.0.16.173");
run("cd /home/VMs");
run("qemu-system-x86_64 -nographic -m 1G -smp 1 --enable-kvm -netdev user,id=user.0,hostfwd=tcp::8080-:80 -device e1000,netdev=user.0 alpine-webserver.qcow2 < /dev/null &");
run("disown");
run("exit");
has(run("curl http://10.0.16.173:8080", 5000), "No route to host");
run("ssh root@10.0.16.173");
run("firewall-cmd --add-port=8080/tcp");
run("exit");
has(run("curl http://10.0.16.173:8080"), "alpine-webserver");
run("ssh root@10.0.16.173");
run("pkill -f webserver");

// private bridge with a DHCP server and two clients
run("cd /home/VMs");
run("nmcli connection add type bridge con-name bridge1 ifname br1 ipv4.method manual ipv4.addresses 10.0.0.1/24 ipv6.method disabled stp no autoconnect yes");
has(run("ip addr show br1"), "NO-CARRIER");
run("wget www.ho.ac.uma.es/virt/installed-systems/alpine-dhcp.qcow2");
const dhcp = "qemu-system-x86_64 -m 128M -smp 1 -nographic --enable-kvm -serial mon:telnet::5000,server=on,wait=off -device e1000,netdev=net0,mac=DE:AD:BE:EF:E3:19 -netdev bridge,br=br1,id=net0 alpine-dhcp.qcow2 &";
has(run(dhcp), "access denied by acl file");
run('echo "allow br1" >> /etc/qemu/bridge.conf');
has(run(dhcp), "[1]");
// launched too early: no lease
run("qemu-system-x86_64 -m 256M -nographic --enable-kvm -serial mon:telnet::5001,server=on,wait=off -device e1000,netdev=n1,mac=DE:AD:BE:EF:E3:1A -netdev bridge,br=br1,id=n1 alpine-ssh1.qcow2 &");
run("disown -a");
has(run("ip addr show br1", 6000), "state UP");
run("telnet localhost 5001");
const noLease = run("ip a");
assert.ok(!noLease.includes("inet 10.0.0."), "lanzada antes de que arranque el DHCP: sin IP");
has(run("udhcpc -i eth0"), "lease of 10.0.0.");
run("^]");
// launched once the DHCP server is up: lease at boot
run("qemu-system-x86_64 -m 256M -nographic --enable-kvm -serial mon:telnet::5002,server=on,wait=off -device e1000,netdev=n1,mac=DE:AD:BE:EF:E3:1B -netdev bridge,br=br1,id=n1 alpine-ssh2.qcow2 &");
run("telnet localhost 5002", 5000);
const ipa = run("ip a");
const ip2 = /inet (10\.0\.0\.\d+)/.exec(ipa)?.[1];
assert.ok(ip2, `ssh2 debería tener IP:\n${ipa}`);
const ip1 = kvm1().vms.find((v) => v.disk.endsWith("ssh1.qcow2"))!.nics[0].ip!;
has(run(`ping ${ip1}`), "0% packet loss");
has(run("ping 10.0.0.1"), "0% packet loss");
run("^]");
has(run(`ssh root@${ip2}`), "Welcome to Alpine!");
run("exit");
has(run("telnet localhost 5000"), "Connected");
has(run("grep dhcpd /var/log/messages"), "DHCPACK");
run("^]");
// clean up
run("pkill -f qemu");
run("nmcli connection delete bridge1");
run("nmcli device delete br1");
assert.equal(kvm1().bridges.size, 0);
assert.equal(kvm1().vms.length, 0);

/* ---------------------------------------------------------------- the chain: Internet → MV1 → LAN1 → MV2 → LAN2 → MV3 */
run("nmcli connection add type bridge con-name br1 ifname br1 ipv4.method disabled ipv6.method disabled stp no autoconnect yes");
run("nmcli connection add type bridge con-name br2 ifname br2 ipv4.method disabled ipv6.method disabled stp no autoconnect yes");
run('echo "allow br2" >> /etc/qemu/bridge.conf');
run("for i in 1 2 3; do qemu-img create -F qcow2 -f qcow2 -b alpine-base.qcow2 vm$i.qcow2; done");
run("qemu-system-x86_64 -name vm1 -m 256M --enable-kvm -nographic -serial mon:telnet::5001,server=on,wait=off -netdev user,id=n0 -device e1000,netdev=n0,mac=52:54:00:00:00:11 -netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:01:11 vm1.qcow2 < /dev/null &");
run("qemu-system-x86_64 -name vm2 -m 256M --enable-kvm -nographic -serial mon:telnet::5002,server=on,wait=off -netdev bridge,br=br1,id=n1 -device e1000,netdev=n1,mac=52:54:00:00:01:12 -netdev bridge,br=br2,id=n2 -device e1000,netdev=n2,mac=52:54:00:00:02:12 vm2.qcow2 < /dev/null &");
run("qemu-system-x86_64 -name vm3 -m 256M --enable-kvm -nographic -serial mon:telnet::5003,server=on,wait=off -netdev bridge,br=br2,id=n2 -device e1000,netdev=n2,mac=52:54:00:00:02:13 vm3.qcow2 < /dev/null &");
assert.equal(kvm1().vms.length, 3);
run("telnet localhost 5001", 5000);
run("ip addr add 10.0.1.1/24 dev eth1");
run("ip route add 10.0.3.0/24 via 10.0.1.2");
run("^]");
run("telnet localhost 5002");
run("ip addr add 10.0.1.2/24 dev eth0");
run("ip addr add 10.0.3.1/24 dev eth1");
run("^]");
run("telnet localhost 5003");
run("ip addr add 10.0.3.2/24 dev eth0");
run("ip route add default via 10.0.3.1");
has(run("ping 10.0.1.1"), "100% packet loss");
run("^]");
run("telnet localhost 5002");
run("echo 1 > /proc/sys/net/ipv4/ip_forward");
run("^]");
run("telnet localhost 5003");
has(run("ping 10.0.1.1"), "0% packet loss");
assert.ok(lab.done.has("ping-route"), "el ping cruza el router");
run("^]");

/* ---------------------------------------------------------------- disaster: poweroff on the server */
has(run("poweroff"), "Has apagado el SERVIDOR");
assert.equal(top(lab).k, "pc");
has(run("ssh root@10.0.16.173"), "No route to host");

/* ---------------------------------------------------------------- the 2026 labs: replays, traps, map, planifica */
// labs.ts imports "./model" without an extension (Next style): resolve it to the .ts file for Node.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (/^\.\.?\//.test(spec) && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
const { LABS, cmdAt, finalLab, hintCmds, nicArgs, planCheck, vmAt, K1, K2 } = await import("../components/sim/labs.ts");
type Def = (typeof LABS)[number];
type C = Def["steps"][number]["cmds"][number];
const fxs: Fx[] = [];
/** Types the lines as the replay player does; returns each line's output. */
const play = (cmds: C[]) =>
  cmds.map((c) => {
    now += (c.wait ?? 0) + 300;
    const r = exec(lab, c.text, now, c.term);
    fxs.push(...r.fx);
    return r.out.map((l) => l.t).join("\n");
  });
const vmIp = (ip: string, name: string, nic = 0) => vmAt(lab, ip, name)?.nics[nic].ip;

function checkMap(def: Def) {
  const ids = new Set(def.pieces.map((p) => p.id));
  assert.equal(ids.size, def.pieces.length, `${def.id}: ids de pieza repetidos`);
  for (const p of def.pieces) {
    assert.ok(p.refs.length, `${def.id}/${p.id}: sin comandos`);
    for (const r of [...p.refs, ...(p.inner ?? [])]) assert.ok(cmdAt(def, r)?.text !== undefined, `${def.id}/${p.id}: referencia rota ${r.step}/${r.cmd}`);
    const first = cmdAt(def, p.refs[0]).text;
    const want: Record<string, RegExp> = { tower: /^ssh root@/, bridge: /type bridge/, gate: /8472\/udp --permanent/, vxlan: /type vxlan/, tunnel: /type vxlan/, vm: /^qemu-system-x86_64 /, cable: /^qemu-system-x86_64 /, user: /hostfwd=/, console: /^telnet localhost \d+$/, service: /^vi \/etc\/dhcp\/dhcpd\.conf$/, door: /\/tcp --permanent$/, exterior: /^ssh -p 2221/ };
    assert.match(first, want[p.kind], `${def.id}/${p.id}: el comando no encaja con la pieza`);
    if (p.nic !== undefined) {
      const pair = nicArgs(first, p.nic);
      assert.equal(pair.length, 2, `${def.id}/${p.id}: sin pareja -device/-netdev`);
      for (const w of p.hl ?? []) assert.ok(pair.join(" ").includes(w), `${def.id}/${p.id}: «${w}» no está en ${pair.join(" ")}`);
    }
    if (p.kind === "console") assert.deepEqual(p.refs.slice(1).map((r) => cmdAt(def, r).text), ["^]", "quit"], `${def.id}/${p.id}: salir de la consola`);
    for (const x of p.links) assert.ok(ids.has(x), `${def.id}/${p.id}: enlaza con ${x}, que no existe`);
    if (p.pair) assert.ok(ids.has(p.pair), `${def.id}/${p.id}: su otro extremo no existe`);
  }
}

/** Plays a whole lab; before each step, its traps (from that step's start state, then rewind). */
function runLab(def: Def, expect: Record<string, (out: string[]) => void>, after: Record<string, () => void>) {
  lab = def.start();
  now = 0;
  def.steps.forEach((s, i) => {
    for (const t of def.traps.filter((x) => x.at === i)) {
      const snap = cloneLab(lab);
      const out = play(t.cmds);
      expect[t.id]?.(out);
      if (t.id !== "factory") assert.ok(lab.done.has(t.flag), `${def.id}: la trampa ${t.id} no marca ${t.flag}`);
      lab = snap;
    }
    if (s.plan) lab.done.add("plan");
    const out = play(s.cmds);
    assert.ok(s.done(lab), `${def.id}: el paso ${i} (${s.id}) no queda hecho:\n${out.join("\n")}`);
    after[s.id]?.();
  });
  for (const t of def.traps) assert.ok(expect[t.id], `${def.id}: falta comprobar la trampa ${t.id}`);
}
const line = (out: string[], i: number, s: string) => has(out[i] ?? "", s);

/* -------- Tarea de clase */
const [clase, pizarra] = LABS;
checkMap(clase);
const dhcp1 = () => vmAt(lab, K1, "dhcp1")!;
runLab(
  clase,
  {
    pares: (o) => (line(o, 0, "Error: invalid property 'manual'"), line(o, 1, "Error: failed to modify ipv4.method: 'ipv4.addresses' not among"), assert.ok(!kvm1().bridges.size)),
    base: (o) => (line(o, 4, "Could not open 'alpine-base.qcow2': No such file or directory"), line(o, 7, "backing file: alpine-base.qcow2")),
    mac: (o) => line(o, 0, "qemu-system-x86_64: -device e1000,netdev=net0,mac=DE:AD:BE:EEF:E3:50: Property 'e1000.mac' doesn't take value 'DE:AD:BE:EEF:E3:50'"),
    netdev: (o) => line(o, 0, "Property 'e1000.netdev' can't find value 'kvm1-br1'"),
    telnet2: (o) => {
      line(o, 1, "Escape character is '^]'.");
      assert.equal(o[2], "", "la segunda ventana se queda congelada");
      assert.ok(fxs.some((f) => f.k === "queue" && f.on));
    },
    networking: (o) => {
      line(o, 3, " * Starting networking ...");
      assert.ok(!o[3].includes("dhcpd"), "networking no rearranca un dhcpd que había fallado");
      assert.ok(!o[12].includes("inet 10.250") && !o[13].includes("inet 10.250"), "el cliente sigue sin IP, también 3 horas después");
      line(o, 18, " * dhcpd: unknown function 'statuss'");
      line(o, 19, " * status: stopped");
      line(o, 20, "[ ok ]");
      line(o, 25, "inet 10.250.0.20/24 scope global eth0");
      has(dhcp1().log.join("\n"), "Nov  4 19:");
      assert.ok(lab.done.has("dhcpd-back"));
    },
    kvm: (o) => (line(o, 5, "(la MV todavía está arrancando…)"), line(o, 6, "Welcome to Alpine Linux 3.13"), assert.equal(prompt(lab, "kvm1"), "alpine-base login:")),
    vxlan: (o) => {
      assert.ok(!o[10].includes("inet 10.250"), "sin VXLAN no hay IP");
      assert.equal(asking(lab, now).length, 0, "con el túnel, nadie se queda pidiendo");
      assert.ok(!o[13].includes("vxlan250") && !o[14].includes("vxlan250"));
      line(o, 19, "inet 10.250.0.21/24");
    },
  },
  {
    "dhcp-ip": () => {
      assert.equal(dhcp1().svc.dhcpd, "failed");
      has(dhcp1().log.join("\n"), "No subnet declaration for eth0 (10.250.0.253).");
      has(dhcp1().log.join("\n"), "Not configured to listen on any interfaces!");
    },
    "dhcp-conf": () => assert.equal(dhcp1().svc.dhcpd, "started"),
    cliente1: () => assert.equal(vmIp(K1, "cliente1"), "10.250.0.20"),
    vxlan: () => assert.ok(fxs.some((f) => f.k === "tunnel" && f.vni === 250 && f.up)),
    cliente2: () => {
      assert.equal(vmIp(K2, "cliente2"), "10.250.0.21");
      has(dhcp1().log.join("\n"), "DHCPACK on 10.250.0.21 to de:ad:be:ef:e3:52 (test) via eth0");
      assert.ok(fxs.some((f) => f.k === "dora" && f.stage === "ack" && f.vni === 250 && f.ip === "10.250.0.21"), "DORA por el túnel");
      assert.equal(prompt(lab, "kvm2"), "[root@vm-16-174 ensayo]#");
    },
  },
);
// the replay's own output, the way the student saw it
lab = clase.start();
now = 0;
const o12 = clase.steps.flatMap((s) => play(s.cmds)).join("\n");
for (const s of ["Connection 'kvm1-br1' (", " * Starting dhcpd ...", "[ !! ]", " * ERROR: dhcpd failed to start", "inet 10.250.0.20/24 scope global eth0", "link/ether de:ad:be:ef:e3:52 brd ff:ff:ff:ff:ff:ff", "inet6 fe80::dcad:beff:feef:e352/64 scope link", "64 bytes from 10.250.0.20: seq=0 ttl=64 time=5.638 ms", "3 packets transmitted, 3 packets received, 0% packet loss", "8472/udp", "fmt=qcow2 cluster_size=65536 extended_l2=off compression_type=zlib size=8589934592 backing_file=alpine-dhcp.qcow2", "--2026-11-04 16:4"]) has(o12, s);
// a broken tunnel: KVM2 closes 8472/udp, the ping bounces off its gate
exec(lab, "firewall-cmd --remove-port=8472/udp", (now += 300), "kvm2");
exec(lab, "telnet localhost 5000", (now += 300), "kvm2");
exec(lab, "", (now += 300), "kvm2");
const bounced = exec(lab, "ping -c 3 10.250.0.20", (now += 300), "kvm2");
has(bounced.out.map((l) => l.t).join("\n"), "100% packet loss");
assert.ok(bounced.fx.some((f) => f.k === "gate" && f.blocked && f.host === K2), "el paquete rebota en el firewall de KVM2");
assert.ok(!links(lab).find((x) => x.vni === 250)!.up);
exec(lab, "^]", (now += 300), "kvm2");
exec(lab, "quit", (now += 300), "kvm2");
has(exec(lab, "nmcli connection add type vxlan slave-type bridge con-name vx9 ifname vx9 id 9 remote 10.0.16.200 master kvm2-br1", (now += 300), "kvm2").out.map((l) => l.t).join("\n"), "no es ninguna KVM");
assert.equal(links(lab).find((x) => x.vni === 9)?.why, "remote");
// the window waiting in line gets the console when the other one leaves, and what it typed arrives at once
const say1 = (term: "kvm1" | "pc", text: string) => exec(lab, text, (now += 300), term).out.map((l) => l.t).join("\n");
say1("kvm1", "telnet localhost 5001");
say1("kvm1", "");
say1("pc", `ssh root@${K1}`);
say1("pc", "telnet localhost 5001");
assert.equal(say1("pc", "ip addr"), "", "en cola: no sale nada");
assert.equal(prompt(lab, "pc"), "");
assert.deepEqual(consoles(lab).filter((x) => x.port === 5001).map((x) => `${x.term}:${x.waiting}`).sort(), ["kvm1:false", "pc:true"]);
say1("kvm1", "^]");
say1("kvm1", "quit");
const freed = say1("pc", "");
has(freed, "la consola quedó libre");
has(freed, "inet 10.250.0.253/24");
assert.equal(prompt(lab, "pc"), "alpine-dhcp:~#");
// dhcpd.conf with a missing semicolon: dhcpd -t says where, the restart fails; fixed, it starts again
say1("pc", "vi /etc/dhcp/dhcpd.conf");
assert.equal(prompt(lab, "pc"), "");
const broken = clase.steps.find((s) => s.id === "dhcp-conf")!.cmds.find((c) => c.edit)!.text;
say1("pc", `${broken.replace("10.250.0.30;", "10.250.0.30")}\n:wq`);
has(say1("pc", "dhcpd -t -cf /etc/dhcp/dhcpd.conf"), "/etc/dhcp/dhcpd.conf line 10: semicolon expected.");
has(say1("pc", "service dhcpd restart"), "[ !! ]");
assert.equal(vmAt(lab, K1, "dhcp1")!.svc.dhcpd, "failed");
say1("pc", "vi /etc/dhcp/dhcpd.conf");
say1("pc", `${broken}\n:wq`);
has(say1("pc", "service dhcpd restart"), "[ ok ]");

/* -------- Pizarra */
checkMap(pizarra);
assert.deepEqual(planCheck(pizarra.plan!, pizarra.plan!.map((c) => c.id)), [], "el orden de las tarjetas es un plan válido");
assert.ok(planCheck(pizarra.plan!, ["tiers", "bridges", "fw", "vxlan", "imgs", "dhcp", "eth1", "check"]).some((x) => x.card === "tiers" && x.dep === "dhcp"));
runLab(
  pizarra,
  {
    vni: (o) => (has(o[1], "no se activa"), assert.match(o[2], /vx252\s+\S+\s+vxlan\s+--/)),
    factory: (o) => (line(o, 6, "inet 10.0.0.253/24"), line(o, 7, "subnet 10.0.0.0 netmask 255.255.255.0 {")),
    hostfwd: (o) => line(o, 2, "Could not set up host forwarding rule 'tcp::2221-:22'"),
    eth1: (o) => (line(o, 4, "state DOWN"), line(o, 5, "ping: sendto: Network unreachable")),
    fw: (o) => (line(o, 1, "ssh: connect to host 10.0.16.173 port 2221: No route to host"), line(o, 3, "Welcome to Alpine!"), line(o, 4, "Connection to 10.0.16.173 closed.")),
  },
  {
    vxlan: () => assert.deepEqual(links(lab).filter((x) => x.up).map((x) => x.vni).sort(), [251, 252]),
    dhcp: () => (assert.equal(vmIp(K1, "dhcp-lan1"), "10.250.1.1"), assert.equal(vmIp(K1, "dhcp-lan2"), "10.250.2.1")),
    eth1: () => {
      assert.equal(vmIp(K2, "t2"), "10.250.1.101");
      assert.equal(vmIp(K1, "t2", 1), "10.250.2.102");
      for (const h of lab.hosts) for (const v of h.vms) for (const n of v.nics) if (n.br) assert.ok(n.ip?.startsWith(`10.250.${n.br.slice(-1)}.`), `${h.label} ${v.disk} ${n.br}: ${n.ip}`);
    },
    check: () => assert.ok(fxs.some((f) => f.k === "encap" && f.vni === 252 && f.ok)),
  },
);
// for good: setup-interfaces with both NICs on dhcp in T2, then the network restart asks again (same MAC, same IP)
const t2 = ["telnet localhost 5002", "", "setup-interfaces", "", "", "", "", "", "service networking restart"].map((x) => exec(lab, x, (now += 300), "kvm1").out.map((l) => l.t).join("\n"));
has(t2[2], "Available interfaces are: eth0 eth1.");
has(t2[8], "udhcpc: lease of 10.250.2.102 obtained");
has(exec(lab, "cat /etc/network/interfaces", (now += 300), "kvm1").out.map((l) => l.t).join("\n"), "iface eth1 inet dhcp");
assert.equal(vmIp(K1, "t2", 1), "10.250.2.102");

// the map's topology: every lab, replayed at once, ends complete; and played as written it makes no error (Jugar's ❌ stays 0)
for (const def of LABS) {
  lab = def.start();
  now = 0;
  for (const st of def.steps)
    for (const c of st.cmds) {
      const bad = exec(lab, c.text, (now += (c.wait ?? 0) + 300), c.term).out.filter((l) => l.c === "err" && !l.soft);
      assert.equal(bad.length, 0, `${def.id}/${st.id}: «${c.text}» cuenta como error: ${bad.map((l) => l.t).join(" | ")}`);
    }
  const end = finalLab(def);
  assert.ok(def.steps.every((s) => s.done(end.lab)), `${def.id}: el estado final no completa todos los pasos`);
  assert.ok(links(end.lab).every((x) => x.up), `${def.id}: túneles caídos al final`);
}

// Pista 3: every command of the step, in its own terminal (the symmetric ones in both)
const fwStep = clase.steps.find((s) => s.id === "fw")!;
assert.deepEqual(hintCmds(fwStep).map((c) => c.term).filter((t) => t === "kvm2").length, 3, "la VXLAN se abre también en KVM2");
assert.equal(hintCmds(pizarra.steps.find((s) => s.id === "dhcp")!).filter((c) => c.text === "setup-interfaces").length, 2, "los dos DHCP, completos");
// setup-interfaces' own proposals (255.0.0.0 and gateway 10.0.0.254) do not pass step 6
lab = clase.start();
now = 0;
const i6 = clase.steps.findIndex((s) => s.id === "dhcp-ip");
clase.steps.slice(0, i6).forEach((s) => play(s.cmds));
const o6 = play(clase.steps[i6].cmds.map((c) => (c.text === "255.255.255.0" || c.text === "none" ? { ...c, text: "" } : c))).join("\n");
assert.ok(!clase.steps[i6].done(lab), "con la máscara y el gateway que propone, el paso 6 no cuenta");
has(o6, "es la de la configuración vieja y en esta LAN no hay router");

console.log("sim-check: OK (práctica 1, práctica 2, la cadena, el apagado del servidor, la tarea de clase y la pizarra, con sus trampas y su mapa)");
