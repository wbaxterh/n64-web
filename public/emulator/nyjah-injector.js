/*
 * Nyjah browser injector — M1 ("cap on the head, in the browser").
 *
 * Ports the desktop Project64 per-frame injector (nyjah_cap.js) to n64-wasm.
 * It writes a custom baseball-cap display list into RDRAM each frame and
 * branches the skater's head display list to it, so the cap renders in-game.
 *
 * Requires n64-wasm rebuilt with the exported `_neilGetRdramBase` accessor.
 * If that export is missing it falls back to locating RDRAM by heap scan.
 *
 * Wire-up (in script.js, right after `Module.callMain(['custom.v64'])`):
 *     if (window.NyjahInjector) window.NyjahInjector.install(Module);
 */
(function () {
  'use strict';

  // --- cap geometry (identical bytes to the proven desktop injector) ---
  var VERTS = 0x80400000, SUBDL = 0x804000c0, CANARY = 0x80400110, BRANCH = 0x804000c0;
  var HEAD_START = 0x8022a2c8;   // head DL start — first opcode is G_MTX (0xDA) when THPS skater is loaded
  var HEAD_ENDDL = 0x8022a508;   // head DL terminator — we branch from here to the cap
  var CANARY_VAL = 0x0ca9ca9e;

  var capVerts = [4292870074,4292345856,0,3958107135,2228154,4292345856,0,3958107135,2228154,786432,0,3958107135,4292870074,786432,0,3958107135,4293394344,4292870144,0,3958107135,1703848,4292870144,0,3958107135,1703848,262144,0,3958107135,4293394344,262144,0,3958107135,4293001148,786432,0,3958107135,2097084,786432,0,3958107135,1966013,3014656,0,3958107135,4293132221,3014656,0,3958107135];
  var capSubDL = [16826392,2151677952,100663818,657408,100795404,788994,100926990,920580,101056520,527878,101190156,790024,101716500,1316368,3741319168,0];

  var dv = null, heap32 = null, base = 0, ready = false, lastOK = false, warned = false;

  // MIPS boot code from ROM 0x1000, which the IPL copies to RDRAM 0x400.
  // Distinctive enough to locate g_rdram in the 512MB WASM heap. Value-correct
  // big-endian words, i.e. what Uint32Array reads directly.
  var BOOT_SIG = [0x3c1d803f, 0x37bdfff0, 0x3c088001, 0x25082f10, 0x3c098001, 0x25296ac0, 0x11090005];

  // N64 KSEG0 vaddr -> heap byte offset. RDRAM is 8MB; strip the segment bits.
  function P(vaddr) { return base + (vaddr & 0x1fffffff); }
  // 32-bit aligned: g_rdram stores value-correct big-endian words, JS is LE,
  // so getUint32(off, /*littleEndian=*/true) returns exactly PJ64's mem.u32[].
  function r32(a) { return dv.getUint32(P(a), true) >>> 0; }
  function w32(a, v) { dv.setUint32(P(a), v >>> 0, true); }

  // Scanning the full 512MB heap in one frame freezes the tab, so the boot-
  // signature search runs in bounded CHUNKS across frames — a few ms each.
  var frames = 0, scanCursor = 0, gaveUp = false;
  var CHUNK = 1 << 21;   // ~2M words (~8MB) per frame

  // One chunked scan step. Returns the RDRAM base if found this step, else 0.
  function scanStep(Module) {
    if (typeof Module._neilGetRdramBase === 'function') {   // fast path if rebuilt
      var b = Module._neilGetRdramBase() >>> 0;
      if (b) return b;
    }
    if (!heap32) { heap32 = new Uint32Array(Module.wasmMemory.buffer); scanCursor = 0; }
    var n = heap32.length - BOOT_SIG.length;
    var s0 = BOOT_SIG[0] >>> 0;
    var end = Math.min(scanCursor + CHUNK, n);
    for (var i = scanCursor; i < end; i++) {
      if (heap32[i] === s0) {
        var ok = true;
        for (var k = 1; k < BOOT_SIG.length; k++) {
          if (heap32[i + k] !== (BOOT_SIG[k] >>> 0)) { ok = false; break; }
        }
        if (ok) return (i * 4 - 0x400) >>> 0;   // boot sig sits at RDRAM 0x400
      }
    }
    scanCursor = end;
    if (scanCursor >= n) { scanCursor = 0; }     // wrap (ROM may not be in RAM yet)
    return 0;
  }

  // On-screen status overlay (big + high-contrast) + console log on change,
  // so status is readable both on screen and via F12.
  var ovEl = null, ovLast = '';
  function ov(msg) {
    if (msg === ovLast) return;              // only update/log on change
    ovLast = msg;
    window.NYJAH_STATUS = msg;
    console.log('[NyjahInjector] ' + msg);
    if (!ovEl) {
      ovEl = document.createElement('div');
      ovEl.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;' +
        'font:bold 16px/1.3 monospace;background:#000;color:#ffec3d;' +
        'padding:6px 10px;border:2px solid #ffec3d;white-space:pre;pointer-events:none';
      document.body.appendChild(ovEl);
    }
    ovEl.textContent = 'NYJAH: ' + msg;
  }

  function apply(Module) {
    // Lazily locate RDRAM once the ROM has booted (chunked, non-blocking).
    if (!ready) {
      if (gaveUp) return;
      if (++frames < 30) { ov('waiting for ROM boot...'); return; }
      base = scanStep(Module);                    // bounded work this frame
      if (!base) {
        var pct = heap32 ? Math.floor(100 * scanCursor / heap32.length) : 0;
        ov('searching RDRAM ' + pct + '%');
        if (frames > 3000) { gaveUp = true; ov('RDRAM not found — idle'); console.warn('[NyjahInjector] RDRAM not found — idle.'); }
        return;
      }
      console.log('[NyjahInjector] RDRAM located at heap offset 0x' + base.toString(16));
      ready = true;
    }
    // Show the opcode byte at the head-DL address so we can tell when the
    // skater is loaded (should read DA = G_MTX). 0x8022a2c8 is desktop-derived.
    var headOp = r32(HEAD_START) >>> 24;
    ov('RDRAM ok  head=0x' + headOp.toString(16) + (headOp === 0xda ? '  SKATER-DL FOUND, cap injecting' : '  (waiting for skater on screen)'));
    // Only act when THPS's skater is present: head DL starts with G_MTX (0xDA).
    if (headOp !== 0xda) return;

    var survived = r32(CANARY) === CANARY_VAL;

    // (re)author the cap verts + sub-display-list into free scratch RAM
    for (var i = 0; i < capVerts.length; i++) w32(VERTS + i * 4, capVerts[i]);
    for (var j = 0; j < capSubDL.length; j++) w32(SUBDL + j * 4, capSubDL[j]);
    w32(CANARY, CANARY_VAL);

    // branch the head DL to the cap only if our scratch region is intact
    // (canary guard); otherwise render the skater normally — never crash.
    if (survived || lastOK) {
      w32(HEAD_ENDDL, 0xde010000);       // G_DL (branch, no push)
      w32(HEAD_ENDDL + 4, BRANCH >>> 0);
    } else {
      w32(HEAD_ENDDL, 0xdf000000);       // G_ENDDL (safe)
      w32(HEAD_ENDDL + 4, 0);
    }
    lastOK = survived;
  }

  function install(Module) {
    try {
      // Escape hatch: set window.NYJAH_DISABLE = true (or ?nonyjah in the URL)
      // to run the stock emulator untouched, for isolating issues.
      if (window.NYJAH_DISABLE || /[?&]nonyjah\b/.test(location.search)) {
        console.log('[NyjahInjector] disabled via flag — stock emulator.');
        return;
      }
      dv = new DataView(Module.wasmMemory.buffer);
      // Hook the frame pump: wrap _runMainLoop so we run after every emulated
      // frame. RDRAM is located lazily inside apply() once the ROM has booted.
      var orig = Module._runMainLoop;
      Module._runMainLoop = function () {
        var res = orig.apply(this, arguments);
        try { apply(Module); } catch (e) { /* never let injection break the frame */ }
        return res;
      };
      console.log('[NyjahInjector] installed — locating RDRAM once the ROM boots...');
    } catch (e) {
      console.error('[NyjahInjector] install failed:', e);
    }
  }

  window.NyjahInjector = { install: install, apply: apply };
})();
