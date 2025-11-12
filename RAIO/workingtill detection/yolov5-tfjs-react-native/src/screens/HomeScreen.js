import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, BackHandler, Alert } from 'react-native';

export default function HomePage({ navigation, model }) {
  const isModelReady = !!model;

  useEffect(() => {
    // Disable Android hardware back button
    const backAction = () => {
      // Do nothing on back press
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    return () => backHandler.remove(); // Clean up on unmount
  }, []);

  useEffect(() => {
    // Disable swipe back gesture for iOS and Android
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => null, // Hide back button if any
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Road Reporter</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('Camera')}
      >
        <Text style={styles.buttonText}>Register Complaint</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('ComplaintHistory')}
      >
        <Text style={styles.buttonText}>Complaint History</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 40, color: '#333', textAlign: 'center' },
  button: { backgroundColor: '#000', paddingVertical: 14, paddingHorizontal: 30, borderRadius: 8, marginVertical: 10, width: '80%', alignItems: 'center', elevation: 3 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});