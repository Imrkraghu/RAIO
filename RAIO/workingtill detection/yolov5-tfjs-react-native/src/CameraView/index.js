// CameraView/index.js
import { useState, useRef, useImperativeHandle, forwardRef, useEffect } from "react";
import { View } from "react-native";
import { Camera, CameraType } from "expo-camera";
import { GLView } from "expo-gl";
import Expo2DContext from "expo-2d-context";
import * as tf from "@tensorflow/tfjs";
import { cameraWithTensors } from "@tensorflow/tfjs-react-native";
import { preprocess } from "../utils/preprocess";
import { renderBoxes } from "../utils/renderBox";

const TensorCamera = cameraWithTensors(Camera);

const CameraView = forwardRef(({ type, model, inputTensorSize, config, children }, ref) => {
  const [ctx, setCTX] = useState(null);
  const [isDetecting, setIsDetecting] = useState(true);
  const [isMounted, setIsMounted] = useState(true); // ✅ Track component mount state
  
  const glViewRef = useRef(null);
  const detectionBufferRef = useRef([]);
  const lastFrameTimeRef = useRef(0);
  const frameCountRef = useRef(0);
  const rafIdRef = useRef(null);
  const timeoutIdRef = useRef(null);
  const isRunningRef = useRef(true);
  const streamRef = useRef(null); // ✅ Store camera stream reference

  const typesMapper = { back: CameraType.back, front: CameraType.front };
  const bufferWindow = 5000;
  const frameInterval = 150;

  // ✅ Cleanup on unmount - STOP tensor requests
  useEffect(() => {
    console.log("[CameraView] Component mounted");
    setIsMounted(true);
    isRunningRef.current = true;

    return () => {
      console.log("[CameraView] Component unmounting - STOPPING TENSOR REQUESTS");
      setIsMounted(false);
      isRunningRef.current = false;
      
      // Cancel any pending animation frames
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      
      // Clear any pending timeouts
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      
      // Clear detection buffer
      detectionBufferRef.current = [];
      
      // Stop camera stream
      if (streamRef.current) {
        console.log("[CameraView] Stopping camera stream");
        streamRef.current = null;
      }
      
      console.log("[CameraView] Cleanup complete - tensors stopped");
    };
  }, []);

  // ✅ Pause detection when navigating away
  useEffect(() => {
    if (!isMounted) {
      console.log("[CameraView] Not mounted - stopping detection");
      setIsDetecting(false);
      isRunningRef.current = false;
    }
  }, [isMounted]);

  // Allow parent to capture recent detections
  const captureBuffered = async () => {
    console.log("[CameraView] captureBuffered called");
    setIsDetecting(false);
    isRunningRef.current = false;
    
    // Cancel ongoing operations
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    
    await new Promise((r) => setTimeout(r, 200));

    const now = Date.now();
    const relevant = detectionBufferRef.current.filter(
      (d) => now - d.timestamp <= bufferWindow
    );
    const counts = {};
    relevant.forEach(({ label }) => (counts[label] = (counts[label] || 0) + 1));

    console.log(`[captureBuffered] Captured ${relevant.length} detections from buffer`);
    console.log(`[captureBuffered] Counts:`, counts);

    const capturedData = {
      detections: relevant,
      counts,
      timestamp: new Date().toISOString()
    };

    // Clear buffer after capture
    detectionBufferRef.current = [];
    
    // ✅ DO NOT resume detection - let parent navigate away
    console.log("[captureBuffered] Detection stopped, ready for navigation");

    return capturedData;
  };

  useImperativeHandle(ref, () => ({ captureBuffered }));

  // Main camera stream callback with proper cleanup
  const handleCameraStream = (images) => {
    console.log("[CameraView] Camera stream ready, starting detection loop");
    
    // ✅ Store stream reference for cleanup
    streamRef.current = images;
    
    // Reset state
    isRunningRef.current = true;
    frameCountRef.current = 0;
    lastFrameTimeRef.current = Date.now();
    
    let frameSkipCounter = 0;

    const loop = () => {
      // ✅ CRITICAL: Check if component is still mounted and should continue
      if (!isRunningRef.current || !isDetecting || !ctx || !isMounted) {
        console.log("[CameraView] Loop stopped - mounted:", isMounted, "running:", isRunningRef.current, "detecting:", isDetecting, "ctx:", !!ctx);
        
        // Clean up any pending operations
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        if (timeoutIdRef.current) {
          clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }
        
        return;
      }

      const now = Date.now();
      const timeSinceLastFrame = now - lastFrameTimeRef.current;

      // Frame throttling
      if (timeSinceLastFrame < frameInterval) {
        frameSkipCounter++;
        rafIdRef.current = requestAnimationFrame(loop);
        return;
      }

      lastFrameTimeRef.current = now;
      frameCountRef.current++;

      // Log FPS every 30 frames
      if (frameCountRef.current % 30 === 0) {
        const fps = 1000 / timeSinceLastFrame;
        console.log(`[CameraView] FPS: ${fps.toFixed(1)} | Skipped: ${frameSkipCounter} | Tensors: ${tf.memory().numTensors}`);
        frameSkipCounter = 0;
      }

      const startTime = Date.now();
      tf.engine().startScope();

      try {
        // ✅ Check if we should still process this frame
        if (!isRunningRef.current || !isMounted) {
          tf.engine().endScope();
          return;
        }

        // Get next camera frame
        const imageTensor = images.next().value;
        if (!imageTensor) {
          console.warn("[CameraView] No image tensor available");
          tf.engine().endScope();
          
          // Only continue if still mounted
          if (isRunningRef.current && isMounted) {
            rafIdRef.current = requestAnimationFrame(loop);
          }
          return;
        }

        // Preprocess image
        const [inputTensor, xRatio, yRatio] = preprocess(imageTensor, 640, 640);

        // Run model inference
        const inferenceStart = Date.now();
        const outputs = model.execute(inputTensor);
        const inferenceTime = Date.now() - inferenceStart;

        // Render boxes on canvas
        const detections = renderBoxes(ctx, outputs, config.threshold || 0.3, [xRatio, yRatio]);

        // Store detections in buffer (only if still mounted)
        if (isMounted) {
          detections.forEach((det) => {
            detectionBufferRef.current.push({
              timestamp: Date.now(),
              label: det.label,
              confidence: det.confidence,
              bbox: det.bbox,
            });
          });

          // Clean old detections
          const bufferCutoff = Date.now() - bufferWindow;
          detectionBufferRef.current = detectionBufferRef.current.filter(
            (d) => d.timestamp > bufferCutoff
          );
        }

        // Clean up tensors
        if (Array.isArray(outputs)) {
          outputs.forEach((t) => t?.dispose?.());
        } else {
          outputs?.dispose?.();
        }
        
        tf.dispose([inputTensor, imageTensor]);

        const totalTime = Date.now() - startTime;
        
        // Log every 10 frames
        if (frameCountRef.current % 10 === 0) {
          console.log(`[CameraView] Frame ${frameCountRef.current}: ${totalTime}ms (inference: ${inferenceTime}ms) | Boxes: ${detections.length}`);
        }

      } catch (error) {
        console.error("[CameraView] Detection error:", error.message);
        console.error(error.stack);
      }

      tf.engine().endScope();

      // ✅ Schedule next frame ONLY if still mounted and running
      if (isRunningRef.current && isMounted && isDetecting) {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, frameInterval - elapsed);
        
        timeoutIdRef.current = setTimeout(() => {
          if (isRunningRef.current && isMounted) {
            rafIdRef.current = requestAnimationFrame(loop);
          }
        }, delay);
      }
    };

    // Start the loop
    loop();
  };

  return (
    <>
      {ctx && isMounted && (
        <TensorCamera
          type={typesMapper[type]}
          resizeHeight={inputTensorSize[1]}
          resizeWidth={inputTensorSize[2]}
          resizeDepth={3}
          autorender
          onReady={handleCameraStream}
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        />
      )}

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "transparent",
          zIndex: 10,
        }}
      >
        <GLView
          ref={glViewRef}
          style={{ width: "100%", height: "100%" }}
          onContextCreate={async (gl) => {
            if (!isMounted) {
              console.log("[CameraView] Component unmounted, skipping GLView init");
              return;
            }
            
            console.log("[CameraView] Initializing GLView context");
            const ctx2d = new Expo2DContext(gl);
            await ctx2d.initializeText();
            console.log("[CameraView] GLView context ready");
            
            if (isMounted) {
              setCTX(ctx2d);
            }
          }}
        />
      </View>

      {children}
    </>
  );
});

export default CameraView;