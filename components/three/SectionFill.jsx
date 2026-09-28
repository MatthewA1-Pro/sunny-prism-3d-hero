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

/**
 * Filled cross-section plane — matches gif2_sheet / shapes.pptx section animation.
 *
 * A solid purple rectangle travels apex → base inside the prism. Green base
 * face is lit while the section is active.
 */

const PURPLE = new THREE.Color('#8B5CFF')
const PURPLE_EDGE = new THREE.Color('#C4A8FF')
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

function buildOutlineGeo() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
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

  const planeGeo = useMemo(() => buildPlaneGeo(), [])
  const outlineGeo = useMemo(() => buildOutlineGeo(), [])
  const baseGeo = useMemo(() => buildBaseGeo(), [])

  useEffect(
    () => () => {
      planeGeo.dispose()
      outlineGeo.dispose()
      baseGeo.dispose()
    },
    [planeGeo, outlineGeo, baseGeo]
  )

  useFrame(() => {
    const controller = controllerRef.current
    const units = controller.stage.units
    const stage = getStages(units)

    const fadeIn = easeOutCubic(range(units, 0.85, 1.25))
    const fadeOut = 1 - easeInOutSine(range(units, 1.95, 2.35))
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
      planeRef.current.material.opacity = opacity * 0.72
    }

    writeOutline(outlineGeo.attributes.position, h, y)
    if (outlineRef.current) {
      outlineRef.current.material.opacity = opacity * 0.95
    }

    if (baseRef.current) {
      baseRef.current.position.set(0, -0.98, 0)
      baseRef.current.material.opacity = opacity * 0.45
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={planeRef} geometry={planeGeo} renderOrder={20} frustumCulled={false}>
        <meshBasicMaterial
          color={PURPLE}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <line ref={outlineRef} geometry={outlineGeo} renderOrder={21} frustumCulled={false}>
        <lineBasicMaterial
          color={PURPLE_EDGE}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </line>

      <mesh ref={baseRef} geometry={baseGeo} renderOrder={19} frustumCulled={false}>
        <meshBasicMaterial
          color={GREEN}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
