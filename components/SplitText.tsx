import { motion } from 'framer-motion'

export function SplitText({ children }) {
  return children.split('').map((letter, i) => {
    return (
      <div
        key={children + i}
        style={{ display: 'inline-block', overflow: 'hidden' }}
      >
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate="visible"
          variants={{
            visible: i => ({
              opacity: 1,
              y: 0,
              transition: {
                type: "circOut",
                duration: 0.25,
                delay: i * 0.01
              }
            })
          }}
          style={{ display: 'inline-block', willChange: 'transform' }}
          custom={i}
        >
          {letter === " " ? "\u00A0" : letter}
        </motion.div>
      </div>
    )
  })
}
