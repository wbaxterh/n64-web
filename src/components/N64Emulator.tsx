"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface N64EmulatorProps {
  className?: string;
  onFpsUpdate?: (fps: number, gameFps: number) => void;
  onStateChange?: (state: EmulatorState) => void;
}

export type EmulatorState = "idle" | "loading" | "running" | "paused";

declare global {
  interface Window {
    Module: Record<string, unknown>;
    myApp: Record<string, unknown>;
    callMain: (args: string[]) => void;
  }
}

export function N64Emulator({
  className,
  onFpsUpdate,
  onStateChange,
}: N64EmulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<EmulatorState>("idle");
  const [romName, setRomName] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  const scriptLoadedRef = useRef(false);

  const updateState = useCallback(
    (newState: EmulatorState) => {
      setState(newState);
      onStateChange?.(newState);
    },
    [onStateChange]
  );

  // Load the emscripten module
  const loadWasmModule = useCallback(() => {
    if (scriptLoadedRef.current) return;
    scriptLoadedRef.current = true;

    const script = document.createElement("script");
    script.src = "/n64/n64wasm.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Handle ROM file
  const loadRom = useCallback(
    async (file: File) => {
      updateState("loading");
      setRomName(file.name);

      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);

      // Ensure WASM module is loaded
      loadWasmModule();

      // Wait for Module to be available, then write ROM and start
      const waitForModule = setInterval(() => {
        if (window.Module && typeof window.Module.FS_createDataFile === "function") {
          clearInterval(waitForModule);

          try {
            // Write ROM to virtual filesystem
            (window.Module as Record<string, Function>).FS_createDataFile(
              "/",
              file.name,
              data,
              true,
              true
            );

            // Set canvas
            (window.Module as Record<string, HTMLCanvasElement | null>).canvas =
              canvasRef.current;

            // Start emulator
            if (typeof window.callMain === "function") {
              window.callMain([file.name]);
            }

            updateState("running");
          } catch (err) {
            console.error("Failed to load ROM:", err);
            updateState("idle");
          }
        }
      }, 100);

      // Timeout after 15s
      setTimeout(() => clearInterval(waitForModule), 15000);
    },
    [loadWasmModule, updateState]
  );

  // Drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && /\.(z64|n64|v64|rom)$/i.test(file.name)) {
        loadRom(file);
      }
    },
    [loadRom]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadRom(file);
    },
    [loadRom]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        canvasRef.current?.requestFullscreen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className={className}>
      {/* ROM Drop Zone (shown when idle) */}
      {state === "idle" && (
        <div
          className={`n64-dropzone ${dragOver ? "n64-dropzone--active" : ""}`}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="n64-dropzone__icon">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="n64-dropzone__text">Load ROM</div>
          <div className="n64-dropzone__hint">
            Drop a .z64 / .n64 file or click to browse
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".z64,.n64,.v64,.rom"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Loading state */}
      {state === "loading" && (
        <div className="n64-loading">
          <div className="n64-loading__text">Loading {romName}...</div>
          <div className="n64-loading__bar">
            <div className="n64-loading__bar-fill" />
          </div>
        </div>
      )}

      {/* Canvas (always rendered, hidden when idle) */}
      <div
        className={`n64-canvas-wrapper ${state === "running" ? "n64-canvas-wrapper--visible" : ""}`}
      >
        <canvas
          ref={canvasRef}
          id="canvas"
          width={640}
          height={480}
        />
      </div>

      {/* Game info bar */}
      {state === "running" && romName && (
        <div className="n64-info-bar">
          <span className="n64-info-bar__rom">{romName}</span>
          <div className="n64-info-bar__actions">
            <button
              onClick={() => canvasRef.current?.requestFullscreen()}
              className="n64-info-btn"
              title="Fullscreen (F11)"
            >
              Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
