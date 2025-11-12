import * as tf from '@tensorflow/tfjs';
import { bundleResourceIO } from '@tensorflow/tfjs-react-native';
import * as jpeg from 'jpeg-js';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

// Load model assets using static require
const modelJson = require('../assets/model/model.json');
const modelBin = require('../assets/model/merged.bin');

// Load labels from JSON and convert to array
const rawLabels = require('../assets/model/labels.json').names;
const LABELS = Object.keys(rawLabels)
  .sort((a, b) => parseInt(a) - parseInt(b))
  .map(key => rawLabels[key]);

let modelInstance = null;

// Road class ID from your labels (index 111 = "Road")
const ROAD_CLASS_ID = 111;
const INPUT_SIZE = 640;

// Initialize TensorFlow
export async function initTensorFlow() {
  await tf.ready();
  console.log('[+] TensorFlow ready');
}

// Load Model using bundleResourceIO
export async function loadModel() {
  if (modelInstance) return modelInstance;

  await initTensorFlow();

  console.log('[+] Loading model using bundleResourceIO');
  const model = await tf.loadGraphModel(bundleResourceIO(modelJson, modelBin));

  modelInstance = model;
  console.log('[+] Model loaded');
  return model;
}

// Convert image URI to tensor
export async function uriToTensor(imageUri) {
  const manipResult = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: 640, height: 640 } }],
    { base64: true }
  );

  console.log('[debug] manipulateAsync result:', {
    uri: manipResult.uri,
    width: manipResult.width,
    height: manipResult.height,
    hasBase64: !!manipResult.base64,
  });

  const rawImageData = Buffer.from(manipResult.base64, 'base64');
  const { width, height, data } = jpeg.decode(rawImageData, true);

  console.log('[debug] jpeg.decode ->', { width, height, dataLength: data.length });

  const rgbData = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    rgbData[j++] = data[i];
    rgbData[j++] = data[i + 1];
    rgbData[j++] = data[i + 2];
  }

  const tensor = tf.tensor3d(rgbData, [height, width, 3], 'int32')
    .div(tf.scalar(255))
    .expandDims(0);

  const stats = await tf.tidy(() => {
    const t = tensor;
    const min = t.min().arraySync();
    const max = t.max().arraySync();
    const sample = t.slice([0, 0, 0, 0], [1, 2, 2, 3]).arraySync();
    return { min, max, sample };
  });
  console.log('[debug] imageTensor stats:', stats);

  return tensor;
}

// Helpers
function softmax(arr) {
  const max = Math.max(...arr);
  const exps = arr.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / sum);
}

function cxcywhToXYXY(box) {
  const [cx, cy, w, h] = box;
  const isNormalized = Math.max(cx, cy, w, h) <= 1.01;
  const scale = isNormalized ? INPUT_SIZE : 1;
  const cxS = cx * scale;
  const cyS = cy * scale;
  const wS = w * scale;
  const hS = h * scale;
  let x1 = cxS - wS / 2;
  let y1 = cyS - hS / 2;
  let x2 = cxS + wS / 2;
  let y2 = cyS + hS / 2;
  x1 = Math.max(0, Math.min(INPUT_SIZE, x1));
  y1 = Math.max(0, Math.min(INPUT_SIZE, y1));
  x2 = Math.max(0, Math.min(INPUT_SIZE, x2));
  y2 = Math.max(0, Math.min(INPUT_SIZE, y2));
  return [x1, y1, x2, y2];
}

// Save annotated image metadata to disk
export async function saveAnnotationMetadata(detections, roadDetections, imageUri) {
  try {
    const timestamp = Date.now();
    const fileName = `annotation_${timestamp}.json`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;

    const metadata = {
      fileName,
      timestamp: new Date().toISOString(),
      originalImageUri: imageUri,
      detections: detections.map(d => ({
        label: d.label,
        confidence: d.confidence,
        box: d.box,
        classId: d.classId,
      })),
      roadDetections: roadDetections.map(d => ({
        label: d.label,
        confidence: d.confidence,
        box: d.box,
        classId: d.classId,
      })),
      totalDetections: detections.length + roadDetections.length,
      totalAnomalies: detections.length,
    };

    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(metadata, null, 2));
    console.log('[+] ✅ Annotation metadata saved:', filePath);
    return filePath;
  } catch (err) {
    console.error('[-] Failed to save annotation metadata:', err);
    return null;
  }
}

