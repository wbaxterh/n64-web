"use client";

import { useEffect, useRef, useState } from "react";
import { GamepadStatus } from "@/components/GamepadStatus";

export default function PlayPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Screen wake lock to prevent dimming during gameplay
    let wakeLock: WakeLockSentinel | null = null;
    (async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {}
    })();
    return () => { wakeLock?.release(); };
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="text-center py-4 border-b-2 border-[var(--n64-green)] bg-gradient-to-b from-[#0a0a14] to-[#0d0d1a] shrink-0">
        <h1
          className="text-xl md:text-2xl m-0 mb-1 tracking-wider"
          style={{
            fontFamily: "'Press Start 2P', monospace",
            color: "var(--n64-green)",
            textShadow: "0 0 20px rgba(0,255,65,0.4), 0 0 60px rgba(0,255,65,0.1)",
          }}
        >
          N64.wasm
        </h1>
        <p
          className="text-[9px] tracking-[4px] uppercase opacity-70"
          style={{ fontFamily: "'Orbitron', sans-serif", color: "var(--n64-yellow)" }}
        >
          SIMD-Powered Browser Emulator
        </p>
      </header>

      {/* Emulator */}
      <main className="flex-1 relative">
        <iframe
          ref={iframeRef}
          src="/emulator/index.html"
          className="w-full h-full absolute inset-0 border-none"
          onLoad={() => setLoaded(true)}
          allow="gamepad; autoplay; fullscreen"
        />
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="text-sm tracking-widest uppercase animate-pulse"
              style={{ fontFamily: "'Orbitron', sans-serif", color: "var(--n64-green)" }}
            >
              Initializing...
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-3 border-t border-[var(--n64-border)] text-[11px] shrink-0 bg-[var(--n64-bg)]">
        <a href="https://github.com/wbaxterh/n64-wasm" target="_blank" className="text-white/30 hover:text-[var(--n64-green)] no-underline transition-colors">N64.wasm</a>
        <span className="text-white/20 mx-2">&middot;</span>
        <a href="https://thetrickbook.com" target="_blank" className="text-white/30 hover:text-[var(--n64-green)] no-underline transition-colors">A TrickBook Project</a>
        <span className="text-white/20 mx-2">&middot;</span>
        <a href="https://n64.weshuber.com" target="_blank" className="text-white/30 hover:text-[var(--n64-green)] no-underline transition-colors">Docs</a>
      </footer>

      <GamepadStatus />
    </div>
  );
}
