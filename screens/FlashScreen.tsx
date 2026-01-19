import React, { useEffect } from 'react';
import { View, StyleSheet, Image, ActivityIndicator} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../styles/Colors';
import { getToken, getUserId } from '../api/auth/authToken';

const FlashScreen = () => {
  const navigation = useNavigation();

  // Helper: Check if JWT token is expired
  const isTokenExpired = (token: string) => {
    try {
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payloadBase64));
      // exp is in seconds, Date.now() is in milliseconds
      return Date.now() / 1000 > decodedPayload.exp;
    } catch (e) {
      console.warn('Invalid token format:', e);
      return true; // treat invalid token as expired
    }
  };

  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const token = await getToken();
        const userId = await getUserId();
        const langId = await AsyncStorage.getItem('langId');
        const userObjStr = await AsyncStorage.getItem('userObj');
        const userObj = userObjStr ? JSON.parse(userObjStr) : null;
        const roleRaw = userObj?.role ?? null;
        const role = roleRaw ? String(roleRaw).toLowerCase() : null;

        console.log('FlashScreen check:', { token, role, userId, langId });

        const validToken = token && !isTokenExpired(token);

        setTimeout(() => {
          if (validToken && role && userId) {
            // Logged in previously — go to correct footer
            let routeName = 'Footer_C'; // default for employee
            if (role === 'admin') routeName = 'Footer_A';
            else if (role === 'superadmin') routeName = 'Footer_S';

            navigation.reset({
              index: 0,
              routes: [{ name: routeName as never, params: { userId, langId } as never }],
            });
          } else {
            // Token missing or expired → go to LanguageScreen
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
