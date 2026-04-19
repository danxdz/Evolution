import { CellState, Discovery, RenderCell, RuleConfig, RuleLevel, SeedConfig, SeedPayload, Stats, WorldConfig } from "../types/sim";
import { hashSeed, XorShift32 } from "./random";

const ENGINE_VERSION = "prototype-ts-1";
const DEFAULT_RULES: RuleConfig = {
  birthLevels: [3],
  survivalLevels: [2, 3],
  lifespan: 100,
  immortality: true,
};
const RULE_LEVEL_COUNTS: Record<RuleLevel, number[]> = {
  1: [5, 6],
  2: [7, 8],
  3: [9, 10],
  4: [11, 12],
  5: [13, 14],
  6: [15, 16],
};

type LiveCell = {
  x: number;
  y: number;
  z: number;
  age: number;
  energy: number;
  state: CellState;
};

type NeighborCount = {
  count: number;
  x: number;
  y: number;
  z: number;
};

const NEIGHBOR_OFFSETS: Array<[number, number, number]> = [];
for (let dz = -1; dz <= 1; dz++) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      NEIGHBOR_OFFSETS.push([dx, dy, dz]);
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown, field: string) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new Error(`Invalid numeric field: ${field}`);
  }
  return value;
}

function readTuple3(value: unknown, field: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Invalid tuple field: ${field}`);
  }
  return [
    readNumber(value[0], `${field}[0]`),
    readNumber(value[1], `${field}[1]`),
    readNumber(value[2], `${field}[2]`),
  ];
}

function isRuleLevel(value: number): value is RuleLevel {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function parseRuleLevels(value: unknown, fallback: RuleLevel[]): RuleLevel[] {
  if (!Array.isArray(value)) return fallback;
  const levels = value
    .map((v) => (typeof v === "number" ? v : Number.NaN))
    .filter(isRuleLevel) as RuleLevel[];
  if (levels.length === 0) return fallback;
  return [...new Set(levels)].sort((a, b) => a - b) as RuleLevel[];
}

function parseRules(value: unknown): RuleConfig {
  if (!isObject(value)) return { ...DEFAULT_RULES };
  const birthLevels = parseRuleLevels(value.birthLevels, DEFAULT_RULES.birthLevels);
  const survivalLevels = parseRuleLevels(value.survivalLevels, DEFAULT_RULES.survivalLevels);
  const lifespanRaw = typeof value.lifespan === "number" ? value.lifespan : DEFAULT_RULES.lifespan;
  const lifespan = clamp(Math.round(lifespanRaw), 5, 500);
  const immortality = typeof value.immortality === "boolean" ? value.immortality : DEFAULT_RULES.immortality;
  return {
    birthLevels,
    survivalLevels,
    lifespan,
    immortality,
  };
}

function levelsToNeighborSet(levels: RuleLevel[]) {
  const set = new Set<number>();
  for (const level of levels) {
    for (const count of RULE_LEVEL_COUNTS[level]) {
      set.add(count);
    }
  }
  return set;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function coordKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function parseSeedPayload(payload: string): SeedPayload {
  const parsed: unknown = JSON.parse(payload);
  if (!isObject(parsed)) {
    throw new Error("Seed payload must be a JSON object.");
  }

  const engineVersion = typeof parsed.engineVersion === "string" ? parsed.engineVersion : "";
  if (engineVersion && engineVersion !== ENGINE_VERSION) {
    throw new Error(`Unsupported engineVersion: ${engineVersion}`);
  }

  const dims = readTuple3(parsed.dims, "dims");
  const boundary = parsed.boundary;
  if (boundary !== "hard" && boundary !== "wrap" && boundary !== "unbounded") {
    throw new Error("Invalid boundary. Expected 'hard', 'wrap' or 'unbounded'.");
  }

  const rulesetId = parsed.rulesetId;
  if (rulesetId !== "proto_ca_v1") {
    throw new Error("Invalid rulesetId. Expected 'proto_ca_v1'.");
  }

  const rulesetVersion = parsed.rulesetVersion;
  if (rulesetVersion !== "1.0.0") {
    throw new Error("Invalid rulesetVersion. Expected '1.0.0'.");
  }

  const seed = parsed.seed;
  if (typeof seed !== "string" || seed.trim().length === 0) {
    throw new Error("Invalid seed string.");
  }

  const initMode = parsed.initMode;
  if (initMode !== "random_fill" && initMode !== "preset_shell") {
    throw new Error("Invalid initMode. Expected 'random_fill' or 'preset_shell'.");
  }

  const density = clamp(readNumber(parsed.density, "density"), 0.01, 0.5);
  const burstBias = clamp(readNumber(parsed.burstBias, "burstBias"), 0, 1);
  const rules = parseRules(parsed.rules);

  return {
    engineVersion: ENGINE_VERSION,
    dims,
    boundary,
    rulesetId,
    rulesetVersion,
    seed,
    initMode,
    density,
    burstBias,
    rules,
  };
}

export class SimEngine {
  private readonly config: WorldConfig;
  private seedConfig: SeedConfig;
  private generation = 0;
  private live = new Map<string, LiveCell>();
  private renderCells: RenderCell[] = [];
  private viewCenter = { x: 0, y: 0, z: 0 };
  private viewRadius = 72;
  private stats: Stats = {
    generation: 0,
    occupied: 0,
    charged: 0,
    stable: 0,
    entropy: 0,
    birthsLastStep: 0,
    deathsLastStep: 0,
  };
  private discoveries: Discovery[] = [];
  private discoveryId = 1;
  private rollingOccupied: number[] = [];

  constructor(config: WorldConfig, seedConfig: SeedConfig) {
    this.config = { ...config };
    this.seedConfig = { ...seedConfig };
    this.reset(seedConfig);
  }

  private setLiveCell(x: number, y: number, z: number, state: CellState, age: number, energy: number) {
    this.live.set(coordKey(x, y, z), {
      x,
      y,
      z,
      state,
      age: clamp(age, 0, 255),
      energy: clamp(energy, 0, 255),
    });
  }

  private seedRootTendrils(rng: XorShift32, radius: number) {
    const walkerCount = 6 + ((rng.nextFloat() * 8) | 0);
    const maxSteps = Math.max(30, radius * 4);

    for (let walker = 0; walker < walkerCount; walker++) {
      let x = (rng.nextFloat() - 0.5) * (radius * 0.4);
      let y = (rng.nextFloat() - 0.5) * (radius * 0.35);
      let z = (rng.nextFloat() - 0.5) * (radius * 0.4);
      let dx = rng.nextFloat() < 0.5 ? -1 : 1;
      let dy = rng.nextFloat() < 0.5 ? -1 : 1;
      let dz = rng.nextFloat() < 0.5 ? -1 : 1;

      for (let step = 0; step < maxSteps; step++) {
        const ix = Math.round(x);
        const iy = Math.round(y);
        const iz = Math.round(z);
        const roll = rng.nextFloat();
        const state: CellState = roll < 0.76 ? 1 : roll < 0.92 ? 2 : 3;
        this.setLiveCell(ix, iy, iz, state, 0, 110 + ((rng.nextFloat() * 100) | 0));

        if (rng.nextFloat() < 0.2) {
          const bx = ix + (rng.nextFloat() < 0.5 ? -1 : 1);
          const by = iy + (rng.nextFloat() < 0.5 ? -1 : 1);
          const bz = iz + (rng.nextFloat() < 0.5 ? -1 : 1);
          this.setLiveCell(bx, by, bz, rng.nextFloat() < 0.82 ? 1 : 3, 0, 95 + ((rng.nextFloat() * 95) | 0));
        }

        if (rng.nextFloat() < 0.28) dx = rng.nextFloat() < 0.5 ? -1 : 1;
        if (rng.nextFloat() < 0.28) dy = rng.nextFloat() < 0.5 ? -1 : 1;
        if (rng.nextFloat() < 0.28) dz = rng.nextFloat() < 0.5 ? -1 : 1;

        x += dx + (rng.nextFloat() < 0.2 ? (rng.nextFloat() < 0.5 ? -1 : 1) : 0);
        y += dy + (rng.nextFloat() < 0.2 ? (rng.nextFloat() < 0.5 ? -1 : 1) : 0);
        z += dz + (rng.nextFloat() < 0.2 ? (rng.nextFloat() < 0.5 ? -1 : 1) : 0);
      }
    }
  }

  private refreshRenderCells() {
    const out: RenderCell[] = [];
    const r = this.viewRadius;
    const radius2 = r * r;

    for (const cell of this.live.values()) {
      const dx = cell.x - this.viewCenter.x;
      const dy = cell.y - this.viewCenter.y;
      const dz = cell.z - this.viewCenter.z;
      if (Math.abs(dx) > r || Math.abs(dy) > r || Math.abs(dz) > r) continue;
      if (dx * dx + dy * dy + dz * dz > radius2 * 1.15) continue;

      out.push({
        x: cell.x,
        y: cell.y,
        z: cell.z,
        state: cell.state,
        age: cell.age,
        energy: cell.energy,
      });
    }

    this.renderCells = out;
  }

  private recomputeStats(birthsLastStep: number, deathsLastStep: number) {
    let charged = 0;
    let stable = 0;
    const bins = [0, 0, 0, 0, 0];

    for (const cell of this.live.values()) {
      bins[cell.state]++;
      if (cell.state === 2) stable++;
      if (cell.state === 3) charged++;
    }

    const occupied = this.live.size;
    const worldApprox = Math.max(occupied * 1.2, 1);
    const binsWithEmpty = [Math.max(0, worldApprox - occupied), bins[1], bins[2], bins[3], bins[4]];

    let entropy = 0;
    for (const count of binsWithEmpty) {
      if (!count) continue;
      const p = count / worldApprox;
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

  private pushDiscovery(kind: Discovery["kind"], rarity: Discovery["rarity"], detail: string) {
    const prev = this.discoveries[0];
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

  private scanDiscoveries() {
    const occupied = this.stats.occupied;
    const charged = this.stats.charged;
    const stable = this.stats.stable;
    const recent = this.rollingOccupied;
    if (recent.length < 4) return;

    const delta = recent[recent.length - 1] - recent[0];
    const avg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const ratio = avg > 0 ? occupied / avg : 1;

    if (ratio > 1.22 && occupied > 1200) {
      this.pushDiscovery("bloom", occupied > 3000 ? "rare" : "common", `Active growth expanded to ${occupied} live cubes.`);
    }
    if (ratio < 0.82 && recent[0] > 1200) {
      this.pushDiscovery("collapse", recent[0] > 3000 ? "rare" : "common", `Population dropped from ${recent[0]} to ${occupied}.`);
    }
    if (charged > 500 && stable > 400) {
      this.pushDiscovery("flare", charged > 900 ? "rare" : "common", `High-energy cluster with ${charged} charged cubes.`);
    }
    if (stable > occupied * 0.32 && occupied > 1000) {
      this.pushDiscovery("cluster", "common", "Large stable structures are persisting.");
    }
    if (Math.abs(delta) < 80 && occupied > 900) {
      this.pushDiscovery("filament", "common", "Long filament structures are hovering near equilibrium.");
    }
  }

  setViewCenter(x: number, y: number, z: number) {
    const nx = Math.round(x);
    const ny = Math.round(y);
    const nz = Math.round(z);
    if (nx === this.viewCenter.x && ny === this.viewCenter.y && nz === this.viewCenter.z) return false;
    this.viewCenter = { x: nx, y: ny, z: nz };
    this.refreshRenderCells();
    return true;
  }

  reset(seedConfig = this.seedConfig) {
    this.seedConfig = {
      ...seedConfig,
      rules: parseRules(seedConfig.rules),
    };
    this.generation = 0;
    this.live.clear();
    this.discoveries = [];
    this.discoveryId = 1;
    this.rollingOccupied = [];

    const rng = new XorShift32(hashSeed(`${seedConfig.seed}|${JSON.stringify(this.config)}|${JSON.stringify(seedConfig)}`));
    const radius = Math.max(12, Math.floor((this.config.dims[0] + this.config.dims[1] + this.config.dims[2]) / 3 / 2));
    const phase = (hashSeed(seedConfig.seed) % 997) / 41;

    for (let z = -radius; z <= radius; z++) {
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          const d = Math.sqrt(x * x + y * y + z * z);
          let spawn = false;

          if (seedConfig.initMode === "preset_shell") {
            const shellR = radius * 0.62;
            const shellBand = Math.abs(d - shellR) < 1.1 + rng.nextFloat() * 1.4;
            spawn = shellBand && rng.nextFloat() < 0.6;
          } else {
            const falloff = Math.max(0.03, 1 - d / (radius * 1.8));
            const anisotropy = 0.62 + 0.38 * Math.sin(x * 0.39 + y * 0.25 + z * 0.31 + phase);
            spawn = rng.nextFloat() < seedConfig.density * 0.52 * falloff * anisotropy;
          }

          if (spawn) {
            const roll = rng.nextFloat();
            const state: CellState = roll < 0.8 ? 1 : roll < 0.93 ? 2 : 3;
            this.setLiveCell(x, y, z, state, (rng.nextFloat() * 2) | 0, 82 + ((rng.nextFloat() * 125) | 0));
          }
        }
      }
    }

    if (seedConfig.initMode === "random_fill") {
      this.seedRootTendrils(rng, radius);
    }

    this.refreshRenderCells();
    this.recomputeStats(0, 0);
  }

  step(count = 1) {
    const birthCounts = levelsToNeighborSet(this.seedConfig.rules.birthLevels);
    const surviveCounts = levelsToNeighborSet(this.seedConfig.rules.survivalLevels);
    const lifeLimit = this.seedConfig.rules.lifespan;
    const immortal = this.seedConfig.rules.immortality;

    for (let n = 0; n < count; n++) {
      const previousAlive = this.live.size;
      const neighborCounts = new Map<string, NeighborCount>();

      for (const cell of this.live.values()) {
        for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          const nz = cell.z + dz;
          const key = coordKey(nx, ny, nz);
          const entry = neighborCounts.get(key);
          if (entry) {
            entry.count++;
          } else {
            neighborCounts.set(key, { count: 1, x: nx, y: ny, z: nz });
          }
        }
      }

      const next = new Map<string, LiveCell>();
      let births = 0;

      for (const entry of neighborCounts.values()) {
        const key = coordKey(entry.x, entry.y, entry.z);
        const current = this.live.get(key);
        const neighbors = entry.count;

        if (current) {
          if (surviveCounts.has(neighbors)) {
            const age = Math.min(255, current.age + 1);
            if (!immortal && age >= lifeLimit) {
              continue;
            }
            const state: CellState = neighbors >= 9 ? 3 : neighbors === 8 ? 2 : 1;
            const energy = clamp(current.energy - 4 + neighbors * 2, 20, 255);
            next.set(key, { x: current.x, y: current.y, z: current.z, age, energy, state });
          }
        } else if (birthCounts.has(neighbors)) {
          births++;
          next.set(key, {
            x: entry.x,
            y: entry.y,
            z: entry.z,
            age: 0,
            energy: 106 + ((hashSeed(`${entry.x}|${entry.y}|${entry.z}|${this.seedConfig.seed}`) % 110) | 0),
            state: neighbors >= 10 ? 3 : 1,
          });
        }
      }

      this.live = next;
      this.generation++;
      const deaths = Math.max(0, previousAlive + births - this.live.size);
      this.recomputeStats(births, deaths);
      if (this.generation % 8 === 0) this.scanDiscoveries();
    }

    this.refreshRenderCells();
  }

  getStats() {
    return this.stats;
  }

  getRenderCells() {
    return this.renderCells;
  }

  getDiscoveries() {
    return this.discoveries;
  }

  getSeedConfig() {
    return { ...this.seedConfig };
  }

  exportSeedPayload() {
    const payload: SeedPayload = {
      engineVersion: ENGINE_VERSION,
      ...this.config,
      ...this.seedConfig,
    };
    return JSON.stringify(payload, null, 2);
  }

  importSeedPayload(payload: string) {
    const parsed = parseSeedPayload(payload);
    const [x, y, z] = parsed.dims;
    const [wx, wy, wz] = this.config.dims;
    if (x !== wx || y !== wy || z !== wz) {
      throw new Error(`Payload dims ${x}x${y}x${z} do not match current world dims ${wx}x${wy}x${wz}.`);
    }
    if (parsed.boundary !== this.config.boundary) {
      throw new Error(`Payload boundary '${parsed.boundary}' does not match current boundary '${this.config.boundary}'.`);
    }

    this.seedConfig = {
      seed: parsed.seed,
      initMode: parsed.initMode,
      density: parsed.density,
      burstBias: parsed.burstBias,
      rules: parsed.rules ?? { ...DEFAULT_RULES },
    };
    this.reset(this.seedConfig);
  }
}
