import { useState } from 'react'
import { createPortal } from 'react-dom'
import Media from '@/app/(frontend)/components/media'
import styles from './lightbox.module.scss'

const LightBox = ({ children, media }) => {
  const [isOpen, setIsOpen] = useState(false)

  const toggleIsOpen = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      document.querySelector('body')?.classList.add('noscroll')
      const header = document.querySelector('#header')
      const footer = document.querySelector('#footer')
      if (header) header.classList.add('hidden')
      if (footer) footer.classList.add('hidden')
    } else {
      document.querySelector('body')?.classList.remove('noscroll')
      const header = document.querySelector('#header')
      const footer = document.querySelector('#footer')
      if (header) header.classList.remove('hidden')
      if (footer) footer.classList.remove('hidden')
    }
  }

  return (
    <div onClick={toggleIsOpen}>
      {children}
      {isOpen && typeof window !== 'undefined'
        ? createPortal(
            <div onClick={toggleIsOpen} className={styles.lightbox}>
              <div className={styles.lightbox__inner}>
                <Media media={media.image} />
                <div className={styles.lightbox__caption}>
                  {media.title}
                  <div>{media.description}</div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default LightBox
