
// screens/auth/LoginScreen.tsx
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  BackHandler,
  StyleSheet,
  Image,
  Text,
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

import { Button1 } from '../../components/Button';
import colors from '../../styles/Colors';
import fonts from '../../styles/Fonts';

import Toast, { showSuccessToast, showErrorToast, toastConfig } from '../../components/Toast';
import InputBox from '../../components/InputBox';

import api from '../../api/axiosInstance';
import { saveToken, saveUserId } from '../../api/auth/authToken';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../../api/Users';

const translations = require('../../assets/translations.json');

type LangId = 'en' | 'de';
type RouteParams = {
  LoginScreen: { langId?: LangId };
};

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'LoginScreen'>>();
  const langId: LangId | undefined = route.params?.langId;
  const lang = translations[(langId as string) || 'en'] ?? translations['en'];

  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [passwordError, setPasswordError] = useState<string>('');
  const [emailOrUsername, setEmailOrUsername] = useState<string>('');
  const [emailError, setEmailError] = useState<string>(''); // show backend errors

  const emailRef = useRef<TextInput | null>(null);
  const passwordRef = useRef<TextInput | null>(null);

  const [skipNextValidation, setSkipNextValidation] = useState(false);
  const [showBlueBorder, setShowBlueBorder] = useState(false);

  // password validation (live)
  const validatePasswordLive = (pwd: string): string => {
    if (!pwd || pwd.length === 0) return '';
    if (!/^[A-Za-z]/.test(pwd)) return lang.err_first_char_letter;
    if (!/^[A-Z]/.test(pwd[0])) return lang.err_first_capital;
    if (pwd.length < 5) return lang.err_pwd_length;
    if (!/\d/.test(pwd)) return lang.err_pwd_number;
    if (!/[!@#$%^&*(),.?":{}|<>_\-\\[\];'`~+=\/]/.test(pwd)) return lang.err_pwd_symbol;
    return '';
  };

  // handlers
  const handlePasswordChange = (text: string) => {
    setPassword(text);
    const liveErr = validatePasswordLive(text);
    setPasswordError(liveErr); // <-- this triggers red border
  };

  const handleEmailChange = (text: string) => {
    setEmailOrUsername(text);

    // clear email error as soon as user types
    if (emailError) setEmailError('');
  };

  // blur handlers
  const handleEmailBlur = () => {
    const liveError = validateEmailOrUsernameLive(emailOrUsername);
    setEmailError(liveError);
  };

  const handlePasswordBlur = () => {
    if (!password || password.trim().length === 0) {
      setPasswordError(lang.err_password_required);
    } else {
      const liveErr = validatePasswordLive(password);
      setPasswordError(liveErr); // shows error until password is valid
    }
  };

  // clear fields on screen focus
  useFocusEffect(
    useCallback(() => {
      setEmailOrUsername('');
      setPassword('');
      setEmailError('');
      setPasswordError('');
      return () => { };
    }, [])
  );

  // disable Android hardware back on login screen
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const onBackPress = () => true;
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // utility: safely parse errors from server
  const safeParseErrors = (data: any): string[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data.map(it => (typeof it === 'string' ? it : JSON.stringify(it)));
    if (data.errors && typeof data.errors === 'object') {
      return Object.keys(data.errors).flatMap(k => {
        const v = data.errors[k];
        if (Array.isArray(v)) return v;
        if (v) return [String(v)];
        return [];
      });
    }
    if (data.message) return [String(data.message)];
    if (data.error) return [String(data.error)];
    return [];
  };

  // helper to detect email
  const isEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

  const validateEmailOrUsernameLive = (text: string): string => {
    if (!text || text.trim().length === 0) return lang.err_email_required;
    // If it's an email, check basic email format
    if (isEmail(text) && !/\S+@\S+\.\S+/.test(text)) return lang.err_invalid_email;
    // For username, no restriction on case
    return ''; // valid
  };

  // helper: determine whether response indicates authentication failure
  const looksLikeAuthFailure = (status: number | undefined, errsArray: string[], rawMessage?: string) => {
    const combined = errsArray.join(' ').toLowerCase() + ' ' + (rawMessage || '').toLowerCase();
    if (!combined) {
      // fallback: 401 or 400 often means invalid credentials
      return status === 401 || status === 400;
    }
    return /invalid credentials|incorrect password|wrong password|user not found|invalid username|invalid email|unauthorized/i.test(combined);
  };

  // sign-in
  const handleSignIn = async () => {
    // Skip validation once after backend auth failure
    if (skipNextValidation) {
      setSkipNextValidation(false);
    } else {
      // Clear previous errors
      setEmailError('');
      setPasswordError('');
      let hasError = false;

      // Frontend validation: empty fields
      if (!emailOrUsername || emailOrUsername.trim().length === 0) {
        setEmailError(lang.err_email_required);
        hasError = true;
      } else {
        setEmailError('');
      }

      if (!password || password.trim().length === 0) {
        setPasswordError(lang.err_password_required);
        hasError = true;
      } else {
        const liveErr = validatePasswordLive(password);
        if (liveErr) {
          setPasswordError(liveErr);
          hasError = true;
        } else {
          setPasswordError('');
        }
      }

      if (hasError) {
         Keyboard.dismiss(); // ✅ hide keyboard when showing error
        showErrorToast(lang.toast_fill_fields);
        return;
      }
    }

    // Build payload
    const payload = isEmail(emailOrUsername)
      ? { email: emailOrUsername, password }
      : { username: emailOrUsername, password };

    try {
      const resp = await api.post('/login', payload, {
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });

      const data = resp.data ?? {};

      // success path
      // success path
if (resp.status === 200 || resp.status === 201) {
  const token: string | undefined = data.token || data.accessToken || data.access_token;
  const user: User | undefined = data.user || data.data?.user;

  if (!token || !user) {
    setEmailOrUsername('');
    setPassword('');
    setEmailError('');
    setPasswordError('');
    emailRef.current?.focus();
    showErrorToast(lang.toast_incorrect_credentials);
    setSkipNextValidation(true);
    return;
  }

  // Save token + userId
  const userId = user.id ?? (user as any)._id ?? null;
  await saveToken(token);
  if (userId) await saveUserId(userId);

  // Save full user object locally
  try {
    await AsyncStorage.setItem('userObj', JSON.stringify(user));
  } catch (e) {
    console.warn('Failed to save full user object locally', e);
  }

  // ✅ Extract username from user object
  const username = user.username ?? '';

  showSuccessToast(lang.toast_login_success || 'Signed in');

  const role = user.role ?? data.role ?? 'employee';
  const routeMap: Record<string, string> = {
    admin: 'Footer_A',
    employee: 'Footer_C',
    superadmin: 'DashboardScreen',
  };
  const routeName = routeMap[role] || 'Footer_C';
  const params = { userId, langId, role };

  // ✅ Log token, userId, role, username
  console.log('Login success:', { token, userId, role, username });

  setEmailOrUsername('');
  setPassword('');
  navigation.navigate(routeName as never, params as never);
  return;
}


      // Backend failure handling
      const errsArray = safeParseErrors(data);
      const rawMessage = (data && (data.message || data.error)) ? String(data.message || data.error) : '';

      // If it looks like auth failure, clear both inputs and skip next validation
      if (looksLikeAuthFailure(resp.status, errsArray, rawMessage)) {
         Keyboard.dismiss(); // ✅ hide keyboard when showing error
        setEmailOrUsername('');
        setPassword('');
        setEmailError('');
        setPasswordError('');
        emailRef.current?.focus();
        setSkipNextValidation(true);

        const errMsg = errsArray.length > 0 ? errsArray[0] : (rawMessage || lang.toast_incorrect_credentials);
        showErrorToast(errMsg || lang.toast_incorrect_credentials);
        console.warn('Auth failure on login', { status: resp.status, data: resp.data });
        return;
      }

      // Otherwise, handle field-specific messages where possible
      if (errsArray.length > 0) {
        errsArray.forEach(err => {
          const lower = err.toLowerCase();

          if (lower.includes('password') || lower.includes('wrong password') || lower.includes('incorrect password')) {
            // Password error → clear password
             Keyboard.dismiss(); // ✅ hide keyboard for error toast
            setPassword('');
            setPasswordError(err);
            setEmailError('');
            passwordRef.current?.focus();
          } else if (
            lower.includes('user not found') ||
            lower.includes('invalid username') ||
            lower.includes('invalid email') ||
            lower.includes('username') ||
            lower.includes('email')
          ) {
               Keyboard.dismiss(); // ✅ hide keyboard for error toast
            // Email/username error → clear email
            setEmailOrUsername('');
            setEmailError(err);
            setPasswordError('');
            emailRef.current?.focus();
          } else {
               Keyboard.dismiss(); // ✅ hide keyboard for unknown error toast
            // Unknown error → toast
              Keyboard.dismiss(); // ✅ hide keyboard for toast
            showErrorToast(err);
          }
        });

        return;
      }

      // fallback
      showErrorToast(`Server returned ${resp.status}`);
      console.warn('Login failed (fallback)', { status: resp.status, data: resp.data });

    } catch (err: any) {
      console.warn('Login error (exception)', err);
      const msg = err?.response?.data?.message || err?.message || 'Login failed';

      // If exception appears to be auth-related, clear both fields and skip validation
      if (/invalid credentials|user not found|incorrect password|wrong password|invalid username|invalid email|unauthorized/i.test(String(msg))) {
        setEmailOrUsername('');
        setPassword('');
        setEmailError('');
        setPasswordError('');
        emailRef.current?.focus();
        setSkipNextValidation(true);
        showErrorToast(String(msg));
        return;
      }

      showErrorToast(msg);
    }
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
              setValue={handleEmailChange}
              errorMessage={emailError || ''}
              ref={emailRef}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              forceBlueBorder={showBlueBorder} // <-- new prop
            />


            <InputBox
              label={lang.password_label}
              placeholder={lang.password_placeholder}
              secureTextEntry={showPassword ? false : false} // same as above
              value={password}
              setValue={handlePasswordChange}
              rightIcon={showPassword ? require('../../assets/icons/eye_open.png') : require('../../assets/icons/eye_close.png')}
              onRightIconPress={() => setShowPassword(s => !s)}
              errorMessage={passwordError || ''}
              ref={passwordRef}
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
              forceBlueBorder={showBlueBorder} // <-- new prop
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