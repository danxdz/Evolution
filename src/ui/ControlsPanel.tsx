import { Pause, Play, RotateCcw, Shuffle, SkipForward } from "lucide-react";
import { RuleLevel, SeedConfig } from "../types/sim";
import { ThemeId, THEMES, VoxelStyleId, VOXEL_STYLES } from "../scene/themes";
import { Panel } from "./Panel";

type ControlsPanelProps = {
  playing: boolean;
  ticksPerSecond: number;
  autoRotate: boolean;
  themeId: ThemeId;
  voxelStyleId: VoxelStyleId;
  seedConfig: SeedConfig;
  onTogglePlaying: () => void;
  onStep: (count?: number) => void;
  onReset: () => void;
  onRandomize: () => void;
  onTicksPerSecondChange: (value: number) => void;
  onSeedConfigChange: (next: SeedConfig) => void;
  onAutoRotateChange: (value: boolean) => void;
  onThemeChange: (value: ThemeId) => void;
  onVoxelStyleChange: (value: VoxelStyleId) => void;
};

export function ControlsPanel({
  playing,
  ticksPerSecond,
  autoRotate,
  themeId,
  voxelStyleId,
  seedConfig,
  onTogglePlaying,
  onStep,
  onReset,
  onRandomize,
  onTicksPerSecondChange,
  onSeedConfigChange,
  onAutoRotateChange,
  onThemeChange,
  onVoxelStyleChange,
}: ControlsPanelProps) {
  const toggleRuleLevel = (levels: RuleLevel[], level: RuleLevel) => {
    if (levels.includes(level)) {
      const next = levels.filter((v) => v !== level);
      return next.length === 0 ? levels : next;
    }
    return [...levels, level].sort((a, b) => a - b);
  };

  const ruleLevels: RuleLevel[] = [1, 2, 3, 4, 5, 6];

  return (
    <Panel title="Controls">
      <div className="button-grid">
        <button onClick={onTogglePlaying} className="btn">
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => onStep(1)} className="btn">
          <SkipForward size={16} /> Step
        </button>
        <button onClick={onReset} className="btn">
          <RotateCcw size={16} /> Reset
        </button>
        <button onClick={onRandomize} className="btn">
          <Shuffle size={16} /> New Seed
        </button>
      </div>

      <div className="stack">
        <div>
          <div className="label-row">
            <span>Sim Speed</span>
            <span>{ticksPerSecond} tps</span>
          </div>
          <input type="range" min={1} max={40} value={ticksPerSecond} onChange={(e) => onTicksPerSecondChange(Number(e.target.value))} className="slider" />
        </div>

        <div className="two-col">
          <label className="field">
            <span>Density</span>
            <input
              type="number"
              min={0.01}
              max={0.5}
              step={0.01}
              value={seedConfig.density}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) {
                  onSeedConfigChange({ ...seedConfig, density: Math.max(0.01, Math.min(0.5, value)) });
                }
              }}
            />
          </label>
          <label className="field">
            <span>Burst Bias</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.01}
              value={seedConfig.burstBias}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isFinite(value)) {
                  onSeedConfigChange({ ...seedConfig, burstBias: Math.max(0, Math.min(1, value)) });
                }
              }}
            />
          </label>
        </div>

        <label className="toggle-field">
          <span>Auto rotate</span>
          <input type="checkbox" checked={autoRotate} onChange={(e) => onAutoRotateChange(e.target.checked)} />
        </label>

        <label className="field">
          <span>Init Mode</span>
          <select
            value={seedConfig.initMode}
            onChange={(e) => {
              onSeedConfigChange({ ...seedConfig, initMode: e.target.value as SeedConfig["initMode"] });
            }}
          >
            <option value="random_fill">Random Fill</option>
            <option value="preset_shell">Preset Shell</option>
          </select>
        </label>

        <label className="field">
          <span>Theme</span>
          <select value={themeId} onChange={(e) => onThemeChange(e.target.value as ThemeId)}>
            {Object.values(THEMES).map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Voxel Style</span>
          <select value={voxelStyleId} onChange={(e) => onVoxelStyleChange(e.target.value as VoxelStyleId)}>
            {Object.values(VOXEL_STYLES).map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rules-box">
          <div className="rules-title">Biotic Ruleset (B/S/L)</div>

          <div className="rules-row">
            <div className="rules-label">Birth (B)</div>
            <div className="rules-pills">
              {ruleLevels.map((level) => (
                <button
                  key={`b-${level}`}
                  type="button"
                  className={`rule-pill ${seedConfig.rules.birthLevels.includes(level) ? "rule-pill-active birth-active" : ""}`}
                  onClick={() =>
                    onSeedConfigChange({
                      ...seedConfig,
                      rules: {
                        ...seedConfig.rules,
                        birthLevels: toggleRuleLevel(seedConfig.rules.birthLevels, level),
                      },
                    })
                  }
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="rules-row">
            <div className="rules-label">Survival (S)</div>
            <div className="rules-pills">
              {ruleLevels.map((level) => (
                <button
                  key={`s-${level}`}
                  type="button"
                  className={`rule-pill ${seedConfig.rules.survivalLevels.includes(level) ? "rule-pill-active survive-active" : ""}`}
                  onClick={() =>
                    onSeedConfigChange({
                      ...seedConfig,
                      rules: {
                        ...seedConfig.rules,
                        survivalLevels: toggleRuleLevel(seedConfig.rules.survivalLevels, level),
                      },
                    })
                  }
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="rules-row">
            <div className="rules-label">Lifespan (L)</div>
            <div className="rules-value">{seedConfig.rules.lifespan}G</div>
          </div>
          <input
            type="range"
            min={5}
            max={500}
            step={5}
            value={seedConfig.rules.lifespan}
            onChange={(e) =>
              onSeedConfigChange({
                ...seedConfig,
                rules: {
                  ...seedConfig.rules,
                  lifespan: Number(e.target.value),
                },
              })
            }
            className="slider"
          />

          <label className="toggle-field">
            <span>Immortality Mode</span>
            <input
              type="checkbox"
              checked={seedConfig.rules.immortality}
              onChange={(e) =>
                onSeedConfigChange({
                  ...seedConfig,
                  rules: {
                    ...seedConfig.rules,
                    immortality: e.target.checked,
                  },
                })
              }
            />
          </label>
        </div>
      </div>
    </Panel>
  );
}
