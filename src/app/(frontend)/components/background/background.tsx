'use client'

import * as THREE from 'three'
import { Suspense, useState, useRef, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Float, ScrollControls, Scroll, useScroll, useGLTF, Html } from '@react-three/drei'
import state from './state'
import Rig404 from './rig404'
import style from './background.module.scss'
import { Home } from '@payload-types'
import { NextRouter } from 'next/router'
import LoadingComponent from '@/components/loading'

let FIRST_LOAD = true

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
  const thickness = 0.02
  const numPoints = 3

  // Generate random values once per component instance using seeded approach
  const randomValues = useMemo(() => {
    const radiusVariations: number[] = []

    // Generate all random values upfront to avoid reassignment
    const randomValuesArray: number[] = []
    let seed = Math.floor(Math.random() * 100000) // Use Math.random only once for seed
    for (let i = 0; i < numPoints + 3; i++) {
      // Generate enough values for radius variations and rotation
      seed = (seed * 9301 + 49297) % 233280
      randomValuesArray.push(seed / 233280)
    }

    let randomIndex = 0
    const seededRandom = () => randomValuesArray[randomIndex++]

    for (let i = 0; i < numPoints; i++) {
      const randomValue = seededRandom()
      if (randomValue !== undefined) {
        radiusVariations.push(0.3 + randomValue * 0.2)
      }
    }

    const rotationX = seededRandom() ?? 0
    const rotationY = seededRandom() ?? 0
    const rotationZ = seededRandom() ?? 0

    return {
      radiusVariations,
      rotation: new THREE.Euler(rotationX * Math.PI, rotationY * Math.PI, rotationZ * Math.PI),
    }
  }, [])

  const geometry = useMemo(() => {
    const points: THREE.Vector2[] = []
    for (let i = 0; i < numPoints; i++) {
      const angle = 2 * Math.PI * (i / numPoints)
      const radius = randomValues.radiusVariations[i] ?? 0.3
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      points.push(new THREE.Vector2(x, y))
    }

    points.sort((a, b) => a.angle() - b.angle())

    return GenerateShard(points, thickness)
  }, [randomValues])

  const rotation = randomValues.rotation

  const materialArgs = {
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    color: color,
    emissive: color,
    depthTest: true,
    depthWrite: false,
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

  const uniqueVertices = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(1, 0)
    return getUniqueVertices(geometry)
  }, [])

  useFrame(() => {
    const newScale = THREE.MathUtils.lerp(
      targetScale,
      state.scale,
      targetScale <= state.scale ? 0.01 : 0.03,
    )
    setTargetScale(newScale)

    if (groupRef.current) {
      // Slowly rotate the entire shard group
      groupRef.current.rotation.y += 0.001
      groupRef.current.rotation.x += 0.0003

      groupRef.current.children.forEach((shard, i) => {
        if (uniqueVertices[i]) {
          shard.position.copy(uniqueVertices[i]).multiplyScalar(newScale)
        }
      })
    }
  })

  const shards = uniqueVertices.map((vertex, i) => (
    <RandomShard
      key={i}
      position={vertex.clone().multiplyScalar(targetScale)}
      color={shardColors[i % shardColors.length]}
    />
  ))

  return <group ref={groupRef}>{shards}</group>
}

