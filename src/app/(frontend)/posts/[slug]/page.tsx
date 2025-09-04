import React from 'react'
import PageWrapper from '@/components/pageWrapper'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import style from './post.module.scss'
import formatDate from '@/components/formatDate'
import parse from 'html-react-parser'
import NextImage from 'next/image'
import Link from 'next/link'
import ImageWithShimmer from '@/components/imageWithShimmer'

interface PostPageProps {
  params: Promise<{
    slug: string
  }>
}

const replaceTags = (node) => {
  if (node.type === 'tag' && node.name === 'img') {
    const { src, alt, width, height } = node.attribs
    return <NextImage src={src} alt={alt} width={width} height={height} unoptimized />
  }

  if (node.type === 'tag' && node.name === 'iframe') {
    if (node.attribs.srcdoc) {
      return <iframe srcDoc={node.attribs.srcdoc} width="100%" height="300px" />
    }

    // Handle p5js editor iframes
    if (node.attribs.src?.includes('editor.p5js.org')) {
      const parentDiv = node.parent
      const width = parentDiv?.attribs?.style?.match(/width:(\d+)px/)?.[1] || '400'
      const baseHeight = parentDiv?.attribs?.style?.match(/height:(\d+)px/)?.[1] || '400'
      const height = (parseInt(baseHeight) + 42).toString()

      return (
        <iframe
          src={node.attribs.src}
          width={`${width}px`}
          height={`${height}px`}
          style={{ border: 'none' }}
        />
      )
    }
  }
}

export default async function PostPage(props: PostPageProps) {
  const { slug } = await props.params
  const payload = await getPayload({ config: configPromise })
  const { docs } = await payload.find({
    collection: 'posts',
    draft: true,
    limit: 1,
    pagination: false,
    where: {
      slug: { equals: slug },
    },
  })

  const post = docs?.[0] || null

  if (!post) {
    return notFound()
  }

  const contentParsed = parse(post.contentRichText_html || '', {
    replace: replaceTags,
  })

  return (
    <PageWrapper className={style.post}>
      <span>← </span>
      <Link className="underline" href="/posts">
        Back to posts
      </Link>
      {post.featuredImage && (
        <ImageWithShimmer
          imageUrl={typeof post.featuredImage === 'object' ? (post.featuredImage?.url ?? '') : ''}
          post={post.title}
          imageWidth={typeof post.featuredImage === 'object' ? (post.featuredImage?.width ?? 0) : 0}
          imageHeight={
            typeof post.featuredImage === 'object' ? (post.featuredImage?.height ?? 0) : 0
          }
        />
      )}
      <h2 className={style.title}>{post.title}</h2>
      <h3 itemProp="datePublished" className={style.date}>
        {formatDate(post.createdAt)}
      </h3>
      <div className={style.content}>{contentParsed}</div>
      <span>← </span>
      <Link className="underline" href="/posts">
        Back to posts
      </Link>
    </PageWrapper>
  )
}
