"use client";

import dynamic from "next/dynamic";
import { GamepadStatus } from "@/components/GamepadStatus";

const N64Emulator = dynamic(
  () => import("@/components/N64Emulator").then((m) => m.N64Emulator),
  { ssr: false }
);

export default function PlayPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="text-center py-5 border-b-2 border-[var(--n64-green)] bg-gradient-to-b from-[#0a0a14] to-[#0d0d1a]">
        <h1
          className="text-2xl md:text-3xl m-0 mb-1 tracking-wider"
          style={{
            fontFamily: "'Press Start 2P', monospace",
            color: "var(--n64-green)",
            textShadow:
              "0 0 20px rgba(0,255,65,0.4), 0 0 60px rgba(0,255,65,0.1)",
          }}
        >
          N64.wasm
        </h1>
        <p
          className="text-[10px] tracking-[4px] uppercase opacity-70"
          style={{
            fontFamily: "'Orbitron', sans-serif",
            color: "var(--n64-yellow)",
          }}
        >
          SIMD-Powered Browser Emulator
        </p>
      </header>

      {/* Emulator */}
      <main className="flex-1 flex flex-col justify-center py-8 px-4">
        <N64Emulator className="w-full max-w-[960px] mx-auto" />
      </main>

      {/* Controls reference */}
      <div className="max-w-[960px] mx-auto w-full px-4 pb-2">
        <details className="text-[11px] text-white/30">
          <summary className="cursor-pointer hover:text-[var(--n64-green)] transition-colors">
            Keyboard Controls
          </summary>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-1 mt-2 mb-4 text-[10px]">
            <span>
              <b className="text-[var(--n64-green)]">Arrow Keys</b> — Analog
            </span>
            <span>
              <b className="text-[var(--n64-green)]">D</b> — A Button
            </span>
            <span>
              <b className="text-[var(--n64-green)]">S</b> — B Button
            </span>
            <span>
              <b className="text-[var(--n64-green)]">A</b> — Z Trigger
            </span>
            <span>
              <b className="text-[var(--n64-green)]">Q / E</b> — L / R
            </span>
            <span>
              <b className="text-[var(--n64-green)]">I/K/J/L</b> — C Buttons
            </span>
            <span>
              <b className="text-[var(--n64-green)]">Enter</b> — Start
            </span>
            <span>
              <b className="text-[var(--n64-green)]">F11</b> — Fullscreen
            </span>
          </div>
        </details>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 border-t border-[var(--n64-border)] text-[11px]">
        <a
          href="https://github.com/wbaxterh/n64-wasm"
          target="_blank"
          className="text-white/30 hover:text-[var(--n64-green)] no-underline transition-colors"
        >
          N64.wasm
        </a>
        <span className="text-white/20 mx-2">&middot;</span>
        <a
          href="https://thetrickbook.com"
          target="_blank"
          className="text-white/30 hover:text-[var(--n64-green)] no-underline transition-colors"
        >
          A TrickBook Project
        </a>
        <span className="text-white/20 mx-2">&middot;</span>
        <a
          href="https://n64.weshuber.com"
          target="_blank"
          className="text-white/30 hover:text-[var(--n64-green)] no-underline transition-colors"
        >
          Docs
        </a>
      </footer>

      {/* Gamepad indicator */}
      <GamepadStatus />

      {/* Legal */}
      <div className="text-center text-[9px] text-white/15 pb-3">
        Users provide their own legally obtained ROM files. We do not host or
        distribute game ROMs.
      </div>
    </div>
  );
}
