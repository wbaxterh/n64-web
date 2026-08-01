/*
 * Nyjah browser injector — M1 ("cap on the head, in the browser").
 *
 * Ports the desktop Project64 per-frame injector to n64-wasm. Each frame it
 * writes a custom baseball-cap display list into RDRAM and branches the
 * skater's head display list to it, so the cap renders in-game.
 *
 * Runs on its OWN requestAnimationFrame loop (independent of how the emulator
 * drives its frames), and locates RDRAM by scanning the WASM heap for the ROM
 * boot signature — so it works with the STOCK, unmodified emulator, no rebuild.
 *
 * Wire-up (script.js, right after Module.callMain(['custom.v64'])):
 *     if (window.NyjahInjector) window.NyjahInjector.install(Module);
 * Escape hatch: ?nonyjah in the URL, or window.NYJAH_DISABLE = true.
 */
(function () {
  'use strict';

  // --- cap geometry (identical bytes to the proven desktop injector) ---
  var VERTS = 0x80400000, SUBDL = 0x804000c0, CANARY = 0x80400110, BRANCH = 0x804000c0;
  var HEAD_START = 0x8022a2c8;   // head DL start; first opcode = G_MTX (0xDA) when skater loaded
  var HEAD_ENDDL = 0x8022a508;   // head DL terminator — we branch from here to the cap
  var CANARY_VAL = 0x0ca9ca9e;

  var capVerts = [4292870074,4292345856,0,3958107135,2228154,4292345856,0,3958107135,2228154,786432,0,3958107135,4292870074,786432,0,3958107135,4293394344,4292870144,0,3958107135,1703848,4292870144,0,3958107135,1703848,262144,0,3958107135,4293394344,262144,0,3958107135,4293001148,786432,0,3958107135,2097084,786432,0,3958107135,1966013,3014656,0,3958107135,4293132221,3014656,0,3958107135];
  var capSubDL = [16826392,2151677952,100663818,657408,100795404,788994,100926990,920580,101056520,527878,101190156,790024,101716500,1316368,3741319168,0];

  // MIPS boot code from ROM 0x1000, copied by the IPL to RDRAM 0x400.
  var BOOT_SIG = [0x3c1d803f, 0x37bdfff0, 0x3c088001, 0x25082f10, 0x3c098001, 0x25296ac0, 0x11090005];

  var M = null, dv = null, heap32 = null, base = 0, ready = false, lastOK = false;
  var frames = 0, scanCursor = 0, gaveUp = false, running = false;
  var CHUNK = 1 << 21;   // ~2M words (~8MB) scanned per frame

  function P(a)     { return base + (a & 0x1fffffff); }
  function r32(a)   { return dv.getUint32(P(a), true) >>> 0; }        // == PJ64 mem.u32[a]
  function w32(a,v) { dv.setUint32(P(a), v >>> 0, true); }

  // --- status overlay (big, top-left) + console log + window.NYJAH_STATUS ---
  var ovEl = null, ovLast = '';
  function ov(msg) {
    if (msg === ovLast) return;
    ovLast = msg; window.NYJAH_STATUS = msg;
    console.log('[NyjahInjector] ' + msg);
    try {
      if (!ovEl) {
        ovEl = document.createElement('div');
        ovEl.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;font:bold 15px/1.3 monospace;background:#000;color:#ffec3d;padding:6px 10px;border:2px solid #ffec3d;white-space:pre;pointer-events:none';
        document.body.appendChild(ovEl);
      }
      ovEl.textContent = 'NYJAH: ' + msg;
    } catch (e) {}
  }

  // Chunked, non-blocking search for g_rdram in the heap. Returns base or 0.
  function scanStep() {
    if (M && typeof M._neilGetRdramBase === 'function') {   // fast path if core rebuilt
      var b = M._neilGetRdramBase() >>> 0; if (b) return b;
    }
    if (!heap32) { heap32 = new Uint32Array(M.wasmMemory.buffer); scanCursor = 0; }
    var n = heap32.length - BOOT_SIG.length, s0 = BOOT_SIG[0] >>> 0;
    var end = Math.min(scanCursor + CHUNK, n);
    for (var i = scanCursor; i < end; i++) {
      if (heap32[i] === s0) {
        var ok = true;
        for (var k = 1; k < BOOT_SIG.length; k++) { if (heap32[i + k] !== (BOOT_SIG[k] >>> 0)) { ok = false; break; } }
        if (ok) return (i * 4 - 0x400) >>> 0;
      }
    }
    scanCursor = end; if (scanCursor >= n) scanCursor = 0;
    return 0;
  }

  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    try {
      if (!M.wasmMemory) return;                      // core not up yet
      if (!dv || dv.buffer !== M.wasmMemory.buffer) dv = new DataView(M.wasmMemory.buffer);

      if (!ready) {
        if (gaveUp) return;
        if (++frames < 30) { ov('waiting for ROM boot...'); return; }
        base = scanStep();
        if (!base) {
          ov('searching RDRAM ' + (heap32 ? Math.floor(100 * scanCursor / heap32.length) : 0) + '%');
          if (frames > 6000) { gaveUp = true; ov('RDRAM not found — idle'); }
          return;
        }
        ready = true;
      }

      var headOp = r32(HEAD_START) >>> 24;
      ov('RDRAM ok  head=0x' + headOp.toString(16) + (headOp === 0xda ? '  SKATER FOUND, cap on' : '  (waiting for skater on screen)'));
      if (headOp !== 0xda) return;                    // no skater loaded

      var survived = r32(CANARY) === CANARY_VAL;
      for (var i = 0; i < capVerts.length; i++) w32(VERTS + i * 4, capVerts[i]);
      for (var j = 0; j < capSubDL.length; j++) w32(SUBDL + j * 4, capSubDL[j]);
      w32(CANARY, CANARY_VAL);
      if (survived || lastOK) { w32(HEAD_ENDDL, 0xde010000); w32(HEAD_ENDDL + 4, BRANCH >>> 0); }
      else { w32(HEAD_ENDDL, 0xdf000000); w32(HEAD_ENDDL + 4, 0); }
      lastOK = survived;
    } catch (e) { /* never let injection break the page */ }
  }

  function install(Module) {
    try {
      if (window.NYJAH_DISABLE || /[?&]nonyjah\b/.test(location.search)) {
        console.log('[NyjahInjector] disabled via flag — stock emulator.'); return;
      }
      M = Module;
      running = true;
      requestAnimationFrame(tick);
      ov('installed — locating RDRAM...');
    } catch (e) { console.error('[NyjahInjector] install failed:', e); }
  }

  window.NyjahInjector = { install: install };
  console.log('[NyjahInjector] script loaded.');
})();
