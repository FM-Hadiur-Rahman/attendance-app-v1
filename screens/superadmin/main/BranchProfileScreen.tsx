// screens/main/BranchProfileScreen.tsx
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
  ActivityIndicator,
  Dimensions,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
// API helpers
import { fetchUsers, updateUser } from "../../../api/profile";
import { getBranchById, listBranchNames, updateBranch, getAllBranches } from "../../../api/Branchs";
//import { getBranchById, listBranchNames } from "../../../api/Branchs";

const { width: deviceWidth } = Dimensions.get("window");
const base = deviceWidth / 440;

const GEO_CACHE_KEY = 'branch_geo_cache_v1';
// country list (to detect code / flag)
import { countryList } from "../../../components/Code";

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

  // branchId passed from previous screen
  const propBranchId = props?.branchId;
  const routeBranchId = route.params?.branchId ?? route.params?.id ?? null;
  const branchId = propBranchId || routeBranchId;
  const [allBranches, setAllBranches] = useState<any[]>([]);

  const initialLang = propLangId || routeLangId || "en";

  const [selectedCountry, setSelectedCountry] = useState<any>(countryList[2] || countryList[0]); // default "English" item in list
  const [selectedLanguage, setSelectedLanguage] = useState(initialLang);
  const [tempLanguage, setTempLanguage] = useState(selectedLanguage);

  const [branchNameError, setBranchNameError] = useState('');
  const [managerError, setManagerError] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string>('');
  const [latError, setLatError] = useState<string>('');
  const [lonError, setLonError] = useState<string>('');
  const [existingBranchNames, setExistingBranchNames] = useState<string[]>([]);

  useEffect(() => {
    if (propLangId && propLangId !== selectedLanguage) {
      setSelectedLanguage(propLangId);
      setTempLanguage(propLangId);
    }
  }, [propLangId]);

  const [refreshing, setRefreshing] = useState(false);
  const phoneRef = useRef<TextInput | any>(null);

  // values (now initially empty until loaded from API)
  const [branchName, setbranchName] = useState("");
  const [managerName, setManagerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState(""); // displayed local-format phone (e.g. 0761234555)
  const [branchAddress, setBranchAddress] = useState("");
  const [latitude, setLatitude] = useState<string | undefined>(undefined);
  const [longitude, setLongitude] = useState<string | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [branchEmail, setBranchEmail] = useState("");
  // manager user id (admin) for this branch
  const [adminUserId, setAdminUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // temporary inputs & modal visibility for each editable field
  const [branchnameModalVisible, setbranchnameModalVisible] = useState(false);
  const [branchnameInput, setbranchnameInput] = useState(branchName);

  const [managerModalVisible, setManagerModalVisible] = useState(false);
  const [managerInput, setManagerInput] = useState(managerName);

  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneInput, setPhoneInput] = useState(phoneNumber);

  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [addressLatInput, setAddressLatInput] = useState(latitude ?? "");
  const [addressLonInput, setAddressLonInput] = useState(longitude ?? "");

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => setbranchnameInput(branchName), [branchName]);
  useEffect(() => setManagerInput(managerName), [managerName]);
  useEffect(() => setPhoneInput(phoneNumber), [phoneNumber]);
  useEffect(() => setAddressLatInput(latitude ?? ""), [latitude]);
  useEffect(() => setAddressLonInput(longitude ?? ""), [longitude]);

  // -----------------------
  // Utility: reverse geocode (simple, no cache)
  // -----------------------
  const geocodeOnce = async (lat: number, lon: number): Promise<string> => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mr-Baker-App/1.0 (contact)',
          Accept: 'application/json',
        },
      });
      clearTimeout(timeout);
      if (!res.ok) return `${lat}, ${lon}`;
      const json = await res.json();
      return (json?.display_name as string) || `${lat}, ${lon}`;
    } catch (e) {
      return `${lat}, ${lon}`;
    }
  };

  // -----------------------
  // Utility: detect country code from E.164-ish string
  // returns { code, item }
  // -----------------------
  const detectCountryFromE164 = (raw: string) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    let matched: any = null;
    let matchedCode = '';
    for (const c of countryList) {
      if (!c.code) continue;
      if (digits.startsWith(c.code) && c.code.length >= matchedCode.length) {
        matched = c;
        matchedCode = c.code;
      }
    }
    if (!matched) return null;
    const local = digits.slice(matchedCode.length);
    // display local with leading 0 if not present
    const displayLocal = local.startsWith('') ? local : `${local}`;
    return { matched, code: matchedCode, local, displayLocal };
  };

  // tolerance for float equality (very small)
  const COORD_TOLERANCE = 1e-6;

  const normalizeBranchCoord = (b: any) => {
    // branch may store coords in different ways: b.latitude/b.longitude OR b.location.coordinates (lon,lat)
    let lat: number | undefined = undefined;
    let lon: number | undefined = undefined;

    if (b == null) return { lat: undefined, lon: undefined };

    if (b.latitude !== undefined && b.longitude !== undefined) {
      lat = Number(b.latitude);
      lon = Number(b.longitude);
    } else if (b.location && Array.isArray(b.location.coordinates) && b.location.coordinates.length >= 2) {
      lon = Number(b.location.coordinates[0]);
      lat = Number(b.location.coordinates[1]);
    }

    if (!isFinite(lat) || !isFinite(lon)) return { lat: undefined, lon: undefined };
    return { lat, lon };
  };

  /**
   * returns true if some other branch (not current branchId) already has exactly the same lat+lon
   */
  const isCoordinatesDuplicate = (latStr: string, lonStr: string): boolean => {
    // quick checks
    if (!latStr || !lonStr) return false;
    const lat = Number(latStr);
    const lon = Number(lonStr);
    if (!isFinite(lat) || !isFinite(lon)) return false;

    for (const b of allBranches) {
      if (!b) continue;
      if (!b._id) continue;
      // ignore current branch
      if (branchId && String(b._id) === String(branchId)) continue;

      const { lat: bl, lon: blo } = normalizeBranchCoord(b);
      if (bl === undefined || blo === undefined) continue;

      if (Math.abs(bl - lat) < COORD_TOLERANCE && Math.abs(blo - lon) < COORD_TOLERANCE) {
        return true;
      }
    }
    return false;
  };

  // fetch branch-by-id when branchId changes
  useEffect(() => {
    loadData();
  }, [branchId]);

  // fetch existing branch names once on mount (move out of loadData)
  useEffect(() => {
    const fetchAllBranchesData = async () => {
      try {
        const [names, branches] = await Promise.all([listBranchNames(), getAllBranches()]);
        setExistingBranchNames(names);
        setAllBranches(branches || []);
      } catch (e) {
        console.warn('Failed to fetch branch names / list', e);
        // fallback: try individually
        try {
          const names = await listBranchNames().catch(() => []);
          setExistingBranchNames(names);
        } catch { }
        try {
          const branches = await getAllBranches().catch(() => []);
          setAllBranches(branches);
        } catch { }
      }
    };
    fetchAllBranchesData();
  }, []);

  const loadData = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      // fetch branch using api helper
      const b = await getBranchById(branchId);

      const branchEmailRaw = b?.email ?? '';
      setBranchEmail(branchEmailRaw);

      const name = b?.name ?? '';
      setbranchName(name);

      // coordinates may be in b.location.coordinates => [lon, lat]
      let lat: number | undefined = undefined;
      let lon: number | undefined = undefined;
      if (Array.isArray(b?.location?.coordinates) && b.location.coordinates.length >= 2) {
        lon = Number(b.location.coordinates[0]);
        lat = Number(b.location.coordinates[1]);
      } else if (b?.latitude && b?.longitude) {
        lat = Number(b.latitude);
        lon = Number(b.longitude);
      }
      if (lat != null && lon != null) {
        setLatitude(String(lat));
        setLongitude(String(lon));
        const addr = await geocodeOnce(lat, lon);
        setBranchAddress(addr);
      } else {
        setBranchAddress(b?.address ?? '');
      }

      // ---- NEW: prefer branch.phone (from /branch/:id) as the phone source ----
      // This is the one change you asked for: prior code used admin.phone (user). Now use branch.phone.
      const branchPhoneRaw = b?.phone ?? '';
      if (branchPhoneRaw) {
        const detected = detectCountryFromE164(branchPhoneRaw);
        if (detected) {
          setSelectedCountry(detected.matched);
          setPhoneNumber(detected.displayLocal);
        } else {
          setPhoneNumber(branchPhoneRaw.replace(/\D/g, ''));
        }
      } else {
        // Optionally leave blank or fallback (unchanged behavior otherwise)
        setPhoneNumber('');
      }

      // --- fetch admins and pick the manager (no longer used for phone) ---
      try {
        const ures = await fetchUsers({ role: 'admin', limit: 1000 });
        const users = ures?.users ?? [];

        // find the admin whose branch._id OR branch (string) === branchId
        const admin = users.find((u: any) => {
          const ub = u?.branch;
          const branchFromUser = typeof ub === 'string' ? ub : ub?._id ?? undefined;
          return branchFromUser === branchId && u?.role === 'admin';
        }) ?? null;

        if (admin) {
          setAdminUserId(admin._id ?? admin.id ?? null);
          setManagerName(admin.fullname ?? admin.username ?? '');
          setUsername(admin.username ?? '');
          // do NOT set phoneNumber from admin (we now read branch.phone)
          setPassword('******');
        } else {
          setAdminUserId(null);
          setManagerName('');
          setUsername('');
          // do not clear phoneNumber here (we already set from branch)
        }
      } catch (e) {
        console.warn('Failed to fetch admin users', e);
        // keep branch phone as-is
      }
    } catch (err: any) {
      console.warn('loadData failed', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };


  useEffect(() => {
    loadData();
  }, [branchId]);

  const getItemValue = (id: string) => {
    let raw: any = '';
    switch (id) {
      case 'branchName':
        raw = branchName;
        break;
      case 'managerName':
        raw = managerName;
        break;
      case 'phoneNumber':
        raw = phoneNumber;
        // show phone WITH country code in the cartbox value (e.g. +94123456789)
        {
          const local = (phoneNumber || '').replace(/\D/g, '');
          const code = selectedCountry?.code ?? '';
          // ensure leading + on code
          const codeWithPlus = code ? (code.startsWith('') ? code : `+${code}`) : '';
          const full = codeWithPlus ? `${codeWithPlus}${local}` : (phoneNumber ?? '');
          raw = full;
        }
        break;
      case 'branchAddress':
        raw = branchAddress;
        break;
      case 'email':
        raw = branchEmail;
        break;
      case 'username':
        raw = username;
        break;
      case 'password':
        raw = showPassword ? password : '********';
        break;
      default:
        raw = '';
        break;
    }

    // normalize to string
    if (raw === null || raw === undefined) return lang.undefined;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      return trimmed === '' ? lang.undefined : trimmed;
    }
    // for numbers/other types convert to string
    try {
      const s = String(raw);
      return s.trim() === '' ? lang.undefined : s;
    } catch {
      return lang.undefined;
    }
  };

  const handleAddressLatChange = (val: string) => {
    setAddressLatInput(val);
    // clear previous error while typing
    if (latError) setLatError('');
    if (lonError) setLonError('');

    // only validate when both fields have values (live feedback)
    if (val && addressLonInput) {
      if (isCoordinatesDuplicate(val, addressLonInput)) {
        const msg = lang.Coordinates_already_exist_in_other_branch;
        setLatError(msg);
        setLonError(msg);
      }
    }
  };

  const handleAddressLonChange = (val: string) => {
    setAddressLonInput(val);
    if (latError) setLatError('');
    if (lonError) setLonError('');

    if (addressLatInput && val) {
      if (isCoordinatesDuplicate(addressLatInput, val)) {
        const msg = lang.Coordinates_already_exist_in_other_branch;
        setLatError(msg);
        setLonError(msg);
      }
    }
  };

  // open modal only for editable fields (branchName, managerName, phoneNumber, branchAddress)
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
        setAddressModalVisible(true);
        break;
      default:
        break;
    }
  };

  const saveBranchName = async () => {
    if (!branchId) return;

    if (!branchnameInput.trim()) {
      setBranchNameError(lang.Input_cannot_be_empty);
      return;
    }
    if (existingBranchNames.includes(branchnameInput.trim()) && branchnameInput.trim() !== branchName) {
      setBranchNameError(lang.Branch_already_exists);
      return;
    }

    try {
      await updateBranch(branchId, { name: branchnameInput });
      setbranchName(branchnameInput);
      setbranchnameModalVisible(false);
      showSuccessToast(lang.Branch_name_updated_successfully);
    }
    catch (e: any) {
      console.warn('saveBranchName failed', e?.response?.data ?? e);

      if (String(e?.message || e?.response?.data?.message || '').includes('duplicate') || String(e).includes('E11000')) {
        setBranchNameError(lang.Branch_already_exists);
      } else {
        showErrorToast(lang.Failed_to_save);
      }
    }
  };

  const saveManager = async () => {
    if (!adminUserId) {
      showErrorToast(lang.No_manager_to_update);
      return;
    }
    // validate not empty
    if (!managerInput || managerInput.trim() === '') {
      setManagerError(lang.Input_can_not_be_empty);
      return;
    }
    try {
      setManagerError('');
      await updateUser(adminUserId, { fullname: managerInput });
      setManagerName(managerInput);
      setManagerModalVisible(false);
      showSuccessToast(lang.Manager_name_updated_successfully);
    } catch (e: any) {
      console.warn('saveManager failed', e?.response?.data ?? e);
      const errText =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        '';

      if (String(errText).includes('duplicate') || String(errText).includes('E11000')) {
        setManagerError(lang.Manager_name_already_exists);
      } else {
        showErrorToast(lang.Failed_to_update_Manager_name);
      }
    }
  };
  //save phone
  // const savePhone = async () => {
  //   if (!adminUserId) {
  //     showErrorToast(lang?.No_manager || 'No manager to update');
  //     return;
  //   }

  //   // empty validation
  //   if (!phoneInput || phoneInput.trim() === '') {
  //     setPhoneError('Input can not be empty');
  //     return;
  //   }

  //   try {
  //     // clear previous error
  //     setPhoneError('');

  //     // normalize phone: remove non digits, drop leading 0, prefix country code
  //     let digits = (phoneInput || '').replace(/\D/g, '');
  //     if (digits.startsWith('0')) digits = digits.slice(1);
  //     const e164 = `${selectedCountry?.code || ''}${digits}`;

  //     await updateUser(adminUserId, { phone: e164 });

  //     // update displayed phone
  //     setPhoneNumber(phoneInput);
  //     setPhoneModalVisible(false);
  //     showSuccessToast('Number Updated successfully');
  //   } catch (e: any) {
  //     console.warn('savePhone failed', e?.response?.data ?? e);
  //     // optional: parse duplicate / backend errors here if needed
  //     showErrorToast(lang?.Failed_to_save || 'Failed to save');
  //   }
  // };


  // const savePhone = async () => {
  //   if (!branchId) {
  //     showErrorToast(lang.Failed_to_save);
  //     return;
  //   }

  //   // empty validation
  //   if (!phoneInput || phoneInput.trim() === '') {
  //     setPhoneError('Input can not be empty');
  //     return;
  //   }

  //   try {
  //     // clear previous error
  //     setPhoneError('');

  //     // normalize phone: remove non digits, drop leading 0, prefix country code
  //     let digits = (phoneInput || '').replace(/\D/g, '');
  //     if (digits.startsWith('0')) digits = digits.slice(1);
  //     const e164 = `${selectedCountry?.code || ''}${digits}`;

  //     // <-- update branch phone (not user) -->
  //     const updated = await updateBranch(branchId, { phone: e164 });

  //     // update displayed phone using same detect logic (use branch's returned phone if present)
  //     const branchPhoneRaw = updated?.phone ?? e164;
  //     const detected = detectCountryFromE164(branchPhoneRaw);
  //     if (detected) {
  //       setSelectedCountry(detected.matched);
  //       setPhoneNumber(detected.displayLocal);
  //     } else {
  //       setPhoneNumber(branchPhoneRaw.replace(/\D/g, ''));
  //     }

  //     setPhoneModalVisible(false);
  //     showSuccessToast(lang.phoneUpdated);
  //   } catch (e: any) {
  //     console.warn('savePhone failed', e?.response?.data ?? e);
  //     setPhoneError('');
  //     showErrorToast(lang.Failed_to_save);
  //   }
  // };

    const savePhone = async () => {
    if (!branchId) {
      showErrorToast(lang.Failed_to_save);
      return;
    }

    // empty validation
    if (!phoneInput || phoneInput.trim() === '') {
      setPhoneError('Input can not be empty');
      return;
    }

    try {
      // clear previous error
      setPhoneError('');

      // normalize phone: remove non digits, drop leading 0, prefix country code
      let digits = (phoneInput || '').replace(/\D/g, '');
      if (digits.startsWith('0')) digits = digits.slice(1);
      const e164 = `${selectedCountry?.code || ''}${digits}`;

      // update branch phone (primary)
      const updatedBranch = await updateBranch(branchId, { phone: e164 });

      // update displayed phone using returned branch phone if present
      const branchPhoneRaw = updatedBranch?.phone ?? e164;
      const detected = detectCountryFromE164(branchPhoneRaw);
      if (detected) {
        setSelectedCountry(detected.matched);
        setPhoneNumber(detected.displayLocal);
      } else {
        setPhoneNumber(branchPhoneRaw.replace(/\D/g, ''));
      }

      // attempt to update the manager user phone too (best-effort)
      if (adminUserId) {
        try {
          await updateUser(adminUserId, { phone: e164 });
        } catch (userErr) {
          console.warn('Failed to update admin user phone (non-fatal):', userErr);
          // optionally notify the user but don't rollback branch update
          showErrorToast(lang?.Failed_to_update_Manager_phone || 'Failed to update manager phone');
        }
      }

      setPhoneModalVisible(false);
      showSuccessToast(lang.phoneUpdated);
    } catch (e: any) {
      console.warn('savePhone failed', e?.response?.data ?? e);
      setPhoneError('');
      showErrorToast(lang.Failed_to_save);
    }
  };


  const handleBranchNameChange = (text: string) => {
    setbranchnameInput(text);

    if (!text.trim()) {
      setBranchNameError(lang.Input_cannot_be_empty);
    } else if (existingBranchNames.includes(text.trim()) && text.trim() !== branchName) {
      setBranchNameError(lang.Branch_already_exists);
    } else {
      setBranchNameError('');
    }
  };

  // const saveAddress = async () => {
  //   if (!branchId) return;

  //   const lat = (addressLatInput ?? '').toString().trim();
  //   const lon = (addressLonInput ?? '').toString().trim();

  //   setLatError('');
  //   setLonError('');

  //   let hasError = false;
  //   if (!lat) { setLatError('Input can not be empty'); hasError = true; }
  //   if (!lon) { setLonError('Input can not be empty'); hasError = true; }
  //   if (hasError) return;

  //   try {
  //     const payload: any = { latitude: String(lat), longitude: String(lon) };
  //     const updated = await updateBranch(branchId, payload);

  //     // prefer returned updated values if backend returns them
  //     setLatitude(updated.latitude ?? payload.latitude ?? latitude);
  //     setLongitude(updated.longitude ?? payload.longitude ?? longitude);

  //     const addr = await geocodeOnce(Number(updated.latitude ?? payload.latitude), Number(updated.longitude ?? payload.longitude));
  //     setBranchAddress(addr);

  //     setAddressModalVisible(false);
  //     showSuccessToast('Address updated successfully');
  //     // In BranchProfileScreen.tsx - at top add:


  // // and keep same GEO_CACHE_KEY as BranchScreen:
  // const GEO_CACHE_KEY = 'branch_geo_cache_v1';

  // // Then, in saveAddress() after successful update (before/after showSuccessToast):
  // try {
  //   // invalidate geo cache for this branch so BranchScreen will re-geocode next fetch
  //   const raw = await AsyncStorage.getItem(GEO_CACHE_KEY);
  //   if (raw) {
  //     const map = JSON.parse(raw) as Record<string, any>;
  //     if (map && map[branchId]) {
  //       delete map[branchId];
  //       await AsyncStorage.setItem(GEO_CACHE_KEY, JSON.stringify(map));
  //     }
  //   }
  // } catch (cacheErr) {
  //   // ignore cache errors - this is best-effort
  //   console.warn('Failed to clear geo cache for branch', cacheErr);
  // }

  //   } catch (e: any) {
  //     console.warn('saveAddress failed', e?.response?.data ?? e);
  //     showErrorToast(lang?.Failed_to_save || 'Failed to save');
  //   }
  // };

  const saveAddress = async () => {
    if (!branchId) return;

    const lat = (addressLatInput ?? '').toString().trim();
    const lon = (addressLonInput ?? '').toString().trim();

    setLatError('');
    setLonError('');

    let hasError = false;
    if (!lat) { setLatError('Input can not be empty'); hasError = true; }
    if (!lon) { setLonError('Input can not be empty'); hasError = true; }
    if (hasError) return;

    // check duplicate coords (you already have isCoordinatesDuplicate)
    if (isCoordinatesDuplicate(lat, lon)) {
      const msg = lang.Coordinates_already_exist_in_other_branch;
      setLatError(msg);
      setLonError(msg);
      return;
    }

    try {
      const payload: any = { latitude: String(lat), longitude: String(lon) };
      const updated = await updateBranch(branchId, payload);

      // prefer returned updated values if backend returns them
      setLatitude(updated.latitude ?? payload.latitude ?? latitude);
      setLongitude(updated.longitude ?? payload.longitude ?? longitude);

      const addr = await geocodeOnce(Number(updated.latitude ?? payload.latitude), Number(updated.longitude ?? payload.longitude));
      setBranchAddress(addr);

      // invalidate local geo cache for this branch so BranchScreen will re-geocode next time
      try {
        const raw = await AsyncStorage.getItem(GEO_CACHE_KEY);
        if (raw) {
          const map = JSON.parse(raw) as Record<string, any>;
          if (map && map[branchId]) {
            delete map[branchId];
            await AsyncStorage.setItem(GEO_CACHE_KEY, JSON.stringify(map));
          }
        }
      } catch (cacheErr) {
        console.warn('Failed to clear geo cache for branch', cacheErr);
      }

      setAddressModalVisible(false);
      showSuccessToast(lang.Address_updated_successfully);
    } catch (e: any) {
      console.warn('saveAddress failed', e?.response?.data ?? e);
      showErrorToast(lang.Failed_to_save);
    }
  };
  const sections = [
    {
      name: lang.Branch_Information,
      title: "General",
      items: [
        { id: 'branchName', label: "Branch name", labelname: lang.Branch_name, icon: require("../../../assets/icons/branch_b.png") },
        { id: 'managerName', label: "Manager name", labelname: lang.Manager_name, icon: require("../../../assets/icons/p_profile_b.png") },
        { id: 'email', label: "Email", labelname: "Email", icon: require("../../../assets/icons/p_email_blue.png") },
        { id: 'phoneNumber', label: "Phone number", labelname: lang.phoneNumber, icon: require("../../../assets/icons/p_phone_b.png") },
        { id: 'branchAddress', label: "Branch address", labelname: lang.Branch_address_latitude, icon: require("../../../assets/icons/p_location_b.png") },

      ],
    },
    {
      name: lang.login_account_details,
      title: "credentials",
      items: [
        { id: 'username', label: "username", labelname: lang.username, icon: require("../../../assets/icons/p_profile_b.png") },
        // { id: 'password', label: "password", labelname: lang.password, icon: require("../../../assets/icons/p_lock_b.png") },
      ],
    },
  ];

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

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              colors={[colors.primary]}
              onRefresh={() => { setRefreshing(true); loadData(); }}
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
                    onPress={() => {
                      // only open modal for editable ids
                      if (['branchName', 'managerName', 'phoneNumber', 'branchAddress'].includes(item.id)) {
                        openModalFor(item.id);
                      }
                    }}
                    alignItems="flex-start"
                    borderRadius={0}
                    paddingTop={12}
                    paddingBottom={12}
                    width={"100%"}
                  >
                    {/* Use a parent row to hold left & right parts */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>

                      {/* LEFT SIDE: icon + labels */}
                      <View style={styles.itemLeft}>
                        <Image source={item.icon} style={styles.itemIcon} />
                        <View style={{ justifyContent: 'flex-start' }}>
                          <Text style={styles.itemText}>{item.labelname}</Text>

                          {/* For phone and password we make the value tappable and show a right-side action button */}
                          {item.id === 'phoneNumber' ? (
                            <TouchableOpacity onPress={() => openModalFor('phoneNumber')}>
                              <Text style={styles.labelValue}>{getItemValue(item.id)}</Text>
                            </TouchableOpacity>
                          ) : item.id === 'password' ? (
                            // password: tappable masked/unmasked value on left
                            <TouchableOpacity onPress={() => setShowPassword(s => !s)}>
                              <Text style={styles.labelValue}>
                                {showPassword ? getItemValue(item.id) : '********'}
                              </Text>
                            </TouchableOpacity>
                          ) : item.id === 'email' ? (
                            <View>
                              {/* <TouchableOpacity onPress={() => openModalFor('phoneNumber')}> */}
                              <Text style={styles.labelValue}>{getItemValue(item.id)}</Text>
                              {/* </TouchableOpacity> */}
                            </View>
                          ) : (
                            <View style={{ width: 320 * base }}>
                              <Text style={styles.labelValue}>{getItemValue(item.id)}</Text>
                            </View>
                          )}

                        </View>
                      </View>

                      {/* RIGHT SIDE: actions */}
                      {item.id === 'phoneNumber' && (
                        <TouchableOpacity
                          onPress={() => {
                            if (!adminUserId) return;
                            const raw = phoneNumber.replace(/\D/g, '');
                            const dial = raw.startsWith('0') ? `${selectedCountry.code}${raw.slice(1)}` : `${selectedCountry.code}${raw}`;
                            Linking.openURL(`tel:${dial}`);
                          }}
                        >
                          <View style={{ borderRadius: 20, backgroundColor: colors.primary }}>
                            <Text style={styles.callText}>{lang.call || 'Call'}</Text>
                          </View>
                        </TouchableOpacity>
                      )}
                    {item.id === 'email' && (
                      <TouchableOpacity
                        onPress={() => {
                          // only open mail client if branchEmail exists
                          if (!branchEmail) return;
                          Linking.openURL(`mailto:${branchEmail}`);
                        }}
                      >
                        <View style={{ borderRadius: 20, backgroundColor: colors.primary }}>
                          <Text style={styles.callText}>{lang.mail}</Text>
                        </View>
                      </TouchableOpacity>
                    )}


                      {item.id === 'password' && (
                        // password action button (eye icon) — matches phone button styling
                        <TouchableOpacity
                          onPress={() => setShowPassword(s => !s)}
                        >
                          <Image
                            source={
                              // showPassword ? 
                              // require('../../../assets/icons/eye_open.png') 
                              // : 
                              require('../../../assets/icons/eye_close.png')
                            }
                            style={{ width: 18, height: 18, resizeMode: 'contain', }}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  </CartBox>
                ))}
              </CartBox>
            ))}
          </View>
        </ScrollView>
      )}

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
              setValue={handleBranchNameChange}
              //setValue={setbranchnameInput}
              placeholder={lang.Enter_the_branch_name}
              inputStyle={{ marginTop: 0 }}
              errorMessage={branchNameError}
              forceBlueBorder={false}
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
            <InputBox
              label={lang.Manager_name}
              value={managerInput}
              setValue={setManagerInput}
              placeholder={lang.Manager_name}
              inputStyle={{ marginTop: 0 }}
              errorMessage={managerError}
              forceBlueBorder={false}
            />

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
              setValue={(v) => { setPhoneInput(v); if (phoneError) setPhoneError(''); }} // clear error on change
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
              keyboardType="phone-pad"
              inputStyle={{}}
              errorMessage={phoneError}
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

            <InputBox label={lang.Branch_address_latitude}
              value={addressLatInput}
              setValue={handleAddressLatChange}
              placeholder={lang.Branch_address_latitude}
              inputStyle={{ marginTop: 0 }} errorMessage={latError} returnKeyType="next" />

            <InputBox label={lang.Branch_address_longitude}
              value={addressLonInput}
              setValue={handleAddressLonChange}
              placeholder={lang.Branch_address_longitude}
              inputStyle={{ marginTop: 0 }} errorMessage={lonError} returnKeyType="done"
            />
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
    paddingVertical: 5,
    paddingHorizontal: 15
  },
});
