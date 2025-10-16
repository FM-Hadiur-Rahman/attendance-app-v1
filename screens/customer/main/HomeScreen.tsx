// screens/customer/main/HomeScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import { Button1 } from "../../../components/Button";
import Popup from "../../../components/Popup";
import { User, users } from "../../../api/Users";
import fonts from "../../../styles/Fonts";
import translations from "../../../assets/translations.json";
import { workHours, WorkHour, } from "../../../api/WorkHours";
import Toast, { showErrorToast, showSuccessToast, toastConfig } from "../../../components/Toast";
import CartBox from "../../../components/CartBox";
import { branches, getBranchById } from "../../../api/Branch";
import { schedules } from "../../../api/Schedule";
import { useNavigation } from "@react-navigation/native";



// Props type
interface HomeScreenProps {
  userId: string;
  langId: string;
  setLangId: (lang: string) => void;
}



const C_Homescreen: React.FC<HomeScreenProps> = ({ userId, langId, setLangId }) => {
  const [withinRange, setWithinRange] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCheckoutPopup, setShowCheckoutPopup] = useState(false);
  const currentLang = langId || "en";
  const lang = translations[currentLang];

  const [checkedIn, setCheckedIn] = useState(false);
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<string>("--");

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const userBranchObj = currentUser ? getBranchById(currentUser.branch_id) : null;
  const SHOP_LAT = userBranchObj?.location.latitude || 0;
  const SHOP_LON = userBranchObj?.location.longitude || 0;

  const CHECKIN_RADIUS = 8932039.537701556 // keep radius same (meters)

  const userBranchName = userBranchObj?.name || "No Branch";

  const userBranchLocation = userBranchObj?.location;

  const [branchAddress, setBranchAddress] = useState<string | null>(null);

  const navigation = useNavigation();

  const [canCheckOut, setCanCheckOut] = useState(false);
const [checkedOut, setCheckedOut] = useState(false);

const handleCheckoutConfirm = () => {
  const now = new Date();
  setCheckOutTime(now);

  if (checkInTime) {
    const diffMs = now.getTime() - checkInTime.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    setDuration(`${diffHours} hrs ${diffMinutes} mins`);
  }

  setShowCheckoutPopup(false);
  showSuccessToast("Checked out successfully!");
};





  let todaySchedule = schedules
    .filter(s => s.user_id === userId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .find(s => new Date(s.date) >= new Date());

  console.log("Next available schedule:", todaySchedule);

  useEffect(() => {
  if (!checkInTime || !todaySchedule) return;

  const parseTime = (timeStr: string) => {
    const [h, m, s] = timeStr.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, s || 0, 0);
    return d;
  };

  const startTime = parseTime(checkInTime);
  const endTime = new Date(startTime.getTime() + todaySchedule.duration * 60 * 60 * 1000);

  const interval = setInterval(() => {
    const now = new Date();
    // ✅ Allow checkout immediately once duration ends
    setCanCheckOut(now >= endTime);
  }, 1000);

  return () => clearInterval(interval);
}, [checkInTime, todaySchedule]);



useEffect(() => {
  if (!checkInTime || checkOutTime) return;

  const interval = setInterval(() => {
    const now = new Date();
    const diffMs = now.getTime() - checkInTime.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    setDuration(`${diffHours} hrs ${diffMinutes} mins`);
  }, 60000); // update every minute

  return () => clearInterval(interval);
}, [checkInTime, checkOutTime]);




useEffect(() => {
  if (!checkedIn || !checkInTime || !todaySchedule) return;

  const [h, m, s] = checkInTime
    .replace(/[^0-9:]/g, "")
    .split(":")
    .map(Number);

  const checkInDate = new Date();
  checkInDate.setHours(h, m, s || 0, 0);

  // ⏰ Duration in milliseconds + 1 minute buffer
  const durationMs = todaySchedule.duration * 60 * 60 * 1000 + 60 * 1000;
  const allowedCheckoutTime = new Date(checkInDate.getTime() + durationMs);

  const timer = setInterval(() => {
    const now = new Date();
    setCanCheckOut(now >= allowedCheckoutTime);
  }, 1000);

  return () => clearInterval(timer);
}, [checkedIn, checkInTime, todaySchedule]);



