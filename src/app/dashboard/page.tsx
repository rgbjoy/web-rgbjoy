import type { Metadata } from 'next'
import Dashboard from './Dashboard'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
export default function DashboardPage() { return <Dashboard /> }
