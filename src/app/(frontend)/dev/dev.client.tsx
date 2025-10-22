'use client'

import PageWrapper from '@/components/pageWrapper'
import style from './dev.module.scss'
import { SplitText } from '@/components/splitText'
import { Dev, Media } from '@payload-types'
import NextImage from 'next/image'

const GetProjects = ({ pastProjects }: { pastProjects: Dev['pastProjects'] }) => {
  return (
    <>
      <div className={style.imageContainer}>
        {pastProjects?.map((project, i) => {
          const image = project.image as Media
          if (image?.url) {
            return (
              <NextImage
                key={`preview-${i}`}
                src={image.url}
                alt={project.title || ''}
                width={300}
                height={200}
                quality={75}
                priority={true}
                className={`${style.previewImage} preview-${i}`}
                unoptimized
              />
            )
          }
          return null
        })}
      </div>

      <ul className={style.list}>
        {pastProjects?.map((project, i) => {
          const title = project.title
          const description = project.description
          const link = project.link.url
          const image = project.image as Media

          return (
            <li className={style.item} key={'projects' + i}>
              <a
                className="link"
                href={link}
                target="_blank"
                rel="noreferrer"
                onMouseMove={(e) => {
                  if (image) {
                    const preview = document.querySelector(`.preview-${i}`) as HTMLElement
                    if (preview) {
                      preview.style.left = `${e.clientX + 20}px`
                      preview.style.top = `${e.clientY + 20}px`
                      preview.style.display = 'block'
                    }
                  }
                }}
                onMouseLeave={() => {
                  const preview = document.querySelector(`.preview-${i}`) as HTMLElement
                  if (preview) {
                    preview.style.display = 'none'
                  }
                }}
              >
                <div className={style.name}>{title}</div>
                <div className={style.description}>{description}</div>
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}

export default function DevClient(page: Dev) {
  return (
    <PageWrapper className={style.dev}>
      <h1 className={style.header}>
        <SplitText>{page.header}</SplitText>
      </h1>

      <div
        className={style.content}
        dangerouslySetInnerHTML={{ __html: page.content_html || '' }}
      />

      <h2 className={style.sectionTitle}>Projects</h2>
      <GetProjects pastProjects={page.pastProjects} />
    </PageWrapper>
  )
}
