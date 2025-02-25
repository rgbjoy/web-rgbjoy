import React from 'react'
import Image from 'next/image'

export const Icon = async () => {
  return <Image src="/logo.svg" width={40} height={40} alt="Visit Site" />
}

export default Icon
