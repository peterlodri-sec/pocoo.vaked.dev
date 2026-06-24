---
title: "Loop Radio: a browser that generates music"
date: 2026-06-24
tags: [web-audio, oss, procedural, loops, vaked]
description: "A single HTML file that turns genre keywords into live procedural music. No server, no dependencies, zero install. How it works and why I built it."
draft: false
---

[**Try it: peterlodri-sec.github.io/loop-radio**](https://peterlodri-sec.github.io/loop-radio)
[Source (AGPL-3.0)](https://github.com/peterlodri-sec/peterlodri-sec.github.io/blob/main/loop-radio.html)

---

You type `stoner desert rock`. The browser starts generating it. No server. No streaming. No API calls. Pure math running in your tab.

This is Loop Radio.

---

## What it actually does

The page is a single HTML file — 360 lines, zero dependencies, AGPL licensed. You can download it, open it directly, fork it, host it anywhere. There's no build step because there's nothing to build.

When you press Play:

1. A **keyword parser** maps your genre text to synthesis parameters: BPM, harmonic scale, oscillator waveform, rhythm density, reverb amount.
2. A **lookahead scheduler** runs on a 28ms interval, computing Web Audio nodes ~120ms ahead of playback time. This is the standard trick for glitch-free browser audio — you're always scheduling slightly into the future so the audio thread never starves.
3. **Three synthesis layers** produce sound: kick drum (exponential frequency envelope on an oscillator, 160Hz→0 in 150ms), hi-hat (white noise through a highpass filter), and melody (oscillator + ADSR, waveform controlled by genre).
4. A **WebGL2 shader** runs the background animation in parallel — pulsing rings that sync their scale to a BPM uniform, passed from the audio engine each frame.
5. **ENTHEA Tier-2 telemetry** fires a `radio_start` event with genre and BPM when you press play. No PII, no cookies, no fingerprinting. Just aggregate usage so I know if anyone's actually using this.

---

## Genre → parameters

The parser is a simple keyword match — not ML, not embeddings, just `q.includes('stoner')`:

| Genre | BPM | Scale | Waveform | Drums |
|-------|-----|-------|----------|-------|
| lofi (default) | 85 | pentatonic | triangle | yes |
| stoner / desert rock | 72 | phrygian | sawtooth | yes |
| dark ambient / drone | 50 | phrygian | sine | no |
| daft punk / house | 128 | minor | sawtooth | yes |
| 8bit / chiptune | 150 | major | square | yes |
| jazz | 145 | dorian | triangle | yes |

Phrygian for desert rock because the flat-2 gives you that Middle-Eastern tension Kyuss and Sleep use. Dorian for jazz because it has the natural 6th that makes minor sound sophisticated instead of sad.

The bass pattern is a fixed 16-step sequence that changes shape based on `kickDensity`. The melody fires probabilistically — dense on fast genres, sparse on ambient.

---

## The Web Audio scheduler

This is the core piece that most "browser music" examples get wrong. The naive version is:

```js
setInterval(() => {
  playNote(audioCtx.currentTime);
}, bpm_interval_ms);
```

This is broken. `setInterval` is imprecise and runs on the main thread, which can be blocked by anything. Notes arrive late, the rhythm drifts.

The correct version schedules notes *ahead* of real time:

```js
const LOOKAHEAD = 0.12; // seconds ahead to schedule
const INTERVAL = 28;    // ms between scheduler ticks

function scheduler() {
  while (nextT < audioCtx.currentTime + LOOKAHEAD) {
    scheduleNote(step, nextT);
    nextT += (60 / bpm) * 0.25; // 16th note
    step = (step + 1) % 16;
  }
  timer = setTimeout(scheduler, INTERVAL);
}
```

The scheduler runs every 28ms but schedules audio 120ms into the future. When the main thread hiccups for 50ms, the audio thread has already received its instructions and plays clean. The gap between `INTERVAL` and `LOOKAHEAD` is the jitter budget — as long as jitter < 92ms, nothing clicks.

This pattern is from Chris Wilson's [A Tale of Two Clocks](https://www.html5rocks.com/en/tutorials/audio/scheduling/) (2013). It still applies today.

---

## The WebGL2 background

The rings pulse to BPM via a uniform:

```glsl
float beat = fract(T * BPM / 60.0);
float pulse = 1.0 + 0.08 * exp(-beat * 5.0);
// ring radius *= pulse
```

`fract(T * BPM / 60)` gives a sawtooth from 0→1 cycling at BPM. `exp(-beat * 5)` makes it decay fast — a quick bright flash on every beat rather than a slow oscillation.

The rings themselves are signed-distance-field circles, not rasterized geometry:

```glsl
float ring(vec2 uv, float r, float w) {
  return smoothstep(w, 0.0, abs(length(uv) - r));
}
```

`abs(length(uv) - r)` gives you the distance to the circle edge. `smoothstep` antialiases it into a thin band of width `w`. Four rings, two colors (purple and cyan), four oscillating radii.

---

## Why single-file?

Inspired by [ENTHEA](/posts/2026-06-23-enthea-neural-field) — my neural field visualizer that ships as one HTML file you can save to your desktop and run forever without internet.

The distribution model for a single HTML file is different from an app. There's no install. No version conflicts. No deprecation path. You fork it, you own it. In 10 years it'll still open in a browser.

AGPL means derivative work has to stay open. If you add a new synthesis engine, you contribute it back. The file grows smarter over time across forks.

---

## What's next

The obvious extension is more synthesis depth — FM operators, proper reverb IR (vs the procedural convolution noise I use now), chord progressions, variation between 16-bar phrases. But I'm also interested in using the loop's own output as training signal for a tiny genre classifier that could close the loop: the audio generates text descriptions of itself, the classifier uses those to improve the keyword parser.

A loop that teaches itself to generate better loops. [The pattern](https://pocoo.vaked.dev/posts/2026-06-24-the-loop-is-already-here) keeps coming up.

---

*Related: [The correctable loop](/posts/2026-06-24-the-correctable-loop) · [Your first free infinite loop](/posts/2026-06-24-your-first-free-infinite-loop) · [protocol.vaked.dev](https://protocol.vaked.dev)*
