import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { Camera } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-react-native";
import * as FileSystem from "expo-file-system";
import { modelURI } from "../modelHandler";
import CameraView from "../CameraView";
import { useNavigation } from "@react-navigation/native";
import ViewShot from "react-native-view-shot";
import labels from "../../assets/my/model/labels.json";

const CameraScreenPersistent = () => {
  const navigation = useNavigation();
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraType, setCameraType] = useState(Camera.Constants.Type.back);
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState({ loading: true, progress: 0 });
  const [inputTensorShape, setInputTensorShape] = useState([]);

  const cameraRef = useRef(null);
  const viewShotRef = useRef(null);

  const configurations = { threshold: 0.3, iouThreshold: 0.45 };

  useEffect(() => {
    let mounted = true;
    (async () => {
      console.log("[CameraScreenPersistent] Requesting camera permission...");
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (mounted) setHasPermission(status === "granted");
      if (status !== "granted") {
        Alert.alert("Camera access denied", "Please enable camera permission in settings.");
        return;
      }

      console.log("[CameraScreenPersistent] Initializing TensorFlow...");
      await tf.ready();
      console.log("[CameraScreenPersistent] TensorFlow ready, backend:", tf.getBackend());

      console.log("[CameraScreenPersistent] Loading model:", modelURI);
      try {
        const yolovModel = await tf.loadGraphModel(modelURI, {
          onProgress: (fraction) => {
            if (mounted) setLoading({ loading: true, progress: fraction });
            console.log(`[CameraScreenPersistent] Loading progress: ${(fraction * 100).toFixed(1)}%`);
          },
        });

        console.log("[CameraScreenPersistent] Model loaded successfully");
        console.log("[CameraScreenPersistent] Model inputs:", yolovModel.inputs);
        console.log("[CameraScreenPersistent] Model outputs:", yolovModel.outputs);

        // Warmup the model
        console.log("[CameraScreenPersistent] Warming up model...");
        const dummyInput = tf.ones(yolovModel.inputs[0].shape);
        const start = Date.now();
        await yolovModel.executeAsync(dummyInput);
        tf.dispose(dummyInput);
        console.log(`[CameraScreenPersistent] Warmup completed in ${Date.now() - start}ms`);

        if (mounted) {
          setModel(yolovModel);
          setInputTensorShape(yolovModel.inputs[0].shape);
          setLoading({ loading: false, progress: 1 });
          console.log("[CameraScreenPersistent] Model ready. Input shape:", yolovModel.inputs[0].shape);
        }
      } catch (err) {
        console.error("[CameraScreenPersistent] Model loading failed:", err);
        Alert.alert("Error", "Failed to load model: " + err.message);
      }
    })();

    return () => {
      mounted = false;
      console.log("[CameraScreenPersistent] Component unmounting");
    };
  }, []);

  const handleCapture = async () => {
    console.log("[CameraScreenPersistent] Capture initiated");
    
    try {
      if (!viewShotRef.current) {
        console.error("[CameraScreenPersistent] ViewShot reference not available");
        Alert.alert("Error", "View reference not available.");
        return;
      }

      if (!cameraRef.current) {
        console.error("[CameraScreenPersistent] CameraView reference not available");
        Alert.alert("Error", "Camera reference not available.");
        return;
      }

      console.log("[CameraScreenPersistent] Capturing buffered detections...");
      
      // ✅ Capture detections from buffer
      const captureData = await cameraRef.current.captureBuffered();
      
      let detections = [];
      let counts = {};
      
      if (captureData?.detections) {
        detections = captureData.detections;
        counts = captureData.counts;
        console.log("[CameraScreenPersistent] Detections captured:", detections.length);
        console.log("[CameraScreenPersistent] Detection counts:", counts);
      } else {
        console.warn("[CameraScreenPersistent] No detections in buffer");
      }

      console.log("[CameraScreenPersistent] Capturing screenshot...");
      const uri = await viewShotRef.current.capture();
      console.log("[CameraScreenPersistent] Screenshot captured:", uri);

      // Ensure captures directory exists
      const targetDir = FileSystem.documentDirectory + "captures/";
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      console.log("[CameraScreenPersistent] Target directory:", targetDir);

      // Save with timestamp
      const fileName = `capture_${Date.now()}.jpg`;
      const path = `${targetDir}${fileName}`;

      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(path, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log("[CameraScreenPersistent] Image saved to:", path);

      // ✅ Metadata
      const metadata = {
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),
        cameraType: cameraType === Camera.Constants.Type.back ? "back" : "front",
        originalUri: uri,
        detections: detections,
        counts: counts,
        totalDetections: detections.length,
        uniqueLabels: Object.keys(counts).length,
        modelInfo: {
          threshold: configurations.threshold,
          iouThreshold: configurations.iouThreshold,
          inputShape: inputTensorShape,
        },
      };

      console.log("[CameraScreenPersistent] Navigating to Preview with metadata");
      
      navigation.navigate("Preview", { 
        imageUri: path, 
        metadata: metadata 
      });
      
    } catch (err) {
      console.error("[CameraScreenPersistent] Capture error:", err);
      Alert.alert("Error", "Failed to capture image: " + err.message);
    }
  };

  // ======================
  // RENDER
  // ======================
  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#000" />
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Camera permission denied!</Text>
        <Text style={styles.subText}>Please enable camera access in settings</Text>
      </View>
    );
  }

  if (loading.loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#32b8c6" />
        <Text style={styles.loadText}>Loading YOLO model...</Text>
        <Text style={styles.progressText}>{(loading.progress * 100).toFixed(1)}%</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <ViewShot
        ref={viewShotRef}
        options={{ format: "jpg", quality: 0.9, result: "tmpfile" }}
        style={{ flex: 1 }}
      >
        <CameraView
          ref={cameraRef}
          type={cameraType}
          model={model}
          inputTensorSize={inputTensorShape}
          config={configurations}
          labels={labels}
        >
          <View style={styles.overlay}>
            <View style={styles.modelStatus}>
              <Text style={styles.modelStatusText}>✅ YOLOv5 Ready • {labels.length} classes</Text>
            </View>

            {/* Circular Shutter Button */}
            <TouchableOpacity style={styles.captureOuter} onPress={handleCapture}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </ViewShot>
      <StatusBar style="light" />
    </View>
  );
};

export default CameraScreenPersistent;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  errorText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ff3333",
  },
  subText: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
  },
  loadText: {
    fontSize: 16,
    color: "#333",
    marginTop: 8,
  },
  progressText: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
  },
  overlay: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "transparent",
    zIndex: 20,
  },
  modelStatus: {
    position: "absolute",
    top: 50,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 8,
  },
  modelStatusText: {
    color: "#00ff88",
    fontSize: 12,
    fontWeight: "600",
  },
  captureOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 5,
    borderColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowColor: "#00bcd4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  captureInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#32b8c6",
  },
});