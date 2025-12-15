// utils/normalizedDetection.ts

export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface DetectionResult {
  character: string;
  confidence: number;
  group: string;
  normalizedDistances: Record<string, number>;
}

// Core distance calculation function
export function distance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function normalizeDistances(pts: Point[], handSize: number): Record<string, number> {
  const distances: Record<string, number> = {};
  const baseDistance = handSize * 0.1;

  // Key finger tip distances
  distances['8_12'] = distance(pts[8], pts[12]) / baseDistance;
  distances['12_16'] = distance(pts[12], pts[16]) / baseDistance;
  distances['16_20'] = distance(pts[16], pts[20]) / baseDistance;
  
  // Thumb to finger tips
  distances['4_8'] = distance(pts[4], pts[8]) / baseDistance;
  distances['4_12'] = distance(pts[4], pts[12]) / baseDistance;
  distances['4_16'] = distance(pts[4], pts[16]) / baseDistance;
  distances['4_20'] = distance(pts[4], pts[20]) / baseDistance;

  return distances;
}

export function calculateHandSize(pts: Point[]): number {
  return distance(pts[0], pts[12]);
}

export function calculateFingerExtensions(pts: Point[]): Record<string, boolean> {
  return {
    thumb: pts[4].y < pts[3].y,
    index: pts[8].y < pts[6].y,
    middle: pts[12].y < pts[10].y,
    ring: pts[16].y < pts[14].y,
  };
}

export function detectGesture(pts: Point[]): DetectionResult {
  if (pts.length < 21) {
    return {
      character: '',
      confidence: 0,
      group: 'unknown',
      normalizedDistances: {}
    };
  }

  const handSize = calculateHandSize(pts);
  const normalizedDists = normalizeDistances(pts, handSize);
  const extensions = calculateFingerExtensions(pts);

  // Gesture detection logic
  let character = '';
  let confidence = 0;
  let group = '';

  // A - Thumb touching index finger, other fingers closed
  if (normalizedDists['4_8'] < 0.3 && !extensions.middle && !extensions.ring) {
    character = 'A';
    confidence = 0.9;
    group = 'letters';
  }
  // B - All fingers extended, thumb not touching
  else if (extensions.index && extensions.middle && extensions.ring && normalizedDists['4_8'] > 0.5) {
    character = 'B';
    confidence = 0.85;
    group = 'letters';
  }
  // C - Curved hand shape
  else if (normalizedDists['4_8'] > 0.2 && normalizedDists['4_8'] < 0.6 && extensions.index && extensions.middle) {
    character = 'C';
    confidence = 0.8;
    group = 'letters';
  }
  // Space - Open hand with fingers spread
  else if (extensions.index && extensions.middle && extensions.ring && 
           normalizedDists['8_12'] > 0.4 && normalizedDists['12_16'] > 0.4) {
    character = ' ';
    confidence = 0.75;
    group = 'actions';
  }
  // Closed fist
  else if (!extensions.index && !extensions.middle && !extensions.ring) {
    character = 'Closed';
    confidence = 0.7;
    group = 'actions';
  }
  else {
    character = '';
    confidence = 0.3;
    group = 'unknown';
  }

  return {
    character,
    confidence,
    group,
    normalizedDistances: normalizedDists
  };
}