// Run inference and return detections (NO annotation - done in UI)
export async function detectAndAnnotate(imageUri, confThreshold = 0.25, iouThreshold = 0.45) {
  console.log('[+] detectAndAnnotate start with imageUri:', imageUri);
  const model = await loadModel();
  const imageTensor = await uriToTensor(imageUri);

  try {
    if (model.inputs && model.inputs.length) {
      console.log('[debug] model.inputs:', model.inputs.map(i => ({ name: i.name, shape: i.shape, dtype: i.dtype })));
    }
  } catch (e) {
    console.warn('[debug] error reading model.inputs', e);
  }

  console.log('[+] Running inference...');
  const output = await model.execute(imageTensor);

  let tensor;
  if (Array.isArray(output)) {
    console.log('[debug] Output is array of', output.length, 'tensors');
    tensor = output[0];
    if (output.length > 1) output.slice(1).forEach(t => t.dispose());
  } else {
    console.log('[debug] Output is single tensor');
    tensor = output;
  }

  if (!tensor) {
    console.error('[!] model output tensor is undefined');
    imageTensor.dispose();
    return { detections: [], roadDetected: false, annotatedUri: imageUri, success: false };
  }

  console.log('[debug] tensor shape:', tensor.shape);
  console.log('[debug] tensor dtype:', tensor.dtype);

  const raw = await tensor.data();
  console.log('[debug] raw output length:', raw.length);

  const shape = tensor.shape;
  console.log('[debug] tensor.shape full:', shape);

  let features = 0, boxesCount = 0;
  if (shape.length === 3) {
    features = shape[1];
    boxesCount = shape[2];
  } else if (shape.length === 2) {
    features = shape[0];
    boxesCount = shape[1];
  } else {
    console.error('[!] Unexpected tensor shape:', shape);
    imageTensor.dispose();
    tensor.dispose();
    return { detections: [], roadDetected: false, annotatedUri: imageUri, success: false };
  }
  console.log('[debug] parsed shape ->', { features, boxesCount });

  console.log('[debug] raw sample (first 40):', Array.from(raw.slice(0, Math.min(40, raw.length))));

  const outputArray = Array.from(raw);

  const reshaped = tf.tensor(outputArray, [features, boxesCount]);
  const transposed = reshaped.transpose();

  const full = await transposed.array();
  console.log('[debug] full rows count (boxes):', full.length);
  if (full.length === 0) {
    imageTensor.dispose();
    reshaped.dispose();
    transposed.dispose();
    tensor.dispose?.();
    console.log('[!] No detections at all');
    return { detections: [], roadDetected: false, annotatedUri: imageUri, success: false };
  }

  console.log('[debug] first row (first 16 values):', full[0].slice(0, 16));

  const boxData = full.map(row => row.slice(0, 4));
  const classData = full.map(row => row.slice(4));

  const modelNumClasses = classData[0].length;
  console.log('[debug] modelNumClasses:', modelNumClasses, 'labelsCount:', LABELS.length);
  if (LABELS.length < modelNumClasses) {
    console.warn('[warn] LABELS shorter than modelNumClasses — padding labels to avoid undefined');
    while (LABELS.length < modelNumClasses) LABELS.push(`Class_${LABELS.length}`);
  }

  const sampleVec = classData[0].slice(0, Math.min(6, classData[0].length));
  const looksLikeLogits = sampleVec.some(v => v > 1.001);
  console.log('[debug] sample class vector slice:', sampleVec, 'looksLikeLogits:', looksLikeLogits);

  const probs = classData.map(vec => (looksLikeLogits ? softmax(vec) : vec));

  const classIds = probs.map(p => {
    let maxIdx = 0;
    let maxV = p[0] ?? -Infinity;
    for (let i = 1; i < p.length; i++) {
      if (p[i] > maxV) { maxV = p[i]; maxIdx = i; }
    }
    return maxIdx;
  });
  const confidences = probs.map((p, i) => p[classIds[i]]);

  console.log('[debug] first 20 classIds:', classIds.slice(0, 20));
  console.log('[debug] first 20 confidences (prob):', confidences.slice(0, 20).map(v => parseFloat((v).toFixed(6))));

  const convertedBoxes = boxData.map(b => cxcywhToXYXY(b));
  console.log('[debug] first 10 converted boxes:', convertedBoxes.slice(0, 10));

  const paired = confidences.map((conf, i) => ({
    conf,
    box: convertedBoxes[i],
    classId: classIds[i],
    rawBox: boxData[i],
    classVectorLength: classData[i].length,
  }));

  console.log('[debug] total raw detections (before filter):', paired.length);

  const filtered = paired.filter(p => p.conf > confThreshold);
  console.log('[debug] detections after confThreshold', confThreshold, ':', filtered.length);

  const roadDetections = filtered.filter(d => d.classId === ROAD_CLASS_ID);
  console.log('[+] Road detections found:', roadDetections.length);

  if (roadDetections.length === 0) {
    console.warn('[!] ⚠️ NO ROAD DETECTED - Stopping further processing');

    imageTensor.dispose();
    reshaped.dispose();
    transposed.dispose();
    tensor.dispose?.();

    return {
      detections: [],
      roadDetected: false,
      annotatedUri: imageUri,
      success: false,
      message: 'No road detected in the image',
    };
  }

  console.log('[+] ✅ Road detected! Proceeding with anomaly detection...');

  filtered.slice(0, 6).forEach((f, idx) => {
    console.log(
      `[debug] filtered[${idx}] labelIdx=${f.classId} label=${LABELS[f.classId]} conf=${f.conf.toFixed(
        6
      )} rawBox=${f.rawBox
        .slice(0, 6)
        .map(v => Number(v.toFixed ? v.toFixed(6) : v))} converted=${f.box.map(v =>
        Math.round(v)
      )}`
    );
  });

  const boxesXYXY = filtered.map(d => d.box);
  const scores = filtered.map(d => d.conf);

  console.log('[debug] NMS input boxes sample:', boxesXYXY.slice(0, 6));
  console.log(
    '[debug] NMS input scores sample:',
    scores.slice(0, 6).map(s => parseFloat(s.toFixed(6)))
  );

  const indices = await tf.image.nonMaxSuppressionAsync(
    tf.tensor2d(boxesXYXY),
    tf.tensor1d(scores),
    100,
    iouThreshold,
    confThreshold
  );

  const selected = await indices.array();
  console.log('[debug] selected indices after NMS:', selected);

  const detections = selected.map(i => {
    const c = filtered[i];
    return {
      label: LABELS[c.classId] || `Class_${c.classId}`,
      confidence: parseFloat(c.conf.toFixed(6)),
      box: c.box.map(v => Math.round(v)),
      classId: c.classId,
    };
  });

  const roadDets = detections.filter(d => d.classId === ROAD_CLASS_ID);
  const anomalyDets = detections.filter(d => d.classId !== ROAD_CLASS_ID);

  console.log('[debug] final detections (count):', detections.length);
  console.log('[+] Road detections (after NMS):', roadDets.length);
  console.log('[+] Anomaly detections:', anomalyDets.length);

  detections.forEach((d, idx) => {
    console.log(`[debug] det[${idx}]`, {
      label: d.label,
      
      confidence: d.confidence,
      box: d.box,
      classId: d.classId,
    }); 
  });

  imageTensor.dispose();
  reshaped.dispose();
  transposed.dispose();
  tensor.dispose?.();
  indices.dispose?.();

  console.log(
    `[+] Final detections: ${detections.length} (Road: ${roadDets.length}, Anomalies: ${anomalyDets.length})`
  );

  const metadataPath = await saveAnnotationMetadata(anomalyDets, roadDets, imageUri);

  return {
    detections: anomalyDets,
    roadDetected: true,
    roadDetections: roadDets,
    allDetections: detections,
    annotatedUri: imageUri,
    metadataPath,
    success: true,
    message: `Road detected with ${anomalyDets.length} anomalies`,
  };
}

// Legacy run inference
export async function runInference(imageUri, confThreshold = 0.25, iouThreshold = 0.45) {
  const result = await detectAndAnnotate(imageUri, confThreshold, iouThreshold);
  return {
    detections: result.detections,
    roadDetected: result.roadDetected,
    success: result.success,
    metadataPath: result.metadataPath,
    width: INPUT_SIZE,
    height: INPUT_SIZE,
  };
}