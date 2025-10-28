// src/screens/AddBranchScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  ActivityIndicator,
  RefreshControl,
  findNodeHandle,
} from 'react-native';
import colors from '../../../styles/Colors';
import Header from '../../../components/Header';
import translations from "../../../assets/translations.json";
import { useNavigation, useRoute } from '@react-navigation/native';
import { Button1 } from '../../../components/Button';
import fonts from '../../../styles/Fonts';
import InputBox from '../../../components/InputBox';
import Popup from '../../../components/Popup';

import axiosInstance from '../../../api/axiosInstance';
import { getBranches, createBranch } from '../../../api/Branchs';
import { register1 } from '../../../api/auth/authService';

const PHONE_RULES: Record<string, { min: number; max: number; example?: string }> = {
  '94':  { min: 9,  max: 9,  example: '7XXXXXXXX' },
  '49':  { min: 7,  max: 11, example: 'variable (up to 11)' },
  '33':  { min: 9,  max: 9,  example: '9 digits after +33' },
  '44':  { min: 10, max: 10, example: '10 digits after +44' },
  '966': { min: 9,  max: 9,  example: '9 digits after +966' },
  '7':   { min: 10, max: 10, example: '10 digits after +7' },
  '90':  { min: 10, max: 10, example: '10 digits after +90' },
};
const DEFAULT_PHONE_RULE = { min: 7, max: 17 };

