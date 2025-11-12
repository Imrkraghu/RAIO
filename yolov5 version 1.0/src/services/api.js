import axios from 'axios';

const BASE_URL = 'http://192.168.1.200:8000';

export const getImageURI = (path) => `${BASE_URL}/${path}`;

/**
 * Upload complaint to backend with timeout.
 * Throws error if upload fails - caller handles local save fallback.
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
  
  // ✅ FIXED: Ensure anomalies is always an array
  const anomaliesArray = Array.isArray(anomalies) ? anomalies : [];
  formData.append('anomalies', JSON.stringify(anomaliesArray));

  console.log('📦 [API] Upload payload:', {
    image: imageMeta.name,
    latitude,
    longitude,
    timestamp,
    location_name,
    anomaliesCount: anomaliesArray.length,
    anomaliesPreview: JSON.stringify(anomaliesArray).substring(0, 200)
  });

  try {
    const response = await axios.post(`${BASE_URL}/complaints/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 5000, // 5 seconds
    });

    console.log('✅ [API] Upload successful:', {
      status: response.status,
      data: response.data
    });
    
    return { 
      success: true, 
      backend: true, 
      data: response.data 
    };
  } catch (error) {
    // Log detailed error information
    if (error.response) {
      console.error('❌ [API] Backend error response:', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      console.error('❌ [API] No response from backend (timeout or network issue)');
    } else {
      console.error('❌ [API] Request setup error:', error.message);
    }
    
    // Re-throw to let caller handle (ImagePreviewScreen will save locally)
    throw error;
  }
};

/**
 * Fetch complaints from backend
 */
export async function get_complaints(callback) {
  try {
    console.log('📥 [API] Fetching complaints from backend...');
    
    const response = await axios.get(`${BASE_URL}/complaints/`, { 
      timeout: 5000 
    });
    
    console.log('✅ [API] Complaints fetched:', {
      count: response.data?.length || 0
    });
    
    callback(response.data || []);
  } catch (error) {
    if (error.response) {
      console.error('❌ [API] Backend error:', error.response.status);
    } else if (error.request) {
      console.error('❌ [API] No response from backend');
    } else {
      console.error('❌ [API] Request error:', error.message);
    }
    
    console.warn('⚠️ [API] Returning empty array due to fetch failure');
    callback([]);
  }
}

/**
 * Sync a local complaint to backend
 * Used for retry logic when initially failed
 */
export const syncComplaint = async (complaint) => {
  try {
    console.log('🔄 [API] Syncing complaint to backend:', complaint.id);
    
    const result = await uploadReport({
      imageUri: complaint.imageUri,
      latitude: complaint.latitude,
      longitude: complaint.longitude,
      timestamp: complaint.timestamp,
      location_name: complaint.location_name,
      anomalies: complaint.detections || [], // Map detections to anomalies
    });
    
    console.log('✅ [API] Complaint synced successfully:', complaint.id);
    return result;
  } catch (error) {
    console.error('❌ [API] Sync failed for complaint:', complaint.id, error.message);
    throw error;
  }
};

export default {
  getImageURI,
  uploadReport,
  get_complaints,
  syncComplaint,
};