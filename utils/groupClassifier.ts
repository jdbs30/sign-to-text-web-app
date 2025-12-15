// utils/groupClassifier.ts
import type { Point } from './handTypes';
import type { GroupId } from './letterGroups';

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function classifyGroup(pts: Point[]): GroupId | null {
  if (!pts || pts.length !== 21) return null;

  const wrist = pts[0];

  const thumbTip = pts[4];
  const indexTip = pts[8];
  const middleTip = pts[12];
  const ringTip = pts[16];
  const pinkyTip = pts[20];

  const fingers = [
    dist(wrist, indexTip),
    dist(wrist, middleTip),
    dist(wrist, ringTip),
    dist(wrist, pinkyTip),
  ];

  const extended = fingers.map(d => d > 0.35); // threshold tweakable
  const extendedCount = extended.filter(Boolean).length;

  // ✋ Open hand → many fingers extended
  if (extendedCount >= 4) return 'G4';

  // ✊ Fist / closed shapes
  if (extendedCount <= 1) return 'G6';

  // Two-finger dominant
  if (extendedCount === 2) {
    if (extended[0] && extended[1]) return 'G2'; // index + middle
    if (extended[0] && extended[3]) return 'G1'; // index + pinky
    return 'G5';
  }

  // Special shapes
  if (extendedCount === 3) return 'G3';

  // Single-letter groups
  if (dist(indexTip, thumbTip) < 0.08) return 'G7'; // L-like
  if (dist(indexTip, middleTip) < 0.05) return 'G8'; // X-like

  return null;
}
