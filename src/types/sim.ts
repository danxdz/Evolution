export type CellState = 0 | 1 | 2 | 3 | 4;
export type BoundaryMode = "hard" | "wrap" | "unbounded";
export type RuleLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type WorldConfig = {
  dims: [number, number, number];
  boundary: BoundaryMode;
  rulesetId: "proto_ca_v1";
  rulesetVersion: "1.0.0";
};

export type RuleConfig = {
  birthLevels: RuleLevel[];
  survivalLevels: RuleLevel[];
  lifespan: number;
  immortality: boolean;
};

export type SeedConfig = {
  seed: string;
  initMode: "random_fill" | "preset_shell";
  density: number;
  burstBias: number;
  rules: RuleConfig;
};

export type Stats = {
  generation: number;
  occupied: number;
  charged: number;
  stable: number;
  entropy: number;
  birthsLastStep: number;
  deathsLastStep: number;
};

export type Discovery = {
  id: number;
  generation: number;
  kind: "cluster" | "bloom" | "filament" | "collapse" | "shell" | "flare";
  rarity: "common" | "rare";
  detail: string;
};

export type RenderCell = {
  x: number;
  y: number;
  z: number;
  state: CellState;
  age: number;
  energy: number;
};

export type SeedPayload = WorldConfig &
  SeedConfig & {
    engineVersion: string;
  };