const Hero = () => {
  const [isPointerOver, setIsPointerOver] = useState(false)
  const meshRef = useRef<THREE.Mesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const pointRef = useRef<THREE.PointLight>(null)
  const scroll = useScroll()

  useFrame(() => {
    if (!meshRef.current) return

    const speed = 0.001
    meshRef.current.rotation.y += speed
    meshRef.current.rotation.z += speed
  })

  useFrame(() => {
    if (!pointRef.current) return
    const t = scroll.offset // 0 → 1

    // Map to Info section progress
    let progress = 0
    const start = 0.25
    const end = 0.5
    const clamped = Math.min(Math.max((t - start) / (end - start), 0), 1)
    progress = clamped

    const eased = Math.sin(progress * Math.PI) // 0→1→0
    const color = new THREE.Color()
    color.setHSL(0, 1, 1 - 0.5 * eased) // red with white blending
    pointRef.current.color.copy(color)
    pointRef.current.intensity = 2 + eased * 1 // 2→3→2

    // Change hero material color per section with a lerp
    if (materialRef.current) {
      const section = t < 0.25 ? 'home' : t < 0.5 ? 'info' : t < 0.75 ? 'dev' : 'art'
      const target =
        section === 'home'
          ? '#ffffff'
          : section === 'info'
            ? '#ff3b30'
            : section === 'dev'
              ? '#34c759'
              : '#1ea7ff'
      const targetColor = new THREE.Color(target)
      materialRef.current.color.lerp(targetColor, 0.05)

      // Fade out hero in art section (last section)
      if (section === 'art') {
        const artProgress = Math.max(0, (t - 0.75) / 0.25) // 0 to 1 in art section
        const fadeOut = Math.max(0, 1 - artProgress * 1.5) // Start fading earlier in art section
        materialRef.current.opacity = fadeOut
        materialRef.current.transparent = true
      } else {
        materialRef.current.opacity = 1
        materialRef.current.transparent = true
      }
    }
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

  return (
    <mesh
      ref={meshRef}
      onPointerOver={handlePointerOver}
      onPointerDown={handlePointerDown}
      onPointerOut={handlePointerOut}
      onPointerUp={handlePointerUp}
    >
      <icosahedronGeometry args={[0.25, 0]} />
      <meshPhysicalMaterial
        ref={materialRef}
        transparent={true}
        opacity={1}
        depthTest={true}
        depthWrite={true}
      />
      <pointLight ref={pointRef} color={'white'} intensity={2} />
    </mesh>
  )
}

const ScrollDots = () => {
  const scroll = useScroll()
  const ref = useRef<HTMLDivElement>(null)

  useFrame(() => {
    if (!ref.current) return

    if (scroll.offset > 0.01) {
      ref.current.classList.add(style.fadeOut || 'fadeOut')
    } else {
      ref.current.classList.remove(style.fadeOut || 'fadeOut')
    }
  })

  return (
    <div className={style.dots} ref={ref}>
      <div className={style.scrollDown}>Scroll down</div>
      <div className={style.dot}></div>
      <div className={style.dot}></div>
      <div className={style.dot}></div>
    </div>
  )
}

const ModelInfo = () => {
  const groupRef = useRef<THREE.Group>(null)
  const { nodes, materials } = useGLTF('/glb/stylized_rock/scene.gltf')

  // Pick unique vertices from an icosahedron (no duplicates) and generate rotations
  const rockData = useMemo(() => {
    const numRocks = 5
    const radius = 1.5

    const baseVertices = getUniqueVertices(new THREE.IcosahedronGeometry(1, 0))
    const candidates = baseVertices.map((v) => v.clone().normalize().multiplyScalar(radius))

    const selected: THREE.Vector3[] = []
    const rotations: THREE.Euler[] = []
    const used = new Set<number>()
    const max = Math.min(numRocks, candidates.length)

    // Generate all random values upfront to avoid reassignment
    const randomValues: number[] = []
    let seed = 98765
    for (let i = 0; i < max * 4; i++) {
      // Generate enough values for positions and rotations
      seed = (seed * 9301 + 49297) % 233280
      randomValues.push(seed / 233280)
    }

    let randomIndex = 0
    const seededRandom = () => randomValues[randomIndex++]

    while (selected.length < max) {
      const randomValue = seededRandom()
      if (randomValue === undefined) break

      const idx = Math.floor(randomValue * candidates.length)
      if (idx < 0 || idx >= candidates.length || used.has(idx)) continue
      const candidate = candidates[idx]
      if (!candidate) continue
      used.add(idx)
      selected.push(candidate.clone())

      // Generate rotation for this rock
      const rotX = seededRandom() ?? 0
      const rotY = seededRandom() ?? 0
      const rotZ = seededRandom() ?? 0

      rotations.push(new THREE.Euler(rotX * Math.PI * 2, rotY * Math.PI * 2, rotZ * Math.PI * 2))
    }

    return { positions: selected, rotations }
  }, [])

  const rockPositions = rockData.positions
  const rockRotations = rockData.rotations

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((rock, i) => {
        if (rockRotations[i]) {
          rock.rotation.x += 0.001
          rock.rotation.y += 0.002
          rock.rotation.z += 0.0005
        }
      })
    }
  })

  if (!nodes?.Object_2 || !materials?.defaultMat) return null

  return (
    <group ref={groupRef}>
      {rockPositions.map((position, i) => (
        <mesh
          key={i}
          geometry={(nodes.Object_2 as THREE.Mesh)?.geometry}
          material={materials.defaultMat}
          position={position}
          rotation={[rockRotations[i]?.x || 0, rockRotations[i]?.y || 0, rockRotations[i]?.z || 0]}
          scale={[4, 4, 4]}
        />
      ))}
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
    <>
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <group ref={helixRef}>
        <mesh geometry={(nodes.Helix as THREE.Mesh).geometry} scale={8.355}>
          <meshPhysicalMaterial
            emissive={'green'}
            emissiveIntensity={0.2}
            roughness={0.4}
            color={'green'}
          />
        </mesh>
      </group>
    </>
  )
}

