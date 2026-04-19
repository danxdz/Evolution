import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { Play, Pause, RotateCcw, Shuffle, SkipForward, Copy, Download, Upload, Eye } from "lucide-react";

/**
 * Prototype goals:
 * - deterministic seeded simulation
 * - readable 3D feel
 * - clean architecture in one file
 * - easy to split into TS + WASM later
 *
 * This prototype keeps the simulation in TypeScript so it can run directly in canvas.
 * The API boundaries mirror the future Rust/WASM design.
 */

type CellState = 0 | 1 | 2 | 3 | 4;
type BoundaryMode = "hard" | "wrap";

type WorldConfig = {
  dims: [number, number, number];
  boundary: BoundaryMode;
  rulesetId: "proto_ca_v1";
  rulesetVersion: "1.0.0";
};

type SeedConfig = {
  seed: string;
  initMode: "random_fill" | "preset_shell";
  density: number;
  burstBias: number;
};

type Stats = {
  generation: number;
  occupied: number;
  charged: number;
  stable: number;
  entropy: number;
  birthsLastStep: number;
  deathsLastStep: number;
};

type Discovery = {
  id: number;
  generation: number;
  kind: "cluster" | "bloom" | "filament" | "collapse" | "shell" | "flare";
  rarity: "common" | "rare";
  detail: string;
};

type RenderCell = {
  x: number;
  y: number;
  z: number;
  state: CellState;
  age: number;
  energy: number;
};

class XorShift32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed || 0x9e3779b9;
  }

  nextU32() {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat() {
    return this.nextU32() / 0xffffffff;
  }
}

function hashSeed(input: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRandomSeed() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const now = Date.now().toString(36).toUpperCase();
  for (let i = 0; i < 8; i++) out += chars[(i * 7 + now.charCodeAt(i % now.length)) % chars.length];
  return `SEED-${out}`;
}

class SimEngine {
  config: WorldConfig;
  seedConfig: SeedConfig;
  readonly dims: [number, number, number];
  readonly size: number;
  generation = 0;
  state: Uint8Array;
  nextState: Uint8Array;
  age: Uint8Array;
  nextAge: Uint8Array;
  energy: Uint8Array;
  nextEnergy: Uint8Array;
  renderCells: RenderCell[] = [];
  stats: Stats = {
    generation: 0,
    occupied: 0,
    charged: 0,
    stable: 0,
    entropy: 0,
    birthsLastStep: 0,
    deathsLastStep: 0,
  };
  discoveries: Discovery[] = [];
  private discoveryId = 1;
  private rollingOccupied: number[] = [];

  constructor(config: WorldConfig, seedConfig: SeedConfig) {
    this.config = config;
    this.seedConfig = seedConfig;
    this.dims = config.dims;
    this.size = this.dims[0] * this.dims[1] * this.dims[2];
    this.state = new Uint8Array(this.size);
    this.nextState = new Uint8Array(this.size);
    this.age = new Uint8Array(this.size);
    this.nextAge = new Uint8Array(this.size);
    this.energy = new Uint8Array(this.size);
    this.nextEnergy = new Uint8Array(this.size);
    this.reset(seedConfig);
  }

  private index(x: number, y: number, z: number) {
    return x + y * this.dims[0] + z * this.dims[0] * this.dims[1];
  }

