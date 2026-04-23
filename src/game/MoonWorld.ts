import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'
import { buildBrokenEwall } from '@/game/EwallRobot'

/**
 * Procedural stylised moon world.
 *
 * All shapes here are flat-shaded, low-poly (see `world-props.md`-style
 * budget — see the game prompt for the target). Every prop exposes a
 * `userData.collider` hint so the physics layer can read a simple box/ball
 * approximation instead of the full mesh.
 */

const MOON_SIZE = 300
const TERRAIN_SEG = 96

/** Half-side of the inner playable world. Outside this, the "outer
 *  wasteland" ring takes over — flat, sparse, deliberately uninteresting.
 *  Exported so MoonScene can detect when the player crosses the border
 *  and trigger Tusk's chiding dialog. */
export const WORLD_BOUNDARY = MOON_SIZE / 2
/** Half-side of the outer ring. Enough to feel like there's "nothing out
 *  there" without blowing out draw distance. */
export const WORLD_OUTER = MOON_SIZE * 4

const flatMaterial = (color: number | string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0.05, ...opts })

type Collider =
  | { kind: 'box'; key?: string; x: number; y: number; z: number; w: number; h: number; d: number; ry?: number }
  | { kind: 'ball'; key?: string; x: number; y: number; z: number; r: number }
  | { kind: 'cylinder'; key?: string; x: number; y: number; z: number; r: number; h: number }
  | { kind: 'convexHull'; key?: string; x: number; y: number; z: number; points: Float32Array }
  | {
  kind: 'heightfield';
  key?: string;
  nrows: number;
  ncols: number;
  heights: Float32Array;
  scaleX: number;
  scaleZ: number
}

/** One cut stone in the quarry — exposed so the gameplay layer can apply
 *  flamethrower damage, run the HP bar HUD, and remove the mesh/collider
 *  when the player finishes smelting it. */
export interface QuarryStone {
  mesh: THREE.Mesh
  /** World-space centre of the stone (mesh itself lives under a group). */
  worldPos: THREE.Vector3
  /** Half-height so HP bars can sit on the top face, not inside the block. */
  halfH: number
  /** Physics collider key — pass to `physics.removeBodyByKey` on death. */
  key: string
}

export type WorldLandmark = {
  kind:
    | 'flagpost' | 'quarry' | 'moonbase' | 'ore-boulder' | 'landing-pad'
    | 'refuel-tank' | 'lunar-module'
    | 'broken-ewall-valley' | 'broken-ewall-rift' | 'broken-ewall-quarry'
    | 'explorer-target'
  position: THREE.Vector3
}

export interface BuildResult {
  root: THREE.Group
  terrainMesh: THREE.Mesh
  colliders: Collider[]
  landmarks: WorldLandmark[]
  quarryStones: QuarryStone[]
  airlock: AirlockInstance
  airlockPos: THREE.Vector3
  heightAt: (x: number, z: number) => number
}

// Deterministic seeded PRNG so the world is identical every session.
const mulberry32 = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const makeTerrain = (rand: () => number) => {
  const geo = new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE, TERRAIN_SEG, TERRAIN_SEG)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute

  // A couple of large craters, a ridge, and some gentle stepped valleys.
  const craters = [
    { x: 60, z: -40, r: 22, depth: 3.5 },
    { x: -80, z: 40, r: 30, depth: 4.5 },
    { x: 20, z: 90, r: 14, depth: 2.2 },
    { x: -30, z: -120, r: 18, depth: 2.5 }
  ]

  // Bigger, deeper valleys — no rim, cosine-bowl profile. Radius/depth
  // chosen so the steepest slope is ~20° (well inside the 50° climb limit)
  // so Ewall can always escape them.
  const valleys = [
    { x: -50, z: -65, r: 26, depth: 5.5 },
    { x: 115, z: 25, r: 30, depth: 6.5 },
    { x: 75, z: 135, r: 22, depth: 4.8 }
  ]

  // Linear rifts — wide trenches the bot can drive into and out of. The
  // terrain mesh steps at MOON_SIZE / TERRAIN_SEG ≈ 3.1 m; rift ramp width
  // (outerW − innerW) must span several cells, otherwise triangulation
  // produces single-vertex spikes on the lip that trap the capsule. With
  // outerW ~8 m the ramp covers ≥3 cells and the cosine falloff smooths
  // out to a drivable slope (≈15–20°).
  const rifts = [
    { a: { x: 40, z: -75 }, b: { x: 85, z: -25 }, innerW: 2.0, outerW: 8.0, depth: 1.6 },
    { a: { x: -115, z: 85 }, b: { x: -75, z: 125 }, innerW: 1.8, outerW: 7.5, depth: 1.3 },
    { a: { x: 10, z: 150 }, b: { x: -30, z: 180 }, innerW: 2.2, outerW: 8.5, depth: 1.8 }
  ]

  const distToSeg = (
    px: number, pz: number,
    ax: number, az: number, bx: number, bz: number
  ) => {
    const dx = bx - ax, dz = bz - az
    const lenSq = dx * dx + dz * dz
    if (lenSq === 0) return Math.hypot(px - ax, pz - az)
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(px - (ax + t * dx), pz - (az + t * dz))
  }

  // Shared height function — used both for the visible vertex displacement
  // and for sampling the Rapier heightfield, so they're guaranteed to match.
  //
  // Edge taper. The inner terrain stops at ±MOON_SIZE/2 and hands off to
  // four flat outer-wasteland slabs whose top face sits at y=0. Without a
  // taper, the sine base plus any crater/valley/rift that clips the edge
  // leaves the heightfield at a non-zero Y at the boundary — producing a
  // visible seam AND a physics step where the character controller could
  // drop into the gap between the heightfield edge and the slab top.
  // `edgeBlend` drives the full computed height smoothly to zero over the
  // last TAPER_WIDTH metres of each side so both the rendered mesh and the
  // Rapier heightfield meet the outer slabs flush.
  const TAPER_WIDTH = 12
  const smoothstep = (t: number) => {
    const c = Math.max(0, Math.min(1, t))
    return c * c * (3 - 2 * c)
  }
  const edgeBlend = (x: number, z: number) => {
    const edgeDist = Math.min(
      MOON_SIZE / 2 - Math.abs(x),
      MOON_SIZE / 2 - Math.abs(z)
    )
    return smoothstep(edgeDist / TAPER_WIDTH)
  }
  const computeHeight = (x: number, z: number) => {
    let y = 0
    y += Math.sin(x * 0.02) * 0.6 + Math.cos(z * 0.023) * 0.5
    y += Math.sin((x + z) * 0.05) * 0.3
    // Craters: bowl with raised rim.
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z)
      if (d < c.r) {
        const n = d / c.r
        y -= c.depth * (Math.cos(n * Math.PI) * 0.5 + 0.5)
      } else if (d < c.r + 3) {
        y += 0.5 * (1 - (d - c.r) / 3)
      }
    }
    // Valleys: bowl, no rim (stays as an open dip).
    for (const v of valleys) {
      const d = Math.hypot(x - v.x, z - v.z)
      if (d < v.r) {
        const n = d / v.r
        y -= v.depth * (Math.cos(n * Math.PI) * 0.5 + 0.5)
      }
    }
    // Rifts: flat inner floor (depth r.depth) inside innerW, ramp out to
    // zero at outerW via cosine so the lip curves smoothly.
    for (const r of rifts) {
      const d = distToSeg(x, z, r.a.x, r.a.z, r.b.x, r.b.z)
      if (d >= r.outerW) continue
      if (d <= r.innerW) {
        y -= r.depth
      } else {
        const t = (d - r.innerW) / (r.outerW - r.innerW)  // 0..1
        y -= r.depth * (Math.cos(t * Math.PI) * 0.5 + 0.5)
      }
    }
    // Edge taper — applied last so every contributor (base sine, craters,
    // valleys, rifts) is blended down together. `edgeBlend` is 1 in the
    // interior and smoothly falls to 0 in the outermost TAPER_WIDTH metres
    // so the heightfield and the outer slab both read y=0 at ±MOON_SIZE/2.
    y *= edgeBlend(x, z)
    return y
  }

  const heightMap = new Map<string, number>()
  const key = (x: number, z: number) => `${Math.round(x)}|${Math.round(z)}`

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const y = computeHeight(x, z)
    pos.setY(i, y)
    heightMap.set(key(x, z), y)
  }
  geo.computeVertexNormals()

  const heightAt = (x: number, z: number) => {
    // True bilinear interpolation against the 4 samples that bracket (x, z).
    // The previous implementation averaged 4 samples from a single rounded
    // corner of a cell, which biased the return value upward on crater/valley
    // slopes and disagreed with the Rapier heightfield — producing the
    // "safety net" clamp at PlayerController:280 yanking the capsule upward
    // any time the player walked into a bowl, followed by a fall.
    const step = MOON_SIZE / TERRAIN_SEG
    const gx0 = Math.floor(x / step) * step
    const gz0 = Math.floor(z / step) * step
    const fx = Math.max(0, Math.min(1, (x - gx0) / step))
    const fz = Math.max(0, Math.min(1, (z - gz0) / step))
    const h00 = heightMap.get(key(gx0, gz0)) ?? 0
    const h10 = heightMap.get(key(gx0 + step, gz0)) ?? h00
    const h01 = heightMap.get(key(gx0, gz0 + step)) ?? h00
    const h11 = heightMap.get(key(gx0 + step, gz0 + step)) ?? h00
    const hx0 = h00 * (1 - fx) + h10 * fx
    const hx1 = h01 * (1 - fx) + h11 * fx
    return hx0 * (1 - fz) + hx1 * fz
  }

  // Sample a regular grid for Rapier's heightfield collider.
  //
  // IMPORTANT: Rapier's index→world axis mapping is the transpose of what
  // its own JS docs claim. Empirical raycast probing (single-sample spike
  // at heights[i=2, j=0] with 3×3 samples / 10×10 scale) showed the hit
  // at world (x=-5, z=+5). That is:
  //   row index `i`    → world Z axis
  //   column index `j` → world X axis
  // So heights[i + j*N] must hold the height for world
  //   (x = (j/(N-1) - 0.5) * scaleX, z = (i/(N-1) - 0.5) * scaleZ).
  //
  // The previous population code used the swapped mapping, which effectively
  // transposed the heightfield relative to the visual mesh. Symmetric
  // features (craters, valleys) still produced circles in collision but at
  // mirrored world positions; rifts (asymmetric line segments) ended up in
  // completely different spots from what you see — so walking into a visible
  // crater collided with phantom flat/high ground, producing the violent
  // fall/push-up pattern and stones floating above / below the wireframe.
  const N = TERRAIN_SEG + 1
  const heights = new Float32Array(N * N)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const wx = MOON_SIZE * (j / (N - 1) - 0.5)
      const wz = MOON_SIZE * (i / (N - 1) - 0.5)
      heights[i + j * N] = computeHeight(wx, wz)
    }
  }

  const mesh = new THREE.Mesh(geo, flatMaterial(0xb7b1a8, { roughness: 1, metalness: 0 }))
  mesh.receiveShadow = true
  mesh.name = 'terrain'
  return {
    mesh,
    heightAt,
    heightField: { nrows: N, ncols: N, heights, scaleX: MOON_SIZE, scaleZ: MOON_SIZE }
  }
}

