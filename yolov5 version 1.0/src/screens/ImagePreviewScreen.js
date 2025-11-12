import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  BackHandler,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

const screenWidth = Dimensions.get('window').width;

export default function ImagePreviewScreen({ route }) {
  let { imageUri, metadata: initialMetadata } = route.params;
  const navigation = useNavigation();

  const [location, setLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [metadata, setMetadata] = useState(initialMetadata || { detections: [], counts: {} });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [layoutWidth, setLayoutWidth] = useState(screenWidth);
  const [displayHeight, setDisplayHeight] = useState(screenWidth);

  // Ensure file:// prefix for local files
  if (imageUri && !imageUri.startsWith('file://')) {
    imageUri = 'file://' + imageUri;
  }

  console.log('[ImagePreview] Received metadata:', metadata);
  console.log('[ImagePreview] Total detections:', metadata?.detections?.length || 0);
  console.log('[ImagePreview] Detection counts:', metadata?.counts || {});

  // Get natural image size
  useEffect(() => {
    let mounted = true;
    
    if (!imageUri) return;
    
    Image.getSize(
      imageUri,
      (w, h) => {
        if (mounted) {
          setNaturalSize({ width: w, height: h });
        }
      },
      (err) => console.warn('[ImagePreview] Image.getSize failed:', err)
    );

    return () => {
      mounted = false;
    };
  }, [imageUri]);

  // Recompute display height
  useEffect(() => {
    if (naturalSize.width > 0 && layoutWidth > 0) {
      const h = Math.round((layoutWidth * naturalSize.height) / naturalSize.width);
      setDisplayHeight(h);
    }
  }, [naturalSize, layoutWidth]);

  // Fetch location
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      
      (async () => {
        try {
          console.log('[ImagePreview] Fetching location...');
          if (mounted) setLocationLoading(true);
          
          const { status } = await Location.requestForegroundPermissionsAsync();
          console.log('[ImagePreview] Location permission:', status);
          
          if (!mounted) return;
          
          if (status !== 'granted') {
            setLocationLoading(false);
            return;
          }
          
          const loc = await Location.getCurrentPositionAsync({});
          
          if (!mounted) return;
          
          setLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
          });
          setLocationLoading(false);
          
          console.log('[ImagePreview] Location obtained:', loc.coords.latitude, loc.coords.longitude);
        } catch (err) {
          console.warn('[ImagePreview] Location fetch error:', err);
          if (mounted) {
            setLocationLoading(false);
          }
        }
      })();

      return () => {
        mounted = false;
      };
    }, [])
  );

  const onImageWrapperLayout = (e) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== layoutWidth) setLayoutWidth(w);
  };

  const handleRecapture = useCallback(async () => {
    try {
      console.log('[ImagePreview] Recapture - deleting image:', imageUri);
      if (imageUri) {
        await FileSystem.deleteAsync(imageUri, { idempotent: true });
      }
    } catch (err) {
      console.warn('[ImagePreview] Failed to delete image:', err);
    }
    navigation.reset({ index: 0, routes: [{ name: 'Camera' }] });
  }, [imageUri, navigation]);

  const proceedToComplaint = useCallback(
    (latitude, longitude) => {
      console.log('[ImagePreview] Proceeding to Complaint screen');
      navigation.navigate('Complaint', {
        imageUri,
        imageWithBoxesUri: imageUri,
        latitude,
        longitude,
        detections: metadata?.detections || [],
        totalDetections: metadata?.totalDetections || metadata?.detections?.length || 0,
        counts: metadata?.counts || {},
        metadataPath: metadata?.metadataPath || '',
        timestamp: metadata?.timestampISO || new Date().toISOString(),
        success: true,
      });
    },
    [imageUri, metadata, navigation]
  );

  const handleConfirm = useCallback(() => {
    if (!location) {
      Alert.alert('Location Required', 'Please enable location services to continue.', [
        { text: 'Retry', onPress: handleConfirm },
        {
          text: 'Skip Location',
          onPress: () => proceedToComplaint(null, null),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    proceedToComplaint(location.latitude, location.longitude);
  }, [location, proceedToComplaint]);

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        console.log('[ImagePreview] Hardware back button pressed');
        handleRecapture();
        return true;
      };
      
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      
      return () => {
        sub.remove();
      };
    }, [handleRecapture])
  );

  // ✅ Get unique class names (no counts)
  const uniqueLabels = Object.keys(metadata?.counts || {}).sort(); // Alphabetically sorted
  const totalDetections = metadata?.totalDetections || metadata?.detections?.length || 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Preview</Text>

        {/* GPS Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>📍 GPS Location</Text>
            <Text style={styles.statusValue}>
              {location
                ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                : locationLoading
                ? '⏳ Fetching...'
                : '⚠️ Unavailable'}
            </Text>
          </View>
        </View>

        {/* Image Card */}
        <View style={styles.imageCard}>
          <View style={styles.imageWrapper} onLayout={onImageWrapperLayout}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: layoutWidth, height: displayHeight }}
              resizeMode="cover"
            />
            <View style={styles.imageBadge}>
              <Text style={styles.badgeText}>✅ AI Analyzed</Text>
            </View>
          </View>
        </View>

        {/* ✅ Unique Detections Card - Only Class Names */}
        {uniqueLabels.length > 0 && (
          <View style={styles.detectionCard}>
            <Text style={styles.detectionTitle}>📊 Detected Objects</Text>
            <View style={styles.chipContainer}>
              {uniqueLabels.map((label, idx) => (
                <View key={idx} style={styles.labelChip}>
                  <Text style={styles.chipText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* No Detections Message */}
        {totalDetections === 0 && (
          <View style={styles.noDetectionCard}>
            <Text style={styles.noDetectionText}>ℹ️ No objects detected in this image</Text>
            <Text style={styles.noDetectionSubtext}>
              Try recapturing with better lighting or positioning
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.recaptureBtn]}
          onPress={handleRecapture}
        >
          <Text style={styles.buttonText}>🔄 Recapture</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.confirmBtn, locationLoading && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={locationLoading}
        >
          <Text style={styles.buttonText}>
            {locationLoading ? '⏳ Getting Location...' : '✓ Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  scrollContent: { paddingBottom: 100 },
  title: { 
    color: '#fff', 
    fontSize: 24, 
    fontWeight: '700', 
    textAlign: 'center', 
    marginVertical: 20,
    letterSpacing: 0.5,
  },

  statusCard: {
    backgroundColor: '#1a2a1a',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#00ff00',
  },
  statusRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  statusLabel: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  statusValue: { color: '#00ff00', fontSize: 13, fontWeight: '700' },

  imageCard: { marginBottom: 20 },
  imageWrapper: { position: 'relative', width: '100%' },
  imageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#32b8c6',
  },
  badgeText: { color: '#32b8c6', fontSize: 11, fontWeight: '700' },

  // ✅ Updated styles for chip-based display
  detectionCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#32b8c6',
  },
  detectionTitle: { 
    color: '#32b8c6', 
    fontSize: 16, 
    fontWeight: '700', 
    marginBottom: 12 
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  labelChip: {
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#32b8c6',
  },
  chipText: {
    color: '#32b8c6',
    fontSize: 13,
    fontWeight: '600',
  },

  noDetectionCard: {
    backgroundColor: '#2a2a1a',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#665500',
    alignItems: 'center',
  },
  noDetectionText: {
    color: '#ffcc00',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  noDetectionSubtext: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
  },

  buttonRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  button: { 
    flex: 1, 
    paddingVertical: 16, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  recaptureBtn: { backgroundColor: '#555' },
  confirmBtn: { backgroundColor: '#32b8c6' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});