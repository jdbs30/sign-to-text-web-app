// alphabetModel.ts
import * as tf from '@tensorflow/tfjs'

// Alphabet labels A-Z
const alphabetLabels = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(65 + i)
)

let model: tf.LayersModel | null = null

/**
 * Load the Alphabet model from the public folder
 */
export async function loadAlphabetModel() {
  if (!model) {
    model = await tf.loadLayersModel('/model/alphabets/model.json')
    console.log('Alphabet model loaded')
  }
  return model
}

/**
 * Predict the alphabet letter from flat landmarks array [63]
 * Only use x and y coordinates → [21,2]
 * @param flatLandmarks - array of 63 numbers [x1,y1,z1,...,x21,y21,z21]
 */
export async function predictAlphabet(flatLandmarks: number[]) {
  if (!model) return null
  if (flatLandmarks.length !== 63) {
    console.error('Expected 63 values for landmarks (21*3)')
    return null
  }

  try {
    // Strip z-coordinates
    const landmarks2D: number[] = []
    for (let i = 0; i < flatLandmarks.length; i += 3) {
      landmarks2D.push(flatLandmarks[i], flatLandmarks[i + 1]) // x, y
    }

    // Reshape to [1, 21, 2]
    const tensor = tf.tensor(landmarks2D).reshape([1, 21, 2])
    const pred = model.predict(tensor) as tf.Tensor
    const idx = pred.argMax(-1).dataSync()[0]
    tensor.dispose()

    return alphabetLabels[idx]
  } catch (err) {
    console.error('Alphabet prediction error:', err)
    return null
  }
}
