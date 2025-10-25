import React, { useCallback, useState } from 'react';
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

const Footer_S = () => {
  const [selectedTab, setSelectedTab] = useState<string>('DashboardScreen');
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const userId = route.params?.userId;
  const [currentLangId, setCurrentLangId] = useState<string>(route.params?.langId ?? 'en');

  const TABBAR_HEIGHT_MOBILE = 60;
  const TABBAR_HEIGHT_TABLET = 80;
  const tabBarHeight = isTablet ? TABBAR_HEIGHT_TABLET : TABBAR_HEIGHT_MOBILE;

  const ADD_BTN_SIZE = 60;
  const ADD_BTN_HALF_INSIDE = 30;

  const tabConfig = [
    {
      key: 'DashboardScreen',
      component: DashboardScreen,
      icon: require('../assets/icons/a_home_g.png'),
      activeIcon: require('../assets/icons/f_home_super_b.png'),
    },
    {
      key: 'AddBranch',
      component: AddBranchScreen,
      icon: require('../assets/icons/button3.png'),
      activeIcon: require('../assets/icons/button3.png'),
    },
    {
      key: 'Branch',
      component: BranchScreen,
      icon: require('../assets/icons/f_branch_gray.png'),
      activeIcon: require('../assets/icons/f_branch_b.png'),
    },
  ];

  const ActiveScreen = tabConfig.find(tab => tab.key === selectedTab && tab.key !== 'AddBranch')?.component;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBackPress = () => true;
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
              onPress={() => setSelectedTab(tab.key)}
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
          // Navigate to AddBranch screen as a separate route (no footer there)
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
