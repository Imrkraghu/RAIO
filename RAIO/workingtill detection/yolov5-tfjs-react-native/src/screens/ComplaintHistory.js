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

  useEffect(() => {
    const loadComplaints = async () => {
      try {
        // Try fetching from backend first
        const backendPromise = axios.get(`${BASE_URL}/complaints/`, { timeout: 5000 });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Backend timeout')), 5000)
        );

        const response = await Promise.race([backendPromise, timeoutPromise]);

        if (response?.data) {
          console.log('✅ Complaints fetched from backend:', response.data);
          setComplaints(response.data.reverse());
        }
      } catch (error) {
        console.warn('⚠️ Backend not reachable or timed out, loading local complaints.', error.message);

        // Fallback: fetch local complaints
        fetchComplaints((data) => {
          if (Array.isArray(data)) {
            console.log('📥 Complaints fetched from local DB:', data);
            setComplaints(data.reverse());
          } else {
            console.warn('⚠️ Unexpected data format from local DB:', data);
          }
        });
      }
    };

    loadComplaints();

    // Handle Android back button
    const backAction = () => {
      navigation.navigate('Home'); // Navigate to Home on back
      return true; // Prevent default behavior
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    // Disable swipe back gesture on iOS / Android
    // navigation.setOptions({
    //   gestureEnabled: true, // Enable gesture back
    //   headerLeft: () => (
    //     <TouchableOpacity onPress={() => navigation.navigate('Home')} style={{ marginLeft: 15 }}>
    //       <Text style={{ color: '#007AFF', fontSize: 16 }}>Back</Text>
    //     </TouchableOpacity>
    //   ),
    // });

    return () => backHandler.remove();
  }, [navigation]);

  const renderItem = ({ item }) => {
    let anomalies = [];
    try {
      anomalies = item.detections ? JSON.parse(item.detections) : [];
    } catch {
      anomalies = [];
    }

    const originalWidth = 640;
    const originalHeight = 480;
    const previewHeight = 240;
    const previewWidth = (originalWidth / originalHeight) * previewHeight;
    const scaleX = previewWidth / originalWidth;
    const scaleY = previewHeight / originalHeight;

    const timestampValue = item.timestamp ? new Date(Number(item.timestamp)) : null;

    return (
      <View style={styles.card}>
        <TouchableOpacity onPress={() => setSelectedImage(item.imageUri)}>
          <View style={[styles.imageWrapper, { width: previewWidth, height: previewHeight }]}>
            <Image source={{ uri: item.imageUri }} style={styles.imagePreview} />
            {anomalies.map((a, index) => {
              if (!a.box || a.box.length !== 4) return null;
              const [x1, y1, x2, y2] = a.box;
              const width = x2 - x1;
              const height = y2 - y1;
              if (width <= 0 || height <= 0) return null;

              return (
                <View
                  key={index}
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
                  <Text style={styles.bboxLabel}>{a.label}</Text>
                </View>
              );
            })}
          </View>
        </TouchableOpacity>

        <Text style={styles.date}>
          {timestampValue ? timestampValue.toLocaleString() : 'No timestamp'}
        </Text>
        <Text style={styles.location}>
          📍 {item.location_name?.trim() || 'Unknown location'}
        </Text>
        <Text style={styles.coordinates}>🧭 Lat: {item.latitude}, Lng: {item.longitude}</Text>
        <Text style={styles.status}>
          Status: {item.synced ? 'Synced' : 'Pending'}
        </Text>
        <Text style={styles.detail}>
          Anomalies: {anomalies.length > 0 ? anomalies.map((a) => a.label).join(', ') : 'None'}
        </Text>
        <Text style={styles.description}>Tap image to view full size</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complaint History</Text>

      {complaints.length === 0 ? (
        <Text style={styles.emptyText}>No complaints found.</Text>
      ) : (
        <FlatList
          data={complaints}
          keyExtractor={(item) => item.id?.toString()}
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
            <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 40 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333' },
  emptyText: { fontSize: 16, textAlign: 'center', color: '#888', marginTop: 40 },
  list: { paddingHorizontal: 16 },
  card: { backgroundColor: '#f9f9f9', padding: 16, borderRadius: 10, marginBottom: 12, elevation: 2 },
  date: { fontSize: 14, color: '#666', marginTop: 8 },
  location: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  coordinates: { fontSize: 14, color: '#444', marginTop: 4 },
  status: { fontSize: 14, color: '#007AFF', marginTop: 4 },
  detail: { fontSize: 14, color: '#444', marginTop: 4 },
  description: { fontSize: 14, color: '#444', marginTop: 8 },
  imageWrapper: { position: 'relative', alignSelf: 'flex-start' },
  imagePreview: { width: '100%', height: '100%', borderRadius: 8, backgroundColor: '#ccc' },
  bbox: { position: 'absolute', borderWidth: 2, borderColor: '#FF4136', backgroundColor: 'rgba(255,65,54,0.2)', justifyContent: 'center', alignItems: 'center' },
  bboxLabel: { fontSize: 10, color: '#fff', backgroundColor: '#FF4136', paddingHorizontal: 4, paddingVertical: 2, position: 'absolute', top: -14, left: 0, borderRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: screen.width, height: screen.height, justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: screen.width * 0.9, height: screen.height * 0.7 },
});
