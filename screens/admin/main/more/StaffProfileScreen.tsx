// screens/StaffProfileScreen.tsx
import React, { useEffect, useState } from "react";
import {
    View,
    Text,
    StyleSheet,
    Image,
    Modal,
    Pressable,
    TouchableOpacity,
    ScrollView,
    Alert,
} from "react-native";
import InputBox from "../../../../components/InputBox";
import { Button1 } from "../../../../components/Button";
import colors from "../../../../styles/Colors";
import fonts from "../../../../styles/Fonts";
import Header from "../../../../components/Header";
import CartBox from "../../../../components/CartBox";
import { User, users } from "../../../../api/Users";
import { workHours } from "../../../../api/WorkHours";
import * as ImagePicker from 'expo-image-picker';
import { RefreshControl } from "react-native";
import translations from "../../../../assets/translations.json";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Linking } from "react-native";




export const getUserWorkSummary = (userId: string) => {
    const userHours = workHours.filter(w => w.user_id === userId);

    const totalDays = new Set(userHours.map(w => w.date)).size;

    let totalSeconds = 0;
    userHours.forEach(w => {
        if (w.check_in && w.check_out) {
            const [inH, inM, inS] = w.check_in.split(":").map(Number);
            const [outH, outM, outS] = w.check_out.split(":").map(Number);

            const start = inH * 3600 + inM * 60 + inS;
            const end = outH * 3600 + outM * 60 + outS;

            totalSeconds += Math.max(0, end - start);
        }
    });

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const totalTime = `${hours}h ${minutes}m`;

    return { totalDays, totalTime };
};

interface Props {
    userId?: string;
    langId?: string;
}

interface StaffProfileScreenprops {
    id: string;
    userId: string;
    langId: string;
    setLangId: (lang: string) => void;
}

