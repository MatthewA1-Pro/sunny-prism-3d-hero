'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

import {
  easeInOutSine,
  easeOutCubic,
  getStages,
  lerp,
  range,
} from '@/lib/timeline'

/*
 * Camera-frustum guide — buyer requirement from animation-details.mp4.
 *
 * The prism is the view volume. This draws the projection system Sunny
 * walks through in the deck:
 *   • eye at the apex (z = 0 in diagram space → apex here)
 *   • near plane (plane of projection) with width/2 · height/2 extent
 *   • far plane
 *   • red rays from the eye through the near-plane corners to the far plane
 *
 * Timeline (chapter units):
 *   1.1–2.0   frustum fades in during the cross-section sweep
 *   2.0–3.5   holds through the cut / explode
 *   3.5–5.0   softens as the grid and shadow take focus
 *   5.0–7.0   fades out so bands / ribbons own the frame
 */

const RAY_COLOR = new THREE.Color('#FF2A2A')
const PLANE_COLOR = new THREE.Color('#5B8CFF')
const NEAR_FILL = new THREE.Color('#7B5CFF')

/** Near-plane half-extents in local prism units (matches section at mid-height). */
const NEAR_HALF_W = 0.55
const NEAR_HALF_H = 0.55
/** Far-plane half-extents (larger, as the solid widens toward the base). */
const FAR_HALF_W = 1.0
const FAR_HALF_H = 1.0
/** Y positions: apex = eye, near a little below, far near the base. */
const EYE_Y = 1.0
const NEAR_Y = 0.35
const FAR_Y = -0.85

function buildRaysGeometry() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(4 * 2 * 3), 3)
  )
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5)
  return geo
}

function buildPlaneOutline() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(5 * 3), 3)
  )
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}

function buildPlaneFill() {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(6 * 3), 3)
  )
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3)
  return geo
}

function writeOutline(attr, hw, hh, y) {
  const a = attr.array
  const corners = [
    [-hw, y, -hh],
    [hw, y, -hh],
    [hw, y, hh],
    [-hw, y, hh],
    [-hw, y, -hh],
  ]
  for (let i = 0; i < 5; i++) {
    a[i * 3] = corners[i][0]
    a[i * 3 + 1] = corners[i][1]
    a[i * 3 + 2] = corners[i][2]
  }
  attr.needsUpdate = true
}

function writeFill(attr, hw, hh, y) {
  const a = attr.array
  const v = [
    [-hw, y, -hh],
    [hw, y, -hh],
    [hw, y, hh],
    [-hw, y, -hh],
    [hw, y, hh],
    [-hw, y, hh],
  ]
  for (let i = 0; i < 6; i++) {
    a[i * 3] = v[i][0]
    a[i * 3 + 1] = v[i][1]
    a[i * 3 + 2] = v[i][2]
  }
  attr.needsUpdate = true
}

function writeRays(attr, nearHw, nearHh, farHw, farHh, nearY, farY) {
  const a = attr.array
  const farCorners = [
    [-farHw, farY, -farHh],
    [farHw, farY, -farHh],
    [farHw, farY, farHh],
    [-farHw, farY, farHh],
  ]
  for (let i = 0; i < 4; i++) {
    const o = i * 6
    a[o] = 0
    a[o + 1] = EYE_Y
    a[o + 2] = 0
    a[o + 3] = farCorners[i][0]
    a[o + 4] = farCorners[i][1]
    a[o + 5] = farCorners[i][2]
  }
  attr.needsUpdate = true
}

export default function FrustumGuide({ controllerRef }) {
  const groupRef = useRef(null)
  const raysRef = useRef(null)
  const nearOutlineRef = useRef(null)
  const farOutlineRef = useRef(null)
  const nearFillRef = useRef(null)
  const eyeRef = useRef(null)

  const raysGeo = useMemo(() => buildRaysGeometry(), [])
  const nearOutlineGeo = useMemo(() => buildPlaneOutline(), [])
  const farOutlineGeo = useMemo(() => buildPlaneOutline(), [])
  const nearFillGeo = useMemo(() => buildPlaneFill(), [])

  useEffect(
    () => () => {
      raysGeo.dispose()
      nearOutlineGeo.dispose()
      farOutlineGeo.dispose()
      nearFillGeo.dispose()
    },
    [raysGeo, nearOutlineGeo, farOutlineGeo, nearFillGeo]
  )

  useFrame(() => {
    const controller = controllerRef.current
    const units = controller.stage.units
    const stage = getStages(units)

    const fadeIn = easeOutCubic(range(units, 1.1, 1.75))
    const fadeOut = 1 - easeInOutSine(range(units, 4.6, 5.6))
    const opacity = fadeIn * fadeOut

    const group = groupRef.current
    if (!group) return

    const visible = opacity > 0.004
    group.visible = visible
    if (!visible) return

    group.scale.setScalar(controller.stage.scale)

    const sectionT = easeInOutSine(stage.section)
    const nearHw = lerp(NEAR_HALF_W * 0.35, NEAR_HALF_W, sectionT)
    const nearHh = lerp(NEAR_HALF_H * 0.35, NEAR_HALF_H, sectionT)
    const nearY = lerp(0.85, NEAR_Y, sectionT)

    writeRays(
      raysGeo.attributes.position,
      nearHw,
      nearHh,
      FAR_HALF_W,
      FAR_HALF_H,
      nearY,
      FAR_Y
    )
    writeOutline(nearOutlineGeo.attributes.position, nearHw, nearHh, nearY)
    writeOutline(farOutlineGeo.attributes.position, FAR_HALF_W, FAR_HALF_H, FAR_Y)
    writeFill(nearFillGeo.attributes.position, nearHw, nearHh, nearY)

    if (raysRef.current) raysRef.current.material.opacity = opacity * 0.9
    if (nearOutlineRef.current) nearOutlineRef.current.material.opacity = opacity * 0.85
    if (farOutlineRef.current) farOutlineRef.current.material.opacity = opacity * 0.55
    if (nearFillRef.current) nearFillRef.current.material.opacity = opacity * 0.18
    if (eyeRef.current) {
      eyeRef.current.material.opacity = opacity * 0.95
      eyeRef.current.scale.setScalar(0.06 + 0.02 * Math.sin(units * 3))
    }
  })

  return (
    <group ref={groupRef} visible={false}>
      <lineSegments ref={raysRef} geometry={raysGeo} renderOrder={16} frustumCulled={false}>
        <lineBasicMaterial
          color={RAY_COLOR}
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={true}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>

      <line ref={nearOutlineRef} geometry={nearOutlineGeo} renderOrder={17} frustumCulled={false}>
        <lineBasicMaterial
          color={PLANE_COLOR}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </line>

      <mesh ref={nearFillRef} geometry={nearFillGeo} renderOrder={15} frustumCulled={false}>
        <meshBasicMaterial
          color={NEAR_FILL}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <line ref={farOutlineRef} geometry={farOutlineGeo} renderOrder={17} frustumCulled={false}>
        <lineBasicMaterial
          color={PLANE_COLOR}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </line>

      <mesh ref={eyeRef} position={[0, EYE_Y, 0]} renderOrder={18} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color={RAY_COLOR}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
