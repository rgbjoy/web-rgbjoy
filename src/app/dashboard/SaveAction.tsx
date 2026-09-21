'use client'
import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './dashboard.module.css'

export const SaveTarget = createContext<HTMLElement | null>(null)

export default function SaveAction({ children }: { children: ReactNode }) {
  const target = useContext(SaveTarget)
  return target ? createPortal(<div className={styles.saveAction}>{children}</div>, target) : null
}
