import axios from 'axios';
import { insertComplaint } from '../services/database'; // make sure this function exists to save locally

const BASE_URL = 'http://192.168.1.200:8000';

export const getImageURI = (path) => `${BASE_URL}/${path}`;

/**
 * Upload complaint to backend with 5-second timeout.
 * If backend fails or times out, save locally.
 */
export const uploadReport = async ({ imageUri, latitude, longitude, timestamp, location_name, anomalies }) => {
  const formData = new FormData();

  const imageMeta = {
    uri: imageUri,
    name: `road_${Date.now()}.jpg`,
    type: 'image/jpeg',
  };

  formData.append('image', imageMeta);
  formData.append('latitude', parseFloat(latitude));
  formData.append('longitude', parseFloat(longitude));
  formData.append('timestamp', timestamp);
  formData.append('location_name', location_name || '');
  formData.append('anomalies', JSON.stringify(anomalies || []));

  console.log('📦 Upload payload:', {
    image: imageMeta,
    latitude,
    longitude,
    timestamp,
    location_name,
    anomalies,
  });

  try {
    // Timeout set to 5000ms = 5 seconds
    const response = await axios.post(`${BASE_URL}/complaints/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 2000,
    });

    console.log('✅ Upload successful:', response.data);
    return { success: true, backend: true, data: response.data };
  } catch (error) {
    console.warn('⚠️ Backend upload failed or timed out, saving locally.', error.message);

    try {
      await insertComplaint({
        imageUri,
        latitude,
        longitude,
        timestamp,
        location_name,
        anomalies,
        synced: 0,
      });
      console.log('💾 Complaint saved locally.');
    } catch (localError) {
      console.error('❌ Failed to save complaint locally:', localError.message);
    }

    return { success: false, backend: false, local: true };
  }
};

/**
 * Fetch complaints from backend
 */
export async function get_complaints(callback) {
  try {
    const response = await axios.get(`${BASE_URL}/complaints/`, { timeout: 2000 });
    console.log('✅ Complaints fetched:', response.data);
    callback(response.data);
  } catch (error) {
    console.warn('⚠️ Failed to fetch complaints from backend, returning empty array.', error.message);
    callback([]);
  }
}