  private resolve(x: number, y: number, z: number) {
    const [sx, sy, sz] = this.dims;
    if (this.config.boundary === "wrap") {
      return [
        (x + sx) % sx,
        (y + sy) % sy,
        (z + sz) % sz,
      ] as const;
    }
    if (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return null;
    return [x, y, z] as const;
  }

  reset(seedConfig = this.seedConfig) {
    this.seedConfig = seedConfig;
    this.generation = 0;
    this.state.fill(0);
    this.age.fill(0);
    this.energy.fill(0);
    this.nextState.fill(0);
    this.nextAge.fill(0);
    this.nextEnergy.fill(0);
    this.discoveries = [];
    this.discoveryId = 1;
    this.rollingOccupied = [];

    const rng = new XorShift32(hashSeed(`${seedConfig.seed}|${JSON.stringify(this.config)}|${JSON.stringify(seedConfig)}`));
    const [sx, sy, sz] = this.dims;
    const cx = sx / 2;
    const cy = sy / 2;
    const cz = sz / 2;
    const maxR = Math.min(sx, sy, sz) * 0.28;

    for (let z = 0; z < sz; z++) {
      for (let y = 0; y < sy; y++) {
        for (let x = 0; x < sx; x++) {
          const i = this.index(x, y, z);
          const dx = x - cx;
          const dy = y - cy;
          const dz = z - cz;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

          let spawn = false;
          if (seedConfig.initMode === "preset_shell") {
            const shellBand = Math.abs(d - maxR) < 1.25 + rng.nextFloat() * 1.25;
            spawn = shellBand && rng.nextFloat() < 0.62;
          } else {
            const falloff = Math.max(0.18, 1 - d / (maxR * 1.8));
            spawn = rng.nextFloat() < seedConfig.density * falloff;
          }

          if (spawn) {
            const roll = rng.nextFloat();
            const state: CellState = roll < 0.55 ? 1 : roll < 0.8 ? 2 : 3;
            this.state[i] = state;
            this.age[i] = (rng.nextFloat() * 4) | 0;
            this.energy[i] = 80 + ((rng.nextFloat() * 120) | 0);
          }
        }
      }
    }

    this.extractRenderCells();
    this.computeStats(0, 0);
  }

  step(count = 1) {
    for (let n = 0; n < count; n++) {
      this.singleStep();
    }
    this.extractRenderCells();
  }

  private singleStep() {
    const [sx, sy, sz] = this.dims;
    let births = 0;
    let deaths = 0;

    for (let z = 0; z < sz; z++) {
      for (let y = 0; y < sy; y++) {
        for (let x = 0; x < sx; x++) {
          const i = this.index(x, y, z);
          const s = this.state[i] as CellState;
          const a = this.age[i];
          const e = this.energy[i];

          let occupied = 0;
          let sparks = 0;
          let stable = 0;
          let charged = 0;
          let decaying = 0;
          let energySum = 0;

          for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const p = this.resolve(x + dx, y + dy, z + dz);
                if (!p) continue;
                const ni = this.index(p[0], p[1], p[2]);
                const ns = this.state[ni] as CellState;
                if (ns !== 0) occupied++;
                if (ns === 1) sparks++;
                if (ns === 2) stable++;
                if (ns === 3) charged++;
                if (ns === 4) decaying++;
                energySum += this.energy[ni];
              }
            }
          }

          let ns: CellState = s;
          let na = Math.min(255, a + (s === 0 ? 0 : 1));
          let ne = e;

          if (s === 0) {
            const ignition = charged >= 2 && occupied >= 4 && occupied <= 12;
            const bloom = sparks >= 3 && stable >= 1 && occupied <= 10;
            if (ignition || bloom) {
              ns = 1;
              na = 0;
              ne = Math.min(255, 90 + charged * 18 + stable * 8);
              births++;
            } else {
              ns = 0;
              na = 0;
              ne = 0;
            }
          } else if (s === 1) {
            if (occupied < 2) {
              ns = 4;
              ne = 40;
            } else if (stable >= 2 || charged >= 1) {
              ns = 2;
              ne = Math.min(255, 80 + ((energySum / Math.max(1, occupied)) | 0) / 3);
            } else {
              ns = 1;
              ne = Math.min(255, e + 10);
            }
          } else if (s === 2) {
            if (occupied >= 9 && charged >= 2) {
              ns = 3;
              ne = Math.min(255, e + 35);
            } else if (occupied <= 1) {
              ns = 4;
              ne = 35;
            } else {
              ns = 2;
              ne = Math.max(30, e - 3 + sparks * 2);
            }
          } else if (s === 3) {
            const overload = occupied >= 16 || a > 9 + charged;
            if (overload) {
              ns = 4;
              ne = 60;
            } else {
              ns = charged >= 1 && stable >= 2 ? 3 : 2;
              ne = Math.max(25, e - 8 + stable * 2);
            }
          } else if (s === 4) {
            if (charged >= 3 && occupied <= 8 && this.seedConfig.burstBias > 0.55) {
              ns = 1;
              na = 0;
              ne = 110;
              births++;
            } else if (a > 4 || e <= 10) {
              ns = 0;
              na = 0;
              ne = 0;
              deaths++;
            } else {
              ns = 4;
              ne = Math.max(0, e - 12);
            }
          }

          if (s !== 0 && ns === 0) deaths++;
          this.nextState[i] = ns;
          this.nextAge[i] = na;
          this.nextEnergy[i] = ne;
        }
      }
    }

    [this.state, this.nextState] = [this.nextState, this.state];
    [this.age, this.nextAge] = [this.nextAge, this.age];
    [this.energy, this.nextEnergy] = [this.nextEnergy, this.energy];
    this.generation++;
    this.computeStats(births, deaths);
    if (this.generation % 8 === 0) this.scanDiscoveries();
  }

  private computeStats(birthsLastStep: number, deathsLastStep: number) {
    let occupied = 0;
    let charged = 0;
    let stable = 0;
    const bins = [0, 0, 0, 0, 0];

    for (let i = 0; i < this.size; i++) {
      const s = this.state[i] as CellState;
      bins[s]++;
      if (s !== 0) occupied++;
      if (s === 2) stable++;
      if (s === 3) charged++;
    }

    let entropy = 0;
    for (const c of bins) {
      if (!c) continue;
      const p = c / this.size;
      entropy -= p * Math.log2(p);
    }

    this.stats = {
      generation: this.generation,
      occupied,
      charged,
      stable,
      entropy,
      birthsLastStep,
      deathsLastStep,
    };

    this.rollingOccupied.push(occupied);
    if (this.rollingOccupied.length > 12) this.rollingOccupied.shift();
  }

  private scanDiscoveries() {
    const occupied = this.stats.occupied;
    const charged = this.stats.charged;
    const stable = this.stats.stable;
    const recent = this.rollingOccupied;
    if (recent.length < 4) return;

    const delta = recent[recent.length - 1] - recent[0];
    const avg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    const ratio = avg > 0 ? occupied / avg : 1;

    if (ratio > 1.32 && occupied > 250) {
      this.pushDiscovery("bloom", occupied > 700 ? "rare" : "common", `Growth surge to ${occupied} occupied voxels.`);
    }
    if (ratio < 0.72 && recent[0] > 220) {
      this.pushDiscovery("collapse", recent[0] > 700 ? "rare" : "common", `Rapid contraction from ${recent[0]} to ${occupied}.`);
    }
    if (charged > 180 && stable > 120) {
      this.pushDiscovery("flare", charged > 260 ? "rare" : "common", `Charged core spike with ${charged} energized cells.`);
    }
    if (occupied > 550 && stable / Math.max(1, occupied) > 0.48) {
      this.pushDiscovery("cluster", occupied > 900 ? "rare" : "common", `Dense stable cluster persisted through scan interval.`);
    }
    if (occupied > 300 && stable < occupied * 0.2 && charged < occupied * 0.15) {
      this.pushDiscovery("filament", "common", `Thin branching structure signature detected.`);
    }
    if (this.seedConfig.initMode === "preset_shell" && this.generation <= 24 && occupied > 250) {
      this.pushDiscovery("shell", "rare", `Hollow shell initialization stabilized into a persistent membrane.`);
    }
    if (Math.abs(delta) < 25 && occupied > 400) {
      this.pushDiscovery("cluster", "common", `Longer-lived mass held near equilibrium.`);
    }
  }

  private pushDiscovery(kind: Discovery["kind"], rarity: Discovery["rarity"], detail: string) {
    const prev = this.discoveries[this.discoveries.length - 1];
    if (prev && prev.kind === kind && this.generation - prev.generation < 16) return;
    this.discoveries.unshift({
      id: this.discoveryId++,
      generation: this.generation,
      kind,
      rarity,
      detail,
    });
    this.discoveries = this.discoveries.slice(0, 20);
  }

  private extractRenderCells() {
    const [sx, sy, sz] = this.dims;
    const ox = -(sx - 1) / 2;
    const oy = -(sy - 1) / 2;
    const oz = -(sz - 1) / 2;
    const out: RenderCell[] = [];

    for (let z = 0; z < sz; z++) {
      for (let y = 0; y < sy; y++) {
        for (let x = 0; x < sx; x++) {
          const i = this.index(x, y, z);
          const s = this.state[i] as CellState;
          if (s === 0) continue;
          out.push({
            x: x + ox,
            y: y + oy,
            z: z + oz,
            state: s,
            age: this.age[i],
            energy: this.energy[i],
          });
        }
      }
    }

    this.renderCells = out;
  }

  getRenderCells() {
    return this.renderCells;
  }

  getStats() {
    return this.stats;
  }

  getDiscoveries() {
    return this.discoveries;
  }

  exportSeedPayload() {
    return JSON.stringify({
      engineVersion: "prototype-ts-1",
      ...this.config,
      ...this.seedConfig,
    });
  }

  importSeedPayload(payload: string) {
    const data = JSON.parse(payload) as WorldConfig & SeedConfig & { engineVersion?: string };
    this.config = {
      dims: data.dims,
      boundary: data.boundary,
      rulesetId: "proto_ca_v1",
      rulesetVersion: "1.0.0",
    };
    this.seedConfig = {
      seed: data.seed,
      initMode: data.initMode,
      density: data.density,
      burstBias: data.burstBias,
    };
    this.reset(this.seedConfig);
  }
}