const makeBoulder = (radius: number, color = 0x8c8880) => {
  // Guaranteed-convex boulder: sample points on a sphere with small radial
  // noise, then take their convex hull. Per-vertex jittering on an icosphere
  // (the previous approach) created concave dimples where neighbouring verts
  // contracted, which broke the physics ball-collider approximation and read
  // visually as collapsed pockets.
  const nPoints = 22 + Math.floor(Math.random() * 8)
  const points: THREE.Vector3[] = []
  for (let i = 0; i < nPoints; i++) {
    // Uniform direction on sphere (inverse-CDF for polar angle).
    const u = Math.random() * 2 - 1
    const theta = Math.random() * Math.PI * 2
    const sinPhi = Math.sqrt(1 - u * u)
    // Radius jitter stays strictly >= 0.78·r, so every point lies outside a
    // smaller inscribed sphere — the hull's convexity plus this floor keeps
    // the mesh a solid non-collapsing rock.
    const r = radius * (0.82 + Math.random() * 0.28)
    points.push(new THREE.Vector3(
      sinPhi * Math.cos(theta) * r,
      u * r,
      sinPhi * Math.sin(theta) * r
    ))
  }
  const geo = new ConvexGeometry(points)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, flatMaterial(color))
}

const makeStalactite = (h: number) => {
  const geo = new THREE.ConeGeometry(0.8 + Math.random() * 0.4, h, 5)
  return new THREE.Mesh(geo, flatMaterial(0x8a857c))
}

/**
 * Scatter a field of small rocks across the moon surface using an
 * InstancedMesh. A single low-poly base geometry (icosphere / dodecahedron)
 * is reused for every pebble, with per-instance position, rotation and
 * slightly non-uniform scale giving enough visual variety at distance.
 * Tiny rubble is decorative only; mid-size stones get ball colliders so
 * Ewall bumps into them.
 */
const scatterRubble = (
  params: {
    count: number
    minR: number
    maxR: number
    minDistToLandmark: number
    color: number
    baseGeom: THREE.BufferGeometry
    landmarks: { position: THREE.Vector3 }[]
    heightAt: (x: number, z: number) => number
    colliders: Collider[] | null
  }
): THREE.InstancedMesh => {
  const { count, minR, maxR, minDistToLandmark, color, baseGeom } = params
  const mat = flatMaterial(color, { roughness: 1, metalness: 0 })
  const inst = new THREE.InstancedMesh(baseGeom, mat, count)
  inst.receiveShadow = true
  const m = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scl = new THREE.Vector3()
  let placed = 0
  let attempts = 0
  while (placed < count && attempts < count * 5) {
    attempts++
    const x = (Math.random() - 0.5) * MOON_SIZE * 0.9
    const z = (Math.random() - 0.5) * MOON_SIZE * 0.9
    if (params.landmarks.some(l =>
      Math.hypot(l.position.x - x, l.position.z - z) < minDistToLandmark
    )) continue
    const r = minR + Math.random() * (maxR - minR)
    // Sink slightly into the terrain so rocks look embedded, not perched.
    const y = params.heightAt(x, z) + r * 0.25
    pos.set(x, y, z)
    // Y-only rotation: we lock tumble to the yaw axis so the mesh's
    // local-Y stays aligned with world-Y. That lets the AABB collider
    // use `scl.y` for its world-space height directly — previously the
    // random X/Z roll rotated a flat rock (scl.y≈0.55r) on its side,
    // and the world-axis-aligned box collider ended up much taller than
    // the visible mesh, which is what the player was hitting their head
    // on.
    const yaw = Math.random() * Math.PI * 2
    euler.set(0, yaw, 0)
    quat.setFromEuler(euler)
    // Non-uniform scale: slight squash/stretch per axis reads as a
    // weathered, irregular rock rather than a sphere.
    scl.set(
      r * (0.8 + Math.random() * 0.4),
      r * (0.55 + Math.random() * 0.5),
      r * (0.8 + Math.random() * 0.4)
    )
    m.compose(pos, quat, scl)
    inst.setMatrixAt(placed, m)
    if (params.colliders) {
      // Box collider sized to the scaled unit-sphere mesh bounds.
      // Dodecahedron/icosphere base geometry has circumscribed radius 1,
      // so the mesh extends ±scl on each local axis. With rotation locked
      // to yaw, those extents stay world-axis-aligned (after applying `ry`),
      // making the cuboid a near-exact visual match.
      params.colliders.push({
        kind: 'box', x, y, z,
        w: scl.x * 2, h: scl.y * 2, d: scl.z * 2,
        ry: yaw
      })
    }
    placed++
  }
  inst.count = placed
  inst.instanceMatrix.needsUpdate = true
  return inst
}

const makeQuarryStone = () => {
  // Rectangular ~40cm-high cut stone blocks.
  const w = 0.8 + Math.random() * 0.4
  const h = 0.4
  const d = 0.8 + Math.random() * 0.4
  const geo = new THREE.BoxGeometry(w, h, d)
  return { mesh: new THREE.Mesh(geo, flatMaterial(0xa8a29a)), w, h, d }
}

/** Hexagonal glass dome built of triangular glass panels on a metal lattice.
 *  `cutout(c)` returns true for triangle centroids that should be OMITTED —
 *  used to punch a doorway through the shell where the airlock docks so the
 *  pressure chamber has a clear opening into the dome interior. */
