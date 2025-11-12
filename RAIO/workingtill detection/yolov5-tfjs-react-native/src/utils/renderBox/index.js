import * as tf from "@tensorflow/tfjs";
import labels from "../labels2.json";
import { Colors } from "../utils";

/**
 * YOLOv11 renderer with proper aspect ratio handling
 * Canvas: 1080x2077, Camera: 640x640, Model: 640x640
 */
export const renderBoxes = (ctx, predictions, threshold = 0.9, ratios = [1, 1], flipX = false) => {
  if (!ctx || !predictions || predictions.size === 0) {
    return [];
  }

  // Clear canvas first
  ctx.clearRect(0, 0, ctx.width, ctx.height);

  const canvasWidth = ctx.width;
  const canvasHeight = ctx.height;

  // Font configuration
  const font = `${Math.max(Math.round(Math.max(ctx.width, ctx.height) / 40), 14)}pt sans-serif`;
  ctx.font = font;
  ctx.textBaseline = "top";

  const colors = new Colors();

  console.log(`[renderBoxes] Canvas: ${canvasWidth}x${canvasHeight}, Threshold: ${threshold}, Ratios: [${ratios}]`);

  // Transpose [1, 234, 8400] → [1, 8400, 234]
  const transposed = predictions.transpose([0, 2, 1]);
  const data = transposed.dataSync();
  
  const [_, numBoxes, numAttrs] = transposed.shape;
  const numClasses = numAttrs - 4; // 230 classes

  // ✅ CRITICAL: Calculate proper scaling from model space (640x640) to canvas space
  // Camera/Model uses 640x640, but canvas is 1080x2077
  const modelSize = 640;
  const scaleX = canvasWidth / modelSize;
  const scaleY = canvasHeight / modelSize;

  console.log(`[renderBoxes] Scale factors: scaleX=${scaleX.toFixed(2)}, scaleY=${scaleY.toFixed(2)}`);

  // Process boxes and collect valid detections
  const validBoxes = [];
  const validScores = [];
  const validClasses = [];

  for (let i = 0; i < numBoxes; i++) {
    const offset = i * numAttrs;
    
    // Box coordinates (in pixel space 0-640)
    const cx_px = data[offset + 0];
    const cy_px = data[offset + 1];
    const w_px = data[offset + 2];
    const h_px = data[offset + 3];
    
    // Skip invalid boxes
    if (w_px <= 0 || h_px <= 0) continue;
    if (cx_px < -100 || cx_px > 740 || cy_px < -100 || cy_px > 740) continue;
    
    // Find best class (sigmoid activation)
    let maxScore = 0;
    let maxClassIdx = 0;
    
    for (let c = 0; c < numClasses; c++) {
      const logit = data[offset + 4 + c];
      const score = 1.0 / (1.0 + Math.exp(-logit));
      
      if (score > maxScore) {
        maxScore = score;
        maxClassIdx = c;
      }
    }
    
    // Filter by threshold
    if (maxScore < threshold) continue;
    
    // ✅ Convert to corner format and scale directly to canvas
    const x1 = (cx_px - w_px / 2) * scaleX * ratios[0];
    const y1 = (cy_px - h_px / 2) * scaleY * ratios[1];
    const x2 = (cx_px + w_px / 2) * scaleX * ratios[0];
    const y2 = (cy_px + h_px / 2) * scaleY * ratios[1];
    
    // Clamp to canvas bounds
    const x1_clamped = Math.max(0, Math.min(x1, canvasWidth));
    const y1_clamped = Math.max(0, Math.min(y1, canvasHeight));
    const x2_clamped = Math.max(0, Math.min(x2, canvasWidth));
    const y2_clamped = Math.max(0, Math.min(y2, canvasHeight));
    
    validBoxes.push(x1_clamped, y1_clamped, x2_clamped, y2_clamped);
    validScores.push(maxScore);
    validClasses.push(maxClassIdx);
  }

  console.log(`[renderBoxes] Valid detections: ${validScores.length}`);

  // Apply simple NMS
  const keepIndices = nonMaxSuppression(validBoxes, validScores, 0.45, 15);
  
  console.log(`[renderBoxes] After NMS: ${keepIndices.length} boxes`);

  // Draw boxes
  let drawnCount = 0;
  const detectionResults = [];

  for (const idx of keepIndices) {
    const score = validScores[idx];
    const classIdx = validClasses[idx];
    
    // Get box coordinates (already in canvas space)
    let x1 = validBoxes[idx * 4 + 0];
    let y1 = validBoxes[idx * 4 + 1];
    let x2 = validBoxes[idx * 4 + 2];
    let y2 = validBoxes[idx * 4 + 3];
    
    const width = x2 - x1;
    const height = y2 - y1;
    
    // Skip tiny boxes (proportional to canvas size)
    const minBoxSize = Math.min(canvasWidth, canvasHeight) * 0.02; // 2% of smaller dimension
    if (width < minBoxSize || height < minBoxSize) continue;
    
    // Flip horizontal if needed
    let x;
    if (flipX) {
      x = canvasWidth - x1 - width;
    } else {
      x = x1;
    }
    
    // Get label and color
    const klass = labels[classIdx] || `class_${classIdx}`;
    const color = colors.get(classIdx);
    const scorePercent = (score * 100).toFixed(1);
    
    // ✅ Draw box with thickness proportional to canvas
    const lineWidth = Math.max(2, Math.round(canvasWidth / 400));
    
    // Draw semi-transparent fill
    ctx.fillStyle = Colors.hexToRgba(color, 0.2);
    ctx.fillRect(x, y1, width, height);
    
    // Draw border
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(x, y1, width, height);
    
    // ✅ Calculate label size (proportional to canvas and box)
    const labelFontSize = Math.max(14, Math.min(24, canvasWidth / 50));
    const labelFont = `bold ${labelFontSize}pt sans-serif`;
    ctx.font = labelFont;
    
    const labelText = `${klass} - ${scorePercent}%`;
    const textWidth = ctx.measureText(labelText).width;
    const textHeight = labelFontSize + 4;
    const padding = 4;
    
    const yText = y1 - (textHeight + padding);
    const labelY = yText < 0 ? y1 + padding : yText;
    
    // Draw label background
    ctx.fillStyle = color;
    ctx.fillRect(
      x - 1, 
      labelY, 
      textWidth + padding * 2, 
      textHeight
    );
    
    // Draw label text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(labelText, x + padding - 1, labelY + 2);
    
    drawnCount++;
    detectionResults.push({
      label: klass,
      confidence: score,
      classIdx: classIdx
    });
  }

  ctx.flush();
  
  transposed.dispose();
  
  console.log(`[renderBoxes] Drew ${drawnCount} boxes`);
  
  return detectionResults;
};

