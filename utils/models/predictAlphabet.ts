import * as tf from '@tensorflow/tfjs'

let alphabetModel: tf.LayersModel | null = null

async function loadAlphabetModel() {
  if (!alphabetModel) {
    alphabetModel = await tf.loadLayersModel('/model/alphabet/model.json')
  }
}

export async function predictAlphabet(landmarks: any[]) {
  if (!alphabetModel) await loadAlphabetModel()

  const input = tf.tensor(
    landmarks.map(p => [p.x, p.y, p.z])
  ).reshape([1, 21, 3])

  const prediction = alphabetModel!.predict(input) as tf.Tensor
  const probs = await prediction.data()

  input.dispose()
  prediction.dispose()

  const classes = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const index = probs.indexOf(Math.max(...probs))

  return classes[index]
}
