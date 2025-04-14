'use client'

import * as THREE from 'three'
import { Suspense, useState, useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Float,
  ScrollControls,
  Scroll,
  useScroll,
  useGLTF,
  useAnimations,
  Edges,
  PerformanceMonitor,
  Html,
} from '@react-three/drei'
import state from './state'
import Rig404 from './rig404'
import style from './background.module.scss'
import gsap from 'gsap'
import Stars from './stars'
import { Home } from '@payload-types'
import { NextRouter } from 'next/router'
let FIRST_LOAD = true
import Loading from '@/components/loading'

const GenerateShard = (points, thickness) => {
  const shape = new THREE.Shape()
  points.forEach((point, i) => {
    if (i === 0) shape.moveTo(point.x, point.y)
    else shape.lineTo(point.x, point.y)
  })
  shape.lineTo(points[0].x, points[0].y)

  const extrudeSettings = {
    steps: 1,
    depth: thickness,
    bevelEnabled: false,
  }

  return new THREE.ExtrudeGeometry(shape, extrudeSettings)
}

const RandomShard = ({ position, color = '#FF0000' }) => {
  const thickness = 0.01
  const numPoints = 3

  const geometry = useMemo(() => {
    const points: THREE.Vector2[] = []
    for (let i = 0; i < numPoints; i++) {
      const angle = 2 * Math.PI * (i / numPoints)
      const radius = 0.3 + Math.random() * 0.2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      points.push(new THREE.Vector2(x, y))
    }

    points.sort((a, b) => a.angle() - b.angle())

    return GenerateShard(points, thickness)
  }, [])

  const rotation = useMemo(
    () =>
      new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
    [],
  )

  const materialArgs = {
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    color: color,
    emissive: color,
    depthTest: false,
    transparent: true,
    emissiveIntensity: 1,
    toneMapped: false,
  }

  return (
    <>
      <Float>
        <mesh geometry={geometry} position={position} rotation={rotation}>
          <meshStandardMaterial {...materialArgs} />
        </mesh>
      </Float>
    </>
  )
}

const getUniqueVertices = (geometry) => {
  const positions = geometry.attributes.position.array
  const uniqueVerticesSet = new Set()
  const uniqueVertices: THREE.Vector3[] = []

  for (let i = 0; i < positions.length; i += 3) {
    const key = `${positions[i]},${positions[i + 1]},${positions[i + 2]}`
    if (!uniqueVerticesSet.has(key)) {
      uniqueVerticesSet.add(key)
      uniqueVertices.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]))
    }
  }
  return uniqueVertices
}

const Shards = () => {
  const shardColors = ['red', 'green', 'blue']
  const groupRef = useRef<THREE.Group>(null)
  const [targetScale, setTargetScale] = useState(0.1)

  useFrame(() => {
    setTargetScale(
      THREE.MathUtils.lerp(targetScale, state.scale, targetScale <= state.scale ? 0.02 : 0.01),
    )
  })

  const geometry = new THREE.IcosahedronGeometry(targetScale, 0)
  const uniqueVertices = getUniqueVertices(geometry)
  const shards = uniqueVertices.map((vertex, i) => (
    <RandomShard key={i} position={vertex} color={shardColors[i % shardColors.length]} />
  ))

  return <group ref={groupRef}>{shards}</group>
}

const Hero = () => {
  const [isPointerOver, setIsPointerOver] = useState(false)
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!meshRef.current) return

    const speed = 0.003
    meshRef.current.rotation.y += speed
    meshRef.current.rotation.z += speed
  })

  const handlePointerOver = () => {
    setIsPointerOver(true)
    state.scale = state.maxScale
  }

  const handlePointerOut = () => {
    setIsPointerOver(false)
    state.scale = state.minScale
  }

  const handlePointerDown = () => {
    state.scale = state.maxScale
  }

  const handlePointerUp = () => {
    if (!isPointerOver) {
      state.scale = state.minScale
    }
  }

  const materialArgs = {
    opacity: 0,
    transparent: true,
  }

  return (
    <mesh
      ref={meshRef}
      onPointerOver={handlePointerOver}
      onPointerDown={handlePointerDown}
      onPointerOut={handlePointerOut}
      onPointerUp={handlePointerUp}
    >
      <icosahedronGeometry args={[0.25, 0]} />
      <meshBasicMaterial {...materialArgs} />
      <Edges color={'white'} />
    </mesh>
  )
}

const ScrollDots = () => {
  const scroll = useScroll()
  const ref = useRef<HTMLDivElement>(null)

  useFrame(() => {
    if (!ref.current) return

    if (scroll.offset > 0.01) {
      ref.current.style.opacity = '0'
    } else {
      ref.current.style.opacity = '1'
    }
  })

  return (
    <div className={style.dots} ref={ref}>
      <div className={style.dot}></div>
      <div className={style.dot}></div>
      <div className={style.dot}></div>
    </div>
  )
}

