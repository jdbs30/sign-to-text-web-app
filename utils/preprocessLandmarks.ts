import type { Point } from '@/utils/handTypes'

const EMPTY = Array(21).fill([0, 0])

export function preprocessAlphabetLandmarks(hand: Point[]) {
  return [
    hand.map(p => [
      p.x * 480,
      p.y * 640,
    ])
  ]
}

export function preprocessGestureLandmarks(
  left?: Point[],
  right?: Point[]
) {
  const lh = left
    ? left.map(p => [p.x, p.y])
    : EMPTY

  const rh = right
    ? right.map(p => [p.x, p.y])
    : EMPTY

  const merged = lh.map((l, i) => [
    l[0], l[1],
    rh[i][0], rh[i][1]
  ])

  return [merged]
}
