# Sistemas virtualizados de un vistazo

Resumen visual e interactivo del primer parcial de Arquitectura de Sistemas Virtualizados: temas 1 y 2 (hipervisores, Popek y Goldberg, CPU, RAM, discos, snapshots, clones y redes) y prácticas 1 y 2 (QEMU/KVM, qemu-img, redes user y bridge).

**Web:** https://juandiego-bmu.github.io/temario-sistemas-virtualizados/

Nueve temas con solo lo que se pregunta. La portada es la pila de la virtualización en 3D (CSS, sin WebGL). Cada tema tiene sus ideas clave (con modo repaso), una o dos figuras que se mueven, un truco para recordarlo y un verdadero o falso que guarda el progreso en el navegador. Después, «Redes de la P2, paso a paso»: un banco de pruebas con las cuatro configuraciones de red de la práctica 2 (red user, bridge privado, bridge público y VXLAN), donde sigues cada paquete salto a salto y provocas los errores típicos, más los sobres de VXLAN por dentro. Al final, el laboratorio 3D: las prácticas 1 y 2 como un videojuego (three.js), donde escribes los comandos en un terminal simulado y ves en 3D lo que hacen, con misiones guiadas; después, simulacros de la parte de conceptos del examen de laboratorio (con la página del PDF de cada respuesta), un banco de preguntas tipo test y la chuleta de comandos del laboratorio.

El simulador del laboratorio tiene su autotest, que recorre las dos prácticas y sus trampas, y el banco de los simulacros comprueba que cada pregunta está bien formada y cita páginas que existen:

```bash
node scripts/sim-check.mts
node scripts/concepts-check.mts
```

## Ejecutarla en local

Necesitas Node.js 20 o superior.

```bash
npm install
npm run dev
```

Y abre http://localhost:3000.

## Créditos

Las figuras isométricas usan el kit [anatomy](https://github.com/wheresryan22/anatomy) (licencia MIT, en `components/iso/LICENSE`). Las cifras de algunas gráficas son ilustrativas.
