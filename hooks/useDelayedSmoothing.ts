// hooks/useDelayedSmoothing.ts
import { useRef, useCallback } from 'react';

export class QueueDelayedSmoother {
  private queues: Map<number, { x: number[]; y: number[]; z: number[] }> = new Map();
  private readonly delayFrames: number;
  private readonly smoothingFactor: number;

  constructor(delayFrames = 3, smoothingFactor = 0.8) {
    this.delayFrames = delayFrames;
    this.smoothingFactor = smoothingFactor;
  }

  processPoint(index: number, point: { x: number; y: number; z: number }): { x: number; y: number; z: number } | null {
    if (!this.queues.has(index)) {
      this.queues.set(index, {
        x: new Array(this.delayFrames).fill(point.x),
        y: new Array(this.delayFrames).fill(point.y),
        z: new Array(this.delayFrames).fill(point.z),
      });
      return null;
    }

    const queue = this.queues.get(index)!;
    const delayedPoint = {
      x: queue.x[0],
      y: queue.y[0],
      z: queue.z[0],
    };

    // Add new point and remove oldest
    queue.x.push(point.x);
    queue.y.push(point.y);
    queue.z.push(point.z);
    queue.x.shift();
    queue.y.shift();
    queue.z.shift();

    // Apply smoothing
    const smoothedKey = `smoothed_${index}`;
    if (!this.queues.has(smoothedKey)) {
      this.queues.set(smoothedKey, {
        x: [delayedPoint.x],
        y: [delayedPoint.y],
        z: [delayedPoint.z],
      });
      return delayedPoint;
    }

    const smoothedQueue = this.queues.get(smoothedKey)!;
    const lastSmoothed = {
      x: smoothedQueue.x[smoothedQueue.x.length - 1],
      y: smoothedQueue.y[smoothedQueue.y.length - 1],
      z: smoothedQueue.z[smoothedQueue.z.length - 1],
    };

    const smoothed = {
      x: lastSmoothed.x * this.smoothingFactor + delayedPoint.x * (1 - this.smoothingFactor),
      y: lastSmoothed.y * this.smoothingFactor + delayedPoint.y * (1 - this.smoothingFactor),
      z: lastSmoothed.z * this.smoothingFactor + delayedPoint.z * (1 - this.smoothingFactor),
    };

    smoothedQueue.x.push(smoothed.x);
    smoothedQueue.y.push(smoothed.y);
    smoothedQueue.z.push(smoothed.z);

    if (smoothedQueue.x.length > 5) {
      smoothedQueue.x.shift();
      smoothedQueue.y.shift();
      smoothedQueue.z.shift();
    }

    return smoothed;
  }

  reset(): void {
    this.queues.clear();
  }
}

export const useDelayedSmoothing = (delayFrames = 3, smoothingFactor = 0.8) => {
  const smoother = useRef(new QueueDelayedSmoother(delayFrames, smoothingFactor));

  const processLandmark = useCallback((index: number, point: { x: number; y: number; z: number }) => {
    return smoother.current.processPoint(index, point);
  }, []);

  const reset = useCallback(() => {
    smoother.current.reset();
  }, []);

  return {
    processLandmark,
    reset
  };
};