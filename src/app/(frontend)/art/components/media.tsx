import { motion, useAnimation } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import style from '../art.module.scss'
import { Media as MediaType } from '@payload-types'

const Media = ({ media, thumbnail = false }: { media: MediaType; thumbnail?: boolean }) => {
  const animationVariants = {
    visible: {
      opacity: 1,
      background: 'rgba(35, 35, 35, 0)',
    },
    hidden: {
      opacity: 0.5,
      background: 'rgba(35, 35, 35, 1)',
    },
  }

  const [loaded, setLoaded] = useState(false)
  const animationControls = useAnimation()
  useEffect(() => {
    if (loaded) {
      animationControls.start('visible')
    }
  }, [loaded, animationControls])

  if (media.mimeType?.includes('video')) {
    return (
      <video
        playsInline
        muted
        autoPlay
        loop
        width={thumbnail ? 300 : media.width || 300}
        height={thumbnail ? 300 : media.height || 300}
      >
        <source src={media.url || ''} type="video/mp4" />
      </video>
    )
  } else {
    return (
      <motion.div
        initial={'hidden'}
        animate={animationControls}
        variants={animationVariants}
        transition={{ ease: 'easeOut', duration: 0.25 }}
      >
        <div className={style.image_wrapper}>
          <Image
            src={
              thumbnail ? media.sizes?.card?.url || '' : media.url || media.sizes?.card?.url || ''
            }
            width={thumbnail ? media.sizes?.card?.width || 300 : media.width || 300}
            height={thumbnail ? media.sizes?.card?.height || 300 : media.height || 300}
            alt={media.alt || ''}
            quality={thumbnail ? 75 : 100}
            onLoad={() => setLoaded(true)}
            unoptimized
          />
        </div>
      </motion.div>
    )
  }
}

export default Media