const AddBranchScreen: React.FC = (props: any) => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const propUserId = props?.userId;
  const propLangId = props?.langId;
  const routeUserId = route.params?.userId ?? route.params?.id;
  const routeLangId = route.params?.langId ?? route.params?.language;
  const userId = propUserId || routeUserId;
  const langId = propLangId || routeLangId || "en";
  const lang = (translations as any)[langId] || (translations as any)["en"];

  // refs for keyboard next navigation & measuring
  const branchRef = useRef<TextInput | any>(null);
  const managerRef = useRef<TextInput | any>(null);
  const emailRef = useRef<TextInput | any>(null);
  const phoneRef = useRef<TextInput | any>(null);
  const longitudeRef = useRef<TextInput | any>(null);
  const latitudeRef = useRef<TextInput | any>(null);

  const usernameRef = useRef<TextInput | any>(null);
  const passwordRef = useRef<TextInput | any>(null);
  const confirmPasswordRef = useRef<TextInput | any>(null);

  const scrollViewRef = useRef<ScrollView | any>(null);

  const [step, setStep] = useState<number>(1);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

  // step1 fields
  const [branchName, setBranchName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [longitude, setLongitude] = useState('');
  const [latitude, setLatitude] = useState('');
  const [selectedCountry, setSelectedCountry] = useState({
    id: 1,
    name: "Deutsch",
    code: "49",
    flag: require("../../../assets/icons/de.png"),
  });

  // step2 fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  // new states
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [createdBranch, setCreatedBranch] = useState<any | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // cache branches & users, and checking flags
  const [allBranches, setAllBranches] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [checkingBranchName, setCheckingBranchName] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const validatePassword = (password: string): boolean => {
    const re = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
    return re.test(password);
  };

  // helpers
  const getPhoneRuleForSelected = () => {
    const codeDigits = (selectedCountry?.code || '').replace(/\D/g, '');
    return PHONE_RULES[codeDigits] || DEFAULT_PHONE_RULE;
  };

  const formatPhoneForDisplay = (digitsOnly: string) => {
    if (!digitsOnly) return '';
    return digitsOnly.replace(/(.{3})/g, '$1 ').trim();
  };

  // on change for phone field (UI input)
  const onPhoneChange = (val: string) => {
    const rule = getPhoneRuleForSelected();

    let raw = val.replace(/\D/g, '');
    const hasLeadingZero = raw.startsWith('0');
    const maxAllowedForDisplay = rule.max + (hasLeadingZero ? 1 : 0);
    raw = raw.slice(0, maxAllowedForDisplay);
    let normalized = raw.startsWith('0') ? raw.slice(1) : raw;
    normalized = normalized.slice(0, rule.max);

    setPhone(formatPhoneForDisplay(raw));
    setPhoneRaw(normalized);

    // live validation
    if (!normalized || normalized.length === 0) {
      setErrors(prev => ({ ...prev, phone: lang.phone_required }));
      return;
    }
    if (normalized.length < rule.min) {
      if (rule.min === rule.max) {
        setErrors(prev => ({ ...prev, phone: `${lang.Please_complete_all} ${rule.max} ${lang.digits}` }));
      } else {
        setErrors(prev => ({ ...prev, phone: `${lang.Enter_at_least} ${rule.min} ${lang.digits}` }));
      }
      return;
    }
    setErrors(prev => ({ ...prev, phone: '' }));
  };

  const setFieldTouched = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  // progressive email validation as user types / on blur
  const validateEmailValue = (value: string) => {
    const v = (value || '').trim();
    if (!v) return 'Email is required';
    if (!/^[A-Za-z]/.test(v)) return lang.Email_must_start_with_a_letter;
    if (!v.includes('@')) return lang.Email_must_include;
    const [local, domainFull] = v.split('@');
    if (!domainFull || domainFull.length === 0) return lang.Email_must_include_domain_name;
    if (!/\.[A-Za-z]{2,}$/.test(domainFull)) return lang.Email_must_end_with_a_valid_TLD_like;
    return '';
  };

  const validateField = (field: string) => {
    let error = '';
    switch (field) {
      case 'branchName':
        if (!branchName.trim()) error = lang.Branch_name_is_Required;
        break;
      case 'managerName':
        if (!managerName.trim()) error = lang.Manager_name_is_Required;
        break;
      case 'email':
        error = validateEmailValue(email);
        break;
      case 'phone':
        {
          const normalized = phoneRaw || '';
          const phoneRule = getPhoneRuleForSelected();
          if (!normalized) error = lang.phone_required;
          else if (normalized.length < phoneRule.min) error = `${lang.Enter_at_least} ${phoneRule.min} ${lang.digits}`;
          else if (normalized.length > phoneRule.max) error = `${lang.Maximum} ${phoneRule.max} ${lang.digits}`;
        }
        break;
      case 'longitude':
        if (!longitude.trim()) error = lang.Longitude_is_required;
        break;
      case 'latitude':
        if (!latitude.trim()) error = lang.Latitude_is_required;
        break;
      case 'username': {
        const uname = (username || '').trim();
        if (!uname) {
          error = lang.username_required;
        } else {
          const unameLower = uname.toLowerCase();
          // use cached users to check availability synchronously here so the error persists until user changes username
          const found = (allUsers || []).find(
            (u) => String(u.username || '').trim().toLowerCase() === unameLower
          );
          if (found) error = lang.username_exists;
        }
        break;
      }
      case 'password':
        if (!password) error = lang.password_required;
        else if (!validatePassword(password)) error = lang.password_invalid;
        break;
      case 'confirmPassword':
        if (!confirmPassword) error = lang.confirm_password_required;
        else if (confirmPassword !== password) error = lang.passwords_no_match;
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return error === '';
  };

  const validateAllStep1 = () => {
    const fields = ['branchName', 'managerName', 'email', 'phone', 'longitude', 'latitude'];
    const newTouched: any = {};
    fields.forEach(f => (newTouched[f] = true));
    setTouched(prev => ({ ...prev, ...newTouched }));

    const results = fields.map(f => validateField(f));
    return results.every(Boolean);
  };

  const validateAllStep2 = () => {
    const fields = ['username', 'password', 'confirmPassword'];
    const newTouched: any = {};
    fields.forEach(f => (newTouched[f] = true));
    setTouched(prev => ({ ...prev, ...newTouched }));

    const results = fields.map(f => validateField(f));
    return results.every(Boolean);
  };

  // focus next helper
  const focusNext = (ref: React.RefObject<any>) => {
    try {
      ref.current?.focus?.();
    } catch { /* ignore */ }
  };

  const clearAllFields = () => {
    setBranchName('');
    setManagerName('');
    setEmail('');
    setPhone('');
    setPhoneRaw('');
    setLongitude('');
    setLatitude('');
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setErrors({});
    setTouched({});
    setCreatedBranch(null);
    setStep(1);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      clearAllFields();
      fetchAllBranches().finally(() => fetchAllUsers().finally(() => setRefreshing(false)));
    }, 300);
  };

  // fetch branches and cache
  const fetchAllBranches = async () => {
    try {
      const res = await getBranches({ page: 1, limit: 1000 });
      setAllBranches(res.branches || []);
    } catch (err) {
      console.error('Failed to fetch branches for checks', err);
      setAllBranches([]);
    }
  };

  // fetch users for username availability check (GET /users)
  const fetchAllUsers = async () => {
    try {
      const res = await axiosInstance.get('/users');
      const data = res?.data;
      if (Array.isArray(data)) setAllUsers(data);
      else if (Array.isArray(data?.users)) setAllUsers(data.users);
      else if (data?.data && Array.isArray(data.data)) setAllUsers(data.data);
      else setAllUsers([]);
    } catch (err) {
      console.error('Failed to fetch users for checks', err);
      setAllUsers([]);
    }
  };

  useEffect(() => {
    fetchAllBranches();
    fetchAllUsers();
  }, []);

  // helper to scroll the focused input above keyboard
  const scrollToInput = (ref: React.RefObject<any>) => {
    setTimeout(() => {
      try {
        const node = findNodeHandle(ref.current);
        if (!node) {
          scrollViewRef.current?.scrollTo({ y: 200, animated: true });
          return;
        }
        ref.current?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
          const targetY = Math.max(0, y - 120);
          scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
        });
      } catch (e) {
        scrollViewRef.current?.scrollTo({ y: 200, animated: true });
      }
    }, 250);
  };

  // live branch name check (debounced)
  useEffect(() => {
    if (!branchName || branchName.trim().length < 2) {
      setErrors(prev => ({ ...prev, branchName: '' }));
      return;
    }

    setTouched(prev => ({ ...prev, branchName: true }));
    setCheckingBranchName(true);
    const t = setTimeout(() => {
      const found = (allBranches || []).find(
        (b) => String(b.name || '').trim().toLowerCase() === branchName.trim().toLowerCase()
      );
      if (found) {
        setErrors(prev => ({ ...prev, branchName: lang.Branch_already_exists }));
      } else {
        setErrors(prev => ({ ...prev, branchName: '' }));
      }
      setCheckingBranchName(false);
    }, 600);

    return () => clearTimeout(t);
  }, [branchName, allBranches]);

  // live lat+long combination check
  useEffect(() => {
    if (!latitude || !longitude) {
      setErrors(prev => ({ ...prev, latitudeLongitude: '' }));
      return;
    }
    const latNum = parseFloat(latitude);
    const lonNum = parseFloat(longitude);
    if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
      setErrors(prev => ({ ...prev, latitudeLongitude: lang.LatitudeLongitude_must_be_numeric}));
      return;
    }

    const found = (allBranches || []).find((b) => {
      const coords = b?.location?.coordinates;
      if (!coords || !Array.isArray(coords) || coords.length < 2) return false;
      const bLon = Number(coords[0]);
      const bLat = Number(coords[1]);
      return !Number.isNaN(bLon) && !Number.isNaN(bLat) && Math.abs(bLon - lonNum) < 1e-7 && Math.abs(bLat - latNum) < 1e-7;
    });

    if (found) {
      setErrors(prev => ({ ...prev, latitudeLongitude: lang.A_branch_with_these_coordinates_already_exists}));
    } else {
      setErrors(prev => ({ ...prev, latitudeLongitude: '' }));
    }
    setTouched(prev => ({ ...prev, latitude: true, longitude: true }));
  }, [latitude, longitude, allBranches]);

  // live username check using cached users (debounced)
  useEffect(() => {
    if (!username || username.trim().length < 2) {
      setErrors(prev => ({ ...prev, username: '' }));
      return;
    }

    setTouched(prev => ({ ...prev, username: true }));
    setCheckingUsername(true);
    const t = setTimeout(() => {
      try {
        const found = (allUsers || []).find(
          (u) => String(u.username || '').trim().toLowerCase() === username.trim().toLowerCase()
        );
        if (found) setErrors(prev => ({ ...prev, username: lang.username_exists }));
        else setErrors(prev => ({ ...prev, username: '' }));
      } catch (e) {
        setErrors(prev => ({ ...prev, username: '' }));
      } finally {
        setCheckingUsername(false);
      }
    }, 700);

    return () => clearTimeout(t);
  }, [username, allUsers]);

  const goToStep2 = async () => {
    Keyboard.dismiss();

    // 1) run local validation
    if (!validateAllStep1()) return;

    // disallow if live errors present for branch name or coords or email/phone
    if (errors.branchName) return;
    if (errors.latitudeLongitude) return;
    if (errors.email) return;
    if (errors.phone) return;

    // 2) check branch existence and create
    try {
      setCreatingBranch(true);

      const existing = (allBranches || []).find(
        (b) => String(b.name || '').trim().toLowerCase() === branchName.trim().toLowerCase()
      );

      if (existing) {
        setTouched(prev => ({ ...prev, branchName: true }));
        setErrors(prev => ({ ...prev, branchName: lang.Branch_already_exists }));
        setCreatingBranch(false);
        return;
      }

      const phoneForApi = `${selectedCountry.code}${phoneRaw}`;
      const payload = {
        name: branchName,
        latitude: latitude || '',
        longitude: longitude || '',
        phone: phoneForApi,
        email: email || '',
      };

      const created = await createBranch(payload);
      setCreatedBranch(created);
      setAllBranches(prev => (created ? [created, ...prev] : prev));

      setStep(2);
      setTimeout(() => focusNext(usernameRef), 300);
    } catch (err: any) {
      console.error('Error checking/creating branch:', err);
      const msg = err?.message || err?.error || '';
      if (msg?.toString().toLowerCase().includes('email')) {
        setTouched(prev => ({ ...prev, email: true }));
        setErrors(prev => ({ ...prev, email: lang.Email_is_invalid }));
      } else {
        setErrors(prev => ({ ...prev, branchName: lang.Failed_to_verifycreate_branch }));
      }
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    if (!validateAllStep2()) return;

    // do not proceed if username live check shows existing or check still running
    if (errors.username) return;
    if (checkingUsername) return;

    if (!createdBranch?._id) {
      setErrors(prev => ({ ...prev, username: lang.Branch_not_created_yet_please_complete_step_1 }));
      return;
    }

    setShowPopup(true);
  };

  const createUser = async () => {
    if (!createdBranch?._id) {
      setErrors(prev => ({ ...prev, username: lang.Branch_not_available }));
      setShowPopup(false);
      return;
    }

    const payloadForUser = {
      fullname: managerName || username,
      branch: createdBranch._id,
      username: username,
      email: email && !validateEmailValue(email) ? email : `${username}@example.com`,
      password: password,
      role: "admin",
      position: "manager",
      phone: `${selectedCountry.code}${phoneRaw}`,
    };

    // close popup and clear UI inputs immediately
    setShowPopup(false);
    clearAllFields();

    setCreatingUser(true);
    try {
      console.log('Creating manager user with payload:', payloadForUser);
      const resp = await register1(payloadForUser as any);
      console.log('Manager created:', resp);

      navigation.navigate('Footer_S', {
        selectedTab: 'BranchScreen',
        branch: createdBranch,
        createdUser: resp.user ?? resp,
      });
    } catch (err: any) {
      console.error('Failed to create manager user:', err);
      const message = err?.message || err?.error || JSON.stringify(err);
      if (message?.toString().toLowerCase().includes('username')) {
        setTouched(prev => ({ ...prev, username: true }));
        setErrors(prev => ({ ...prev, username: message }));
      } else {
        setErrors(prev => ({ ...prev, username: message || lang.Failed_to_create_user }));
      }
    } finally {
      setCreatingUser(false);
    }
  };

  // stable toggles
  const toggleShowPassword = () => setShowPassword(s => !s);
  const toggleShowConfirmPassword = () => setShowConfirmPassword(s => !s);

  // UI helpers for border color around InputBox (wrap to enforce red border when error)
  const inputWrapperStyle = (fieldKey: string) => {
    const hasError = !!errors[fieldKey] && !!touched[fieldKey];
    return [
      hasError ? { borderColor: colors.error_text || 'red' } : { borderColor: 'transparent' },
    ];
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
        center={{ type: 'text', value: lang.Add_branch, color: colors.text }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 110 : 140}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
            keyboardDismissMode="interactive"
          >
            {/* Step indicator */}
            <View style={styles.step}>
              <View style={[styles.line, { backgroundColor: colors.primary, marginRight: 20 }]} />
              <View style={[styles.line, { backgroundColor: step >= 2 ? colors.primary : colors.progressBarBackground }]} />
            </View>

            {/* Content placeholder for the current step */}
            <View style={styles.stepContent}>
              {step === 1 ? (
                <View style={styles.detail}>
                  <Text style={styles.detail_first}>{lang.Branch_Information}</Text>
                  <Text style={styles.detail_second}>{lang.Add_branch_and_manager_details}</Text>

                  <View style={styles.inputfields}>
                    <View style={inputWrapperStyle('branchName')}>
                      <InputBox
                        ref={branchRef}
                        label={lang.Branch_name}
                        placeholder={lang.Enter_the_branch_name}
                        value={branchName}
                        setValue={(text: string) => {
                          setBranchName(text);
                          if (!text) setErrors(prev => ({ ...prev, branchName: lang.Branch_name_is_Required || 'Branch name is Required' }));
                        }}
                        errorMessage={touched.branchName ? (errors.branchName) : ''}
                        returnKeyType="next"
                        onFocus={() => { setFieldTouched('branchName'); scrollToInput(branchRef); }}
                        onBlur={() => validateField('branchName')}
                        onSubmitEditing={() => focusNext(managerRef)}
                      />
                    </View>

                    <View style={inputWrapperStyle('managerName')}>
                      <InputBox
                        ref={managerRef}
                        label={lang.Manager_name}
                        placeholder={lang.Enter_the_manager_name}
                        value={managerName}
                        setValue={(text: string) => {
                          setManagerName(text);
                          if (!text && touched.managerName) setErrors(prev => ({ ...prev, managerName: 'Manager name is Required' }));
                          else setErrors(prev => ({ ...prev, managerName: '' }));
                        }}
                        errorMessage={touched.managerName ? errors.managerName : ''}
                        returnKeyType="next"
                        onFocus={() => { setFieldTouched('managerName'); scrollToInput(managerRef); }}
                        onBlur={() => validateField('managerName')}
                        onSubmitEditing={() => focusNext(emailRef)}
                      />
                    </View>

                    {/* Email input */}
                    <View style={inputWrapperStyle('email')}>
                      <InputBox
                        ref={emailRef}
                        label={lang.email}
                        placeholder={'example@email.com'}
                        value={email}
                        setValue={(text: string) => {
                          setEmail(text);
                          const err = validateEmailValue(text);
                          if (!err) setErrors(prev => ({ ...prev, email: '' }));
                          else setErrors(prev => ({ ...prev, email: err }));
                        }}
                        errorMessage={touched.email ? errors.email : (errors.email && email ? errors.email : '')}
                        returnKeyType="next"
                        onFocus={() => { setFieldTouched('email'); scrollToInput(emailRef); }}
                        onBlur={() => validateField('email')}
                        onSubmitEditing={() => focusNext(phoneRef)}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>

                    <View style={inputWrapperStyle('phone')}>
                      <InputBox
                        ref={phoneRef}
                        label={lang.Manager_phone_number}
                        placeholder={`1234 567 891`}
                        value={phone}
                        setValue={(text: string) => onPhoneChange(text)}
                        errorMessage={touched.phone ? errors.phone : ''}
                        leftIcon={selectedCountry.flag}
                        leftIcon2={require("../../../assets/icons/down_b.png")}
                        onLeftIcon2Press={() =>
                          navigation.navigate("Code", {
                            initialSelectedId: selectedCountry.id,
                            onSelect: (item: any) => {
                              setSelectedCountry(item);
                              const newRule = PHONE_RULES[(item.code || '').replace(/\D/g, '')] || DEFAULT_PHONE_RULE;

                              let currentRaw = (phone || '').replace(/\D/g, '');
                              const hasLeadingZero = currentRaw.startsWith('0');
                              const maxDisplay = newRule.max + (hasLeadingZero ? 1 : 0);
                              currentRaw = currentRaw.slice(0, maxDisplay);

                              let normalized = currentRaw.startsWith('0') ? currentRaw.slice(1) : currentRaw;
                              normalized = normalized.slice(0, newRule.max);

                              setPhone(formatPhoneForDisplay(currentRaw));
                              setPhoneRaw(normalized);

                              if (!normalized || normalized.length === 0) {
                                setErrors(prev => ({ ...prev, phone: lang.phone_required }));
                              } else if (normalized.length < newRule.min) {
                                if (newRule.min === newRule.max) {
                                  setErrors(prev => ({ ...prev, phone: `Please complete all ${newRule.max} digits` }));
                                } else {
                                  setErrors(prev => ({ ...prev, phone: `${lang.enterAtLeast || 'Enter at least'} ${newRule.min} ${lang.digits || 'digits'}` }));
                                }
                              } else {
                                setErrors(prev => ({ ...prev, phone: '' }));
                              }
                            },
                          })
                        }
                        returnKeyType="next"
                        onFocus={() => { setFieldTouched('phone'); scrollToInput(phoneRef); }}
                        onBlur={() => validateField('phone')}
                        onSubmitEditing={() => focusNext(longitudeRef)}
                        keyboardType="phone-pad"
                      />
                    </View>

                    <View style={inputWrapperStyle('longitude')}>
                      <InputBox
                        ref={longitudeRef}
                        label={lang.Branch_address_longitude}
                        placeholder={lang.Enter_the_branch_address_longitude}
                        value={longitude}
                        setValue={(text: string) => {
                          setLongitude(text);
                          if (!text && touched.longitude) setErrors(prev => ({ ...prev, longitude: 'Longitude is required' }));
                          else setErrors(prev => ({ ...prev, longitude: '' }));
                        }}
                        errorMessage={touched.longitude ? (errors.longitude || errors.latitudeLongitude) : (errors.latitudeLongitude || '')}
                        returnKeyType="next"
                        onFocus={() => { setFieldTouched('longitude'); scrollToInput(longitudeRef); }}
                        onBlur={() => validateField('longitude')}
                        onSubmitEditing={() => focusNext(latitudeRef)}
                        keyboardType="numeric"
                      />
                    </View>

                    <View style={inputWrapperStyle('latitude')}>
                      <InputBox
                        ref={latitudeRef}
                        label={lang.Branch_address_latitude}
                        placeholder={lang.Enter_the_branch_address_latitude}
                        value={latitude}
                        setValue={(text: string) => {
                          setLatitude(text);
                          if (!text && touched.latitude) setErrors(prev => ({ ...prev, latitude: 'Latitude is required' }));
                          else setErrors(prev => ({ ...prev, latitude: '' }));
                        }}
                        errorMessage={touched.latitude ? (errors.latitude || errors.latitudeLongitude) : (errors.latitudeLongitude || '')}
                        returnKeyType="done"
                        onFocus={() => { setFieldTouched('latitude'); scrollToInput(latitudeRef); }}
                        onBlur={() => validateField('latitude')}
                        onSubmitEditing={() => {
                          validateField('latitude');
                          Keyboard.dismiss();
                        }}
                        keyboardType="numeric"
                      />
                    </View>

                    {/* show loader when creating branch */}
                    {creatingBranch ? (
                      <View style={{  alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={styles.detail}>
                  <Text style={styles.detail_first}>{lang.Login_Credentials}</Text>
                  <Text style={styles.detail_second}>{lang.Create_branch_login}</Text>

                  <View style={styles.inputfields}>
                    <View style={inputWrapperStyle('username')}>
                      <InputBox
                        ref={usernameRef}
                        label={lang.username}
                        placeholder={lang.enter_username}
                        value={username}
                        setValue={(text: string) => {
                          setUsername(text);
                          if (!text && touched.username) setErrors(prev => ({ ...prev, username: 'Username is required' }));
                          else setErrors(prev => ({ ...prev, username: '' }));
                        }}
                        errorMessage={touched.username ? (errors.username) : ''}
                        returnKeyType="next"
                        onFocus={() => { setFieldTouched('username'); scrollToInput(usernameRef); }}
                        onBlur={() => validateField('username')}
                        onSubmitEditing={() => focusNext(passwordRef)}
                        autoCapitalize="none"
                      />
                    </View>

                    <View style={inputWrapperStyle('password')}>
                      <InputBox
                        ref={passwordRef}
                        label={lang.password_label}
                        placeholder="********"
                        secureTextEntry={!showPassword}
                        value={password}
                        setValue={(text: string) => {
                          setPassword(text);
                          if (!text) setErrors(prev => ({ ...prev, password: lang.password_required }));
                          else if (!validatePassword(text)) setErrors(prev => ({ ...prev, password: lang.password_invalid }));
                          else setErrors(prev => ({ ...prev, password: '' }));
                        }}
                        rightIcon={showPassword ? require('../../../assets/icons/eye_open.png') : require('../../../assets/icons/eye_close.png')}
                        onRightIconPress={toggleShowPassword}
                        errorMessage={touched.password ? errors.password : ''}
                        returnKeyType="next"
                        onFocus={() => { setFieldTouched('password'); scrollToInput(passwordRef); }}
                        onBlur={() => validateField('password')}
                        onSubmitEditing={() => focusNext(confirmPasswordRef)}
                      />
                    </View>

                    {/* NOTE: toggling the key forces the InputBox to remount so secureTextEntry updates reliably */}
                    <View style={inputWrapperStyle('confirmPassword')}>
                      <InputBox
                        key={`confirm-${showConfirmPassword ? 'open' : 'closed'}`}
                        ref={confirmPasswordRef}
                        label={lang.confirmPassword}
                        placeholder="********"
                        secureTextEntry={!showConfirmPassword}
                        value={confirmPassword}
                        setValue={(text: string) => {
                          setConfirmPassword(text);
                          if (!text) setErrors(prev => ({ ...prev, confirmPassword: lang.confirm_password_required }));
                          else if (text !== password) setErrors(prev => ({ ...prev, confirmPassword: lang.passwords_no_match }));
                          else setErrors(prev => ({ ...prev, confirmPassword: '' }));
                        }}
                        rightIcon={showConfirmPassword ? require('../../../assets/icons/eye_open.png') : require('../../../assets/icons/eye_close.png')}
                        onRightIconPress={toggleShowConfirmPassword}
                        errorMessage={touched.confirmPassword ? errors.confirmPassword : ''}
                        returnKeyType="done"
                        onFocus={() => { setFieldTouched('confirmPassword'); scrollToInput(confirmPasswordRef); }}
                        onBlur={() => validateField('confirmPassword')}
                        onSubmitEditing={() => {
                          validateField('confirmPassword');
                          Keyboard.dismiss();
                        }}
                      />
                    </View>

                    {creatingUser ? (
                      <View style={{ alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={colors.primary} />
                      </View>
                    ) : null}
                  </View>
                </View>
              )}
            </View>

            {/* space at bottom so fixed button doesn't overlap content */}
            <View style={{ height: 180 }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Fixed positioned button area */}
      <View style={styles.fixedButton} pointerEvents="box-none">
        {step === 1 ? (
          <View style={styles.buttonRow}>
            <Button1
              text={lang.next}
              onPress={goToStep2}
              width={'90%'}
            />
          </View>
        ) : (
          <View style={styles.buttonRowMulti}>
            <Button1
              text={lang.previous}
              onPress={() => setStep(1)}
              backgroundColor={colors.secondary}
              textStyle={{ color: colors.primary }}
              width={'45%'}
            />
            <Button1
              text={lang.save}
              onPress={handleSubmit}
              width={'45%'}
            />
          </View>
        )}
      </View>

      <Popup
        visible={showPopup}
        onClose={() => setShowPopup(false)}
        popupBorderColor={colors.primary}
        dismissOnOverlayPress={false}
        title={lang.confirm_save_staff}
        titleStyle={{ color: colors.primary }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop:20 }}>
          <Button1
            text={lang.yes}
            backgroundColor={''}
            width={'48%'}
            onPress={() => createUser()}
          />
          <Button1
            text={lang.no}
            backgroundColor={colors.error_text}
            width={'48%'}
            onPress={() => setShowPopup(false)}
          />
        </View>
      </Popup>
    </View>
  );
};

export default AddBranchScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.secondary,
  },
  body: {
    paddingHorizontal: 20,
  },
  step: {
    marginTop: 20,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    height: 10,
    borderRadius: 20,
    flex: 1,
  },
  stepContent: {
    marginTop: 20,
    paddingBottom: 100, 
  },
  fixedButton: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
    color:colors.secondary,
  },
  detail: {
    marginBottom: 20
  },
  detail_first: {
    color: colors.text,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.m
  },
  detail_second: {
    marginTop: 6,
    color: colors.search,
    fontWeight: fonts.weight.regular as any,
    fontSize: fonts.size.s
  },
  inputfields: {
    marginTop: 20
  },
    buttonRow: {
    backgroundColor: colors.secondary,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonRowMulti: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.secondary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    width: '100%',
  },

});
