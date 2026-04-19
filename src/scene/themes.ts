import { CellState } from "../types/sim";

export type ThemeId = "deep_ocean" | "aurora" | "ember";
export type VoxelStyleId = "cube" | "chip" | "column";

type StateColor = [number, number, number];

export type SceneTheme = {
  id: ThemeId;
  label: string;
  background: string;
  fog: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  keyLightColor: string;
  keyLightIntensity: number;
  fillLightColor: string;
  fillLightIntensity: number;
  rimLightColor: string;
  rimLightIntensity: number;
  emissiveColor: string;
  emissiveIntensity: number;
  overlayRadial: string;
  overlayTop: string;
  overlayBottom: string;
  stateColors: Record<CellState, StateColor>;
};

export type VoxelStyle = {
  id: VoxelStyleId;
  label: string;
  geometry: [number, number, number];
  scaleCharged: number;
  scaleAlive: number;
  scaleDecay: number;
};

export const THEMES: Record<ThemeId, SceneTheme> = {
  deep_ocean: {
    id: "deep_ocean",
    label: "Deep Ocean",
    background: "#0a1430",
    fog: "#0a1430",
    ambientIntensity: 2.2,
    hemiSky: "#b7d9ff",
    hemiGround: "#193054",
    hemiIntensity: 2.3,
    keyLightColor: "#dcecff",
    keyLightIntensity: 3.2,
    fillLightColor: "#8cb8ff",
    fillLightIntensity: 2.6,
    rimLightColor: "#73ddff",
    rimLightIntensity: 2.9,
    emissiveColor: "#223a66",
    emissiveIntensity: 0.42,
    overlayRadial: "rgba(138, 186, 255, 0.24)",
    overlayTop: "rgba(11, 22, 44, 0.08)",
    overlayBottom: "rgba(11, 22, 44, 0.36)",
    stateColors: {
      0: [0, 0, 0],
      1: [0.42, 0.86, 1.0],
      2: [0.39, 0.95, 0.66],
      3: [1.0, 0.67, 0.24],
      4: [0.73, 0.4, 0.95],
    },
  },
  aurora: {
    id: "aurora",
    label: "Aurora",
    background: "#08191e",
    fog: "#08191e",
    ambientIntensity: 2.35,
    hemiSky: "#b8ffe9",
    hemiGround: "#123a2f",
    hemiIntensity: 2.45,
    keyLightColor: "#e2fff6",
    keyLightIntensity: 3.0,
    fillLightColor: "#8effe0",
    fillLightIntensity: 2.7,
    rimLightColor: "#4fe2ff",
    rimLightIntensity: 2.85,
    emissiveColor: "#184b4a",
    emissiveIntensity: 0.46,
    overlayRadial: "rgba(117, 255, 212, 0.2)",
    overlayTop: "rgba(8, 24, 26, 0.06)",
    overlayBottom: "rgba(8, 24, 26, 0.32)",
    stateColors: {
      0: [0, 0, 0],
      1: [0.39, 0.98, 0.88],
      2: [0.6, 1.0, 0.58],
      3: [0.66, 0.86, 1.0],
      4: [0.82, 0.62, 1.0],
    },
  },
  ember: {
    id: "ember",
    label: "Ember",
    background: "#1a0f0d",
    fog: "#1a0f0d",
    ambientIntensity: 2.15,
    hemiSky: "#ffd9c6",
    hemiGround: "#402117",
    hemiIntensity: 2.25,
    keyLightColor: "#ffe8d5",
    keyLightIntensity: 3.05,
    fillLightColor: "#ffb077",
    fillLightIntensity: 2.55,
    rimLightColor: "#ffd483",
    rimLightIntensity: 2.95,
    emissiveColor: "#5a2c1f",
    emissiveIntensity: 0.44,
    overlayRadial: "rgba(255, 164, 120, 0.22)",
    overlayTop: "rgba(34, 16, 12, 0.06)",
    overlayBottom: "rgba(34, 16, 12, 0.34)",
    stateColors: {
      0: [0, 0, 0],
      1: [1.0, 0.74, 0.43],
      2: [1.0, 0.92, 0.55],
      3: [1.0, 0.55, 0.3],
      4: [0.95, 0.45, 0.6],
    },
  },
};

export const VOXEL_STYLES: Record<VoxelStyleId, VoxelStyle> = {
  cube: {
    id: "cube",
    label: "Cube",
    geometry: [0.88, 0.88, 0.88],
    scaleCharged: 1.08,
    scaleAlive: 0.92,
    scaleDecay: 0.78,
  },
  chip: {
    id: "chip",
    label: "Chip",
    geometry: [0.92, 0.46, 0.92],
    scaleCharged: 1.02,
    scaleAlive: 0.9,
    scaleDecay: 0.72,
  },
  column: {
    id: "column",
    label: "Column",
    geometry: [0.58, 1.06, 0.58],
    scaleCharged: 1.12,
    scaleAlive: 0.88,
    scaleDecay: 0.72,
  },
};
