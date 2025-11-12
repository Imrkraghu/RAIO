// screens/CameraScreenPersistent.js
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { Camera } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-react-native";
import * as FileSystem from "expo-file-system";
import { modelURI } from "../modelHandler";
import CameraView from "../CameraView";
import { useNavigation } from "@react-navigation/native";
import ViewShot from "react-native-view-shot";

export default function CameraScreenPersistent() {
  const navigation = useNavigation();
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraType, setCameraType] = useState(Camera.Constants.Type.back);
  const [model, setModel] = useState(null);
  const [inputTensorShape, setInputTensorShape] = useState(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const cameraRef = useRef(null);
  const viewShotRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    
    (async () => {
      console.log("[CameraScreen] Initializing...");
      
      // Request camera permissions
      const { status } = await Camera.requestCameraPermissionsAsync();
      console.log("[CameraScreen] Camera permission:", status);
      if (mounted) setHasPermission(status === "granted");

      // Initialize TensorFlow.js
      console.log("[CameraScreen] Initializing TensorFlow.js...");
      await tf.ready();
      console.log("[CameraScreen] TensorFlow.js ready");
      console.log("[CameraScreen] Backend:", tf.getBackend());

      // Load model
      console.log("[CameraScreen] Loading YOLOv11 model from:", modelURI);
      const yolov11 = await tf.loadGraphModel(modelURI, {
        onProgress: (f) => {
          console.log(`[CameraScreen] Model loading progress: ${(f * 100).toFixed(1)}%`);
          if (mounted) setLoadingProgress(f);
        },
      });

      console.log("[CameraScreen] Model loaded successfully");
      console.log("[CameraScreen] Model inputs:", yolov11.inputs);
      console.log("[CameraScreen] Model outputs:", yolov11.outputs);

      // Warm up model with dummy input
      console.log("[CameraScreen] Warming up model...");
      const dummyInput = tf.ones(yolov11.inputs[0].shape);
      const warmupStart = Date.now();
      await yolov11.execute(dummyInput);
      const warmupTime = Date.now() - warmupStart;
      console.log(`[CameraScreen] Model warmup completed in ${warmupTime}ms`);
      tf.dispose(dummyInput);

      if (mounted) {
        setModel(yolov11);
        setInputTensorShape(yolov11.inputs[0].shape);
        console.log("[CameraScreen] Model ready. Input shape:", yolov11.inputs[0].shape);
      }
    })();

    return () => {
      mounted = false;
      console.log("[CameraScreen] Component unmounting");
    };
  }, []);

  const handleCapture = async () => {
    console.log("[CameraScreen] Capture initiated");
    
    try {
      if (!viewShotRef.current) {
        console.error("[CameraScreen] ViewShot reference not available");
        Alert.alert("Error", "View reference not available.");
        return;
      }

      console.log("[CameraScreen] Capturing screenshot...");
      const uri = await viewShotRef.current.capture();
      console.log("[CameraScreen] Screenshot captured:", uri);

      // Ensure captures directory exists
      const targetDir = FileSystem.documentDirectory + "captures/";
      await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
      console.log("[CameraScreen] Target directory:", targetDir);

      // Save with timestamp
      const fileName = `capture_${Date.now()}.jpg`;
      const path = `${targetDir}${fileName}`;

      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(path, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      console.log("[CameraScreen] Image saved to:", path);

      // Capture detections from CameraView buffer
      let detections = [];
      let counts = {};
      if (cameraRef.current) {
        console.log("[CameraScreen] Capturing buffered detections...");
        const captureData = await cameraRef.current.captureBuffered();
        if (captureData?.detections) {
          detections = captureData.detections;
          counts = captureData.counts;
          console.log("[CameraScreen] Detections captured:", detections.length);
          console.log("[CameraScreen] Detection counts:", counts);
        }
      }

      const metadata = {
        timestamp: Date.now(),
        cameraType: cameraType === Camera.Constants.Type.back ? "back" : "front",
        originalUri: uri,
        detections,
        counts,
      };

      console.log("[CameraScreen] Navigating to Preview with metadata");
      navigation.navigate("Preview", { imageUri: path, metadata });
      
    } catch (err) {
      console.error("[CameraScreen] Capture error:", err);
      console.error(err.stack);
      Alert.alert("Error", "Failed to capture image: " + err.message);
    }
  };

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
        <Text>Camera permission denied!</Text>
        <Text style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
          Please enable camera access in settings
        </Text>
      </View>
    );
  }

  if (!model) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#32b8c6" />
        <Text style={{ marginTop: 10, fontSize: 16 }}>
          Loading YOLOv11 model...
        </Text>
        <Text style={{ marginTop: 5, fontSize: 14, color: "#666" }}>
          {(loadingProgress * 100).toFixed(0)}%
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
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
          config={{ threshold: 0.3 }} // ✅ Confidence threshold
        >
          <View style={styles.overlay}>
            {/* FPS Counter (optional) */}
            <View style={styles.fpsCounter}>
              <Text style={styles.fpsText}>YOLOv11 • 230 classes</Text>
            </View>

            {/* Flip Camera Button */}
            <TouchableOpacity
              style={styles.flipButton}
              onPress={() => {
                console.log("[CameraScreen] Flipping camera");
                setCameraType((prev) =>
                  prev === Camera.Constants.Type.back
                    ? Camera.Constants.Type.front
                    : Camera.Constants.Type.back
                );
              }}
            >
              <MaterialCommunityIcons name="camera-flip" size={30} color="white" />
              <Text style={styles.flipText}>Flip Camera</Text>
            </TouchableOpacity>

            {/* Capture Button */}
            <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
              <Text style={styles.captureText}>Capture</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </ViewShot>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center",
    backgroundColor: "#f5f5f5"
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
  fpsCounter: {
    position: "absolute",
    top: 50,
    left: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 8,
  },
  fpsText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  flipButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderWidth: 2,
    borderColor: "#fff",
    padding: 10,
    marginBottom: 12,
    borderRadius: 10,
  },
  flipText: { 
    color: "#fff", 
    fontSize: 16, 
    marginLeft: 8, 
    fontWeight: "600" 
  },
  captureButton: {
    backgroundColor: "#32b8c6",
    padding: 16,
    borderRadius: 50,
    marginBottom: 40,
    width: 120,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  captureText: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "700" 
  },
});