const makeDome = (
  radius: number,
  rings: number,
  cutout?: (c: THREE.Vector3) => boolean
) => {
  const group = new THREE.Group()

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.1,
    metalness: 0,
    transmission: 0.8,
    thickness: 0.05,
    side: THREE.DoubleSide,
    flatShading: true
  })
  const seamMat = flatMaterial(0x3a3f48, { metalness: 0.7, roughness: 0.4 })

  // Build the dome by subdividing an icosphere's top hemisphere.
  const ico = new THREE.IcosahedronGeometry(radius, rings)
  const pos = ico.attributes.position as THREE.BufferAttribute
  const indices: number[] = []
  const verts: number[] = []
  const vertMap = new Map<string, number>()

  // Collect only triangles whose centroid is in the upper hemisphere AND
  // not inside the caller's cutout region (if any).
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))
    const b = new THREE.Vector3(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1))
    const c = new THREE.Vector3(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2))
    const centroid = a.clone().add(b).add(c).divideScalar(3)
    if (centroid.y < 0.2) continue
    if (cutout && cutout(centroid)) continue
    for (const v of [a, b, c]) {
      const k = `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`
      let idx = vertMap.get(k)
      if (idx === undefined) {
        idx = verts.length / 3
        verts.push(v.x, v.y, v.z)
        vertMap.set(k, idx)
      }
      indices.push(idx)
    }
  }
  const glassGeo = new THREE.BufferGeometry()
  glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  glassGeo.setIndex(indices)
  glassGeo.computeVertexNormals()
  const glass = new THREE.Mesh(glassGeo, glassMat)
  glass.renderOrder = 1
  group.add(glass)

  // Lattice seams: draw every triangle edge as a thin tube.
  const edgeSet = new Set<string>()
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!, b = indices[i + 1]!, c = indices[i + 2]!
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const k = p < q ? `${p}|${q}` : `${q}|${p}`
      edgeSet.add(k)
    }
  }
  for (const k of edgeSet) {
    const [p, q] = k.split('|').map(Number) as [number, number]
    const va = new THREE.Vector3(verts[p * 3]!, verts[p * 3 + 1]!, verts[p * 3 + 2]!)
    const vb = new THREE.Vector3(verts[q * 3]!, verts[q * 3 + 1]!, verts[q * 3 + 2]!)
    const dir = vb.clone().sub(va)
    const len = dir.length()
    const geo = new THREE.CylinderGeometry(0.08, 0.08, len, 6)
    const seam = new THREE.Mesh(geo, seamMat)
    seam.position.copy(va).addScaledVector(dir, 0.5)
    seam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    group.add(seam)
  }

  // Ground ring.
  const ringGeo = new THREE.TorusGeometry(radius * 1.05, 0.25, 6, 32)
  const ring = new THREE.Mesh(ringGeo, seamMat)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0
  group.add(ring)

  return group
}

/** Airlock pneumatic door housing. Two sliding doors — an outer "space
 *  gate" facing the moon surface (+z) and an inner "dome gate" facing
 *  the dome interior (-z). MoonScene cycles them so only one is ever
 *  open at a time, simulating a pressure-transfer vestibule. The
 *  chamber is long enough for Ewall to fully enter before the outer
 *  door cycles shut. */
export interface AirlockInstance {
  group: THREE.Group
  /** Outer "space" door. Local Y driven by MoonScene. */
  outerDoor: THREE.Mesh
  /** Inner "dome" door. Local Y driven by MoonScene. */
  innerDoor: THREE.Mesh
  /** Shared rest Y (both doors closed). */
  doorClosedY: number
  /** Shared target Y when fully open. */
  doorOpenY: number
  /** Interior depth — used by MoonScene to size the "inside-chamber"
   *  region for the door state machine. */
  depth: number
  /** World-space positions of each door's centre (z component shifted
   *  by half-depth). Populated after the caller places the group. */
  outerDoorZLocal: number
  innerDoorZLocal: number
}

const AIRLOCK_DEPTH = 9
const AIRLOCK_WIDTH = 5
const AIRLOCK_HEIGHT = 4

const makeAirlock = (): AirlockInstance => {
  const group = new THREE.Group()
  const bodyMat = flatMaterial(0x6e7480, { metalness: 0.6, roughness: 0.5 })
  const accentMat = flatMaterial(0xd84b2a, { metalness: 0.2, roughness: 0.6 })

  const halfD = AIRLOCK_DEPTH / 2
  // Hollowed chamber — two side jambs running the full length, a single
  // lintel across the top. No solid front/back walls: both ends are
  // doorways closed by the sliding doors below. Chamber interior is
  // (AIRLOCK_WIDTH - 2 * jamb_width) ≈ 2.4 m wide, (AIRLOCK_HEIGHT - lintel)
  // ≈ 3.4 m tall, AIRLOCK_DEPTH m deep — plenty for Ewall's 0.8 m ×
  // 1.9 m capsule to drive in, park, cycle the doors, and drive out.
  const pillar = (x: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, AIRLOCK_HEIGHT, AIRLOCK_DEPTH), bodyMat)
    m.position.set(x, AIRLOCK_HEIGHT / 2, 0)
    group.add(m)
  }
  pillar(-1.85)  // left jamb
  pillar(1.85)  // right jamb
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, AIRLOCK_DEPTH), bodyMat)
  lintel.position.set(0, AIRLOCK_HEIGHT - 0.3, 0)
  group.add(lintel)

  const doorClosedY = 1.6
  const doorOpenY = doorClosedY + 3.0
  const outerDoorZLocal = halfD + 0.05
  const innerDoorZLocal = -halfD - 0.05

  // Outer "space" door — faces +z, red accent. Slides up roughly 3 m so
  // the opening reads as clear while the top stub tucks under the lintel.
  const outerDoor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.2), accentMat)
  outerDoor.position.set(0, doorClosedY, outerDoorZLocal)
  outerDoor.name = 'airlock-outer-door'
  group.add(outerDoor)

  // Inner "dome" door — faces -z, same animation but mirrored. A slightly
  // different accent colour sells the interior-vs-exterior split.
  const innerAccent = flatMaterial(0x2a6f4a, { metalness: 0.2, roughness: 0.6 })
  const innerDoor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.2, 0.2), innerAccent)
  innerDoor.position.set(0, doorClosedY, innerDoorZLocal)
  innerDoor.name = 'airlock-inner-door'
  group.add(innerDoor)

  // Pressure gauge on the outer face.
  const gauge = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 6, 16), flatMaterial(0xf7a000))
  gauge.position.set(1.5, 2.5, halfD + 0.1)
  group.add(gauge)

  // Piping along the side — stretched along the full chamber length.
  for (let i = 0; i < 3; i++) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, AIRLOCK_DEPTH - 0.4, 8),
      flatMaterial(0x2b2f38)
    )
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(-2.2 + i * 2.2, AIRLOCK_HEIGHT / 2, -AIRLOCK_WIDTH / 2 - 0.05)
    group.add(pipe)
  }
  return {
    group,
    outerDoor,
    innerDoor,
    doorClosedY,
    doorOpenY,
    depth: AIRLOCK_DEPTH,
    outerDoorZLocal,
    innerDoorZLocal
  }
}

/**
 * Canvas-painted U.S. flag texture. Real Stars-and-Stripes: 13 horizontal
 * stripes (7 red, 6 white, starting and ending with red), a blue union/canton
 * covering the top 7 stripes and the hoist-side 40% of the fly, with 50 white
 * five-pointed stars arranged in nine rows (6-5-6-5-6-5-6-5-6). Canvas
 * aspect 19:10 matches the official flag ratio.
 */
const makeFlagTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas')
  c.width = 380
  c.height = 200
  const ctx = c.getContext('2d')!
  // Stripes.
  const stripeH = c.height / 13
  ctx.fillStyle = '#b22234'  // Old Glory Red
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#ffffff'
  for (let i = 1; i < 13; i += 2) {
    ctx.fillRect(0, i * stripeH, c.width, stripeH)
  }
  // Union (blue canton) — 7 stripes tall × 40 % width.
  const cantonW = c.width * 0.4
  const cantonH = stripeH * 7
  ctx.fillStyle = '#3c3b6e'  // Old Glory Blue
  ctx.fillRect(0, 0, cantonW, cantonH)
  // 50 stars — 9 rows, alternating 6 and 5 stars, staggered half-step.
  // Row spacing fits 9 rows inside the canton with padding on top/bottom.
  const starR = cantonH / 24
  const drawStar = (cx: number, cy: number, r: number) => {
    ctx.beginPath()
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2 - Math.PI / 2
      const rad = k % 2 === 0 ? r : r * 0.42
      const x = cx + Math.cos(ang) * rad
      const y = cy + Math.sin(ang) * rad
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
  }
  const rowStep = cantonH / 10
  const colStep = cantonW / 12
  for (let row = 0; row < 9; row++) {
    const isSix = row % 2 === 0
    const cols = isSix ? 6 : 5
    const y = rowStep * (row + 1)
    for (let col = 0; col < cols; col++) {
      const x = isSix
        ? colStep * (1 + col * 2)       // 1,3,5,7,9,11
        : colStep * (2 + col * 2)       // 2,4,6,8,10
      drawStar(x, y, starR)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** 1969-style American flag on a pole, frozen stiff like the real one. */
const makeFlagpost = () => {
  const group = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 6), flatMaterial(0xd9dfe3, {
    metalness: 0.8,
    roughness: 0.3
  }))
  pole.position.y = 1.75
  group.add(pole)

  // Horizontal support that holds the flag stiff — aligned with the flag's
  // top edge (like the real Apollo flag's horizontal boom), not its centre.
  const support = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), flatMaterial(0xd9dfe3))
  support.rotation.z = Math.PI / 2
  support.position.set(0.7, 3.5, 0)
  group.add(support)

  // Flag — single textured plane. 1.3 × 0.684 matches the real 19:10 ratio
  // closely enough for the canvas to read as a proper flag at view distance.
  // The hoist (canton side) sits next to the pole; DoubleSide so the flag
  // reads from behind as a mirror image, which is how a real printed flag
  // looks through the fabric.
  const flagMat = new THREE.MeshStandardMaterial({
    map: makeFlagTexture(),
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0,
    flatShading: true
  })
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.684), flagMat)
  flag.position.set(0.7, 3.16, 0.002)
  group.add(flag)

  // Plaque.
  const plaqueMat = flatMaterial(0x8a6a2f, { metalness: 0.7, roughness: 0.4 })
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.08), plaqueMat)
  plaque.position.y = 0.15
  group.add(plaque)

  return group
}

