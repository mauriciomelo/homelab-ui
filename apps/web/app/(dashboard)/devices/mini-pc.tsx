'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useSpring, animated } from '@react-spring/three';
import { DeviceStatus } from '@/app/constants';
import { statusLedProps } from './statusLedProps';

export const MINI_PC_MODEL = '/models/minipc.gltf';

type VectorLike = [number, number, number];

type LedColor = ReturnType<typeof statusLedProps>['color'];

function adaptLedColor(color: LedColor): string {
  switch (color) {
    case 'blue':
      return '#00346e';
    default:
      return color;
  }
}

function MiniPC({
  status,
  adopting,
}: {
  status: DeviceStatus;
  adopting: boolean;
}) {
  const { scene } = useGLTF(MINI_PC_MODEL);

  const led = statusLedProps(status);
  const ledColor = adaptLedColor(led.color);

  const pcBodyPosition = new THREE.Vector3(0, 0, 0);

  const ledPosition = pcBodyPosition
    .clone()
    .add(new THREE.Vector3(0.5, -0.35, 1.18));

  const { scale, rotation, position } = useSpring({
    from: {
      scale: 1,
      rotation: [-0.5, -1, 0] satisfies VectorLike,
      position: [3, -3, -7] satisfies VectorLike,
    },
    to: {
      scale: adopting ? 0.9 : 1,
      rotation: [0, 0, 0] satisfies VectorLike,
      position: [0, 0, 0] satisfies VectorLike,
    },
    config: { mass: 2, tension: 150, friction: 40 },
    loop: false,
  });
  const ledAnimation = useSpring({
    from: { intensity: 0.1, emissiveIntensity: 5 },
    to: { intensity: 0.5, emissiveIntensity: 10 },
    config: { duration: adopting ? 100 : 200 },
    loop: { reverse: true },
  });

  return (
    <animated.group
      position={position}
      scale={scale}
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      rotation={rotation as unknown as VectorLike}
    >
      {/* GLTF Mini PC Model */}
      <primitive
        object={scene}
        scale={[20, 20, 20]}
        position={pcBodyPosition}
      />

      {/* LED sphere with emissive light */}
      <mesh position={ledPosition}>
        <sphereGeometry args={[0.03, 16, 16]} />
        <animated.meshStandardMaterial
          color={ledColor}
          emissive={ledColor}
          emissiveIntensity={led.animate ? ledAnimation.emissiveIntensity : 10}
        />
      </mesh>

      {/* LED glow effect */}
      <animated.pointLight
        position={ledPosition.clone().add(new THREE.Vector3(0, 0, 0.03))}
        color={ledColor}
        intensity={led.animate ? ledAnimation.intensity : 0.2}
        distance={1}
      />
    </animated.group>
  );
}

export function MiniPCScene({
  status,
  adopting,
}: {
  status: DeviceStatus;
  adopting: boolean;
}) {
  return (
    <div className="h-[150px] w-full overflow-hidden rounded-lg">
      <Canvas camera={{ position: [0, 0.7, 5], fov: 25 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <MiniPC status={status} adopting={adopting} />
        <Environment preset="studio" environmentIntensity={0.15} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableRotate={false}
          autoRotate={false}
        />
      </Canvas>
    </div>
  );
}
