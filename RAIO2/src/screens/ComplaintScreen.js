import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { useNavigation } from '@react-navigation/native';
import { uploadReport } from '../services/api';
import { insertComplaint } from '../services/database';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;
const horizontalPadding = 32;
const maxPreviewHeight = 300;
const TIME_FRAME_MS = 5000; // 5 seconds

export default function ImagePreviewScreen({ route }) {
  const navigation = useNavigation();
  let { imageUri, latitude, longitude } = route.params;

  const [metadata, setMetadata] = useState({
    detections: route.params.detections || [],
    timestamp: route.params.timestamp,
  });
  const [imageSize, setImageSize] = useState({ width: 640, height: 640 });
  const [locationName, setLocationName] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [timestamp] = useState(metadata?.timestamp || new Date().toISOString());

  if (imageUri && !imageUri.startsWith('file://')) imageUri = 'file://' + imageUri;

  // Get image natural size with cleanup
  useEffect(() => {
    let mounted = true;
    
    if (imageUri) {
      Image.getSize(
        imageUri,
        (width, height) => {
          if (mounted) setImageSize({ width, height });
        },
        () => {
          if (mounted) setImageSize({ width: 640, height: 640 });
        }
      );
    }

    return () => {
      mounted = false;
    };
  }, [imageUri]);

  // Fetch human-readable location name with cleanup
  useEffect(() => {
    let mounted = true;
    
    const fetchLocationName = async () => {
      if (!latitude || !longitude) {
        if (mounted) setLocationName('Coordinates missing');
        return;
      }
      
      try {
        console.log('[ImagePreview] Fetching location name...');
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'RRSA-MobileApp/1.0 rohit.hanuai@gmail.com' },
        });
        const data = await response.json();
        
        if (mounted) {
          setLocationName(data?.display_name || 'Unknown location');
          console.log('[ImagePreview] Location name:', data?.display_name);
        }
      } catch (error) {
        console.warn('[ImagePreview] Location fetch error:', error);
        if (mounted) setLocationName('Unknown location');
      }
    };
    
    fetchLocationName();

    return () => {
      mounted = false;
    };
  }, [latitude, longitude]);

  const handleRecapture = useCallback(async () => {
    try {
      console.log('[ImagePreview] Recapture - deleting image:', imageUri);
      if (imageUri) await FileSystem.deleteAsync(imageUri, { idempotent: true });
    } catch (err) {
      console.warn('[ImagePreview] Failed to delete image:', err);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Camera' }] });
  }, [imageUri, navigation]);

  // Deduplicate detections within 5-second window
  const deduplicateDetections = (detections) => {
    const result = [];
    const lastSeen = {};

    detections.forEach((det) => {
      const last = lastSeen[det.label];
      if (!last || det.timestamp - last > TIME_FRAME_MS) {
        result.push(det);
        lastSeen[det.label] = det.timestamp;
      }
    });

    console.log(`[ImagePreview] Deduplicated ${detections.length} → ${result.length} detections`);
    return result;
  };

  const deduplicatedDetections = deduplicateDetections(metadata.detections || []);
  const labelCounts = {};
  deduplicatedDetections.forEach((det) => {
    labelCounts[det.label] = (labelCounts[det.label] || 0) + 1;
  });
  const uniqueLabels = Object.keys(labelCounts);

  const normalizedDetections = deduplicatedDetections.map(det => ({
    label: det.label,
    confidence: parseFloat((det.confidence || 1).toFixed(6)),
    timestamp: det.timestamp,
  }));

  const handleSubmit = async () => {
    if (uploading) return;
    
    console.log('[ImagePreview] Submit initiated');
    setUploading(true);

    try {
      let localUri = imageUri;
      if (!localUri) {
        throw new Error('No image URI provided');
      }

      // Ensure local file exists
      if (localUri.startsWith('http')) {
        console.log('[ImagePreview] Downloading remote image...');
        const fileName = localUri.split('/').pop().split('?')[0] || `image_${Date.now()}.jpg`;
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.downloadAsync(localUri, fileUri);
        localUri = fileUri;
        console.log('[ImagePreview] Downloaded to:', localUri);
      }

      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(localUri);
      if (!fileInfo.exists) {
        throw new Error('Image file does not exist');
      }

      console.log('[ImagePreview] Inserting to local database...');
      console.log('[ImagePreview] Data:', {
        imageUri: localUri,
        latitude,
        longitude,
        timestamp,
        location_name: locationName,
        detections: normalizedDetections.length,
      });

      // 1️⃣ Insert to local DB first (FIXED SQL)
      await insertComplaint({
        imageUri: localUri,
        latitude,
        longitude,
        timestamp,
        location_name: locationName,
        detections: normalizedDetections,
      });

      console.log('[ImagePreview] ✅ Local DB insert successful');

      // 2️⃣ Attempt backend upload (fail silently if it errors)
      try {
        console.log('[ImagePreview] Uploading to backend...');
        await uploadReport({
          imageUri: localUri,
          latitude,
          longitude,
          timestamp,
          location_name: locationName,
          anomalies: normalizedDetections,
        });
        console.log('[ImagePreview] ✅ Backend upload successful');
      } catch (err) {
        console.log('[ImagePreview] ⚠️ Backend upload failed (data saved locally):', err.message);
        // Don't throw - continue to success screen
      }

      setUploading(false);
      console.log('[ImagePreview] Navigating to success screen');
      navigation.replace('ComplaintSuccess');
      
    } catch (err) {
      console.error('[ImagePreview] ❌ Submit error:', err.message || err);
      setUploading(false);
      
      Alert.alert(
        'Submission Failed',
        `Could not save complaint: ${err.message || 'Unknown error'}`,
        [
          { text: 'Retry', onPress: handleSubmit },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  // Compute container size preserving aspect ratio
  const aspectRatio = imageSize.width / imageSize.height;
  let containerWidth = screenWidth - horizontalPadding;
  let containerHeight = containerWidth / aspectRatio;
  if (containerHeight > maxPreviewHeight) {
    containerHeight = maxPreviewHeight;
    containerWidth = maxPreviewHeight * aspectRatio;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Detection Preview</Text>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => setPreviewVisible(true)}
        style={[styles.imageWrapper, { width: containerWidth, height: containerHeight }]}
      >
        <Image
          source={{ uri: imageUri }}
          style={{ width: containerWidth, height: containerHeight, borderRadius: 12 }}
          resizeMode="contain"
        />
      </TouchableOpacity>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryTitle}>📊 Analysis Summary</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Latitude</Text>
          <Text style={styles.value}>{latitude?.toFixed(6) || 'Unavailable'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Longitude</Text>
          <Text style={styles.value}>{longitude?.toFixed(6) || 'Unavailable'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Location Name</Text>
          <Text style={styles.value} numberOfLines={2}>{locationName || 'Fetching...'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Unique Labels</Text>
          <Text style={styles.value}>{uniqueLabels.length}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Timestamp</Text>
          <Text style={styles.value}>{new Date(timestamp).toLocaleString()}</Text>
        </View>
      </View>

      {uniqueLabels.length > 0 && (
        <View style={styles.detectionsList}>
          <Text style={styles.listTitle}>🔍 Detected Labels</Text>
          {uniqueLabels.map((label, idx) => (
            <Text key={idx} style={styles.detectionLabel}>
              • {label} ({labelCounts[label]} detection{labelCounts[label] > 1 ? 's' : ''})
            </Text>
          ))}
        </View>
      )}

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.cancelButton]} 
          onPress={handleRecapture}
          disabled={uploading}
        >
          <Text style={styles.buttonTextCancel}>Recapture</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.submitButton, uploading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Submit Report</Text>
          )}
        </TouchableOpacity>
      </View>

      {previewVisible && (
        <View style={styles.previewOverlay}>
          <TouchableOpacity 
            style={styles.previewOverlay} 
            onPress={() => setPreviewVisible(false)}
            activeOpacity={1}
          >
            <Image 
              source={{ uri: imageUri }} 
              style={styles.previewImage} 
              resizeMode="contain" 
            />
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { padding: 16, paddingBottom: 32 },
  title: { 
    fontSize: 22, 
    fontWeight: '700', 
    marginBottom: 16, 
    color: '#000', 
    textAlign: 'center' 
  },
  imageWrapper: {
    position: 'relative',
    marginBottom: 24,
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    backgroundColor: '#eaeaea',
    overflow: 'hidden',
  },
  summaryBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#000', 
    marginBottom: 12 
  },
  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 10, 
    borderBottomWidth: 0.5, 
    borderColor: '#ddd' 
  },
  label: { 
    fontWeight: '600', 
    fontSize: 14, 
    color: '#555', 
    flex: 1 
  },
  value: { 
    fontSize: 14, 
    color: '#007AFF', 
    fontWeight: '600', 
    flex: 1, 
    textAlign: 'right' 
  },
  detectionsList: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 16, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  listTitle: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#000', 
    marginBottom: 12 
  },
  detectionLabel: { 
    fontSize: 13, 
    fontWeight: '500', 
    color: '#333', 
    marginVertical: 2 
  },
  buttonContainer: { 
    flexDirection: 'row', 
    gap: 12, 
    marginTop: 16 
  },
  button: { 
    flex: 1, 
    paddingVertical: 14, 
    borderRadius: 8, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  cancelButton: { 
    backgroundColor: '#e0e0e0', 
    borderWidth: 1, 
    borderColor: '#999' 
  },
  submitButton: { 
    backgroundColor: '#007AFF' 
  },
  buttonDisabled: { 
    opacity: 0.6 
  },
  buttonText: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#fff' 
  },
  buttonTextCancel: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: '#333' 
  },
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  previewImage: { 
    width: '90%', 
    height: '90%', 
    borderRadius: 12 
  },
});