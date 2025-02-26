'use client'

import PageWrapper from '@/components/pageWrapper'
import style from './dev.module.scss'
import { SplitText } from '@/components/splitText'
import { Dev, Media } from '@payload-types'
import Image from 'next/image'

export default function DevClient(page: Dev) {
  const GetProjects = () => {
    return (
      <>
        <div className={style.imageContainer}>
          {page.pastProjects?.map((project, i) => {
            const image = project.image as Media
            if (image?.url) {
              return (
                <Image
                  key={`preview-${i}`}
                  src={image.url}
                  alt={project.title || ''}
                  width={300}
                  height={200}
                  quality={75}
                  priority={true}
                  className={`${style.previewImage} preview-${i}`}
                />
              )
            }
            return null
          })}
        </div>

        <ul className={style.list}>
          {page.pastProjects?.map((project, i) => {
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
      <GetProjects />
    </PageWrapper>
  )
}
