import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AIScanResponse, AIDetectedItem, Food, FoodLog, MealType, ContextMode, CONTEXT_ADAPTERS } from '@calorie-ai/types';
import {
  scanImageFromUri,
  scanText,
  refineScan,
  scanVoice,
  scanReceipt,
} from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';
import { useContextStore } from '../../store/context.store';
import { apiClient } from '../../services/api';

const IMAGE_MEDIA_TYPES = ['images'] as any;
import { telemetryService } from '../../services/telemetry.service';
import { router } from 'expo-router';
import { ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';
import { createThemedStyles, theme, useAppTheme } from '../../components/theme';
import { AnimatedIonicon } from '../../components/animated-icon';
import { VisualHeroCard } from '../../components/visual-hero-card';
import { RewardToast, RewardToastData } from '../../components/reward-toast';
import { Text } from '../../components/i18n-text';
import { TextInput } from '../../components/i18n-text-input';
import { Alert } from '../../components/i18n-alert';

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

const MODE_LABELS: Record<InputMode, string> = {
  camera: 'Camera',
  gallery: 'Ảnh',
  text: 'Nhập',
  voice: 'Giọng nói',
  receipt: 'Hóa đơn',
  barcode: 'Mã vạch',
  search: 'Tìm món',
};

const PRIMARY_INPUT_MODES: InputMode[] = ['camera', 'text', 'search'];
const SECONDARY_INPUT_MODES: InputMode[] = ['gallery', 'voice', 'receipt', 'barcode'];

function formatCalorieRange(min: number, max: number): string {
  const roundedMin = Math.round(min);
  const roundedMax = Math.round(max);
  if (roundedMin === roundedMax) {
    return `${roundedMin} kcal`;
  }
  return `${roundedMin}-${roundedMax} kcal`;
}

function isQuotaFallbackResult(result: AIScanResponse): boolean {
  return (
    result.success === false
    && result.metadata?.ai_fallback === 'quota_or_rate_limited'
  );
}

export default function ScanScreen() {
  useAppTheme();
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
  const [lastFailedScan, setLastFailedScan] = useState<{ mode: InputMode; payload?: any } | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

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
  // Always prefer editableItems if we have a scan result, even if empty
  const currentItems = scanResult ? editableItems : [];
  const totalCalories = currentItems.reduce((s, i) => s + i.calories, 0);
  const totalCaloriesMin = currentItems.reduce((s, i) => s + (i.calories_min ?? i.calories), 0);
  const totalCaloriesMax = currentItems.reduce((s, i) => s + (i.calories_max ?? i.calories), 0);
  const totalProtein = currentItems.reduce((s, i) => s + i.protein_g, 0);
  const totalCarbs = currentItems.reduce((s, i) => s + i.carbs_g, 0);
  const totalFat = currentItems.reduce((s, i) => s + i.fat_g, 0);

  const applyScanResult = (result: AIScanResponse) => {
    if (isQuotaFallbackResult(result)) {
      setScanResult(null);
      setEditableItems([]);
      setScanNotice('AI đang bận do quota/rate limit. Vui lòng thử lại sau vài phút.');
      Alert.alert(
        'screen.tabs.scan.alert.001',
        'screen.tabs.scan.alert.002',
      );
      return;
    }

    setScanNotice(null);
    setScanResult(result);
    setEditableItems(result.items.map((item) => ({ ...item })));
    
    // Flag low confidence scans for telemetry
    if (result.ai_confidence < 0.6) {
      const summary = result.items.map(i => i.name_vi ?? i.name).join(', ');
      telemetryService.emitLowConfidenceFlag(summary, result.ai_confidence);
    }
  };

  const updateItemGrams = (index: number, nextGramsRaw: number) => {
    setEditableItems((prev) => {
      if (!prev[index]) return prev;
      const nextGrams = Math.max(5, Math.round(nextGramsRaw));
      const old = prev[index];
      const ratio = nextGrams / Math.max(1, old.estimated_grams);
      const updated: AIDetectedItem = {
        ...old,
        estimated_grams: nextGrams,
        calories: Math.max(0, Math.round(old.calories * ratio)),
        calories_min: old.calories_min != null ? Math.max(0, Math.round(old.calories_min * ratio)) : undefined,
        calories_max: old.calories_max != null ? Math.max(0, Math.round(old.calories_max * ratio)) : undefined,
        protein_g: Number((old.protein_g * ratio).toFixed(1)),
        carbs_g: Number((old.carbs_g * ratio).toFixed(1)),
        fat_g: Number((old.fat_g * ratio).toFixed(1)),
        fiber_g: old.fiber_g != null ? Number((old.fiber_g * ratio).toFixed(1)) : undefined,
        sugar_g: old.sugar_g != null ? Number((old.sugar_g * ratio).toFixed(1)) : undefined,
        saturated_fat_g: old.saturated_fat_g != null ? Number((old.saturated_fat_g * ratio).toFixed(1)) : undefined,
        sodium_mg: old.sodium_mg != null ? Math.round(old.sodium_mg * ratio) : undefined,
      };
      telemetryService.emitPortionAdjustment(
        old.name_vi ?? old.name,
        old.estimated_grams,
        nextGrams,
        'grams',
        old.calories,
        updated.calories,
      );
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
  };

  const promptAfterLog = (logs: FoodLog[], summary: string) => {
    Alert.alert('Logged', summary, [
      { text: 'Keep scanning', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: async () => {
          try {
            await Promise.all(logs.map((log) => removeLog(log.id)));
            setReward({
              title: 'Log undone',
              body: `${logs.length} item${logs.length > 1 ? 's' : ''} removed`,
              icon: 'arrow-undo',
            });
          } catch {
            Alert.alert('Could not undo', 'Open Log to delete the item manually.');
          }
        },
      },
      { text: 'View Today', onPress: () => router.replace('/') },
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
      console.error('Lỗi yêu cầu quyền microphone:', error);
      return false;
    }
  };

  const startVoiceRecording = async () => {
    try {
      if (!NativeAudio) {
        setVoiceRecordingNote('Bản web chưa hỗ trợ ghi âm trực tiếp. Hãy nhập hoặc dán nội dung bữa ăn để Coach phân tích.');
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
      console.error('Lỗi bắt đầu ghi âm:', error);
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
        setVoiceRecordingNote(`Đã ghi âm ${recordingDuration}s. Bản hiện tại chưa tự chuyển giọng nói thành chữ, hãy nhập hoặc dán nội dung bữa ăn bên dưới để phân tích.`);
        Alert.alert(
          'screen.tabs.scan.alert.007',
          'screen.tabs.scan.alert.008',
        );
      }
    } catch (error) {
      console.error('Lỗi dừng ghi âm:', error);
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
      setScanNotice('Không thể phân tích ảnh lúc này. Vui lòng thử lại sau ít phút.');
      setLastFailedScan({ mode: 'camera', payload: uri });
      console.error('runImageScan error', err);
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
      const result = await scanText(textInput.trim());
      applyScanResult(result);
      void telemetryService.emitLogParsed('text', {
        elapsed_ms: Date.now() - startedAt,
        item_count: result.items.length,
        ai_confidence: result.ai_confidence,
        correction_count: 0,
      });
    }
    catch (err) {
      void telemetryService.emitLogFailed('text', 'scan_api_error', Date.now() - startedAt);
      setScanNotice('Không thể phân tích mô tả lúc này. Vui lòng thử lại sau ít phút.');
      setLastFailedScan({ mode: 'text', payload: textInput.trim() });
      console.error('handleTextScan error', err);
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
      const result = await scanVoice({
        transcript,
        meal_hint: selectedMeal,
        locale: 'vi-VN',
        context: { source: 'mobile_voice', device_language: 'vi' },
      });
      applyScanResult(result);
      void telemetryService.emitLogParsed('voice', {
        elapsed_ms: Date.now() - startedAt,
        item_count: result.items.length,
        ai_confidence: result.ai_confidence,
        correction_count: 0,
      });
    }
    catch (err) {
      void telemetryService.emitLogFailed('voice', 'scan_api_error', Date.now() - startedAt);
      setScanNotice('Không thể phân tích giọng nói lúc này. Vui lòng thử lại sau ít phút.');
      setLastFailedScan({ mode: 'voice', payload: transcript });
      console.error('handleVoiceScan error', err);
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
      setScanNotice('Không thể phân tích hóa đơn lúc này. Vui lòng thử lại sau ít phút.');
      setLastFailedScan({ mode: 'receipt', payload: uri });
      console.error('runReceiptScan error', err);
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
      if (refined.success && refined.items.length > 0) { applyScanResult(refined); setRefineContext(''); }
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
        title: 'Đã log bữa ăn',
        body: `${currentItems.length} món · ${Math.round(totalCalories)} kcal`,
        icon: 'checkmark-circle',
      });
      promptAfterLog(createdLogs, `${currentItems.length} items · ${Math.round(totalCalories)} kcal`);
    } catch { Alert.alert('screen.tabs.scan.alert.025', 'screen.tabs.scan.alert.026'); }
    finally { setIsLogging(false); }
  };

  const handleSaveAsMeal = async () => {
    if (!currentItems.length) return;
    Alert.prompt('💾 Lưu bộ sưu tập', 'Đặt tên cho bữa ăn:', async (name) => {
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
          title: 'Đã lưu bộ sưu tập',
          body: `"${name}" đã sẵn sàng để log nhanh.`,
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
      setBarcodeGrams(String(Math.round(result.serving_size_g ?? 100)));
    }
    catch (err) { 
      console.error('handleBarcodeScan error', err);
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
      console.error('handleRetryLast error', err);
      setScanNotice('Thử lại không thành công. Vui lòng thử lại sau ít phút.');
    } finally {
      setIsRetrying(false);
      setLastFailedScan(null);
    }
  };

  const handleLogBarcode = async () => {
    if (!barcodeResult || isLogging) return;
    const grams = Number(barcodeGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      Alert.alert('Invalid portion', 'Enter grams greater than 0.');
      return;
    }
    const ratio = grams / 100;
    setIsLogging(true);
    try {
      const created = await addLog({
        name: barcodeResult.name_vi ?? barcodeResult.name,
        meal_type: selectedMeal,
        calories: Math.round((barcodeResult.calories_per_100g ?? 0) * ratio),
        protein_g: Number(((barcodeResult.protein_g ?? 0) * ratio).toFixed(1)),
        carbs_g: Number(((barcodeResult.carbs_g ?? 0) * ratio).toFixed(1)),
        fat_g: Number(((barcodeResult.fat_g ?? 0) * ratio).toFixed(1)),
        fiber_g: barcodeResult.fiber_g != null ? Number((barcodeResult.fiber_g * ratio).toFixed(1)) : undefined,
        sugar_g: barcodeResult.sugar_g != null ? Number((barcodeResult.sugar_g * ratio).toFixed(1)) : undefined,
        saturated_fat_g: barcodeResult.saturated_fat_g != null ? Number((barcodeResult.saturated_fat_g * ratio).toFixed(1)) : undefined,
        sodium_mg: barcodeResult.sodium_mg != null ? Math.round(barcodeResult.sodium_mg * ratio) : undefined,
        estimated_grams: grams,
      });
      setReward({
        title: 'Đã log sản phẩm',
        body: `${barcodeResult.name_vi ?? barcodeResult.name} · ${Math.round((barcodeResult.calories_per_100g ?? 0) * ratio)} kcal`,
        icon: 'checkmark-circle',
      });
      promptAfterLog([created], `${barcodeResult.name_vi ?? barcodeResult.name} · ${Math.round((barcodeResult.calories_per_100g ?? 0) * ratio)} kcal`);
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
      setSearchResults(foods);
      setSearchGramsById(Object.fromEntries(foods.map((food) => [food.id, String(Math.round(food.serving_size_g ?? 100))])));
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
      Alert.alert('Invalid portion', 'Enter grams greater than 0.');
      return;
    }
    const ratio = grams / 100;
    setIsLogging(true);
    try {
      const created = await addLog({
        name: food.name_vi ?? food.name,
        meal_type: selectedMeal,
        calories: Math.round((food.calories_per_100g ?? 0) * ratio),
        protein_g: Number(((food.protein_g ?? 0) * ratio).toFixed(1)),
        carbs_g: Number(((food.carbs_g ?? 0) * ratio).toFixed(1)),
        fat_g: Number(((food.fat_g ?? 0) * ratio).toFixed(1)),
        fiber_g: food.fiber_g != null ? Number((food.fiber_g * ratio).toFixed(1)) : undefined,
        sugar_g: food.sugar_g != null ? Number((food.sugar_g * ratio).toFixed(1)) : undefined,
        saturated_fat_g: food.saturated_fat_g != null ? Number((food.saturated_fat_g * ratio).toFixed(1)) : undefined,
        sodium_mg: food.sodium_mg != null ? Math.round(food.sodium_mg * ratio) : undefined,
        estimated_grams: grams,
      });
      setReward({
        title: 'Đã log món ăn',
        body: `${food.name_vi ?? food.name} · ${Math.round((food.calories_per_100g ?? 0) * ratio)} kcal`,
        icon: 'checkmark-circle',
      });
      promptAfterLog([created], `${food.name_vi ?? food.name} · ${Math.round((food.calories_per_100g ?? 0) * ratio)} kcal`);
    } catch {
      Alert.alert('screen.tabs.scan.alert.035', 'screen.tabs.scan.alert.036');
    } finally { setIsLogging(false); }
  };

  // ─────────────────────── Render ───────────────────────

  return (
    <ScreenShell>
        <VisualHeroCard
          imageSource={scanHeroIllustration}
          eyebrow="screen.tabs.scan.eyebrow.001"
          title="screen.tabs.scan.title.001"
          body="screen.tabs.scan.body.001"
        />

        {/* Mode Tabs */}
        <View style={styles.modeTabs}>
          {PRIMARY_INPUT_MODES.map((m) => (
            <TouchableOpacity key={m} style={[styles.modeTab, mode === m && styles.modeTabActive]}
              onPress={() => selectInputMode(m)}>
              <AnimatedIonicon
                name={MODE_ICONS[m]}
                size={16}
                color={mode === m ? theme.colors.textOnAccent : theme.colors.accentCyan}
                motion="float"
                active={mode === m}
              />
              <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>{MODE_LABELS[m]}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.modeTab, styles.modeMoreTab, (showMoreModes || SECONDARY_INPUT_MODES.includes(mode)) && styles.modeTabActive]}
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
              <TouchableOpacity key={m} style={[styles.modeTab, styles.modeSecondaryTab, mode === m && styles.modeTabActive]} onPress={() => selectInputMode(m)}>
                <AnimatedIonicon
                  name={MODE_ICONS[m]}
                  size={15}
                  color={mode === m ? theme.colors.textOnAccent : theme.colors.accentCyan}
                  motion="float"
                  active={mode === m}
                />
                <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>{MODE_LABELS[m]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Life Context Selector ── */}
        <ContextPicker activeContexts={activeContexts} onToggle={handleContextToggle} />

        {scanNotice ? (
          <SurfaceCard style={styles.scanNoticeCard}>
            <Text style={styles.scanNoticeTitle} i18nKey="screen.tabs.scan.text.002" />
            <Text style={styles.scanNoticeBody}>{scanNotice}</Text>
            {lastFailedScan ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity style={[styles.retryButton, isRetrying && styles.buttonDisabled]} onPress={handleRetryLast} disabled={isRetrying}>
                  <Text style={styles.retryButtonText}>{isRetrying ? 'Đang thử lại...' : 'Thử lại'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.cancelButton, isRetrying && styles.buttonDisabled]} onPress={() => { setLastFailedScan(null); setScanNotice(null); }}>
                  <Text style={styles.cancelButtonText}>Huỷ</Text>
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
              <TouchableOpacity style={styles.analyzeButton} onPress={handleSearchFoods}>
                <Text style={styles.analyzeButtonText} i18nKey="screen.tabs.scan.text.003" />
              </TouchableOpacity>
            </View>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />

            {isSearching ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color={theme.colors.success} />
                <Text style={styles.scanningText} i18nKey="screen.tabs.scan.text.004" />
              </View>
            ) : null}

            {searchResults.map((food) => {
              const grams = Number(searchGramsById[food.id] ?? food.serving_size_g ?? 100);
              const ratio = Number.isFinite(grams) && grams > 0 ? grams / 100 : 1;
              const kcal = Math.round((food.calories_per_100g ?? 0) * ratio);
              return (
              <SurfaceCard key={food.id} style={styles.searchItemCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultName}>{food.name_vi ?? food.name}</Text>
                  <Text style={styles.resultCalorie}>{kcal} kcal</Text>
                </View>
                <Text style={styles.resultDetail}>Khẩu phần mặc định: {food.serving_size_g ?? 100}g</Text>
                <View style={styles.portionRow}>
                  <Text style={styles.portionLabel}>Grams</Text>
                  <TextInput
                    style={styles.portionInput}
                    value={searchGramsById[food.id] ?? String(Math.round(food.serving_size_g ?? 100))}
                    onChangeText={(value) => setSearchGramsById((prev) => ({ ...prev, [food.id]: value }))}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor={theme.colors.textDisabled}
                  />
                </View>
                <Text style={styles.resultMacros}>
                  P: {Number(((food.protein_g ?? 0) * ratio).toFixed(1))}g  C: {Number(((food.carbs_g ?? 0) * ratio).toFixed(1))}g  F: {Number(((food.fat_g ?? 0) * ratio).toFixed(1))}g
                </Text>
                <TouchableOpacity style={[styles.saveButton, isLogging && styles.buttonDisabled]} onPress={() => handleLogSearchedFood(food)} disabled={isLogging}>
                  <Text style={styles.saveButtonText}>{isLogging ? 'Logging...' : 'Log food'}</Text>
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
            <Text style={styles.barcodeServing}>{barcodeResult.serving_description ?? `${barcodeResult.serving_size_g ?? 100}g`} / khẩu phần</Text>
            <SurfaceCard style={styles.totalCard}>
              {(() => {
                const grams = Number(barcodeGrams);
                const ratio = Number.isFinite(grams) && grams > 0 ? grams / 100 : 1;
                return (
                  <>
                    <Text style={styles.totalLabel} i18nKey="screen.tabs.scan.text.012" />
                    <Text style={styles.totalCalorie}>{Math.round((barcodeResult.calories_per_100g ?? 0) * ratio)} kcal</Text>
                    <Text style={styles.totalMacros}>
                      P: {Number(((barcodeResult.protein_g ?? 0) * ratio).toFixed(1))}g  C: {Number(((barcodeResult.carbs_g ?? 0) * ratio).toFixed(1))}g  F: {Number(((barcodeResult.fat_g ?? 0) * ratio).toFixed(1))}g
                    </Text>
                  </>
                );
              })()}
            </SurfaceCard>
            <View style={styles.portionRow}>
              <Text style={styles.portionLabel}>Grams</Text>
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
            <TouchableOpacity style={[styles.saveButton, isLogging && styles.buttonDisabled]} onPress={handleLogBarcode} disabled={isLogging}>
              <Text style={styles.saveButtonText}>{isLogging ? 'Logging...' : 'Log food'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setBarcodeScanned(false); setBarcodeResult(null); setBarcodeGrams('100'); }}>
              <Text style={styles.secondaryButtonText} i18nKey="screen.tabs.scan.text.014" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Camera / Gallery modes ── */}
        {mode === 'camera' && (
          <TouchableOpacity style={styles.captureButton} onPress={handleCameraCapture}>
            <AnimatedIonicon name="camera" size={40} color={theme.colors.success} motion="pulse" />
            <Text style={styles.captureText} i18nKey="screen.tabs.scan.text.015" />
          </TouchableOpacity>
        )}
        {mode === 'gallery' && (
          <TouchableOpacity style={styles.captureButton} onPress={handleGalleryPick}>
            <AnimatedIonicon name="images" size={40} color={theme.colors.success} motion="float" />
            <Text style={styles.captureText} i18nKey="screen.tabs.scan.text.016" />
          </TouchableOpacity>
        )}

        {/* ── Text Mode ── */}
        {mode === 'text' && (
          <View style={styles.textInputContainer}>
            <TextInput style={styles.textInput} value={textInput} onChangeText={setTextInput}
              placeholder="screen.tabs.scan.placeholder.003"
              placeholderTextColor={theme.colors.textDisabled} multiline />
            <TouchableOpacity style={styles.analyzeButton} onPress={handleTextScan}>
              <Text style={styles.analyzeButtonText} i18nKey="screen.tabs.scan.text.017" />
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
                  {voiceRecordingNote ? '🎙️ Ghi âm lại' : '🎙️ Ghi âm nháp'}
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
                  placeholder='VD: sáng nay mình ăn 1 tô bún bò và uống 1 ly sữa đậu nành'
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
                {isScanning ? 'Đang phân tích...' : 'Phân tích mô tả'}
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
        {(isScanning || isReceiptScanning) && mode !== 'barcode' && (
          <View style={styles.scanningContainer}>
            <ActivityIndicator size="large" color={theme.colors.success} />
            <Text style={styles.scanningText}>{mode === 'receipt' ? 'AI đang đọc hóa đơn...' : 'AI đang phân tích...'}</Text>
          </View>
        )}

        {/* ── AI Scan Results ── */}
        {scanResult && !isScanning && (
          <View>
            {scanResult.ai_confidence < 0.6 && (
              <SurfaceCard style={styles.lowConfidenceBanner}>
                <Text style={styles.lowConfidenceTitle} i18nKey="screen.tabs.scan.text.024" />
                <Text style={styles.lowConfidenceBody}>
                  Độ tin cậy tổng thể {Math.round(scanResult.ai_confidence * 100)}%. Kiểm tra kỹ từng món và điều chỉnh nếu cần trước khi lưu.
                </Text>
              </SurfaceCard>
            )}
            <Text style={styles.sectionTitle}>
              Kết quả ({Math.round(scanResult.ai_confidence * 100)}% độ tin cậy)
            </Text>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            {currentItems.map((item, i) => (
              <ScanResultItem
                key={`${item.name}-${item.calories}-${item.estimated_grams}-${i}`}
                item={item}
                onDecrease={() => updateItemGrams(i, item.estimated_grams - 25)}
                onIncrease={() => updateItemGrams(i, item.estimated_grams + 25)}
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
            <SurfaceCard style={styles.totalCard}>
              <Text style={styles.totalLabel} i18nKey="screen.tabs.scan.text.026" />
              <Text style={styles.totalCalorie}>{Math.round(totalCalories)} kcal</Text>
              <Text style={styles.totalRange}>Khoảng: {formatCalorieRange(totalCaloriesMin, totalCaloriesMax)}</Text>
              <Text style={styles.totalMacros}>P: {Math.round(totalProtein)}g  C: {Math.round(totalCarbs)}g  F: {Math.round(totalFat)}g</Text>
            </SurfaceCard>
            <TouchableOpacity style={[styles.saveButton, isLogging && styles.buttonDisabled]} onPress={handleSaveLog} disabled={isLogging}>
              <Text style={styles.saveButtonText}>{isLogging ? 'Logging...' : 'Log meal'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, isSavingMeal && styles.buttonDisabled]} onPress={handleSaveAsMeal} disabled={isSavingMeal}>
              <Text style={styles.secondaryButtonText} i18nKey="screen.tabs.scan.text.027" />
            </TouchableOpacity>
            {/* Refine */}
            <SurfaceCard style={styles.refineContainer}>
              <Text style={styles.refineTitle} i18nKey="screen.tabs.scan.text.028" />
              <Text style={styles.refineHint} i18nKey="screen.tabs.scan.text.029" />
              <TextInput style={styles.refineInput} value={refineContext} onChangeText={setRefineContext}
                placeholder='VD: "Thực ra là 2 phần", "Thêm 1 quả trứng"' placeholderTextColor={theme.colors.textDisabled} multiline />
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
  );
}

function MealPicker({ selected, onSelect }: { selected: MealType; onSelect: (m: MealType) => void }) {
  const labels: Record<MealType, string> = { breakfast: 'Sáng', lunch: 'Trưa', dinner: 'Tối', snack: 'Vặt' };
  return (
    <View style={styles.mealPicker}>
      {(Object.keys(labels) as MealType[]).map((m) => (
        <TouchableOpacity key={m} style={[styles.mealChip, selected === m && styles.mealChipActive]} onPress={() => onSelect(m)}>
          <Text style={[styles.mealChipText, selected === m && styles.mealChipTextActive]}>{labels[m]}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ContextPicker({ activeContexts, onToggle }: { activeContexts: ContextMode[]; onToggle: (mode: ContextMode) => void }) {
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

  const contextLabels: Record<ContextMode, string> = {
    [ContextMode.STRESS]: 'Áp lực',
    [ContextMode.PERIOD]: 'Kỳ kinh',
    [ContextMode.BUSY_WORK]: 'Bận',
    [ContextMode.TRAVEL]: 'Du lịch',
    [ContextMode.POOR_SLEEP]: 'Ngủ kém',
    [ContextMode.EVENT]: 'Tiệc',
    [ContextMode.RECOVERY]: 'Phục hồi',
    [ContextMode.NORMAL]: 'Bình thường',
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
          >
            <Text style={styles.contextChipIcon}>{contextIcons[mode]}</Text>
            <Text style={[styles.contextChipText, activeContexts.includes(mode) && styles.contextChipTextActive]}>
              {contextLabels[mode]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ScanResultItem({
  item,
  onDecrease,
  onIncrease,
  onNameChange,
  onRemove,
}: {
  item: AIDetectedItem;
  onDecrease: () => void;
  onIncrease: () => void;
  onNameChange: (name: string) => void;
  onRemove: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(item.name_vi ?? item.name);

  const confidenceColor =
    item.confidence >= 0.8 ? theme.colors.success : item.confidence >= 0.6 ? theme.colors.warning : theme.colors.danger;
  const confidenceLabel =
    item.confidence >= 0.8 ? 'Cao' : item.confidence >= 0.6 ? 'Trung bình' : 'Thấp';

  return (
    <SurfaceCard style={[
      styles.resultItem,
      item.confidence < 0.6 && styles.resultItemLowConf,
    ]}>
      <View style={styles.confidenceRow}>
        <Text style={[styles.confidenceBadge, { color: confidenceColor }]}>
          ● {Math.round(item.confidence * 100)}% {confidenceLabel}
        </Text>
        <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
          >
            <Text style={styles.resultName}>{item.name_vi ?? item.name}</Text>
            <Text style={styles.editHint}>✏️</Text>
          </TouchableOpacity>
          <View style={styles.calorieColumn}>
            <Text style={styles.resultCalorie}>{item.calories} kcal</Text>
            <Text style={styles.resultRange}>{formatCalorieRange(item.calories_min ?? item.calories, item.calories_max ?? item.calories)}</Text>
          </View>
        </View>
      )}

      <Text style={styles.resultDetail}>{item.quantity} {item.unit} (~{item.estimated_grams}g)</Text>
      <Text style={styles.resultMacros}>P: {Math.round(item.protein_g)}g  C: {Math.round(item.carbs_g)}g  F: {Math.round(item.fat_g)}g</Text>
      <View style={styles.adjustRow}>
        <TouchableOpacity style={styles.adjustBtn} onPress={onDecrease}>
          <Text style={styles.adjustBtnText} i18nKey="screen.tabs.scan.text.033" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.adjustBtn} onPress={onIncrease}>
          <Text style={styles.adjustBtnText} i18nKey="screen.tabs.scan.text.034" />
        </TouchableOpacity>
      </View>
    </SurfaceCard>
  );
}

const styles = createThemedStyles((colors, radii) => ({
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
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  modeTab: {
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.surfaceLifted,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
    marginBottom: 18,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  modeSecondaryTab: {
    backgroundColor: colors.surface,
  },
  modeTabActive: { backgroundColor: colors.accentMint, borderColor: colors.accentMint },
  modeTabText: { color: colors.textSoft, fontWeight: '800', fontSize: 13, textTransform: 'capitalize' },
  modeTabTextActive: { color: colors.textOnAccent },
  searchContainer: { marginBottom: 16 },
  searchItemCard: { marginBottom: 10 },
  captureButton: { backgroundColor: colors.surfaceLifted, borderRadius: 8, padding: 30, alignItems: 'center', gap: 12, marginBottom: 14, borderWidth: 1, borderColor: colors.borderStrong },
  captureText: { color: colors.textSoft, fontSize: 15, fontWeight: '700' },
  textInputContainer: { gap: 10, marginBottom: 16 },
  textInput: { backgroundColor: colors.surfaceLifted, borderRadius: 8, padding: 14, color: colors.text, minHeight: 80, borderWidth: 1, borderColor: colors.border },
  analyzeButton: { backgroundColor: colors.accentCyan, borderRadius: 8, padding: 14, alignItems: 'center' },
  analyzeButtonText: { color: colors.textOnAccent, fontWeight: '800', fontSize: 16 },
  retryButton: { backgroundColor: colors.accentMint, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { color: colors.textOnAccent, fontWeight: '700', fontSize: 14 },
  cancelButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  cancelButtonText: { color: colors.text, fontWeight: '700', fontSize: 14 },
  previewImage: { width: '100%', height: 220, borderRadius: 8, marginBottom: 16 },
  scanningContainer: { alignItems: 'center', padding: 30, gap: 12 },
  scanningText: { color: colors.textMuted, fontSize: 15, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 12 },
  mealPicker: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mealChip: { flex: 1, padding: 10, borderRadius: 8, backgroundColor: colors.surfaceAlt, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  mealChipActive: { backgroundColor: colors.surfaceSuccess, borderWidth: 1, borderColor: colors.accentMint },
  mealChipText: { color: colors.textSoft, fontSize: 13, fontWeight: '600' },
  mealChipTextActive: { color: colors.accentMint, fontWeight: '800' },
  // Context picker
  contextPickerContainer: { marginBottom: 16 },
  contextPickerLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8 },
  contextPicker: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  contextChip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', flexDirection: 'row', gap: 4 },
  contextChipActive: { backgroundColor: colors.surfaceSuccess, borderColor: colors.accentMint },
  contextChipIcon: { fontSize: 16 },
  contextChipText: { color: colors.textSoft, fontSize: 12, fontWeight: '600' },
  contextChipTextActive: { color: colors.accentMint, fontWeight: '800' },
  resultItem: { marginBottom: 10 },
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
  resultName: { color: colors.text, fontWeight: '700', flex: 1 },
  resultCalorie: { color: colors.accentMint, fontWeight: '800' },
  resultRange: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  resultDetail: { color: colors.textMuted, fontSize: 13, marginBottom: 2 },
  resultMacros: { color: colors.textMuted, fontSize: 12 },
  portionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 },
  portionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  portionInput: {
    minWidth: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  adjustRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  adjustBtn: { backgroundColor: colors.surfaceInfo, borderWidth: 1, borderColor: colors.borderInfo, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  adjustBtnText: { color: colors.textSoft, fontSize: 12, fontWeight: '700' },
  lowConfidenceBanner: { backgroundColor: colors.surfaceDanger, borderColor: colors.borderDanger, borderWidth: 1, marginBottom: 12 },
  lowConfidenceTitle: { color: colors.danger, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  lowConfidenceBody: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  scanNoticeCard: { backgroundColor: colors.surfaceDanger, borderColor: colors.borderDanger, borderWidth: 1, marginBottom: 12 },
  scanNoticeTitle: { color: colors.danger, fontSize: 15, fontWeight: '800', marginBottom: 6 },
  scanNoticeBody: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  totalCard: { marginVertical: 12, alignItems: 'center' },
  totalLabel: { color: colors.textMuted, fontSize: 13, marginBottom: 4 },
  totalCalorie: { color: colors.accentMint, fontSize: 30, fontWeight: '800' },
  totalRange: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  totalMacros: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  saveButton: { backgroundColor: colors.accentMint, borderRadius: 8, padding: 16, alignItems: 'center', marginBottom: 10 },
  saveButtonText: { color: colors.textOnAccent, fontWeight: '800', fontSize: 16 },
  secondaryButton: { borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: colors.accentCyan, backgroundColor: colors.surfaceInfo },
  secondaryButtonText: { color: colors.accentCyan, fontWeight: '800', fontSize: 15 },
  buttonDisabled: { opacity: 0.4 },
  refineContainer: { marginBottom: 20 },
  refineTitle: { color: colors.text, fontWeight: '700', fontSize: 16, marginBottom: 4 },
  refineHint: { color: colors.textMuted, fontSize: 13, marginBottom: 10 },
  refineInput: { backgroundColor: colors.surfacePressed, borderRadius: 8, padding: 12, color: colors.text, minHeight: 60, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  refineButton: { backgroundColor: colors.accentPlum, borderRadius: 8, padding: 12, alignItems: 'center' },
  refineButtonText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  // Barcode
  barcodeContainer: { marginBottom: 16 },
  manualBarcodeCard: { marginBottom: 12 },
  manualBarcodeTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 6 },
  manualBarcodeHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  manualBarcodeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  manualBarcodeInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 8, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  manualBarcodeButton: { minHeight: 44, borderRadius: 8, backgroundColor: colors.accentMint, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
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
}));