// 🔧 Convert HH:MM:SS or locale time to 12h format like "02:30 PM"
// 🕒 Format time as "hh:mm AM/PM" (no seconds)
const formatDisplayTime = (date: Date) => {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// 🧮 Given checkInTime + duration, calculate end time
const getActualEndTime = (checkInTime: string, duration: number) => {
  const now = new Date();

  // Parse checkInTime (works for both 12h or 24h strings)
  let h = 0, m = 0, s = 0;
  const timeStr = checkInTime.replace(/[^0-9:]/g, "");
  [h, m, s] = timeStr.split(":").map(Number);
  now.setHours(h, m, s || 0, 0);

  // Add duration (in hours → milliseconds)
  const endTime = new Date(now.getTime() + duration * 60 * 60 * 1000);
  return formatDisplayTime(endTime);
};





  const addWorkHour = (userId: string, checkInTime: Date): WorkHour => {
    const newId = `WH${(workHours.length + 1).toString().padStart(3, "0")}`;
    const formattedTime = checkInTime.toTimeString().split(" ")[0];
    const formattedDate = checkInTime.toISOString().split("T")[0];

    const newRecord: WorkHour = {
      id: newId,
      user_id: userId,
      check_in: formattedTime,
      check_out: "",
      date: formattedDate,
      createDate: checkInTime.toISOString(),
      updateDate: checkInTime.toISOString(),
    };

    workHours.push(newRecord);
    return newRecord;
  };

  const updateWorkHour = (userId: string, checkOutTime: Date): WorkHour | null => {
    const record = [...workHours].reverse().find(w => w.user_id === userId && !w.check_out);

    if (!record) {
      console.warn("⚠️ No active work record found for check-out.");
      return null;
    }

    const formattedTime = checkOutTime.toTimeString().split(" ")[0];
    record.check_out = formattedTime;
    record.updateDate = checkOutTime.toISOString();
    return record;
  };

  useEffect(() => {
    const fetchBranchAddress = async () => {
      if (!userBranchObj?.location) return;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("❌ Location permission denied");
          return;
        }

        const result = await Location.reverseGeocodeAsync({
          latitude: userBranchObj.location.latitude,
          longitude: userBranchObj.location.longitude,
        });

        if (result.length > 0) {
          const place = result[0];
          const formatted = `${place.name ? place.name + ", " : ""}${place.street ? place.street + ", " : ""}${place.city || ""}`;
          setBranchAddress(formatted);
          console.log("✅ Branch address:", formatted);
        }
      } catch (error) {
        console.log("❌ Error fetching branch address:", error);
      }
    };

    fetchBranchAddress();
  }, [userBranchObj]);


  useEffect(() => {
    const user = users.find(u => u.id === userId);
    if (user) setCurrentUser(user);
  }, [userId]);

  const [shopAddress, setShopAddress] = useState<string | null>(null); // ✅ new state


  const today = new Date().toLocaleDateString(langId === "de" ? "de-DE" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const [todayRecord, setTodayRecord] = useState<WorkHour | null>(null);

  const employees = users.filter(user => user.role === "employee");

  // const currentUser = users.find(u => u.id === userId);

  // Get the branch name dynamically using getBranchById
  const userBranch = currentUser
    ? getBranchById(currentUser.branch_id)?.name || "No Branch"
    : "No Branch";

  useEffect(() => {
    const fetchBranchAddress = async () => {
      if (!userBranch) return;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("❌ Location permission denied");
          return;
        }

        const result = await Location.reverseGeocodeAsync({
          latitude: userBranch.location.latitude,
          longitude: userBranch.location.longitude,
        });

        if (result.length > 0) {
          const place = result[0];
          const formatted = `${place.name ? place.name + ", " : ""}${place.street ? place.street + ", " : ""}${place.city || ""}`;
          setBranchAddress(formatted);
          console.log("✅ Branch address:", formatted);
        }
      } catch (error) {
        console.log("❌ Error fetching branch address:", error);
      }
    };

    fetchBranchAddress();
  }, [userBranch]);



  const formatTime = (time24: string) => {
    const [hour, minute] = time24.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} ${ampm}`;
  };


  // 🔥 Use props.userId to get user
  useEffect(() => {
    const user = users.find((u) => u.id === userId);
    if (user) setCurrentUser(user);
  }, [userId]);

  const handleCheckIn = () => {
    const now = new Date();
    setCheckInTime(now.toLocaleTimeString());
    if (withinRange) setShowPopup(true);
    else console.log("❌ Too far to check-in.");
  };


  const handleCheckOut = () => {
    const now = new Date();
    setCheckOutTime(now.toLocaleTimeString());
  };

  const getDuration = () => {
    if (!checkInTime || !checkOutTime) return null;

    const start = new Date(`1970-01-01T${checkInTime}`);
    const end = new Date(`1970-01-01T${checkOutTime}`);

    const diffMs = end.getTime() - start.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${diffHours}h ${diffMinutes}m`;
  };


  useEffect(() => {
    const getShopAddress = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          console.log("❌ Location permission denied for reverse geocode");
          return;
        }

        const result = await Location.reverseGeocodeAsync({
          latitude: SHOP_LAT,
          longitude: SHOP_LON,
        });

        if (result.length > 0) {
          const place = result[0];
          const formatted = `${place.name ? place.name + ", " : ""}${place.street ? place.street + ", " : ""}${place.city || ""}`;
          setShopAddress(formatted);
          console.log("✅ Shop address:", formatted);
        }
      } catch (error) {
        console.log("❌ Error getting shop address:", error);
      }
    };

    getShopAddress();
  }, []);

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const checkDistance = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;

        const loc = await Location.getCurrentPositionAsync({});
        const distance = getDistance(
          loc.coords.latitude,
          loc.coords.longitude,
          SHOP_LAT,
          SHOP_LON
        );

        setDistance(distance);
        console.log("📏 Current distance to shop:", distance, "meters");
        console.log("📏 latiitud:", loc);

        if (distance <= CHECKIN_RADIUS) {
          setWithinRange(true);

          clearTimeout(timer);
          timer = setTimeout(() => {
            setWithinRange(false);
          }, 60000);
        } else {
          setWithinRange(false);
        }
      } catch (error) {
        console.log("❌ Error getting location:", error);
      }
    };

    checkDistance();
    const interval = setInterval(checkDistance, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("❌ Permission denied");
        setRefreshing(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const newDistance = getDistance(
        loc.coords.latitude,
        loc.coords.longitude,
        SHOP_LAT,
        SHOP_LON
      );

      setDistance(newDistance);
      console.log("📏 Distance after pull refresh:", newDistance.toFixed(2), "meters");

      if (newDistance <= CHECKIN_RADIUS) {
        setWithinRange(true);
      } else {
        setWithinRange(false);
      }
    } catch (error) {
      console.log("❌ Error getting location on refresh:", error);
    }

    setRefreshing(false);
  };


  const getEndTime = (startTime: string, durationHours: number) => {
    if (!startTime || !durationHours) return "--:--";

    const [hour, minute, second] = startTime.split(":").map(Number);
    const startDate = new Date();
    startDate.setHours(hour, minute, second || 0);

    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    const endHour = endDate.getHours();
    const endMinute = endDate.getMinutes();
    const ampm = endHour >= 12 ? "PM" : "AM";
    const hour12 = endHour % 12 === 0 ? 12 : endHour % 12;

    return `${hour12.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")} ${ampm}`;
  };



  const calculateDuration = (checkInTime: string | null, checkOutTime: string | null) => {
    if (!checkInTime) return "0h 0m";

    const [inHour, inMinute] = checkInTime.split(":").map(Number);

    if (isNaN(inHour) || isNaN(inMinute)) return "0h 0m";

    const checkInDate = new Date();
    checkInDate.setHours(inHour, inMinute, 0, 0);

    let checkOutDate: Date;
    if (checkOutTime) {
      const [outHour, outMinute] = checkOutTime.split(":").map(Number);
      if (isNaN(outHour) || isNaN(outMinute)) return "0h 0m";
      checkOutDate = new Date();
      checkOutDate.setHours(outHour, outMinute, 0, 0);
      // Handle cross-midnight
      if (checkOutDate < checkInDate) checkOutDate.setDate(checkOutDate.getDate() + 1);
    } else {
      checkOutDate = new Date(); // live duration while on duty
    }

    const diffMs = checkOutDate.getTime() - checkInDate.getTime();
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);

    return diffMs < 60000 ? "0h 0m" : `${hrs}h ${mins}m`;
  };

  useEffect(() => {


    if (!checkedIn) return;

    const interval = setInterval(() => {
      setDuration(calculateDuration(checkInTime, checkOutTime));
    }, 1000); // update every second

    return () => clearInterval(interval);
  }, [checkedIn, checkInTime, checkOutTime]);
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const record = [...workHours].reverse().find(
      (w) => w.user_id === userId && w.date === today
    );
    if (record) {
      setTodayRecord(record);
      setCheckedIn(!!record.check_in && !record.check_out);
      setCheckInTime(record.check_in || null);
      setCheckOutTime(record.check_out || null);

      if (record.check_in && record.check_out) {
        setDuration(calculateDuration(record.check_in, record.check_out));
      }
    } else {
      // no record for today → reset
      setTodayRecord(null);
      setCheckedIn(false);
      setCheckInTime(null);
      setCheckOutTime(null);
      setDuration("--");
    }
  }, [userId]);
  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date().toISOString().split("T")[0];
      if (todayRecord && todayRecord.date !== today) {
        // midnight passed → reset UI
        setTodayRecord(null);
        setCheckedIn(false);
        setCheckInTime(null);
        setCheckOutTime(null);
        setDuration("--");
      }
    }, 60000); // check every 1 min

    return () => clearInterval(interval);
  }, [todayRecord]);

  return (
    <>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        center={{ type: "text", value: lang.timeTrack, color: colors.text }}
        right={{
          type: "image",
          url: require("../../../assets/icons/f_notification_b.png"),
          width: 24,
          height: 24,
          onPress: () => {
            // Navigate to NotificationScreen and pass userId & langId
            navigation.navigate("C_NotificationScreen" as any, {
              userId: userId, // current logged-in user
              langId: langId || "en", // current language
            });
          },
        }}
      />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.date}>{today}</Text>
        <Text style={styles.welcome}>
          {lang.welcome} {currentUser ? (currentUser.fullname || `${currentUser.firstname} ${currentUser.lastname}`) : "Guest"}
        </Text>


        {/* Heading */}
        <View style={styles.headingContainer}>
          <Image
            source={require("../../../assets/icons/schedule.png")}
            style={styles.headingIcon}
          />
          <Text style={styles.headingText}>Today’s Schedule</Text>
        </View>

        {(userBranch || shopAddress || todaySchedule) && (
          <CartBox
            backgroundColor="#F1F2F4"
            borderRadius={12}
            width={"100%"}
            borderWidth={1}
            alignItems='flex-start'
            paddingTop={10}
            paddingBottom={10}
            paddingLeft={10}
          >
            <View style={styles.addressContainer}>
              {/* Branch line */}
              {userBranch && (
                <View style={styles.addressLine}>
                  <Image
                    source={require("../../../assets/icons/branch.png")}
                    style={styles.addressIcon1}
                  />
                  <Text style={styles.addressText}>{userBranch}</Text>
                </View>
              )}

              {/* Address line */}
              {branchAddress && (
                <View style={styles.addressLine}>
                  <Image
                    source={require("../../../assets/icons/location.png")}
                    style={styles.addressIcon}
                  />
                  <Text style={[styles.addressText, { fontSize: 14, color: "#555" }]}>
                    {branchAddress}
                  </Text>
                </View>
              )}


              {/* Schedule line */}
              {todaySchedule && (
                <View style={styles.addressLine}>
                  <Image
                    source={require("../../../assets/icons/clock.png")}
                    style={styles.addressIcon}
                  />
                  <Text style={[styles.addressText, { fontSize: 14, color: "#333" }]}>
                    {formatTime(todaySchedule.start_time)} - {getEndTime(todaySchedule.start_time, todaySchedule.duration)}
                  </Text>
                </View>
              )}

{/* {todaySchedule && checkInTime && (
  <View style={styles.addressLine}>
    <Image
      source={require("../../../assets/icons/clock.png")}
      style={styles.addressIcon}
    />
    <Text style={[styles.addressText, { fontSize: 14, color: "#333" }]}>
      {checkInTime} - {getActualEndTime(checkInTime, todaySchedule.duration)}
    </Text>
  </View>
)} */}
            </View>
          </CartBox>
        )}
        {!checkedIn ? (
          <>
            <View style={styles.middle}>
              <Image
                source={require("../../../assets/icons/timer_gray.png")}
                style={styles.icon}
              />
              <Text style={styles.subText}>{lang.readyToStartShift}</Text>
            </View>

            <Button1
              text={lang.checkIn}
              onPress={handleCheckIn}
              backgroundColor={withinRange ? colors.primary : colors.button_background}
              textStyle={{ color: withinRange ? colors.button_background : colors.button_text }}
              containerStyle={styles.checkinBtn}
            />
          </>
        ) : (
          <View style={{ width: "100%", alignItems: "flex-start" }}>
            {/* Status Row */}
            <View style={styles.statusRow}>
              <Text style={{ fontWeight: "600", flex: 1, fontSize: fonts.size.l }}>{lang.currentStatus}</Text>
              <View style={styles.statusBadge(!!checkOutTime)}>
                <Text style={styles.statusText}>
                  {checkOutTime ? lang.offDuty : lang.onDuty}
                </Text>
              </View>
            </View>

            {/* Info Box */}
<View style={styles.infoBox}>
  {checkInTime && (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>Checked In At</Text>
      <Text style={styles.infoValue}>{formatTime(checkInTime)}</Text>
    </View>
  )}

  {checkOutTime && (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>Checked Out At</Text>
      <Text style={styles.infoValue}>{formatTime(checkOutTime)}</Text>
    </View>
  )}

  {checkInTime && (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>Duration</Text>
      <Text style={styles.durationValue}>{duration}</Text>
    </View>
  )}
</View>

{!checkedOut && (
  <Button1
    text={lang.checkOut}
    backgroundColor={colors.primary}
    textStyle={{ color: colors.secondary }}
    containerStyle={styles.checkinBtn}
    onPress={() => {
      if (canCheckOut) {
        setShowCheckoutPopup(true);
      } else {
        showErrorToast("You can’t check out yet. Please wait until your shift ends.");
      }
    }}
  />
)}


            {/* Checkout Popup */}
            <Popup
              visible={showCheckoutPopup}
              onClose={() => setShowCheckoutPopup(false)}
              popupBorderColor={colors.primary}
              dismissOnOverlayPress={false}
              title={lang.confirmCheckOut}
              titleStyle={colors.primary}
            >
              <Text style={styles.popupText}>
                {lang.checkoutMessage}
              </Text>
              <View style={styles.popupBtnContainer}>
                <Button1
                  text={lang.yes}
                  backgroundColor={colors.primary}
                  width="45%"
                  onPress={() => {
                    const now = new Date();
                    setCheckedIn(true);
                    setCanCheckOut(false); // 🔥 immediately disable checkout
                    const inTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
                    setCheckInTime(inTime);
                    setCheckOutTime(null);
                    setDuration("--");

                    const saved = addWorkHour(userId, now);
                    setTodayRecord(saved);
                    console.log("✅ WorkHour saved:", saved);

                    setShowPopup(false);
                    showSuccessToast(lang.checkInSuccess);
                  }}

                />

                <Button1
                  text={lang.no}
                  backgroundColor={colors.error_text}
                  width="45%"
                  onPress={() => setShowCheckoutPopup(false)}
                />
              </View>
            </Popup>
          </View>
        )}

        {/* Check In Popup */}
        <Popup
          visible={showPopup}
          onClose={() => setShowPopup(false)}
          popupBorderColor={colors.primary}
          dismissOnOverlayPress={false}
          title={lang.confirmCheckIn}
          titleStyle={{ color: colors.primary }}
        >
          <Text style={styles.popupText}>
            {lang.checkinMessage} <Text style={{ color: colors.primary }}>{lang.yes}</Text>.
          </Text>
          <View style={styles.popupBtnContainer}>
            <Button1
              text={lang.yes}
              backgroundColor={colors.primary}
              width="45%"
