export function onRequestError(error: unknown) {
  // Keep server failures visible in Workers observability without logging request bodies.
  console.error('Request rendering failed', error)
}
