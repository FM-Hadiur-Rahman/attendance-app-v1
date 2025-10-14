// screens/auth/LoginScreen.tsx
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  BackHandler,
  StyleSheet,
  Image,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import {
  useNavigation,
  useFocusEffect,
  useRoute,
  RouteProp,
} from '@react-navigation/native';

import Header from '../../components/Header';
import { Button1 } from '../../components/Button';
import colors from '../../styles/Colors';
import fonts from '../../styles/Fonts';

import { users, User } from '../../api/Users';
import Toast, { showSuccessToast, showErrorToast, toastConfig } from '../../components/Toast';
import InputBox from '../../components/InputBox';

const translations = require('../../assets/translations.json');

type LangId = 'en' | 'de';

type RouteParams = {
  LoginScreen: { langId?: LangId };
};

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'LoginScreen'>>();
  const langId: LangId | undefined = route.params?.langId;

  // log incoming param
  //console.log('LoginScreen -> received params:', { langId });

  // pick translations object; fallback to en
  const lang = translations[(langId as string) || 'en'] ?? translations['en'];

  const [emailOrUsername, setEmailOrUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // errors (used to show red border via InputBox)
  const [emailError, setEmailError] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');


  // refs for keyboard navigation
  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);


  // validate password live (localized messages)
  const validatePasswordLive = (pwd: string): string => {
    if (!pwd || pwd.length === 0) return '';
    if (!/^[A-Za-z]/.test(pwd)) return lang.err_first_char_letter;
    if (!/^[A-Z]/.test(pwd[0])) return lang.err_first_capital;
    if (pwd.length < 5) return lang.err_pwd_length;
    if (!/\d/.test(pwd)) return lang.err_pwd_number;
    if (!/[!@#$%^&*(),.?":{}|<>_\-\\[\];'`~+=\/]/.test(pwd)) return lang.err_pwd_symbol;
    return '';
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    if (passwordError) setPasswordError('');
    const liveErr = validatePasswordLive(text);
    setPasswordError(liveErr);
  };

  const handleEmailChange = (text: string) => {
    setEmailOrUsername(text);
    if (emailError) setEmailError('');
  };

  useFocusEffect(
    useCallback(() => {
      // clear fields on focus
      setEmailOrUsername('');
      setPassword('');
      setEmailError('');
      setPasswordError('');
      return () => { };
    }, [])
  );
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

  const handleEmailBlur = () => {
    if (!emailOrUsername || emailOrUsername.trim().length === 0) {
      setEmailError(lang.err_email_required);
    } else {
      setEmailError('');
    }
  };

  const handlePasswordBlur = () => {
    if (!password || password.trim().length === 0) {
      setPasswordError(lang.err_password_required);
    } else {
      const liveErr = validatePasswordLive(password);
      setPasswordError(liveErr);
    }
  };

  const handleSignIn = async () => {
    // reset prior error messages
    setEmailError('');
    setPasswordError('');
    let hasError = false;

    if (!emailOrUsername || emailOrUsername.trim().length === 0) {
      setEmailError(lang.err_email_required);
      hasError = true;
    }

    if (!password || password.trim().length === 0) {
      setPasswordError(lang.err_password_required);
      hasError = true;
    } else {
      const liveErr = validatePasswordLive(password);
      if (liveErr) {
        setPasswordError(liveErr);
        hasError = true;
      }
    }

    if (hasError) {
      showErrorToast(lang.toast_fill_fields);
      // clear inputs on validation error at submit
      setEmailOrUsername('');
      setPassword('');
      emailRef.current?.focus();
      return;
    }

    // --- CASE-SENSITIVE lookup: exact match required ---
    const found = users.find(
      (u: User) =>
        (u.email && u.email === emailOrUsername) ||
        (u.username && u.username === emailOrUsername)
    );

    if (!found) {
      setEmailError(lang.err_incorrect_credentials);
      setPasswordError(lang.err_incorrect_credentials);
      showErrorToast(lang.toast_incorrect_credentials);
      setEmailOrUsername('');
      setPassword('');
      emailRef.current?.focus();
      return;
    }

    // password check
    if (found.password !== password) {
      setEmailError(lang.err_incorrect_credentials);
      setPasswordError(lang.err_incorrect_credentials);
      showErrorToast(lang.toast_incorrect_credentials);
      setEmailOrUsername('');
      setPassword('');
      emailRef.current?.focus();
      return;
    }

    // CLEAR inputs BEFORE navigating
    setEmailOrUsername('');
    setPassword('');
    setEmailError('');
    setPasswordError('');

    //   // --- navigate to appropriate Footer based on role and pass params ---
    //   const routeName = found.role === 'admin' ? 'Footer_A' : 'Footer_C';
    //   const params = { userId: found.id, langId, role: found.role };

    //   console.log('LoginScreen -> navigating to', routeName, 'with params:', params);
    //   navigation.navigate(routeName as never, params as never);
    // };
    // --- navigate to appropriate screen based on role and pass params ---
    let routeName: string;
    if (found.role === 'admin') {
      routeName = 'Footer_A';
    } else if (found.role === 'employee') {
      routeName = 'Footer_C';
    } else if (found.role === 'superadmin') {
      // route for superadmin -> DashboardScreen
      routeName = 'DashboardScreen';
    } else {
      // fallback
      routeName = 'Footer_C';
    }

    const params = { userId: found.id, langId, role: found.role };

    // explicit console log showing destination and params
    console.log(`LoginScreen -> navigating to ${routeName} with params:`, params);

    navigation.navigate(routeName as never, params as never);
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <View style={styles.body}>
          <Image source={require('../../assets/icons/logo.png')} style={styles.logo} />

          <View style={styles.greeting_group}>
            <Text style={styles.greetingTitle}>{lang.welcome_back}</Text>
            <Text style={styles.greetingSubtitle}>{lang.please_sign_in}</Text>
          </View>

          <View style={styles.inputsContainer}>
            <InputBox
              label={lang.email_or_username_label}
              placeholder={lang.email_placeholder}
              value={emailOrUsername}
              setValue={(text) => handleEmailChange(text)}
              errorMessage={emailError}
              style={{ width: '100%' }}
              ref={emailRef}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              onBlur={handleEmailBlur}
            />

            <InputBox
              label={lang.password_label}
              placeholder={lang.password_placeholder}
              secureTextEntry={!showPassword}
              value={password}
              setValue={(text) => handlePasswordChange(text)}
              rightIcon={showPassword ? require('../../assets/icons/eye_open.png') : require('../../assets/icons/eye_close.png')}
              onRightIconPress={() => setShowPassword((s) => !s)}
              errorMessage={passwordError}
              style={{ width: '100%' }}
              ref={passwordRef}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
              onBlur={handlePasswordBlur}
            />
          </View>

          <View style={styles.signInBtnWrap}>
            <Button1 text={lang.sign_in_button} width={'90%'} onPress={handleSignIn} />
          </View>
        </View>
        <Toast config={toastConfig} />
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.secondary },
  body: {
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 24,
  },
  logo: {
    width: 143,
    height: 83,
    alignSelf: 'center',
    resizeMode: 'contain',
    marginTop: 80,
  },
  greeting_group: {
    marginTop: 30,
    alignItems: 'center',
    marginBottom: 30,
  },
  greetingTitle: {
    color: colors.text,
    fontSize: fonts.size.xl,
    fontFamily: fonts.family.medium,
    fontWeight: fonts.weight.medium as any,
  },
  greetingSubtitle: {
    color: colors.subtext3,
    fontSize: fonts.size.l,
    fontFamily: fonts.family.regular,
    fontWeight: fonts.weight.regular as any,
    marginTop: 6,
  },
  inputsContainer: {
    paddingHorizontal: 16,
  },
  signInBtnWrap: {
    marginTop: 10,
    alignItems: 'center',
  },
});

