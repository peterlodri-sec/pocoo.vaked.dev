/* pocoo.vaked.dev — constellation background animation
   [designer studio vibe ↔ space+time]
   A starfield drift with a left/right asymmetry: the LEFT half breathes a
   quiet constellation; the RIGHT hemisphere visualizes the FLEET as a
   living wave — each agent a pulse that travels through the mesh. The
   wave's crest carries the constellation's ternary colors (teal/violet). */
(function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  var cv = document.createElement("canvas");
  cv.id = "constellation-bg";
  document.body.insertBefore(cv, document.body.firstChild);
  var ctx = cv.getContext("2d");
  var W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);

  function size() {
    W = cv.width = Math.floor(innerWidth * dpr);
    H = cv.height = Math.floor(innerHeight * dpr);
    cv.style.width = innerWidth + "px";
    cv.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener("resize", size);

  /* ── starfield (both halves) ── */
  var STARS = [];
  for (var i = 0; i < 140; i++) {
    STARS.push({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.1 + 0.2,
      p: Math.random() * Math.PI * 2,
      v: 0.1 + Math.random() * 0.4,
    });
  }

  /* ── the fleet, as a wave ── the right-hemisphere visualization.
     Each entry: name, hue family (0=teal, 1=violet, 2=dim), amplitude. */
  var FLEET = [
    { n: "music", c: 0, a: 1.0 }, { n: "mlxquant", c: 1, a: 0.9 },
    { n: "art", c: 1, a: 0.7 }, { n: "pocoo", c: 2, a: 0.6 },
    { n: "water", c: 0, a: 0.8 }, { n: "ayeos", c: 0, a: 0.9 },
    { n: "kernel8", c: 2, a: 0.5 }, { n: "vaked", c: 1, a: 0.7 },
    { n: "hf-mac", c: 0, a: 0.6 }, { n: "hermes", c: 1, a: 1.0 },
    { n: "openclaw", c: 1, a: 0.8 }, { n: "quant-prox", c: 0, a: 0.7 },
    { n: "entheai", c: 0, a: 0.9 }, { n: "headroom", c: 2, a: 0.5 },
    { n: "ravynos", c: 2, a: 0.4 }, { n: "blackhole", c: 1, a: 0.6 },
  ];
  var COLORS = ["62,230,201", "180,139,255", "125,143,150"];

  /* base wave geometry: each fleet member sits on a vertical line in the
     right hemisphere, its wave height = amplitude * envelope(t, phase). */
  var t0 = performance.now();

  function frame(now) {
    var t = (now - t0) / 1000;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    /* starfield drift */
    for (var s = 0; s < STARS.length; s++) {
      var st = STARS[s];
      st.y -= st.v * 0.001;
      if (st.y < -0.02) { st.y = 1.02; st.x = Math.random(); }
      var tw = 0.5 + 0.5 * Math.sin(t * 1.5 + st.p);
      ctx.fillStyle = "rgba(200,214,229," + (0.16 + 0.3 * tw) + ")";
      ctx.beginPath();
      ctx.arc(st.x * innerWidth, st.y * innerHeight, st.r, 0, 6.2832);
      ctx.fill();
    }

    /* left hemisphere: quiet constellation breathing ring (the "space") */
    var cx = innerWidth * 0.26, cy = innerHeight * 0.5;
    var baseR = Math.min(innerWidth, innerHeight) * 0.16;
    var breath = 1 + 0.05 * Math.sin(t * 0.5);
    ctx.strokeStyle = "rgba(62,230,201,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * breath, 0, 6.2832);
    ctx.stroke();
    ctx.strokeStyle = "rgba(62,230,201,0.06)";
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.62 * breath, 0, 6.2832);
    ctx.stroke();

    /* right hemisphere: the FLEET WAVE — each agent pulses along a sine,
       traveling through the mesh. The envelope is time (the "time" axis). */
    var fx0 = innerWidth * 0.55;                 // wave start (right half)
    var fx1 = innerWidth * 0.97;                 // wave end
    var midY = innerHeight * 0.5;
    var ampMax = innerHeight * 0.30;
    var lane = (fx1 - fx0) / (FLEET.length - 1);

    for (var f = 0; f < FLEET.length; f++) {
      var ft = FLEET[f];
      var x = fx0 + f * lane;
      var phase = t * 0.9 + f * 0.55;            // traveling wave
      var y = midY + Math.sin(phase) * ampMax * ft.a * 0.5;
      var pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + f * 1.1);
      var col = COLORS[ft.c];
      var glow = 0.35 + 0.45 * pulse;

      /* the wave crest connector */
      ctx.strokeStyle = "rgba(" + col + "," + (0.10 + 0.12 * pulse) + ")";
      ctx.lineWidth = 1;
      if (f > 0) {
        var px = fx0 + (f - 1) * lane;
        var py = midY + Math.sin(t * 0.9 + (f - 1) * 0.55) * ampMax * FLEET[f - 1].a * 0.5;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      /* the agent node — a ternary dot riding the wave */
      ctx.fillStyle = "rgba(" + col + "," + glow + ")";
      ctx.beginPath();
      ctx.arc(x, y, 2.6 + 1.6 * pulse, 0, 6.2832);
      ctx.fill();

      /* the label (mono, dim, follows the wave) */
      ctx.fillStyle = "rgba(200,214,229," + (0.30 + 0.35 * pulse) + ")";
      ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(ft.n, x, y - 10);
    }

    /* the "time" axis — a thin timeline at the bottom (space+time diff) */
    ctx.fillStyle = "rgba(127,143,166,0.5)";
    ctx.font = "9px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "right";
    var d = new Date();
    var utc = d.toISOString().slice(11, 19);
    var local = d.toTimeString().slice(0, 5);
    ctx.fillText("space: the constellation · time: " + local + " local / " + utc + " utc", innerWidth - 18, innerHeight - 14);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