const StaffProfileScreen: React.FC<StaffProfileScreenprops> = ({  }) => {
    const [profileImage, setProfileImage] = useState<string>(
        "https://via.placeholder.com/150"
    );

    const [positionModalVisible, setPositionModalVisible] = useState(false);
    const [emailModalVisible, setEmailModalVisible] = useState(false);
    const [phoneModalVisible, setPhoneModalVisible] = useState(false);
 const navigation = useNavigation();
     const route = useRoute<any>();

    const [positionInput, setPositionInput] = useState(""); // empty initially
    const [emailInput, setEmailInput] = useState("");
    const [phoneInput, setPhoneInput] = useState("");

    const [position, setPosition] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");


    const [modalVisible, setModalVisible] = useState(false); // for profile image edit

    const [currentUser, setCurrentUser] = useState<User | null>(null);

    const [totalDays, setTotalDays] = useState(0);
    const [totalTime, setTotalTime] = useState("0h 0m");

    const [refreshing, setRefreshing] = useState(false);
    const [emailError, setEmailError] = useState("");

   

  const { userId, langId, id } = route.params || {};
    const currentLang = langId || "en";
    const lang = translations[currentLang];

    const emailRegex = /^[^\s@]+@[^\s@]+\.com$/;




    useEffect(() => {
        if (currentUser) {
            setPositionInput(currentUser.position || "");
            setEmailInput(currentUser.email || "");
            setPhoneInput(currentUser.phone || "");

            // Also update main states if you want
            setPosition(currentUser.position || "");
            setEmail(currentUser.email || "");
            setPhone(currentUser.phone || "");
        }
    }, [currentUser]);


    const onRefresh = async () => {
        if (!currentUser) return; // nothing to refresh if no user

        setRefreshing(true);
        // 🔹 Re-fetch user data for current user
        const userId = currentUser.id;
        const user = users.find(u => u.id === userId) || null;
        setCurrentUser(user);

        if (user) {
            const summary = getUserWorkSummary(user.id);
            setTotalDays(summary.totalDays);
            setTotalTime(summary.totalTime);
        }

        // Simulate network delay
        setTimeout(() => {
            setRefreshing(false);
        }, 1000);
    };
    useEffect(() => {
        const staffId = id; // Replace with dynamic user ID if needed
        const user = users.find(u => u.id === staffId) || null;

        setCurrentUser(user);

        if (user) {
            const summary = getUserWorkSummary(user.id);
            setTotalDays(summary.totalDays);
            setTotalTime(summary.totalTime);
        }
    }, []);

    const [selectedCountry, setSelectedCountry] = useState({
        id: 1,
        name: "Deutsch",
        code: "49",
        flag: require("../../../../assets/icons/de.png"), // 🇩🇪 default German
    });

    // Camera & gallery functions
    const openCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission denied", "Camera access is required.");
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });
        if (!result.canceled) {
            setProfileImage(result.assets[0].uri);
            setModalVisible(false);
        }
    };

    const openGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission denied", "Gallery access is required.");
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (!result.canceled) {
            setProfileImage(result.assets[0].uri);
            setModalVisible(false);
        }
    };

  useEffect(() => {
    if (currentUser) {
        setPositionInput(currentUser.position || "");
        setPhoneInput(currentUser.phone || "");
        setEmailInput(currentUser.email || "");  // ✅ always keep full email

        setPosition(currentUser.position || "");
        setEmail(currentUser.email || "");
        setPhone(currentUser.phone || "");
    }
}, [currentUser]);

    const isCurrentEmailGmail = (() => {
        if (!currentUser?.email) return false;
        const parts = currentUser.email.split("@");
        return (parts[1] || "").toLowerCase() === "gmail.com";
    })();


    return (
        <>
            {/* 🔹 Header */}
          <Header
  backgroundColor={colors.secondary}
  position="relative"
  left={{
    type: "image",
    url: require("../../../../assets/icons/back_b.png"),
    width: 24,
    height: 24,
    onPress: () => navigation.goBack(),   // ✅ go back
  }}
  center={{ type: "text", value: lang.staffProfile, color: colors.text }}
/>

            <ScrollView
                contentContainerStyle={{ paddingBottom: 20, backgroundColor: colors.secondary }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        // Spinner color
                        colors={[colors.primary]} // Android: array of colors
                        tintColor={colors.primary} // iOS
                    />
                }
            >
                {/* 🔹 Profile Image */}
                <CartBox
                    alignItems="center"
                    backgroundColor={colors.secondary}
                    borderRadius={0}

                >
                    <View style={styles.profileContainer}>
                        <View style={styles.profileImageContainer}>
                            <View style={styles.profileImageContainer1}>
                                {profileImage ? (
                                    <Image source={{ uri: profileImage }} style={styles.image} />
                                ) : (
                                    <Image
                                        source={require("../../../../assets/icons/profile_gray.png")}
                                        style={styles.image}
                                    />
                                )}
                            </View>
                            <TouchableOpacity
                                style={styles.editIconContainer}
                                onPress={() => setModalVisible(true)}
                            >
                                <Image
                                    source={require("../../../../assets/icons/p_edit.png")}
                                    style={styles.editIcon}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>
                </CartBox>

                {/* 🔹 Stats */}
                <View style={styles.statsContainer}>
                    <CartBox

                        containerStyle={styles.statBox}
                    >
                        <Text style={styles.statLabel}>{lang.totalDays}</Text>
                        <Text style={styles.statValue}>{totalDays}</Text>

                    </CartBox>

                    <CartBox

                        paddingVertical={16}
                        paddingHorizontal={10}
                        backgroundColor={colors.background}
                        borderRadius={16}
                        containerStyle={styles.statBox}
                    >
                        <Text style={styles.statLabel}>{lang.totalWorkingHours}</Text>
                        <Text style={[styles.statValue, { color: colors.primary }]}>{totalTime}</Text>

                    </CartBox>
                </View>

                {/* 🔹 Personal Info */}
                <CartBox
                    width="90%"
                    backgroundColor={colors.background}
                    borderRadius={16}
                    paddingVertical={20}
                    paddingHorizontal={20}
                    containerStyle={{ alignSelf: "center", marginBottom: 12, height: "auto" }}
                    alignItems="flex-start"
                    justifyContent="flex-start"
                    paddingBottom={12}
                >
                    <Text style={styles.sectionTitle}>{lang.personalInformation}</Text>

                    {/* Fullname */}
                    <View style={{ marginBottom: 12, paddingHorizontal: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                            <Image
                                source={require("../../../../assets/icons/p_profile_b.png")}
                                style={styles.icon}
                            />
                            <Text style={styles.infoLabel}>{lang.fullname}</Text>
                        </View>
                        <Text style={styles.infoValue}> {currentUser?.fullname}</Text>
                    </View>

                    {/* Position */}
                    <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setPositionModalVisible(true)}
                        style={{ marginBottom: 12, paddingHorizontal: 12 }}
                    >
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                            <Image
                                source={require("../../../../assets/icons/p_position_b.png")}
                                style={styles.icon}
                            />
                            <Text style={styles.infoLabel}>{lang.position}</Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <Text style={styles.infoValue}> {currentUser?.position}</Text>
                        </View>
                    </TouchableOpacity>

                    {/* Email */}
                    <TouchableOpacity
    activeOpacity={0.7}
    onPress={() => setEmailModalVisible(true)}
    style={{ marginBottom: 15, paddingHorizontal: 12 }}
>
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5,  }}>
        <Image
            source={require("../../../../assets/icons/p_email_b.png")}
            style={styles.icon}
        />
        <Text style={styles.infoLabel}>{lang.email}</Text>
    </View>
    <View
        style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: '100%',
        }}
    >
        <Text style={styles.infoValue}>{currentUser?.email}</Text>

        {/* 🔹 Mail button */}
        <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => {
                const toEmail = "spavidanu@gmail.com"; // recipient
                
                const subject = encodeURIComponent(""); // optional
                const body = encodeURIComponent(""); // optional

                // opens email client; From = current user's email in their email app
                Linking.openURL(`mailto:${toEmail}?subject=${subject}&body=${body}`)
                    .catch(err => console.log("Failed to open email app:", err));
            }}
        >
            <Text style={styles.actionButtonText}>{lang.mail}</Text>
        </TouchableOpacity>
    </View>