/**
 * Simple Non-Maximum Suppression (in pixel space)
 */
function nonMaxSuppression(boxes, scores, iouThreshold = 0.45, maxBoxes = 15) {
  const numBoxes = scores.length;
  const indices = Array.from({ length: numBoxes }, (_, i) => i);
  
  // Sort by score descending
  indices.sort((a, b) => scores[b] - scores[a]);
  
  const keep = [];
  const suppressed = new Set();
  
  for (let i = 0; i < indices.length && keep.length < maxBoxes; i++) {
    const idx = indices[i];
    if (suppressed.has(idx)) continue;
    
    keep.push(idx);
    
    const box1 = {
      x1: boxes[idx * 4 + 0],
      y1: boxes[idx * 4 + 1],
      x2: boxes[idx * 4 + 2],
      y2: boxes[idx * 4 + 3]
    };
    
    for (let j = i + 1; j < indices.length; j++) {
      const idx2 = indices[j];
      if (suppressed.has(idx2)) continue;
      
      const box2 = {
        x1: boxes[idx2 * 4 + 0],
        y1: boxes[idx2 * 4 + 1],
        x2: boxes[idx2 * 4 + 2],
        y2: boxes[idx2 * 4 + 3]
      };
      
      const iou = calculateIoU(box1, box2);
      if (iou > iouThreshold) {
        suppressed.add(idx2);
      }
    }
  }
  
  return keep;
}

/**
 * Calculate IoU between two boxes (pixel coordinates)
 */
function calculateIoU(box1, box2) {
  const x1 = Math.max(box1.x1, box2.x1);
  const y1 = Math.max(box1.y1, box2.y1);
  const x2 = Math.min(box1.x2, box2.x2);
  const y2 = Math.min(box1.y2, box2.y2);
  
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  
  const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
  const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
  const union = area1 + area2 - intersection;
  
  return intersection / (union + 1e-6);
}