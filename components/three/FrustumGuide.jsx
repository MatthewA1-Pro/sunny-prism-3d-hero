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
  prismYaw,
  prismPitch,
  prismRecede,
  PRISM_SHAPE,
} from '@/lib/timeline'

/*
 * Camera-frustum guide — buyer requirement from animation-details.mp4.
 *
 * Drawn ON TOP of the prism (depthTest false) so the red rays, near plane
 * and far plane are always readable. Follows the same yaw/pitch/scale as
 * the solid so it sits inside the silhouette.
 */

const RAY_COLOR = new THREE.Color('#FF2222')
const PLANE_COLOR = new THREE.Color('#6EB0FF')
const NEAR_FILL = new THREE.Color('#A078FF')

const NEAR_HALF_W = 0.62
const NEAR_HALF_H = 0.62
const FAR_HALF_W = 1.05
const FAR_HALF_H = 1.05
const EYE_Y = 1.0
const NEAR_Y = 0.25
const FAR_Y = -0.95

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

function writeRays(attr, farHw, farHh, farY) {
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

  // Seed geometry once so something is on screen even before the first frame write.
  useEffect(() => {
    writeRays(raysGeo.attributes.position, FAR_HALF_W, FAR_HALF_H, FAR_Y)
    writeOutline(nearOutlineGeo.attributes.position, NEAR_HALF_W, NEAR_HALF_H, NEAR_Y)
    writeOutline(farOutlineGeo.attributes.position, FAR_HALF_W, FAR_HALF_H, FAR_Y)
    writeFill(nearFillGeo.attributes.position, NEAR_HALF_W, NEAR_HALF_H, NEAR_Y)
  }, [raysGeo, nearOutlineGeo, farOutlineGeo, nearFillGeo])

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

    // Visible early: soft on the hero, full during section/cut, out for ribbons.
    const fadeIn = easeOutCubic(range(units, 0.15, 1.2))
    const fadeOut = 1 - easeInOutSine(range(units, 4.8, 5.9))
    const opacity = Math.max(0.15, fadeIn) * fadeOut

    const group = groupRef.current
    if (!group) return

    const visible = opacity > 0.02
    group.visible = visible
    if (!visible) return

    // Match the prism's orientation and size so the guide sits in the solid.
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

    const sectionT = easeInOutSine(stage.section)
    const nearHw = lerp(NEAR_HALF_W * 0.25, NEAR_HALF_W, Math.max(sectionT, 0.35))
    const nearHh = lerp(NEAR_HALF_H * 0.25, NEAR_HALF_H, Math.max(sectionT, 0.35))
    const nearY = lerp(0.75, NEAR_Y, Math.max(sectionT, 0.35))

    writeRays(raysGeo.attributes.position, FAR_HALF_W, FAR_HALF_H, FAR_Y)
    writeOutline(nearOutlineGeo.attributes.position, nearHw, nearHh, nearY)
    writeOutline(farOutlineGeo.attributes.position, FAR_HALF_W, FAR_HALF_H, FAR_Y)
    writeFill(nearFillGeo.attributes.position, nearHw, nearHh, nearY)

    if (raysRef.current) raysRef.current.material.opacity = opacity * 1.0
    if (nearOutlineRef.current) nearOutlineRef.current.material.opacity = opacity * 0.95
    if (farOutlineRef.current) farOutlineRef.current.material.opacity = opacity * 0.75
    if (nearFillRef.current) nearFillRef.current.material.opacity = opacity * 0.35
    if (eyeRef.current) {
      eyeRef.current.material.opacity = opacity * 1.0
      eyeRef.current.scale.setScalar(0.09)
    }
  })

  return (
    <group ref={groupRef} visible>
      <lineSegments ref={raysRef} geometry={raysGeo} renderOrder={30} frustumCulled={false}>
        <lineBasicMaterial
          color={RAY_COLOR}
          transparent
          opacity={0.9}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </lineSegments>

      <line ref={nearOutlineRef} geometry={nearOutlineGeo} renderOrder={31} frustumCulled={false}>
        <lineBasicMaterial
          color={PLANE_COLOR}
          transparent
          opacity={0.9}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </line>

      <mesh ref={nearFillRef} geometry={nearFillGeo} renderOrder={29} frustumCulled={false}>
        <meshBasicMaterial
          color={NEAR_FILL}
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <line ref={farOutlineRef} geometry={farOutlineGeo} renderOrder={31} frustumCulled={false}>
        <lineBasicMaterial
          color={PLANE_COLOR}
          transparent
          opacity={0.7}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </line>

      <mesh ref={eyeRef} position={[0, EYE_Y, 0]} renderOrder={32} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial
          color={RAY_COLOR}
          transparent
          opacity={1}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
