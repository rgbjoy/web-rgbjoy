import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Matrix4 } from 'three'
import { GHOST_QUALITY, type GhostQuality } from './quality'

const HEAD_SUPPORT_RADIUS = 0.625
export const HEAD_Y = 2.0

type Constraint = { a: number; b: number; length: number; stiffness: number }

/** A particle cloth surface with stretch, shear and bending constraints.
 * No rigid bodies are involved. A few crown and face anchors hold the sheet
 * over an invisible head, leaving the temples and back free to settle;
 * the skirt integrates gravity, wind and inertia at a fixed timestep. */
export class GhostCloth {
  readonly geometry = new BufferGeometry()
  readonly segments: number
  readonly rest: Float32Array
  readonly positions: Float32Array
  private readonly previous: Float32Array
  private readonly weights: Float32Array
  private readonly rows: number
  private readonly step: number
  private readonly stepSquared: number
  private readonly iterations: number
  private readonly damping: number
  private readonly constraints: Constraint[] = []
  private readonly renderPositions: Float32Array
  private readonly inverseBody = new Matrix4()
  private gravityX = 0
  private gravityY = -2.4
  private gravityZ = 0
  private floorX = 0
  private floorY = 1
  private floorZ = 0
  private floorOffset = 0
  private floorLength = 1
  private floorHeight = 0.1
  private accumulator = 0
  private time = 0

