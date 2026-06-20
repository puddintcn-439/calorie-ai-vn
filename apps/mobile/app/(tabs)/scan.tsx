import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AIScanResponse, AIDetectedItem, Food, FoodLog, MealType, ContextMode, CONTEXT_ADAPTERS } from '@calorie-ai/types';
import type { AiQuotaRemainingItem, AiQuotaRemainingResponse } from '@calorie-ai/types';
import {
  scanImageFromUri,
  scanText,
  refineScan,
  scanVoice,
  scanReceipt,
  fetchAiUsageQuota,
} from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';
import { useContextStore } from '../../store/context.store';
import { apiClient } from '../../services/api';
import { formatKcal, formatMacro, formatPercent, roundTo, safeNumber, safePositiveNumber, safeRound } from '../../services/number-format';

const IMAGE_MEDIA_TYPES = ['images'] as any;
import { telemetryService } from '../../services/telemetry.service';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScreenShell, SkeletonBlock, SurfaceCard, useBottomNavContentPadding } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { AnimatedIonicon } from '../../components/animated-icon';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { Text } from '../../components/i18n-text';
import { TextInput } from '../../components/i18n-text-input';
import { Alert } from '../../components/i18n-alert';
import { useI18n } from '../../components/i18n';
import type { I18nKey } from '../../components/i18n';
import { appLogger } from '../../services/logger.service';
import { PortionInput } from '../../components/portion-input';
import { parsePortionText, scaleNutrition } from '../../services/portion.service';

const scanHeroIllustration = require('../../assets/images/scan-hero.jpg') as number;
type CameraModule = typeof import('expo-camera');
type AudioModule = typeof import('expo-av')['Audio'];

const nativeCameraModule: CameraModule | null = Platform.OS === 'web' ? null : (require('expo-camera') as CameraModule);
const CameraView = nativeCameraModule?.CameraView;
const useOptionalCameraPermissions = nativeCameraModule?.useCameraPermissions
  ?? (() => [null, async () => ({ granted: false })] as const);
const NativeAudio: AudioModule | null = Platform.OS === 'web' ? null : (require('expo-av') as typeof import('expo-av')).Audio;

type InputMode = 'camera' | 'gallery' | 'text' | 'voice' | 'receipt' | 'barcode' | 'search';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const MODE_ICONS: Record<InputMode, IoniconName> = {
  camera: 'camera-outline',
  gallery: 'images-outline',
  text: 'create-outline',
  voice: 'mic-outline',
  receipt: 'receipt-outline',
  barcode: 'barcode-outline',
  search: 'search-outline',
};

const MODE_LABEL_KEYS: Record<InputMode, I18nKey> = {
  camera: 'screen.tabs.scan.mode.camera',
  gallery: 'screen.tabs.scan.mode.gallery',
  text: 'screen.tabs.scan.mode.text',
  voice: 'screen.tabs.scan.mode.voice',
  receipt: 'screen.tabs.scan.mode.receipt',
  barcode: 'screen.tabs.scan.mode.barcode',
  search: 'screen.tabs.scan.mode.search',
};

const PRIMARY_INPUT_MODES: InputMode[] = ['camera', 'text', 'search'];
const SECONDARY_INPUT_MODES: InputMode[] = ['gallery', 'voice', 'receipt', 'barcode'];

const QUOTA_DISPLAY: Array<{ label: string; feature: AiQuotaRemainingItem['feature'] }> = [
  { label: 'Text', feature: 'scan_text' },
  { label: 'Image', feature: 'scan_image' },
  { label: 'Receipt', feature: 'scan_receipt' },
];

function formatCalorieRange(min: number, max: number): string {
  const roundedMin = safeRound(min);
  const roundedMax = safeRound(max);
  if (roundedMin === roundedMax) {
    return formatKcal(roundedMin);
  }
  return `${roundedMin}-${roundedMax} kcal`;
}

function getAiFallbackReason(result: AIScanResponse): string | null {
  if (result.success !== false) return null;
  const metadata = result.metadata ?? {};
  const reason = metadata.ai_fallback ?? metadata.reason;
  return typeof reason === 'string' ? reason : 'unavailable';
}

function getAiFallbackNoticeKey(reason: string, parseMode?: string): I18nKey {
  if (reason === 'timeout' && parseMode !== 'image' && parseMode !== 'receipt') {
    return 'screen.tabs.scan.notice.timeoutText';
  }

  if (reason === 'timeout') {
    return 'screen.tabs.scan.notice.timeoutImage';
  }

  if (reason === 'quota_or_rate_limited' || reason === 'quota_or_rate_limit') {
    return 'screen.tabs.scan.notice.quota';
  }

  return 'screen.tabs.scan.notice.unavailable';
}

