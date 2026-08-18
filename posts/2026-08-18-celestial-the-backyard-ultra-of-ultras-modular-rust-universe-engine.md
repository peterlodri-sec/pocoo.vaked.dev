---
title: "Celestial — The Backyard Ultra of Ultras: A Modular Universe Engine in 27 Rust Crates"
date: 2026-08-18
description: "How Rayan Morel's Celestial builds physically consistent universes in Rust with 27 modular crates, symplectic N-body integrators, real NASA/IAU astrophysical constants, and the sheer endurance of a backyard ultra."
tags: [rust, physics, astrophysics, celestial, backyard-ultra, simulation, vaked]
draft: false
---

# Celestial — the backyard ultra of ultras: a modular universe engine in 27 Rust crates

*qwave · astrophysics · fine touch from within · vaked.dev*

---

> *"Build universes. Not just one — as many as you need."*  
> — [Rayan Morel / Celestial](https://github.com/celestial4498-prog/Celestial)

In a backyard ultra, you don't run against a finish line. You run against the refusal to stop. Every hour on the hour, 4.167 miles. Lap 1, Lap 16, Lap 42. You keep running until the illusion of impossibility dissolves and only the bare physics of endurance remains.

When you look at **[Celestial](https://github.com/celestial4498-prog/Celestial)** (`celestial4498-prog/Celestial`), you recognize the exact same spirit in code.

Building a universe simulation is usually an exercise in smoke and mirrors — putting glowing billboards on a skybox and calling it a cosmos. Celestial takes the opposite, uncompromising route: **27 independent, self-contained Rust crates**, each grounded in real IAU standards, NASA data, and physical constants from [`sciforge`](https://crates.io/crates/sciforge).

It is, in every sense of the word, **the Backyard Ultra of Ultras**.

---

## ✦ The 27 Modular Universe Crates

Rather than a monolithic simulator, Celestial architectures the cosmos into composable, typed atomic building blocks:

```
celestialsbodies/
├── stars/
│   ├── Suns/               — The Sun (full stellar interior, layers, solar wind)
│   └── StarsFactory/       — Procedural star generator across spectral classes
├── blackholes/
│   ├── BlackHolesFactory/  — Kerr/Schwarzschild accretion, relativistic lensing, evaporation
│   └── SagittariusA*s/     — The Milky Way's central SMBH
├── planets/
│   ├── Mercurys/  Venuss/  Earths/  Marss/
│   └── Jupiters/  Saturns/  Uranuss/  Neptunes/
├── satellites/
│   ├── Moons/  Phoboss/  Deimoss/
│   ├── Ioss/  Europas/  Ganymedes/  Callistos/
│   ├── Titanss/  Enceladuss/
│   └── Titanias/  Oberons/  Tritons/
└── Systems/
    ├── SolarSystems/       — N-body symplectic orbital mechanics
    └── MilkyWay/           — Galactic spiral dynamics & dark matter halos
```

Every single planetary and lunar body implements a deep internal stack:
1. `atmosphere/`: Gas models, scale height, thermal profiles, and optical depth.
2. `geology/`: Core/mantle/crust density stratifications and tidal heating.
3. `physics/`: Exact orbital elements, rotational precession, and Roche limit calculations.
4. `terrain/`: Physically bounded heightmaps, geological biomes, and procedural erosion.
5. `rendering/`: PBR material maps, atmospheric Rayleigh/Mie scattering parameters.

---

## ⚡ The Symplectic N-Body Engine (`SolarSystems`)

The heart of multi-body orbital stability is energy conservation. Standard Euler or Runge-Kutta numerical integrators bleed energy over time, causing simulated planets to spiral into their stars or eject into the void.

Celestial's `SolarSystems` engine employs **symplectic integrators** (such as Ruth and Yoshida schemes) that preserve the Hamiltonian phase-space area over billions of virtual timesteps. 

When you simulate 21 major bodies in the solar system, Jupiter's resonance with Saturn and the tidal dissipation in Io's interior remain mathematically true across millions of iterations.

---

## 🌐 The Constellation Alignment

In the `vaked.dev` ecosystem, where our 3D WebGL visualizers (`music.vaked.dev`, `art.vaked.dev`) and 432Hz harmonic acoustic synthesis broadcast procedural energy, Celestial provides the astrophysical ground truth.

```
       [ Celestial (27 Rust Crates) ]
                     │
         (Astrophysical Ground Truth)
                     ▼
      [ N-Body Symplectic Orbital Core ]
                     │
         (432Hz Harmonic Frequency Mesh)
                     ▼
   [ music.vaked.dev & Backyard Ultra 42 Laps ]
```

When code refuses shortcuts, when every star, planet, and moon earns its place in memory through real physical constants, you get more than a simulation. You get a universe that breathes.

---

### 🔗 Explore Celestial
* **GitHub Repository**: [https://github.com/celestial4498-prog/Celestial](https://github.com/celestial4498-prog/Celestial)
* **Author**: Rayan Morel ([@celestial4498-prog](https://github.com/celestial4498-prog))
* **License**: MIT
