# Sistemas virtualizados de un vistazo

Resumen visual e interactivo del primer parcial de Arquitectura de Sistemas Virtualizados: temas 1, 2 y 3 (hipervisores, Popek y Goldberg, CPU, RAM, discos, snapshots, clones, redes y virtualización en Intel x86 con VT-x) y prácticas 1 y 2 (QEMU/KVM, qemu-img, redes user y bridge).

**Web:** https://juandiego-bmu.github.io/temario-sistemas-virtualizados/

Diez temas con solo lo que se pregunta. La portada es la pila de la virtualización en 3D (CSS, sin WebGL). Cada tema tiene sus ideas clave (con modo repaso), una o dos figuras que se mueven, un truco para recordarlo y un verdadero o falso que guarda el progreso en el navegador. Después, «Redes de la P2, paso a paso»: un banco de pruebas con las cuatro configuraciones de red de la práctica 2 (red user, bridge privado, bridge público y VXLAN), donde sigues cada paquete salto a salto y provocas los errores típicos, más los sobres de VXLAN por dentro. Al final, el laboratorio 3D: las prácticas 1 y 2 como un videojuego (three.js), donde escribes los comandos en un terminal simulado y ves en 3D lo que hacen, con misiones guiadas, y dos ejercicios de examen entre KVM1 y KVM2 unidos por VXLAN (la tarea de clase y la pizarra de tiers), que puedes ver resueltos, jugar con pistas o recorrer como un mapa con el comando de cada pieza; después, para el test de teoría, un entrenador de snapshots (el ejercicio del campus y otros aleatorios como él: cuántos accesos al disco real cuesta leer o escribir un bloque, con el recorrido paso a paso) y un banco de preguntas tipo test de una respuesta, de varias y de respuesta corta; al final, simulacros de la parte de conceptos del examen de laboratorio (con la página del PDF de cada respuesta) y la chuleta de comandos del laboratorio.

El simulador del laboratorio tiene su autotest, que recorre las dos prácticas, la tarea de clase y la pizarra, con sus trampas; el banco de los simulacros comprueba que cada pregunta está bien formada y cita páginas que existen, y el de snapshots, que el ejercicio del profesor da 4, 2, 3, 2, 2, 4, 5, 2 y 3 y que el banco de test corrige bien los tres tipos de pregunta:

```bash
node scripts/sim-check.mts
node scripts/concepts-check.mts
node scripts/snap-check.mts
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
