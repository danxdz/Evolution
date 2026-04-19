import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { RenderCell } from "../types/sim";
import { WORLD_SCALE } from "./scale";
import { VoxelField } from "./VoxelField";
import { SceneTheme, VoxelStyle } from "./themes";

type SceneProps = {
  cells: RenderCell[];
  autoRotate: boolean;
  generation: number;
  theme: SceneTheme;
  voxelStyle: VoxelStyle;
  onCameraMove?: (x: number, y: number, z: number) => void;
};

function CameraTracker({ onCameraMove }: { onCameraMove?: (x: number, y: number, z: number) => void }) {
  const { camera } = useThree();
  const last = useRef({ x: Number.NaN, y: Number.NaN, z: Number.NaN });

  useFrame((state) => {
    if (!onCameraMove) return;
    const controls = state.controls as { target?: { x: number; y: number; z: number } } | undefined;
    const focus = controls?.target ?? camera.position;
    const x = focus.x / WORLD_SCALE;
    const y = focus.y / WORLD_SCALE;
    const z = focus.z / WORLD_SCALE;
    if (Math.abs(x - last.current.x) < 0.35 && Math.abs(y - last.current.y) < 0.35 && Math.abs(z - last.current.z) < 0.35) {
      return;
    }
    last.current = { x, y, z };
    onCameraMove(x, y, z);
  });

  return null;
}

export function Scene({ cells, autoRotate, generation, theme, voxelStyle, onCameraMove }: SceneProps) {
  const s = WORLD_SCALE;
  return (
    <>
      <color attach="background" args={[theme.background]} />
      <fog attach="fog" args={[theme.fog, 70, 220]} />
      <ambientLight intensity={theme.ambientIntensity} />
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemiIntensity]} />
      <directionalLight position={[16, 24, 16]} intensity={theme.keyLightIntensity} color={theme.keyLightColor} castShadow />
      <directionalLight position={[-20, 16, -14]} intensity={theme.fillLightIntensity} color={theme.fillLightColor} />
      <pointLight position={[0, 16 * s, 0]} intensity={58} distance={170 * s} color={theme.rimLightColor} />
      <pointLight position={[24 * s, 12 * s, 20 * s]} intensity={theme.rimLightIntensity * 16} distance={130 * s} color={theme.keyLightColor} />
      <pointLight position={[-24 * s, 10 * s, -20 * s]} intensity={theme.rimLightIntensity * 14} distance={130 * s} color={theme.fillLightColor} />
      <pointLight position={[0, 42 * s, 0]} intensity={66} distance={260 * s} color="#ffffff" />
      <VoxelField cells={cells} autoRotate={autoRotate} generation={generation} theme={theme} voxelStyle={voxelStyle} />
      <CameraTracker onCameraMove={onCameraMove} />
      <OrbitControls
        makeDefault
        enableDamping
        enablePan
        enableZoom
        dampingFactor={0.08}
        rotateSpeed={0.8}
        panSpeed={0.95}
        zoomSpeed={1.15}
        maxDistance={18}
        minDistance={0.05}
      />
    </>
  );
}
