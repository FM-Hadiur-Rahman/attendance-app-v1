// components/Footer_A.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  BackHandler,
  ToastAndroid,
} from 'react-native';
import { useRoute, useFocusEffect, useNavigation, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { AxiosResponse, AxiosError } from 'axios';
import HomeScreen from '../screens/admin/main/HomeScreen';
import AttendancerecordScreen from '../screens/admin/main/AttendancerecordScreen';
import WorkScheduleScreen from '../screens/admin/main/WorkScheduleScreen';
import StaffRecordScreen from '../screens/admin/main/StaffRecordScreen';
import MoreScreen from '../screens/admin/main/MoreScreen';
import colors from '../styles/Colors';
import Toast, { showWarningToast, toastConfig } from './Toast';

import { getToken, clearAllAuthData } from '../api/auth/authToken';
import axiosInstance from '../api/axiosInstance';

interface ScreenProps {
  userId?: string | null;
  langId?: string;
  setLangId?: React.Dispatch<React.SetStateAction<string>>;
  routeRefresh?: boolean;
  onConsumedRefresh?: () => void;
  toastMessage?: string | null;
  onConsumedToast?: () => void;
}

type Footer_ARouteParams = {
  userId?: string | null;
  langId?: string;
  selectedTab?: string;
  refresh?: boolean;
  toastMessage?: string | null;
};

type RootStackParamList = {
  Footer_A: Footer_ARouteParams;
  LoginScreen: { langId?: string };
};

type Footer_ARouteProp = RouteProp<RootStackParamList, 'Footer_A'>;
type Footer_ANavigationProp = StackNavigationProp<RootStackParamList, 'Footer_A'>;

const Footer_A = () => {
  const [selectedTab, setSelectedTab] = useState<string>('Home');
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const route = useRoute<Footer_ARouteProp>();
  const navigation = useNavigation<Footer_ANavigationProp>();

  const [userIdState, setUserIdState] = useState<string | null>(route.params?.userId ?? null);
  const [currentLangId, setCurrentLangId] = useState<string>(route.params?.langId ?? 'en');
  const [routeRefreshFlag, setRouteRefreshFlag] = useState<boolean>(!!route.params?.refresh);
  const [toastMessage, setToastMessage] = useState<string | null>(route.params?.toastMessage ?? null);

  // typed screens
  const HomeScreenTyped = HomeScreen as React.ComponentType<ScreenProps>;
  const AttendancerecordScreenTyped = AttendancerecordScreen as React.ComponentType<ScreenProps>;
  const WorkScheduleScreenTyped = WorkScheduleScreen as React.ComponentType<ScreenProps>;
  const StaffRecordScreenTyped = StaffRecordScreen as React.ComponentType<ScreenProps>;
  const MoreScreenTyped = MoreScreen as React.ComponentType<ScreenProps>;

  const tabConfig = [
    { key: 'Home', component: HomeScreenTyped, icon: require('../assets/icons/a_home_g.png'), activeIcon: require('../assets/icons/a_home_b.png') },
    { key: 'Attendancerecord', component: AttendancerecordScreenTyped, icon: require('../assets/icons/a_attendance_g.png'), activeIcon: require('../assets/icons/a_attendance_b.png') },
    { key: 'WorkSchedule', component: WorkScheduleScreenTyped, icon: require('../assets/icons/a_workschedule_g.png'), activeIcon: require('../assets/icons/a_workschedule_b.png') },
    { key: 'StaffRecord', component: StaffRecordScreenTyped, icon: require('../assets/icons/a_staffrecord_g.png'), activeIcon: require('../assets/icons/a_staffrecord_b.png') },
    { key: 'More', component: MoreScreenTyped, icon: require('../assets/icons/a_more_g.png'), activeIcon: require('../assets/icons/a_more_b.png') },
  ];

  // Tab history
  const tabHistoryRef = useRef<string[]>([selectedTab]);
  const ignoreHistoryPushRef = useRef(false);
  const selectedTabRef = useRef(selectedTab);
  useEffect(() => { selectedTabRef.current = selectedTab; }, [selectedTab]);
  
  //Token missing issue
  useEffect(() => {
    let handled = false; // prevent multiple concurrent redirects
    if (!axiosInstance || !axiosInstance.interceptors) {
      console.warn('axiosInstance unavailable — interceptor not installed.');
      return;
    }

    const id = axiosInstance.interceptors.response.use(
      (resp: AxiosResponse) => resp,
      async (error: AxiosError) => {
        try {
          const status = error.response?.status;
          const data = error.response?.data as { message?: string } | undefined;
          const message = (error.message || data?.message || JSON.stringify(data || '') || '').toString();

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
            // show toast then reset to LoginScreen 
            showWarningToast('Session expired. Please login again.');
            navigation.reset({
              index: 0,
              routes: [{ name: 'LoginScreen', params: { langId: (route?.params?.langId ?? 'en') } }],
            });
          }
        } catch (e) {
          console.warn('Auth interceptor handler error', e);
        }
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
  
  // Sync route params
  useEffect(() => {
    const p = route.params ?? {};
    const initialTab = (p.selectedTab && typeof p.selectedTab === 'string') ? p.selectedTab : 'Home';

    if (p.selectedTab && typeof p.selectedTab === 'string') setSelectedTab(p.selectedTab);
    if (p.userId) setUserIdState(p.userId);
    if (p.langId) setCurrentLangId(p.langId);
    if (p.refresh) setRouteRefreshFlag(true);
    if (p.toastMessage) setToastMessage(p.toastMessage);

    tabHistoryRef.current = [initialTab];
    ignoreHistoryPushRef.current = true;
  }, [route.params]);

  const handleTabPress = (tabKey: string) => {
    if (tabKey === selectedTabRef.current) return;
    if (ignoreHistoryPushRef.current) {
      ignoreHistoryPushRef.current = false;
      tabHistoryRef.current = [tabKey];
    } else {
      tabHistoryRef.current.push(tabKey);
    }
    setSelectedTab(tabKey);
  };

  // --- Android back handler with double-back exit on Home ---
  const lastBackPress = useRef(0);
  useFocusEffect(
    React.useCallback(() => {
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

      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => { sub.remove(); };
    }, [])
  );

  const ActiveScreen = tabConfig.find(tab => tab.key === selectedTab)?.component;

  return (
    <View style={styles.safeArea}>
      <View style={styles.content}>
        {ActiveScreen ? (
          <ActiveScreen
            userId={userIdState}
            langId={currentLangId}
            setLangId={setCurrentLangId}
            routeRefresh={routeRefreshFlag}
            onConsumedRefresh={() => { setRouteRefreshFlag(false); }}
            toastMessage={toastMessage}
            onConsumedToast={() => { setToastMessage(null); }}
          />
        ) : null}
      </View>

      <View style={[styles.tabBar, isTablet ? styles.tabBarTablet : styles.tabBarMobile, styles.footerFixed]}>
        {tabConfig.map((tab, index) => {
          const focused = selectedTab === tab.key;
          return (
            <TouchableOpacity
              key={index}
              style={styles.tabItem}
              onPress={() => {
                console.log('Footer -> tab press:', tab.key, { userId: userIdState, langId: currentLangId });
                handleTabPress(tab.key)
              }}
              activeOpacity={0.7}
            >
              <View style={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center' }}>
                <Image source={focused ? tab.activeIcon : tab.icon} style={[styles.icon, isTablet && styles.tabletIcon]} resizeMode="contain" />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Toast config={toastConfig} />
    </View>
  );
};

export default Footer_A;

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
