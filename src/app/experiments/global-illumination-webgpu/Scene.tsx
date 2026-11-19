"use client"

import { GlobalIlluminationViewer } from "./Viewer"
import { GlobalIlluminationWebGPUCanvas } from "./GlobalIlluminationWebGPU"

export default function Page() {
  return <GlobalIlluminationViewer Canvas={GlobalIlluminationWebGPUCanvas} />
}