/**
 * Upright fuel tank next to the moonbase. Ewall interacts with the central
 * valve to refill his hydrazine. Visually: a squat cylindrical tank on stubby
 * legs, pipework running down the side, HAZCHEM diamond on the front.
 */
const makeRefuelTank = () => {
  const group = new THREE.Group()
  const tankMat = flatMaterial(0xcfcfcf, { metalness: 0.65, roughness: 0.35 })
  const accentMat = flatMaterial(0xf7a000, { metalness: 0.3, roughness: 0.55 })
  const darkMat = flatMaterial(0x2b2f38, { metalness: 0.7, roughness: 0.4 })
  const hazardMat = flatMaterial(0xd84b2a, { metalness: 0.1, roughness: 0.8 })

  // Main cylinder body.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 3.2, 18, 1), tankMat)
  body.position.y = 2.0
  group.add(body)

  // Rounded top cap.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), tankMat)
  cap.position.y = 3.6
  group.add(cap)

  // Rounded bottom cap.
  const bottomCap = new THREE.Mesh(new THREE.SphereGeometry(1.4, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), tankMat)
  bottomCap.position.y = 0.4
  group.add(bottomCap)

  // Four stubby legs.
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.8, 6), darkMat)
    const a = (i / 4) * Math.PI * 2
    leg.position.set(Math.cos(a) * 1.1, 0.2, Math.sin(a) * 1.1)
    group.add(leg)
  }

  // Horizontal band stripes (accent).
  for (const y of [1.2, 2.4, 3.3]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.08, 18, 1), accentMat)
    band.position.y = y
    group.add(band)
  }

  // Down-pipe with valve handle — the interact target.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8), darkMat)
  pipe.position.set(1.35, 1.5, 0)
  pipe.rotation.z = 0
  group.add(pipe)
  const valve = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 16), accentMat)
  valve.position.set(1.55, 1.4, 0)
  valve.rotation.y = Math.PI / 2
  group.add(valve)
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), darkMat)
  nozzle.position.set(1.7, 0.8, 0)
  nozzle.rotation.z = -Math.PI / 2
  group.add(nozzle)

  // Hazard diamond on the front of the tank (HYDRAZINE placard style).
  const placard = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), hazardMat)
  placard.position.set(0, 2.1, 1.41)
  placard.rotation.z = Math.PI / 4
  group.add(placard)
  const placardFuel = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), accentMat)
  placardFuel.position.set(0, 2.1, 1.415)
  placardFuel.rotation.z = Math.PI / 4
  group.add(placardFuel)

  return group
}

const makeLandingPad = () => {
  const group = new THREE.Group()
  const padMat = flatMaterial(0x4a4f57, { metalness: 0.4, roughness: 0.5 })
  const accentMat = flatMaterial(0xf7a000)
  // Chamfer runs from top-r=6 out to bot-r=7.5 over 0.4 m rise — a 1.5 m
  // horizontal run, ~15° slope. Previously 0.5 m / 38° which was on the
  // steep side of the climb threshold and produced inconsistent mounts.
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(6, 7.5, 0.4, 12), padMat)
  pad.position.y = 0.2
  group.add(pad)
  // Ring markings.
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 5.4, 24), accentMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.41
  group.add(ring)
  // Cross markings.
  for (let i = 0; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 3), accentMat)
    bar.rotation.y = i * Math.PI / 2
    bar.position.y = 0.41
    group.add(bar)
  }
  return group
}

/**
 * Apollo 11 Lunar Module "Eagle" — stylised low-poly lander. Descent stage is
 * an octagonal prism wrapped in gold-foil insulation with four splayed legs
 * and circular footpads; ascent stage is the angular crew cabin with the
 * iconic pair of triangular visor windows, EVA hatch + ladder, RCS thruster
 * clusters at each corner, and the S-band dish antenna on top.
 */
