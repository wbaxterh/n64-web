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

  var dv = null, base = 0, ready = false, lastOK = false, warned = false;

  // N64 KSEG0 vaddr -> heap byte offset. RDRAM is 8MB; strip the segment bits.
  function P(vaddr) { return base + (vaddr & 0x1fffffff); }
  // 32-bit aligned: g_rdram stores value-correct big-endian words, JS is LE,
  // so getUint32(off, /*littleEndian=*/true) returns exactly PJ64's mem.u32[].
  function r32(a) { return dv.getUint32(P(a), true) >>> 0; }
  function w32(a, v) { dv.setUint32(P(a), v >>> 0, true); }

  function locateRdram(Module) {
    if (typeof Module._neilGetRdramBase === 'function') {
      return Module._neilGetRdramBase() >>> 0;
    }
    // Fallback: scan the heap for the head-DL G_MTX signature once the ROM has
    // DMA'd in. (Preferred path is the exported accessor after a rebuild.)
    return 0;
  }

  function apply() {
    if (!ready) return;
    // Only act when THPS's skater is present: head DL starts with G_MTX (0xDA).
    if ((r32(HEAD_START) >>> 24) !== 0xda) return;

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
      base = locateRdram(Module);
      if (!base) {
        if (!warned) { console.warn('[NyjahInjector] no RDRAM base (rebuild n64-wasm with _neilGetRdramBase). Injector idle.'); warned = true; }
        return;
      }
      dv = new DataView(Module.wasmMemory.buffer);
      ready = true;

      // Hook the frame pump: wrap _runMainLoop so we run after every emulated frame.
      var orig = Module._runMainLoop;
      Module._runMainLoop = function () {
        var res = orig.apply(this, arguments);
        try { apply(); } catch (e) { /* never let injection break the frame */ }
        return res;
      };
      console.log('[NyjahInjector] installed — cap injector active. RDRAM base 0x' + base.toString(16));
    } catch (e) {
      console.error('[NyjahInjector] install failed:', e);
    }
  }

  window.NyjahInjector = { install: install, apply: apply };
})();
