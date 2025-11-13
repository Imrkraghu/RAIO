// // utils/detection.js
// import * as tf from "@tensorflow/tfjs";
// // import labels from "../../../assets/my/model/labels.json";
// import labels from "../labels.json";

// /**
//  * Process YOLOv11 predictions and return detection data (no rendering)
//  * Used for post-capture image processing
//  */
// export const processDetections = (predictions, threshold = 0.3, iouThreshold = 0.45, maxBoxes = 100) => {
//   if (!predictions || predictions.size === 0) {
//     return { detections: [], success: false };
//   }

//   console.log('[processDetections] Starting detection processing...');

//   // Transpose [1, 234, 8400] → [1, 8400, 234]
//   const transposed = predictions.transpose([0, 2, 1]);
//   const data = transposed.dataSync();
  
//   const [_, numBoxes, numAttrs] = transposed.shape;
//   const numClasses = numAttrs - 4; // 230 classes

//   console.log(`[processDetections] Processing ${numBoxes} boxes, ${numClasses} classes`);

//   const modelSize = 640; // Model input size

//   // Process boxes and collect valid detections
//   const validBoxes = [];
//   const validScores = [];
//   const validClasses = [];

//   for (let i = 0; i < numBoxes; i++) {
//     const offset = i * numAttrs;
    
//     // Box coordinates (in model space 0-640)
//     const cx_px = data[offset + 0];
//     const cy_px = data[offset + 1];
//     const w_px = data[offset + 2];
//     const h_px = data[offset + 3];
    
//     // Skip invalid boxes
//     if (w_px <= 0 || h_px <= 0) continue;
//     if (cx_px < -100 || cx_px > 740 || cy_px < -100 || cy_px > 740) continue;
    
//     // Find best class (sigmoid activation)
//     let maxScore = 0;
//     let maxClassIdx = 0;
    
//     for (let c = 0; c < numClasses; c++) {
//       const logit = data[offset + 4 + c];
//       const score = 1.0 / (1.0 + Math.exp(-logit));
      
//       if (score > maxScore) {
//         maxScore = score;
//         maxClassIdx = c;
//       }
//     }
    
//     // Filter by threshold
//     if (maxScore < threshold) continue;
    
//     // Convert to corner format (keep in model space 640x640)
//     const x1 = cx_px - w_px / 2;
//     const y1 = cy_px - h_px / 2;
//     const x2 = cx_px + w_px / 2;
//     const y2 = cy_px + h_px / 2;
    
//     // Clamp to model bounds
//     const x1_clamped = Math.max(0, Math.min(x1, modelSize));
//     const y1_clamped = Math.max(0, Math.min(y1, modelSize));
//     const x2_clamped = Math.max(0, Math.min(x2, modelSize));
//     const y2_clamped = Math.max(0, Math.min(y2, modelSize));
    
//     validBoxes.push(x1_clamped, y1_clamped, x2_clamped, y2_clamped);
//     validScores.push(maxScore);
//     validClasses.push(maxClassIdx);
//   }

//   console.log(`[processDetections] Valid detections before NMS: ${validScores.length}`);

//   // Apply NMS
//   const keepIndices = nonMaxSuppression(validBoxes, validScores, iouThreshold, maxBoxes);
  
//   console.log(`[processDetections] After NMS: ${keepIndices.length} boxes`);

//   // Build detection results
//   const detections = [];
//   const labelCounts = {};

//   for (const idx of keepIndices) {
//     const score = validScores[idx];
//     const classIdx = validClasses[idx];
    
//     const x1 = validBoxes[idx * 4 + 0];
//     const y1 = validBoxes[idx * 4 + 1];
//     const x2 = validBoxes[idx * 4 + 2];
//     const y2 = validBoxes[idx * 4 + 3];
    
//     const width = x2 - x1;
//     const height = y2 - y1;
    
//     // Skip tiny boxes
//     if (width < 10 || height < 10) continue;
    
//     const label = labels[classIdx] || `class_${classIdx}`;
    
//     detections.push({
//       label: label,
//       confidence: parseFloat(score.toFixed(6)),
//       box: [Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)],
//       classId: classIdx,
//     });

//     // Count labels
//     labelCounts[label] = (labelCounts[label] || 0) + 1;
//   }

//   transposed.dispose();
  
//   console.log(`[processDetections] Final detections: ${detections.length}`);
//   console.log('[processDetections] Label counts:', labelCounts);
  
//   return {
//     detections: detections,
//     allDetections: detections,
//     counts: labelCounts,
//     success: true,
//     message: `Detected ${detections.length} objects`,
//   };
// };

