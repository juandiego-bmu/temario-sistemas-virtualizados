import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "../components/iso/iso.css";
import "./globals.css";
import "./asv.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Sistemas Virtualizados de un vistazo",
  description: "Resumen visual e interactivo del primer parcial de Arquitectura de Sistemas Virtualizados: hipervisores, Popek y Goldberg, CPU, RAM, discos, snapshots, redes y prácticas con QEMU/KVM.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="iso" data-theme="dark" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
