// screens/main/ProfileScreen.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from "react-native";
import { RefreshControl } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import CartBox from "../../../components/CartBox";
import { Button1 } from "../../../components/Button";
import InputBox from "../../../components/InputBox";
import translations from "../../../assets/translations.json";
import Header from "../../../components/Header";
import colors from "../../../styles/Colors";
import fonts from "../../../styles/Fonts";
import Toast, { showSuccessToast, showErrorToast, toastConfig } from "../../../components/Toast";
import { TextInput } from "react-native-gesture-handler";

export default function BranchProfileScreen(props: any) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || 'en';
  const lang = (translations as any)[langId] || (translations as any)['en'];

  const initialLang = propLangId || routeLangId || "en";

    const [selectedCountry, setSelectedCountry] = useState({
      id: 1,
      name: "Deutsch",
      code: "49",
      flag: require("../../../assets/icons/de.png"),
    });
  

  const [selectedLanguage, setSelectedLanguage] = useState(initialLang);
  const [tempLanguage, setTempLanguage] = useState(selectedLanguage);

  useEffect(() => {
    if (propLangId && propLangId !== selectedLanguage) {
      setSelectedLanguage(propLangId);
      setTempLanguage(propLangId);
    }
  }, [propLangId]);

  const [refreshing, setRefreshing] = useState(false);

  const phoneRef = useRef<TextInput | any>(null);

  // values requested by you
  const [branchName, setbranchName] = useState("Branch name");
  const [managerName, setManagerName] = useState("Manager name");
  const [phoneNumber, setPhoneNumber] = useState("0712345568");
  const [branchAddress, setBranchAddress] = useState("branch address");
  const [username, setUsername] = useState("username");
  const [password, setPassword] = useState("secret123");

  // temporary inputs & modal visibility for each editable field
  const [branchnameModalVisible, setbranchnameModalVisible] = useState(false);
  const [branchnameInput, setbranchnameInput] = useState(branchName);

  const [managerModalVisible, setManagerModalVisible] = useState(false);
  const [managerInput, setManagerInput] = useState(managerName);

  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneInput, setPhoneInput] = useState(phoneNumber);

  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [addressInput, setAddressInput] = useState(branchAddress);

  const [usernameModalVisible, setUsernameModalVisible] = useState(false);
  const [usernameInput, setUsernameInput] = useState(username);

  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [passwordInput, setPasswordInput] = useState(password);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setbranchnameInput(branchName);
  }, [branchName]);
  useEffect(() => {
    setManagerInput(managerName);
  }, [managerName]);
  useEffect(() => {
    setPhoneInput(phoneNumber);
  }, [phoneNumber]);
  useEffect(() => {
    setAddressInput(branchAddress);
  }, [branchAddress]);
  useEffect(() => {
    setUsernameInput(username);
  }, [username]);
  useEffect(() => {
    setPasswordInput(password);
  }, [password]);

  const sections = [
    {
      name: lang.Branch_Information,
      title: "General",
      items: [
        { id: 'branchName', label: "Branch name", labelname: lang.Branch_name, icon: require("../../../assets/icons/branch_b.png") },
        { id: 'managerName', label: "Manager name", labelname: lang.Manager_name, icon: require("../../../assets/icons/p_profile_b.png") },
        { id: 'phoneNumber', label: "Phone number", labelname: lang.phoneNumber, icon: require("../../../assets/icons/p_phone_b.png") },
        { id: 'branchAddress', label: "Branch address", labelname: lang.Branch_address_latitude, icon: require("../../../assets/icons/p_location_b.png") },
      ],
    },
    {
      name: lang.login_account_details,
      title: "credentials",
      items: [
        { id: 'username', label: "username", labelname: lang.username, icon: require("../../../assets/icons/p_profile_b.png") },
        { id: 'password', label: "password", labelname: lang.password, icon: require("../../../assets/icons/p_lock_b.png") },
      ],
    },
  ];

  const getItemValue = (id: string) => {
    switch (id) {
      case 'branchName':
        return branchName;
      case 'managerName':
        return managerName;
      case 'phoneNumber':
        return phoneNumber;
      case 'branchAddress':
        return branchAddress;
      case 'username':
        return username;
      case 'password':
        return showPassword ? password : '**********';
      default:
        return '';
    }
  };

  const openModalFor = (id: string) => {
    switch (id) {
      case 'branchName':
        setbranchnameInput(branchName);
        setbranchnameModalVisible(true);
        break;
      case 'managerName':
        setManagerInput(managerName);
        setManagerModalVisible(true);
        break;
      case 'phoneNumber':
        setPhoneInput(phoneNumber);
        setPhoneModalVisible(true);
        break;
      case 'branchAddress':
        setAddressInput(branchAddress);
        setAddressModalVisible(true);
        break;
      case 'username':
        setUsernameInput(username);
        setUsernameModalVisible(true);
        break;
      case 'password':
        setPasswordInput(password);
        setPasswordModalVisible(true);
        break;
      default:
        break;
    }
  };

  const saveBranchName = () => {
    setbranchName(branchnameInput);
    setbranchnameModalVisible(false);
    showSuccessToast(lang.save || 'Saved');
  };
  const saveManager = () => {
    setManagerName(managerInput);
    setManagerModalVisible(false);
    showSuccessToast(lang.save || 'Saved');
  };
  const savePhone = () => {
    setPhoneNumber(phoneInput);
    setPhoneModalVisible(false);
    showSuccessToast(lang.save || 'Saved');
  };
  const saveAddress = () => {
    setBranchAddress(addressInput);
    setAddressModalVisible(false);
    showSuccessToast(lang.save || 'Saved');
  };
  const saveUsername = () => {
    setUsername(usernameInput);
    setUsernameModalVisible(false);
    showSuccessToast(lang.save || 'Saved');
  };
  const savePassword = () => {
    setPassword(passwordInput);
    setPasswordModalVisible(false);
    setShowPassword(false);
    showSuccessToast(lang.save || 'Saved');
  };

  return (
    <View style={styles.screen}>
      <Header
        backgroundColor={colors.secondary}
        position="relative"
        left={{
          type: 'image',
          url: require('../../../assets/icons/back_b.png'),
          width: 24,
          height: 24,
          onPress: () => navigation.goBack(),
        }}
        center={{ type: "text", value: lang.Branch_profile, color: colors.text }}
      />

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.body}>
          {/* Sections */}
          {sections.map((section, index) => (

            <CartBox
              key={index}
              borderRadius={16}
              marginBottom={12}
              alignItems="flex-start"
              justifyContent="center"
              paddingLeft={20}
              paddingRight={20}
              paddingTop={13}
            >
              <Text style={styles.sectionTitle}>{section.name}</Text>
              {section.items.map((item, i) => (
                <CartBox
                  key={i}
                  onPress={() => item.id !== 'phoneNumber' && openModalFor(item.id)}
                  alignItems="flex-start"
                  borderRadius={0}
                  paddingTop={12}
                  paddingBottom={12}
                >
                  {/* Use a parent row to hold left & right parts */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>

                    {/* LEFT SIDE: icon + labels */}
                    <View style={styles.itemLeft}>
                      <Image source={item.icon} style={styles.itemIcon} />
                      <View style={{ justifyContent: 'flex-start' }}>
                        <Text style={styles.itemText}>{item.labelname}</Text>

                        {/* For phone we make the value tappable to open the modal, for others plain text */}
                        {item.id === 'phoneNumber' ? (
                          <TouchableOpacity onPress={() => openModalFor('phoneNumber')}>
                            <Text style={styles.labelValue}>{getItemValue(item.id)}</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.labelValue}>{getItemValue(item.id)}</Text>
                        )}

                      </View>
                    </View>

                    {/* RIGHT SIDE: actions (eye / call) */}
                    {item.id === 'password' && (
                      <TouchableOpacity onPress={() => setShowPassword(s => !s)}>
                        <Image
                          source={
                            showPassword
                              ? require('../../../assets/icons/eye_open.png')
                              : require('../../../assets/icons/eye_close.png')
                          }
                          style={{ width: 18, height: 18, resizeMode: 'contain' }}
                        />
                      </TouchableOpacity>
                    )}

                    {item.id === 'phoneNumber' && (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${phoneNumber}`)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
                        <View style={{borderRadius:20, backgroundColor:colors.primary}}>
                        <Text style={styles.callText}>{lang.call || 'Call'}</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                  </View>
                </CartBox>

              ))}

            </CartBox>


          ))}

        </View>
      </ScrollView>

      {/* branchName Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={branchnameModalVisible}
        onRequestClose={() => setbranchnameModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setbranchnameModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.Edit_branch_name}</Text>

            <InputBox
              label={lang.Branch_name}
              value={branchnameInput}
              setValue={setbranchnameInput}
              placeholder={lang.Enter_the_branch_name}
              inputStyle={{ marginTop: 0 }}
            />

            <Button1
              text={lang.save}
              width={"100%"}
              onPress={saveBranchName}
              containerStyle={{ alignSelf: "center", marginTop: 10 }}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Manager Modal */}
      <Modal animationType="slide" transparent={true} visible={managerModalVisible} onRequestClose={() => setManagerModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setManagerModalVisible(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.Manager_name}</Text>
            <InputBox label={lang.Manager_name} value={managerInput} setValue={setManagerInput} placeholder={lang.Manager_name} inputStyle={{ marginTop: 0 }} />
            <Button1 text={lang.save} width={"100%"} onPress={saveManager} containerStyle={{ alignSelf: "center", marginTop: 10 }} />
          </View>
        </Pressable>
      </Modal>

      {/* Phone Modal */}
      <Modal animationType="slide" transparent={true} visible={phoneModalVisible} onRequestClose={() => setPhoneModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPhoneModalVisible(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.Edit_manager_phone_number}</Text>
                      <InputBox
                        ref={phoneRef}
                        label={lang.Manager_phone_number}
                        placeholder={`1234 567 891`}
                        value={phoneInput}
                         setValue={setPhoneInput}
                        //errorMessage={touched.phone ? errors.phone : ''}
                        leftIcon={selectedCountry.flag}
                        leftIcon2={require("../../../assets/icons/down_b.png")}
                        onLeftIcon2Press={() =>
                          navigation.navigate("Code", {
                            initialSelectedId: selectedCountry.id,
                            onSelect: (item: any) => {
                              setSelectedCountry(item);
                            },
                          })
                        }
                        returnKeyType="next"
                        // onFocus={() => { setFieldTouched('phone'); scrollToInput(phoneRef); }}
                        // onBlur={() => validateField('phone')}
                        // onSubmitEditing={() => focusNext(longitudeRef)}
                        keyboardType="phone-pad"
                      />
    
            <Button1 text={lang.save} width={"100%"} onPress={savePhone} containerStyle={{ alignSelf: "center", marginTop: 10 }} />
          </View>
        </Pressable>
      </Modal>

      {/* Address Modal */}
      <Modal animationType="slide" transparent={true} visible={addressModalVisible} onRequestClose={() => setAddressModalVisible(false)}>
        <Pressable style={styles.modalOverlay}
          onPress={() => setAddressModalVisible(false)}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{lang.Edit_branch_address}</Text>

            <InputBox label={lang.Branch_address_longitude}
              value={addressInput}
              setValue={setAddressInput}
              placeholder={lang.Branch_address_longitude}
              inputStyle={{ marginTop: 0 }} />

            <InputBox label={lang.Branch_address_latitude}
              value={addressInput}
              setValue={setAddressInput}
              placeholder={lang.Branch_address_latitude}
              inputStyle={{ marginTop: 0 }} />
            <Button1 text={lang.save} width={"100%"} onPress={saveAddress} containerStyle={{ alignSelf: "center", marginTop: 10 }} />
          </View>
        </Pressable>
      </Modal>
      <Toast config={toastConfig} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.secondary },
  scrollContainer: { paddingBottom: 50 },
  body: { paddingHorizontal: 20, marginTop: 20 },
  profileContainer: {
    alignItems: 'center',
    marginTop: 20
  },
  profileImageContainer: {
    width: 80,
    height: 80, borderRadius: 60, resizeMode: "contain",
    justifyContent: 'center', alignItems: 'center'
  },
  profileImage: {
    width: 80, height: 80, borderRadius: 60
  },
  editIconContainer: { position: "absolute", bottom: 8, right: 0, },
  editIcon: { width: 20, height: 20, resizeMode: "contain" },
  sectionTitle: {
    fontSize: fonts.size.s, fontWeight: fonts.weight.regular as any, color: colors.subtext,
    marginBottom: 14,
  },
  itemLeft: { flexDirection: "row" },
  itemIcon: { width: 16, height: 16, resizeMode: "contain", marginRight: 8, marginTop: 2 },
  itemText: { fontSize: fonts.size.m, color: colors.text, fontWeight: fonts.weight.medium as any, fontFamily: fonts.family.regular, },
  modalOverlay: { flex: 1, justifyContent: "flex-end", },

  modalContainer: {
    backgroundColor: colors.secondary, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 50,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },

  modalHandle: { width: 40, height: 6, backgroundColor: colors.modal_line, borderRadius: 10, alignSelf: "center", marginBottom: 20 },
  modalTitle: { fontSize: fonts.size.l, fontWeight: fonts.weight.medium as any, textAlign: "center", marginBottom: 19 },
  modalButton: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalButtonText: { fontSize: fonts.size.m, fontWeight: fonts.weight.regular as any, color: colors.text, textAlign: "center", fontFamily: fonts.family.regular, },
  languageBox: { flexDirection: "row", alignItems: 'center' },
  lang: { alignItems: "flex-start" },
  languageSubtitle: {
    fontSize: fonts.size.s,
    color: colors.subtext,
    fontWeight: fonts.weight.regular as any,
    marginTop: 4,
    fontFamily: fonts.family.regular,
    lineHeight: 17
  },
  labelValue: {
    marginTop: 5,
    color: colors.subtext,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    fontFamily: fonts.family.regular,
    lineHeight: 16,
  },
  callText: {
    color: colors.secondary,
    fontSize: fonts.size.s,
    fontWeight: fonts.weight.regular as any,
    paddingVertical:5,
    paddingHorizontal:15
  },
});
