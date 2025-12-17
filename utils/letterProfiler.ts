export class LetterProfiler {
  data: Record<string, any[]> = {};

  // Record static gestures/commands
  recordStatic(letter: string, type: string, group: string, landmarks: any) {
    // Initialize the array if it doesn't exist
    if (!this.data[letter]) {
      this.data[letter] = [];
    }

    this.data[letter].push({
      type,
      group,
      landmarks,
      timestamp: Date.now(),
    });
  }

  exportData() {
    return this.data;
  }
}
