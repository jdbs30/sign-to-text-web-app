import { Point } from './handTypes';

type Sample = { pts: Point[] };

export class LetterProfiler {
  private samples: Record<string, Sample[]> = {};

  // Add a new sample for a specific label
  recordSample(label: string, pts: Point[]) {
    if (!label || !pts || pts.length !== 21) return;
    if (!this.samples[label]) this.samples[label] = [];
    this.samples[label].push({ pts });
  }

  // Compute average positions for each landmark
  computeAverages() {
    const averages: Record<string, Point[]> = {};

    for (const label in this.samples) {
      const allPts = this.samples[label].map(s => s.pts);
      if (!allPts.length) continue;

      const summed = allPts.reduce((acc, pts) => {
        pts.forEach((p, i) => {
          if (!acc[i]) acc[i] = { x: 0, y: 0, z: 0 };
          acc[i].x += p.x;
          acc[i].y += p.y;
          acc[i].z += p.z;
        });
        return acc;
      }, [] as Point[]);

      averages[label] = summed.map(p => ({
        x: p.x / allPts.length,
        y: p.y / allPts.length,
        z: p.z / allPts.length,
      }));
    }

    return averages;
  }

  exportData() {
    return {
      samples: this.samples,
      averages: this.computeAverages(),
    };
  }

  // Save the averages as JSON (Node.js)
  saveAveragesJSON(path: string) {
    const data = this.computeAverages();
    fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  }

  reset() {
    this.samples = {};
  }
}
