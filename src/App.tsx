import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { SimEngine } from "./engine/SimEngine";
import { Scene } from "./scene/Scene";
import { ThemeId, THEMES, VoxelStyleId, VOXEL_STYLES } from "./scene/themes";
import { Discovery, RenderCell, SeedConfig, Stats, WorldConfig } from "./types/sim";
import { buildRandomizedSeedConfig } from "./utils/seed";
import { ControlsPanel } from "./ui/ControlsPanel";
import { DiscoveryPanel } from "./ui/DiscoveryPanel";
import { SeedPanel } from "./ui/SeedPanel";
import { TelemetryPanel } from "./ui/TelemetryPanel";

export default function App() {
  const worldConfig = useMemo<WorldConfig>(
    () => ({
      dims: [36, 36, 36],
      boundary: "unbounded",
      rulesetId: "proto_ca_v1",
      rulesetVersion: "1.0.0",
    }),
    [],
  );

  const [seedConfig, setSeedConfig] = useState<SeedConfig>({
    seed: "SEED-ALPHA1",
    initMode: "random_fill",
    density: 0.08,
    burstBias: 0.62,
    rules: {
      birthLevels: [3],
      survivalLevels: [2, 3],
      lifespan: 100,
      immortality: true,
    },
  });

  const [playing, setPlaying] = useState(true);
  const [ticksPerSecond, setTicksPerSecond] = useState(12);
  const [cells, setCells] = useState<RenderCell[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [autoRotate, setAutoRotate] = useState(false);
  const [themeId, setThemeId] = useState<ThemeId>("aurora");
  const [voxelStyleId, setVoxelStyleId] = useState<VoxelStyleId>("column");
  const [seedText, setSeedText] = useState("");
  const [copied, setCopied] = useState(false);

  const theme = useMemo(() => THEMES[themeId], [themeId]);
  const voxelStyle = useMemo(() => VOXEL_STYLES[voxelStyleId], [voxelStyleId]);
  const overlayVars = useMemo(
    () =>
      ({
        "--overlay-radial": theme.overlayRadial,
        "--overlay-top": theme.overlayTop,
        "--overlay-bottom": theme.overlayBottom,
      }) as CSSProperties,
    [theme],
  );

  const engineRef = useRef<SimEngine | null>(null);
  const accumulatorRef = useRef(0);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const engine = new SimEngine(worldConfig, seedConfig);
    engineRef.current = engine;
    accumulatorRef.current = 0;
    setCells(engine.getRenderCells());
    setStats(engine.getStats());
    setDiscoveries(engine.getDiscoveries());
    setSeedText(engine.exportSeedPayload());
  }, [seedConfig, worldConfig]);

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

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const syncFromEngine = () => {
    const engine = engineRef.current;
    if (!engine) return;
    setCells([...engine.getRenderCells()]);
    setStats({ ...engine.getStats() });
    setDiscoveries([...engine.getDiscoveries()]);
  };

  const onCameraMove = (x: number, y: number, z: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.setViewCenter(x, y, z)) {
      setCells([...engine.getRenderCells()]);
    }
  };

  const doStep = (count = 1) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.step(count);
    syncFromEngine();
  };

  const reset = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.reset(seedConfig);
    syncFromEngine();
    setSeedText(engine.exportSeedPayload());
  };

  const randomizeSeed = () => {
    setSeedConfig((prev) => buildRandomizedSeedConfig(prev));
  };

  const copySeed = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    const text = engine.exportSeedPayload();
    setSeedText(text);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const importSeed = () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.importSeedPayload(seedText);
      setSeedConfig(engine.getSeedConfig());
      syncFromEngine();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid seed payload JSON.";
      alert(message);
    }
  };

  const exportSeedFile = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const blob = new Blob([engine.exportSeedPayload()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${seedConfig.seed.toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-root" style={overlayVars}>
      <Canvas
        camera={{ position: [0.55, 0.48, 0.62], fov: 72 }}
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = 1.9;
        }}
      >
        <Scene
          cells={cells}
          autoRotate={autoRotate}
          generation={stats?.generation ?? 0}
          theme={theme}
          voxelStyle={voxelStyle}
          onCameraMove={onCameraMove}
        />
      </Canvas>

      <div className="screen-overlay" />

      <div className="layout-grid">
        <aside className="panel-column">
          <ControlsPanel
            playing={playing}
            ticksPerSecond={ticksPerSecond}
            autoRotate={autoRotate}
            themeId={themeId}
            voxelStyleId={voxelStyleId}
            seedConfig={seedConfig}
            onTogglePlaying={() => setPlaying((value) => !value)}
            onStep={doStep}
            onReset={reset}
            onRandomize={randomizeSeed}
            onTicksPerSecondChange={setTicksPerSecond}
            onSeedConfigChange={setSeedConfig}
            onAutoRotateChange={setAutoRotate}
            onThemeChange={setThemeId}
            onVoxelStyleChange={setVoxelStyleId}
          />

          <SeedPanel
            seedConfig={seedConfig}
            seedText={seedText}
            copied={copied}
            onSeedConfigChange={setSeedConfig}
            onSeedTextChange={setSeedText}
            onCopy={copySeed}
            onImport={importSeed}
            onExport={exportSeedFile}
          />
        </aside>

        <section className="center-column">
          <div className="hero-chip">3D Discovery Sandbox Prototype</div>
          <div className="hero-note">Orbit to inspect structures. Pause, step, reset, and replay deterministic seeds.</div>
        </section>

        <aside className="panel-column">
          <TelemetryPanel stats={stats} />
          <DiscoveryPanel discoveries={discoveries} />
        </aside>
      </div>
    </div>
  );
}
