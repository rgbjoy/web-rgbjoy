'use client'

import React from 'react'
import { motion } from 'framer-motion'
import TerminalOverlay from '@/components/TerminalOverlay'
import EditPageButton from '@/components/EditPageButton'

export default function GlobalClient({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
      <EditPageButton isAdmin={isAdmin} />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.75, ease: 'easeOut' }}
      >
        <TerminalOverlay />
      </motion.div>
    </>
  )
}