onPress={() => {
  const now = new Date();
  setCheckedIn(true);
  setCanCheckOut(false); // 🔥 Disable checkout immediately after check-in
  const inTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  setCheckInTime(inTime);
  setCheckOutTime(null);
  setDuration("--");

  const saved = addWorkHour(userId, now);
  setTodayRecord(saved);
  console.log("✅ WorkHour saved:", saved);

  setShowPopup(false);
  showSuccessToast(lang.checkInSuccess);
}}


            />
            <Button1
              text={lang.no}
              backgroundColor={colors.error_text}
              width="45%"
              onPress={() => setShowPopup(false)}
            />
          </View>

        </Popup>

      </ScrollView>
      <Toast config={toastConfig} />
    </>
  );
};

export default C_Homescreen;

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.secondary,
    alignItems: "center",
    paddingTop: "20%",
    padding: 20,
  },
  date: {
    fontSize: fonts.size.m,
    color: colors.search,
    marginBottom: 5,
  },
  welcome: {
    fontSize: fonts.size.xxl,
    fontWeight: fonts.weight.bold as any,
    marginBottom: 50,
  },

  headingContainer: {
    flexDirection: "row",
    marginBottom: 8, // space between heading and CartBox
    alignSelf: 'flex-start'
  },

  headingIcon: {
    width: 20,
    height: 20,
    marginRight: 8, // space between icon and text
  },
  headingText: {
    fontSize: fonts.size.m,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: 8, // space between heading and CartBox

  },

  addressContainer: {
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 4, // small gap between lines
  },
  addressLine: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2, // tiny spacing
  },
  addressIcon: {
    width: 14,
    height: 14,
    marginRight: 6,
    resizeMode: "contain",
  },
  addressIcon1: {
    width: 16,
    height: 16,
    marginRight: 6,
    resizeMode: "contain",
  },
  addressText: {
    fontSize: fonts.size.m,
    color: colors.text,
    fontWeight: fonts.weight.regular as any,
  },

  middle: {
    alignItems: "center",
    marginBottom: 20,
    marginTop: 50
  },
  icon: {
    width: 50,
    height: 50,
    marginBottom: 10,
    resizeMode: "contain",
  },
  subText: {
    fontSize: fonts.size.m,
    color: colors.subtext2,
  },
  checkinBtn: {
    width: "100%",
    borderRadius: 12,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    marginTop: 50
  },
  statusBadge: (offDuty: boolean) => ({
    backgroundColor: offDuty ? colors.primary : colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,

  }),
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  infoBox: {
    width: "100%",
    padding: 15,
    borderRadius: 12,
    backgroundColor: "#f9f9f9",
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: fonts.size.l,
    color: colors.subtext2,
  },
  infoValue: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.semibold as any,
    color: colors.text,
  },
  durationValue: {
    fontSize: fonts.size.l,
    fontWeight: fonts.weight.semibold as any,
    color: colors.primary,
  },

  popupText: {
    textAlign: "center",
    fontSize: fonts.size.s,
    marginBottom: 20,
  },
  popupBtnContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
    marginTop: 10,
  },
});