function stateColor(state: CellState, energy: number) {
  const t = energy / 255;
  switch (state) {
    case 1:
      return new THREE.Color(0.3 + t * 0.3, 0.7 + t * 0.2, 1.0);
    case 2:
      return new THREE.Color(0.3, 0.9, 0.55 + t * 0.2);
    case 3:
      return new THREE.Color(0.9 + t * 0.1, 0.5 + t * 0.2, 0.15);
    case 4:
      return new THREE.Color(0.55 + t * 0.1, 0.2 + t * 0.1, 0.7);
    default:
      return new THREE.Color(0, 0, 0);
  }
}

function VoxelField({ cells, autoRotate }: { cells: RenderCell[]; autoRotate: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const count = cells.length;
    mesh.count = count;

    for (let i = 0; i < count; i++) {
      const cell = cells[i];
      const scale = cell.state === 3 ? 1.08 : cell.state === 1 ? 0.92 : cell.state === 4 ? 0.78 : 1.0;
      dummy.position.set(cell.x, cell.y, cell.z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(stateColor(cell.state, cell.energy));
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [cells, dummy, color]);

  useFrame((_, delta) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(cells.length, 1)]} castShadow receiveShadow>
        <boxGeometry args={[0.88, 0.88, 0.88]} />
        <meshStandardMaterial vertexColors metalness={0.1} roughness={0.35} />
      </instancedMesh>
    </group>
  );
}

