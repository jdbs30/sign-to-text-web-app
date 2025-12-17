export type Point = {
  x: number;
  y: number;
  z: number;
};

export type StaticSample = {
  label: string;                 // "a", "next", "ily"
  kind: 'letter' | 'command';
  group: string;                 // G1–G8 or C1–C2
  landmarks: Point[];
};
