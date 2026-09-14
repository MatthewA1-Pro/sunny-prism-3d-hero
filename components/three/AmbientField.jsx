'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { ambientLevel } from '@/lib/timeline'

/*
 * Ambient orbit lines and particles around the prism — the storyboard's
 * "subtle ambient motion" for the settled hero. Faint at rest, fullest in the
 * final state (ambientLevel). Everything here is deterministic: the particle
 * field is laid out on a golden-angle spiral with hashed radii, so it is the
 * same on every load, and it only turns slowly with time.
 */

const PARTICLE_COUNT = 90
const ORBIT_Y = -0.35

/* Rings in local units of the unscaled prism (half-width 1). `tilt` lays each
 * ring almost flat so it reads as an ellipse around the prism; `phase` and
 * `speed` precess it slowly. */
const ORBITS = [
  { radius: 2.3, tilt: 1.28, roll: 0.32, phase: 0, speed: 0.05, strength: 1 },
  { radius: 1.85, tilt: 1.42, roll: -0.45, phase: 1.7, speed: -0.035, strength: 0.7 },
]

const fract = (x) => x - Math.floor(x)

function buildOrbit(radius) {
  const points = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2)
    .getPoints(160)
    .map((p) => new THREE.Vector3(p.x, p.y, 0))
  return new THREE.BufferGeometry().setFromPoints(points)
}

function buildParticles() {
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const y = 1 - (i / (PARTICLE_COUNT - 1)) * 2
    const ring = Math.sqrt(1 - y * y)
    const theta = golden * i
    const radius = 1.7 + fract(Math.sin(i * 12.9898) * 43758.5453) * 1.5

    positions[i * 3] = Math.cos(theta) * ring * radius
    positions[i * 3 + 1] = y * radius * 0.9
    positions[i * 3 + 2] = Math.sin(theta) * ring * radius
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

/** Soft round dot for the particles, generated locally (no texture fetch). */
function buildDotTexture() {
  const size = 32
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2)
      const a = Math.max(0, 1 - d)
      const i = (y * size + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(a * a * 255)
    }
  }
  const texture = new THREE.DataTexture(data, size, size)
  texture.needsUpdate = true
  return texture
}

export default function AmbientField({ controllerRef, reducedMotion }) {
  const groupRef = useRef(null)
  const orbitRefs = useRef([])
  const particlesRef = useRef(null)

  const orbitGeometries = useMemo(() => ORBITS.map((o) => buildOrbit(o.radius)), [])
  const particleGeometry = useMemo(() => buildParticles(), [])
  const dotTexture = useMemo(() => buildDotTexture(), [])

  useEffect(
    () => () => {
      orbitGeometries.forEach((geometry) => geometry.dispose())
      particleGeometry.dispose()
      dotTexture.dispose()
    },
    [orbitGeometries, particleGeometry, dotTexture]
  )

  useFrame((state) => {
    const controller = controllerRef.current
    const time = reducedMotion ? 0 : state.clock.elapsedTime
    const level = ambientLevel(controller.progress)

    // Uniform scale that follows the prism's size (the prism's own vertical
    // stretch is not applied, so the rings stay round).
    if (groupRef.current) groupRef.current.scale.setScalar(controller.stage.scale)

    for (let i = 0; i < ORBITS.length; i++) {
      const line = orbitRefs.current[i]
      if (!line) continue
      line.rotation.y = ORBITS[i].phase + time * ORBITS[i].speed
      line.material.opacity = level * ORBITS[i].strength * 0.5
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y = time * 0.03
      particlesRef.current.material.opacity = level * 0.85
    }
  })

  return (
    <group ref={groupRef}>
      {ORBITS.map((orbit, i) => (
        <lineLoop
          key={i}
          ref={(el) => {
            orbitRefs.current[i] = el
          }}
          geometry={orbitGeometries[i]}
          position={[0, ORBIT_Y, 0]}
          rotation={[orbit.tilt, orbit.phase, orbit.roll, 'YXZ']}
          renderOrder={20}
        >
          <lineBasicMaterial
            color="#8f7bff"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineLoop>
      ))}

      <points ref={particlesRef} geometry={particleGeometry} renderOrder={21}>
        <pointsMaterial
          size={0.05}
          sizeAttenuation
          map={dotTexture}
          color="#c4b5ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  )
}
