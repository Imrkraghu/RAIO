import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { fetchComplaints } from '../services/database';
import axios from 'axios';

const screen = Dimensions.get('window');
const BASE_URL = 'http://192.168.1.200:8000'; // Backend URL

export default function ComplaintHistoryScreen() {
  const navigation = useNavigation();
  const [complaints, setComplaints] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadComplaints = async () => {
      setLoading(true);
      
      try {
        // Try fetching from backend first
        console.log('🔄 Attempting to fetch from backend...');
        const response = await axios.get(`${BASE_URL}/complaints/`, { timeout: 3000 });

        if (response?.data && Array.isArray(response.data)) {
          console.log('✅ Complaints fetched from backend:', response.data.length);
          setComplaints(response.data.reverse());
          setLoading(false);
          return;
        }
      } catch (error) {
        console.warn('⚠️ Backend not reachable, loading local complaints.', error.message);
      }

      // Fallback: fetch local complaints
      fetchComplaints((data) => {
        if (Array.isArray(data)) {
          console.log('📥 Complaints fetched from local DB:', data.length);
          console.log('📊 Detection counts:', data.map(c => ({
            id: c.id,
            detectionsCount: c.detections?.length || 0
          })));
          setComplaints(data);
        } else {
          console.warn('⚠️ Unexpected data format from local DB:', typeof data);
          setComplaints([]);
        }
        setLoading(false);
      });
    };

    loadComplaints();

    // Handle Android back button
    const backAction = () => {
      navigation.navigate('Home');
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove();
  }, [navigation]);

  const renderItem = ({ item }) => {
    // ✅ FIXED: detections is already parsed by fetchComplaints
    const detections = Array.isArray(item.detections) ? item.detections : [];
    
    console.log(`📋 Rendering complaint ${item.id}:`, {
      detectionsCount: detections.length,
      detections: detections.map(d => d.label)
    });

    // Image dimensions for preview
    const originalWidth = 640;
    const originalHeight = 480;
    const previewHeight = 240;
    const previewWidth = (originalWidth / originalHeight) * previewHeight;
    const scaleX = previewWidth / originalWidth;
    const scaleY = previewHeight / originalHeight;

    // Parse timestamp
    let timestampValue;
    try {
      // Handle both ISO string and numeric timestamp
      const ts = item.timestamp;
      if (typeof ts === 'string' && ts.includes('T')) {
        timestampValue = new Date(ts);
      } else if (typeof ts === 'string' && ts.includes('E')) {
        // Scientific notation like "1.762901446104E12"
        timestampValue = new Date(parseFloat(ts));
      } else {
        timestampValue = new Date(Number(ts));
      }
    } catch (e) {
      console.warn(`⚠️ Invalid timestamp for complaint ${item.id}:`, item.timestamp);
      timestampValue = new Date();
    }

    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => setSelectedImage(item.imageUri)}>
          <View style={[styles.imageWrapper, { width: previewWidth, height: previewHeight }]}>
            <Image 
              source={{ uri: item.imageUri }} 
              style={styles.imagePreview}
              onError={(e) => console.warn('Image load error:', e.nativeEvent.error)}
            />
            
            {/* Render bounding boxes if they exist */}
            {detections.map((detection, index) => {
              // Only render if box coordinates exist
              if (!detection.box || !Array.isArray(detection.box) || detection.box.length !== 4) {
                return null;
              }

              const [x1, y1, x2, y2] = detection.box;
              const width = x2 - x1;
              const height = y2 - y1;

              if (width <= 0 || height <= 0) return null;

              return (
                <View
                  key={`${item.id}-${index}`}
                  style={[
                    styles.bbox,
                    {
                      left: x1 * scaleX,
                      top: y1 * scaleY,
                      width: width * scaleX,
                      height: height * scaleY,
                    },
                  ]}
                >
                  <Text style={styles.bboxLabel}>
                    {detection.label} {detection.confidence ? `${(detection.confidence * 100).toFixed(0)}%` : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <Text style={styles.date}>
            📅 {timestampValue.toLocaleDateString()} {timestampValue.toLocaleTimeString()}
          </Text>
          
          <Text style={styles.location}>
            📍 {item.location_name?.trim() || 'Unknown location'}
          </Text>
          
          <Text style={styles.coordinates}>
            🧭 {item.latitude?.toFixed(6)}, {item.longitude?.toFixed(6)}
          </Text>
          
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, item.synced ? styles.syncedBadge : styles.pendingBadge]}>
              <Text style={styles.statusText}>
                {item.synced ? '✓ Synced' : '⏳ Pending'}
              </Text>
            </View>
            
            <View style={styles.detectionsBadge}>
              <Text style={styles.detectionsText}>
                🔍 {detections.length} detection{detections.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {detections.length > 0 && (
            <View style={styles.detectionsContainer}>
              <Text style={styles.detectionsTitle}>Detected Anomalies:</Text>
              {detections.map((detection, idx) => (
                <View key={idx} style={styles.detectionItem}>
                  <Text style={styles.detectionLabel}>
                    • {detection.label}
                  </Text>
                  {detection.confidence && (
                    <Text style={styles.detectionConfidence}>
                      {(detection.confidence * 100).toFixed(1)}%
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.tapHint}>Tap image to view full size</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading complaints...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complaint History</Text>

      {complaints.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No complaints found.</Text>
          <Text style={styles.emptyHint}>Captured complaints will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalContainer}
            onPress={() => setSelectedImage(null)}
            activeOpacity={1}
          >
            <Image 
              source={{ uri: selectedImage }} 
              style={styles.fullImage} 
              resizeMode="contain" 
            />
            <Text style={styles.closeHint}>Tap to close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5f5f5', 
    paddingTop: 40 
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  title: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginBottom: 20, 
    color: '#333',
    paddingHorizontal: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: { 
    fontSize: 18, 
    textAlign: 'center', 
    color: '#666', 
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    textAlign: 'center',
    color: '#999',
  },
  list: { 
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    marginBottom: 16, 
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  imageWrapper: { 
    position: 'relative', 
    alignSelf: 'center',
    marginTop: 12,
  },
  imagePreview: { 
    width: '100%', 
    height: '100%', 
    borderRadius: 8, 
    backgroundColor: '#eee',
  },
  bbox: { 
    position: 'absolute', 
    borderWidth: 2, 
    borderColor: '#FF4136', 
    backgroundColor: 'rgba(255,65,54,0.15)', 
  },
  bboxLabel: { 
    fontSize: 10, 
    color: '#fff', 
    backgroundColor: '#FF4136', 
    paddingHorizontal: 4, 
    paddingVertical: 2, 
    position: 'absolute', 
    top: -16, 
    left: 0, 
    borderRadius: 3,
    fontWeight: '600',
  },
  infoContainer: {
    padding: 16,
  },
  date: { 
    fontSize: 14, 
    color: '#666', 
    marginBottom: 8,
  },
  location: { 
    fontSize: 15, 
    fontWeight: '600', 
    marginBottom: 4,
    color: '#333',
  },
  coordinates: { 
    fontSize: 13, 
    color: '#666', 
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  syncedBadge: {
    backgroundColor: '#E8F5E9',
  },
  pendingBadge: {
    backgroundColor: '#FFF3E0',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detectionsBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E3F2FD',
  },
  detectionsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976D2',
  },
  detectionsContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  detectionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  detectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detectionLabel: {
    fontSize: 13,
    color: '#444',
    flex: 1,
  },
  detectionConfidence: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 8,
  },
  tapHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.9)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  modalContainer: { 
    width: screen.width, 
    height: screen.height, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  fullImage: { 
    width: screen.width * 0.95, 
    height: screen.height * 0.8,
  },
  closeHint: {
    color: '#fff',
    fontSize: 14,
    marginTop: 20,
    opacity: 0.7,
  },
});
