import { proxy } from 'valtio'

const state = proxy({
  scale: 0,
  minScale: 0.4,
  maxScale: 0.8,
})
export default state
