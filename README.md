# Sistemas virtualizados de un vistazo

Resumen visual e interactivo del primer parcial de Arquitectura de Sistemas Virtualizados: temas 1 y 2 (hipervisores, Popek y Goldberg, CPU, RAM, discos, snapshots, clones y redes) y prácticas 1 y 2 (QEMU/KVM, qemu-img, redes user y bridge).

**Web:** https://juandiego-bmu.github.io/temario-sistemas-virtualizados/

Incluye figuras isométricas que se mueven (tipos de hipervisor, datastore thin/thick, cadena de snapshots copy-on-write, full vs linked clones), diagramas interactivos paso a paso, un constructor de comandos QEMU, un generador de topologías, retos de laboratorio, un banco de preguntas tipo test y flashcards.

## Ejecutarla en local

Necesitas Node.js 20 o superior.

```bash
npm install
npm run dev
```

Y abre http://localhost:3000.

## Créditos

Las figuras isométricas usan el kit [anatomy](https://github.com/wheresryan22/anatomy) (licencia MIT, en `components/iso/LICENSE`). Las cifras de algunas gráficas son ilustrativas.
