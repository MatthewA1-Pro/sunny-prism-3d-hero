'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { sectionHalfExtent } from '@/lib/prismGeometry'
import {
  easeInOutSine,
  easeOutCubic,
  getStages,
  lerp,
  range,
  prismYaw,
  prismPitch,
  prismRecede,
  PRISM_SHAPE,
} from '@/lib/timeline'

const PURPLE = new THREE.Color('#8B5CFF')
const PURPLE_EDGE = new THREE.Color('#D4C0FF')
const GREEN = new THREE.Color('#3DCC6E')

function buildPlaneGeo() {
  const geo = new THREE.PlaneGeometry(2, 2)
  geo.rotateX(-Math.PI / 2)
  return geo
}

function buildBaseGeo() {
  const geo = new THREE.PlaneGeometry(2, 2)
  geo.rotateX(-Math.PI / 2)
  return geo
}

function buildSlabGeo() {
  return new THREE.PlaneGeometry(1, 1)
}

function buildOutlineGeo() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}

function buildCenterLineGeo() {
  const geo = new THREE.BufferGeometry()
  const positions = new Float32Array([0, 1, 0, 0, -1, 0])
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2)
  return geo
}

function writeOutline(attr, h, y) {
  const a = attr.array
  const corners = [
    [-h, y, -h],
    [h, y, -h],
    [h, y, h],
    [-h, y, h],
    [-h, y, -h],
  ]
  for (let i = 0; i < 5; i++) {
    a[i * 3] = corners[i][0]
    a[i * 3 + 1] = corners[i][1]
    a[i * 3 + 2] = corners[i][2]
  }
  attr.needsUpdate = true
}

export default function SectionFill({ controllerRef }) {
  const groupRef = useRef(null)
  const planeRef = useRef(null)
  const outlineRef = useRef(null)
  const baseRef = useRef(null)
  const slabRef = useRef(null)
  const centerRef = useRef(null)

  const planeGeo = useMemo(() => buildPlaneGeo(), [])
  const outlineGeo = useMemo(() => buildOutlineGeo(), [])
  const baseGeo = useMemo(() => buildBaseGeo(), [])
  const slabGeo = useMemo(() => buildSlabGeo(), [])
  const centerGeo = useMemo(() => buildCenterLineGeo(), [])

  useEffect(
    () => () => {
      planeGeo.dispose()
      outlineGeo.dispose()
      baseGeo.dispose()
      slabGeo.dispose()
      centerGeo.dispose()
    },
    [planeGeo, outlineGeo, baseGeo, slabGeo, centerGeo]
  )

  useFrame(() => {
    const controller = controllerRef.current
    const units = controller.stage.units
    const stage = getStages(units)

    const fadeIn = easeOutCubic(range(units, 0.85, 1.2))
    const fadeOut = 1 - easeInOutSine(range(units, 1.9, 2.3))
    const opacity = fadeIn * fadeOut

    const group = groupRef.current
    if (!group) return

    const visible = opacity > 0.01
    group.visible = visible
    if (!visible) return

    const recede = prismRecede(units)
    const scale = controller.stage.scale * lerp(1, 0.58, recede)
    group.scale.set(
      PRISM_SHAPE[0] * scale,
      PRISM_SHAPE[1] * scale,
      PRISM_SHAPE[2] * scale
    )
    group.rotation.y = prismYaw(units)
    group.rotation.x = prismPitch(units)
    group.position.set(
      lerp(0, -1.9, recede) * controller.stage.scale,
      lerp(0, 0.25, recede) * controller.stage.scale,
      lerp(0, -1.1, recede) * controller.stage.scale
    )

    const scanT = easeInOutSine(stage.section)
    const y = lerp(0.95, -0.95, scanT)
    const h = sectionHalfExtent(y)

    if (planeRef.current) {
      planeRef.current.position.set(0, y, 0)
      planeRef.current.scale.set(h, 1, h)
      planeRef.current.material.opacity = opacity * 0.85
    }

    writeOutline(outlineGeo.attributes.position, h, y)
    if (outlineRef.current) {
      outlineRef.current.material.opacity = opacity * 0.95
    }

    if (baseRef.current) {
      baseRef.current.position.set(0, -0.98, 0)
      baseRef.current.material.opacity = opacity * 0.7
    }

    if (slabRef.current) {
      const slabFade = opacity * (1 - easeInOutSine(scanT))
      slabRef.current.material.opacity = slabFade * 0.65
      slabRef.current.position.set(0, lerp(0.25, -0.35, scanT), 0)
      const slabH = lerp(1.2, 0.35, scanT)
      const slabW = lerp(0.42, 0.12, scanT)
      slabRef.current.scale.set(slabW, slabH, 1)
    }

    if (centerRef.current) {
      centerRef.current.material.opacity = opacity * 0.55
    }
  })

  const sharedMat = {
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  }

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={planeRef} geometry={planeGeo} renderOrder={20} frustumCulled={false}>
        <meshBasicMaterial color={PURPLE} opacity={0} {...sharedMat} />
      </mesh>
      <line ref={outlineRef} geometry={outlineGeo} renderOrder={21} frustumCulled={false}>
        <lineBasicMaterial color={PURPLE_EDGE} opacity={0} {...sharedMat} />
      </line>
      <mesh ref={slabRef} geometry={slabGeo} renderOrder={20} frustumCulled={false}>
        <meshBasicMaterial color={PURPLE} opacity={0} {...sharedMat} />
      </mesh>
      <line ref={centerRef} geometry={centerGeo} renderOrder={21} frustumCulled={false}>
        <lineBasicMaterial color={PURPLE_EDGE} opacity={0} {...sharedMat} />
      </line>
      <mesh ref={baseRef} geometry={baseGeo} renderOrder={19} frustumCulled={false}>
        <meshBasicMaterial color={GREEN} opacity={0} {...sharedMat} />
      </mesh>
    </group>
  )
}
