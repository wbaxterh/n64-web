"use client";

import { useState, useEffect } from "react";

export function GamepadStatus() {
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      setConnected(true);
      setName(e.gamepad.id.substring(0, 30));
    };
    const onDisconnect = () => {
      setConnected(false);
      setName("");
    };

    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);

    // Check if already connected
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp && gp.buttons.length > 0) {
        setConnected(true);
        setName(gp.id.substring(0, 30));
        break;
      }
    }

    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  return (
    <div
      className={`fixed bottom-3 right-3 font-mono text-[10px] px-2.5 py-1 border z-50 ${
        connected
          ? "text-[var(--n64-green)] border-[var(--n64-green)] bg-black/70"
          : "text-white/30 border-white/10 bg-black/50"
      }`}
    >
      {connected ? `● ${name}` : "○ No Controller"}
    </div>
  );
}
