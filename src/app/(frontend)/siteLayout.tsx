'use client'

import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import style from './siteLayout.module.scss'
import NavLink from '@/components/navLink'
import TerminalOverlay from '@/components/TerminalOverlay'

const DynamicBackground = dynamic(() => import('@/components/background/background'), {
  loading: () => <div className="loading">...</div>,
  ssr: false,
})

const Footer = ({ footerLinks }) => {
  return (
    <div className={style.footerWrapper}>
      <div className={style.footerLinks}>
        {footerLinks.map((item) => (
          <a key={item.title} target="_blank" rel="noreferrer" href={item.link}>
            {item.title}
          </a>
        ))}
      </div>
    </div>
  )
}

const SiteLayout = ({ children, homeData, footerData, postsData }) => {
  const pathname = usePathname()

  // hamburger
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Function to toggle the menu state
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const closeMenu = () => {
    setIsMenuOpen(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const links = [
    { label: '/', path: '/', targetSegment: null, color: null },
    { label: 'Info', path: '/info', targetSegment: 'info', color: 'red' },
    { label: 'Dev', path: '/dev', targetSegment: 'dev', color: 'green' },
    {
      label: 'Art & Design',
      path: '/art',
      targetSegment: 'art',
      color: 'blue',
    },
    {
      label: 'Posts',
      path: '/posts',
      targetSegment: 'posts',
      color: 'yellow',
    },
  ]

  const isNotFound = !links.some(
    (link) => link.path === '/' + pathname.split('/')[1]
  )
  const router = useRouter()

  return (
    <>
      <DynamicBackground
        router={router}
        pathname={isNotFound ? '404' : pathname}
        homeData={homeData}
      />

      {children}

      <div
        ref={menuRef}
        id="header"
        className={`${style.header} ${isMenuOpen ? style.menuOpen : ''}`}
      >
        <div className={style.header_inner}>
        <button
            onClick={toggleMenu}
            type="button"
            className={style.hamburgerMenu}
          >
            {isMenuOpen ? `- Close` : `+ Menu`}
          </button>
          <nav>
            {links.map((l, i) =>
              pathname === '/' && l.path === '/' ? null : (
                <NavLink key={i} {...l} closeMenu={closeMenu} />
              )
            )}
          </nav>
        </div>
      </div>

      <motion.footer id="footer" className={style.footer}>
        {footerData.links && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: 0.75,
              duration: 0.75,
              ease: 'easeOut',
            }}
          >
            <Footer footerLinks={footerData.links} />
          </motion.div>
        )}
      </motion.footer>

      {pathname !== '/art' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.75, ease: 'easeOut' }}
          className={'badge'}
        >
          2024 Portfolio
        </motion.div>
      ) : null}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.75, ease: 'easeOut' }}
      >
        <TerminalOverlay postsData={postsData.docs} />
      </motion.div>
    </>
  )
}

export default SiteLayout
