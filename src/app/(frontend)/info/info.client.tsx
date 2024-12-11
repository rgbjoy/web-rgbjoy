'use client'

import Image from 'next/image'
import PageWrapper from '@/components/pageWrapper'
import { SplitText } from '@/components/splitText'
import style from './info.module.scss'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion, useAnimation } from 'framer-motion'
import { Info, Media } from '@payload-types'

export default function InfoClient(page: Info) {
  const GetLinks = () => {
    return (
      <div className={style.links}>
        {page.links?.map((value, i) => {
          const title = value.link?.title || ''
          const url = value.link?.url || ''

          return (
            <span key={'links' + i}>
              <a className="underline" href={url} target="_blank" rel="noreferrer">
                {title}
              </a>
              <span>{i < (page.links?.length || 0) - 1 ? ' • ' : ''}</span>
            </span>
          )
        })}
      </div>
    )
  }

  const GetStrengths = () => {
    return (
      <div>
        {page.strengths?.map((value, i) => {
          const title = value.title
          const detail = value.strengthsList

          return (
            <div className={style.strengths} key={'strengths' + i}>
              <div>{title}</div>
              <div className={style.detail}>{detail}</div>
            </div>
          )
        })}
      </div>
    )
  }

  const Selfie = () => {
    const [loaded, setLoaded] = useState(false)
    const animationControls = useAnimation()
    const animationVariants = {
      visible: { opacity: 1 },
      hidden: { opacity: 0 },
    }

    useEffect(() => {
      if (loaded) {
        animationControls.start('visible')
      }
    }, [loaded, animationControls])

    const image = page?.profileImage as Media

    if (!image) {
      return null
    }

    return (
      <div className={style.selfieWrapper}>
        <motion.div
          initial={'hidden'}
          animate={animationControls}
          variants={animationVariants}
          transition={{ ease: 'easeOut', duration: 1, delay: 1 }}
        >
          <Image
            src={image.url ?? ''}
            alt={image.alt ?? ''}
            width={image.width ?? 0}
            height={image.height ?? 0}
            onLoad={() => setLoaded(true)}
            priority
          />
        </motion.div>
      </div>
    )
  }

  return (
    <PageWrapper className={style.info}>
      <div className={style.selfie}>
        <h1 className={style.header}>
          <SplitText>{page.header}</SplitText>
        </h1>
        <Selfie />
      </div>

      <GetLinks />

      <div dangerouslySetInnerHTML={{ __html: page.content_html || '' }} />

      <Link className={`btn ${style.btn}`} href="/dev">
        See some work
      </Link>

      <GetStrengths />
    </PageWrapper>
  )
}