const makeLunarModule = (): THREE.Group => {
  const group = new THREE.Group()
  group.name = 'lunar-module'

  const gold = flatMaterial(0xc9a34a, { metalness: 0.72, roughness: 0.42 })
  const goldDark = flatMaterial(0x7c5a1a, { metalness: 0.6, roughness: 0.6 })
  const white = flatMaterial(0xdcd6cc, { metalness: 0.25, roughness: 0.55 })
  const dark = flatMaterial(0x2b2f38, { metalness: 0.7, roughness: 0.4 })
  const black = flatMaterial(0x0a0c12, { metalness: 0.3, roughness: 0.5 })
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x2a4560,
    emissive: 0x0a1830,
    emissiveIntensity: 0.35,
    metalness: 0.3,
    roughness: 0.3,
    flatShading: true
  })
  const accent = flatMaterial(0xd84b2a)

  // Descent stage — octagonal prism sitting on the ground plane.
  const descent = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 1.4, 8),
    gold
  )
  descent.position.y = 0.9
  group.add(descent)

  // Banding ring around the descent stage.
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1.72, 1.72, 0.1, 8),
    accent
  )
  band.position.y = 1.55
  group.add(band)

  // Descent engine bell underneath.
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.55, 0.6, 12),
    goldDark
  )
  nozzle.position.y = 0.1
  group.add(nozzle)

  // Four landing legs splaying outward to circular footpads.
  const legMat = flatMaterial(0x9a9690, { metalness: 0.7, roughness: 0.5 })
  const padMat = flatMaterial(0x5a5550, { metalness: 0.25, roughness: 0.7 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const fx = Math.cos(a) * 2.6
    const fz = Math.sin(a) * 2.6
    const sx = Math.cos(a) * 1.55
    const sz = Math.sin(a) * 1.55
    const mid = new THREE.Vector3((sx + fx) / 2, 0.75, (sz + fz) / 2)
    const leg = new THREE.Vector3(fx - sx, -1.5, fz - sz)
    const len = leg.length()
    const strut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, len, 6),
      legMat
    )
    strut.position.copy(mid)
    strut.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      leg.clone().normalize()
    )
    group.add(strut)
    // Diagonal brace from descent stage to mid-leg.
    const brace = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, len * 0.7, 6),
      legMat
    )
    const bMid = new THREE.Vector3(
      sx + (fx - sx) * 0.35, 0.55,
      sz + (fz - sz) * 0.35
    )
    const bLeg = new THREE.Vector3(fx - sx, -0.7, fz - sz)
    brace.position.copy(bMid)
    brace.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      bLeg.clone().normalize()
    )
    group.add(brace)
    // Footpad.
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 12),
      padMat
    )
    pad.position.set(fx, 0.04, fz)
    group.add(pad)
    // Contact probe dangling from the forward pad (a distinctive detail).
    if (i === 0) {
      const probe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4),
        dark
      )
      probe.position.set(fx, -0.2, fz)
      group.add(probe)
    }
  }

  // Ascent stage base — transition frustum on top of the descent stage.
  const ascentBase = new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.4, 0.35, 8),
    white
  )
  ascentBase.position.y = 1.78
  group.add(ascentBase)

  // Ascent crew cabin — irregular boxy form. Front face slopes forward so the
  // windows face slightly down (as on the real Eagle).
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 1.25, 1.55),
    white
  )
  cabin.position.y = 2.6
  group.add(cabin)

  // Canted front visor plate with two triangular windows.
  const visorFace = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.75, 0.06),
    white
  )
  visorFace.position.set(0, 2.9, 0.8)
  visorFace.rotation.x = -0.18
  group.add(visorFace)

  const winShape = new THREE.Shape()
  winShape.moveTo(-0.22, -0.22)
  winShape.lineTo(0.22, -0.22)
  winShape.lineTo(0, 0.25)
  winShape.closePath()
  const winGeo = new THREE.ShapeGeometry(winShape)
  for (const sx of [-0.42, 0.42]) {
    const win = new THREE.Mesh(winGeo, visorMat)
    win.position.set(sx, 2.92, 0.84)
    win.rotation.x = -0.18
    group.add(win)
  }

  // EVA hatch below the windows.
  const hatch = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.06),
    dark
  )
  hatch.position.set(0, 2.15, 0.79)
  group.add(hatch)

  // Ladder from the hatch down to the forward footpad.
  const ladderMat = flatMaterial(0xaea8a0, { metalness: 0.7, roughness: 0.5 })
  for (const rx of [-0.12, 0.12]) {
    const rail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6),
      ladderMat
    )
    rail.position.set(rx, 1.1, 1.85)
    group.add(rail)
  }
  for (let i = 0; i < 7; i++) {
    const rung = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.28, 6),
      ladderMat
    )
    rung.rotation.z = Math.PI / 2
    rung.position.set(0, 0.15 + i * 0.32, 1.85)
    group.add(rung)
  }

  // "UNITED STATES" + flag placard on the side of the cabin.
  const placard = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.18),
    flatMaterial(0xeeeae2)
  )
  placard.position.set(-0.94, 2.75, 0)
  placard.rotation.y = -Math.PI / 2
  group.add(placard)
  const placardRed = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.16),
    flatMaterial(0xb22234)
  )
  placardRed.position.set(-0.94, 2.53, 0.12)
  placardRed.rotation.y = -Math.PI / 2
  group.add(placardRed)

  // RCS thruster quads at the four cabin corners.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cluster = new THREE.Group()
      const boxc = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.22, 0.2),
        dark
      )
      cluster.add(boxc)
      for (const [dx, dz] of [[0.17, 0], [-0.17, 0], [0, 0.17], [0, -0.17]] as [number, number][]) {
        const thr = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.055, 0.1, 6),
          black
        )
        if (dx !== 0) thr.rotation.z = Math.PI / 2
        if (dz !== 0) thr.rotation.x = Math.PI / 2
        thr.position.set(dx, 0, dz)
        cluster.add(thr)
      }
      cluster.position.set(sx * 1.02, 3.2, sz * 0.88)
      group.add(cluster)
    }
  }

  // S-band parabolic dish on a mast.
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.65, 6),
    dark
  )
  mast.position.set(0.75, 3.6, 0)
  mast.rotation.z = 0.2
  group.add(mast)
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    flatMaterial(0xeeeae2, { metalness: 0.4, roughness: 0.4 })
  )
  dish.position.set(0.85, 3.95, 0)
  dish.rotation.x = Math.PI
  group.add(dish)

  // Rendezvous radar — smaller angled dish on top.
  const radar = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    flatMaterial(0xaea8a0)
  )
  radar.position.set(-0.3, 3.45, 0.4)
  radar.rotation.x = -0.5
  group.add(radar)

  // Top-mounted omnidirectional antenna.
  const antMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4),
    dark
  )
  antMast.position.set(-0.4, 3.5, -0.3)
  group.add(antMast)

  return group
}

const makeOreBoulder = () => {
  const group = new THREE.Group()
  const boulder = makeBoulder(2.2, 0x4a3a2a)
  group.add(boulder)
  // Ore veins — glowing rust-coloured clumps.
  const veinMat = new THREE.MeshStandardMaterial({
    color: 0xb04a2a,
    emissive: 0x502010,
    emissiveIntensity: 0.5,
    flatShading: true,
    roughness: 0.6
  })
  for (let i = 0; i < 6; i++) {
    const v = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.2, 0), veinMat)
    const phi = Math.random() * Math.PI * 2
    const y = (Math.random() - 0.3) * 2
    const r = Math.sqrt(Math.max(0, 4.5 - y * y))
    v.position.set(Math.cos(phi) * r, y, Math.sin(phi) * r)
    group.add(v)
  }
  return group
}

/** Earth and Sun — drawn very far, as pure visuals, no lighting participation. */
const makeSkyBodies = () => {
  const group = new THREE.Group()
  group.name = 'sky-bodies'

  // Earth. Low-poly stylised continent map painted via canvas.
  const earthCanvas = document.createElement('canvas')
  earthCanvas.width = 512
  earthCanvas.height = 256
  const ctx = earthCanvas.getContext('2d')!
  // Ocean.
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, 256)
  oceanGrad.addColorStop(0, '#1f4a8a')
  oceanGrad.addColorStop(1, '#0f2a5c')
  ctx.fillStyle = oceanGrad
  ctx.fillRect(0, 0, 512, 256)
  // Rough continents — stylised silhouettes (not geographically accurate but
  // readable as Earth from a distance).
  ctx.fillStyle = '#3a8f4a'
  // Eurasia + Africa blob.
  ctx.beginPath()
  ctx.ellipse(280, 100, 90, 36, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(290, 150, 36, 48, 0, 0, Math.PI * 2)
  ctx.fill()
  // Americas.
  ctx.beginPath()
  ctx.ellipse(120, 110, 28, 42, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(140, 170, 20, 40, 0, 0, Math.PI * 2)
  ctx.fill()
  // Australia.
  ctx.beginPath()
  ctx.ellipse(400, 170, 26, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  // Ice caps — dim so they stay below the bloom luminance threshold (0.85).
  // The previous near-white #e8f4ff was bright enough to bloom at the poles
  // and made Earth look white-hot.
  ctx.fillStyle = '#a8b6c8'
  ctx.fillRect(0, 0, 512, 10)
  ctx.fillRect(0, 246, 512, 10)
  // Cloud swirls — faint so they don't lift the ocean's luminance.
  ctx.globalAlpha = 0.18
  ctx.fillStyle = '#c8d4e4'
  for (let i = 0; i < 9; i++) {
    const x = (i * 62 + 30) % 512
    const y = 60 + (i * 37) % 140
    ctx.beginPath()
    ctx.ellipse(x, y, 30, 10, i * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  const earthTex = new THREE.CanvasTexture(earthCanvas)
  earthTex.anisotropy = 4
  earthTex.colorSpace = THREE.SRGBColorSpace
  // Earth is décor — MeshBasicMaterial so lighting angle can't dim one side.
  // toneMapped:true routes it through the same ACES curve as the terrain so
  // it no longer reads as an HDR hotspot beside the tone-mapped moon.
  const earthGeo = new THREE.IcosahedronGeometry(18, 2)
  const earthMat = new THREE.MeshBasicMaterial({
    map: earthTex,
    fog: false,
    toneMapped: true
  })
  const earth = new THREE.Mesh(earthGeo, earthMat)
  earth.position.set(-180, 130, -240)
  earth.rotation.y = Math.PI * 0.25
  group.add(earth)

  // Sun — compact hot-white core that drives UnrealBloomPass, plus a warm
  // Lensflare attached directly to its position. The bloom pass replaces the
  // old concentric-shell fake, and the lens flare adds the per-angle camera
  // artefacts the user asked for.
  const sunPos = new THREE.Vector3(240, 180, 260)

  // Hot-white core well above the bloom threshold (0.85). MeshBasicMaterial
  // with `toneMapped:false` means we're in linear HDR space; color 0xffffff
  // is already luminance 1.0 which clears the threshold cleanly.
  const sunCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    fog: false,
    toneMapped: false
  })
  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(38, 2), sunCoreMat)
  sun.position.copy(sunPos)
  sun.renderOrder = 2
  group.add(sun)

  // Warm inner chromosphere shell — still blooms, tints the bloom halo warm.
  const chromoMat = new THREE.MeshBasicMaterial({
    color: 0xffc770,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.BackSide
  })
  const chromo = new THREE.Mesh(new THREE.IcosahedronGeometry(48, 2), chromoMat)
  chromo.position.copy(sunPos)
  chromo.renderOrder = 1
  group.add(chromo)

  // ─── Lens flare ────────────────────────────────────────────────────────
  // Six elements along the sun→screen-center line: main hexagonal flare at
  // the sun, two smaller coloured ghosts pulling toward the center, and an
  // anamorphic streak pair. Hidden automatically by Lensflare when the sun
  // is occluded or off-screen.
  const makeFlareTex = (inner: string, mid: string, size = 128) => {
    const c = document.createElement('canvas')
    c.width = c.height = size
    const cx = c.getContext('2d')!
    const g = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, inner)
    g.addColorStop(0.35, mid)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    cx.fillStyle = g
    cx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  const mainFlareTex = makeFlareTex('rgba(255,255,255,1)', 'rgba(255,210,130,0.6)', 256)
  const ghostWarmTex = makeFlareTex('rgba(255,180,100,0.9)', 'rgba(255,140,60,0.4)', 128)
  const ghostCoolTex = makeFlareTex('rgba(160,200,255,0.9)', 'rgba(80,140,220,0.4)', 128)

  const flare = new Lensflare()
  flare.addElement(new LensflareElement(mainFlareTex, 520, 0, new THREE.Color(0xffffff)))
  flare.addElement(new LensflareElement(ghostWarmTex, 60, 0.25, new THREE.Color(0xffb060)))
  flare.addElement(new LensflareElement(ghostCoolTex, 80, 0.45, new THREE.Color(0x90b8ff)))
  flare.addElement(new LensflareElement(ghostWarmTex, 40, 0.65, new THREE.Color(0xffa040)))
  flare.addElement(new LensflareElement(ghostCoolTex, 100, 0.85, new THREE.Color(0xb0c8ff)))
  flare.addElement(new LensflareElement(mainFlareTex, 180, 1.05, new THREE.Color(0xffe0b0)))
  flare.position.copy(sunPos)
  group.add(flare)

  // Distant starfield. Per-vertex colour fades stars whose line-of-sight
  // passes close to the sun orb — i.e. stars behind and around the sun from
  // the camera's eyeline. The sun itself is untouched; only pinpoints inside
  // its glare cone get dimmed/hidden. Apollo surface photos show no stars
  // visible near the sun at all because the camera's exposure is pinned to
  // the sunlit landscape; this is the cheap analogue.
  const starGeo = new THREE.BufferGeometry()
  const starCount = 800
  const starPos = new Float32Array(starCount * 3)
  const starCol = new Float32Array(starCount * 3)
  const sunDir = sunPos.clone().normalize()
  // Fade in cos-angle space. 1.0 = at sun, 0 = 90°. Tight cone so only the
  // stars really close to the sun orb are hidden.
  const COS_FULL_FADE = 0.996  // ~5.1° — fully hidden (covers the sun disc)
  const COS_EDGE = 0.955       // ~17° — full brightness beyond this ring
  for (let i = 0; i < starCount; i++) {
    const phi = Math.acos(2 * Math.random() - 1)
    const theta = Math.random() * Math.PI * 2
    const r = 480
    const x = Math.sin(phi) * Math.cos(theta) * r
    const y = Math.abs(Math.cos(phi)) * r * 0.8
    const z = Math.sin(phi) * Math.sin(theta) * r
    starPos[i * 3] = x
    starPos[i * 3 + 1] = y
    starPos[i * 3 + 2] = z
    // Angular distance to sun via normalised dot. smoothstep needs
    // edge0<edge1 so we feed edges ascending and invert to 0-at-sun, 1-far.
    const len = Math.sqrt(x * x + y * y + z * z)
    const cosA = (x * sunDir.x + y * sunDir.y + z * sunDir.z) / len
    const t = 1 - THREE.MathUtils.smoothstep(cosA, COS_EDGE, COS_FULL_FADE)
    // Per-star magnitude variation so the field doesn't read as a uniform
    // dot grid — dimmer stars closer to the sun read as fainter.
    const mag = 0.55 + Math.random() * 0.45
    const v = t * mag
    starCol[i * 3] = v
    starCol[i * 3 + 1] = v
    starCol[i * 3 + 2] = v
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3))
  const starMat = new THREE.PointsMaterial({
    size: 1.2,
    sizeAttenuation: false,
    fog: false,
    vertexColors: true
  })
  const stars = new THREE.Points(starGeo, starMat)
  group.add(stars)

  return { group, sun }
}

