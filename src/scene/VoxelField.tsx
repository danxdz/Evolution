import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RenderCell } from "../types/sim";
import { stateColor } from "./colors";
import { WORLD_SCALE } from "./scale";
import { SceneTheme, VoxelStyle } from "./themes";

type VoxelFieldProps = {
  cells: RenderCell[];
  autoRotate: boolean;
  generation: number;
  theme: SceneTheme;
  voxelStyle: VoxelStyle;
};

export function VoxelField({ cells, autoRotate, generation, theme, voxelStyle }: VoxelFieldProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const groupRef = useRef<THREE.Group>(null);
  const geometryArgs = useMemo<[number, number, number]>(
    () => [voxelStyle.geometry[0] * WORLD_SCALE, voxelStyle.geometry[1] * WORLD_SCALE, voxelStyle.geometry[2] * WORLD_SCALE],
    [voxelStyle],
  );

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.count = cells.length;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const baseScale = cell.state === 3 ? voxelStyle.scaleCharged : cell.state === 1 ? voxelStyle.scaleAlive : cell.state === 4 ? voxelStyle.scaleDecay : 1.0;
      const fadeScale = 0.88 + 0.12 * Math.exp(-cell.age / 26);
      const scale = baseScale * fadeScale;
      dummy.position.set(cell.x * WORLD_SCALE, cell.y * WORLD_SCALE, cell.z * WORLD_SCALE);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(stateColor(cell.state, cell.energy, cell.age, generation, cell.y, theme));
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [cells, color, dummy, generation, theme, voxelStyle]);

  useFrame((_, delta) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, Math.max(cells.length, 1)]} castShadow receiveShadow>
        <boxGeometry args={geometryArgs} />
        <meshStandardMaterial
          vertexColors
          metalness={0.08}
          roughness={0.3}
          emissive={theme.emissiveColor}
          emissiveIntensity={theme.emissiveIntensity}
          transparent
          opacity={0.98}
        />
      </instancedMesh>
    </group>
  );
}
