'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import {
  easeInOutSine,
  easeOutCubic,
  getStages,
  range,
} from '@/lib/timeline'

/*
 * Red centre line that straightens into a ledge.
 *
 * Buyer requirement (animation-details.mp4 / shapes.pptx walkthrough):
 * a red centre line runs through the prism — apex down the mid-line to the
 * base — and later straightens into a horizontal ledge. Sunny deferred this
 * in the original walkthrough ("we can do later, another problem"); this
 * component is that stage.
 *
 * Behaviour in chapter units:
 *   ~1.2–2.2  the line fades in along the prism's vertical centre
 *   ~2.2–4.0  it holds, reading as the structural spine of the solid
 *   ~5.5–6.6  it straightens (pitch flattens) and slides into a ledge
 *             as the bands become the sliver / ribbons
 *   ~6.6–7.0  settled ledge holds beside the ribbon stack
 */

const LINE_COLOR = new THREE.Color('#FF2D2D')
const LEDGE_COLOR = new THREE.Color('#FF4040')

/** Apex and base mid-line of the procedural pyramid (y = +1 → y = −1 at x=0,z=0). */
const VERT_A = new THREE.Vector3(0, 1, 0)
const VERT_B = new THREE.Vector3(0, -1, 0)

/** Settled ledge: horizontal segment near the ribbon stack. */
const LEDGE_A = new THREE.Vector3(-0.9, -0.15, 0.7)
const LEDGE_B = new THREE.Vector3(1.2, -0.15, 0.7)

function buildLineGeometry() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(2 * 3), 3)
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

    // Fade in during the section sweep; hold through the cut and grid.
    const lineIn = easeOutCubic(range(units, 1.15, 1.85))
    // Straighten into the ledge as the sliver rises (chapter 6).
    const toLedge =
      easeInOutSine(stage.sliver) * 0.55 + easeInOutSine(stage.ribbons) * 0.45
    const opacity = lineIn * (1 - 0.15 * stage.settle)

    const group = groupRef.current
    const line = lineRef.current
    if (!group || !line) return

    const visible = opacity > 0.004
    group.visible = visible
    if (!visible) return

    group.scale.setScalar(controller.stage.scale)

    scratch.a.lerpVectors(VERT_A, LEDGE_A, toLedge)
    scratch.b.lerpVectors(VERT_B, LEDGE_B, toLedge)

    const pos = geometry.attributes.position
    pos.array[0] = scratch.a.x
    pos.array[1] = scratch.a.y
    pos.array[2] = scratch.a.z
    pos.array[3] = scratch.b.x
    pos.array[4] = scratch.b.y
    pos.array[5] = scratch.b.z
    pos.needsUpdate = true

    scratch.colour.copy(LINE_COLOR).lerp(LEDGE_COLOR, toLedge)
    line.material.color.copy(scratch.colour)
    line.material.opacity = opacity * (0.75 + 0.25 * toLedge)
  })

  return (
    <group ref={groupRef} visible={false}>
      <line ref={lineRef} geometry={geometry} renderOrder={15} frustumCulled={false}>
        <lineBasicMaterial
          color={LINE_COLOR}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={true}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </line>
    </group>
  )
}
