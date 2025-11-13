import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  BackHandler,
} from 'react-native';

export default function HomePage({ navigation, model }) {
  const isModelReady = !!model;

  useEffect(() => {
    const backAction = () => true; // Disable Android back button
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => null,
    });
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Logo Section */}
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/company.jpeg')} // <-- your uploaded logo
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Welcome Text */}
      <Text style={styles.title}>Welcome to HanuAI Road Reporter</Text>
      <Text style={styles.subtitle}>Road reporting made simple </Text>

      {/* Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Camera')}
        >
          <Text style={styles.buttonText}>Register Complaint</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ComplaintHistory')}
        >
          <Text style={styles.buttonText}>Complaint History</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Decorative Images */}
      <Image
        source={require('../../assets/Product.jpeg')} // replace with your image
        style={[styles.decorImage, { left: 10, bottom: 20 }]}
        resizeMode="contain"
      />
      <Image
        source={require('../../assets/Product.jpeg')} // replace with your image
        style={[styles.decorImage, { right: 10, bottom: 20 }]}
        resizeMode="contain"
      />

      {/* {!isModelReady && (
        <Text style={styles.loadingText}>⏳ Loading model, please wait...</Text>
      )} */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    width: 200,
    height: 80,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0078D7',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#444',
    textAlign: 'center',
    marginBottom: 40,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
  },
  button: {
    width: '85%',
    paddingVertical: 15,
    borderRadius: 12,
    marginVertical: 10,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 5,
  },
  primaryButton: {
    backgroundColor: '#FF7A00',
  },
  secondaryButton: {
    backgroundColor: '#0078D7',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  decorImage: {
    position: 'absolute',
    width: 90,
    height: 90,
    opacity: 0.85,
  },
  loadingText: {
    marginTop: 15,
    color: '#555',
    fontSize: 14,
  },
});