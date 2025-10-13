import React, { useState, useRef, useCallback, useEffect } from "react";
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
    findNodeHandle,
    UIManager,
    Dimensions,
    LayoutChangeEvent,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import DateTimePicker from "@react-native-community/datetimepicker";
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
import { showErrorToast, showSuccessToast } from "../../../../components/Toast";
import { branches as importedBranches } from "../../../../api/Branch";



const AddStaffScreen: React.FC<Props> = ({ }) => {

    const navigation = useNavigation<any>();
    const route = useRoute<any>();

    const [refreshing, setRefreshing] = useState(false);

    const { userId, langId, onSave } = route.params || {};
    const user = users.find((u) => u.id === userId) || users[0];

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

    const [localBranches, setLocalBranches] = useState<Array<any>>(() => [...importedBranches]);


    // Branch selection (typeable)
    const [selectedBranch, setSelectedBranch] = useState<string>("");
    const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);


    const branchInputWrapperRef = useRef<View | null>(null);
    const [branchInputLayout, setBranchInputLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

    const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null);
    const [timeFrom, setTimeFrom] = useState<string>("");
    const [timeFromError, setTimeFromError] = useState<string>("");
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [durationHours, setDurationHours] = useState<string>("");
    const [durationError, setDurationError] = useState<string>("");
    const [addScheduleModalVisible, setAddScheduleModalVisible] = useState(false);


    const [schedules, setSchedules] = useState<{ [date: string]: { startTime: string; endTime: string } }>({});
    const [activeDate, setActiveDate] = useState<string | null>(null);

    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

    const formatTime12 = (hhmmss: string) => {
        if (!hhmmss) return "";
        const parts = hhmmss.split(":");
        if (parts.length < 2) return hhmmss;
        let hh = parseInt(parts[0], 10);
        const mm = parts[1];
        const ampm = hh >= 12 ? "PM" : "AM";
        hh = hh % 12;
        if (hh === 0) hh = 12;
        return `${hh}:${mm} ${ampm}`;
    };

    const timeStringToDate = (timeStr: string) => {
        const now = new Date();
        now.setSeconds(0, 0);
        if (!timeStr) return now;
        const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
        now.setHours(parts[0] || 0, parts[1] || 0, parts[2] || 0, 0);
        return now;
    };

    const dateToYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;


    const getWeekDates = () => {
        const today = new Date();
        const dayIdx = today.getDay();
        const sunday = new Date(today);
        sunday.setDate(today.getDate() - dayIdx);
        sunday.setHours(0, 0, 0, 0);
        const days: Date[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(sunday);
            d.setDate(sunday.getDate() + i);
            d.setHours(0, 0, 0, 0);
            days.push(d);
        }
        return days;
    };
    const weekDates = getWeekDates();
    const branchList = localBranches;


    const branchSuggestions = branchList.filter((b) =>
        b.name.toLowerCase().includes((selectedBranch || "").toLowerCase()) ||
        b.id.toLowerCase().includes((selectedBranch || "").toLowerCase())
    );

    const onShowNativeTimePicker = () => setShowTimePicker(true);
    const onNativeTimeChange = (event: any, selected?: Date) => {
        setShowTimePicker(false);
        if (!selected) return;
        const hh = pad2(selected.getHours());
        const mm = pad2(selected.getMinutes());
        const ss = "00";
        setTimeFrom(`${hh}:${mm}:${ss}`);
        setTimeFromError("");
    };


    const [staffSchedule, setStaffSchedule] = useState<{
        startTime: string;
        endTime: string;
    } | null>(null);

    // 1) Replace your existing onAddSchedule with this:
    const onAddSchedule = () => {
        if (!timeFrom || !durationHours) {
            if (!timeFrom) setTimeFromError("Enter valid start time (HH:MM:SS)");
            if (!durationHours) setDurationError("Enter duration in hours");
            return;
        }

        // Parse start time
        const [h, m, s] = timeFrom.split(":").map(Number);
        const startDate = new Date();
        startDate.setHours(h, m, s, 0);

        // Add duration in hours
        const endDate = new Date(startDate.getTime() + Number(durationHours) * 60 * 60 * 1000);
        const endTime = endDate.toTimeString().split(" ")[0].slice(0, 8); // HH:MM:SS

        if (!activeDate) {
            console.warn("No active date selected for schedule");
            return;
        }

        // Build new schedules object (so we can log the updated version immediately)
        setSchedules(prev => {
            const newSchedules = {
                ...prev,
                [activeDate]: {
                    startTime: timeFrom,
                    endTime: endTime,
                },
            };

            // LOG the single added schedule and the full schedules map
            console.log("Schedule added for", activeDate, "=>", newSchedules[activeDate]);
            console.table(
                Object.entries(newSchedules).map(([date, sObj]) => ({ date, start: sObj.startTime, end: sObj.endTime }))
            );

            return newSchedules;
        });

        // Close modal
        setAddScheduleModalVisible(false);
    };



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

        // if (!profileImage) {
        //     newErrors.profileImage = lang.profile_image_required;
        //     valid = false;
        // }

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
            setSchedules({});
            setActiveDate(null);
            setTimeFrom("");
            setTimeFromError("");
            setDurationHours("");
            setDurationError("");
            setAddScheduleModalVisible(false);
            setSelectedBranch("");
            setSelectedBranchId(null);
        } else if (step === 3) {
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
        setStep(2);

    };

    const goToStep3 = () => {
        setUsername("");
        setPassword("");
        setConfirmPassword("");
        setErrors({});
        setStep(3);
    };
    const onBranchLayout = (e: LayoutChangeEvent) => {
        const { x, y, width, height } = e.nativeEvent.layout;
        setBranchInputLayout({ x, y, width, height });
    };

    const openAddModalForDate = (date: string) => {
        setActiveDate(date); // 👈 store which date's box was tapped

        // If no branch selected yet, default to the logged-in user's branch
        if (!selectedBranch && user?.branch_id) {
            const defaultBranch = importedBranches.find((b) => b.id === user.branch_id);
            if (defaultBranch) {
                setSelectedBranch(defaultBranch.name);
                setSelectedBranchId(defaultBranch.id);
            }
        }

        setAddScheduleModalVisible(true);
    };

    const screenH = Dimensions.get("window").height;
    const screenW = Dimensions.get("window").width;
    // compute if any schedule exists (place near top of component, e.g. before return)
    // detect if any of the upcoming week dates has a schedule
    const hasWeeklySchedule = React.useMemo(() => {
        return weekDates.some(d => !!schedules[dateToYMD(d)]);
    }, [schedules]); // weekDates is derived each render; schedules changes trigger recompute

    // Reset all Step-2 schedule related fields
    const resetStep2Fields = () => {
        setSchedules({});
        setActiveDate(null);
        setTimeFrom("");
        setTimeFromError("");
        setDurationHours("");
        setDurationError("");
        setAddScheduleModalVisible(false);
        setSelectedBranch("");
        setSelectedBranchId(null);
    };

    const handleProceedFromStep2 = () => {
        // Log a friendly summary to the console before proceeding
        const summary = Object.keys(schedules).length === 0
            ? "No schedules set for this week."
            : Object.entries(schedules).map(([date, sObj]) => `${date}: ${sObj.startTime} - ${sObj.endTime}`).join("\n");

        console.log("Proceeding from Step 2. Weekly schedules summary:\n", summary);
        if (Object.keys(schedules).length > 0) {
            console.table(
                Object.entries(schedules).map(([date, sObj]) => ({ start: sObj.startTime, end: sObj.endTime }))
            );
        }
        goToStep3(); 
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
                            resetStep2Fields();
                            setStep(1);   // go back to Step 1
                        } else if (step === 3) {
                            // going back from step 3 -> step 2: also reset step2 fields so step2 is clean
                            resetStep2Fields();
                            setStep(2);
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
                            {/* Step 1 */}
                            <View
                                style={[
                                    styles.progressLine,
                                    { backgroundColor: step >= 1 ? colors.primary : colors.progressBarBackground },
                                ]}
                            />

                            {/* Step 2 */}
                            <View
                                style={[
                                    styles.progressLine,
                                    { backgroundColor: step >= 2 ? colors.primary : colors.progressBarBackground },
                                ]}
                            />

                            {/* Step 3 */}
                            <View
                                style={[
                                    styles.progressLine,
                                    { backgroundColor: step >= 3 ? colors.primary : colors.progressBarBackground },
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
                                            setErrors((prev) => ({ ...prev, email: lang.email_required }));
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
                        ) : step === 2 ? (
                            <>
                                {/* STEP 2 UI */}
                                <View style={styles.contentBox}>
                                    <Text style={styles.title}>schedule_details</Text>
                                    <Text style={styles.subtitle}>create_new_schedule</Text>
                                </View>

                                <View style={{ marginTop: 0 }}>
                                    {weekDates.map((d) => {
                                        const ymd = dateToYMD(d);
                                        const wk = WEEKDAYS[d.getDay()];
                                        return (
                                            <View key={ymd} style={styles.each_day}>
                                                <CartBox
                                                    width="auto"
                                                    height={52}
                                                    containerStyle={styles.day}
                                                >
                                                    <Text style={styles.day_text}>{`${wk}`}</Text>
                                                </CartBox>
                                                <TouchableOpacity
                                                    style={{ flex: 1 }}
                                                    activeOpacity={0.8}
                                                    onPress={() => {
                                                        openAddModalForDate(ymd);
                                                    }}
                                                >
                                                    <CartBox
                                                        width="auto"
                                                        containerStyle={styles.time}
                                                    >
                                                        {schedules[ymd] ? ( // ✅ Only show time if that date has schedule
                                                            <View style={{ alignItems: "center" }}>
                                                                <View style={{ flexDirection: "row" }}>
                                                                    <Image
                                                                        source={require("../../../../assets/icons/clock_b.png")}
                                                                        style={styles.clock}
                                                                    />
                                                                    <Text style={styles.time_text}>
                                                                        {`${schedules[ymd].startTime} - ${schedules[ymd].endTime}`}
                                                                    </Text>
                                                                </View>
                                                            </View>
                                                        ) : (
                                                            <Image
                                                                source={require("../../../../assets/icons/plus_b.png")}
                                                                style={styles.plus}
                                                            />
                                                        )}
                                                    </CartBox>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>

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
                                    // secureTextEntry={!showPassword}
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
                            onPress={() => {
                                resetStep2Fields();
                                setStep(1);
                            }}
                            backgroundColor={colors.secondary}
                            width={"45%"}
                        />

                        {hasWeeklySchedule ? (
                            <Button1
                                text={lang.next ?? "Next"}
                                onPress={handleProceedFromStep2}
                                backgroundColor={colors.primary}
                                width={"45%"}
                            />
                        ) : (
                            <Button1
                                text={lang.skip ?? "Skip"}
                                onPress={handleProceedFromStep2}
                                backgroundColor={colors.primary}
                                width={"45%"}
                            />
                        )}
                    </View>
                )}

                {step === 3 && (
                    <View style={styles.step2Buttons}>
                        <Button1
                            text={lang.previous}
                            textStyle={{ color: colors.primary }}
                            onPress={() => setStep(2)}
                            backgroundColor={colors.secondary}
                            width={"45%"}
                        />
                        <Button1
                            text={lang.save}
                            onPress={() => {
                                if (validateStep2()) setConfirmPopupVisible(true);
                            }}
                            backgroundColor={colors.primary}
                            width={"45%"}
                        />
                    </View>
                )}
            </View>

            {/* Add Schedule Modal */}
            <Modal animationType="slide" transparent visible={addScheduleModalVisible} onRequestClose={() => { setAddScheduleModalVisible(false); }}>
                <Pressable style={styles.modalOverlay} onPress={() => { setAddScheduleModalVisible(true); }}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHandle} />
                        <Text style={styles.modalTitle}>Add schedule</Text>

                        {/* We render branch overlay inside modal container (so it sits above modal content) */}
                        <View>
                            <ScrollView style={{ marginTop: 8, maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                                {/* Branch input wrapper (measured for overlay) */}
                                <View
                                    ref={(r) => { branchInputWrapperRef.current = r; }}
                                    onLayout={onBranchLayout}
                                >
                                    <InputBox
                                        label={"Branch"}
                                        placeholder={""}
                                        value={selectedBranch}
                                        editable={false}
                                        setValue={() => {
                                            setSelectedBranch("");
                                            setSelectedBranchId(null);

                                        }}
                                        rightIcon={require("../../../../assets/icons/branch_b.png")}
                                        rightIconStyle={{ tintColor: colors.primary }}
                                    />
                                </View>

                                {/* Start time */}
                                <InputBox
                                    label={"Start time"}
                                    placeholder={"00:00:00"}
                                    value={timeFrom}
                                    setValue={(v: string) => {
                                        setTimeFrom(v);
                                        const ok = /^(\d{2}):(\d{2}):(\d{2})$/.test(v);
                                        if (ok) setTimeFromError("");
                                    }}
                                    rightIcon={require("../../../../assets/icons/clock_b.png")}
                                    errorMessage={timeFromError}
                                    rightIconStyle={{ tintColor: colors.primary }}
                                    onRightIconPress={onShowNativeTimePicker}
                                    onPress={onShowNativeTimePicker}
                                />

                                {/* Duration */}
                                <InputBox
                                    label={"Duration"}
                                    placeholder={"Eg: 8"}
                                    value={durationHours}
                                    setValue={(v: string) => { setDurationHours(v.replace(/[^0-9.]/g, "")); setDurationError(""); }}
                                    errorMessage={durationError}
                                    rightIconStyle={{ tintColor: colors.primary }}
                                />

                                <View style={{ height: 18 }} />

                                <Button1 text="Add" width={"100%"} onPress={onAddSchedule} />
                                <View style={{ height: 20 }} />
                            </ScrollView>

                            {/* Branch suggestion overlay inside modal container */}

                        </View>
                    </View>
                </Pressable>
            </Modal>
            {/* Native Time Picker */}
            {showTimePicker && (
                <DateTimePicker
                    value={timeStringToDate(timeFrom)}
                    mode="time"
                    is24Hour={true}
                    display={Platform.OS === "ios" ? "spinner" : "clock"}
                    onChange={onNativeTimeChange}
                />
            )}
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
    dayContainer: {
        flexDirection: "row"
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
    scheduleRow: {
        flexDirection: "row",
    },
    dayCircle: {
        width: 52,
        height: 52,
        borderRadius: 12,
        backgroundColor: colors.secondary,
        borderWidth: 1,
        borderColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        marginRight: 10,
        marginBottom: 20,
    },
    addBox: {
        height: 52,
        borderRadius: 12,
        backgroundColor: colors.secondary,
        borderWidth: 1,
        borderColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        width: "80%"
    },

    dayText: {
        fontFamily: fonts.family.regular,
        color: colors.primary,
        fontSize: fonts.size.s,
        fontWeight: fonts.weight.regular as any,
        textAlign: "center",
    },

    addButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
    },
    addIcon: {
        width: 24,
        height: 24,
    },
    modalOverlayAbsolute: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
    overlayContainer: {
        position: "absolute",
        backgroundColor: colors.secondary,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
        // shadow
        shadowColor: colors.text,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 8,
    },
    suggestionItemInline: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    suggestionText: { color: colors.text, fontSize: fonts.size.m },
    each_day: { flexDirection: "row", width: '100%', marginBottom: 20, alignItems: "center", },
    day: { borderColor: colors.primary, borderWidth: 1, borderRadius: 12, backgroundColor: colors.secondary, marginRight: 10, paddingTop: 11, paddingBottom: 11, width: 52, alignItems: "center" },
    day_text: { color: colors.primary, fontSize: fonts.size.s, fontWeight: fonts.weight.regular as any },
    time: {
        borderColor: colors.primary,
        borderWidth: 1, borderRadius: 12,
        backgroundColor: colors.secondary, flex: 1, justifyContent: "center", alignItems: 'center'
    },
    plus: { width: 16, height: 16 },
    branch_name: {
        fontSize: fonts.size.m,
        fontWeight: fonts.weight.regular as any,
        color: colors.primary,

    },
    time_text: {
        fontSize: fonts.size.s,
        fontWeight: fonts.weight.regular as any,
        color: colors.primary,
    },
    branch: {
        width: 16, height: 16, marginRight: 4
    },
    clock: { width: 14, height: 14, marginRight: 4 },


});
