import canUseDOM from './canUseDOM'

export const getServerSideURL = () => {
  const pickVercelHost = () =>
    process.env.VERCEL_BRANCH_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL

  const ensureProtocol = (url?: string) =>
    url?.startsWith('http') ? url : url ? `https://${url}` : undefined

  return ensureProtocol(pickVercelHost()) || 'http://localhost:3000'
}

export const getClientSideURL = () => {
  if (canUseDOM) {
    const protocol = window.location.protocol
    const domain = window.location.hostname
    const port = window.location.port

    return `${protocol}//${domain}${port ? `:${port}` : ''}`
  }

  return getServerSideURL()
}
