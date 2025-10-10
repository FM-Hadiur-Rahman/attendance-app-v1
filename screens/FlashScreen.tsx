import React, { useEffect } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import colors from '../styles/Colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const FlashScreen = () => {
  const navigation = useNavigation();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate('LanguageScreen' as never);
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/icons/logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      
      <View style={styles.spinnerWrapper}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    </View>
  );
};

export default FlashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondary,
    position: 'relative',
  },
  logo: {
    alignSelf: 'center',
    marginTop: '60%', 
    width: 143,
    height: 83,
  },
  spinnerWrapper: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center', 
  },
});
