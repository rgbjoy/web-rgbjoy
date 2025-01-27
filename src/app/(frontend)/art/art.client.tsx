'use client'

import PageWrapper from '@/components/pageWrapper'
import Masonry from 'react-masonry-css'
import style from './art.module.scss'
import Media from 'src/app/(frontend)/art/components/media'
import LightBox from 'src/app/(frontend)/art/components/lightbox'
import { SplitText } from '@/components/splitText'

import { useState, useEffect, useRef } from 'react'
import { Art } from '@payload-types'

export default function ArtClient(page: Art) {
  const artwork = page.artworks

  function useHover<HTMLDivElement>() {
    const [value, setValue] = useState<boolean>(false)
    const ref: any = useRef<HTMLDivElement | null>(null)
    const handleMouseOver = (): void => setValue(true)
    const handleMouseOut = (): void => setValue(false)

    useEffect(() => {
      const node: any = ref.current
      if (node) {
        node.addEventListener('mouseover', handleMouseOver)
        node.addEventListener('mouseout', handleMouseOut)
        node.addEventListener('click', handleMouseOut)

        return () => {
          node.removeEventListener('mouseover', handleMouseOver)
          node.removeEventListener('mouseout', handleMouseOut)
          node.removeEventListener('click', handleMouseOut)
        }
      }
    }, [])
    return [ref, value]
  }

  const DoodleImage = ({ media, ...props }) => {
    const [hoverRef, isHovered] = useHover<HTMLDivElement>()

    return (
      <div {...props} ref={hoverRef} className={style.media}>
        <LightBox media={media}>
          <div className={`${style.thumbnail} ${isHovered ? style.hovered : ''}`}>
            {media?.image && <Media media={media.image} thumbnail />}
          </div>
          <div className={style.caption}>{media?.title}</div>
        </LightBox>
      </div>
    )
  }

  return (
    <PageWrapper className={style.art} page="art">
      <h1 className={style.header}>
        <SplitText>{page.header}</SplitText>
      </h1>

      <div dangerouslySetInnerHTML={{ __html: page.content_html ?? '' }} />
      <Masonry
        breakpointCols={2}
        className={style['my-masonry-grid'] ?? ""}
        columnClassName={style['my-masonry-grid_column']}
      >
        {artwork?.map((item, i) => {
          return item.image && <DoodleImage key={'media' + i} media={item} />
        })}
      </Masonry>
    </PageWrapper>
  )
}
