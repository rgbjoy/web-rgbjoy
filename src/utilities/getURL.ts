import canUseDOM from './canUseDOM'

export const getServerSideURL = () => {

  const ensureProtocol = (url?: string) => (url?.startsWith('http') ? url : url ? `https://${url}` : undefined)

  return ensureProtocol(process.env.SERVER_URL) || 'http://localhost:3000'
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
