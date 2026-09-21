"use client"

import dynamic from "next/dynamic"

// Three.js decoder modules require browser URLs during initialization.
const Scene = dynamic(() => import("./Scene"), { ssr: false })
export default function Page() { return <Scene /> }
