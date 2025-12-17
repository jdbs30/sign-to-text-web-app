import type { Point } from './handTypes'
import type { LetterReferenceMap } from './referenceTypes'
import refsRaw from './letterReferences.json'

export interface DebugInfo {
  rawBest: string
  rawScore: number
  heuristicInput: string
  heuristicOutput: string
  firedRules: string[]
  topDistances: { letter: string; score: number }[]
  pointDistances?: { label: string; value: number }[]
}

export interface DetectResult {
  letter: string
  score: number
  debug?: DebugInfo
}

const REFERENCES = refsRaw as LetterReferenceMap
const LANDMARK_COUNT = 21

// ---------- GEOMETRY ----------
function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
}

function normalize(pts: Point[]): Point[] {
  const base = pts[0] // wrist
  const scale = distance(pts[0], pts[9]) || 1
  return pts.map(p => ({
    x: (p.x - base.x) / scale,
    y: (p.y - base.y) / scale,
    z: (p.z - base.z) / scale,
  }))
}

function poseDistance(a: Point[], b: Point[]): number {
  let sum = 0
  for (let i = 0; i < LANDMARK_COUNT; i++) sum += distance(a[i], b[i])
  return sum / LANDMARK_COUNT
}

// ---------- MAIN DETECTOR ----------
export function detectChar(pts: Point[], enableDebug = false): DetectResult {
  if (!pts || pts.length !== LANDMARK_COUNT) return { letter: '', score: Infinity }

  const live = normalize(pts)
  let bestLetter = ''
  let bestScore = Infinity
  const distances: { letter: string; score: number }[] = []

  // Compare against references
  for (const letter in REFERENCES) {
    const ref = REFERENCES[letter]
    if (!ref || ref.length !== LANDMARK_COUNT) continue
    const refNorm = normalize(ref)
    const d = poseDistance(live, refNorm)
    distances.push({ letter, score: d })
    if (d < bestScore) { bestScore = d; bestLetter = letter }
  }

  const firedRules: string[] = []
  const pointDistances: { label: string; value: number }[] = []
  let finalLetter = bestLetter

  // ---------- HEURISTICS ----------
  const groupMap: Record<string, number> = {
    A: 0, E: 0, M: 0, N: 0,
    K: 9,
    B: 1, F: 1,
    R: 4, U: 4, V: 4,
    C: 2, O: 2,
    G: 3, H: 3,
    L: 5, D: 5, X: 5,
    P: 6, Q: 6, Z: 6,
    T: 7, S: 7,
    Y: 8, J: 8,
  }
  const group = groupMap[bestLetter] ?? -1

  // Group 0: S/A/T/E/M/N
  if (group === 0) {
    const dThumbIndexX = distance(pts[4], pts[6])
    const dThumbIndexY = distance(pts[4], pts[8])
    const dThumbMiddle = distance(pts[4], pts[12])
    const dIndexMiddle = distance(pts[8], pts[12])
    const dIndexRing = distance(pts[8], pts[16])
    const dIndexPinky = distance(pts[8], pts[20])

    pointDistances.push(
      { label: 'Thumb-Index X (A)', value: dThumbIndexX },
      { label: 'Thumb-Index Y (E)', value: dThumbIndexY },
      { label: 'Thumb-Middle (M)', value: dThumbMiddle },
      { label: 'Index-Middle (T/N)', value: dIndexMiddle },
      { label: 'Index-Ring (N)', value: dIndexRing },
      { label: 'Index-Pinky (Optional)', value: dIndexPinky }
    )

    if (pts[4].x > pts[6].x) { finalLetter = 'A'; firedRules.push('G0:A thumb left') }
    else if (pts[4].y > pts[8].y) { finalLetter = 'E'; firedRules.push('G0:E thumb down') }
    else if (dThumbMiddle < 0.15 && dIndexMiddle < 0.035) { finalLetter = 'M'; firedRules.push('G0:M thumb-middle close') }
    else if (dIndexRing > 0.05 && dIndexMiddle < 0.05) { finalLetter = 'N'; firedRules.push('G0:N index-middle-ring spread') }
    else { finalLetter = 'S'; firedRules.push('G0:S default') }
  }

  // Group 1: B/F
  if (group === 1) {
    const dThumbIndexB = distance(pts[4], pts[8])
    const dIndexMiddleF = distance(pts[8], pts[12])
    pointDistances.push(
      { label: 'Thumb-Index (B)', value: dThumbIndexB },
      { label: 'Index-Middle (F)', value: dIndexMiddleF }
    )

    const fingersExtended =
      pts[8].y < pts[5].y &&
      pts[12].y < pts[9].y &&
      pts[16].y < pts[13].y &&
      pts[20].y < pts[17].y

    const fingersSpread =
      distance(pts[8], pts[12]) > 0.5 &&
      distance(pts[12], pts[16]) > 0.5 &&
      distance(pts[16], pts[20]) > 0.5

    // Strict heuristic for Next: must have all fingers extended, spread, and thumb extended
    const thumbExtended = pts[4].y < pts[2].y
    if (fingersExtended && fingersSpread && thumbExtended) {
      finalLetter = 'Next'
      firedRules.push('G1:Next open hand (heuristic override)')
      pointDistances.push(
        { label: 'Index-Middle (Next)', value: distance(pts[8], pts[12]) },
        { label: 'Middle-Ring (Next)', value: distance(pts[12], pts[16]) },
        { label: 'Ring-Pinky (Next)', value: distance(pts[16], pts[20]) }
      )
    } else if (dIndexMiddleF < 0.3 && dThumbIndexB > 0.09) {
      finalLetter = 'B'
      firedRules.push('G1:B thumb-index gap')
    } else if (dThumbIndexB < 0.08) {
      finalLetter = 'F'
      firedRules.push('G1:F index-middle')
    }
  }

  // ---------- (other groups remain unchanged, use previous logic) ----------

  // ---------- Return ----------
  return {
    letter: finalLetter,
    score: Number(bestScore.toFixed(4)),
    debug: enableDebug
      ? {
          rawBest: bestLetter,
          rawScore: Number(bestScore.toFixed(4)),
          heuristicInput: bestLetter,
          heuristicOutput: finalLetter,
          firedRules,
          topDistances: distances
            .sort((a, b) => a.score - b.score)
            .slice(0, 5)
            .map(d => ({ letter: d.letter, score: Number(d.score.toFixed(4)) })),
          pointDistances: pointDistances.map(d => ({ label: d.label, value: Number(d.value.toFixed(4)) })),
        }
      : undefined,
  }
}