</TouchableOpacity>


                    {/* Phone */}
                  <TouchableOpacity
    activeOpacity={0.7}
    onPress={() => setPhoneModalVisible(true)}
    style={{ marginBottom: 0, paddingHorizontal: 12 }}
>
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
        <Image
            source={require("../../../../assets/icons/p_phone_b.png")}
            style={styles.icon}
        />
        <Text style={styles.infoLabel}>{lang.phoneNumber}</Text>
    </View>
    <View
        style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: '100%'
        }}
    >
        <Text style={styles.infoValue}>{currentUser?.phone}</Text>
        <TouchableOpacity
            style={styles.actionButton}
            activeOpacity={0.7}
            onPress={() => {
                if (!currentUser?.phone) return;
                const phoneNumber = currentUser.phone.replace(/\s+/g, ""); // remove spaces
                Linking.openURL(`tel:${phoneNumber}`)
                    .catch(err => console.log("Failed to open dialer:", err));
            }}
        >
            <Text style={styles.actionButtonText}>{lang.call}</Text>
        </TouchableOpacity>
    </View>
</TouchableOpacity>

                </CartBox>

                {/* 🔹 Login Info */}
                <CartBox
                    width="90%"
                    backgroundColor={colors.background}
                    borderRadius={16}
                    paddingVertical={20}
                    paddingHorizontal={20}
                    containerStyle={{ alignSelf: "center", marginBottom: 40, height: 165 }}
                    alignItems="flex-start"
                    justifyContent="flex-start"
                >
                    <Text style={styles.sectionTitle}>{lang.loginAccountDetails}</Text>

                    {/* Username */}
                    <View style={{ marginBottom: 15, paddingHorizontal: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                            <Image
                                source={require("../../../../assets/icons/p_profile_b.png")}
                                style={styles.icon}
                            />
                            <Text style={styles.infoLabel}>{lang.username}</Text>
                        </View>
                        <Text style={styles.infoValue}>{currentUser?.username}</Text>
                    </View>

                    {/* Password */}
                    <View style={{ marginBottom: 0, paddingHorizontal: 12 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
                            <Image
                                source={require("../../../../assets/icons/lock_b.png")}
                                style={styles.icon}
                            />
                            <Text style={styles.infoLabel}>{lang.password}</Text>
                        </View>
                        <Text style={styles.infoValue}>
                            {"*".repeat(currentUser?.password.length || 5)}
                        </Text>
                    </View>
                </CartBox>
            </ScrollView>

            {/* 🔹 Modals */}
            {/* Position */}
            <Modal
                animationType="slide"
                transparent
                visible={positionModalVisible}
                onRequestClose={() => setPositionModalVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setPositionModalVisible(false)}
                >
                    {/* empty overlay */}
                </Pressable>
                <View style={styles.modalContainer}>
                    {/* Handle line */}
                    <View style={styles.modalHandle} />

                    <Text style={styles.modalTitle}>{lang.editPosition}</Text>
                    <InputBox
                        label="Position"
                        value={positionInput}
                        setValue={setPositionInput}
                        placeholder="Enter position"
                    />
                    <Button1
                        text={lang.save}
                        width="100%"
                        onPress={() => {
                            const updated = positionInput.trim() || position;

                            if (currentUser) {
                                console.log(
                                    `📝 Position changed: ${currentUser.position || "N/A"} → ${updated}`
                                );
                                setCurrentUser({
                                    ...currentUser,
                                    position: updated,
                                });
                            }

                            setPosition(updated);
                            setPositionModalVisible(false);
                        }}
                    />

                </View>
            </Modal>


            {/* Email */}
            <Modal
                animationType="slide"
                transparent
                visible={emailModalVisible}
                onRequestClose={() => setEmailModalVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setEmailModalVisible(false)} />

                <View style={styles.modalContainer}>
                    {/* 🔹 Handle line */}
                    <View style={styles.modalHandle} />

                    <Text style={styles.modalTitle}>{lang.editEmail}</Text>
                    <InputBox
                        label="Email"
                        value={emailInput}
                        setValue={(text) => {
                            // always lowercase
                            let formatted = text.toLowerCase();

                            // block typing after .com
                            if (formatted.includes(".com")) {
                                formatted = formatted.substring(0, formatted.indexOf(".com") + 4);
                            }

                            setEmailInput(formatted);

                            // ✅ show error only if not ending with .com
                            if (!formatted.endsWith(".com")) {
                                setEmailError("Email must end with .com");
                            } else {
                                setEmailError("");
                            }
                        }}
                        placeholder="Enter email"
                        errorMessage={emailError}
                    />

                    <Button1
                        text={lang.save}
                        width="100%"
                        onPress={() => {
                            const updated = emailInput.trim() || email;

                            // check strictly for .com ending
                            if (!updated.endsWith(".com")) {
                                setEmailError("Email must end with .com");
                                return;
                            }

                            if (currentUser) {
                                console.log(
                                    `📧 Email changed: ${currentUser.email || "N/A"} → ${updated}`
                                );
                                setCurrentUser({
                                    ...currentUser,
                                    email: updated,
                                });
                            }

                            setEmail(updated);
                            setEmailModalVisible(false);
                        }}
                    />
                </View>
            </Modal>


            {/* Phone */}
      <Modal
    animationType="slide"
    transparent
    visible={phoneModalVisible}
    onRequestClose={() => setPhoneModalVisible(false)}
>
    {/* Overlay for dismiss */}
    <Pressable style={styles.modalOverlay} onPress={() => setPhoneModalVisible(false)} />

    <View style={styles.modalContainer}>
        {/* 🔹 Handle line */}
        <View style={styles.modalHandle} />

        <Text style={styles.modalTitle}>{lang.editPhoneNumber}</Text>

        <InputBox
            label="Phone"
            placeholder="123 456 789"
            value={phoneInput} // <-- use phoneInput state
            setValue={(text) => {
                const digitsOnly = text.replace(/[^0-9]/g, ""); // allow only numbers
                setPhoneInput(digitsOnly);
            }}
            leftIcon={selectedCountry.flag}
            leftIcon2={require("../../../../assets/icons/down_b.png")}
            onLeftIcon2Press={() =>
                navigation.navigate("Code", {
                    initialSelectedId: selectedCountry.id,
                    onSelect: (item: any) => {
                        setSelectedCountry(item);
                    },
                })
            }
        />

        <Button1
  text={lang.save}
  width="100%"
  onPress={() => {
    const updated = phoneInput.trim() || phone;

    if (currentUser) {
      console.log(
        `📱 Phone changed: ${currentUser.phone || "N/A"} → ${updated}`
      );
      setCurrentUser({
        ...currentUser,
        phone: updated,
      });
    }

    setPhone(updated);
    setPhoneModalVisible(false);
  }}
/>
    </View>
</Modal>

            {/* Profile Image Modal */}
            <Modal animationType="slide" transparent visible={modalVisible}>
                {/* Overlay */}
                <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)} />

                {/* Modal content (separate, above overlay) */}
                <View style={styles.modalContainer}>
                    <View style={styles.modalHandle} />
                    <Text style={styles.modalTitle}>{lang.editProfile}</Text>

                    {/* Camera */}
                    <TouchableOpacity
                        style={styles.modalOption}
                        onPress={openCamera}
                        activeOpacity={0.7}
                    >
                        <Image
                            source={require("../../../../assets/icons/p_camera.png")}
                            style={styles.modalIcon}
                        />
                        <Text style={styles.modalOptionText}>{lang.camera}</Text>
                    </TouchableOpacity>

                    {/* Gallery */}
                    <TouchableOpacity
                        style={styles.modalOption}
                        onPress={openGallery}
                        activeOpacity={0.7}
                    >
                        <Image
                            source={require("../../../../assets/icons/p_gallery.png")}
                            style={styles.modalIcon}
                        />
                        <Text style={styles.modalOptionText}>{lang.gallery}</Text>
                    </TouchableOpacity>
                </View>
            </Modal>


        </>
    );
};

