'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import { easeInOutSine, getStages, gridLevels } from '@/lib/timeline'

/*
 * The ground field under the prism (shapes.pptx `image4.png`).
 *
 * Sunny: as the view pulls back the same field "brightens up" and resolves
 * into much more granularity — "this is a 10 by 10, this is like a 50 by 50 as
 * you're zooming out". So two grids are drawn on the same plane: the coarse
 * one fades in first and the fine one fades in over it, which reads as the
 * field subdividing rather than being replaced.
 *
 * It also gives the cast shadow of the next chapter a surface to fall on.
 */

const SIZE = 26
const COARSE = 10
const FINE = 50
const GRID_Y = -1.62

/*
 * The fine field is drawn over a smaller patch than the coarse one. At full
 * extent its lines fall closer together than a pixel out toward the far edge
 * and alias into horizontal banding across the screen; kept near, the same
 * fifty divisions read as the granularity Sunny is pointing at.
 */
const FINE_SIZE = 11

function buildGrid(divisions, size = SIZE) {
  const step = size / divisions
  const half = size / 2
  const positions = new Float32Array((divisions + 1) * 12)

  let o = 0
  for (let i = 0; i <= divisions; i++) {
    const t = -half + i * step
    // Line along X, then along Z.
    positions[o++] = -half
    positions[o++] = 0
    positions[o++] = t
    positions[o++] = half
    positions[o++] = 0
    positions[o++] = t

    positions[o++] = t
    positions[o++] = 0
    positions[o++] = -half
    positions[o++] = t
    positions[o++] = 0
    positions[o++] = half
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}

export default function GroundGrid({ controllerRef }) {
  const groupRef = useRef(null)
  const coarseRef = useRef(null)
  const fineRef = useRef(null)

  const coarseGeometry = useMemo(() => buildGrid(COARSE), [])
  const fineGeometry = useMemo(() => buildGrid(FINE, FINE_SIZE), [])

  useEffect(
    () => () => {
      coarseGeometry.dispose()
      fineGeometry.dispose()
    },
    [coarseGeometry, fineGeometry]
  )

  useFrame(() => {
    const controller = controllerRef.current
    const levels = gridLevels(controller.stage.units)
    // The grid steps back while the labelled ribbons are being read.
    const quiet = 1 - 0.7 * easeInOutSine(getStages(controller.stage.units).ribbons)

    // The grid shares the prism's scale, so it stays the prism's ground
    // wherever the chapter anchors put it.
    if (groupRef.current) {
      groupRef.current.scale.setScalar(controller.stage.scale)
      // The ground is the prism's own ground: its height has to follow the
      // prism's size, or the floor drifts away from the base as the chapters
      // resize it and the cast shadow lands on a different plane from the grid.
      groupRef.current.position.y = GRID_Y * controller.stage.scale
      groupRef.current.visible = levels.coarse > 0.002
    }

    if (coarseRef.current) coarseRef.current.material.opacity = levels.coarse * 0.5 * quiet
    if (fineRef.current) fineRef.current.material.opacity = levels.fine * 0.17 * quiet
  })

  return (
    <group ref={groupRef} position={[0, GRID_Y, 0]} visible={false}>
      <lineSegments ref={coarseRef} geometry={coarseGeometry} renderOrder={-1}>
        <lineBasicMaterial
          color="#7d6cff"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <lineSegments ref={fineRef} geometry={fineGeometry} renderOrder={-1}>
        <lineBasicMaterial
          color="#5f7cff"
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
    </group>
  )
}
