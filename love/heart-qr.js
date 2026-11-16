/*
 * Heart-shaped QR code.
 *
 * The real QR square is rotated 45° so it becomes the lower "diamond" of the
 * heart: its three finder patterns sit at the top, left and right corners and
 * the finder-less corner forms the tip. Two half-circles of decorative random
 * modules are added on the two upper edges to make the lobes. Scanners only
 * read the real square, so the decoration does not change what the code says.
 *
 * Needs vendor/qrcode.js (qrcode-generator by Kazuhiko Arase, MIT).
 */
(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeMatrix(text, ecl) {
    global.qrcode.stringToBytes = global.qrcode.stringToBytesFuncs['UTF-8'];
    const qr = global.qrcode(0, ecl || 'H');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const m = [];
    for (let r = 0; r < n; r++) {
      const row = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      m.push(row);
    }
    return m;
  }

  /**
   * Build the list of dark cells in QR grid coordinates (col u, row v).
   * Cells with u < 0 or v < 0 are decoration (the lobes).
   */
  function buildCells(text, opts) {
    opts = opts || {};
    const matrix = makeMatrix(text, opts.ecl || 'H');
    const n = matrix.length;
    const rand = mulberry32(opts.seed == null ? 7 : opts.seed);
    const density = opts.density == null ? 0.46 : opts.density;
    const gap = opts.finderGap == null ? 2 : opts.finderGap;
    const R = n / 2;
    const cells = [];

    for (let v = 0; v < n; v++)
      for (let u = 0; u < n; u++) if (matrix[v][u]) cells.push([u, v]);

    // keep-out boxes around the finder patterns that touch the lobes
    const keepOut = [
      [-gap, 7 + gap, -gap, 7 + gap], // top corner finder
      [n - 7 - gap, n + gap, -gap, 7 + gap], // right finder
      [-gap, 7 + gap, n - 7 - gap, n + gap], // left finder
    ];
    const blocked = (u, v) =>
      keepOut.some(([u0, u1, v0, v1]) => u >= u0 && u < u1 && v >= v0 && v < v1);

    const span = Math.ceil(R) + 1;
    // left lobe: half-circle on the QR's left edge (u < 0)
    for (let v = 0; v < n; v++)
      for (let u = -span; u < 0; u++) {
        const du = u + 0.5, dv = v + 0.5 - R;
        if (du * du + dv * dv <= R * R && !blocked(u, v) && rand() < density) cells.push([u, v]);
      }
    // top lobe: half-circle on the QR's top edge (v < 0)
    for (let v = -span; v < 0; v++)
      for (let u = 0; u < n; u++) {
        const du = u + 0.5 - R, dv = v + 0.5;
        if (du * du + dv * dv <= R * R && !blocked(u, v) && rand() < density) cells.push([u, v]);
      }
    return { n, cells };
  }

  // Heart extents relative to its own centre, in modules (n = QR size).
  const S = Math.SQRT1_2;
  function heartBox(n) {
    const top = -(n / 2) * S - n / 2; // lobe tops
    const bottom = n * S; // tip
    const half = (n / 2) * S + n / 2; // half width
    return { top, bottom, half, width: 2 * half, height: bottom - top };
  }

  /**
   * Draw the heart so its bounding box is `width` px wide, centred at (cx, cy).
   */
  function draw(ctx, text, cx, cy, width, opts) {
    opts = opts || {};
    const { n, cells } = buildCells(text, opts);
    const box = heartBox(n);
    const m = width / box.width; // px per module
    const midY = (box.top + box.bottom) / 2;

    ctx.save();
    ctx.translate(cx, cy - midY * m);
    ctx.rotate(Math.PI / 4);
    ctx.scale(m, m);
    ctx.translate(-n / 2, -n / 2);
    ctx.beginPath();
    const pad = 0.02; // tiny overlap, no hairline seams after rotation
    for (const [u, v] of cells) ctx.rect(u - pad, v - pad, 1 + 2 * pad, 1 + 2 * pad);
    ctx.fillStyle = opts.color || '#2f5fb3';
    ctx.fill('nonzero');
    ctx.restore();
    return { modules: n, moduleSize: m, height: box.height * m };
  }

  global.HeartQR = { buildCells, draw, heartBox };
})(window);