export const buildMoonWorld = (): BuildResult => {
  const root = new THREE.Group()
  root.name = 'moon-world'
  const rand = mulberry32(0x4d30304e)
  const colliders: Collider[] = []
  const landmarks: WorldLandmark[] = []

  const { mesh: terrain, heightAt, heightField } = makeTerrain(rand)
  root.add(terrain)

  // Terrain heightfield collider — the character controller now has a real
  // surface to climb instead of teleporting to the sampled floor height.
  colliders.push({
    kind: 'heightfield',
    nrows: heightField.nrows,
    ncols: heightField.ncols,
    heights: heightField.heights,
    scaleX: heightField.scaleX,
    scaleZ: heightField.scaleZ
  })

  // Moonbase dome + airlock sit at origin. The dome is now 3× its old
  // radius (8 → 24) to read as a real habitat rather than a garden
  // shed; the airlock docks flush with the dome's south face (+z) so
  // the back of the chamber opens onto the dome interior through a
  // door-sized hole cut in the dome shell.
  const DOME_RADIUS = 24
  const basePos = new THREE.Vector3(0, heightAt(0, 0), 0)
  // Cutout predicate: remove dome triangles whose centroid falls inside
  // the airlock opening corridor so the shell has a clear doorway
  // aligned with the inner door. Opens ~2 m wide × 3.6 m tall on the
  // dome's +z face.
  const airlockCutout = (c: THREE.Vector3) =>
    Math.abs(c.x) < 2.0
    && c.y < 3.6
    && c.z > DOME_RADIUS * 0.55
  const dome = makeDome(DOME_RADIUS, 3, airlockCutout)
  dome.position.copy(basePos)
  root.add(dome)
  landmarks.push({ kind: 'moonbase', position: basePos.clone() })
  // No ball collider on the dome — the airlock is the intended entry,
  // and a cheap ball approximation would either block the corridor
  // through the cut doorway or swallow the entire habitat. Treating the
  // dome as visual-only keeps the airlock transit unobstructed.

  const airlockInst = makeAirlock()
  // Airlock position: back wall flush with the dome's front face so the
  // chamber docks cleanly. Dome radius = 24; airlock half-depth = 4.5.
  const airlockPos = new THREE.Vector3(
    0,
    heightAt(0, DOME_RADIUS + AIRLOCK_DEPTH / 2),
    DOME_RADIUS + AIRLOCK_DEPTH / 2
  )
  airlockInst.group.position.copy(airlockPos)
  root.add(airlockInst.group)
  // Door-frame colliders — two side jambs running the full chamber length
  // and a lintel spanning the top. Both ends (outer + inner) are doorway
  // openings, so there's no back-wall collider anymore. The sliding
  // doors are visual/state-driven and don't collide.
  const halfD = AIRLOCK_DEPTH / 2
  colliders.push({
    kind: 'box',
    x: airlockPos.x - 1.85,
    y: airlockPos.y + AIRLOCK_HEIGHT / 2,
    z: airlockPos.z,
    w: 1.3,
    h: AIRLOCK_HEIGHT,
    d: AIRLOCK_DEPTH
  })
  colliders.push({
    kind: 'box',
    x: airlockPos.x + 1.85,
    y: airlockPos.y + AIRLOCK_HEIGHT / 2,
    z: airlockPos.z,
    w: 1.3,
    h: AIRLOCK_HEIGHT,
    d: AIRLOCK_DEPTH
  })
  colliders.push({
    kind: 'box',
    x: airlockPos.x,
    y: airlockPos.y + AIRLOCK_HEIGHT - 0.3,
    z: airlockPos.z,
    w: 2.4,
    h: 0.6,
    d: AIRLOCK_DEPTH
  })
  void halfD

  // Refuel tank — behind the dome (negative z, away from the airlock approach
  // on +z). Tusk's low-fuel reminder specifically calls out "behind the dome",
  // so the position needs to match the VO line. Moved outward past the new
  // dome's 24 m radius so the tank clears the glass shell.
  const refuelPos = new THREE.Vector3(14, heightAt(14, -30), -30)
  const refuel = makeRefuelTank()
  refuel.position.copy(refuelPos)
  root.add(refuel)
  landmarks.push({ kind: 'refuel-tank', position: refuelPos.clone() })
  // Cylinder collider for the tank body; stubby legs don't need their own.
  colliders.push({ kind: 'cylinder', x: refuelPos.x, y: refuelPos.y + 2, z: refuelPos.z, r: 1.5, h: 3.6 })

  // Landing pad near airlock. The pad mesh is a 12-sided truncated cone
  // (top r=6, bottom r=7.5, h=0.4). The collider is a convex hull of the
  // same vertex ring so the outside edge reads as a gentle ramp — walking
  // into the pad climbs onto it instead of hitting a vertical cylinder wall.
  // Landing pad — moved outward so it clears the 3× bigger dome. Origin
  // radius from dome centre is ~50 m (was ~24 m).
  const padPos = new THREE.Vector3(40, heightAt(40, 30), 30)
  const pad = makeLandingPad()
  pad.position.copy(padPos)
  root.add(pad)
  landmarks.push({ kind: 'landing-pad', position: padPos.clone() })
  {
    const SEG = 12, TOP_R = 6, BOT_R = 7.5, HALF_H = 0.2
    const verts = new Float32Array(SEG * 2 * 3)
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2
      const cx = Math.cos(a), cz = Math.sin(a)
      // top ring (inner radius, +y)
      verts[i * 6 + 0] = cx * TOP_R
      verts[i * 6 + 1] = HALF_H
      verts[i * 6 + 2] = cz * TOP_R
      // bottom ring (outer radius, -y) — the chamfered outside edge
      verts[i * 6 + 3] = cx * BOT_R
      verts[i * 6 + 4] = -HALF_H
      verts[i * 6 + 5] = cz * BOT_R
    }
    colliders.push({
      kind: 'convexHull',
      x: padPos.x, y: padPos.y + HALF_H, z: padPos.z,
      points: verts
    })
  }

  // American flagpost (Mission 1 target) — placed away from the base, visible
  // from the path but far enough to be the "first discovery".
  const flagPos = new THREE.Vector3(45, heightAt(45, -35), -35)
  const flag = makeFlagpost()
  flag.position.copy(flagPos)
  root.add(flag)
  landmarks.push({ kind: 'flagpost', position: flagPos.clone() })

  // Apollo 11 "Eagle" lunar module — 20 m from the flagpost, rotated so the
  // ladder/hatch face roughly toward the flag. Descent stage is r≈1.7 so a
  // cylinder collider is cheap + accurate; the ascent cabin gets its own box
  // collider so Ewall can't walk through the crew compartment.
  const lmOffset = new THREE.Vector3(14.14, 0, 14.14)  // |offset| = 20 m
  const lmPos = new THREE.Vector3(
    flagPos.x + lmOffset.x,
    heightAt(flagPos.x + lmOffset.x, flagPos.z + lmOffset.z),
    flagPos.z + lmOffset.z
  )
  const lm = makeLunarModule()
  lm.position.copy(lmPos)
  lm.rotation.y = Math.atan2(flagPos.x - lmPos.x, flagPos.z - lmPos.z)
  root.add(lm)
  landmarks.push({ kind: 'lunar-module', position: lmPos.clone() })
  colliders.push({ kind: 'cylinder', x: lmPos.x, y: lmPos.y + 0.9, z: lmPos.z, r: 1.7, h: 1.4 })
  colliders.push({
    kind: 'box',
    x: lmPos.x, y: lmPos.y + 2.6, z: lmPos.z,
    w: 1.85, h: 1.25, d: 1.55,
    ry: lm.rotation.y
  })

  // Ore boulder (Mission 2 side objective). Previously the ball collider
  // sat 1.2 m above the mesh centre with r=2.4, which put the top of the
  // collision sphere ~1.2 m higher than the visible rock — you could
  // "headbutt" nothing while trying to approach. The boulder mesh (from
  // makeBoulder(2.2)) extends roughly ±2.4 m on all axes, so a ball
  // centred on the mesh centre with r=2.4 matches the visible shape.
  const orePos = new THREE.Vector3(-55, heightAt(-55, -20), -20)
  const ore = makeOreBoulder()
  ore.position.copy(orePos)
  root.add(ore)
  landmarks.push({ kind: 'ore-boulder', position: orePos.clone() })
  colliders.push({ kind: 'ball', x: orePos.x, y: orePos.y, z: orePos.z, r: 2.4 })

  // Quarry — rectangular extracted stones left in a rough dug-out area.
  const quarryPos = new THREE.Vector3(-20, heightAt(-20, 60), 60)
  const quarry = new THREE.Group()
  quarry.position.copy(quarryPos)
  const quarryStones: QuarryStone[] = []
  for (let i = 0; i < 14; i++) {
    const { mesh: stone, w, h, d } = makeQuarryStone()
    const sx = (Math.random() - 0.5) * 18
    const sz = (Math.random() - 0.5) * 18
    stone.position.set(sx, h / 2, sz)
    stone.rotation.y = Math.random() * Math.PI * 2
    // Per-stone material clone so the smelting tint (colour + emissive) on
    // one stone doesn't bleed across the whole quarry.
    stone.material = (stone.material as THREE.MeshStandardMaterial).clone()
    quarry.add(stone)
    const key = `quarry-stone-${i}`
    colliders.push({
      kind: 'box',
      key,
      x: quarryPos.x + sx,
      y: quarryPos.y + h / 2,
      z: quarryPos.z + sz,
      w, h, d,
      ry: stone.rotation.y
    })
    quarryStones.push({
      mesh: stone,
      worldPos: new THREE.Vector3(quarryPos.x + sx, quarryPos.y + h / 2, quarryPos.z + sz),
      halfH: h / 2,
      key
    })
  }
  // Quarry lip — a subtle excavated circle boundary.
  const lip = new THREE.Mesh(
    new THREE.RingGeometry(10, 11, 24),
    flatMaterial(0x7a7068)
  )
  lip.rotation.x = -Math.PI / 2
  lip.position.y = 0.02
  quarry.add(lip)
  root.add(quarry)
  landmarks.push({ kind: 'quarry', position: quarryPos.clone() })

  // Broken Ewall scenery — three keeled-over units the player will later be
  // guided to for a transmission-module repair side-mission. For now they're
  // static props with colliders so the capsule can't clip through them.
  //
  // Placement:
  //   - Valley: inside the big valley at (-50, -65) r=26 depth=5.5, offset
  //     toward the rim so the player can stumble onto it cresting the edge.
  //   - Rift:   along the rift segment (40,-75)→(85,-25), midway and set
  //     down at its own sampled terrain-Y (the rift bottom is already
  //     baked into the heightfield).
  //   - Quarry: just outside the quarry lip so it reads as "toppled near
  //     the worksite" without colliding with the stone scatter.
  //
  // Each placement picks a consistent roll sign so the two-in-a-row don't
  // mirror each other. `rollSign = 1` lies on the right side, `-1` on left.
  const placeBroken = (
    kind: 'broken-ewall-valley' | 'broken-ewall-rift' | 'broken-ewall-quarry',
    x: number,
    z: number,
    yaw: number,
    rollSign: 1 | -1
  ) => {
    const y = heightAt(x, z)
    const bot = buildBrokenEwall(rollSign)
    bot.root.position.set(x, y + 0.55, z)
    // Apply mission-set heading on top of the roll/pitch done inside
    // buildBrokenEwall so each unit faces a slightly different direction.
    bot.root.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), yaw)
    root.add(bot.root)
    landmarks.push({ kind, position: new THREE.Vector3(x, y, z) })
    // Approximate the tipped-over capsule silhouette as a wide, low box —
    // ~2 m long (chassis + treads), 1 m wide (was height before tip), and
    // ~0.8 m tall clearance. Collider is axis-aligned relative to `yaw`.
    colliders.push({
      kind: 'box', x, y: y + 0.55, z,
      w: 2.0, h: 0.9, d: 1.1, ry: yaw
    })
  }
  // Exploration target — the "go find a lost predecessor" waypoint Tusk
  // dispatches Ewall to after the first mission completes. Deliberately
  // placed deep in a valley a long walk from the base, with no collider
  // (it's just a navigation beacon). The meteor-strike cinematic fires
  // the instant the player is within 50 m of this landmark.
  landmarks.push({
    kind: 'explorer-target',
    position: new THREE.Vector3(-70, heightAt(-70, -45), -45)
  })

  placeBroken('broken-ewall-valley', -42, -70, 0.6, 1)   // inside valley basin
  placeBroken('broken-ewall-rift', 62, -50, -0.8, -1) // midway along rift
  placeBroken('broken-ewall-quarry', -24, 48, 1.4, 1)   // just outside quarry lip

  // Scatter boulders and stalactite stumps. The box collider is sized to
  // the hull's actual bounding box (computed once per boulder) and offset
  // so its centre sits on the visible mesh's centroid — otherwise the
  // jittered hull (points on a 0.82-1.1 r sphere) produced colliders that
  // reached noticeably higher than the visible rock top.
  const bbox = new THREE.Box3()
  for (let i = 0; i < 42; i++) {
    const x = (Math.random() - 0.5) * MOON_SIZE * 0.85
    const z = (Math.random() - 0.5) * MOON_SIZE * 0.85
    if (landmarks.some(l => Math.hypot(l.position.x - x, l.position.z - z) < 16)) continue
    const r = 0.8 + Math.random() * 1.8
    const b = makeBoulder(r)
    b.position.set(x, heightAt(x, z) + r * 0.4, z)
    b.rotation.y = Math.random() * Math.PI * 2
    root.add(b)
    b.geometry.computeBoundingBox()
    bbox.copy(b.geometry.boundingBox!)
    const w = bbox.max.x - bbox.min.x
    const h = bbox.max.y - bbox.min.y
    const d = bbox.max.z - bbox.min.z
    const cy = b.position.y + (bbox.max.y + bbox.min.y) / 2
    colliders.push({ kind: 'box', x, y: cy, z, w, h, d, ry: b.rotation.y })
  }

  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - 0.5) * MOON_SIZE * 0.9
    const z = (Math.random() - 0.5) * MOON_SIZE * 0.9
    if (landmarks.some(l => Math.hypot(l.position.x - x, l.position.z - z) < 18)) continue
    const h = 2 + Math.random() * 2.5
    const s = makeStalactite(h)
    s.position.set(x, heightAt(x, z) + h / 2, z)
    root.add(s)
    // Cone is r≈1 at base, 0 at tip — the cylinder radius averages the two
    // so the collider doesn't poke sideways past the visible stump.
    colliders.push({ kind: 'cylinder', x, y: s.position.y, z, r: 0.6, h })
  }

  // Mid-size stones — low-poly dodecahedrons, collidable so the bot walks
  // around them. Bigger min-landmark radius than the rubble so we don't
  // block the quarry / pad / base approach.
  const stoneGeom = new THREE.DodecahedronGeometry(1, 0)
  const stones = scatterRubble({
    count: 110,
    minR: 0.3, maxR: 0.7,
    minDistToLandmark: 10,
    color: 0x847e75,
    baseGeom: stoneGeom,
    landmarks, heightAt, colliders
  })
  root.add(stones)

  // Tiny rubble — decorative only. Plain icosphere (20 tris) instanced to
  // keep the draw call count flat; no colliders, since the bot steps over
  // anything this small anyway.
  const rubbleGeom = new THREE.IcosahedronGeometry(1, 0)
  const rubble = scatterRubble({
    count: 500,
    minR: 0.08, maxR: 0.22,
    minDistToLandmark: 5,
    color: 0x9b948a,
    baseGeom: rubbleGeom,
    landmarks, heightAt, colliders: null
  })
  root.add(rubble)

  // -- Outer wasteland ----------------------------------------------------
  // A wide, deliberately boring ring around the playable world. Players
  // *can* drive past the inner boundary (±150 m), but there are no craters,
  // rifts or objectives out here — just a flat expanse with sparse
  // boulder/rubble scatter, so the only reward for going further is
  // Tusk's sarcastic mission reminder and the walk back. The ring covers
  // ±WORLD_OUTER m (≈1200 m); the mesh is a handful of low-poly strips so
  // the extra geometry costs nothing at distance.
  const OUTER = WORLD_OUTER
  const INNER = WORLD_BOUNDARY
  const outerMat = flatMaterial(0x9e978d, { roughness: 1, metalness: 0 })
  const makeStrip = (cx: number, cz: number, w: number, d: number) => {
    // Big triangles (4 segs each way) — nothing out here needs resolving.
    const g = new THREE.PlaneGeometry(w, d, 4, 4)
    g.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(g, outerMat)
    mesh.position.set(cx, 0, cz)
    mesh.receiveShadow = true
    return mesh
  }
  const ringDepth = OUTER - INNER
  const ringMid = (OUTER + INNER) / 2
  // Four visual strips forming an axis-aligned picture frame around the
  // inner world. The N/S strips extend the full outer width so the corners
  // are covered by them; the E/W strips only span the inner height to
  // avoid overlapping the N/S strips.
  root.add(makeStrip(0, ringMid, OUTER * 2, ringDepth))   // north
  root.add(makeStrip(0, -ringMid, OUTER * 2, ringDepth))   // south
  root.add(makeStrip(ringMid, 0, ringDepth, INNER * 2))   // east
  root.add(makeStrip(-ringMid, 0, ringDepth, INNER * 2))   // west

  // Flat colliders under each strip: thin boxes with their top face at
  // y=0. Four colliders is cheaper than any one heightfield covering the
  // same ring, and the character controller only ever cares about the top
  // plane of each anyway.
  const SLAB_HALF = 5
  const addSlab = (cx: number, cz: number, w: number, d: number) => {
    colliders.push({
      kind: 'box', x: cx, y: -SLAB_HALF, z: cz,
      w, h: SLAB_HALF * 2, d
    })
  }
  addSlab(0, ringMid, OUTER * 2, ringDepth)
  addSlab(0, -ringMid, OUTER * 2, ringDepth)
  addSlab(ringMid, 0, ringDepth, INNER * 2)
  addSlab(-ringMid, 0, ringDepth, INNER * 2)

  // Sparse boulder scatter across the outer ring. Reuses the mid-stone
  // pattern (yaw-only rotation + matching AABB collider) so physics stays
  // predictable. No craters/rifts, no rubble under a collider threshold —
  // intentionally empty.
  const outerStoneGeom = new THREE.DodecahedronGeometry(1, 0)
  const outerInst = new THREE.InstancedMesh(
    outerStoneGeom,
    flatMaterial(0x7e786f, { roughness: 1, metalness: 0 }),
    260
  )
  outerInst.receiveShadow = true
  {
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    let placed = 0, attempts = 0
    while (placed < 260 && attempts < 260 * 5) {
      attempts++
      const x = (Math.random() - 0.5) * 2 * OUTER
      const z = (Math.random() - 0.5) * 2 * OUTER
      // Reject if inside the inner playable region — those get their own
      // (denser) scatter up above.
      if (Math.abs(x) < INNER && Math.abs(z) < INNER) continue
      const r = 0.6 + Math.random() * 1.6
      const y = r * 0.25
      p.set(x, y, z)
      const yaw = Math.random() * Math.PI * 2
      e.set(0, yaw, 0)
      q.setFromEuler(e)
      s.set(
        r * (0.8 + Math.random() * 0.4),
        r * (0.55 + Math.random() * 0.5),
        r * (0.8 + Math.random() * 0.4)
      )
      m.compose(p, q, s)
      outerInst.setMatrixAt(placed, m)
      colliders.push({
        kind: 'box', x, y, z,
        w: s.x * 2, h: s.y * 2, d: s.z * 2, ry: yaw
      })
      placed++
    }
    outerInst.count = placed
    outerInst.instanceMatrix.needsUpdate = true
  }
  root.add(outerInst)

  // Decorative rubble — no colliders (too small to matter). Same pattern
  // as inner rubble but spread across the outer ring only.
  const outerRubbleGeom = new THREE.IcosahedronGeometry(1, 0)
  const outerRubble = new THREE.InstancedMesh(
    outerRubbleGeom,
    flatMaterial(0x8d867c, { roughness: 1, metalness: 0 }),
    600
  )
  outerRubble.receiveShadow = true
  {
    const m = new THREE.Matrix4()
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    let placed = 0, attempts = 0
    while (placed < 600 && attempts < 600 * 4) {
      attempts++
      const x = (Math.random() - 0.5) * 2 * OUTER
      const z = (Math.random() - 0.5) * 2 * OUTER
      if (Math.abs(x) < INNER && Math.abs(z) < INNER) continue
      const r = 0.1 + Math.random() * 0.22
      p.set(x, r * 0.25, z)
      e.set(0, Math.random() * Math.PI * 2, 0)
      q.setFromEuler(e)
      s.set(
        r * (0.8 + Math.random() * 0.4),
        r * (0.55 + Math.random() * 0.5),
        r * (0.8 + Math.random() * 0.4)
      )
      m.compose(p, q, s)
      outerRubble.setMatrixAt(placed, m)
      placed++
    }
    outerRubble.count = placed
    outerRubble.instanceMatrix.needsUpdate = true
  }
  root.add(outerRubble)

  // Sky bodies render last so the depth buffer doesn't intersect the terrain.
  const { group: sky, sun } = makeSkyBodies()
  root.add(sky)
  // Expose sun position for the directional light.
  ;(root as any).userData.sun = sun

  return {
    root, terrainMesh: terrain, colliders, landmarks, quarryStones,
    airlock: airlockInst, airlockPos: airlockPos.clone(),
    heightAt
  }
}

