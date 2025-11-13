// App.js
import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import AppNavigator from "./navigation/AppNavigator"; // your navigator
import { initDB } from "./services/database"; // import your database initialization

export default function App() {
  useEffect(() => {
    // Initialize SQLite DB when app starts
    const setupDB = async () => {
      try {
        await initDB();
        console.log("✅ Database initialized on app start");
      } catch (error) {
        console.error("❌ Failed to initialize database on app start", error);
      }
    };

    setupDB();
  }, []);

  return (
    <View style={styles.container}>
      <AppNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});