const ModelInfo = () => {
  const modelRef = useRef<THREE.Group>(null)
  const { nodes, animations } = useGLTF('/glb/Info.glb')
  const { actions } = useAnimations(animations, modelRef)
  const planet = useRef<THREE.Mesh>(null)
  const scroll = useScroll()

  useEffect(() => {
    if (actions?.animation_0) {
      actions.animation_0.reset().play()
      actions.animation_0.paused = true
    }
  }, [actions])

  useFrame(({ clock }) => {
    if (planet.current) {
      const radius = 1.5 // Radius of the circle
      const elapsedTime = clock.getElapsedTime()
      planet.current.position.x = Math.sin(elapsedTime) * radius
      planet.current.position.z = Math.cos(elapsedTime) * radius
    }

    if (actions.animation_0) {
      const scrollThreshold = 0.1

      if (scroll.offset > scrollThreshold) {
        const adjustedScrollOffset = (scroll.offset * 1 - scrollThreshold) / (1 - scrollThreshold)
        actions.animation_0.time = actions.animation_0.getClip().duration * adjustedScrollOffset
      }
    }
  })

  if (!nodes?.Torus || !nodes?.Cube) return null

  return (
    <group ref={modelRef}>
      <mesh name="Cube" geometry={(nodes.Cube as THREE.Mesh).geometry}>
        <meshPhysicalMaterial
          emissive={'red'}
          emissiveIntensity={0.2}
          ior={0}
          roughness={0.2}
          color={'red'}
        />
      </mesh>
      <mesh
        name="Torus"
        geometry={(nodes.Torus as THREE.Mesh).geometry}
        position={[nodes.Torus.position.x, nodes.Torus.position.y, nodes.Torus.position.z]}
      >
        <meshPhysicalMaterial
          emissive={'red'}
          emissiveIntensity={0.2}
          roughness={0.2}
          color={'red'}
        />
        <mesh ref={planet}>
          <pointLight name="PointLight" color={'white'} intensity={0.1} />
          <sphereGeometry args={[0.1, 32, 32]} />
        </mesh>
      </mesh>
    </group>
  )
}

const ModelDev = () => {
  const helixRef = useRef<THREE.Group>(null)
  const { nodes } = useGLTF('/glb/Dev.glb')

  useFrame(() => {
    if (helixRef.current) {
      helixRef.current.rotation.y -= 0.01
    }
  })

  return (
    <group ref={helixRef}>
      <ambientLight color={'white'} intensity={1} />
      <mesh geometry={(nodes.Helix as THREE.Mesh).geometry} scale={8.355}>
        <pointLight name="PointLight" color={'white'} intensity={0.4} />
        <meshPhysicalMaterial
          emissive={'green'}
          emissiveIntensity={0.2}
          roughness={0.5}
          color={'green'}
        />
      </mesh>
    </group>
  )
}

const ModelArt = () => {
  const artRef = useRef<THREE.Mesh>(null)
  const artMatRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(() => {
    if (artRef.current) {
      artRef.current.rotation.y += 0.001
    }
  })

  const handleHover = (hover: boolean) => {
    if (hover && artMatRef.current) {
      gsap.to(artMatRef.current, { opacity: 0, duration: 0.5 })
    } else {
      gsap.to(artMatRef.current, { opacity: 1, duration: 0.5 })
    }
  }

  return (
    <mesh
      onPointerOver={() => handleHover(true)}
      onPointerDown={() => handleHover(true)}
      onPointerOut={() => handleHover(false)}
      onPointerUp={() => handleHover(false)}
      ref={artRef}
    >
      <sphereGeometry args={[1, 32, 16]} />
      <meshBasicMaterial ref={artMatRef} depthTest={false} transparent={true} color={'blue'} />
      <Edges color={'blue'} threshold={1} />
    </mesh>
  )
}

