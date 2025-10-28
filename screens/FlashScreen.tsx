import React, { useEffect } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../styles/Colors';
import { getToken } from '../api/auth/authToken';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const FlashScreen = () => {
  const navigation = useNavigation();

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const token = await getToken();
        const userObjStr = await AsyncStorage.getItem('userObj');
        const userObj = userObjStr ? JSON.parse(userObjStr) : null;
        const roleRaw = userObj?.role ?? null;
        const role = roleRaw ? String(roleRaw).toLowerCase() : null; // ✅ normalize to lowercase

        console.log('FlashScreen check:', { token, role });

        setTimeout(() => {
          if (token && role) {
            // ✅ Logged in previously — go to correct footer
            let routeName = 'Footer_C'; // default for employee
            if (role === 'admin') routeName = 'Footer_A';
            else if (role === 'superadmin') routeName = 'Footer_S';

            navigation.reset({
              index: 0,
              routes: [{ name: routeName as never }],
            });
          } else {
            // 🚪 No token → go to LanguageScreen
            navigation.reset({
              index: 0,
              routes: [{ name: 'LanguageScreen' as never }],
            });
          }
        }, 2000);
      } catch (e) {
        console.warn('Error checking login status:', e);
        navigation.reset({
          index: 0,
          routes: [{ name: 'LanguageScreen' as never }],
        });
      }
    };

    checkLoginStatus();
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