  constructor(quality: GhostQuality = 'desktop') {
    const { segments, capRows, skirtRows, step, iterations } = GHOST_QUALITY[quality].cloth
    const rows = capRows + skirtRows
    this.segments = segments
    this.rows = rows
    this.step = step
    this.stepSquared = step * step
    this.iterations = iterations
    // Preserve the same damping per second at either simulation frequency.
    this.damping = 0.975 ** (step * 90)
    this.rest = new Float32Array((rows + 1) * segments * 3)
    this.positions = new Float32Array(this.rest.length)
    this.previous = new Float32Array(this.rest.length)
    this.weights = new Float32Array((rows + 1) * segments)
    this.renderPositions = new Float32Array((rows + 1) * (segments + 1) * 3)
    for (let row = 0; row <= rows; row++) {
      const skirt = Math.max(0, (row - capRows) / skirtRows)
      const phi = Math.min(row / capRows, 1) * Math.PI * 0.5
      const radius =
        row <= capRows ? Math.max(0.001, Math.sin(phi) * 0.64) : 0.64 + Math.pow(skirt, 0.8) * 0.19
      const y = row <= capRows ? HEAD_Y + Math.cos(phi) * 0.64 : HEAD_Y - skirt * 1.72

      for (let col = 0; col < segments; col++) {
        const theta = (col / segments) * Math.PI * 2
        // The cloth has a little excess material over the head. Broad,
        // uneven pleats run from the crown into the hanging folds, rather
        // than making the supported part a perfectly smooth hemisphere.
        const cap = row <= capRows
        const crownEnvelope = cap ? Math.sin(phi) ** 1.5 : Math.exp(-skirt * 12)
        const faceClearance = cap
          ? 1 - Math.exp(-Math.pow((y - 2.14) / 0.25, 2)) * Math.max(0, Math.cos(theta)) ** 8
          : 1
        const crownFold =
          crownEnvelope *
          faceClearance *
          (0.022 * Math.sin(theta * 7 + phi * 1.8 + 0.5) + 0.011 * Math.sin(theta * 11 - phi * 2.3))
        const fold =
          (Math.sin(theta * 9 + 0.4) * 0.044 + Math.sin(theta * 13 - 0.7) * 0.015) *
            Math.pow(skirt, 0.65) +
          crownFold
        const index = (row * segments + col) * 3
        this.rest[index] = Math.sin(theta) * (radius + fold)
        this.rest[index + 1] =
          y +
          (cap ? crownFold * Math.cos(phi) : 0) +
          Math.pow(skirt, 6) * (0.055 * Math.cos(theta * 5 + 0.4) + 0.035 * Math.sin(theta * 9))
        this.rest[index + 2] = Math.cos(theta) * (radius + fold)
        // Keep the fabric immediately around the eyes attached to the gaze.
        // The remaining crown can move against the head's collision surface.
        const faceAnchor = row <= capRows + 1 && y < 2.4 && Math.cos(theta) > 0.58
        this.weights[row * segments + col] = row <= 2 || faceAnchor ? 0 : 1
      }
    }
    this.positions.set(this.rest)
    this.previous.set(this.rest)

    const add = (a: number, b: number, stiffness: number) => {
      // Constraints wholly inside the supported head cannot move.
      if (this.weights[a] + this.weights[b] === 0) return
      const i = a * 3
      const j = b * 3
      this.constraints.push({
        a,
        b,
        stiffness,
        length: Math.hypot(
          this.rest[i] - this.rest[j],
          this.rest[i + 1] - this.rest[j + 1],
          this.rest[i + 2] - this.rest[j + 2],
        ),
      })
    }
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col < segments; col++) {
        const a = row * segments + col
        const next = (col + 1) % segments
        add(a, row * segments + next, 0.95)
        if (row < rows) {
          add(a, (row + 1) * segments + col, 0.95)
          add(a, (row + 1) * segments + next, 0.48)
          add(row * segments + next, (row + 1) * segments + col, 0.48)
        }
        if (row < rows - 1) add(a, (row + 2) * segments + col, 0.3)
        add(a, row * segments + ((col + 2) % segments), 0.26)
      }
    }

    const uv = new Float32Array((rows + 1) * (segments + 1) * 2)
    const restPositions = new Float32Array(this.renderPositions.length)
    const indices: number[] = []
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= segments; col++) {
        const vertex = row * (segments + 1) + col
        const particle = (row * segments + (col % segments)) * 3
        restPositions.set(this.rest.subarray(particle, particle + 3), vertex * 3)
        uv[vertex * 2] = col / segments
        uv[vertex * 2 + 1] = row / rows
        if (row < rows && col < segments) {
          const a = vertex
          const b = vertex + 1
          const c = vertex + segments + 1
          indices.push(a, c, b, b, c, c + 1)
        }
      }
    }
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(this.renderPositions, 3).setUsage(DynamicDrawUsage),
    )
    this.geometry.setAttribute('restPosition', new BufferAttribute(restPositions, 3))
    this.geometry.setAttribute('uv', new BufferAttribute(uv, 2))
    this.geometry.setIndex(indices)
    this.syncGeometry()
    this.geometry.computeBoundingSphere()
  }

  update(delta: number, head: Matrix4, breeze: number, body?: Matrix4) {
    // The simulation lives in character space. Gravity and the stage stay in
    // world space even while the ghost spins, stretches or lies on its side.
    if (body) {
      const inverse = this.inverseBody.copy(body).invert().elements
      this.gravityX = -2.4 * inverse[4]
      this.gravityY = -2.4 * inverse[5]
      this.gravityZ = -2.4 * inverse[6]
      const m = body.elements
      this.floorX = m[1]
      this.floorY = m[5]
      this.floorZ = m[9]
      this.floorOffset = m[13]
      this.floorLength = this.floorX ** 2 + this.floorY ** 2 + this.floorZ ** 2
      this.floorHeight = 0.06
    } else {
      this.gravityX = this.gravityZ = 0
      this.gravityY = -2.4
      this.floorX = this.floorZ = this.floorOffset = 0
      this.floorY = this.floorLength = 1
      this.floorHeight = 0.1
    }
    // Dropping excess elapsed time prevents a tab returning from suspension
    // from producing a burst of physics or a large velocity impulse.
    this.accumulator = Math.min(this.accumulator + delta, this.step * 4)
    while (this.accumulator >= this.step) {
      this.integrate(head, breeze)
      this.accumulator -= this.step
      this.time += this.step
    }
    // The gaze changes every render, including frames without a physics step
    // on high refresh rate displays. Keep the supported face and its interior
    // on the same pose; the surrounding free cloth can lag behind the head.
    this.pinHead(head)
    this.syncGeometry()
  }

  private pinHead(head: Matrix4) {
    const m = head.elements
    for (let particle = 0; particle < this.weights.length; particle++) {
      if (this.weights[particle] !== 0) continue
      const i = particle * 3
      const x = this.rest[i]
      const y = this.rest[i + 1]
      const z = this.rest[i + 2]
      this.positions[i] = this.previous[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
      this.positions[i + 1] = this.previous[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
      this.positions[i + 2] = this.previous[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
    }
  }

  private integrate(head: Matrix4, breeze: number) {
    const p = this.positions
    const m = head.elements
    for (let particle = 0; particle < this.weights.length; particle++) {
      const i = particle * 3
      const x = this.rest[i]
      const y = this.rest[i + 1]
      const z = this.rest[i + 2]
      const tx = m[0] * x + m[4] * y + m[8] * z + m[12]
      const ty = m[1] * x + m[5] * y + m[9] * z + m[13]
      const tz = m[2] * x + m[6] * y + m[10] * z + m[14]

      if (this.weights[particle] === 0) {
        p[i] = this.previous[i] = tx
        p[i + 1] = this.previous[i + 1] = ty
        p[i + 2] = this.previous[i + 2] = tz
        continue
      }

      const skirt = Math.max(0, (HEAD_Y - y) / 1.72)
      const cap = y >= HEAD_Y - 0.06
      // A weak rest-shape spring represents the support of the concealed body
      // and keeps the sheet's volume. Distance constraints provide its fabric.
      const follow = 1 - skirt * 0.82
      const goalX = x + (tx - x) * follow
      const goalY = y + (ty - y) * follow
      const goalZ = z + (tz - z) * follow
      const gust = breeze * (cap ? 0.16 : skirt)
      const spring = cap ? 140 : 32
      const fx =
        (goalX - p[i]) * spring +
        this.gravityX +
        gust * (1.3 + Math.sin(this.time * 1.1 + y * 2.1) * 1.8)
      const fy =
        (goalY - p[i + 1]) * spring + this.gravityY + gust * Math.sin(this.time * 1.7 + x * 4) * 0.4
      const fz =
        (goalZ - p[i + 2]) * spring +
        this.gravityZ +
        gust * Math.sin(this.time * 0.9 + y * 2.8 + x * 3) * 1.7
      for (let axis = 0; axis < 3; axis++) {
        const current = p[i + axis]
        p[i + axis] +=
          (current - this.previous[i + axis]) * this.damping +
          (axis === 0 ? fx : axis === 1 ? fy : fz) * this.stepSquared
        this.previous[i + axis] = current
      }
    }

    for (let iteration = 0; iteration < this.iterations; iteration++) {
      for (const constraint of this.constraints) {
        const { a, b, length, stiffness } = constraint
        const wa = this.weights[a]
        const wb = this.weights[b]
        const i = a * 3
        const j = b * 3
        const dx = p[j] - p[i]
        const dy = p[j + 1] - p[i + 1]
        const dz = p[j + 2] - p[i + 2]
        // Distances are small and bounded; avoid generalized hypot in this hot loop.
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (distance < 0.00001) continue
        const correction = (((distance - length) / distance) * stiffness) / (wa + wb)
        p[i] += dx * correction * wa
        p[i + 1] += dy * correction * wa
        p[i + 2] += dz * correction * wa
        p[j] -= dx * correction * wb
        p[j + 1] -= dy * correction * wb
        p[j + 2] -= dz * correction * wb
      }
      // Prevent the lower sheet from folding through its invisible body or
      // reaching the stage. There is no costly cloth self-collision pass.
      for (let particle = 0; particle < this.weights.length; particle++) {
        if (this.weights[particle] === 0) continue
        const i = particle * 3
        if (this.rest[i + 1] >= HEAD_Y - 0.06) {
          const dy = p[i + 1] - HEAD_Y
          const distance = Math.hypot(p[i], dy, p[i + 2])
          if (distance < HEAD_SUPPORT_RADIUS) {
            const scale = HEAD_SUPPORT_RADIUS / Math.max(distance, 0.001)
            p[i] *= scale
            p[i + 1] = HEAD_Y + dy * scale
            p[i + 2] *= scale
          }
        } else {
          const radius = Math.hypot(p[i], p[i + 2])
          if (radius < 0.54) {
            p[i] *= 0.54 / Math.max(radius, 0.001)
            p[i + 2] *= 0.54 / Math.max(radius, 0.001)
          }
        }
        const worldY =
          this.floorX * p[i] + this.floorY * p[i + 1] + this.floorZ * p[i + 2] + this.floorOffset
        if (worldY < this.floorHeight) {
          const correction = (this.floorHeight - worldY) / this.floorLength
          p[i] += this.floorX * correction
          p[i + 1] += this.floorY * correction
          p[i + 2] += this.floorZ * correction
        }
      }
    }
  }

  private syncGeometry() {
    const { segments, rows } = this
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= segments; col++) {
        const source = (row * segments + (col % segments)) * 3
        const destination = (row * (segments + 1) + col) * 3
        for (let axis = 0; axis < 3; axis++) {
          this.renderPositions[destination + axis] = this.positions[source + axis]
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.computeVertexNormals()
    // The duplicated UV seam shares a physical particle and must share a
    // normal, too, or a bright vertical seam appears on the face.
    const normals = this.geometry.attributes.normal
    for (let row = 0; row <= rows; row++) {
      const a = row * (segments + 1)
      const b = a + segments
      const x = normals.getX(a) + normals.getX(b)
      const y = normals.getY(a) + normals.getY(b)
      const z = normals.getZ(a) + normals.getZ(b)
      const length = Math.hypot(x, y, z) || 1
      normals.setXYZ(a, x / length, y / length, z / length)
      normals.setXYZ(b, x / length, y / length, z / length)
    }
    normals.needsUpdate = true
  }

  dispose() {
    this.geometry.dispose()
  }
}
