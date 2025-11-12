```markdown
# RoadNetApp - Road Anomaly Detection

A mobile application for detecting and reporting road anomalies using computer vision and mobile device capabilities.

## Features

- Real-time object detection for road anomalies
- GPS location tagging for each report
- Local database storage for offline operation
- Backend sync capability when online
- Complaint history with visualized detections
- Image preview with bounding boxes

## Technology Stack

- **Frontend**: React Native (Expo SDK 46)
- **Computer Vision**: TensorFlow.js (YOLOv5/v11 models)
- **Database**: SQLite (Expo SQLite)/postgres
- **Backend**: FastAPI (Python)
- **Networking**: Axios for API calls

## Installation

### Prerequisites
- Node.js (v16+)
- Expo CLI
- Python (for backend)
- FastAPI

### Setup
 ```
1. Clone the repository:
   ```
   git clone https://github.com/imrkraghu/RAIO.git
   cd yolov5
   ```
 ```
 ```
2. Install dependencies:
   ```
   yarn install
   ```

3. Start the Expo development server:
   ```
   expo start
   ```

4. For backend (FastAPI):
   ```
   pip install fastapi uvicorn
   uvicorn main:app --reload
   ```

## Usage

1. Open the app and grant camera and location permissions
2. Capture images of road anomalies
3. Review detections and submit reports
4. View complaint history with detection details
5. Reports are saved locally and synced to backend when online

## Database Schema

```
CREATE TABLE complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imageUri TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_name TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  detections TEXT,
  synced INTEGER DEFAULT 0
);
```

## API Endpoints

- `POST /complaints/` - Submit a new complaint
- `GET /complaints/` - Fetch all complaints

## Development Notes

- The app uses TensorFlow.js for on-device inference
- Detections are deduplicated within a 5-second window
- All data is stored locally first, then synced to backend
- The app handles network failures gracefully

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.
