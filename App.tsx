import { NavigationContainer,   } from '@react-navigation/native';
import React from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { StackNavigator } from './navigator/StackNavigator';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right','bottom']}>
        <NavigationContainer>
          <StatusBar barStyle="dark-content" />
          <StackNavigator />
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff', 
  },
});
