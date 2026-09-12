'use client'
import React, { useRef } from 'react'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'


export default function Prism2(props) {
    const meshRef = useRef()

    const { nodes } = useGLTF('/prism3.glb')
    const matcap = useTexture('/matcap.png')

    return (
        <mesh
            ref={meshRef}
            geometry={nodes.Cube.geometry}
            scale={[0.6, .9, 0.6]}
            rotation={[0, Math.PI / 2, 0]}
            position={[-1, 0, 0]}
        >
            <meshMatcapMaterial
                matcap={matcap}
                transparent
                opacity={1}
                side={THREE.DoubleSide}
            />
        </mesh>
    )
}

useGLTF.preload('/prism3.glb')
