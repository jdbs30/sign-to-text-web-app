import * as tf from "@tensorflow/tfjs";

export async function preprocessImage(file: File) {
  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);
  await img.decode();

  return tf.tidy(() => {
    let tensor = tf.browser.fromPixels(img, 1); // grayscale
    tensor = tf.image.resizeBilinear(tensor, [64, 64]);
    tensor = tensor.toFloat().div(255.0);
    tensor = tensor.expandDims(0); // [1, 128, 128, 1]
    return tensor;
  });
}
