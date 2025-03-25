'use client'

import { motion } from 'framer-motion'

export default function LoadingComponent() {
  return (
    <motion.div className="loading">
      <div className="loading-text">
        Loading
        <motion.span
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            repeatType: 'loop',
          }}
        >
          ...
        </motion.span>
      </div>
    </motion.div>
  )
}