const RigPages = ({ page }) => {
  const anchorHome = useRef<THREE.Mesh>(null)

  const sectionInfo = useRef<THREE.Group>(null)
  const anchorInfo = useRef<THREE.Mesh>(null)

  const sectionDev = useRef<THREE.Group>(null)
  const anchorDev = useRef<THREE.Mesh>(null)

  const sectionArt = useRef<THREE.Group>(null)
  const anchorArt = useRef<THREE.Mesh>(null)

  const { height } = useThree((state) => state.viewport)

  useEffect(() => {
    setTimeout(() => {
      if (page === 'home' && !FIRST_LOAD) {
        const pageHome = document.querySelector('.page-home')
        if (pageHome) {
          pageHome.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
          })
        }
      } else if (page === 'info') {
        const pageInfo = document.querySelector('.page-info')
        if (pageInfo) {
          pageInfo.scrollIntoView({ behavior: 'smooth' })
        }
      } else if (page === 'dev') {
        const pageDev = document.querySelector('.page-dev')
        if (pageDev) {
          pageDev.scrollIntoView({ behavior: 'smooth' })
        }
      } else if (page === 'art') {
        const pageArt = document.querySelector('.page-art')
        if (pageArt) {
          pageArt.scrollIntoView({ behavior: 'smooth' })
        }
      } else if (page === 'posts') {
        const pageHome = document.querySelector('.page-home')
        if (pageHome) {
          pageHome.scrollIntoView({
            behavior: 'smooth',
            block: 'end',
          })
        }
      }
      FIRST_LOAD = false
    }, 100)
  }, [page])

  useFrame(() => {
    if (anchorInfo.current && sectionInfo.current) {
      anchorInfo.current.position.y = sectionInfo.current.position.y + 1
    }

    if (anchorDev.current && sectionDev.current) {
      anchorDev.current.position.y = sectionDev.current.position.y + 2 - height / 2
    }

    if (anchorArt.current && sectionArt.current) {
      anchorArt.current.position.y = sectionArt.current.position.y + 3 - height
    }
  })

  return (
    <>
      <Hero />
      <Scroll>
        <Shards />
        <group ref={sectionInfo} position={[0, -height, 0]}>
          <ModelInfo />
        </group>
        <group ref={sectionDev} position={[0, -height * 2, 0]}>
          <ModelDev />
        </group>
        <group ref={sectionArt} position={[0, -height * 3, 0]}>
          <ModelArt />
        </group>
      </Scroll>
      <mesh ref={anchorHome}>
        <Html className="page-home"></Html>
      </mesh>
      <mesh ref={anchorInfo}>
        <Html className="page-info"></Html>
      </mesh>
      <mesh ref={anchorDev}>
        <Html className="page-dev"></Html>
      </mesh>
      <mesh ref={anchorArt}>
        <Html className="page-art"></Html>
      </mesh>
    </>
  )
}

const RenderPageBackground = ({ page }) => {
  const scroll = useScroll()
  const [scrolledDown, setScrolledDown] = useState(false)
  const [reset, setReset] = useState(false)

  useFrame(() => {
    if (scroll.offset > 0.02) {
      state.scale = state.maxScale
      setReset(false)
    } else {
      setReset(true)
      if (!reset) {
        state.scale = state.minScale
      }
    }
    setScrolledDown(scroll.range(0, 1 / 8) >= 1)
  })

  if (!page) {
    return <Rig404 />
  }

  return (
    <group visible={page !== 'posts'}>
      <Stars canReset={page === 'home' && !scrolledDown ? true : false} />
      <RigPages page={page} />
    </group>
  )
}

const HomeHTML = ({ homeData, router }: { homeData: Home; router: NextRouter }) => {
  const [clientHeight, setClientHeight] = useState(window.innerHeight)

  useEffect(() => {
    const handleResize = () => setClientHeight(window.innerHeight)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleNavigation = (path) => {
    router.push(path)
  }

  return (
    <>
      <div className={style.sections} style={{ height: clientHeight }}>
        <div className={style.intro}>
          <h1>{homeData.header}</h1>
          <h2>{homeData.subhead}</h2>
          <p>
            <span>{homeData.intro}</span>
          </p>
        </div>
      </div>

      <div className={style.sections} style={{ height: clientHeight }}>
        <div className={style.info}>
          <h2>
            &ldquo;The only Zen you can find on the tops of mountains is the Zen you bring up
            there.&rdquo;
          </h2>
          <a className="btn" onClick={() => handleNavigation('/info')}>
            About me
          </a>
        </div>
      </div>

      <div className={style.sections} style={{ height: clientHeight }}>
        <div className={style.dev}>
          <h2>Joy seeing code come to life</h2>
          <a className="btn" onClick={() => handleNavigation('/dev')}>
            See some work
          </a>
        </div>
      </div>

      <div className={style.sections} style={{ height: clientHeight }}>
        <div className={style.art}>
          <h2>Simplicty is everything.</h2>
          <a className="btn" onClick={() => handleNavigation('/art')}>
            View my art
          </a>
        </div>
      </div>
    </>
  )
}

const Background = ({ pathname, router, homeData }) => {
  const page = pathname !== '/' ? pathname.split('/')[1] : 'home'
  const [dpr, setDpr] = useState(1)

  return (
    <Suspense fallback={<Loading />}>
      <Canvas
        className={`${style.background} ${page !== 'home' && style.disableScroll}`}
        camera={{ position: [0, 0, 5], fov: 50 }}
        dpr={dpr}
        gl={{
          antialias: false,
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
      >
        <PerformanceMonitor onDecline={() => setDpr(0.5)} onIncline={() => setDpr(1)} />

        <color attach="background" args={['#000000']} />

        <ScrollControls pages={4}>
          <RenderPageBackground page={page} />
          <Scroll html style={{ width: '100vw', height: '100vh' }}>
            <div
              style={{
                display: page !== 'home' ? 'none' : 'block',
              }}
            >
              <HomeHTML homeData={homeData} router={router} />
              <ScrollDots />
            </div>
          </Scroll>
        </ScrollControls>
      </Canvas>
    </Suspense>
  )
}

export default Background
