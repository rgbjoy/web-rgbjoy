'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import style from '../siteLayout.module.scss'

const EditPageButton = ({ isAdmin }: { isAdmin: boolean }) => {
  const pathname = usePathname()

  if (!isAdmin) return null

  const segments = pathname.split('/').filter(Boolean)
  const firstSegment = segments[0]
  const isGlobalPage = !firstSegment || ['info', 'dev', 'art'].includes(firstSegment)

  if (isGlobalPage) {
    const slug = firstSegment || 'home'
    return (
      <Link href={`/dashboard/globals/${slug}`} className={style.editButton}>
        Edit Page
      </Link>
    )
  }

  return null
}

export default EditPageButton
