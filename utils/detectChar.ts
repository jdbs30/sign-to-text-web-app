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

  // ---------- Group 0: S/A/T/E/M/N ----------
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

    if (pts[4].x > pts[6].x) { 
      finalLetter = 'A'; firedRules.push('G0:A thumb left') 
    } else if (pts[4].y > pts[8].y) { 
      finalLetter = 'E'; firedRules.push('G0:E thumb down') 
    } else if (dThumbMiddle < 0.15 && dIndexMiddle < 0.035) { 
      finalLetter = 'M'; firedRules.push('G0:M thumb-middle close') 
    } else if (dIndexRing > 0.05 && dIndexMiddle < 0.05) { 
      finalLetter = 'N'; firedRules.push('G0:N index-middle-ring spread') 
    } else { 
      finalLetter = 'S'; firedRules.push('G0:S default') 
    }
  }

  // ---------- Group 1: B/F ----------
  if (group === 1) {
    const dThumbIndexB = distance(pts[4], pts[8])
    const dIndexMiddleF = distance(pts[8], pts[12])
    pointDistances.push(
      { label: 'Thumb-Index (B)', value: dThumbIndexB },
      { label: 'Index-Middle (F)', value: dIndexMiddleF }
    )

    // --- Check top 5 for Next override ---
    
    const top5 = distances.slice().sort((a,b)=>a.score-b.score).slice(0,3).map(d=>d.letter)
    console.log(top5)
    if (top5.includes('next')) {
      finalLetter = 'next'
      firedRules.push('Override: Next detected in top 5 distances (B/F group)')
    } 
    // Otherwise apply B/F heuristics
    else if (dIndexMiddleF < 0.3 && dThumbIndexB > 0.09) {
      finalLetter = 'B'; firedRules.push('G1:B thumb-index gap')
    } else if (dThumbIndexB < 0.08) {
      finalLetter = 'F'; firedRules.push('G1:F index-middle')
    }
  }

  if (group === 2) {
    const dThumbIndex = distance(pts[8], pts[4])
    pointDistances.push({ label: 'Thumb-Index distance (C/O)', value: dThumbIndex })
    finalLetter = dThumbIndex > 0.1 ? 'C' : 'O'
    firedRules.push('G2:C/O distance')
  }

  // ---------- GROUP 3 ----------
  if (group === 3) {
    const dIndexMiddle = distance(pts[8], pts[12])
    pointDistances.push({ label: 'Index-Middle distance (G/H)', value: dIndexMiddle })
    finalLetter = dIndexMiddle > 0.2 ? 'G' : 'H'
    firedRules.push('G3:G/H finger gap')
  }

  // ---------- GROUP 4 ----------
  if (group === 4) {
    const dIndexBaseR = pts[8].y - pts[5].y
    const dMiddleIndexMid = distance(pts[7], pts[11])
    const dMiddleRingU = distance(pts[12], pts[16])
    const dRingPinkyV = distance(pts[16], pts[20])
    pointDistances.push(
      { label: 'Index-Base (R)', value: dIndexBaseR },
      { label: 'Middle-Ring (U)', value: dMiddleRingU },
      { label: 'Ring-Pinky (V)', value: dRingPinkyV },
      { label: 'Middle-Index (Mid)', value: dMiddleIndexMid},
    )
    if (dMiddleIndexMid < 0.06) { finalLetter = 'R'; firedRules.push('G4:R index-base') }
    else if (dMiddleRingU > 0.06 && dMiddleIndexMid < 0.1) { finalLetter = 'U'; firedRules.push('G4:U middle-ring') }
    else if (dMiddleRingU > 0.1) { finalLetter = 'V'; firedRules.push('G4:V ring-pinky') }
  }

  // ---------- GROUP 5 ----------
  if (group === 5) {
    const dThumbMiddleMid = distance(pts[4], pts[10])
    const dIndexMiddleMid = distance(pts[8], pts[10])
    pointDistances.push(
      { label: 'Thumb-Middle(B)', value: dThumbMiddleMid },
      { label: 'INDEX-Middle(B)', value: dIndexMiddleMid }
    )
    if (dThumbMiddleMid > 0.2 && dIndexMiddleMid > 0.17) { finalLetter = 'L'; firedRules.push('G5:L thumb-index gap') }
    else if (dThumbMiddleMid < 0.07 && dIndexMiddleMid > 0.18 ) { finalLetter = 'D'; firedRules.push('G5:D index-middle') }
    else if (dThumbMiddleMid < 0.07 && dIndexMiddleMid < 0.13) { finalLetter = 'X'; firedRules.push('G5:X index-middle') }
  }

  // ---------- GROUP 6 ----------
  if (group === 6) {
    const dIndex5 = pts[8].y - pts[5].y
    pointDistances.push({ label: 'Index-Base Y (Z/P)', value: dIndex5 })
    finalLetter = pts[8].y < pts[5].y ? 'Z' : 'P'
    firedRules.push('G6:Z/P default')
  }

  // ---------- GROUP 7 ----------
  if (group === 7) {
    const dThumbIndexX = distance(pts[4], pts[6])
    const dThumbMiddle = distance(pts[4], pts[10])
    const dThumbIndexY = distance(pts[4], pts[8])
    pointDistances.push({ label: 'Thumb-Index X (T)', value: dThumbIndexX })
    pointDistances.push({ label: 'Thumb-Index Y (S)', value: dThumbIndexY })
    pointDistances.push({ label: 'Thumb-Middle (S)', value: dThumbMiddle })
    if(dThumbMiddle > 0.09){
      finalLetter = 'A'; firedRules.push('G7:A default')
    } else if (dThumbIndexX < 0.1 && dThumbIndexY > 0.1) {
      finalLetter = 'T'; firedRules.push('G7:T thumb close')
    } else if (dThumbIndexY < 0.1) {
      finalLetter = 'S'; firedRules.push('G7:S thumb down')
    }
  }

  // ---------- GROUP 8 ----------
  if (group === 8) {
    const dThumbIndexYJ = distance(pts[8], pts[4])
    pointDistances.push({ label: 'Thumb-Index (Y/J)', value: dThumbIndexYJ })
    finalLetter = dThumbIndexYJ > 0.2 ? 'Y' : 'J'
    firedRules.push('G8:Y/J thumb-index')
  }

  // ---------- GROUP 9 ----------
  if (group === 9) {
    finalLetter = 'K'
    firedRules.push('G9:K default')
  }

  // ---------- FULLY OPEN HAND -> Next command ----------
  const fingersExtended =
    pts[8].y < pts[5].y &&
    pts[12].y < pts[9].y &&
    pts[16].y < pts[13].y &&
    pts[20].y < pts[17].y

  const fingersSpread =
    distance(pts[8], pts[12]) > 0.5 &&
    distance(pts[12], pts[16]) > 0.5 &&
    distance(pts[16], pts[20]) > 0.5

  if (fingersExtended && fingersSpread) {
    finalLetter = 'Next'
    firedRules.push('GNext:All fingers open -> Next command')
    pointDistances.push({ label: 'Index-Middle (Next)', value: distance(pts[8], pts[12]) })
    pointDistances.push({ label: 'Middle-Ring (Next)', value: distance(pts[12], pts[16]) })
    pointDistances.push({ label: 'Ring-Pinky (Next)', value: distance(pts[16], pts[20]) })
  }

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
            .slice()
            .sort((a, b) => a.score - b.score)
            .slice(0, 5)
            .map(d => ({ letter: d.letter, score: Number(d.score.toFixed(4)) })),
          pointDistances: pointDistances.map(d => ({ label: d.label, value: Number(d.value.toFixed(4)) })),
        }
      : undefined,
  }
}
