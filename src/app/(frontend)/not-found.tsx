import Link from 'next/link'
import Layout from '@/components/pageWrapper'
import style from './not-found.module.scss'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Oops! Page not found',
  description: 'Multidisciplinary digital creator & software engineer',
}

const NotFound = () => (
  <Layout className={style.notFound}>
    <h1>Have you tried turning it off and on again?</h1>
    <Link className={`btn ${style.btn}`} href="/">
      Reset
    </Link>
  </Layout>
)

export default NotFound
