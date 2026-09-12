'use client'
import React, { useRef, useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Lerp helper
function lerp(a, b, t) {
  return a + (b - a) * t
}

// Ease function for smoother animation
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Triangle vertices
// Apex: (0, 1), Left base: (-1, -1), Right base: (1, -1)

// Point on left edge (from apex to left base), t: 0=apex, 1=left base
function leftEdgePoint(t) {
  return { x: lerp(0, -1, t), y: lerp(1, -1, t) }
}

// Point on bottom edge (from left base to right base), t: 0=left base, 1=right base
function bottomEdgePoint(t) {
  return { x: lerp(-1, 1, t), y: -1 }
}

// For a cut PARALLEL to the right edge starting at leftEdgePoint(leftT):
// It ends at bottomEdgePoint(1 - leftT)
// This ensures all cuts are parallel to the right edge

// Section 1: Top-right section (contains apex and right edge) - FIXED
// Bounded by: apex, cut1 point on left edge, cut1 point on bottom, right-base
function createSection1(leftT, depth = 1) {
  const apex = { x: 0, y: 1 }
  const rightBase = { x: 1, y: -1 }
  const cutLeft = leftEdgePoint(leftT)
  const cutBottom = bottomEdgePoint(1 - leftT)
  
  const halfDepth = depth / 2
  
  const vertices = new Float32Array([
    // Front
    apex.x, apex.y, halfDepth,          // 0
    rightBase.x, rightBase.y, halfDepth,// 1
    cutBottom.x, cutBottom.y, halfDepth,// 2
    cutLeft.x, cutLeft.y, halfDepth,    // 3
    // Back
    apex.x, apex.y, -halfDepth,          // 4
    rightBase.x, rightBase.y, -halfDepth,// 5
    cutBottom.x, cutBottom.y, -halfDepth,// 6
    cutLeft.x, cutLeft.y, -halfDepth,    // 7
  ])
  
  const indices = new Uint16Array([
    // Front
    0, 3, 2, 0, 2, 1,
    // Back
    4, 5, 6, 4, 6, 7,
    // Left edge (apex to cutLeft)
    0, 4, 7, 0, 7, 3,
    // Right edge (apex to rightBase)
    0, 1, 5, 0, 5, 4,
    // Bottom edge (rightBase to cutBottom)
    1, 2, 6, 1, 6, 5,
    // Cut face (cutLeft to cutBottom) - parallel to right edge
    3, 7, 6, 3, 6, 2,
  ])
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

// Middle section: Parallelogram between two cuts (both parallel to right edge)
function createMiddleSection(topLeftT, botLeftT, depth = 1) {
  const topLeft = leftEdgePoint(topLeftT)
  const topBottom = bottomEdgePoint(1 - topLeftT)
  const botLeft = leftEdgePoint(botLeftT)
  const botBottom = bottomEdgePoint(1 - botLeftT)
  
  const halfDepth = depth / 2
  
  const vertices = new Float32Array([
    // Front
    topLeft.x, topLeft.y, halfDepth,     // 0
    topBottom.x, topBottom.y, halfDepth, // 1
    botBottom.x, botBottom.y, halfDepth, // 2
    botLeft.x, botLeft.y, halfDepth,     // 3
    // Back
    topLeft.x, topLeft.y, -halfDepth,     // 4
    topBottom.x, topBottom.y, -halfDepth, // 5
    botBottom.x, botBottom.y, -halfDepth, // 6
    botLeft.x, botLeft.y, -halfDepth,     // 7
  ])
  
  const indices = new Uint16Array([
    // Front
    0, 3, 2, 0, 2, 1,
    // Back
    4, 5, 6, 4, 6, 7,
    // Left edge (topLeft to botLeft)
    0, 4, 7, 0, 7, 3,
    // Bottom edge (botLeft to botBottom)
    3, 7, 6, 3, 6, 2,
    // Top cut face (topLeft to topBottom)
    0, 1, 5, 0, 5, 4,
    // Bottom cut face (botBottom to topBottom direction)
    1, 2, 6, 1, 6, 5,
  ])
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

// Section 4: Bottom-left triangle (contains left-base corner) - FIXED
function createSection4(leftT, depth = 1) {
  const leftBase = { x: -1, y: -1 }
  const cutLeft = leftEdgePoint(leftT)
  const cutBottom = bottomEdgePoint(1 - leftT)
  
  const halfDepth = depth / 2
  
  const vertices = new Float32Array([
    // Front
    cutLeft.x, cutLeft.y, halfDepth,    // 0
    cutBottom.x, cutBottom.y, halfDepth,// 1
    leftBase.x, leftBase.y, halfDepth,  // 2
    // Back
    cutLeft.x, cutLeft.y, -halfDepth,    // 3
    cutBottom.x, cutBottom.y, -halfDepth,// 4
    leftBase.x, leftBase.y, -halfDepth,  // 5
  ])
  
  const indices = new Uint16Array([
    // Front
    0, 2, 1,
    // Back
    3, 4, 5,
    // Left edge (cutLeft to leftBase)
    0, 3, 5, 0, 5, 2,
    // Bottom edge (leftBase to cutBottom)
    2, 5, 4, 2, 4, 1,
    // Cut face (cutLeft to cutBottom)
    0, 1, 4, 0, 4, 3,
  ])
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  return geometry
}

export default function Prism({ scrollProgress = 0 }) {
  const matcap = useTexture('/matcap.png')
  
  const groupRef = useRef()
  const seg1Ref = useRef()
  const seg2Ref = useRef()
  const seg3Ref = useRef()
  const seg4Ref = useRef()
  
  // Create 4 sections with cuts PARALLEL to the RIGHT EDGE
  // Each cut goes from LEFT EDGE to BOTTOM EDGE
  // For leftT on left edge, cut ends at bottomT = 1 - leftT on bottom edge
  // This ensures all cuts are perfectly parallel to the right edge
  
  const sliceGeometries = useMemo(() => [
    // Section 1: Top-right quadrilateral (contains apex + right edge) - STAYS FIXED
    createSection1(0.25, 1),  // First cut at 25% down left edge
    
    // Section 2: Parallelogram strip (MOVES ↘)
    createMiddleSection(0.25, 0.5, 1),  // Between cut at 25% and cut at 50%
    
    // Section 3: Parallelogram strip (MOVES ↖)
    createMiddleSection(0.5, 0.75, 1),  // Between cut at 50% and cut at 75%
    
    // Section 4: Bottom-left triangle (contains left-base corner) - STAYS FIXED
    createSection4(0.75, 1),  // Below cut at 75%
  ], [])
  
  // Animation targets - sections 2 and 3 move perpendicular to the cuts
  // Reduced distance so sections stay partially touching
  const segmentTargets = useMemo(() => [
    { posX: 0, posY: 0 },         // Section 1: STAYS PUT
    { posX: -0.2, posY: 0.4 },    // Section 2: slides TOP-LEFT ↖
    { posX: 0.2, posY: -0.4 },    // Section 3: slides BOTTOM-RIGHT ↘
    { posX: 0, posY: 0 },         // Section 4: STAYS PUT
  ], [])
  
  useFrame((state) => {
    const time = state.clock.elapsedTime
    const progress = easeInOutCubic(scrollProgress)
    
    // Gentle floating rotation of entire group
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(time * 0.3) * 0.05
      groupRef.current.rotation.x = Math.sin(time * 0.2) * 0.03
    }
    
    const segmentRefs = [seg1Ref, seg2Ref, seg3Ref, seg4Ref]
    
    segmentRefs.forEach((ref, i) => {
      if (!ref.current) return
      
      const target = segmentTargets[i]
      
      // Position: only middle sections (2 & 3) move diagonally
      ref.current.position.x = lerp(0, target.posX, progress)
      ref.current.position.y = lerp(0, target.posY, progress)
    })
  })

  return (
    <group ref={groupRef} position={[0, 0, 0]} scale={[1.2, 1.2, 1.2]}>
      {/* Single prism made of 4 angled slices */}
      <mesh ref={seg1Ref} geometry={sliceGeometries[0]}>
        <meshMatcapMaterial matcap={matcap} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      
      <mesh ref={seg2Ref} geometry={sliceGeometries[1]}>
        <meshMatcapMaterial matcap={matcap} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      
      <mesh ref={seg3Ref} geometry={sliceGeometries[2]}>
        <meshMatcapMaterial matcap={matcap} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      
      <mesh ref={seg4Ref} geometry={sliceGeometries[3]}>
        <meshMatcapMaterial matcap={matcap} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
