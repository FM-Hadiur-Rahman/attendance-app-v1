// components/Footer_A.tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import HomeScreen from '../screens/admin/main/HomeScreen';
import AttendancerecordScreen from '../screens/admin/main/AttendancerecordScreen';
import WorkScheduleScreen from '../screens/admin/main/WorkScheduleScreen';
import StaffRecordScreen from '../screens/admin/main/StaffRecordScreen';
import MoreScreen from '../screens/admin/main/MoreScreen';
import colors from '../styles/Colors';
import fonts from '../styles/Fonts';

// Define the props interface for screen components
interface ScreenProps {
  userId?: string | null;
  langId?: string;
  setLangId?: React.Dispatch<React.SetStateAction<string>>;
  routeRefresh?: boolean;
  onConsumedRefresh?: () => void;
  toastMessage?: string | null;
  onConsumedToast?: () => void;
}

const Footer_A = () => {
  // default tab
  const [selectedTab, setSelectedTab] = useState<string>('Home');
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const isTablet = SCREEN_WIDTH >= 768;
  const route = useRoute<any>();
  const langId = route.params?.langId ?? 'en';
  // states that we'll pass down to screens
  const [userIdState, setUserIdState] = useState<string | null>(route.params?.userId ?? null);
  const [currentLangId, setCurrentLangId] = useState<string>(route.params?.langId ?? 'en');
  const [routeRefreshFlag, setRouteRefreshFlag] = useState<boolean>(!!route.params?.refresh);
  const [toastMessage, setToastMessage] = useState<string | null>(route.params?.toastMessage ?? null);

  // keep tab config as before
  // Type the components properly
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

  // When route.params changes (navigation.navigate(...) from other screens), react and update states
  useEffect(() => {
    const p = route.params ?? {};
    if (p.selectedTab && typeof p.selectedTab === 'string') {
      setSelectedTab(p.selectedTab);
    }
    if (p.userId) {
      setUserIdState(p.userId);
    }
    if (p.langId) {
      setCurrentLangId(p.langId);
    }
    if (p.refresh) {
      setRouteRefreshFlag(true);
    }
    // new: accept external toastMessage and store it
    if (p.toastMessage) {
      setToastMessage(p.toastMessage);
    }
  }, [route.params]);

  // find active screen component
  const ActiveScreen = tabConfig.find(tab => tab.key === selectedTab)?.component;

  return (
    <View style={styles.safeArea}>
      <View style={styles.content}>
        {ActiveScreen ? (
          // Pass userId, langId and refresh flag down as props
          <ActiveScreen
            userId={userIdState}
            langId={currentLangId}              
            setLangId={setCurrentLangId} 
            routeRefresh={routeRefreshFlag}
            onConsumedRefresh={() => setRouteRefreshFlag(false)}
            toastMessage={toastMessage}
            onConsumedToast={() => setToastMessage(null)}
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
                setSelectedTab(tab.key);
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
