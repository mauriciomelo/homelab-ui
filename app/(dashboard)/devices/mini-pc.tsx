"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useSpring, animated } from "@react-spring/three";
import { DeviceStatus } from "@/app/api/schemas";
import { statusLedProps } from "./statusLedProps";

const miniPcModelPath = "/models/minipc.gltf";

function MiniPC({
  status,
  adopting,
}: {
  status: DeviceStatus;
  adopting: boolean;
}) {
  const { scene } = useGLTF(miniPcModelPath);

  const led = statusLedProps(status);
  const ledColor = led.color;
  const ledPosition = new THREE.Vector3(0.5, -0.8, 1.18);

  const { scale, rotation, position } = useSpring({
    from: {
      scale: 1,
      rotation: [-0.9, -0.8, -0.2],
      position: [3, -2, -4],
    },
    to: {
      scale: adopting ? 1.2 : 1,
      rotation: [0, 0, 0],
      position: [0, 0, 0],
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
      position={position as any}
      scale={scale as any}
      rotation={rotation as any}
    >
      {/* GLTF Mini PC Model */}
      <primitive object={scene} scale={[20, 20, 20]} position={[0, -0.5, 0]} />

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
    <div className="w-full min-w-[400px] h-[500px] rounded-lg overflow-hidden">
      <Canvas camera={{ position: [0, 0.7, 5], fov: 70 }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <MiniPC status={status} adopting={adopting} />
        <Environment preset="studio" environmentIntensity={0.2} />
        <OrbitControls enableZoom={true} enablePan={false} autoRotate={false} />
      </Canvas>
    </div>
  );
}

useGLTF.preload(miniPcModelPath);
