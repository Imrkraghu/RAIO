import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Screens
import HomeScreen from '../screens/HomeScreen';
import CameraScreen from '../screens/CameraScreen';
// import UploadScreen from '../screens/UploadScreen';
// import ResultScreen from '../screens/ResultScreen';
import ImagePreviewScreen from '../screens/ImagePreviewScreen';
import ComplaintHistoryScreen from '../screens/ComplaintHistory';
import ComplaintSuccessScreen from '../screens/ComplaintSuccess';
import ComplaintScreen from '../screens/ComplaintScreen';
 

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Camera" component={CameraScreen} />
        <Stack.Screen name="Preview" component={ImagePreviewScreen} />
        <Stack.Screen name="Complaint" component={ComplaintScreen} />
        {/*<Stack.Screen name="Upload" component={UploadScreen} />
        <Stack.Screen name="Result" component={ResultScreen} />*/}
        <Stack.Screen name="ComplaintHistory" component={ComplaintHistoryScreen} />
        <Stack.Screen name="ComplaintSuccess" component={ComplaintSuccessScreen} /> 
      </Stack.Navigator>
    </NavigationContainer>
  );
}