function Scene({ cells, autoRotate }: { cells: RenderCell[]; autoRotate: boolean }) {
  return (
    <>
      <color attach="background" args={["#050816"]} />
      <fog attach="fog" args={["#050816", 34, 90]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[12, 18, 14]} intensity={1.3} castShadow />
      <pointLight position={[0, 0, 0]} intensity={22} distance={90} color="#7cc7ff" />
      <VoxelField cells={cells} autoRotate={autoRotate} />
      <gridHelper args={[60, 20, "#1f365f", "#11203c"]} position={[0, -18, 0]} />
      <OrbitControls enableDamping dampingFactor={0.08} maxDistance={70} minDistance={10} />
    </>
  );
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "rare" }) {
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${
        tone === "rare"
          ? "border-amber-400/50 bg-amber-400/15 text-amber-200"
          : "border-white/15 bg-white/5 text-white/70"
      }`}
    >
      {children}
    </span>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md ${className}`}>
      <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-white/60">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function DiscoverySandboxPrototype() {
  const [config] = useState<WorldConfig>({
    dims: [28, 28, 28],
    boundary: "hard",
    rulesetId: "proto_ca_v1",
    rulesetVersion: "1.0.0",
  });

  const [seedConfig, setSeedConfig] = useState<SeedConfig>({
    seed: "SEED-ALPHA1",
    initMode: "random_fill",
    density: 0.14,
    burstBias: 0.62,
  });

  const engineRef = useRef<SimEngine | null>(null);
  const accumulatorRef = useRef(0);

  const [playing, setPlaying] = useState(true);
  const [ticksPerSecond, setTicksPerSecond] = useState(12);
  const [cells, setCells] = useState<RenderCell[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [autoRotate, setAutoRotate] = useState(false);
  const [seedText, setSeedText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const engine = new SimEngine(config, seedConfig);
    engineRef.current = engine;
    setCells(engine.getRenderCells());
    setStats(engine.getStats());
    setDiscoveries(engine.getDiscoveries());
    setSeedText(engine.exportSeedPayload());
  }, [config, seedConfig]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const engine = engineRef.current;
      if (engine && playing) {
        const dt = Math.min(0.05, (now - last) / 1000);
        accumulatorRef.current += dt * ticksPerSecond;
        let stepped = false;
        while (accumulatorRef.current >= 1) {
          engine.step(1);
          accumulatorRef.current -= 1;
          stepped = true;
        }
        if (stepped) {
          setCells([...engine.getRenderCells()]);
          setStats({ ...engine.getStats() });
          setDiscoveries([...engine.getDiscoveries()]);
        }
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, ticksPerSecond]);

  const doStep = (count = 1) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.step(count);
    setCells([...engine.getRenderCells()]);
    setStats({ ...engine.getStats() });
    setDiscoveries([...engine.getDiscoveries()]);
  };

  const reset = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.reset(seedConfig);
    setCells([...engine.getRenderCells()]);
    setStats({ ...engine.getStats() });
    setDiscoveries([...engine.getDiscoveries()]);
    setSeedText(engine.exportSeedPayload());
  };

  const randomize = () => {
    const next: SeedConfig = {
      ...seedConfig,
      seed: makeRandomSeed(),
      density: Number((0.08 + Math.random() * 0.12).toFixed(2)),
      burstBias: Number((0.45 + Math.random() * 0.4).toFixed(2)),
      initMode: Math.random() > 0.75 ? "preset_shell" : "random_fill",
    };
    setSeedConfig(next);
  };

  const copySeed = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const text = engine.exportSeedPayload();
    setSeedText(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const importSeed = () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.importSeedPayload(seedText);
      const parsed = JSON.parse(seedText) as Partial<SeedConfig>;
      setSeedConfig((prev) => ({
        ...prev,
        seed: parsed.seed ?? prev.seed,
        initMode: (parsed.initMode as SeedConfig["initMode"]) ?? prev.initMode,
        density: typeof parsed.density === "number" ? parsed.density : prev.density,
        burstBias: typeof parsed.burstBias === "number" ? parsed.burstBias : prev.burstBias,
      }));
      setCells([...engine.getRenderCells()]);
      setStats({ ...engine.getStats() });
      setDiscoveries([...engine.getDiscoveries()]);
    } catch {
      alert("Invalid seed payload JSON.");
    }
  };

  const exportSeedFile = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const blob = new Blob([engine.exportSeedPayload()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${seedConfig.seed.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#050816] text-white">
      <Canvas camera={{ position: [20, 22, 24], fov: 50 }} shadows gl={{ antialias: true }}>
        <Scene cells={cells} autoRotate={autoRotate} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(100,160,255,0.15),transparent_35%),linear-gradient(to_bottom,rgba(4,10,22,0.25),rgba(4,10,22,0.7))]" />

      <div className="absolute inset-0 grid grid-cols-1 gap-4 p-4 lg:grid-cols-[330px_1fr_360px]">
        <div className="flex min-h-0 flex-col gap-4">
          <Panel title="Controls">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPlaying((v) => !v)}
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm hover:bg-white/12"
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
                {playing ? "Pause" : "Play"}
              </button>
              <button onClick={() => doStep(1)} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm hover:bg-white/12">
                <SkipForward size={16} /> Step
              </button>
              <button onClick={reset} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm hover:bg-white/12">
                <RotateCcw size={16} /> Reset
              </button>
              <button onClick={randomize} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm hover:bg-white/12">
                <Shuffle size={16} /> New Seed
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-white/75">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/50">
                  <span>Sim Speed</span>
                  <span>{ticksPerSecond} tps</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={40}
                  value={ticksPerSecond}
                  onChange={(e) => setTicksPerSecond(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Density</div>
                  <input
                    type="number"
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={seedConfig.density}
                    onChange={(e) => setSeedConfig((prev) => ({ ...prev, density: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 outline-none"
                  />
                </label>
                <label className="space-y-1">
                  <div className="text-xs uppercase tracking-[0.2em] text-white/50">Burst Bias</div>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={seedConfig.burstBias}
                    onChange={(e) => setSeedConfig((prev) => ({ ...prev, burstBias: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 outline-none"
                  />
                </label>
              </div>

              <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/6 px-3 py-2">
                <span className="text-sm">Auto rotate</span>
                <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
              </label>

              <label className="space-y-1">
                <div className="text-xs uppercase tracking-[0.2em] text-white/50">Init Mode</div>
                <select
                  value={seedConfig.initMode}
                  onChange={(e) => setSeedConfig((prev) => ({ ...prev, initMode: e.target.value as SeedConfig["initMode"] }))}
                  className="w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 outline-none"
                >
                  <option value="random_fill">Random Fill</option>
                  <option value="preset_shell">Preset Shell</option>
                </select>
              </label>
            </div>
          </Panel>

          <Panel title="Seed">
            <div className="space-y-3">
              <div>
                <div className="mb-1 text-xs uppercase tracking-[0.2em] text-white/50">Current Seed</div>
                <input
                  value={seedConfig.seed}
                  onChange={(e) => setSeedConfig((prev) => ({ ...prev, seed: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm outline-none"
                />
              </div>

              <textarea
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                className="h-36 w-full rounded-xl border border-white/10 bg-white/8 p-3 text-xs text-white/80 outline-none"
              />

              <div className="grid grid-cols-2 gap-2">
                <button onClick={copySeed} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm hover:bg-white/12">
                  <Copy size={16} /> {copied ? "Copied" : "Copy"}
                </button>
                <button onClick={importSeed} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm hover:bg-white/12">
                  <Upload size={16} /> Import
                </button>
                <button onClick={exportSeedFile} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-sm hover:bg-white/12">
                  <Download size={16} /> Export Payload
                </button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="hidden min-h-0 lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none self-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs uppercase tracking-[0.35em] text-cyan-100/85 backdrop-blur-md">
            3D Discovery Sandbox Prototype
          </div>

          <div className="pointer-events-none self-center rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-center text-sm text-white/70 backdrop-blur-md">
            Orbit to inspect structures. Pause, step, reset, and replay deterministic seeds.
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <Panel title="Telemetry">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/6 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Generation</div>
                <div className="mt-1 text-2xl font-semibold">{stats?.generation ?? 0}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/6 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Occupied</div>
                <div className="mt-1 text-2xl font-semibold">{stats?.occupied ?? 0}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/6 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Charged</div>
                <div className="mt-1 text-2xl font-semibold">{stats?.charged ?? 0}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/6 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Stable</div>
                <div className="mt-1 text-2xl font-semibold">{stats?.stable ?? 0}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-white/70">
              <div className="rounded-xl border border-white/10 bg-white/6 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Entropy</div>
                <div className="mt-1">{stats?.entropy.toFixed(2) ?? "0.00"}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/6 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Births</div>
                <div className="mt-1">{stats?.birthsLastStep ?? 0}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/6 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-white/45">Deaths</div>
                <div className="mt-1">{stats?.deathsLastStep ?? 0}</div>
              </div>
            </div>
          </Panel>

          <Panel title="Codex / Discoveries" className="min-h-0 flex-1">
            <div className="mb-3 flex items-center gap-2 text-xs text-white/55">
              <Eye size={14} />
              Heuristic discovery stream. Deterministic for the same seed and config.
            </div>
            <div className="max-h-[50vh] space-y-3 overflow-auto pr-1">
              {discoveries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/4 p-4 text-sm text-white/50">
                  No notable discoveries yet. Let the world evolve a little longer.
                </div>
              ) : (
                discoveries.map((d) => (
                  <div key={d.id} className="rounded-xl border border-white/10 bg-white/6 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone={d.rarity === "rare" ? "rare" : "default"}>{d.rarity}</Badge>
                        <Badge>{d.kind}</Badge>
                      </div>
                      <div className="text-xs uppercase tracking-[0.2em] text-white/45">Gen {d.generation}</div>
                    </div>
                    <div className="text-sm text-white/78">{d.detail}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
