import type { Point } from './handTypes';
import type { LetterReferenceMap } from './referenceTypes';
import refsRaw from './letterReferences.json';

/* ================================
   LOAD REFERENCES
================================ */
const REFERENCES = refsRaw as LetterReferenceMap;
const LANDMARK_COUNT = 21;

/* ================================
   BASIC GEOMETRY
================================ */
function distance(a: Point, b: Point): number {
  return Math.sqrt(
    (a.x - b.x) ** 2 +
    (a.y - b.y) ** 2 +
    (a.z - b.z) ** 2
  );
}

/* ================================
   NORMALIZATION
   - wrist as origin
   - scale by hand size
================================ */
function normalize(pts: Point[]): Point[] {
  const base = pts[0]; // wrist
  const scale = distance(pts[0], pts[9]) || 1; // wrist → middle MCP

  return pts.map(p => ({
    x: (p.x - base.x) / scale,
    y: (p.y - base.y) / scale,
    z: (p.z - base.z) / scale,
  }));
}

/* ================================
   POSE DISTANCE
================================ */
function poseDistance(a: Point[], b: Point[]): number {
  let sum = 0;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    sum += distance(a[i], b[i]);
  }
  return sum / LANDMARK_COUNT;
}

/* ================================
   FINGER STATE
================================ */
function isFingerUp(tip: number, pip: number, pts: Point[]) {
  return pts[tip].y < pts[pip].y;
}

/* ================================
   MAIN DETECTOR
================================ */
export function detectChar(pts: Point[]) {
  if (!pts || pts.length !== LANDMARK_COUNT) {
    return {
      letter: '',
      score: Infinity,
    };
  }

  /* ===========================
     REFERENCE MATCHING
  =========================== */
  const live = normalize(pts);

  let bestLetter = '';
  let bestScore = Infinity;

  for (const letter in REFERENCES) {
    const ref = REFERENCES[letter];

    if (!ref || ref.length !== LANDMARK_COUNT) continue;

    const refNorm = normalize(ref);
    const d = poseDistance(live, refNorm);

    if (d < bestScore) {
      bestScore = d;
      bestLetter = letter;
    }
  }

  return {
    letter: bestLetter,
    score: Number(bestScore.toFixed(4)),
  };
}
