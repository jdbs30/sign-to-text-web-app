import * as tf from '@tensorflow/tfjs'

const gestureLabels = [
  'eat','friend','Hello','Help me','Home','how',
  'Love You','my','name','No','Some','Sorry',
  'Thanks','Understand','Yes'
]

let gestureModel: tf.LayersModel | null = null

export async function loadGestureModel() {
  if (!gestureModel) {
    gestureModel = await tf.loadLayersModel('/model/gestures/model.json')
  }
  return gestureModel
}

// flat: number[] (63)
export function predictGesture(flat: number[]) {
  if (!gestureModel) return null
  const tensor = tf.tensor(flat).reshape([1, 21, 3]) // <-- reshape to 3D
  const pred = gestureModel.predict(tensor) as tf.Tensor
  const idx = pred.argMax(-1).dataSync()[0]
  tensor.dispose()
  return gestureLabels[idx]
}