const ClothArt = () => {
  const groupRef = useRef<THREE.Group>(null)
  const timeRef = useRef(0)
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const { viewport } = useThree()

  const { mesh, material } = useMemo(() => {
    const width = 2
    const height = 1.2
    const segments = 16
    const tempGeometry = new THREE.PlaneGeometry(width, height, segments, segments)

    // Extract positions from the plane geometry
    const positionAttr = tempGeometry.attributes.position
    if (!positionAttr) throw new Error('Position attribute not found')
    const positions = positionAttr.array as Float32Array
    const vertexCount = positions.length / 3

    // Group vertices by Y position
    // Use a Map to store vertices for each unique Y value (rounded to avoid floating point issues)
    const yGroups = new Map<number, Array<{ x: number; y: number; z: number }>>()
    const yPrecision = 1000 // Round Y to 3 decimal places

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3
      const x = positions[i3]!
      const y = positions[i3 + 1]!
      const z = positions[i3 + 2]!

      // Round Y to avoid floating point precision issues
      const yKey = Math.round(y * yPrecision) / yPrecision

      if (!yGroups.has(yKey)) {
        yGroups.set(yKey, [])
      }
      yGroups.get(yKey)!.push({ x, y, z })
    }

    // Collect all vertices as points
    const pointPositions: number[] = []
    const pointYNorm: number[] = []

    yGroups.forEach((vertices, yKey) => {
      // Calculate normalized Y for fade (0 at bottom, 1 at top)
      const yNorm = Math.max(0.0, Math.min(1.0, (yKey + 0.6) / 1.2))

      // Add all vertices as points
      for (const vertex of vertices) {
        pointPositions.push(vertex.x, vertex.y, vertex.z)
        pointYNorm.push(yNorm)
      }
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(pointPositions), 3),
    )
    geometry.setAttribute('yNorm', new THREE.BufferAttribute(new Float32Array(pointYNorm), 1))

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        amp: { value: 1.1 },
        freq: { value: 3.0 },
        speed: { value: 0.5 },
        color: { value: new THREE.Color('#ffffff') },
        pointSize: { value: 2.0 }, // point size in pixels
        fadeStart: { value: 0.15 }, // start fading at 15% from bottom
        fadeEnd: { value: 1.0 }, // fully faded near the very top
      },
      vertexShader: `
        attribute float yNorm;
        uniform float time;
        uniform float amp;
        uniform float freq;
        uniform float speed;
        uniform float pointSize;
        varying float vYNorm;
        void main() {
          vec3 pos = position;
          float w1 = sin((pos.x * freq) + time * speed) * amp;
          float w2 = sin((pos.y * freq * 1.3) - time * speed * 0.8) * amp * 0.7;
          pos.z += w1 + w2;
          vYNorm = yNorm;
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = pointSize;
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform vec3 color;
        uniform float fadeStart;
        uniform float fadeEnd;
        varying float vYNorm;
        void main() {
          // Create circular point shape
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          // Smooth circular edge
          float circle = 1.0 - smoothstep(0.3, 0.5, dist);

          // vertical fade ramp (1 at bottom, ramps to 0 towards top)
          float ramp = smoothstep(fadeEnd, fadeStart, vYNorm);
          float alpha = ramp * circle;
          if (alpha <= 0.0) discard;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    })

    const mesh = new THREE.Points(geometry, material)
    return { mesh, material }
  }, [])

  useEffect(() => {
    materialRef.current = material
  }, [material])

  useEffect(() => {
    const group = groupRef.current
    if (!group || !mesh) return
    group.add(mesh)
    return () => {
      if (group && mesh) group.remove(mesh)
    }
  }, [mesh])

  useEffect(() => {
    if (!groupRef.current) return
    groupRef.current.scale.set(viewport.width, viewport.height, 1)
    // Position it far back in z-space and set render order to render first (behind everything)
    groupRef.current.position.z = -10
    groupRef.current.renderOrder = -1
  }, [viewport.width, viewport.height])

  useFrame((_, delta) => {
    if (materialRef.current?.uniforms?.time) {
      timeRef.current += delta
      // Update the uniform value using the ref
      materialRef.current.uniforms.time.value = timeRef.current
    }
  })

  return <group ref={groupRef} />
}

const RigPages = ({ page }) => {
  const anchorHome = useRef<THREE.Mesh>(null)

  const sectionInfo = useRef<THREE.Group>(null)
  const anchorInfo = useRef<THREE.Mesh>(null)

  const sectionDev = useRef<THREE.Group>(null)
  const anchorDev = useRef<THREE.Mesh>(null)

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
  })

  return (
    <>
      <Hero />
      <ClothArt />
      <Scroll>
        <Shards />
        <group ref={sectionInfo} position={[0, -height, 0]}>
          <ModelInfo />
        </group>
        <group ref={sectionDev} position={[0, -height * 2, 0]}>
          <ModelDev />
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
      <mesh>
        <Html className="page-art"></Html>
      </mesh>
    </>
  )
}

const RenderPageBackground = ({ page }) => {
  const scroll = useScroll()
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
  })

  if (!page) {
    return <Rig404 />
  }

  return (
    <group visible={page !== 'posts'}>
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
          <a className="btn btn-red" onClick={() => handleNavigation('/info')}>
            About me
          </a>
        </div>
      </div>

      <div className={style.sections} style={{ height: clientHeight }}>
        <div className={style.dev}>
          <h2>Joy seeing code come to life</h2>
          <a className="btn btn-green" onClick={() => handleNavigation('/dev')}>
            See some work
          </a>
        </div>
      </div>

      <div className={style.sections} style={{ height: clientHeight }}>
        <div className={style.art}>
          <h2>Simplicty is everything.</h2>
          <a className="btn btn-blue" onClick={() => handleNavigation('/art')}>
            View art
          </a>
        </div>
      </div>
    </>
  )
}

// Simplified wrapper - React strict mode is disabled in next.config.mjs to prevent root conflicts
const ScrollWrapper = ({ children, style: scrollStyle }) => {
  return (
    <Scroll html style={scrollStyle}>
      {children}
    </Scroll>
  )
}

const Background = ({ pathname, router, homeData }) => {
  const page = pathname !== '/' ? pathname.split('/')[1] : 'home'

  return (
    <Suspense fallback={<LoadingComponent />}>
      <Canvas
        className={`${style.background} ${page !== 'home' && style.disableScroll}`}
        camera={{ position: [0, 0, 5], fov: 50 }}
        dpr={1}
        gl={{
          antialias: false,
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
      >
        <color attach="background" args={['#000000']} />

        <ScrollControls pages={4}>
          <RenderPageBackground page={page} />
          <ScrollWrapper style={{ width: '100vw', height: '100vh' }}>
            <div
              style={{
                display: page !== 'home' ? 'none' : 'block',
              }}
            >
              <HomeHTML homeData={homeData} router={router} />
              <ScrollDots />
            </div>
          </ScrollWrapper>
        </ScrollControls>
      </Canvas>
    </Suspense>
  )
}

export default Background
