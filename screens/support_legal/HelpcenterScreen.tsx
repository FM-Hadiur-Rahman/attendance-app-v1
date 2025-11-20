import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Image,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Header from '../../components/Header';
import colors from '../../styles/Colors';
import fonts from '../../styles/Fonts';
import { getBranchById, getAllBranches } from '../../api/Branchs';
import { toastConfig, showSuccessToast, showErrorToast } from '../../components/Toast';

type RootStackParamList = {
  HelpCenterScreen: {
    userId?: string;
    UserId?: string;
    langId?: string;
    LangId?: string;
    branchId?: string;
    BranchId?: string;
    id?: string;
    language?: string;
    branch?: string;
  };
};

const translations = require('../../assets/translations.json');

const HelpCenterScreen: React.FC = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, 'HelpCenterScreen'>>();

  const incomingUserId =
    route.params?.userId ??
    route.params?.UserId ??
    route.params?.id ??
    null;

  const incomingLangId =
    route.params?.langId ??
    route.params?.LangId ??
    route.params?.language ??
    'en';

  const incomingBranchId =
    route.params?.branchId ??
    route.params?.BranchId ??
    route.params?.branch ??
    null;

  console.log('HelpCenterScreen -> received params:', {
    userId: incomingUserId,
    langId: incomingLangId,
    branchId: incomingBranchId,
  });

  const lang = translations[(incomingLangId as string) || 'en'] ?? translations['en'];

  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [sending, setSending] = useState(false);

  const [branchEmail, setBranchEmail] = useState<string | null>(null);
  const [resolvingBranch, setResolvingBranch] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve branch email on mount or when incomingBranchId changes
  useEffect(() => {
    let mounted = true;
    const resolveBranchEmail = async () => {
      if (!mounted) return;
      setResolvingBranch(true);

      try {
        if (incomingBranchId) {
          console.log('HelpCenterScreen -> attempting getBranchById', incomingBranchId);
          try {
            const branch = await getBranchById(incomingBranchId);
            const email = branch?.email ?? null;
            if (email) {
              if (mounted) {
                setBranchEmail(String(email));
                console.log('HelpCenterScreen -> branch email from getBranchById:', email);
                setResolvingBranch(false);
                return;
              }
            } else {
              console.warn('HelpCenterScreen -> branch has no email, will try fallback');
            }
          } catch (err) {
            console.warn('HelpCenterScreen -> getBranchById failed:', err);
          }
        }

        // fallback: fetch all branches and pick first with an email
        console.log('HelpCenterScreen -> fetching all branches as fallback');
        const all = await getAllBranches();
        const firstWithEmail = (all || []).find((b: any) => b?.email);
        if (firstWithEmail?.email) {
          if (mounted) {
            setBranchEmail(String(firstWithEmail.email));
            console.log('HelpCenterScreen -> fallback branch email:', firstWithEmail.email, 'branchId:', firstWithEmail._id);
            setResolvingBranch(false);
            return;
          }
        }

        console.warn('HelpCenterScreen -> no branch email found in API results');
        if (mounted) setBranchEmail(null);
      } catch (err) {
        console.error('HelpCenterScreen -> error resolving branch email', err);
        if (mounted) setBranchEmail(null);
      } finally {
        if (mounted) setResolvingBranch(false);
      }
    };

    resolveBranchEmail();
    return () => { mounted = false; };
  }, [incomingBranchId]);

  const handleChange = (key: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  const validate = () => {
    const { name, email, message } = formData;
    const newErrors: typeof errors = {};

    if (!name.trim()) newErrors.name = lang.err_name_required ?? 'Name is required.';
    if (!email.trim()) newErrors.email = lang.Email_is_required ?? 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = lang.err_invalid_email ?? 'Invalid email address.';
    if (!message.trim()) newErrors.message = lang.err_message_required ?? 'Message is required.';
    else if (message.trim().length < 10) newErrors.message = lang.err_message_length ?? 'Message must be at least 10 characters.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      showErrorToast(lang.Please_fill_all_fields_correctly ?? 'Please fill all fields correctly');
      console.log('HelpCenterScreen -> validation failed', { errors });
      return;
    }

    if (!branchEmail) {
      showErrorToast(lang.toast_no_branch_email ?? 'Branch email not found. Please try again later.');
      console.warn('HelpCenterScreen -> abort submit, no branchEmail resolved', { incomingBranchId });
      return;
    }

    setSending(true);
    const { name, email, message } = formData;

    const mailto = `mailto:${encodeURIComponent(branchEmail)}?subject=${encodeURIComponent(
      `${lang.help_subject_prefix ?? 'Help Request from'} ${name}`,
    )}&body=${encodeURIComponent(`${lang.name_label ?? 'Name'}: ${name}\n${lang.email_label ?? 'Email'}: ${email}\n${lang.message_label ?? 'Message'}: ${message}`)}`;

    try {
      console.log('HelpCenterScreen -> opening mailto to branchEmail:', branchEmail, { mailto, userId: incomingUserId, langId: incomingLangId, branchId: incomingBranchId });
      const supported = await Linking.canOpenURL(mailto);
      if (supported) {
        await Linking.openURL(mailto);
        showSuccessToast(lang.toast_mail_client_opened ?? 'Mail client opened');
        setFormData({ name: '', email: '', message: '' });
      } else {
        showErrorToast(lang.toast_no_mail_app ?? 'No mail app found');
      }
    } catch (err) {
      console.error('HelpCenterScreen -> Error opening mail app', err);
      showErrorToast(lang.toast_mail_failed ?? 'Failed to open mail app');
    } finally {
      setSending(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={styles.headerWrapper}>
        <Header
          backgroundColor={colors.secondary}
          position="relative"
          left={{
            type: 'image',
            url: require('../../assets/icons/back_b.png'),
            width: 24,
            height: 24,
            onPress: () => navigation.goBack(),
          }}
          center={{ type: 'text', value: lang.help_center ?? 'Help Center', color: colors.text }}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <View style={styles.entire_group}>
          <Text style={styles.title}>{lang.lets_talk ?? "Let's talk"}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default HelpCenterScreen;

const styles = StyleSheet.create({
  headerWrapper: {
    width: '100%',
    backgroundColor: colors.secondary,
  },
  scrollContent: {
    paddingBottom: 20,
    backgroundColor: colors.secondary,
  },
  entire_group: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    width: '100%',
    fontFamily: 'Montserrat',
    fontWeight: '600',
    fontSize: 16,
    lineHeight: 16,
    color: colors.text,
    marginBottom: 20,
    marginTop: 20,
  },
});