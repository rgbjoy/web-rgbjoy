'use client'

import { Suspense, useState } from 'react'
import NextImage from 'next/image'
import style from '@/components/imageShimmer.module.css'

function ImageWithShimmer({ imageUrl, post, imageWidth, imageHeight }) {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <Suspense fallback={<div style={{ background: 'grey' }}></div>}>
      <div className={style.featuredImageContainer}>
        <NextImage
          itemProp="image"
          className={isLoading ? style.imageLoading : style.featuredImage}
          src={imageUrl}
          alt={`Featured image for ${post.title}`}
          width={imageWidth || 1000}
          height={imageHeight || 600}
          priority
          onLoad={() => setIsLoading(false)}
          quality={80}
          unoptimized
        />
      </div>
    </Suspense>
  )
}

export default ImageWithShimmer
