'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import {
  easeInOutSine,
  easeOutCubic,
  getStages,
  range,
  prismYaw,
  prismPitch,
  prismRecede,
  PRISM_SHAPE,
  lerp,
} from '@/lib/timeline'

/*
 * Red centre line that straightens into a ledge.
 * Drawn with depthTest false so it is never hidden by the solid.
 */

const LINE_COLOR = new THREE.Color('#FF2D2D')
const LEDGE_COLOR = new THREE.Color('#FF5050')

const VERT_A = new THREE.Vector3(0, 1, 0)
const VERT_B = new THREE.Vector3(0, -1, 0)
const LEDGE_A = new THREE.Vector3(-0.9, -0.15, 0.7)
const LEDGE_B = new THREE.Vector3(1.2, -0.15, 0.7)

function buildLineGeometry() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      // Starts at the centre line; the frame loop moves it to the ledge.
      new Float32Array([VERT_A.x, VERT_A.y, VERT_A.z, VERT_B.x, VERT_B.y, VERT_B.z]),
      3
    )
  )
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)
  return geo
}

export default function CentreLine({ controllerRef }) {
  const groupRef = useRef(null)
  const lineRef = useRef(null)
  const geometry = useMemo(() => buildLineGeometry(), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  const scratch = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      colour: new THREE.Color(),
    }),
    []
  )

  useFrame(() => {
    const controller = controllerRef.current
    const units = controller.stage.units
    const stage = getStages(units)

    const lineIn = easeOutCubic(range(units, 0.2, 1.2))
    const toLedge =
      easeInOutSine(stage.sliver) * 0.55 + easeInOutSine(stage.ribbons) * 0.45
    const opacity = Math.max(0.2, lineIn) * (1 - 0.1 * stage.settle)

    const group = groupRef.current
    const line = lineRef.current
    if (!group || !line) return

    group.visible = opacity > 0.02

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

    scratch.a.lerpVectors(VERT_A, LEDGE_A, toLedge)
    scratch.b.lerpVectors(VERT_B, LEDGE_B, toLedge)

    // Through the line rather than the memoized geometry: React's compiler
    // holds a value created in a hook immutable, and this writes every frame.
    const pos = lineRef.current.geometry.attributes.position
    pos.array[0] = scratch.a.x
    pos.array[1] = scratch.a.y
    pos.array[2] = scratch.a.z
    pos.array[3] = scratch.b.x
    pos.array[4] = scratch.b.y
    pos.array[5] = scratch.b.z
    pos.needsUpdate = true

    scratch.colour.copy(LINE_COLOR).lerp(LEDGE_COLOR, toLedge)
    line.material.color.copy(scratch.colour)
    line.material.opacity = opacity
  })

  return (
    <group ref={groupRef} visible>
      <line ref={lineRef} geometry={geometry} renderOrder={28} frustumCulled={false}>
        <lineBasicMaterial
          color={LINE_COLOR}
          transparent
          opacity={0.85}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </line>
    </group>
  )
}
