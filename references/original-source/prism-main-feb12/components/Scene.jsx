'use client'
import { Environment, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import React, { useEffect, useState, useRef } from 'react'
import Prism from './Prism'

// Component to track scroll and update progress
function ScrollTracker({ onScrollProgress }) {
    useEffect(() => {
        // Reset scroll to top on page load to ensure initial state is correct
        window.scrollTo(0, 0)
        onScrollProgress(0)
        
        const handleScroll = () => {
            const scrollY = window.scrollY
            const docHeight = document.documentElement.scrollHeight - window.innerHeight
            // Prevent NaN if docHeight is 0
            const progress = docHeight > 0 ? Math.min(Math.max(scrollY / docHeight, 0), 1) : 0
            onScrollProgress(progress)
        }
        
        window.addEventListener('scroll', handleScroll, { passive: true })
        
        return () => window.removeEventListener('scroll', handleScroll)
    }, [onScrollProgress])
    
    return null
}

const Scene = () => {
    const [scrollProgress, setScrollProgress] = useState(0)
    
    return (
        <>
            <ScrollTracker onScrollProgress={setScrollProgress} />
            <div className='scene-wrapper'>
                <Canvas
                    camera={{ position: [0, 0, 5], fov: 45 }}
                >
                    <color attach="background" args={['#0F021F']} />
                    <ambientLight intensity={1} />
                    <directionalLight position={[10, 10, 5]} intensity={1} />
                    <Environment preset='sunset' />
                    <OrbitControls enableZoom={false} />
                    <Prism scrollProgress={scrollProgress} />
                </Canvas>
            </div>
        </>
    )
}

export default Scene