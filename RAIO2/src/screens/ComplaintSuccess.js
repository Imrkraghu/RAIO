import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, BackHandler } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function ComplaintSuccessScreen() {
  const navigation = useNavigation();

  const handleGoHome = () => {
    navigation.navigate('Home');
  };

  const handleGoHistory = () => {
    navigation.navigate('ComplaintHistory');
  };

  useEffect(() => {
    // Override Android hardware back button
    const backAction = () => {
      navigation.navigate('Home'); // Go to Home instead of previous screen
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);

    // Disable swipe back gesture on iOS / Android
    navigation.setOptions({
      gestureEnabled: false,
      headerLeft: () => null,
    });

    return () => backHandler.remove();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/success.png')} // Ensure this image exists
        style={styles.image}
      />
      <Text style={styles.title}>Complaint Registered</Text>
      <Text style={styles.subtitle}>
        Your report has been successfully submitted and synced. Thank you for helping improve road safety!
      </Text>

      <TouchableOpacity style={styles.button} onPress={handleGoHome}>
        <Text style={styles.buttonText}>Go to Home</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleGoHistory}>
        <Text style={styles.buttonText}>Check History</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  image: {
    width: 120,
    height: 120,
    marginBottom: 30,
  },
  title: {
    fontSize: 24,
    marginBottom: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: 'black',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginVertical: 10,
    width: '80%',
    alignItems: 'center',
    elevation: 3,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
