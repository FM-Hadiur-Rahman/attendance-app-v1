import React, { useState, useRef, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Keyboard,
    Pressable,
    Alert,
    Modal,
    KeyboardAvoidingView,
    TouchableWithoutFeedback,
    Platform,
    RefreshControl,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import Header from "../../../../components/Header";
import CartBox from "../../../../components/CartBox";
import { Button1 } from "../../../../components/Button";
import InputBox from "../../../../components/InputBox";
import { users } from "../../../../api/Users";
import colors from "../../../../styles/Colors";
import fonts from "../../../../styles/Fonts";
import Popup from "../../../../components/Popup";
import translations from "../../../../assets/translations.json";



const AddStaffScreen: React.FC<Props> = ({ }) => {

    const navigation = useNavigation<any>();
    const route = useRoute<any>();

    const [refreshing, setRefreshing] = useState(false);

   const { userId, langId, onSave } = route.params || {};
  
    const currentLang = langId || "en";
    const lang = translations[currentLang];
    // step control
    const [step, setStep] = useState<number>(1);

    // profile image
    const [profileImage, setProfileImage] = useState<string | null>(null);

    // refs
    const nameRef = useRef<TextInput | null>(null);
    const positionRef = useRef<TextInput | null>(null);
    const emailRef = useRef<TextInput | null>(null);
    const phoneRef = useRef<TextInput | null>(null);
    const usernameRef = useRef<TextInput | null>(null);
    const passwordRef = useRef<TextInput | null>(null);
    const confirmPasswordRef = useRef<TextInput | null>(null);

    // fields
    const [fullName, setFullName] = useState("");
    const [position, setPosition] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState<boolean>(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [confirmPopupVisible, setConfirmPopupVisible] = useState(false);

    const [selectedCountry, setSelectedCountry] = useState({
        id: 1,
        name: "Deutsch",
        code: "49",
        flag: require("../../../../assets/icons/de.png"), // 🇩🇪 default German
    });

    // Camera & gallery functions
    const openCamera = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
            Alert.alert(lang.permission_denied_title, lang.camera_access_required);
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

            //  clear error if previously set
            setErrors((prev: any) => ({ ...prev, profileImage: "" }));

            setModalVisible(false);
        }
    };

    const openGallery = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert(lang.permission_denied_title, lang.gallery_access_required);
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

            // clear error if previously set
            setErrors((prev: any) => ({ ...prev, profileImage: "" }));

            setModalVisible(false);
        }
    };


    // error states
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const validateEmail = (email: string): boolean => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(String(email).toLowerCase());
    };

    const validatePhone = (phone: string): boolean => {
        const re = /^[0-9]{7,15}$/; // only digits, 7–15 characters
        return re.test(phone);
    };
    const validatePassword = (password: string): boolean => {
        const re = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
        return re.test(password);
    };

    // validate step 1
    const validateStep1 = (): boolean => {
        let valid = true;
        let newErrors: any = {};

        if (!profileImage) {
            newErrors.profileImage = lang.profile_image_required;
            valid = false;
        }

        if (!fullName) {
            newErrors.fullName = lang.full_name_required;
            valid = false;
        }

        if (!position) {
            newErrors.position = lang.position_required;
            valid = false;
        }

        if (!email) {
            newErrors.email = lang.email_required;
            valid = false;
        } else if (!validateEmail(email)) {
            newErrors.email = lang.invalid_email;
            valid = false;
        }

        if (!phone) {
            newErrors.phone = lang.phone_required;
            valid = false;
        } else if (!validatePhone(phone)) {
            newErrors.phone = lang.invalid_phone;
            valid = false;
        }

        setErrors(newErrors);
        return valid;
    };

    // validate step 2
    const validateStep2 = (): boolean => {
        let valid = true;
        let newErrors: any = {};

        if (!username) {
            newErrors.username = lang.username_required;
            valid = false;
        }
        if (!password) {
            newErrors.password = lang.password_required;
            valid = false;
        } else if (!validatePassword(password)) {
            newErrors.password = lang.password_invalid;
            valid = false;
        }

        if (!confirmPassword) {
            newErrors.confirmPassword = lang.confirm_password_required;
            valid = false;
        } else if (confirmPassword !== password) {
            newErrors.confirmPassword = lang.passwords_no_match;
            valid = false;
        }

        setErrors(newErrors);
        return valid;
    };

    const validateField = (field: string, value: string) => {
        let error = "";

        switch (field) {
            case "fullName":
                if (!value) error = lang.full_name_required;
                break;

            case "position":
                if (!value) error = lang.position_required;
                break;

            case "email":
                if (!value) error = lang.email_required;
                else if (!validateEmail(value)) error = lang.invalid_email;
                break;

            case "phone":
                if (!value) error = lang.phone_required;
                else if (!validatePhone(value)) error = lang.invalid_phone;
                break;

            case "username":
                if (!value) {
                    error = lang.username_required;
                } else {
                    const exists = users.some(
                        (u) => u.username.toLowerCase() === value.toLowerCase()
                    );
                    if (exists) error = lang.username_exists;
                }
                break;

            case "password":
                if (!value) error = lang.password_required;
                else if (!validatePassword(value))
                    error = lang.password_invalid;
                break;


            case "confirmPassword":
                if (!value) error = lang.confirm_password_required;
                else if (value !== password) error = lang.passwords_no_match;
                break;
        }

        setErrors((prev) => ({ ...prev, [field]: error }));
    };


    // handlers
    const handleNext = () => {
        if (validateStep1()) {
            const finalPhone = `${selectedCountry.code}${phone}`;

            const step1_Data = {
                id: undefined, // let callback create new ID if not editing
                firstname: fullName.split(" ")[0] ?? "",
                lastname: fullName.split(" ")[1] ?? "",
                position,
                email,
                phone: finalPhone,
                userId,
                langId
            };

            console.log("Step! data:", step1_Data);
            goToStep2();
            // setStep(2);
        }
    };
    const handleSave = () => {
        if (validateStep2()) {
            const finalPhone = `${selectedCountry.code}${phone}`;

            const newStaff = {
                id: undefined, // let callback create new ID if not editing
                firstname: fullName.split(" ")[0] ?? "",
                lastname: fullName.split(" ")[1] ?? "",
                position,
                email,
                phone: finalPhone,
                username,
                password,
                role: "employee",
                userId,
                langId
            };

            console.log("Staff saved (before callback):", newStaff);

            // 🔥 Call parent callback if provided
            if (onSave) {
                onSave(newStaff);
            }

            setConfirmPopupVisible(false);
            navigation.goBack();
        }
    };
    const onRefresh = useCallback(() => {
        setRefreshing(true);

        if (step === 1) {
            // Reset Step 1 fields
            setProfileImage(null);
            setFullName("");
            setPosition("");
            setEmail("");
            setPhone("");
            setErrors({});
        } else if (step === 2) {
            // Reset Step 2 fields
            setUsername("");
            setPassword("");
            setConfirmPassword("");
            setErrors({});
        }

        setTimeout(() => {
            setRefreshing(false);
        }, 1000);
    }, [step]);

    const goToStep2 = () => {
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setErrors({});
        setStep(2);
    };



    return (

        <View style={styles.container}>
            <Header
                backgroundColor={colors.secondary}
                position="relative"
                left={{
                    type: "image",
                    url: require("../../../../assets/icons/back_b.png"),
                    width: 23,
                    height: 23,
                    onPress: () => {
                        if (step === 2) {
                            setStep(1);   // go back to Step 1
                        } else {
                            navigation.goBack();  // exit screen
                        }
                    },
                }}
                center={{ type: "text", value: lang.profile, color: colors.text }}
            />
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 40} // adjust header height
                >
                    <ScrollView
                        contentContainerStyle={styles.content}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                progressBackgroundColor={colors.secondary}
                                colors={[colors.primary]}
                                tintColor={colors.primary}

                            />
                        }
                    >
                        <View style={styles.progressWrap}>
                            <View style={[styles.progressLine, { backgroundColor: colors.primary }]} />
                            <View
                                style={[
                                    styles.progressLine,
                                    { backgroundColor: step === 2 ? colors.primary : colors.progressBarBackground },
                                ]}
                            />
                        </View>
                        {step === 1 ? (
                            <>
                                <View style={{}}>
                                    <Text style={styles.title}>{lang.basic_details}</Text>
                                    <Text style={styles.subtitle}>{lang.basic_details_desc}</Text>
                                </View>
                                <CartBox
                                    alignItems="center"
                                    marginTop={20}
                                    marginBottom={8}
                                    backgroundColor={colors.secondary}
                                    borderRadius={0}
                                    paddingTop={10}
                                    paddingBottom={10}
                                >
                                    <View style={styles.profileImageContainer}>
                                        {profileImage ? (
                                            <Image source={{ uri: profileImage }} style={styles.image} />
                                        ) : (
                                            <Image
                                                source={require("../../../../assets/icons/profile_gray.png")}
                                                style={styles.image}
                                            />
                                        )}
                                    </View>
                                    <View style={styles.addprofile}>
                                        <TouchableOpacity onPress={() => setModalVisible(true)}>
                                            <Text style={[
                                                styles.addPhoto,
                                                errors.profileImage ? { color: colors.error_text } : null
                                            ]}>
                                                {lang.add_profile}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </CartBox>

                                <InputBox
                                    ref={nameRef}
                                    label={lang.full_name}
                                    placeholder={lang.enter_full_name}
                                    value={fullName}
                                    // setValue={setFullName}
                                    setValue={(text) => {
                                        setFullName(text);
                                        if (!text) {
                                            setErrors((prev) => ({ ...prev, fullName: lang.full_name_required }));
                                        } else {
                                            setErrors((prev) => ({ ...prev, fullName: "" }));
                                        }
                                    }}
                                    errorMessage={errors.fullName}
                                    returnKeyType="next"
                                    onSubmitEditing={() => positionRef.current?.focus()}
                                />

                                <InputBox
                                    ref={positionRef}
                                    label={lang.position}
                                    placeholder={lang.enter_position}
                                    value={position}
                                    // setValue={setPosition}
                                    setValue={(text) => {
                                        setPosition(text);
                                        if (!text) {
                                            setErrors((prev) => ({ ...prev, position: lang.position_required }));
                                        } else {
                                            setErrors((prev) => ({ ...prev, position: "" }));
                                        }
                                    }}
                                    errorMessage={errors.position}
                                    returnKeyType="next"
                                    onSubmitEditing={() => emailRef.current?.focus()}
                                />
                                <InputBox
                                    ref={emailRef}
                                    label={lang.email}
                                    placeholder={lang.enter_email}
                                    value={email}
                                    setValue={(text) => {
                                        setEmail(text);
                                        if (!text) {
                                            setErrors((prev) => ({ ...prev, email: lang.email_required}));
                                        } else if (!validateEmail(text)) {
                                            setErrors((prev) => ({ ...prev, email: lang.invalid_email }));
                                        } else {
                                            setErrors((prev) => ({ ...prev, email: "" }));
                                        }
                                    }}
                                    errorMessage={errors.email}
                                    returnKeyType="next"
                                    onSubmitEditing={() => {
                                        validateField("email", email);
                                        phoneRef.current?.focus();
                                    }}
                                />


                                <InputBox
                                    ref={phoneRef}
                                    label="Phone"
                                    placeholder={`123 456 789`}
                                    value={phone}
                                    setValue={(text) => {
                                        const digitsOnly = text.replace(/[^0-9]/g, "");
                                        setPhone(digitsOnly);

                                        if (!digitsOnly) {
                                            setErrors((prev) => ({ ...prev, phone: lang.phone_required }));
                                        } else if (!validatePhone(digitsOnly)) {
                                            setErrors((prev) => ({ ...prev, phone: lang.invalid_phone }));
                                        } else {
                                            setErrors((prev) => ({ ...prev, phone: "" }));
                                        }
                                    }}
                                    errorMessage={errors.phone}
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
                                    returnKeyType="done"
                                    onSubmitEditing={() => {
                                        validateField("phone", phone);
                                        Keyboard.dismiss();
                                    }}
                                />

                            </>
                        ) : (
                            <>
                                <View style={styles.contentBox}>
                                    <Text style={styles.title}>{lang.login_account_details}</Text>
                                    <Text style={styles.subtitle}>{lang.login_account_desc}</Text>
                                </View>

                                <InputBox
                                    ref={usernameRef}
                                    label={lang.username}
                                    placeholder={lang.enter_username}
                                    value={username}
                                    setValue={(text) => {
                                        setUsername(text);
                                        if (!text) {
                                            setErrors((prev) => ({ ...prev, username: lang.username_required }));
                                        } else {
                                            const exists = users.some(
                                                (u) => u.username.toLowerCase() === text.toLowerCase()
                                            );
                                            if (exists) {
                                                setErrors((prev) => ({ ...prev, username: lang.username_exists }));
                                            } else {
                                                setErrors((prev) => ({ ...prev, username: "" }));
                                            }
                                        }
                                    }}
                                    errorMessage={errors.username}
                                    returnKeyType="next"
                                    onSubmitEditing={() => {
                                        validateField("username", username);
                                        passwordRef.current?.focus();
                                    }}
                                />


                                <InputBox
                                    ref={passwordRef}
                                    label={lang.password_label}
                                    placeholder="********"
                                    secureTextEntry={!showPassword}
                                    value={password}
                                    setValue={(text) => {
                                        setPassword(text);
                                        if (!text) {
                                            setErrors((prev) => ({ ...prev, password: lang.password_required }));
                                        } else if (!validatePassword(text)) {
                                            setErrors((prev) => ({ ...prev, password: lang.password_invalid }));
                                        } else {
                                            setErrors((prev) => ({ ...prev, password: "" }));
                                        }
                                    }}
                                    rightIcon={showPassword ? require('../../../../assets/icons/eye_open.png') : require('../../../../assets/icons/eye_close.png')}
                                    onRightIconPress={() => setShowPassword((s) => !s)}
                                    errorMessage={errors.password}
                                    returnKeyType="next"
                                    onSubmitEditing={() => {
                                        validateField("password", password);
                                        confirmPasswordRef.current?.focus();
                                    }}

                                />

                                <InputBox
                                    ref={confirmPasswordRef}
                                    label={lang.confirmPassword}
                                    placeholder="********"
                                    secureTextEntry={!showConfirmPassword}
                                    value={confirmPassword}
                                    setValue={(text) => {
                                        setConfirmPassword(text);
                                        if (!text) {
                                            setErrors((prev) => ({ ...prev, confirmPassword: lang.confirm_password_required }));
                                        } else if (text !== password) {
                                            setErrors((prev) => ({ ...prev, confirmPassword: lang.passwords_no_match }));
                                        } else {
                                            setErrors((prev) => ({ ...prev, confirmPassword: "" }));
                                        }
                                    }}
                                    rightIcon={showConfirmPassword ? require('../../../../assets/icons/eye_open.png') : require('../../../../assets/icons/eye_close.png')}
                                    onRightIconPress={() => setShowConfirmPassword((s) => !s)}
                                    errorMessage={errors.confirmPassword}
                                    returnKeyType="done"
                                    onSubmitEditing={() => {
                                        validateField("confirmPassword", confirmPassword);
                                        Keyboard.dismiss();
                                    }}

                                />
                            </>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
            {/* Profile Image Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Edit profile</Text>

                        <CartBox
                            paddingLeft={20}
                            paddingTop={10}
                            paddingBottom={10}
                            alignItems="flex-start"
                            borderRadius={12}
                            borderWidth={1}
                            borderColor="#E5E7EB"
                            marginBottom={12}
                            onPress={openCamera}
                        >
                            <View style={styles.logout}>
                                <Image
                                    source={require("../../../../assets/icons/p_camera.png")}
                                    style={styles.logoutIcon}
                                />
                                <Text style={styles.modalButtonText}>{lang.camera}</Text>
                            </View>
                        </CartBox>

                        <CartBox
                            paddingLeft={20}
                            paddingTop={10}
                            paddingBottom={10}
                            alignItems="flex-start"
                            borderRadius={12}
                            borderWidth={1}
                            borderColor="#E5E7EB"
                            onPress={openGallery}
                        >
                            <View style={styles.logout}>
                                <Image
                                    source={require("../../../../assets/icons/p_gallery.png")}
                                    style={styles.logoutIcon}
                                />
                                <Text style={styles.modalButtonText}>{lang.gallery}</Text>
                            </View>
                        </CartBox>
                    </View>
                </Pressable>
            </Modal>

            <Popup
                visible={confirmPopupVisible}
                onClose={() => setConfirmPopupVisible(false)}
                popupBorderColor={colors.primary}
                dismissOnOverlayPress={false}
                title={lang.confirm_save_staff}
                titleStyle={{ color: colors.primary, marginBottom: 30 }}
            >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                    <Button1
                        text={lang.yes}
                        backgroundColor={colors.primary}
                        width={'48%'}
                        textStyle={{ color: colors.secondary }}
                        onPress={handleSave}
                    />
                    <Button1
                        text={lang.no}
                        onPress={() => setConfirmPopupVisible(false)}
                        backgroundColor={colors.error_text}
                        width={'48%'}
                        textStyle={{ color: colors.secondary }}
                    />
                </View>
            </Popup>

            <View style={styles.fixedNext}>
                {step === 1 && (
                    <Button1
                        text={lang.next}
                        onPress={handleNext}   // use your handler
                        backgroundColor={colors.primary}
                        width={"100%"}
                    />
                )}
                {step === 2 && (
                    <View style={styles.step2Buttons}>
                        <Button1
                            text={lang.previous}
                            textStyle={{ color: colors.primary }}
                            onPress={() => setStep(1)}
                            backgroundColor={colors.secondary}
                            width={"45%"}
                        />
                        <Button1
                            text={lang.save}
                            onPress={() => {
                                if (validateStep2()) {
                                    setConfirmPopupVisible(true);
                                }
                            }}
                            backgroundColor={colors.primary}
                            width={"45%"}
                        />
                    </View>
                )}
            </View>
        </View>
    );
};

export default AddStaffScreen;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.secondary },
    content: { paddingHorizontal: 20, paddingBottom: 80 },
    contentBox: {
        marginBottom: 20
    },
    profileImageContainer: { width: 80, height: 80, borderRadius: 60, resizeMode: "contain", justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, },
    image: { width: 100, height: 100, borderRadius: 60 },
    addprofile: {
        marginTop: 24,
    },
    addPhoto: {
        fontSize: fonts.size.xs,
        fontWeight: fonts.weight.regular as any,
        fontFamily: fonts.family.regular,
        color: colors.primary,
        minHeight: 12,
    },
    progressWrap: {
        flexDirection: "row",
        height: 10,
        width: "100%",
        marginTop: 20,
        marginBottom: 20,
        gap: 20,

    },
    progressLine: {
        flex: 1,
        marginHorizontal: 2,
        borderRadius: 10,
    },
    fixedNext: {
        padding: 16,
        backgroundColor: colors.secondary,
    },
    title: {
        fontSize: fonts.size.m,
        fontWeight: fonts.weight.regular as any,
        fontFamily: fonts.family.regular,
        color: colors.text,
        minHeight: 16,
        marginBottom: 6,
    },
    subtitle: {
        fontSize: fonts.size.s,
        fontWeight: fonts.weight.regular as any,
        fontFamily: fonts.family.regular,
        color: colors.search,
        minHeight: 14,
    },
    step2Buttons: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 16,
    },
    logout: { flexDirection: "row", },
    logoutIcon: { width: 17, height: 17, marginRight: 8, resizeMode: "contain" },
    logoutText: { fontSize: fonts.size.m, color: colors.logout_text, fontWeight: fonts.weight.medium as any },
    modalOverlay: { flex: 1, justifyContent: "flex-end", },
    modalContainer: {
        backgroundColor: colors.secondary, borderTopLeftRadius: 30, borderTopRightRadius: 30,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 50,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 1.5,
        elevation: 4,
    },
    modalHandle: { width: 40, height: 6, backgroundColor: colors.modal_line, borderRadius: 10, alignSelf: "center", marginBottom: 20 },
    modalTitle: { fontSize: fonts.size.l, fontWeight: fonts.weight.medium as any, textAlign: "center", marginBottom: 19, lineHeight: 22 },
    modalButton: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalButtonText: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text, textAlign: "center", fontFamily: fonts.family.regular, },

});
