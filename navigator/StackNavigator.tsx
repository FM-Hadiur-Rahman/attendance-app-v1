import { createStackNavigator } from '@react-navigation/stack';
import React from 'react';
import { Dimensions } from 'react-native';
import FlashScreen from '../screens/FlashScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import Footer_C from '../components/Footer_C';
import Footer_A from '../components/Footer_A';
import HelpCenterScreen from '../screens/support_legal/HelpcenterScreen';
import PrivacyScreen from '../screens/support_legal/PrivacyScreen';
import TermsScreen from '../screens/support_legal/TermsScreen';
import AboutScreen from '../screens/support_legal/AboutScreen';
import LanguageScreen from '../screens/LanguageScreen';
import OpenScreen from '../screens/OpenScreen';
import Code from '../components/Code';
import AddScheduleScreen from '../screens/admin/main/more/AddScheduleScreen';
import NotificationScreen from '../screens/admin/main/more/NotificationScreen';
import AddStaffScreen from '../screens/admin/main/more/AddStaffScreen';
import StaffProfileScreen from '../screens/admin/main/more/StaffProfileScreen';
import DashboardScreen from '../screens/superadmin/main/DashboardScreen';
import AttendanceScreen from '../screens/superadmin/main/AttendanceScreen';
//import NotificationScreen from '../screens/customer/main/NotificationScreen';
import C_NotificationScreen from '../screens/customer/main/NotificationScreen';
import StaffRecordScreen from '../screens/admin/main/StaffRecordScreen';
import Footer_S from '../components/Footer_S';
import AddBranchScreen from '../screens/superadmin/main/AddBranchScreen';
import BranchScreen from '../screens/superadmin/main/BranchScreen';
import BranchProfileScreen from '../screens/superadmin/main/BranchProfileScreen';
import AdminNotificationScreen from '../screens/admin/main/more/NotificationScreen';
import EditScheduleScreen from '../screens/admin/main/more/EditScheduleScreen';



const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768;

const Stack = createStackNavigator();

export const StackNavigator: React.FC = () => {
  return (

    <Stack.Navigator initialRouteName="FlashScreen">
      <Stack.Screen
        name="FlashScreen"
        component={FlashScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LoginScreen"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Footer_C"
        component={Footer_C}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="Footer_A"
        component={Footer_A}
        options={{ headerShown: false , gestureEnabled: false}}
      />
      <Stack.Screen
        name="HelpCenterScreen"
        component={HelpCenterScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PrivacyScreen"
        component={PrivacyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="TermsScreen"
        component={TermsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AboutScreen"
        component={AboutScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LanguageScreen"
        component={LanguageScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OpenScreen"
        component={OpenScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Code"
        component={Code}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddScheduleScreen"
        component={AddScheduleScreen}
        options={{ headerShown: false }}
      />

      <Stack.Screen
        name="NotificationScreen"
        component={AdminNotificationScreen}
        options={{ headerShown: false }}
      />

        <Stack.Screen
        name="C_NotificationScreen"
        component={C_NotificationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AddStaffScreen"
        component={AddStaffScreen}
        options={{ headerShown: false }}
      />
       <Stack.Screen
        name="StaffProfileScreen"
        component={StaffProfileScreen}
        options={{ headerShown: false }}
      />
       <Stack.Screen
        name="DashboardScreen"
        component={DashboardScreen}
        options={{ headerShown: false }}
      />
       <Stack.Screen
        name="AttendanceScreen"
        component={AttendanceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StaffRecordScreen"
        component={StaffRecordScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Footer_S"
        component={Footer_S}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="AddBranchScreen"
        component={AddBranchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BranchScreen"
        component={BranchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BranchProfileScreen"
        component={BranchProfileScreen}
        options={{ headerShown: false }}
      />
            <Stack.Screen
        name="EditScheduleScreen"
        component={EditScheduleScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
};