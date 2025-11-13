import * as SQLite from 'expo-sqlite';

// Open database
export const getDB = () => {
  try {
    const db = SQLite.openDatabase('rrsa_db.db');
    console.log('✅ Database opened successfully');
    return db;
  } catch (error) {
    console.error('❌ Failed to open database:', error.message);
    return null;
  }
};

// Initialize database and complaints table
export const initDB = () => {
  const db = getDB();
  if (!db) return;

  db.transaction(
    (tx) => {
      tx.executeSql(
        `CREATE TABLE IF NOT EXISTS complaints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          imageUri TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          location_name TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          detections TEXT,
          synced INTEGER DEFAULT 0
        );`
      );
    },
    (err) => console.error('❌ DB init error:', err),
    () => console.log('✅ DB initialized successfully')
  );
};

// Insert a new complaint locally
export const insertComplaint = ({ imageUri, latitude, longitude, location_name, timestamp, detections }) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    if (!db) {
      reject(new Error('Database not available'));
      return;
    }

    const detectionsStr = JSON.stringify(detections || []);
    
    console.log('[Database] ===== INSERT COMPLAINT DEBUG =====');
    console.log('[Database] Received detections:', detections);
    console.log('[Database] Detections type:', typeof detections);
    console.log('[Database] Detections is array:', Array.isArray(detections));
    console.log('[Database] Detections length:', detections?.length);
    console.log('[Database] Stringified detections preview:', detectionsStr.substring(0, 200));
    console.log('[Database] Full params:', {
      imageUri,
      latitude,
      longitude,
      location_name,
      timestamp,
      detectionsCount: detections?.length || 0
    });

    db.transaction(
      (tx) => {
        // ✅ FIXED: Column order matches values array order
        tx.executeSql(
          `INSERT INTO complaints (imageUri, latitude, longitude, location_name, timestamp, detections, synced) 
           VALUES (?, ?, ?, ?, ?, ?, 0);`,
          [imageUri, latitude, longitude, location_name, timestamp, detectionsStr],
          (_, result) => {
            console.log('✅ Complaint inserted successfully, ID:', result.insertId);
            
            // Verify insertion by reading back the row
            tx.executeSql(
              'SELECT * FROM complaints WHERE id = ?',
              [result.insertId],
              (_, { rows }) => {
                const insertedRow = rows._array[0];
                console.log('🔍 Verification - Inserted row:', {
                  id: insertedRow.id,
                  detectionsLength: insertedRow.detections?.length || 0,
                  detectionsPreview: insertedRow.detections?.substring(0, 100)
                });
              }
            );
            
            resolve(result.insertId);
          },
          (_, error) => {
            console.error('❌ Insert complaint failed:', error);
            reject(error);
            return false;
          }
        );
      },
      (err) => {
        console.error('❌ Transaction error:', err);
        reject(err);
      }
    );
  });
};

// Fetch all complaints
export const fetchComplaints = (callback) => {
  const db = getDB();
  if (!db) {
    console.error('❌ Database not available for fetchComplaints');
    callback([]);
    return;
  }

  db.transaction(
    (tx) => {
      tx.executeSql(
        `SELECT * FROM complaints ORDER BY timestamp DESC;`,
        [],
        (_, { rows }) => {
          console.log(`✅ Fetched ${rows.length} complaints from database`);
          
          // Parse detections JSON for each row
          const complaints = rows._array.map(row => {
            let parsedDetections = [];
            try {
              parsedDetections = row.detections ? JSON.parse(row.detections) : [];
            } catch (e) {
              console.warn(`⚠️ Failed to parse detections for complaint ${row.id}:`, e);
            }
            
            return {
              ...row,
              detections: parsedDetections
            };
          });
          
          console.log('📊 Complaints summary:', complaints.map(c => ({
            id: c.id,
            detectionsCount: c.detections?.length || 0,
            synced: c.synced
          })));
          
          callback(complaints);
        },
        (_, error) => {
          console.error('❌ Fetch complaints failed:', error);
          callback([]);
          return false;
        }
      );
    },
    (err) => {
      console.error('❌ Transaction error in fetchComplaints:', err);
      callback([]);
    }
  );
};

