import * as tf from "@tensorflow/tfjs";

// Preprocess a video frame (for static images use the previous preprocessImage)
export function preprocessFrame(
  video: HTMLVideoElement,
  imgSize = 64,
  minValue = 70
): tf.Tensor4D { // explicitly Tensor4D
  return tf.tidy(() => {
    // Convert to tensor
    let tensor = tf.browser.fromPixels(video); // [H,W,3]

    // Grayscale
    tensor = tensor.mean(2) as tf.Tensor2D; // [H,W]

    // Gaussian blur approximation (5x5 kernel)
    const kernel = tf.tensor2d(
      [
        [1, 4, 6, 4, 1],
        [4,16,24,16, 4],
        [6,24,36,24, 6],
        [4,16,24,16, 4],
        [1, 4, 6, 4, 1]
      ],
      [5,5]
    ).div(256).expandDims(2).expandDims(3); // [5,5,1,1]

    let tensor4D = tensor.expandDims(0).expandDims(-1) as tf.Tensor4D; // [1,H,W,1]
    tensor4D = tf.conv2d(tensor4D, kernel, 1, 'same'); // blurred

    // Resize to model input
    tensor4D = tf.image.resizeBilinear(tensor4D, [imgSize, imgSize]) as tf.Tensor4D;

    // Normalize and threshold
    tensor4D = tensor4D.div(255);
    const mask = tensor4D.greater(minValue / 255);
    tensor4D = tf.where(mask, tf.zerosLike(tensor4D), tf.onesLike(tensor4D)) as tf.Tensor4D;

    return tensor4D; // shape: [1,imgSize,imgSize,1]
  });
}

// Render tensor to canvas
export function renderTensor(tensor: tf.Tensor4D, canvas: HTMLCanvasElement) {
  tf.tidy(() => {
    let imageTensor = tensor.squeeze() as tf.Tensor3D; // [H,W,1]

    // Make 3 channels for rendering
    if (imageTensor.shape[2] === 1) {
      imageTensor = tf.tile(imageTensor, [1,1,3]) as tf.Tensor3D; // [H,W,3]
    }

    imageTensor = imageTensor.clipByValue(0,1) as tf.Tensor3D;
    tf.browser.toPixels(imageTensor, canvas);
  });
}