export default function ScanScreen() {
  useAppTheme();
  const { t } = useI18n();
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string }>();
  // Determine default meal based on current time
  const getDefaultMeal = (): MealType => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'breakfast'; // 5-11
    if (hour >= 11 && hour < 16) return 'lunch';    // 11-16
    if (hour >= 16 && hour < 20) return 'dinner';   // 16-20
    return 'snack'; // 20-5 (late night or early morning)
  };

  const [mode, setMode] = useState<InputMode>('camera');
  const [showMoreModes, setShowMoreModes] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<AIScanResponse | null>(null);
  const [editableItems, setEditableItems] = useState<AIDetectedItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>(getDefaultMeal());
  const [refineContext, setRefineContext] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isSavingMeal, setIsSavingMeal] = useState(false);
  // Barcode
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<any | null>(null);
  const [barcodeGrams, setBarcodeGrams] = useState('100');
  const [manualBarcode, setManualBarcode] = useState('');
  // Manual search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Food[]>([]);
  const [searchGramsById, setSearchGramsById] = useState<Record<string, string>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [isReceiptScanning, setIsReceiptScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [quotaSummary, setQuotaSummary] = useState<AiQuotaRemainingResponse | null>(null);
  const [lastFailedScan, setLastFailedScan] = useState<{ mode: InputMode; payload?: any } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [scanElapsedSeconds, setScanElapsedSeconds] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [correctionFeedbackVisible, setCorrectionFeedbackVisible] = useState(false);
  const [portionEditorIndex, setPortionEditorIndex] = useState<number | null>(null);
  const [portionEditorGrams, setPortionEditorGrams] = useState(100);

  // Context state
  const { activeContexts, toggleContext } = useContextStore();
  const [lastReceiptUri, setLastReceiptUri] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useOptionalCameraPermissions();

  // Voice recording state
  const [recording, setRecording] = useState<any | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceRecordingNote, setVoiceRecordingNote] = useState('');
  const [voicePermissionGranted, setVoicePermissionGranted] = useState(false);
  const [reward, setReward] = useState<RewardToastData | null>(null);

  const { addLog, removeLog, saveMeal } = useLogStore();
  const isAiScanning = isScanning || isReceiptScanning;
  // Always prefer editableItems if we have a scan result, even if empty
  const currentItems = scanResult ? editableItems : [];
  const totalCalories = currentItems.reduce((s, i) => s + safeNumber(i.calories), 0);
  const totalCaloriesMin = currentItems.reduce((s, i) => s + safeNumber(i.calories_min ?? i.calories), 0);
  const totalCaloriesMax = currentItems.reduce((s, i) => s + safeNumber(i.calories_max ?? i.calories), 0);
  const totalProtein = currentItems.reduce((s, i) => s + safeNumber(i.protein_g), 0);
  const totalCarbs = currentItems.reduce((s, i) => s + safeNumber(i.carbs_g), 0);
  const totalFat = currentItems.reduce((s, i) => s + safeNumber(i.fat_g), 0);
  const bottomNavPadding = useBottomNavContentPadding(12);
  const showStickyResultActions = Boolean(scanResult && !isScanning && currentItems.length);

  const getQuotaByFeature = useCallback((feature: AiQuotaRemainingItem['feature']) => {
    return quotaSummary?.quotas.find((item) => item.feature === feature) ?? null;
  }, [quotaSummary]);

  const isLowQuota = (item: AiQuotaRemainingItem | null): boolean => {
    if (!item) return false;
    if (item.daily_limit <= 0) return false;
    const ratio = item.daily_remaining / item.daily_limit;
    return item.daily_remaining <= 2 || ratio <= 0.2;
  };

  const loadQuota = useCallback(async () => {
    try {
      const data = await fetchAiUsageQuota();
      setQuotaSummary(data);
    } catch {
      // Silent fallback by design: quota card is optional and should not block scan UX.
      setQuotaSummary(null);
    }
  }, []);

  useEffect(() => {
    loadQuota().catch(() => {});
  }, [loadQuota]);

  useEffect(() => {
    if (!isAiScanning) {
      setScanElapsedSeconds(0);
      return undefined;
    }

    const startedAt = Date.now();
    const timer = setInterval(() => {
      setScanElapsedSeconds(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => clearInterval(timer);
  }, [isAiScanning]);

  const getScanningHelpText = () => {
    if (scanElapsedSeconds < 6) return t('screen.tabs.scan.scanning.initial');
    if (scanElapsedSeconds < 14) return t('screen.tabs.scan.scanning.slow');
    return t('screen.tabs.scan.scanning.long');
  };

  const applyScanResult = (result: AIScanResponse) => {
    const fallbackReason = getAiFallbackReason(result);
    if (fallbackReason) {
      const parseMode = typeof result.metadata?.parse_mode === 'string'
        ? result.metadata.parse_mode
        : undefined;
      setScanResult(null);
      setEditableItems([]);
      setScanNotice(t(getAiFallbackNoticeKey(fallbackReason, parseMode)));
      Alert.alert(
        'screen.tabs.scan.alert.001',
        'screen.tabs.scan.alert.002',
      );
      return;
    }

    setScanNotice(null);
    setLastFailedScan(null);
    setScanResult(result);
    setEditableItems(result.items.map((item) => ({ ...item })));
    setCorrectionCount(0);
    setCorrectionFeedbackVisible(false);
    
    // Flag low confidence scans for telemetry
    if (safeNumber(result.ai_confidence) < 0.6) {
      const summary = result.items.map(i => i.name_vi ?? i.name).join(', ');
      telemetryService.emitLowConfidenceFlag(summary, result.ai_confidence);
    }
  };

  const markScanCorrection = useCallback(() => {
    setCorrectionCount((count) => count + 1);
    setCorrectionFeedbackVisible(true);
  }, []);

  const updateItemGrams = (index: number, nextGramsRaw: number) => {
    setEditableItems((prev) => {
      if (!prev[index]) return prev;
      const nextGrams = Math.max(5, safeRound(nextGramsRaw));
      const old = prev[index];
      const ratio = nextGrams / Math.max(1, safePositiveNumber(old.estimated_grams, 1));
      const updated: AIDetectedItem = {
        ...old,
        estimated_grams: nextGrams,
        calories: Math.max(0, safeRound(safeNumber(old.calories) * ratio)),
        calories_min: old.calories_min != null ? Math.max(0, safeRound(safeNumber(old.calories_min) * ratio)) : undefined,
        calories_max: old.calories_max != null ? Math.max(0, safeRound(safeNumber(old.calories_max) * ratio)) : undefined,
        protein_g: roundTo(safeNumber(old.protein_g) * ratio, 1),
        carbs_g: roundTo(safeNumber(old.carbs_g) * ratio, 1),
        fat_g: roundTo(safeNumber(old.fat_g) * ratio, 1),
        fiber_g: old.fiber_g != null ? roundTo(safeNumber(old.fiber_g) * ratio, 1) : undefined,
        sugar_g: old.sugar_g != null ? roundTo(safeNumber(old.sugar_g) * ratio, 1) : undefined,
        saturated_fat_g: old.saturated_fat_g != null ? roundTo(safeNumber(old.saturated_fat_g) * ratio, 1) : undefined,
        sodium_mg: old.sodium_mg != null ? safeRound(safeNumber(old.sodium_mg) * ratio) : undefined,
      };
      telemetryService.emitPortionAdjustment(
        old.name_vi ?? old.name,
        old.estimated_grams,
        nextGrams,
        'grams',
        old.calories,
        updated.calories,
      );
      markScanCorrection();
      const clone = [...prev];
      clone[index] = updated;
      return clone;
    });
  };

  const updateItemName = useCallback((index: number, newName: string) => {
    setEditableItems((prev) => {
      if (!prev[index]) return prev;
      const old = prev[index];
      void telemetryService.emitItemMismatch(old.name_vi ?? old.name, newName, old.confidence);
      markScanCorrection();
      const clone = [...prev];
      clone[index] = { ...old, name_vi: newName, name: newName };
      return clone;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setEditableItems((prev) => {
      const item = prev[index];
      if (!item) return prev;
      void telemetryService.emitItemMismatch(item.name_vi ?? item.name, '(removed)', item.confidence);
      markScanCorrection();
      const newItems = prev.filter((_, i) => i !== index);
      return [...newItems]; // Create new array reference to ensure React detects change
    });
  }, []);

  // ─────────────────────── Handlers ───────────────────────

  const handleContextToggle = (context: ContextMode) => {
    toggleContext(context);
    const isActive = !activeContexts.includes(context);
    void telemetryService.emitContextToggled(context, isActive);
  };

  const selectInputMode = (nextMode: InputMode) => {
    setMode(nextMode);
    setShowMoreModes(SECONDARY_INPUT_MODES.includes(nextMode));
    setBarcodeScanned(false);
    setBarcodeResult(null);
    setScanResult(null);
    setEditableItems([]);
    setScanNotice(null);
    setSearchResults([]);
    setScannedImage(null);
    setVoiceTranscript('');
    setLastReceiptUri(null);
    setManualBarcode('');
    setBarcodeGrams('100');
    setSearchGramsById({});
    setCorrectionCount(0);
    setCorrectionFeedbackVisible(false);
  };

  const applyParsedPortion = (result: AIScanResponse, source: string): AIScanResponse => {
    const parsed = parsePortionText(source);
    if (!parsed.grams || !result.items[0]) return result;
    const first = result.items[0];
    const scaled = scaleNutrition({
      grams: Math.max(1, first.estimated_grams),
      calories: first.calories,
      protein: first.protein_g,
      carbs: first.carbs_g,
      fat: first.fat_g,
    }, parsed.grams);

    return {
      ...result,
      items: [
        {
          ...first,
          quantity: parsed.quantity,
          unit: parsed.unit ?? first.unit,
          estimated_grams: parsed.grams,
          calories: scaled.calories,
          protein_g: scaled.protein,
          carbs_g: scaled.carbs,
          fat_g: scaled.fat,
        },
        ...result.items.slice(1),
      ],
    };
  };

  const promptForMissingPortion = (result: AIScanResponse, source: string) => {
    const parsed = parsePortionText(source);
    if (parsed.matched || result.items.length === 0) return;
    setPortionEditorIndex(0);
    setPortionEditorGrams(Math.max(1, safeRound(result.items[0].estimated_grams || 100)));
  };

  const openPortionEditor = (index: number, grams: number) => {
    setPortionEditorIndex(index);
    setPortionEditorGrams(Math.max(1, safeRound(grams)));
  };

  const confirmPortionEditor = () => {
    if (portionEditorIndex === null) return;
    updateItemGrams(portionEditorIndex, portionEditorGrams);
    setPortionEditorIndex(null);
  };

  useFocusEffect(
    useCallback(() => {
      if (requestedMode === 'text') {
        selectInputMode('text');
      }
    }, [requestedMode]),
  );

  const promptAfterLog = (logs: FoodLog[], summary: string) => {
    Alert.alert(t('screen.tabs.scan.prompt.logged'), summary, [
      { text: t('screen.tabs.scan.prompt.keepScanning'), style: 'cancel' },
      {
        text: t('screen.tabs.scan.prompt.undo'),
        style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all(logs.map((log) => removeLog(log.id)));
            setReward({
              title: t('screen.tabs.scan.reward.logUndone'),
              body: t('screen.tabs.scan.reward.itemsRemoved', { count: logs.length }),
              icon: 'arrow-undo',
            });
          } catch {
            Alert.alert('screen.tabs.scan.alert.couldNotUndoTitle', 'screen.tabs.scan.alert.couldNotUndoBody');
          }
        },
      },
      { text: t('screen.tabs.scan.prompt.viewToday'), onPress: () => router.replace('/') },
    ]);
  };

  const requestMicPermission = async () => {
    if (!NativeAudio) {
      setVoicePermissionGranted(false);
      return false;
    }

    try {
      const permission = await NativeAudio.requestPermissionsAsync();
      setVoicePermissionGranted(permission.granted);
      return permission.granted;
    } catch (error) {
      appLogger.warn('Scan', 'Failed to request microphone permission', error);
      return false;
    }
  };

  const startVoiceRecording = async () => {
    try {
      if (!NativeAudio) {
        setVoiceRecordingNote(t('screen.tabs.scan.voice.webNote'));
        return;
      }

      if (!voicePermissionGranted) {
        const granted = await requestMicPermission();
        if (!granted) {
          Alert.alert('screen.tabs.scan.alert.003', 'screen.tabs.scan.alert.004');
          return;
        }
      }

      await NativeAudio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new NativeAudio.Recording();
      await rec.prepareToRecordAsync(NativeAudio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      
      setRecording(rec);
      setIsRecording(true);
      setRecordingDuration(0);
      setVoiceTranscript('');
      setVoiceRecordingNote('');

      // Animate duration counter
      const durationInterval = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

      // Store interval ID in ref for cleanup
      (window as any).__voiceRecordingInterval = durationInterval;
    } catch (error) {
      appLogger.warn('Scan', 'Failed to start recording', error);
      Alert.alert('screen.tabs.scan.alert.005', 'screen.tabs.scan.alert.006');
    }
  };

  const stopVoiceRecording = async () => {
    try {
      if (!recording) return;

      // Clear duration interval
      if ((window as any).__voiceRecordingInterval) {
        clearInterval((window as any).__voiceRecordingInterval);
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      setRecording(null);
      setIsRecording(false);

      if (uri) {
        setVoiceRecordingNote(t('screen.tabs.scan.voice.recordedNote', { seconds: recordingDuration }));
        Alert.alert(
          'screen.tabs.scan.alert.007',
          'screen.tabs.scan.alert.008',
        );
      }
    } catch (error) {
      appLogger.warn('Scan', 'Failed to stop recording', error);
      Alert.alert('screen.tabs.scan.alert.009', 'screen.tabs.scan.alert.010');
      setIsRecording(false);
    }
  };

  const handleCameraCapture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('screen.tabs.scan.alert.011'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: IMAGE_MEDIA_TYPES, quality: 0.8 });
    if (!result.canceled) await runImageScan(result.assets[0].uri);
  };

  const handleGalleryPick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: IMAGE_MEDIA_TYPES, quality: 0.8 });
    if (!result.canceled) await runImageScan(result.assets[0].uri);
  };

  const runImageScan = async (uri: string) => {
    setScannedImage(uri); setScanResult(null); setEditableItems([]); setRefineContext(''); setScanNotice(null); setIsScanning(true);
    const startedAt = Date.now();
    void telemetryService.emitLogAttempted('image');
    try {
      const result = await scanImageFromUri(uri);
      if (!result.success) setLastFailedScan({ mode: mode === 'gallery' ? 'gallery' : 'camera', payload: uri });
      applyScanResult(result);
      void telemetryService.emitLogParsed('image', {
        elapsed_ms: Date.now() - startedAt,
        item_count: result.items.length,
        ai_confidence: result.ai_confidence,
        correction_count: 0,
      });
    }
    catch (err) {
      void telemetryService.emitLogFailed('image', 'scan_api_error', Date.now() - startedAt);
      setScanNotice(t('screen.tabs.scan.notice.imageError'));
      setLastFailedScan({ mode: mode === 'gallery' ? 'gallery' : 'camera', payload: uri });
      appLogger.warn('Scan', 'runImageScan error', err);
      Alert.alert('screen.tabs.scan.alert.012', 'screen.tabs.scan.alert.013');
    }
    finally { setIsScanning(false); }
  };

  const handleTextScan = async () => {
    if (!textInput.trim()) return;
    setScanResult(null); setEditableItems([]); setRefineContext(''); setScanNotice(null); setIsScanning(true);
    const startedAt = Date.now();
    void telemetryService.emitLogAttempted('text');
    try {
      const rawResult = await scanText(textInput.trim());
      const result = applyParsedPortion(rawResult, textInput.trim());
      if (!result.success) setLastFailedScan({ mode: 'text', payload: textInput.trim() });
      applyScanResult(result);
      promptForMissingPortion(result, textInput.trim());
      void telemetryService.emitLogParsed('text', {
        elapsed_ms: Date.now() - startedAt,
        item_count: result.items.length,
        ai_confidence: result.ai_confidence,
        correction_count: 0,
      });
    }
    catch (err) {
      void telemetryService.emitLogFailed('text', 'scan_api_error', Date.now() - startedAt);
      setScanNotice(t('screen.tabs.scan.notice.textError'));
      setLastFailedScan({ mode: 'text', payload: textInput.trim() });
      appLogger.warn('Scan', 'handleTextScan error', err);
      Alert.alert('screen.tabs.scan.alert.014', 'screen.tabs.scan.alert.015');
    }
    finally { setIsScanning(false); }
  };

  const handleVoiceScan = async () => {
    const transcript = voiceTranscript.trim();
    if (!transcript) return;

    setScanResult(null); setEditableItems([]); setRefineContext(''); setScanNotice(null); setIsScanning(true);
    const startedAt = Date.now();
    void telemetryService.emitLogAttempted('voice');
    try {
      const rawResult = await scanVoice({
        transcript,
        meal_hint: selectedMeal,
        locale: 'vi-VN',
        context: { source: 'mobile_voice', device_language: 'vi' },
      });
      const result = applyParsedPortion(rawResult, transcript);
      if (!result.success) setLastFailedScan({ mode: 'voice', payload: transcript });
      applyScanResult(result);
      promptForMissingPortion(result, transcript);
      void telemetryService.emitLogParsed('voice', {
        elapsed_ms: Date.now() - startedAt,
        item_count: result.items.length,
        ai_confidence: result.ai_confidence,
        correction_count: 0,
      });
    }
    catch (err) {
      void telemetryService.emitLogFailed('voice', 'scan_api_error', Date.now() - startedAt);
      setScanNotice(t('screen.tabs.scan.notice.voiceError'));
      setLastFailedScan({ mode: 'voice', payload: transcript });
      appLogger.warn('Scan', 'handleVoiceScan error', err);
      Alert.alert('screen.tabs.scan.alert.016', 'screen.tabs.scan.alert.017');
    }
    finally { setIsScanning(false); }
  };

  const runReceiptScan = async (uri: string) => {
    setLastReceiptUri(uri);
    setScannedImage(uri); setScanResult(null); setEditableItems([]); setRefineContext(''); setScanNotice(null); setIsReceiptScanning(true);
    const startedAt = Date.now();
    void telemetryService.emitLogAttempted('receipt');
    try {
      const result = await scanReceipt({
        uri,
        locale: 'vi-VN',
        meal_hint: selectedMeal,
      });
      if (!result.success) setLastFailedScan({ mode: 'receipt', payload: uri });
      applyScanResult(result);
      void telemetryService.emitLogParsed('receipt', {
        elapsed_ms: Date.now() - startedAt,
        item_count: result.items.length,
        ai_confidence: result.ai_confidence,
        correction_count: 0,
      });
    }
    catch (err) {
      void telemetryService.emitLogFailed('receipt', 'scan_api_error', Date.now() - startedAt);
      setScanNotice(t('screen.tabs.scan.notice.receiptError'));
      setLastFailedScan({ mode: 'receipt', payload: uri });
      appLogger.warn('Scan', 'runReceiptScan error', err);
      Alert.alert('screen.tabs.scan.alert.018', 'screen.tabs.scan.alert.019');
    }
    finally { setIsReceiptScanning(false); }
  };

  const handleReceiptCapture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('screen.tabs.scan.alert.020'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: IMAGE_MEDIA_TYPES, quality: 0.8 });
    if (!result.canceled) await runReceiptScan(result.assets[0].uri);
  };

  const handleReceiptPick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: IMAGE_MEDIA_TYPES, quality: 0.8 });
    if (!result.canceled) await runReceiptScan(result.assets[0].uri);
  };

  const handleRefineScan = async () => {
    if (!refineContext.trim() || !scanResult) return;
    setIsRefining(true);
    try {
      const summary = currentItems.map((i) => `- ${i.name_vi ?? i.name}: ${i.calories}kcal, ${i.estimated_grams}g`).join('\n');
      const refined = await refineScan(summary, refineContext.trim(), scanResult.scan_id);
      if (refined.success && refined.items.length > 0) {
        applyScanResult(refined);
        setRefineContext('');
        markScanCorrection();
      }
      else Alert.alert('screen.tabs.scan.alert.021', 'screen.tabs.scan.alert.022');
    } catch { Alert.alert('screen.tabs.scan.alert.023', 'screen.tabs.scan.alert.024'); }
    finally { setIsRefining(false); }
  };

  const handleSaveLog = async () => {
    if (!currentItems.length || isLogging) return;
    setIsLogging(true);
    try {
      const createdLogs: FoodLog[] = [];
      for (const item of currentItems) {
        const created = await addLog({
          name: item.name_vi ?? item.name,
          meal_type: selectedMeal,
          calories: item.calories,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          fiber_g: item.fiber_g,
          sugar_g: item.sugar_g,
          saturated_fat_g: item.saturated_fat_g,
          sodium_mg: item.sodium_mg,
          estimated_grams: item.estimated_grams,
          image_url: scannedImage ?? undefined,
        });
        createdLogs.push(created);
      }
      setReward({
        title: t('screen.tabs.scan.reward.mealLogged'),
        body: t('screen.tabs.scan.reward.mealLoggedBody', { count: currentItems.length, calories: formatKcal(totalCalories) }),
        icon: 'checkmark-circle',
      });
      promptAfterLog(createdLogs, `${currentItems.length} · ${formatKcal(totalCalories)}`);
    } catch { Alert.alert('screen.tabs.scan.alert.025', 'screen.tabs.scan.alert.026'); }
    finally { setIsLogging(false); }
  };

  const handleSaveAsMeal = async () => {
    if (!currentItems.length) return;
    Alert.prompt(t('screen.tabs.scan.alert.saveCollectionTitle'), t('screen.tabs.scan.alert.saveCollectionMessage'), async (name: string | null) => {
      if (!name?.trim()) return;
      setIsSavingMeal(true);
      try {
        await saveMeal(name.trim(), currentItems.map((i) => ({
          name: i.name,
          name_vi: i.name_vi,
          calories: i.calories,
          protein_g: i.protein_g,
          carbs_g: i.carbs_g,
          fat_g: i.fat_g,
          fiber_g: i.fiber_g,
          sugar_g: i.sugar_g,
          saturated_fat_g: i.saturated_fat_g,
          sodium_mg: i.sodium_mg,
          estimated_grams: i.estimated_grams,
        })));
        setReward({
          title: t('screen.tabs.scan.reward.collectionSaved'),
          body: t('screen.tabs.scan.reward.collectionReady', { name }),
          icon: 'bookmark',
        });
      } catch { Alert.alert('screen.tabs.scan.alert.027', 'screen.tabs.scan.alert.028'); }
      finally { setIsSavingMeal(false); }
    }, 'plain-text');
  };

  const handleBarcodeScan = async ({ data: barcode }: { data: string }) => {
    if (barcodeScanned) return;
    setBarcodeScanned(true); setIsScanning(true);
    try {
      const result = (await apiClient.get(`/food/barcode/${barcode}`)).data;
      setBarcodeResult(result);
      setBarcodeGrams(String(safeRound(result.serving_size_g ?? 100)));
    }
    catch (err) { 
      appLogger.warn('Scan', 'handleBarcodeScan error', err);
      Alert.alert('screen.tabs.scan.alert.029', 'screen.tabs.scan.alert.030');
      setLastFailedScan({ mode: 'barcode', payload: barcode });
      setBarcodeScanned(false);
    }
    finally { setIsScanning(false); }
  };

  const handleManualBarcodeLookup = async () => {
    const barcode = manualBarcode.trim();
    if (!barcode) return;
    await handleBarcodeScan({ data: barcode });
  };

  const handleRetryLast = async () => {
    if (!lastFailedScan) return;
    setIsRetrying(true);
    setScanNotice(null);
    try {
      switch (lastFailedScan.mode) {
        case 'camera':
        case 'gallery':
          await runImageScan(lastFailedScan.payload);
          break;
        case 'receipt':
          await runReceiptScan(lastFailedScan.payload);
          break;
        case 'text':
          setTextInput(lastFailedScan.payload ?? '');
          await handleTextScan();
          break;
        case 'voice':
          setVoiceTranscript(lastFailedScan.payload ?? '');
          await handleVoiceScan();
          break;
          case 'barcode':
            await handleBarcodeScan({ data: lastFailedScan.payload });
            break;
      }
    } catch (err) {
      appLogger.warn('Scan', 'handleRetryLast error', err);
      setScanNotice(t('screen.tabs.scan.notice.retryFailed'));
    } finally {
      setIsRetrying(false);
      setLastFailedScan(null);
    }
  };

  const handleLogBarcode = async () => {
    if (!barcodeResult || isLogging) return;
    const grams = Number(barcodeGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      Alert.alert('screen.tabs.scan.alert.invalidPortionTitle', 'screen.tabs.scan.alert.invalidPortionBody');
      return;
    }
    const ratio = grams / 100;
    setIsLogging(true);
    try {
      const created = await addLog({
        name: barcodeResult.name_vi ?? barcodeResult.name,
        meal_type: selectedMeal,
        calories: safeRound(safeNumber(barcodeResult.calories_per_100g) * ratio),
        protein_g: roundTo(safeNumber(barcodeResult.protein_g) * ratio, 1),
        carbs_g: roundTo(safeNumber(barcodeResult.carbs_g) * ratio, 1),
        fat_g: roundTo(safeNumber(barcodeResult.fat_g) * ratio, 1),
        fiber_g: barcodeResult.fiber_g != null ? roundTo(safeNumber(barcodeResult.fiber_g) * ratio, 1) : undefined,
        sugar_g: barcodeResult.sugar_g != null ? roundTo(safeNumber(barcodeResult.sugar_g) * ratio, 1) : undefined,
        saturated_fat_g: barcodeResult.saturated_fat_g != null ? roundTo(safeNumber(barcodeResult.saturated_fat_g) * ratio, 1) : undefined,
        sodium_mg: barcodeResult.sodium_mg != null ? safeRound(safeNumber(barcodeResult.sodium_mg) * ratio) : undefined,
        estimated_grams: grams,
      });
      setReward({
        title: t('screen.tabs.scan.reward.productLogged'),
        body: `${barcodeResult.name_vi ?? barcodeResult.name} · ${formatKcal(safeNumber(barcodeResult.calories_per_100g) * ratio)}`,
        icon: 'checkmark-circle',
      });
      promptAfterLog([created], `${barcodeResult.name_vi ?? barcodeResult.name} · ${formatKcal(safeNumber(barcodeResult.calories_per_100g) * ratio)}`);
    } catch { Alert.alert('screen.tabs.scan.alert.031', 'screen.tabs.scan.alert.032'); }
    finally { setIsLogging(false); }
  };

  const handleSearchFoods = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const res = await apiClient.get<Food[]>(`/food/search?q=${encodeURIComponent(q)}`);
      const foods = res.data ?? [];
      const parsedPortion = parsePortionText(q);
      setSearchResults(foods);
      setSearchGramsById(Object.fromEntries(foods.map((food) => [
        food.id,
        String(safeRound(parsedPortion.grams ?? food.serving_size_g ?? 100)),
      ])));
    } catch {
      Alert.alert('screen.tabs.scan.alert.033', 'screen.tabs.scan.alert.034');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogSearchedFood = async (food: Food) => {
    if (isLogging) return;
    const grams = Number(searchGramsById[food.id] ?? food.serving_size_g ?? 100);
    if (!Number.isFinite(grams) || grams <= 0) {
      Alert.alert('screen.tabs.scan.alert.invalidPortionTitle', 'screen.tabs.scan.alert.invalidPortionBody');
      return;
    }
    const ratio = grams / 100;
    setIsLogging(true);
    try {
      const created = await addLog({
        name: food.name_vi ?? food.name,
        meal_type: selectedMeal,
        calories: safeRound(safeNumber(food.calories_per_100g) * ratio),
        protein_g: roundTo(safeNumber(food.protein_g) * ratio, 1),
        carbs_g: roundTo(safeNumber(food.carbs_g) * ratio, 1),
        fat_g: roundTo(safeNumber(food.fat_g) * ratio, 1),
        fiber_g: food.fiber_g != null ? roundTo(safeNumber(food.fiber_g) * ratio, 1) : undefined,
        sugar_g: food.sugar_g != null ? roundTo(safeNumber(food.sugar_g) * ratio, 1) : undefined,
        saturated_fat_g: food.saturated_fat_g != null ? roundTo(safeNumber(food.saturated_fat_g) * ratio, 1) : undefined,
        sodium_mg: food.sodium_mg != null ? safeRound(safeNumber(food.sodium_mg) * ratio) : undefined,
        estimated_grams: grams,
      });
      setReward({
        title: t('screen.tabs.scan.reward.foodLogged'),
        body: `${food.name_vi ?? food.name} · ${formatKcal(safeNumber(food.calories_per_100g) * ratio)}`,
        icon: 'checkmark-circle',
      });
      promptAfterLog([created], `${food.name_vi ?? food.name} · ${formatKcal(safeNumber(food.calories_per_100g) * ratio)}`);
    } catch {
      Alert.alert('screen.tabs.scan.alert.035', 'screen.tabs.scan.alert.036');
    } finally { setIsLogging(false); }
  };

  // ─────────────────────── Render ───────────────────────

  return (
    <View style={styles.screenRoot}>
      <ScreenShell
        scrollContentStyle={showStickyResultActions ? { paddingBottom: bottomNavPadding + 240 } : undefined}
      >
        <VisualHeroCard
          imageSource={scanHeroIllustration}
          eyebrow="screen.tabs.scan.eyebrow.001"
          title="screen.tabs.scan.title.001"
          body="screen.tabs.scan.body.001"
        />

        {quotaSummary ? (
          <SurfaceCard style={styles.quotaCard}>
            <View style={styles.quotaHeader}>
              <Text style={styles.quotaTitle}>AI Quota Today</Text>
              <Text style={styles.quotaPlan}>{String(quotaSummary.plan_tier ?? 'free').toUpperCase()}</Text>
            </View>
            <View style={styles.quotaRows}>
              {QUOTA_DISPLAY.map((entry) => {
                const item = getQuotaByFeature(entry.feature);
                const low = isLowQuota(item);
                const remaining = item?.daily_remaining ?? 0;
                const limit = item?.daily_limit ?? 0;
                return (
                  <View key={`quota-${entry.feature}`} style={[styles.quotaRow, low && styles.quotaRowWarn]}>
                    <Text style={styles.quotaLabel}>{entry.label}</Text>
                    <Text style={[styles.quotaValue, low && styles.quotaValueWarn]}>{remaining}/{limit} remaining</Text>
                  </View>
                );
              })}
            </View>
          </SurfaceCard>
        ) : null}

        {/* Mode Tabs */}
        <View style={styles.modeTabs}>
          {PRIMARY_INPUT_MODES.map((m) => (
            <TouchableOpacity key={m} style={[styles.modeTab, mode === m && styles.modeTabActive]}
              testID={`scan-mode-${m}`}
              accessibilityRole="button"
              accessibilityLabel={t(MODE_LABEL_KEYS[m])}
              accessibilityState={{ selected: mode === m }}
              onPress={() => selectInputMode(m)}>
              <AnimatedIonicon
                name={MODE_ICONS[m]}
                size={16}
                color={mode === m ? theme.colors.textOnAccent : theme.colors.accentCyan}
                motion="float"
                active={mode === m}
              />
              <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>{t(MODE_LABEL_KEYS[m])}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.modeTab, styles.modeMoreTab, (showMoreModes || SECONDARY_INPUT_MODES.includes(mode)) && styles.modeTabActive]}
            testID="scan-mode-more"
            accessibilityRole="button"
            accessibilityLabel={t('screen.tabs.scan.text.001')}
            accessibilityState={{ expanded: showMoreModes }}
            onPress={() => setShowMoreModes((value) => !value)}
          >
            <AnimatedIonicon
              name="ellipsis-horizontal"
              size={16}
              color={(showMoreModes || SECONDARY_INPUT_MODES.includes(mode)) ? theme.colors.textOnAccent : theme.colors.accentCyan}
              motion="float"
              active={showMoreModes || SECONDARY_INPUT_MODES.includes(mode)}
            />
            <Text style={[styles.modeTabText, (showMoreModes || SECONDARY_INPUT_MODES.includes(mode)) && styles.modeTabTextActive]} i18nKey="screen.tabs.scan.text.001" />
          </TouchableOpacity>
        </View>
        {(showMoreModes || SECONDARY_INPUT_MODES.includes(mode)) && (
          <View style={styles.modeMorePanel}>
            {SECONDARY_INPUT_MODES.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modeTab, styles.modeSecondaryTab, mode === m && styles.modeTabActive]}
                testID={`scan-mode-${m}`}
                accessibilityRole="button"
                accessibilityLabel={t(MODE_LABEL_KEYS[m])}
                accessibilityState={{ selected: mode === m }}
                onPress={() => selectInputMode(m)}
              >
                <AnimatedIonicon
                  name={MODE_ICONS[m]}
                  size={15}
                  color={mode === m ? theme.colors.textOnAccent : theme.colors.accentCyan}
                  motion="float"
                  active={mode === m}
                />
                <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>{t(MODE_LABEL_KEYS[m])}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Life Context Selector ── */}
        <ContextPicker activeContexts={activeContexts} onToggle={handleContextToggle} />

        {scanNotice ? (
          <SurfaceCard style={styles.scanNoticeCard}>
            <Text style={styles.scanNoticeTitle} i18nKey="screen.tabs.scan.text.002" />
            <Text style={styles.scanNoticeBody} testID="scan-notice-body">{scanNotice}</Text>
            {lastFailedScan ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity testID="scan-retry-button" style={[styles.retryButton, isRetrying && styles.buttonDisabled]} onPress={handleRetryLast} disabled={isRetrying}>
                  <Text style={styles.retryButtonText}>{isRetrying ? t('screen.tabs.scan.button.retrying') : t('screen.tabs.scan.button.retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="scan-cancel-notice-button" style={[styles.cancelButton, isRetrying && styles.buttonDisabled]} onPress={() => { setLastFailedScan(null); setScanNotice(null); }}>
                  <Text style={styles.cancelButtonText} i18nKey="screen.tabs.scan.button.cancel" />
                </TouchableOpacity>
              </View>
            ) : null}
          </SurfaceCard>
        ) : null}

        {/* ── Manual Search Mode ── */}
        {mode === 'search' && (
          <View style={styles.searchContainer}>
            <View style={styles.textInputContainer}>
              <TextInput
                style={styles.textInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="screen.tabs.scan.placeholder.001"
                placeholderTextColor={theme.colors.textDisabled}
              />
              <TouchableOpacity
                style={styles.analyzeButton}
                onPress={handleSearchFoods}
                accessibilityRole="button"
                accessibilityLabel={t('screen.tabs.scan.text.003')}
                testID="scan-search-food-button"
              >
                <Text style={styles.analyzeButtonText} i18nKey="screen.tabs.scan.text.003" />
              </TouchableOpacity>
            </View>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />

            {isSearching ? (
              <ScanLoadingState title={t('screen.tabs.scan.text.004')} />
            ) : null}

            {searchResults.map((food) => {
              const grams = Number(searchGramsById[food.id] ?? food.serving_size_g ?? 100);
              const ratio = Number.isFinite(grams) && grams > 0 ? grams / 100 : 1;
              const kcal = safeRound(safeNumber(food.calories_per_100g) * ratio);
              return (
              <SurfaceCard key={food.id} style={styles.searchItemCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultName}>{food.name_vi ?? food.name}</Text>
                  <Text style={styles.resultCalorie}>{formatKcal(kcal)}</Text>
                </View>
                <Text style={styles.resultDetail}>{t('screen.tabs.scan.label.defaultServing', { grams: formatMacro(food.serving_size_g ?? 100) })}</Text>
                <PortionInput
                  value={Math.max(1, Number(searchGramsById[food.id] ?? food.serving_size_g ?? 100) || 100)}
                  onChange={(value) => setSearchGramsById((prev) => ({ ...prev, [food.id]: String(value) }))}
                  label="screen.tabs.scan.label.grams"
                  testID={`scan-search-portion-${food.id}`}
                />
                <Text style={styles.resultMacros}>
                  P: {formatMacro(roundTo(safeNumber(food.protein_g) * ratio, 1))}  C: {formatMacro(roundTo(safeNumber(food.carbs_g) * ratio, 1))}  F: {formatMacro(roundTo(safeNumber(food.fat_g) * ratio, 1))}
                </Text>
                <TouchableOpacity
                  style={[styles.saveButton, isLogging && styles.buttonDisabled]}
                  onPress={() => handleLogSearchedFood(food)}
                  disabled={isLogging}
                  accessibilityRole="button"
                  accessibilityLabel={t('screen.tabs.scan.button.logFood')}
                  accessibilityState={{ disabled: isLogging }}
                  testID={`scan-log-search-result-${food.id}`}
                >
                  <Text style={styles.saveButtonText}>{isLogging ? t('screen.tabs.scan.button.logging') : t('screen.tabs.scan.button.logFood')}</Text>
                </TouchableOpacity>
              </SurfaceCard>
              );
            })}

            {!isSearching && searchQuery.trim().length > 0 && searchResults.length === 0 ? (
              <EmptyState
                imageSource={scanHeroIllustration}
                icon="🔎"
                title="screen.tabs.scan.title.002"
                description="screen.tabs.scan.description.001"
              />
            ) : null}
          </View>
        )}

        {/* ── Barcode Mode ── */}
        {mode === 'barcode' && !barcodeResult && (
          <View style={styles.barcodeContainer}>
            {Platform.OS === 'web' || !CameraView ? (
              <SurfaceCard style={styles.manualBarcodeCard}>
                <Text style={styles.manualBarcodeTitle} i18nKey="screen.tabs.scan.text.006" />
                <Text style={styles.manualBarcodeHint} i18nKey="screen.tabs.scan.text.007" />
                <View style={styles.manualBarcodeRow}>
                  <TextInput
                    style={styles.manualBarcodeInput}
                    value={manualBarcode}
                    onChangeText={setManualBarcode}
                    placeholder="screen.tabs.scan.placeholder.002"
                    placeholderTextColor={theme.colors.textDisabled}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity style={styles.manualBarcodeButton} onPress={handleManualBarcodeLookup}>
                    <Text style={styles.manualBarcodeButtonText} i18nKey="screen.tabs.scan.text.008" />
                  </TouchableOpacity>
                </View>
              </SurfaceCard>
            ) : !cameraPermission?.granted ? (
              <TouchableOpacity style={styles.captureButton} onPress={requestCameraPermission}>
                <AnimatedIonicon name="barcode-outline" size={40} color={theme.colors.success} motion="pulse" />
                <Text style={styles.captureText} i18nKey="screen.tabs.scan.text.009" />
              </TouchableOpacity>
            ) : (
              <>
                <CameraView style={styles.barcodeCamera} facing="back"
                  onBarcodeScanned={barcodeScanned ? undefined : handleBarcodeScan}
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }} />
                {isScanning && (
                  <View style={styles.barcodeScanningOverlay}>
                    <ActivityIndicator color={theme.colors.success} />
                    <Text style={styles.scanningText} i18nKey="screen.tabs.scan.text.010" />
                  </View>
                )}
                <Text style={styles.barcodeHint} i18nKey="screen.tabs.scan.text.011" />
              </>
            )}
          </View>
        )}

        {mode === 'barcode' && barcodeResult && (
          <View>
            {barcodeResult.image_url && <Image source={{ uri: barcodeResult.image_url }} style={styles.barcodeImage} resizeMode="contain" />}
            <Text style={styles.barcodeProductName}>{barcodeResult.name_vi ?? barcodeResult.name}</Text>
            <Text style={styles.barcodeServing}>{t('screen.tabs.scan.label.serving', { serving: barcodeResult.serving_description ?? `${barcodeResult.serving_size_g ?? 100}g` })}</Text>
            <SurfaceCard style={styles.totalCard}>
              {(() => {
                const grams = Number(barcodeGrams);
                const ratio = Number.isFinite(grams) && grams > 0 ? grams / 100 : 1;
                return (
                  <>
                    <Text style={styles.totalLabel} i18nKey="screen.tabs.scan.text.012" />
                    <Text style={styles.totalCalorie}>{formatKcal(safeNumber(barcodeResult.calories_per_100g) * ratio)}</Text>
                    <Text style={styles.totalMacros}>
                      P: {formatMacro(roundTo(safeNumber(barcodeResult.protein_g) * ratio, 1))}  C: {formatMacro(roundTo(safeNumber(barcodeResult.carbs_g) * ratio, 1))}  F: {formatMacro(roundTo(safeNumber(barcodeResult.fat_g) * ratio, 1))}
                    </Text>
                  </>
                );
              })()}
            </SurfaceCard>
            <View style={styles.portionRow}>
              <Text style={styles.portionLabel} i18nKey="screen.tabs.scan.label.grams" />
              <TextInput
                style={styles.portionInput}
                value={barcodeGrams}
                onChangeText={setBarcodeGrams}
                keyboardType="numeric"
                placeholder="100"
                placeholderTextColor={theme.colors.textDisabled}
              />
            </View>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            <TouchableOpacity
              style={[styles.saveButton, isLogging && styles.buttonDisabled]}
              onPress={handleLogBarcode}
              disabled={isLogging}
              accessibilityRole="button"
              accessibilityLabel={t('screen.tabs.scan.button.logFood')}
              accessibilityState={{ disabled: isLogging }}
              testID="scan-log-barcode-button"
            >
              <Text style={styles.saveButtonText}>{isLogging ? t('screen.tabs.scan.button.logging') : t('screen.tabs.scan.button.logFood')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setBarcodeScanned(false); setBarcodeResult(null); setBarcodeGrams('100'); }}>
              <Text style={styles.secondaryButtonText} i18nKey="screen.tabs.scan.text.014" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Camera / Gallery modes ── */}
        {mode === 'camera' && (
          scannedImage ? (
            <View style={styles.selectedImageBar}>
              <View style={styles.selectedImageLabel}>
                <Ionicons name="image-outline" size={18} color={theme.colors.success} />
                <Text style={styles.selectedImageText} i18nKey="screen.tabs.scan.image.selected" />
              </View>
              <TouchableOpacity style={styles.selectedImageAction} onPress={handleCameraCapture}>
                <Ionicons name="camera-outline" size={16} color={theme.colors.text} />
                <Text style={styles.selectedImageActionText} i18nKey="screen.tabs.scan.image.retake" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.captureButton} onPress={handleCameraCapture}>
              <AnimatedIonicon name="camera" size={40} color={theme.colors.success} motion="pulse" />
              <Text style={styles.captureText} i18nKey="screen.tabs.scan.text.015" />
            </TouchableOpacity>
          )
        )}
        {mode === 'gallery' && (
          scannedImage ? (
            <View style={styles.selectedImageBar}>
              <View style={styles.selectedImageLabel}>
                <Ionicons name="image-outline" size={18} color={theme.colors.success} />
                <Text style={styles.selectedImageText} i18nKey="screen.tabs.scan.image.selected" />
              </View>
              <TouchableOpacity style={styles.selectedImageAction} onPress={handleGalleryPick}>
                <Ionicons name="images-outline" size={16} color={theme.colors.text} />
                <Text style={styles.selectedImageActionText} i18nKey="screen.tabs.scan.image.change" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.captureButton} onPress={handleGalleryPick}>
              <AnimatedIonicon name="images" size={40} color={theme.colors.success} motion="float" />
              <Text style={styles.captureText} i18nKey="screen.tabs.scan.text.016" />
            </TouchableOpacity>
          )
        )}

        {/* ── Text Mode ── */}
        {mode === 'text' && (
          <View style={styles.textInputContainer}>
            <TextInput style={styles.textInput} value={textInput} onChangeText={setTextInput}
              placeholder="screen.tabs.scan.placeholder.003"
              placeholderTextColor={theme.colors.textDisabled} multiline />
            <TouchableOpacity
              style={[styles.analyzeButton, (!textInput.trim() || isScanning) && styles.buttonDisabled]}
              testID="scan-analyze-text-button"
              onPress={handleTextScan}
              disabled={!textInput.trim() || isScanning}
              accessibilityRole="button"
              accessibilityLabel={t('screen.tabs.scan.action.analyze')}
              accessibilityState={{ disabled: !textInput.trim() || isScanning }}
            >
              <Text style={styles.analyzeButtonText}>
                {isScanning ? t('screen.tabs.scan.action.analyzing') : t('screen.tabs.scan.action.analyze')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Voice Mode ── */}
        {mode === 'voice' && (
          <View style={styles.textInputContainer}>
            {!isRecording ? (
              <TouchableOpacity 
                style={[styles.captureButton, voiceRecordingNote && styles.captureButtonSecondary]}
                onPress={startVoiceRecording}
              >
                <AnimatedIonicon name="mic" size={40} color={voiceRecordingNote ? theme.colors.info : theme.colors.success} motion="pulse" />
                <Text style={[styles.captureText, voiceRecordingNote && { color: theme.colors.info }]}>
                  {voiceRecordingNote ? t('screen.tabs.scan.voice.recordAgain') : t('screen.tabs.scan.voice.recordDraft')}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.recordingActiveContainer}>
                <View style={styles.recordingPulse}>
                  <Text style={styles.recordingDuration}>{recordingDuration}s</Text>
                </View>
                <TouchableOpacity 
                  style={styles.stopRecordingButton}
                  onPress={stopVoiceRecording}
                >
                  <AnimatedIonicon name="stop" size={32} color={theme.colors.text} motion="pulse" />
                  <Text style={styles.stopRecordingText} i18nKey="screen.tabs.scan.text.018" />
                </TouchableOpacity>
              </View>
            )}

            {!!voiceRecordingNote && (
              <Text style={styles.voiceHintText}>{voiceRecordingNote}</Text>
            )}

            {voiceTranscript ? (
              <View style={styles.transcriptContainer}>
                <Text style={styles.transcriptLabel} i18nKey="screen.tabs.scan.text.019" />
                <TextInput
                  style={styles.textInput}
                  value={voiceTranscript}
                  onChangeText={setVoiceTranscript}
                  placeholderTextColor={theme.colors.textDisabled}
                  multiline
                  editable={!isScanning}
                />
              </View>
            ) : (
              <View style={styles.transcriptContainer}>
                <Text style={styles.transcriptLabel} i18nKey="screen.tabs.scan.text.020" />
                <TextInput
                  style={styles.textInput}
                  value={voiceTranscript}
                  onChangeText={setVoiceTranscript}
                  placeholder="screen.tabs.scan.placeholder.voiceDescription"
                  placeholderTextColor={theme.colors.textDisabled}
                  multiline
                  editable={!isScanning}
                />
              </View>
            )}

            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            <TouchableOpacity 
              style={[styles.analyzeButton, (!voiceTranscript || isScanning) && styles.buttonDisabled]} 
              onPress={handleVoiceScan}
              disabled={!voiceTranscript || isScanning}
            >
              <Text style={styles.analyzeButtonText}>
                {isScanning ? t('screen.tabs.scan.action.analyzing') : t('screen.tabs.scan.action.analyzeDescription')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Receipt Mode ── */}
        {mode === 'receipt' && (
          <View style={styles.textInputContainer}>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            <TouchableOpacity style={styles.captureButton} onPress={handleReceiptCapture}>
              <AnimatedIonicon name="camera" size={40} color={theme.colors.success} motion="pulse" />
              <Text style={styles.captureText} i18nKey="screen.tabs.scan.text.021" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleReceiptPick}>
              <Text style={styles.secondaryButtonText} i18nKey="screen.tabs.scan.text.022" />
            </TouchableOpacity>
            {lastReceiptUri ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => runReceiptScan(lastReceiptUri)}>
                <Text style={styles.secondaryButtonText} i18nKey="screen.tabs.scan.text.023" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Preview Image (camera/gallery) */}
        {scannedImage && mode !== 'barcode' && (
          <Image source={{ uri: scannedImage }} style={styles.previewImage} resizeMode="cover" />
        )}

        {/* Loading spinner for AI scan */}
        {isAiScanning && mode !== 'barcode' && (
          <ScanLoadingState
            title={mode === 'receipt' ? t('screen.tabs.scan.loading.receipt') : t('screen.tabs.scan.loading.scan')}
            help={getScanningHelpText()}
          />
        )}

        {/* ── AI Scan Results ── */}
        {scanResult && !isScanning && (
          <View>
            {safeNumber(scanResult.ai_confidence) < 0.6 && (
              <SurfaceCard style={styles.lowConfidenceBanner}>
                <Text style={styles.lowConfidenceTitle} i18nKey="screen.tabs.scan.text.024" />
                <Text style={styles.lowConfidenceBody}>
                  {t('screen.tabs.scan.lowConfidenceBody', { confidence: formatPercent(safeNumber(scanResult.ai_confidence) * 100) })}
                </Text>
              </SurfaceCard>
            )}
            <Text style={styles.sectionTitle}>
              {t('screen.tabs.scan.label.resultTitle', { confidence: formatPercent(safeNumber(scanResult.ai_confidence) * 100) })}
            </Text>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            {currentItems.map((item, i) => (
              <ScanResultItem
                key={`${item.name}-${item.calories}-${item.estimated_grams}-${i}`}
                item={item}
                onGramsChange={(grams) => updateItemGrams(i, grams)}
                onRefine={() => openPortionEditor(i, item.estimated_grams)}
                onNameChange={(name) => updateItemName(i, name)}
                onRemove={() => removeItem(i)}
              />
            ))}
            {scanResult.unresolved_items?.length ? (
              <SurfaceCard style={styles.lowConfidenceBanner}>
                <Text style={styles.lowConfidenceTitle} i18nKey="screen.tabs.scan.text.025" />
                <Text style={styles.lowConfidenceBody}>
                  {scanResult.unresolved_items.slice(0, 5).map((item) => item.raw_text).join(', ')}
                </Text>
              </SurfaceCard>
            ) : null}
            {correctionFeedbackVisible ? (
              <SurfaceCard style={styles.correctionCard}>
                <Text style={styles.correctionTitle} i18nKey="screen.tabs.scan.correction.title" />
                <Text style={styles.correctionBody} i18nKey="screen.tabs.scan.correction.body" />
                {correctionCount > 1 ? (
                  <Text style={styles.correctionMeta}>{correctionCount} corrections this scan</Text>
                ) : null}
              </SurfaceCard>
            ) : null}
            <SurfaceCard style={styles.totalCard}>
              <Text style={styles.totalLabel} i18nKey="screen.tabs.scan.text.026" />
              <Text style={styles.totalCalorie}>{formatKcal(totalCalories)}</Text>
              <Text style={styles.totalRange}>{t('screen.tabs.scan.label.range', { range: formatCalorieRange(totalCaloriesMin, totalCaloriesMax) })}</Text>
              <Text style={styles.totalMacros}>P: {formatMacro(totalProtein)}  C: {formatMacro(totalCarbs)}  F: {formatMacro(totalFat)}</Text>
            </SurfaceCard>
            <SurfaceCard style={styles.resultActionHintCard}>
              <Text style={styles.resultActionHintTitle} i18nKey="screen.tabs.scan.text.026" />
              <Text style={styles.resultActionHintBody}>
                {t('screen.tabs.scan.label.range', { range: formatCalorieRange(totalCaloriesMin, totalCaloriesMax) })}
              </Text>
            </SurfaceCard>
            {/* Refine */}
            <SurfaceCard style={styles.refineContainer}>
              <Text style={styles.refineTitle} i18nKey="screen.tabs.scan.text.028" />
              <Text style={styles.refineHint} i18nKey="screen.tabs.scan.text.029" />
              <TextInput style={styles.refineInput} value={refineContext} onChangeText={setRefineContext}
                placeholder="screen.tabs.scan.placeholder.refine" placeholderTextColor={theme.colors.textDisabled} multiline />
              <TouchableOpacity style={[styles.refineButton, (!refineContext.trim() || isRefining) && styles.buttonDisabled]}
                onPress={handleRefineScan} disabled={!refineContext.trim() || isRefining}>
                {isRefining ? <ActivityIndicator size="small" color={theme.colors.text} /> : <Text style={styles.refineButtonText} i18nKey="screen.tabs.scan.text.030" />}
              </TouchableOpacity>
            </SurfaceCard>
          </View>
        )}

        {scanResult?.items.length === 0 && !isScanning && (
          <EmptyState
            imageSource={scanHeroIllustration}
            icon="🤖"
            title="screen.tabs.scan.title.003"
            description="screen.tabs.scan.description.002"
          />
        )}
        <RewardToast reward={reward} onHide={() => setReward(null)} />
      </ScreenShell>

      {showStickyResultActions ? (
        <View
          style={[styles.stickyResultActions, { bottom: bottomNavPadding - 10 }]}
          pointerEvents="box-none"
        >
          <SurfaceCard style={styles.stickyResultCard}>
            <View style={styles.stickyResultSummary}>
              <Text style={styles.stickyResultLabel}>{t(`screen.tabs.scan.meal.${selectedMeal}` as I18nKey)}</Text>
              <Text style={styles.stickyResultCalories}>{formatKcal(totalCalories)}</Text>
            </View>
            <View style={styles.stickyResultButtons}>
              <TouchableOpacity
                style={[styles.stickySaveButton, isLogging && styles.buttonDisabled]}
                onPress={handleSaveLog}
                disabled={isLogging}
                accessibilityRole="button"
                accessibilityLabel={t('screen.tabs.scan.button.logMeal')}
                accessibilityState={{ disabled: isLogging }}
                testID="scan-log-meal-button"
              >
                <Text style={styles.stickySaveButtonText}>
                  {isLogging ? t('screen.tabs.scan.button.logging') : t('screen.tabs.scan.button.logMeal')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stickySecondaryButton, isSavingMeal && styles.buttonDisabled]}
                onPress={handleSaveAsMeal}
                disabled={isSavingMeal}
                accessibilityRole="button"
                accessibilityLabel={t('screen.tabs.scan.text.027')}
                accessibilityState={{ disabled: isSavingMeal }}
                testID="scan-save-meal-template-button"
              >
                <Text style={styles.stickySecondaryButtonText} i18nKey="screen.tabs.scan.text.027" />
              </TouchableOpacity>
            </View>
          </SurfaceCard>
        </View>
      ) : null}

      <Modal
        visible={portionEditorIndex !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPortionEditorIndex(null)}
      >
        <View style={styles.portionSheetOverlay}>
          <View style={styles.portionSheet}>
            <View style={styles.portionSheetHeader}>
              <View style={styles.portionSheetCopy}>
                <Text style={styles.portionSheetTitle} i18nKey="screen.tabs.scan.portionPrompt" />
                <Text style={styles.portionSheetBody} i18nKey="screen.tabs.scan.portionPromptBody" />
              </View>
              <TouchableOpacity
                style={styles.portionSheetClose}
                onPress={() => setPortionEditorIndex(null)}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <PortionInput
              value={portionEditorGrams}
              onChange={setPortionEditorGrams}
              label="screen.tabs.scan.portionWeight"
              testID="scan-portion-sheet"
            />

            <TouchableOpacity style={styles.portionSheetConfirm} onPress={confirmPortionEditor} testID="scan-portion-confirm">
              <Text style={styles.portionSheetConfirmText} i18nKey="screen.tabs.scan.portionConfirm" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ScanLoadingState({ title, help }: { title: string; help?: string }) {
  return (
    <SurfaceCard style={styles.scanLoadingCard}>
      <View style={styles.scanLoadingHeader}>
        <SkeletonBlock width={44} height={44} radius={22} />
        <View style={styles.scanLoadingCopy}>
          <Text style={styles.scanningText}>{title}</Text>
          {help ? <Text style={styles.scanningHelpText}>{help}</Text> : null}
        </View>
      </View>
      <View style={styles.scanSkeletonList}>
        <SkeletonBlock height={18} width="74%" />
        <SkeletonBlock height={56} />
        <SkeletonBlock height={56} />
        <SkeletonBlock height={42} width="58%" />
      </View>
    </SurfaceCard>
  );
}

function MealPicker({ selected, onSelect }: { selected: MealType; onSelect: (m: MealType) => void }) {
  const { t } = useI18n();
  const labels: Record<MealType, I18nKey> = {
    breakfast: 'screen.tabs.scan.meal.breakfast',
    lunch: 'screen.tabs.scan.meal.lunch',
    dinner: 'screen.tabs.scan.meal.dinner',
    snack: 'screen.tabs.scan.meal.snack',
  };
  return (
    <View style={styles.mealPicker}>
      {(Object.keys(labels) as MealType[]).map((m) => (
        <TouchableOpacity
          key={m}
          style={[styles.mealChip, selected === m && styles.mealChipActive]}
          onPress={() => onSelect(m)}
          accessibilityRole="button"
          accessibilityLabel={t(labels[m])}
          accessibilityState={{ selected: selected === m }}
          testID={`scan-meal-${m}`}
        >
          <Text style={[styles.mealChipText, selected === m && styles.mealChipTextActive]}>{t(labels[m])}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ContextPicker({ activeContexts, onToggle }: { activeContexts: ContextMode[]; onToggle: (mode: ContextMode) => void }) {
  const { t } = useI18n();
  const contextIcons: Record<ContextMode, string> = {
    [ContextMode.STRESS]: '😰',
    [ContextMode.PERIOD]: '🩸',
    [ContextMode.BUSY_WORK]: '🏃',
    [ContextMode.TRAVEL]: '✈️',
    [ContextMode.POOR_SLEEP]: '😴',
    [ContextMode.EVENT]: '🎉',
    [ContextMode.RECOVERY]: '🔥',
    [ContextMode.NORMAL]: '✨',
  };

  const contextLabels: Record<ContextMode, I18nKey> = {
    [ContextMode.STRESS]: 'screen.tabs.scan.context.stress',
    [ContextMode.PERIOD]: 'screen.tabs.scan.context.period',
    [ContextMode.BUSY_WORK]: 'screen.tabs.scan.context.busyWork',
    [ContextMode.TRAVEL]: 'screen.tabs.scan.context.travel',
    [ContextMode.POOR_SLEEP]: 'screen.tabs.scan.context.poorSleep',
    [ContextMode.EVENT]: 'screen.tabs.scan.context.event',
    [ContextMode.RECOVERY]: 'screen.tabs.scan.context.recovery',
    [ContextMode.NORMAL]: 'screen.tabs.scan.context.normal',
  };

  const displayContexts = [
    ContextMode.STRESS,
    ContextMode.PERIOD,
    ContextMode.BUSY_WORK,
    ContextMode.TRAVEL,
    ContextMode.POOR_SLEEP,
    ContextMode.EVENT,
  ];

  return (
    <View style={styles.contextPickerContainer}>
      <Text style={styles.contextPickerLabel} i18nKey="screen.tabs.scan.text.031" />
      <View style={styles.contextPicker}>
        {displayContexts.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.contextChip, activeContexts.includes(mode) && styles.contextChipActive]}
            onPress={() => onToggle(mode)}
            accessibilityRole="button"
            accessibilityLabel={t(contextLabels[mode])}
            accessibilityState={{ selected: activeContexts.includes(mode) }}
            testID={`scan-context-${mode}`}
          >
            <Text style={styles.contextChipIcon}>{contextIcons[mode]}</Text>
            <Text style={[styles.contextChipText, activeContexts.includes(mode) && styles.contextChipTextActive]}>
              {t(contextLabels[mode])}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ScanResultItem({
  item,
  onGramsChange,
  onRefine,
  onNameChange,
  onRemove,
}: {
  item: AIDetectedItem;
  onGramsChange: (grams: number) => void;
  onRefine: () => void;
  onNameChange: (name: string) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(item.name_vi ?? item.name);

  const confidence = safeNumber(item.confidence);
  const confidenceColor =
    confidence >= 0.8 ? theme.colors.success : confidence >= 0.6 ? theme.colors.warning : theme.colors.danger;
  const confidenceLabel =
    confidence >= 0.8
      ? t('screen.tabs.scan.confidence.high')
      : confidence >= 0.6
        ? t('screen.tabs.scan.confidence.medium')
        : t('screen.tabs.scan.confidence.low');

  return (
    <SurfaceCard style={[
      styles.resultItem,
      confidence < 0.6 && styles.resultItemLowConf,
    ]}>
      <View style={styles.confidenceRow}>
        <Text style={[styles.confidenceBadge, { color: confidenceColor }]}>
          ● {formatPercent(confidence * 100)} {confidenceLabel}
        </Text>
        <TouchableOpacity
          onPress={onRemove}
          style={styles.removeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('screen.tabs.scan.text.032')}
          testID="scan-remove-result-item"
        >
          <Text style={styles.removeBtnText} i18nKey="screen.tabs.scan.text.032" />
        </TouchableOpacity>
      </View>

      {editingName ? (
        <TextInput
          style={styles.nameEditInput}
          value={nameInput}
          onChangeText={setNameInput}
          onBlur={() => {
            setEditingName(false);
            if (nameInput.trim()) onNameChange(nameInput.trim());
          }}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => {
            setEditingName(false);
            if (nameInput.trim()) onNameChange(nameInput.trim());
          }}
        />
      ) : (
        <View style={styles.resultHeader}>
          <TouchableOpacity
            onPress={() => { setNameInput(item.name_vi ?? item.name); setEditingName(true); }}
            style={styles.resultNameButton}
            hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityLabel={item.name_vi ?? item.name}
            testID="scan-edit-result-name"
          >
            <Text style={styles.resultName}>{item.name_vi ?? item.name}</Text>
            <Text style={styles.editHint}>✏️</Text>
          </TouchableOpacity>
          <View style={styles.calorieColumn}>
            <Text style={styles.resultCalorie} testID="scan-result-calories">{formatKcal(item.calories)}</Text>
            <Text style={styles.resultRange}>{formatCalorieRange(item.calories_min ?? item.calories, item.calories_max ?? item.calories)}</Text>
          </View>
        </View>
      )}

      <Text style={styles.resultDetail}>{safeNumber(item.quantity)} {item.unit} (~{formatMacro(item.estimated_grams)})</Text>
      <Text style={styles.resultMacros} testID="scan-result-macros">P: {formatMacro(item.protein_g)}  C: {formatMacro(item.carbs_g)}  F: {formatMacro(item.fat_g)}</Text>
      <PortionInput
        value={item.estimated_grams}
        onChange={onGramsChange}
        compact
        label="screen.tabs.scan.portionWeight"
        testID="scan-result-portion"
      />
      <TouchableOpacity
        style={styles.refinePortionButton}
        onPress={onRefine}
        accessibilityRole="button"
        testID="scan-refine-portion"
      >
        <Ionicons name="options-outline" size={17} color={theme.colors.info} />
        <Text style={styles.refinePortionButtonText} i18nKey="screen.tabs.scan.refinePortion" />
      </TouchableOpacity>
    </SurfaceCard>
  );
}

const styles = createThemedStyles((colors, radii) => ({
  screenRoot: {
    flex: 1,
  },
  scanHeroCard: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceLifted,
    marginBottom: 16,
    ...(Platform.OS === 'web'
      ? { boxShadow: `0px 14px 30px ${colors.shadow}24` }
      : {
          shadowColor: colors.shadow,
          shadowOpacity: 0.2,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        }),
  },
  scanHeroImage: {
    width: '100%',
    height: 168,
  },
  scanHeroCopy: {
    padding: 14,
  },
  heroBody: { maxWidth: 700 },
  modeTabs: { flexDirection: 'row', gap: 9, marginBottom: 10, flexWrap: 'wrap' },
  quotaCard: {
    marginBottom: 12,
    borderColor: colors.borderInfo,
    backgroundColor: colors.surfaceInfo,
    gap: 10,
  },
  quotaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  quotaTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  quotaPlan: {
    color: colors.info,
    fontSize: 11,
    fontWeight: '900',
  },
  quotaRows: {
    gap: 8,
  },
  quotaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  quotaRowWarn: {
    borderColor: colors.borderWarning,
    backgroundColor: colors.surfaceWarning,
  },
  quotaLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  quotaValue: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  quotaValueWarn: {
    color: colors.warning,
  },
  modeTab: {
    minHeight: 44,
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    flexDirection: 'row',
    gap: 6,
  },
  modeMoreTab: {
    minWidth: 86,
  },
  modeMorePanel: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 20,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
  },
  modeSecondaryTab: {
    backgroundColor: colors.surface,
  },
  modeTabActive: { backgroundColor: colors.accentMint, borderColor: colors.accentMint },
  modeTabText: { color: colors.textSoft, fontWeight: '800', fontSize: 13, textTransform: 'capitalize' },
  modeTabTextActive: { color: colors.textOnAccent },
  searchContainer: { marginBottom: 18 },
  searchItemCard: { marginBottom: 12, gap: 8 },
  captureButton: { backgroundColor: colors.surfaceLifted, borderRadius: 8, padding: 32, alignItems: 'center', gap: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.borderStrong },
  captureText: { color: colors.textSoft, fontSize: 15, lineHeight: 21, fontWeight: '800', textAlign: 'center' },
  selectedImageBar: {
    minHeight: 44,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectedImageLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  selectedImageText: { color: colors.textSoft, fontSize: 13, fontWeight: '800' },
  selectedImageAction: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceLifted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedImageActionText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  textInputContainer: { gap: 12, marginBottom: 18 },
  textInput: { backgroundColor: colors.surfaceLifted, borderRadius: 8, padding: 15, color: colors.text, minHeight: 88, borderWidth: 1, borderColor: colors.borderSubtle, fontSize: 15, lineHeight: 22 },
  analyzeButton: { backgroundColor: colors.accentMint, borderRadius: 8, padding: 15, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  analyzeButtonText: { color: colors.textOnAccent, fontWeight: '900', fontSize: 16 },
  retryButton: { backgroundColor: colors.accentMint, paddingHorizontal: 17, paddingVertical: 11, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { color: colors.textOnAccent, fontWeight: '800', fontSize: 14 },
  cancelButton: { borderRadius: 8, paddingHorizontal: 15, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface },
  cancelButtonText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  previewImage: { width: '100%', height: 230, borderRadius: 8, marginBottom: 18 },
  scanningContainer: { alignItems: 'center', padding: 30, gap: 12 },
  scanLoadingCard: { marginBottom: 16, gap: 14 },
  scanLoadingHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scanLoadingCopy: { flex: 1, minWidth: 0 },
  scanSkeletonList: { gap: 10 },
  scanningText: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  scanningHelpText: { color: colors.textSoft, fontSize: 13, lineHeight: 19, maxWidth: 520 },
  sectionTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900', color: colors.text, marginBottom: 14 },
  mealPicker: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  mealChip: { flex: 1, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.surfaceMuted, alignItems: 'center', borderWidth: 1, borderColor: colors.borderSubtle },
  mealChipActive: { backgroundColor: colors.accentMint, borderWidth: 1, borderColor: colors.accentMint },
  mealChipText: { color: colors.textSoft, fontSize: 13, fontWeight: '600' },
  mealChipTextActive: { color: colors.textOnAccent, fontWeight: '900' },
  // Context picker
  contextPickerContainer: { marginBottom: 18 },
  contextPickerLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.2 },
  contextPicker: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  contextChip: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 8, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center', flexDirection: 'row', gap: 5 },
  contextChipActive: { backgroundColor: colors.surfaceSuccess, borderColor: colors.borderSuccess },
  contextChipIcon: { fontSize: 16 },
  contextChipText: { color: colors.textSoft, fontSize: 12, fontWeight: '600' },
  contextChipTextActive: { color: colors.accentMint, fontWeight: '800' },
  resultItem: { marginBottom: 12 },
  resultItemLowConf: { borderColor: colors.borderDanger, borderWidth: 1 },
  confidenceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  confidenceBadge: { fontSize: 12, fontWeight: '700' },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong },
  removeBtnText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  nameEditInput: { backgroundColor: colors.surfacePressed, borderRadius: 8, padding: 10, color: colors.text, fontSize: 15, fontWeight: '700', borderWidth: 1.5, borderColor: colors.accentMint, marginBottom: 6 },
  resultNameButton: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  calorieColumn: { alignItems: 'flex-end' },
  editHint: { fontSize: 12, opacity: 0.5 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  resultName: { color: colors.text, fontWeight: '800', flex: 1, fontSize: 15, lineHeight: 20 },
  resultCalorie: { color: colors.accentMint, fontWeight: '900', fontSize: 15 },
  resultRange: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  resultDetail: { color: colors.textMuted, fontSize: 13, marginBottom: 2 },
  resultMacros: { color: colors.textMuted, fontSize: 12 },
  refinePortionButton: { minHeight: 44, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  refinePortionButtonText: { color: colors.info, fontSize: 13, fontWeight: '900' },
  lowConfidenceBanner: { backgroundColor: colors.surfaceDanger, borderColor: colors.borderDanger, borderWidth: 1, marginBottom: 12 },
  lowConfidenceTitle: { color: colors.danger, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  lowConfidenceBody: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  correctionCard: { backgroundColor: colors.surfaceSuccess, borderColor: colors.borderSuccess, borderWidth: 1, marginBottom: 12 },
  correctionTitle: { color: colors.accentMint, fontSize: 15, fontWeight: '900', marginBottom: 5 },
  correctionBody: { color: colors.textSoft, fontSize: 13, lineHeight: 19 },
  correctionMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginTop: 6 },
  scanNoticeCard: { backgroundColor: colors.surfaceDanger, borderColor: colors.borderDanger, borderWidth: 1, marginBottom: 12 },
  scanNoticeTitle: { color: colors.danger, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  scanNoticeBody: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  totalCard: { marginVertical: 14, alignItems: 'center' },
  totalLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  totalCalorie: { color: colors.accentMint, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  totalRange: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  totalMacros: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  resultActionHintCard: {
    marginBottom: 12,
    backgroundColor: colors.surfaceSuccess,
    borderColor: colors.borderSuccess,
    borderWidth: 1,
  },
  resultActionHintTitle: {
    color: colors.accentMint,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
  },
  resultActionHintBody: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  stickyResultActions: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
  },
  stickyResultCard: {
    padding: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  stickyResultSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  stickyResultLabel: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  stickyResultCalories: {
    color: colors.accentMint,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  stickyResultButtons: {
    flexDirection: 'row',
    gap: 9,
  },
  stickySaveButton: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.accentMint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  stickySaveButtonText: {
    color: colors.textOnAccent,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  stickySecondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.surfaceInfo,
    borderWidth: 1,
    borderColor: colors.borderInfo,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  stickySecondaryButtonText: {
    color: colors.info,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  saveButton: { backgroundColor: colors.accentMint, borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 11, minHeight: 52, justifyContent: 'center' },
  saveButtonText: { color: colors.textOnAccent, fontWeight: '900', fontSize: 16 },
  secondaryButton: { borderRadius: 8, padding: 15, alignItems: 'center', marginBottom: 11, borderWidth: 1, borderColor: colors.borderInfo, backgroundColor: colors.surfaceInfo, minHeight: 50, justifyContent: 'center' },
  secondaryButtonText: { color: colors.info, fontWeight: '900', fontSize: 15 },
  buttonDisabled: { opacity: 0.4 },
  refineContainer: { marginBottom: 20 },
  refineTitle: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  refineHint: { color: colors.textMuted, fontSize: 13, marginBottom: 10 },
  refineInput: { backgroundColor: colors.surfaceMuted, borderRadius: 8, padding: 13, color: colors.text, minHeight: 68, marginBottom: 12, borderWidth: 1, borderColor: colors.borderSubtle },
  refineButton: { backgroundColor: colors.surfaceInfo, borderRadius: 8, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.borderInfo },
  refineButtonText: { color: colors.info, fontWeight: '800', fontSize: 14 },
  // Barcode
  barcodeContainer: { marginBottom: 16 },
  manualBarcodeCard: { marginBottom: 12 },
  manualBarcodeTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  manualBarcodeHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  manualBarcodeRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  manualBarcodeInput: { flex: 1, backgroundColor: colors.surfaceMuted, borderRadius: 8, borderWidth: 1, borderColor: colors.borderSubtle, color: colors.text, paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  manualBarcodeButton: { minHeight: 46, borderRadius: 8, backgroundColor: colors.accentMint, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center' },
  manualBarcodeButtonText: { color: colors.textOnAccent, fontSize: 13, fontWeight: '900' },
  barcodeCamera: { width: '100%', height: 280, borderRadius: 8, overflow: 'hidden' },
  barcodeScanningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.overlay },
  barcodeHint: { color: colors.textMuted, textAlign: 'center', marginTop: 10, fontSize: 13 },
  barcodeImage: { width: '100%', height: 160, borderRadius: 8, marginBottom: 12 },
  barcodeProductName: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  barcodeServing: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  // Voice recording styles
  recordingActiveContainer: { alignItems: 'center', paddingVertical: 20, gap: 20 },
  recordingPulse: { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    backgroundColor: colors.danger, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.borderDanger,
    ...(Platform.OS === 'web'
      ? { boxShadow: `0px 0px 10px ${colors.danger}66` }
      : {
          shadowColor: colors.danger,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 10,
        }),
    elevation: 8,
  },
  recordingDuration: { color: colors.text, fontSize: 32, fontWeight: '800' },
  stopRecordingButton: { backgroundColor: colors.danger, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopRecordingText: { color: colors.text, fontWeight: '800', fontSize: 16 },
  captureButtonSecondary: { opacity: 0.7 },
  transcriptContainer: { marginVertical: 12 },
  transcriptLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  voiceHintText: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginVertical: 16, lineHeight: 20 },
  portionSheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  portionSheet: { padding: 16, paddingBottom: 24, gap: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle },
  portionSheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  portionSheetCopy: { flex: 1, minWidth: 0 },
  portionSheetTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  portionSheetBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  portionSheetClose: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderSubtle },
  portionSheetConfirm: { minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingHorizontal: 16 },
  portionSheetConfirmText: { color: colors.textOnAccent, fontSize: 15, fontWeight: '900' },
}));


