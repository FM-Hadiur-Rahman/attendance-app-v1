import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  BackHandler,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import HomeScreen from '../screens/customer/main/HomeScreen';
import ProfileScreen from '../screens/customer/main/ProfileScreen';
import WorkHistoryScreen from '../screens/customer/main/WorkHistoryScreen';
import colors from '../styles/Colors';
import ScheduleScreen from '../screens/customer/main/ScheduleScreen';
import Toast from 'react-native-toast-message';
import { showWarningToast, toastConfig } from './Toast';
import axiosInstance from '../api/axiosInstance';
import { clearAllAuthData } from '../api/auth/authToken';

const Footer_C = () => {
  const route = useRoute<any>();
  const [selectedTab, setSelectedTab] = useState<string>(route.params?.selectedTab ?? 'Home');
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const navigation = useNavigation<any>();

  const tabHistoryRef = useRef<string[]>([selectedTab]);
  const ignoreHistoryPushRef = useRef(false);
  const selectedTabRef = useRef(selectedTab);
  useEffect(() => { selectedTabRef.current = selectedTab; }, [selectedTab]);

  //if Token missing navigate to Login
  useEffect(() => {
    let handled = false; // prevent multiple concurrent redirects
    if (!axiosInstance || !axiosInstance.interceptors) {
      console.warn('axiosInstance unavailable — interceptor not installed.');
      return;
    }

    const id = axiosInstance.interceptors.response.use(
      (resp: any) => resp,
      async (error: any) => {
        try {
          const status = error?.response?.status;
          const data = error?.response?.data;
          const message = (error?.message || data?.message || JSON.stringify(data || '') || '').toString();

          const isAuthError =
            status === 401 ||
            /token invalid/i.test(message) ||
            /token expired/i.test(message) ||
            /invalid or expired/i.test(message) ||
            (/jwt/i.test(message) && /expired|invalid/i.test(message));

          if (isAuthError && !handled) {
            handled = true;
            console.log('Auth interceptor: token invalid/expired detected:', { status, message });
            try {
              await clearAllAuthData();
            } catch (e) {
              console.warn('Error clearing auth data', e);
            }
            // show toast then reset to LoginScreen with langId if available
            showWarningToast('Session expired. Please login again.');
            navigation.reset({
              index: 0,
              routes: [{ name: 'LoginScreen' as never, params: { langId: (route?.params?.langId ?? 'en') } as never }],
            });
          }
        } catch (e) {
          console.warn('Auth interceptor handler error', e);
        }
        // rethrow so original caller can still handle if needed
        return Promise.reject(error);
      }
    );
    return () => {
      try {
        axiosInstance.interceptors.response.eject(id);
      } catch (e) {
        console.warn('Failed to eject axios interceptor', e);
      }
    };
  }, []);

  const lastBackPress = useRef(0);

  const userId = route.params?.userId;
  const langId = route.params?.langId ?? 'en';

  const [currentLangId, setCurrentLangId] = useState<string>(route.params?.langId ?? 'en');

  // Now tabConfig is inside Footer and uses lang dynamically
  const tabConfig = [
    {
      key: 'Home',
      component: HomeScreen,
      icon: require('../assets/icons/f_home_g.png'),
      activeIcon: require('../assets/icons/f_home_b.png'),
    },
    {
      key: 'WorkHistory',
      component: WorkHistoryScreen,
      icon: require('../assets/icons/f_clock_g.png'),
      activeIcon: require('../assets/icons/f_clock_b.png'),
    },
    {
      key: 'ScheduleScreen',
      component: ScheduleScreen,
      icon: require('../assets/icons/f_schedule_g.png'),
      activeIcon: require('../assets/icons/f_schedule_b.png'),
    },
    {
      key: 'Profile',
      component: ProfileScreen,
      icon: require('../assets/icons/f_profile_g.png'),
      activeIcon: require('../assets/icons/f_profile_b.png'),
    },
  ];

  const ActiveScreen = tabConfig.find(tab => tab.key === selectedTab)?.component;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      const onBackPress = () => {
        const history = tabHistoryRef.current;

        if (history.length > 1) {
          // go to previous tab
          history.pop();
          const prev = history[history.length - 1] ?? 'Home';
          ignoreHistoryPushRef.current = true;
          setSelectedTab(prev);
          return true;
        }

        // already on Home tab
        if (selectedTabRef.current === 'Home') {
          const now = Date.now();
          if (now - lastBackPress.current < 2000) {
            BackHandler.exitApp(); // exit app directly
            return true;
          } else {
            lastBackPress.current = now;
            showWarningToast('Press back again to exit');
            return true;
          }
        }
        // any other tab → go to Home
        tabHistoryRef.current = ['Home'];
        ignoreHistoryPushRef.current = true;
        setSelectedTab('Home');
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  return (
    <View style={styles.safeArea}>
      <View style={styles.content}>
        {ActiveScreen ? (
          <ActiveScreen
            userId={userId}
            langId={currentLangId}
            setLangId={setCurrentLangId}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.tabBar,
          isTablet ? styles.tabBarTablet : styles.tabBarMobile,
          styles.footerFixed,
        ]}
      >
        {tabConfig.map((tab, index) => {
          const focused = selectedTab === tab.key;
          return (
            <TouchableOpacity
              key={index}
              style={styles.tabItem}
              onPress={() => {
                if (tab.key === selectedTabRef.current) return;
                if (ignoreHistoryPushRef.current) {
                  ignoreHistoryPushRef.current = false;
                  tabHistoryRef.current = [tab.key];
                } else {
                  tabHistoryRef.current.push(tab.key);
                }
                console.log('Footer -> tab press:', tab.key, { userId, langId });
                setSelectedTab(tab.key);
              }}

              activeOpacity={0.7}
            >
              <View style={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center' }}>
                <Image
                  source={focused ? tab.activeIcon : tab.icon}
                  style={[styles.icon, isTablet && styles.tabletIcon]}
                  resizeMode="contain"
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Toast config={toastConfig} />
    </View>
  );
};

export default Footer_C;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.secondary,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  tabBarMobile: {
    height: 60,
    paddingTop: 12,
    paddingBottom: 0,
  },
  tabBarTablet: {
    height: 80,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 6 : 8,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  icon: {
    width: 28,
    height: 28,
  },
  tabletIcon: {
    width: 32,
    height: 32,
  },
  footerFixed: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
});
