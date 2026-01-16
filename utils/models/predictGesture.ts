import * as tf from '@tensorflow/tfjs'

let gestureModel: tf.LayersModel | null = null
export async function predictGesture(landmarks: any[]) {
  if (!gestureModel) {
    gestureModel = await tf.loadLayersModel('/model/gesture/model.json')
  }

  const input = tf.tensor(
    landmarks.map(p => [p.x, p.y, p.z])
  ).reshape([1, 21, 3])

  const prediction = gestureModel.predict(input) as tf.Tensor
  const probs = await prediction.data()

  input.dispose()
  prediction.dispose()

  const gestures = ['SPACE', 'DELETE', 'NEXT']
  return gestures[probs.indexOf(Math.max(...probs))]
}
