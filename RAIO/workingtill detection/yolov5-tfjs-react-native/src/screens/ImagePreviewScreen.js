// ImagePreviewScreen.js
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
  const [metadata, setMetadata] = useState(initialMetadata || { detections: [] });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [layoutWidth, setLayoutWidth] = useState(screenWidth);
  const [displayHeight, setDisplayHeight] = useState(screenWidth);

  // Ensure file:// prefix for local files
  if (imageUri && !imageUri.startsWith('file://')) {
    imageUri = 'file://' + imageUri;
  }

  // Get natural image size with mounted flag
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

  // Fetch location with mounted flag
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
        console.log('[ImagePreview] Location fetch cleanup');
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
        totalDetections: metadata?.detections?.length || 0,
        metadataPath: metadata?.metadataPath || '',
        timestamp: metadata?.timestamp || new Date().toISOString(),
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
        console.log('[ImagePreview] BackHandler cleanup');
      };
    }, [handleRecapture])
  );

  // Compute label counts
  const labelCounts = {};
  (metadata?.detections || []).forEach((det) => {
    if (labelCounts[det.label]) {
      labelCounts[det.label] += 1;
    } else {
      labelCounts[det.label] = 1;
    }
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Detection Preview</Text>

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

        <View style={styles.imageCard}>
          <View style={styles.imageWrapper} onLayout={onImageWrapperLayout}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: layoutWidth, height: displayHeight }}
              resizeMode="cover"
            />
            <View style={styles.imageBadge}>
              <Text style={styles.badgeText}>AI Analyzed</Text>
            </View>
          </View>
        </View>

        {Object.keys(labelCounts).length > 0 && (
          <View style={styles.detectionCard}>
            <Text style={styles.detectionTitle}>Detected Labels</Text>
            {Object.entries(labelCounts).map(([label, count], idx) => (
              <Text key={idx} style={styles.detectionLabelItem}>
                • {label} {count > 1 ? `(${count})` : ''}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.recaptureBtn]}
          onPress={handleRecapture}
        >
          <Text style={styles.buttonText}>Recapture</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.confirmBtn, locationLoading && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={locationLoading}
        >
          <Text style={styles.buttonText}>
            {locationLoading ? 'Getting Location...' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  scrollContent: { paddingBottom: 100 },
  title: { 
    color: '#fff', 
    fontSize: 22, 
    fontWeight: '600', 
    textAlign: 'center', 
    marginVertical: 16 
  },

  statusCard: {
    backgroundColor: '#1a3a1a',
    borderRadius: 8,
    padding: 12,
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
  statusLabel: { color: '#999', fontSize: 13, fontWeight: '600' },
  statusValue: { color: '#00ff00', fontSize: 13, fontWeight: '700' },

  imageCard: { marginBottom: 20 },
  imageWrapper: { position: 'relative', width: '100%' },
  imageBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  detectionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#32b8c6',
  },
  detectionTitle: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '700', 
    marginBottom: 8 
  },
  detectionLabelItem: { 
    color: '#fff', 
    fontSize: 14, 
    marginVertical: 2 
  },

  buttonRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  button: { 
    flex: 1, 
    paddingVertical: 16, 
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  recaptureBtn: { backgroundColor: '#666' },
  confirmBtn: { backgroundColor: '#32b8c6' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
