import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  BackHandler,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import colors from '../styles/Colors';
import DashboardScreen from '../screens/superadmin/main/DashboardScreen';
import BranchScreen from '../screens/superadmin/main/BranchScreen';
import AddBranchScreen from '../screens/superadmin/main/AddBranchScreen';
import Toast, { showWarningToast, toastConfig } from './Toast';

import { getToken, clearAllAuthData } from '../api/auth/authToken';
import axiosInstance from '../api/axiosInstance';

// Define the props interface for screen components
interface ScreenProps {
  userId?: string | null;
  langId?: string;
  setLangId?: React.Dispatch<React.SetStateAction<string>>;
  branch?: any;
  createdUser?: any;
}

const Footer_S = () => {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const userId = route.params?.userId;
  const langId = route.params?.langId ?? 'en';
  const [currentLangId, setCurrentLangId] = useState<string>(route.params?.langId ?? 'en');

  // Initialize selectedTab from route params if present, otherwise default to DashboardScreen
  const initialTab = route.params?.selectedTab ?? 'DashboardScreen';
  const [selectedTab, setSelectedTab] = useState<string>(initialTab);

  const tabHistoryRef = useRef<string[]>([selectedTab]);
  const ignoreHistoryPushRef = useRef(false);
  const selectedTabRef = useRef(selectedTab);
  useEffect(() => { selectedTabRef.current = selectedTab; }, [selectedTab]);

  const lastBackPress = useRef(0);

  // If navigator pushes/updates params later, keep selectedTab in sync
  useEffect(() => {
    if (route.params?.selectedTab && route.params.selectedTab !== selectedTab) {
      setSelectedTab(route.params.selectedTab);
    }
  }, [route.params?.selectedTab]);

  const TABBAR_HEIGHT_MOBILE = 60;
  const TABBAR_HEIGHT_TABLET = 80;
  const tabBarHeight = isTablet ? TABBAR_HEIGHT_TABLET : TABBAR_HEIGHT_MOBILE;

  const ADD_BTN_SIZE = 60;
  const ADD_BTN_HALF_INSIDE = 30;

  const DashboardScreenTyped = DashboardScreen as React.ComponentType<ScreenProps>;
  const AddBranchScreenTyped = AddBranchScreen as React.ComponentType<ScreenProps>;
  const BranchScreenTyped = BranchScreen as React.ComponentType<ScreenProps>;


  const tabConfig = [
    {
      key: 'DashboardScreen',
      component: DashboardScreenTyped,
      icon: require('../assets/icons/a_home_g.png'),
      activeIcon: require('../assets/icons/f_home_super_b.png'),
    },
    {
      key: 'AddBranch',
      component: AddBranchScreenTyped,
      icon: require('../assets/icons/button3.png'),
      activeIcon: require('../assets/icons/button3.png'),
    },
    {
      key: 'Branch',
      component: BranchScreenTyped,
      icon: require('../assets/icons/f_branch_gray.png'),
      activeIcon: require('../assets/icons/f_branch_b.png'),
    },
  ];

  // find component for currently selected tab (do not render 'AddBranch' here)
  const ActiveScreen = tabConfig.find(tab => tab.key === selectedTab && tab.key !== 'AddBranch')?.component;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      const onBackPress = () => {
        const history = tabHistoryRef.current;

        if (history.length > 1) {
          // go to previous tab
          history.pop();
          const prev = history[history.length - 1] ?? 'DashboardScreen';
          ignoreHistoryPushRef.current = true;
          setSelectedTab(prev);
          return true;
        }

        // already on Dashboard/Home tab
        if (selectedTabRef.current === 'DashboardScreen') {
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
        // any other tab → go to Dashboard
        tabHistoryRef.current = ['DashboardScreen'];
        ignoreHistoryPushRef.current = true;
        setSelectedTab('DashboardScreen');
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // Helper: treat invalid tokens, navigate to login
  const handleInvalidToken = async (reason?: string) => {
    try {
      console.log('Footer_A: handleInvalidToken() called', reason);
      await clearAllAuthData();
    } catch (e) {
      console.warn('Footer_A: clearAllAuthData error', e);
    } finally {
      showWarningToast('Session expired. Please login again.');
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'LoginScreen',
            params: { langId: langId },
          },
        ],
      });
    }
  };

  // Axios response interceptor to catch 401 / "Token invalid or expired"
  useEffect(() => {
    if (!axiosInstance || !axiosInstance.interceptors) {
      console.warn('Footer_S: axiosInstance not found or has no interceptors. Adjust path if necessary.');
      return;
    }

    const id = axiosInstance.interceptors.response.use(
      (response: any) => response, // pass through successful responses
      (error: any) => {
        // examine error shape (axios) and decide if it's an auth error
        const status = error?.response?.status;
        const data = error?.response?.data;
        const message = (error?.message || data?.message || JSON.stringify(data || '') || '').toString();

        const isAuthError =
          status === 401 ||
          /token invalid/i.test(message) ||
          /token expired/i.test(message) ||
          /invalid or expired/i.test(message) ||
          /jwt/i.test(message) && /expired|invalid/i.test(message);

        if (isAuthError) {
          handleInvalidToken(message);
          return Promise.reject(error);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      try {
        axiosInstance.interceptors.response.eject(id);
      } catch (e) {
        console.warn('Footer_S: failed to eject axios interceptor', e);
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    const pingServer = async () => {
      try {
      } catch (err: any) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.message || err?.message || '';
        if (status === 401 || /token invalid|token expired|invalid or expired/i.test(msg)) {
          handleInvalidToken(`ping: ${msg}`);
        }
      }
    };
    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <View style={styles.safeArea}>
      <View style={styles.content}>
        {ActiveScreen ? (
          // Forward branch/createdUser from route.params when rendering child (useful for BranchScreen)
          <ActiveScreen
            userId={userId}
            langId={currentLangId}
            setLangId={setCurrentLangId}
            branch={route.params?.branch}
            createdUser={route.params?.createdUser}
          />
        ) : null}
      </View>

      {/* Tab bar */}
      <View
        style={[
          styles.tabBar,
          isTablet ? styles.tabBarTablet : styles.tabBarMobile,
          styles.footerFixed,
        ]}
      >
        {tabConfig.map((tab) => {
          if (tab.key === 'AddBranch') {
            // placeholder so spacing is even (we render the real button outside)
            return <View key={tab.key} style={styles.tabItem} />;
          }

          const focused = selectedTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
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

      {/* Floating AddBranch button — NAVIGATE to a separate screen instead of setting selectedTab */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          navigation.navigate('AddBranchScreen', { userId, langId: currentLangId });
        }}
        style={[
          styles.addButton,
          {
            width: ADD_BTN_SIZE,
            height: ADD_BTN_SIZE,
            borderRadius: ADD_BTN_SIZE / 2,
            bottom: tabBarHeight - ADD_BTN_HALF_INSIDE, // half inside the tabBar
          },
          isTablet && { width: 68, height: 68 },
        ]}
      >
        <Image
          source={tabConfig.find(t => t.key === 'AddBranch')!.icon}
          style={{ width: ADD_BTN_SIZE, height: ADD_BTN_SIZE, resizeMode: 'contain' }}
        />
      </TouchableOpacity>
      <Toast config={toastConfig} />
    </View>
  );
};

export default Footer_S;

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
  addButton: {
    alignSelf: 'center',
    zIndex: 20,
  },
});