// Mark complaint as synced
export const markComplaintSynced = (id) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    if (!db) {
      reject(new Error('Database not available'));
      return;
    }

    db.transaction(
      (tx) => {
        tx.executeSql(
          `UPDATE complaints SET synced = 1 WHERE id = ?;`,
          [id],
          (_, result) => {
            console.log(`✅ Complaint ${id} marked as synced`);
            resolve(result);
          },
          (_, error) => {
            console.error('❌ Mark synced failed:', error);
            reject(error);
            return false;
          }
        );
      },
      (err) => {
        console.error('❌ Transaction error:', err);
        reject(err);
      }
    );
  });
};

// Fetch unsynced complaints
export const fetchUnsyncedComplaints = (callback) => {
  const db = getDB();
  if (!db) {
    console.error('❌ Database not available for fetchUnsyncedComplaints');
    callback([]);
    return;
  }

  db.transaction(
    (tx) => {
      tx.executeSql(
        `SELECT * FROM complaints WHERE synced = 0 ORDER BY timestamp DESC;`,
        [],
        (_, { rows }) => {
          console.log(`✅ Fetched ${rows.length} unsynced complaints`);
          
          // Parse detections JSON for each row
          const complaints = rows._array.map(row => {
            let parsedDetections = [];
            try {
              parsedDetections = row.detections ? JSON.parse(row.detections) : [];
            } catch (e) {
              console.warn(`⚠️ Failed to parse detections for complaint ${row.id}:`, e);
            }
            
            return {
              ...row,
              detections: parsedDetections
            };
          });
          
          callback(complaints);
        },
        (_, error) => {
          console.error('❌ Fetch unsynced complaints failed:', error);
          callback([]);
          return false;
        }
      );
    },
    (err) => {
      console.error('❌ Transaction error in fetchUnsyncedComplaints:', err);
      callback([]);
    }
  );
};

// Delete complaint by ID
export const deleteComplaint = (id) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    if (!db) {
      reject(new Error('Database not available'));
      return;
    }

    db.transaction(
      (tx) => {
        tx.executeSql(
          `DELETE FROM complaints WHERE id = ?;`,
          [id],
          (_, result) => {
            console.log(`✅ Complaint ${id} deleted`);
            resolve(result);
          },
          (_, error) => {
            console.error('❌ Delete complaint failed:', error);
            reject(error);
            return false;
          }
        );
      },
      (err) => {
        console.error('❌ Transaction error:', err);
        reject(err);
      }
    );
  });
};

// Get complaint count
export const getComplaintCount = (callback) => {
  const db = getDB();
  if (!db) {
    callback(0);
    return;
  }

  db.transaction(
    (tx) => {
      tx.executeSql(
        `SELECT COUNT(*) as count FROM complaints;`,
        [],
        (_, { rows }) => {
          const count = rows._array[0]?.count || 0;
          console.log(`✅ Total complaints: ${count}`);
          callback(count);
        },
        (_, error) => {
          console.error('❌ Get count failed:', error);
          callback(0);
          return false;
        }
      );
    }
  );
};

// Clear all complaints (for testing/debugging)
export const clearAllComplaints = () => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    if (!db) {
      reject(new Error('Database not available'));
      return;
    }

    db.transaction(
      (tx) => {
        tx.executeSql(
          `DELETE FROM complaints;`,
          [],
          (_, result) => {
            console.log('✅ All complaints cleared');
            resolve(result);
          },
          (_, error) => {
            console.error('❌ Clear complaints failed:', error);
            reject(error);
            return false;
          }
        );
      },
      (err) => {
        console.error('❌ Transaction error:', err);
        reject(err);
      }
    );
  });
};

export default {
  getDB,
  initDB,
  insertComplaint,
  fetchComplaints,
  markComplaintSynced,
  fetchUnsyncedComplaints,
  deleteComplaint,
  getComplaintCount,
  clearAllComplaints,
};