export default StaffProfileScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.secondary },

    profileContainer: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: 20,
        marginBottom: 20
    },
    profileImageContainer: {
        position: "relative",
    },
    profileImage: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    editIconContainer: {
        position: "absolute",
        right: 0,
        top: 60
    },
    editIcon: {
        width: 25,
        height: 25,
    },

    // Stats
    statsContainer: {
        flexDirection: "row",
        justifyContent: "space-around",
        marginTop: 20,
        marginBottom: 20,
        height: 78,

    },
    statBox: {
        backgroundColor: "#ffffffff",
        borderRadius: 5,
        alignItems: 'flex-start',
        width: "40%",
        borderColor: colors.border,
        borderWidth: 1,

    },
    statValue: {
        fontSize: fonts.size.xxl,
        fontWeight: fonts.weight.bold as any,
        color: colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 8,

    },
    statLabel: {
        fontSize: fonts.size.s,
        color: colors.subtext,
        paddingHorizontal: 12,
    },

    sectionTitle: {
        fontSize: fonts.size.m,
        fontWeight: fonts.weight.medium as any,
        marginBottom: 8,
        color: colors.text,
        paddingHorizontal: 12,
        paddingVertical: 12,
    },
    icon: {
        width: 18,
        height: 18,
        marginRight: 8,
        tintColor: colors.primary,
    },
    infoLabel: {
        fontSize: fonts.size.s,
        color: colors.subtext,
    },
    infoValue: {
        fontSize: fonts.size.m,
        fontWeight: fonts.weight.medium as any,
        color: colors.text,
        paddingHorizontal: 25,
    },
    actionButton: {
        marginLeft: 12,
        backgroundColor: colors.primary,
        paddingHorizontal: 20,   // wider
        paddingVertical: 6,      // taller
        borderRadius: 20,        // more round
        alignItems: "center",    // center text
        justifyContent: "center",
    },
    actionButtonText: {
        color: colors.secondary,
        fontSize: fonts.size.s,
        fontWeight: fonts.weight.medium as any,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        justifyContent: "flex-end",
    },
    modalContainer: {
        backgroundColor: colors.secondary,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
    },
    modalTitle: {
        fontSize: fonts.size.l,
        fontWeight: fonts.weight.medium as any,
        marginBottom: 15,
        textAlign: "center",
    },
    modalHandle: {
        width: 50,
        height: 4,
        backgroundColor: "#ccc",
        borderRadius: 2,
        alignSelf: "center",
        marginBottom: 15,
    },
    modalOption: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E7EB",
        marginBottom: 12,
    },
    modalIcon: {
        width: 22,
        height: 22,
        marginRight: 12,
    },
    modalOptionText: {
        fontSize: fonts.size.m,
        fontWeight: fonts.weight.medium as any,
        color: colors.text,
    },
    profileImageContainer1: { width: 80, height: 80, borderRadius: 60, resizeMode: "contain", justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, },
    image: { width: 100, height: 100, borderRadius: 60 },

});
