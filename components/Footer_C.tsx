import React, { useCallback, useState } from 'react';
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
import { useFocusEffect, useRoute } from '@react-navigation/native';
import HomeScreen from '../screens/customer/main/HomeScreen';
import NotificationScreen from '../screens/customer/main/NotificationScreen';
import ProfileScreen from '../screens/customer/main/ProfileScreen';
import WorkHistoryScreen from '../screens/customer/main/WorkHistoryScreen';
import colors from '../styles/Colors';
import ScheduleScreen from '../screens/customer/main/ScheduleScreen';

const Footer_C = () => {
  // const [selectedTab, setSelectedTab] = useState<string>('Home');
  const route = useRoute<any>();
  const [selectedTab, setSelectedTab] = useState<string>(route.params?.selectedTab ?? 'Home');
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  

  const userId = route.params?.userId;
  const langId = route.params?.langId ?? 'en';

const [currentLangId, setCurrentLangId] = useState<string>(route.params?.langId ?? 'en');
//const lang = translations[currentLangId];

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
        if (Platform.OS !== 'android') return; // BackHandler is Android-only
  
        const onBackPress = () => {
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
    borderTopColor:colors.border,
    borderTopWidth:1,
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
