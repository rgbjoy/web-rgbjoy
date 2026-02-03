import Link from 'next/link'
import style from './not-found.module.css'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Oops! Page not found',
  description: 'Multidisciplinary digital creator & software engineer',
}

export default async function NotFound() {
  return (
    <div className={style.notFound}>
      <h1>Have you tried turning it off and on again?</h1>
      <Link className={`btn ${style.btn}`} href="/">
        Reset
      </Link>
    </div>
  )
}
