import * as THREE from "three";
import { CellState } from "../types/sim";
import { SceneTheme } from "./themes";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function stateColor(state: CellState, energy: number, age: number, generation: number, y: number, theme: SceneTheme) {
  const t = energy / 255;
  const base = theme.stateColors[state];
  const ageT = clamp(age / 20, 0, 1);
  const lifeFade = 1 - ageT * 0.9;
  const youngTint = (1 - ageT) * 0.24;
  const pulse = 0.9 + 0.1 * Math.sin(generation * 0.2 + age * 0.14 + y * 0.24);
  const vertical = 0.9 + clamp((y + 18) * 0.01, 0, 0.18);
  const intensity = lifeFade * pulse * vertical;

  return new THREE.Color(
    Math.min(1, (base[0] * (0.78 + t * 0.42) + youngTint) * intensity),
    Math.min(1, (base[1] * (0.78 + t * 0.42) + youngTint) * intensity),
    Math.min(1, (base[2] * (0.78 + t * 0.42) + youngTint) * intensity),
  );
}
