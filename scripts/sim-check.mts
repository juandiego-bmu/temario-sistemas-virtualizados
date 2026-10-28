// Self-check of the lab simulator: walks practices 1 and 2 command by command. Run: node scripts/sim-check.ts
import assert from "node:assert/strict";
import { exec, hostOf, newLab, prompt, real, top, ttyOf, type Lab } from "../components/sim/model.ts";

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

console.log("sim-check: OK (práctica 1, práctica 2, la cadena y el apagado del servidor)");
