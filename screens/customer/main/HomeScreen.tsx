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
import { addWorkHour, updateWorkHour, workHours, WorkHour } from "../../../api/WorkHours";
import Toast, { showSuccessToast, toastConfig } from "../../../components/Toast";


// Props type
interface HomeScreenProps {
  userId: string;
  langId: string;
  setLangId: (lang: string) => void;
}

const SHOP_LAT = 9.6752298;
const SHOP_LON = 80.0127552;
const CHECKIN_RADIUS = 133.99923419685393;

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

  const today = new Date().toLocaleDateString(langId === "de" ? "de-DE" : "en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const [todayRecord, setTodayRecord] = useState<WorkHour | null>(null);

  // 🔥 Use props.userId to get user
  useEffect(() => {
    const user = users.find((u) => u.id === userId);
    if (user) setCurrentUser(user);
  }, [userId]);

  const handleCheckIn = () => {
    if (withinRange) {
      setShowPopup(true);
    } else {
      console.log("❌ Too far to check-in.");
    }
  };

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
         {lang.welcome} {currentUser ? currentUser.firstname : "Guest"}
        </Text>

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
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{lang.checkedInAt}</Text>
                <Text style={styles.infoValue}>{checkInTime ?? "--:--"}</Text>
              </View>

              {checkOutTime && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{lang.checkedOutAt}</Text>
                  <Text style={styles.infoValue}>{checkOutTime}</Text>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{lang.duration}</Text>
                <Text style={styles.durationValue}>{duration}</Text>
              </View>
            </View>

            {!checkOutTime && (
              <Button1
                text={lang.checkOut}
                backgroundColor={colors.primary}
                textStyle={{ color: colors.secondary }}
                containerStyle={styles.checkinBtn}
                onPress={() => setShowCheckoutPopup(true)}

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
                    const outTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
                    setCheckOutTime(outTime);

                    if (checkInTime) {
                      setDuration(calculateDuration(checkInTime, outTime));
                    }

                    const updated = updateWorkHour(userId, now);
                    if (updated) setTodayRecord(updated);
                    console.log("✅ WorkHour updated:", updated);

                    setShowCheckoutPopup(false);
                    showSuccessToast(lang.checkOutSuccess); // ✅ toast
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
    marginBottom: 100,
  },
  middle: {
    alignItems: "center",
    marginBottom: 20,
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
