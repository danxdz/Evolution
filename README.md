# Evolution - Discovery Sandbox Prototype

Inspired by Conway's Game of Life, this project is a deterministic 3D cellular discovery sandbox focused on seed sharing and replayable evolution.

## What is included now

- Runnable React + TypeScript + Vite app
- Three.js scene through React Three Fiber
- Deterministic simulation engine (single-threaded TS prototype)
- Seed export/import payload flow
- Discovery feed with heuristic events
- Responsive desktop/mobile overlay UI

## Quick start

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Controls

- `Play / Pause` simulation
- `Step` one tick manually
- `Reset` current seed/config
- `New Seed` deterministic randomized seed profile
- Adjustable `Sim Speed`, `Density`, `Burst Bias`, `Init Mode`
- Seed payload `Copy`, `Import`, and `Export Payload`

## Determinism model

Simulation determinism is enforced by:

- `XorShift32` seeded PRNG
- No random source in simulation core
- Fixed update order over flat arrays
- Versioned payload (`engineVersion`, `rulesetId`, `rulesetVersion`)

Note: payload imports are validated. If payload world dimensions or boundary mode do not match the running world config, import is rejected.

## Current architecture

```text
src/
  App.tsx                 # app orchestration + UI composition
  engine/
    SimEngine.ts          # simulation core, stats, discovery scan, import/export
    random.ts             # deterministic RNG + seed hashing
  scene/
    Scene.tsx             # lights, controls, scene composition
    VoxelField.tsx        # instanced voxel renderer
    colors.ts             # visual mapping by state + energy
  ui/
    ControlsPanel.tsx
    SeedPanel.tsx
    TelemetryPanel.tsx
    DiscoveryPanel.tsx
    Panel.tsx
    Badge.tsx
  types/
    sim.ts                # shared simulation contracts
  utils/
    seed.ts               # deterministic profile randomization helpers
```

## Next milestones

1. Move simulation core to Rust + WASM while keeping the same API shape.
2. Add full snapshot save/load (not only seed payload).
3. Introduce GPU-oriented culling/chunking for larger grids.
4. Add codex persistence and rarity history in local storage.
5. Add richer post-processing as a render layer only (sim remains discrete).
