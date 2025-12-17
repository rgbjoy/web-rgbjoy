'use client'

import { motion } from 'framer-motion'
import TerminalOverlay from '@/components/TerminalOverlay'

export default function GlobalClient({ isAdmin }: { isAdmin: boolean }) {
  return (
    <>
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
