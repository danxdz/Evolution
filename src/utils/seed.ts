import { hashSeed, makeRandomSeed, XorShift32 } from "../engine/random";
import { SeedConfig } from "../types/sim";

function round2(value: number) {
  return Number(value.toFixed(2));
}

export function buildRandomizedSeedConfig(previous: SeedConfig): SeedConfig {
  const seed = makeRandomSeed();
  const rng = new XorShift32(hashSeed(seed));
  return {
    ...previous,
    seed,
    density: round2(0.05 + rng.nextFloat() * 0.09),
    burstBias: round2(0.38 + rng.nextFloat() * 0.45),
    initMode: rng.nextFloat() > 0.75 ? "preset_shell" : "random_fill",
    rules: {
      ...previous.rules,
      birthLevels: [...previous.rules.birthLevels],
      survivalLevels: [...previous.rules.survivalLevels],
    },
  };
}
