'use strict';
// strokeToSVG.js — deterministic port of art.vaked.dev redraw() for on-chain minting.
// The SVG body produced here is passed to PaintingsForSecrets.mint() as the
// on-chain artwork. Spray is rendered with a seeded PRNG so every render is
// identical. Mirrors canvas 600x500, background #0a0410.

function fmt(n) {
  return Number(n.toFixed(2));
}

function hashSeed(a, b, c) {
  return ((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sprayDots(x, y, size, color, strokeIndex) {
  const rnd = mulberry32(hashSeed(Math.round(x * 1000), Math.round(y * 1000), strokeIndex + 1));
  const n = Math.max(1, Math.floor(size * 3));
  let out = '';
  for (let i = 0; i < n; i++) {
    const sx = x + (rnd() - 0.5) * size * 4;
    const sy = y + (rnd() - 0.5) * size * 4;
    const rr = rnd() * 2;
    const alpha = 0.3 + rnd() * 0.4;
    out += '<circle cx="' + fmt(sx) + '" cy="' + fmt(sy) + '" r="' + fmt(rr) +
      '" fill="' + color + '" fill-opacity="' + alpha.toFixed(2) + '"/>';
  }
  return out;
}

function strokeToSVGBody(strokes, opts) {
  opts = opts || {};
  const bg = opts.background || '#0a0410';
  let parts = [];
  strokes.forEach(function (stroke, si) {
    if (!stroke || stroke.length === 0) return;
    const p0 = stroke[0];
    const tool = p0.tool || 'brush';
    const color = tool === 'eraser' ? bg : (p0.color || '#ff69b4');
    if (tool === 'spray') {
      for (let i = 0; i < stroke.length; i++) {
        const pt = stroke[i];
        parts.push(sprayDots(pt.x, pt.y, pt.size || p0.size, pt.tool === 'eraser' ? bg : (pt.color || color), si));
      }
      return;
    }
    if (stroke.length === 1) {
      const r = Math.max(0.5, p0.size / 2);
      parts.push('<circle cx="' + fmt(p0.x) + '" cy="' + fmt(p0.y) + '" r="' + fmt(r) + '" fill="' + color + '"/>');
      return;
    }
    let d = 'M ' + fmt(p0.x) + ' ' + fmt(p0.y);
    for (let i = 1; i < stroke.length; i++) d += ' L ' + fmt(stroke[i].x) + ' ' + fmt(stroke[i].y);
    parts.push('<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + fmt(p0.size) +
      '" stroke-linecap="round" stroke-linejoin="round"/>');
  });
  return parts.join('');
}

function strokeToSVG(strokes, opts) {
  opts = opts || {};
  const W = opts.width || 600;
  const H = opts.height || 500;
  const bg = opts.background || '#0a0410';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + bg + '"/>' +
    strokeToSVGBody(strokes, opts) +
    '</svg>';
}

function mintPayload(strokes, title, secret) {
  return {
    svgBody: strokeToSVGBody(strokes),
    strokes: JSON.stringify(strokes),
    title: title || 'Untitled',
    secret: secret || 'a secret untold'
  };
}

if (typeof window !== 'undefined') {
  window.strokeToSVG = strokeToSVG;
  window.strokeToSVGBody = strokeToSVGBody;
  window.mintPayload = mintPayload;
}

export { strokeToSVG, strokeToSVGBody, mintPayload };
