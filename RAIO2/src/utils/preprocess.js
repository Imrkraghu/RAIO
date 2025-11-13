// utils/preprocess.js
import * as tf from "@tensorflow/tfjs";

/**
 * Pads an image to a square, resizes to model dimensions,
 * normalizes (0–1), adds a batch dimension.
 * 
 * This maintains aspect ratio by padding to square before resizing.
 * 
 * @param {tf.Tensor} img - Input image tensor [H, W, 3]
 * @param {number} modelWidth - Target width (640)
 * @param {number} modelHeight - Target height (640)
 * @returns {Array} [tensor, xRatio, yRatio]
 */
export const preprocess = (img, modelWidth, modelHeight) => {
  if (!img || !img.shape) {
    console.error("[Preprocess] Invalid input tensor");
    return [null, 1, 1];
  }

  const [h, w] = img.shape.slice(0, 2);
  const maxSize = Math.max(w, h);
  
  console.log("[Preprocess] ===== START =====");
  console.log("[Preprocess] Input shape:", img.shape);
  console.log("[Preprocess] Original WxH:", w, "x", h);
  console.log("[Preprocess] Max size for padding:", maxSize);

  let tensor, xRatio, yRatio;

  try {
    tensor = tf.tidy(() => {
      // ✅ Step 1: Pad to square (maintains aspect ratio)
      const imgPadded = img.pad([
        [0, maxSize - h], // Pad bottom
        [0, maxSize - w], // Pad right
        [0, 0],           // No padding on channels
      ]);

      console.log("[Preprocess] Padded shape:", imgPadded.shape);

      // ✅ Step 2: Resize to model input size
      const resized = tf.image.resizeBilinear(imgPadded, [modelWidth, modelHeight]);
      console.log("[Preprocess] Resized shape:", resized.shape);

      // ✅ Step 3: Normalize to [0, 1]
      const normalized = resized.div(255.0);

      // ✅ Step 4: Add batch dimension [H, W, 3] → [1, H, W, 3]
      const batched = normalized.expandDims(0);
      console.log("[Preprocess] Final output shape:", batched.shape);

      // ✅ IMPORTANT: If your model expects [1, 3, 640, 640] instead of [1, 640, 640, 3]
      // Uncomment the next line:
      // return batched.transpose([0, 3, 1, 2]);

      return batched;
    });

    // ✅ Compute scaling ratios for bounding box coordinates
    // These ratios convert from normalized [0,1] coords back to original image coords
    xRatio = w / maxSize;
    yRatio = h / maxSize;

    console.log("[Preprocess] Computed ratios - xRatio:", xRatio, "yRatio:", yRatio);
    console.log("[Preprocess] ===== END =====");
    console.log("");

  } catch (error) {
    console.error("[Preprocess] Error during preprocessing:", error);
    return [null, 1, 1];
  }

  return [tensor, xRatio, yRatio];
};