// /**
//  * Simple Non-Maximum Suppression
//  */
// function nonMaxSuppression(boxes, scores, iouThreshold = 0.45, maxBoxes = 100) {
//   const numBoxes = scores.length;
//   const indices = Array.from({ length: numBoxes }, (_, i) => i);
  
//   // Sort by score descending
//   indices.sort((a, b) => scores[b] - scores[a]);
  
//   const keep = [];
//   const suppressed = new Set();
  
//   for (let i = 0; i < indices.length && keep.length < maxBoxes; i++) {
//     const idx = indices[i];
//     if (suppressed.has(idx)) continue;
    
//     keep.push(idx);
    
//     const box1 = {
//       x1: boxes[idx * 4 + 0],
//       y1: boxes[idx * 4 + 1],
//       x2: boxes[idx * 4 + 2],
//       y2: boxes[idx * 4 + 3]
//     };
    
//     for (let j = i + 1; j < indices.length; j++) {
//       const idx2 = indices[j];
//       if (suppressed.has(idx2)) continue;
      
//       const box2 = {
//         x1: boxes[idx2 * 4 + 0],
//         y1: boxes[idx2 * 4 + 1],
//         x2: boxes[idx2 * 4 + 2],
//         y2: boxes[idx2 * 4 + 3]
//       };
      
//       const iou = calculateIoU(box1, box2);
//       if (iou > iouThreshold) {
//         suppressed.add(idx2);
//       }
//     }
//   }
  
//   return keep;
// }

// /**
//  * Calculate IoU between two boxes
//  */
// function calculateIoU(box1, box2) {
//   const x1 = Math.max(box1.x1, box2.x1);
//   const y1 = Math.max(box1.y1, box2.y1);
//   const x2 = Math.min(box1.x2, box2.x2);
//   const y2 = Math.min(box1.y2, box2.y2);
  
//   const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  
//   const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
//   const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
//   const union = area1 + area2 - intersection;
  
//   return intersection / (union + 1e-6);
// }
import labels from "../labels.json";
import { Colors } from "../utils";

/**
 * Render prediction boxes and return detection data
 * @param {Expo2DContext} ctx Expo context
 * @param {number} threshold threshold number
 * @param {Array} boxes_data boxes array
 * @param {Array} scores_data scores array
 * @param {Array} classes_data class array
 * @param {Array[Number]} ratios boxes ratio [xRatio, yRatio]
 * @param {boolean} flipX flip horizontal
 * @returns {Array} detections array
 */
export const renderBoxes = (
  ctx,
  threshold,
  boxes_data,
  scores_data,
  classes_data,
  ratios,
  flipX = true
) => {
  ctx.clearRect(0, 0, ctx.width, ctx.height); // clean canvas

  // font configs
  const font = `${Math.max(Math.round(Math.max(ctx.width, ctx.height) / 40), 14)}pt sans-serif`;
  ctx.font = font;
  ctx.textBaseline = "top";

  const colors = new Colors();
  const detections = []; // ✅ Store detections

  for (let i = 0; i < scores_data.length; ++i) {
    if (scores_data[i] > threshold) {
      const klass = labels[classes_data[i]];
      const color = colors.get(classes_data[i]);
      const score = scores_data[i];
      const scorePercent = (score * 100).toFixed(1);

      let [x1, y1, x2, y2] = boxes_data.slice(i * 4, (i + 1) * 4);
      x1 *= ctx.width * ratios[0];
      x2 *= ctx.width * ratios[0];
      y1 *= ctx.height * ratios[1];
      y2 *= ctx.height * ratios[1];
      const width = x2 - x1;
      const height = y2 - y1;

      // flip horizontal
      let x;
      if (flipX) x = ctx.width - x1 - width;
      else x = x1;

      // ✅ Store detection data
      detections.push({
        label: klass,
        confidence: parseFloat(score.toFixed(4)),
        bbox: [Math.round(x), Math.round(y1), Math.round(width), Math.round(height)],
        classId: classes_data[i],
      });

      // Draw the bounding box
      ctx.fillStyle = Colors.hexToRgba(color, 0.2);
      ctx.fillRect(x, y1, width, height);

      // Draw the label background
      ctx.fillStyle = color;
      const textWidth = ctx.measureText(klass + " - " + scorePercent + "%").width;
      const textHeight = parseInt(font, 10);
      const yText = y1 - (textHeight + 2);
      ctx.fillRect(x - 1, yText < 0 ? 0 : yText, textWidth + 2, textHeight + 2);

      // Draw labels
      ctx.fillStyle = "#ffffff";
      ctx.fillText(klass + " - " + scorePercent + "%", x - 1, yText < 0 ? 0 : yText);
    }
  }
  
  ctx.flush();
  
  return detections; // ✅ Return detections array
};