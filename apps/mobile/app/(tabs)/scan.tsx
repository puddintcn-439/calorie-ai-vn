import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { AIScanResponse, AIDetectedItem, Food, MealType, ContextMode, CONTEXT_ADAPTERS } from '@calorie-ai/types';
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
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { EmptyState } from '../../components/empty-state';

type InputMode = 'camera' | 'gallery' | 'text' | 'voice' | 'receipt' | 'barcode' | 'search';

const MODE_ICONS: Record<InputMode, string> = {
  camera: '📸', gallery: '🖼', text: '✏️', voice: '🎙️', receipt: '🧾', barcode: '🔍', search: '🍜',
};

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
  // Determine default meal based on current time
  const getDefaultMeal = (): MealType => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return 'breakfast'; // 5-11
    if (hour >= 11 && hour < 16) return 'lunch';    // 11-16
    if (hour >= 16 && hour < 20) return 'dinner';   // 16-20
    return 'snack'; // 20-5 (late night or early morning)
  };

  const [mode, setMode] = useState<InputMode>('camera');
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
  // Manual search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Food[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReceiptScanning, setIsReceiptScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Context state
  const { activeContexts, toggleContext } = useContextStore();
  const [lastReceiptUri, setLastReceiptUri] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // Voice recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voicePermissionGranted, setVoicePermissionGranted] = useState(false);

  const { addLog, saveMeal } = useLogStore();
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
        'AI đang bận',
        'Hệ thống AI đang chạm giới hạn tạm thời (quota/rate limit). Vui lòng thử lại sau vài phút.',
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

  const requestMicPermission = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      setVoicePermissionGranted(permission.granted);
      return permission.granted;
    } catch (error) {
      console.error('Lỗi yêu cầu quyền microphone:', error);
      return false;
    }
  };

  const startVoiceRecording = async () => {
    try {
      if (!voicePermissionGranted) {
        const granted = await requestMicPermission();
        if (!granted) {
          Alert.alert('Lỗi', 'Cần quyền truy cập microphone để ghi âm');
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      
      setRecording(rec);
      setIsRecording(true);
      setRecordingDuration(0);
      setVoiceTranscript('');

      // Animate duration counter
      const durationInterval = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);

      // Store interval ID in ref for cleanup
      (window as any).__voiceRecordingInterval = durationInterval;
    } catch (error) {
      console.error('Lỗi bắt đầu ghi âm:', error);
      Alert.alert('Lỗi', 'Không thể bắt đầu ghi âm');
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
        // For demo purposes, use placeholder transcript
        // In production, integrate with speech-to-text API
        setVoiceTranscript(`[Ghi âm ${recordingDuration}s - sử dụng nút "Phân tích từ giọng nói" để xử lý]`);
        Alert.alert('✅ Ghi âm thành công', `Thời gian: ${recordingDuration}s\n\nNhấp "Phân tích từ giọng nói" để phân tích.`);
      }
    } catch (error) {
      console.error('Lỗi dừng ghi âm:', error);
      Alert.alert('Lỗi', 'Không thể dừng ghi âm');
      setIsRecording(false);
    }
  };

  const handleCameraCapture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Cần quyền truy cập camera'); return; }
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
    catch {
      void telemetryService.emitLogFailed('image', 'scan_api_error', Date.now() - startedAt);
      setScanNotice('Không thể phân tích ảnh lúc này. Vui lòng thử lại sau ít phút.');
      Alert.alert('Lỗi', 'Không thể phân tích ảnh.');
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
    catch {
      void telemetryService.emitLogFailed('text', 'scan_api_error', Date.now() - startedAt);
      setScanNotice('Không thể phân tích mô tả lúc này. Vui lòng thử lại sau ít phút.');
      Alert.alert('Lỗi', 'Không thể phân tích.');
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
    catch {
      void telemetryService.emitLogFailed('voice', 'scan_api_error', Date.now() - startedAt);
      setScanNotice('Không thể phân tích giọng nói lúc này. Vui lòng thử lại sau ít phút.');
      Alert.alert('Lỗi', 'Không thể phân tích giọng nói.');
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
    catch {
      void telemetryService.emitLogFailed('receipt', 'scan_api_error', Date.now() - startedAt);
      setScanNotice('Không thể phân tích hóa đơn lúc này. Vui lòng thử lại sau ít phút.');
      Alert.alert('Lỗi', 'Không thể phân tích hóa đơn.');
    }
    finally { setIsReceiptScanning(false); }
  };

  const handleReceiptCapture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Cần quyền truy cập camera'); return; }
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
      else Alert.alert('Không thể điều chỉnh', 'AI không hiểu thông tin bổ sung. Thử lại!');
    } catch { Alert.alert('Lỗi', 'Không thể phân tích lại.'); }
    finally { setIsRefining(false); }
  };

  const handleSaveLog = async () => {
    if (!currentItems.length) return;
    try {
      for (const item of currentItems) {
        await addLog({ name: item.name_vi ?? item.name, meal_type: selectedMeal, calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, estimated_grams: item.estimated_grams, image_url: scannedImage ?? undefined });
      }
      Alert.alert('✅ Đã lưu!', `${currentItems.length} món`, [{ text: 'OK', onPress: () => router.replace('/') }]);
    } catch { Alert.alert('Lỗi', 'Không thể lưu log'); }
  };

  const handleSaveAsMeal = async () => {
    if (!currentItems.length) return;
    Alert.prompt('💾 Lưu bộ sưu tập', 'Đặt tên cho bữa ăn:', async (name) => {
      if (!name?.trim()) return;
      setIsSavingMeal(true);
      try {
        await saveMeal(name.trim(), currentItems.map((i) => ({ name: i.name, name_vi: i.name_vi, calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, estimated_grams: i.estimated_grams })));
        Alert.alert('✅ Đã lưu!', `"${name}" vào bộ sưu tập.`);
      } catch { Alert.alert('Lỗi', 'Không thể lưu bữa ăn.'); }
      finally { setIsSavingMeal(false); }
    }, 'plain-text');
  };

  const handleBarcodeScan = async ({ data: barcode }: { data: string }) => {
    if (barcodeScanned) return;
    setBarcodeScanned(true); setIsScanning(true);
    try { setBarcodeResult((await apiClient.get(`/food/barcode/${barcode}`)).data); }
    catch { Alert.alert('Không tìm thấy', 'Sản phẩm chưa có trong CSDL.'); setBarcodeScanned(false); }
    finally { setIsScanning(false); }
  };

  const handleLogBarcode = async () => {
    if (!barcodeResult) return;
    try {
      await addLog({ name: barcodeResult.name_vi ?? barcodeResult.name, meal_type: selectedMeal, calories: barcodeResult.calories_per_100g ?? 0, protein_g: barcodeResult.protein_g ?? 0, carbs_g: barcodeResult.carbs_g ?? 0, fat_g: barcodeResult.fat_g ?? 0, estimated_grams: barcodeResult.serving_size_g ?? 100 });
      Alert.alert('✅ Đã lưu!', undefined, [{ text: 'OK', onPress: () => router.replace('/') }]);
    } catch { Alert.alert('Lỗi', 'Không thể lưu log'); }
  };

  const handleSearchFoods = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setIsSearching(true);
    try {
      const res = await apiClient.get<Food[]>(`/food/search?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data ?? []);
    } catch {
      Alert.alert('Lỗi', 'Không thể tìm món ăn lúc này.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogSearchedFood = async (food: Food) => {
    const grams = food.serving_size_g ?? 100;
    const ratio = grams / 100;
    try {
      await addLog({
        name: food.name_vi ?? food.name,
        meal_type: selectedMeal,
        calories: Math.round((food.calories_per_100g ?? 0) * ratio),
        protein_g: Number(((food.protein_g ?? 0) * ratio).toFixed(1)),
        carbs_g: Number(((food.carbs_g ?? 0) * ratio).toFixed(1)),
        fat_g: Number(((food.fat_g ?? 0) * ratio).toFixed(1)),
        estimated_grams: grams,
      });
      Alert.alert('✅ Đã lưu!', `${food.name_vi ?? food.name}`);
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu món ăn tìm kiếm.');
    }
  };

  // ─────────────────────── Render ───────────────────────

  return (
    <ScreenShell>
        <Eyebrow>AI Scanner</Eyebrow>
        <HeroTitle>Chụp, mô tả hoặc quét mã vạch rồi log bữa ăn ngay.</HeroTitle>
        <BodyText style={styles.heroBody}>Flow được tối ưu cho mobile nhưng vẫn đủ gọn và đẹp khi mở trên desktop/web.</BodyText>

        {/* Mode Tabs */}
        <View style={styles.modeTabs}>
          {(Object.keys(MODE_ICONS) as InputMode[]).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeTab, mode === m && styles.modeTabActive]}
              onPress={() => {
                setMode(m);
                setBarcodeScanned(false);
                setBarcodeResult(null);
                setScanResult(null);
                setEditableItems([]);
                setScanNotice(null);
                setSearchResults([]);
                setScannedImage(null);
                setVoiceTranscript('');
                setLastReceiptUri(null);
              }}>
              <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>{MODE_ICONS[m]} {m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Life Context Selector ── */}
        <ContextPicker activeContexts={activeContexts} onToggle={handleContextToggle} />

        {scanNotice ? (
          <SurfaceCard style={styles.scanNoticeCard}>
            <Text style={styles.scanNoticeTitle}>⚠️ Tạm thời chưa có kết quả AI</Text>
            <Text style={styles.scanNoticeBody}>{scanNotice}</Text>
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
                placeholder="VD: pho bo, bun cha, com ga"
                placeholderTextColor="#6b7280"
              />
              <TouchableOpacity style={styles.analyzeButton} onPress={handleSearchFoods}>
                <Text style={styles.analyzeButtonText}>Tim mon</Text>
              </TouchableOpacity>
            </View>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />

            {isSearching ? (
              <View style={styles.scanningContainer}>
                <ActivityIndicator size="large" color="#4ade80" />
                <Text style={styles.scanningText}>Dang tim trong co so du lieu...</Text>
              </View>
            ) : null}

            {searchResults.map((food) => (
              <SurfaceCard key={food.id} style={styles.searchItemCard}>
                <View style={styles.resultHeader}>
                  <Text style={styles.resultName}>{food.name_vi ?? food.name}</Text>
                  <Text style={styles.resultCalorie}>{food.calories_per_100g ?? 0} kcal</Text>
                </View>
                <Text style={styles.resultDetail}>Khau phan mac dinh: {food.serving_size_g ?? 100}g</Text>
                <Text style={styles.resultMacros}>P: {food.protein_g ?? 0}g  C: {food.carbs_g ?? 0}g  F: {food.fat_g ?? 0}g</Text>
                <TouchableOpacity style={styles.saveButton} onPress={() => handleLogSearchedFood(food)}>
                  <Text style={styles.saveButtonText}>+ Log mon nay</Text>
                </TouchableOpacity>
              </SurfaceCard>
            ))}

            {!isSearching && searchQuery.trim().length > 0 && searchResults.length === 0 ? (
              <EmptyState
                icon="🔎"
                title="Chua tim thay mon phu hop"
                description="Thu ten mon don gian hon hoac doi tu khoa gan voi ten pho bien."
              />
            ) : null}
          </View>
        )}

        {/* ── Barcode Mode ── */}
        {mode === 'barcode' && !barcodeResult && (
          <View style={styles.barcodeContainer}>
            {!cameraPermission?.granted ? (
              <TouchableOpacity style={styles.captureButton} onPress={requestCameraPermission}>
                <Ionicons name="barcode-outline" size={40} color="#4ade80" />
                <Text style={styles.captureText}>Cấp quyền Camera để quét barcode</Text>
              </TouchableOpacity>
            ) : (
              <>
                <CameraView style={styles.barcodeCamera} facing="back"
                  onBarcodeScanned={barcodeScanned ? undefined : handleBarcodeScan}
                  barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }} />
                {isScanning && (
                  <View style={styles.barcodeScanningOverlay}>
                    <ActivityIndicator color="#4ade80" />
                    <Text style={styles.scanningText}>Đang tra cứu...</Text>
                  </View>
                )}
                <Text style={styles.barcodeHint}>Hướng camera vào mã vạch sản phẩm</Text>
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
              <Text style={styles.totalLabel}>Dinh dưỡng / 100g</Text>
              <Text style={styles.totalCalorie}>{barcodeResult.calories_per_100g ?? 0} kcal</Text>
              <Text style={styles.totalMacros}>P: {barcodeResult.protein_g ?? 0}g  C: {barcodeResult.carbs_g ?? 0}g  F: {barcodeResult.fat_g ?? 0}g</Text>
            </SurfaceCard>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            <TouchableOpacity style={styles.saveButton} onPress={handleLogBarcode}>
              <Text style={styles.saveButtonText}>✅ Lưu vào nhật ký</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => { setBarcodeScanned(false); setBarcodeResult(null); }}>
              <Text style={styles.secondaryButtonText}>🔄 Quét lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Camera / Gallery modes ── */}
        {mode === 'camera' && (
          <TouchableOpacity style={styles.captureButton} onPress={handleCameraCapture}>
            <Ionicons name="camera" size={40} color="#4ade80" />
            <Text style={styles.captureText}>Chụp ảnh đồ ăn</Text>
          </TouchableOpacity>
        )}
        {mode === 'gallery' && (
          <TouchableOpacity style={styles.captureButton} onPress={handleGalleryPick}>
            <Ionicons name="images" size={40} color="#4ade80" />
            <Text style={styles.captureText}>Chọn từ thư viện</Text>
          </TouchableOpacity>
        )}

        {/* ── Text Mode ── */}
        {mode === 'text' && (
          <View style={styles.textInputContainer}>
            <TextInput style={styles.textInput} value={textInput} onChangeText={setTextInput}
              placeholder="VD: 1 tô phở bò đặc biệt, 1 ly cà phê sữa..."
              placeholderTextColor="#6b7280" multiline />
            <TouchableOpacity style={styles.analyzeButton} onPress={handleTextScan}>
              <Text style={styles.analyzeButtonText}>Phân tích</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Voice Mode ── */}
        {mode === 'voice' && (
          <View style={styles.textInputContainer}>
            {/* Recording controls */}
            {!isRecording ? (
              <TouchableOpacity 
                style={[styles.captureButton, voiceTranscript && styles.captureButtonSecondary]} 
                onPress={startVoiceRecording}
              >
                <Ionicons name="mic" size={40} color={voiceTranscript ? '#7dd3fc' : '#4ade80'} />
                <Text style={[styles.captureText, voiceTranscript && { color: '#7dd3fc' }]}>
                  {voiceTranscript ? '🎙️ Ghi âm thêm' : '🎙️ Bắt đầu ghi âm'}
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
                  <Ionicons name="stop" size={32} color="#fff" />
                  <Text style={styles.stopRecordingText}>Dừng ghi âm</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Transcript input and editing */}
            {voiceTranscript ? (
              <View style={styles.transcriptContainer}>
                <Text style={styles.transcriptLabel}>📝 Bản ghi: (có thể chỉnh sửa)</Text>
                <TextInput
                  style={styles.textInput}
                  value={voiceTranscript}
                  onChangeText={setVoiceTranscript}
                  placeholderTextColor="#6b7280"
                  multiline
                  editable={!isScanning}
                />
              </View>
            ) : (
              <Text style={styles.voiceHintText}>
                💡 Hãy ghi âm mô tả những gì bạn ăn. Ví dụ: "sáng nay mình ăn 1 tô bún bò và uống 1 ly sữa đậu nành"
              </Text>
            )}

            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            <TouchableOpacity 
              style={[styles.analyzeButton, (!voiceTranscript || isScanning) && styles.buttonDisabled]} 
              onPress={handleVoiceScan}
              disabled={!voiceTranscript || isScanning}
            >
              <Text style={styles.analyzeButtonText}>
                {isScanning ? 'Đang phân tích...' : 'Phân tích từ giọng nói'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Receipt Mode ── */}
        {mode === 'receipt' && (
          <View style={styles.textInputContainer}>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            <TouchableOpacity style={styles.captureButton} onPress={handleReceiptCapture}>
              <Ionicons name="camera" size={40} color="#4ade80" />
              <Text style={styles.captureText}>Chụp hóa đơn</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleReceiptPick}>
              <Text style={styles.secondaryButtonText}>🖼 Chọn hóa đơn từ thư viện</Text>
            </TouchableOpacity>
            {lastReceiptUri ? (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => runReceiptScan(lastReceiptUri)}>
                <Text style={styles.secondaryButtonText}>🔁 Phân tích lại hóa đơn gần nhất</Text>
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
            <ActivityIndicator size="large" color="#4ade80" />
            <Text style={styles.scanningText}>{mode === 'receipt' ? 'AI đang đọc hóa đơn...' : 'AI đang phân tích...'}</Text>
          </View>
        )}

        {/* ── AI Scan Results ── */}
        {scanResult && !isScanning && (
          <View>
            {scanResult.ai_confidence < 0.6 && (
              <SurfaceCard style={styles.lowConfidenceBanner}>
                <Text style={styles.lowConfidenceTitle}>⚠️ AI chưa chắc chắn</Text>
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
                <Text style={styles.lowConfidenceTitle}>🧾 Mục chưa rõ từ hóa đơn</Text>
                <Text style={styles.lowConfidenceBody}>
                  {scanResult.unresolved_items.slice(0, 5).map((item) => item.raw_text).join(', ')}
                </Text>
              </SurfaceCard>
            ) : null}
            <SurfaceCard style={styles.totalCard}>
              <Text style={styles.totalLabel}>Tổng cộng</Text>
              <Text style={styles.totalCalorie}>{Math.round(totalCalories)} kcal</Text>
              <Text style={styles.totalRange}>Khoảng: {formatCalorieRange(totalCaloriesMin, totalCaloriesMax)}</Text>
              <Text style={styles.totalMacros}>P: {Math.round(totalProtein)}g  C: {Math.round(totalCarbs)}g  F: {Math.round(totalFat)}g</Text>
            </SurfaceCard>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveLog}>
              <Text style={styles.saveButtonText}>✅ Lưu vào nhật ký</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, isSavingMeal && styles.buttonDisabled]} onPress={handleSaveAsMeal} disabled={isSavingMeal}>
              <Text style={styles.secondaryButtonText}>💾 Lưu vào bộ sưu tập</Text>
            </TouchableOpacity>
            {/* Refine */}
            <SurfaceCard style={styles.refineContainer}>
              <Text style={styles.refineTitle}>🔄 Điều chỉnh kết quả</Text>
              <Text style={styles.refineHint}>AI ước lượng sai? Nhập thêm thông tin:</Text>
              <TextInput style={styles.refineInput} value={refineContext} onChangeText={setRefineContext}
                placeholder='VD: "Thực ra là 2 phần", "Thêm 1 quả trứng"' placeholderTextColor="#6b7280" multiline />
              <TouchableOpacity style={[styles.refineButton, (!refineContext.trim() || isRefining) && styles.buttonDisabled]}
                onPress={handleRefineScan} disabled={!refineContext.trim() || isRefining}>
                {isRefining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.refineButtonText}>Phân tích lại</Text>}
              </TouchableOpacity>
            </SurfaceCard>
          </View>
        )}

        {scanResult?.items.length === 0 && !isScanning && (
          <EmptyState
            icon="🤖"
            title="AI chưa nhận ra món ăn"
            description="Thử chụp rõ hơn, thêm mô tả bằng chữ hoặc dùng phần điều chỉnh để AI hiểu đúng hơn."
          />
        )}
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
      <Text style={styles.contextPickerLabel}>Hôm nay bạn đang:</Text>
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
    item.confidence >= 0.8 ? '#4ade80' : item.confidence >= 0.6 ? '#fbbf24' : '#f87171';
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
          <Text style={styles.removeBtnText}>✕ Xóa</Text>
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
          <Text style={styles.adjustBtnText}>-25g</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.adjustBtn} onPress={onIncrease}>
          <Text style={styles.adjustBtnText}>+25g</Text>
        </TouchableOpacity>
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  heroBody: { marginBottom: 16, maxWidth: 700 },
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 18, flexWrap: 'wrap' },
  modeTab: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#0f1b3b', alignItems: 'center', borderWidth: 1, borderColor: '#23386b' },
  modeTabActive: { backgroundColor: '#6ee7b7', borderColor: '#6ee7b7' },
  modeTabText: { color: '#c5d3eb', fontWeight: '700', fontSize: 14, textTransform: 'capitalize' },
  modeTabTextActive: { color: '#07111f' },
  searchContainer: { marginBottom: 16 },
  searchItemCard: { marginBottom: 10 },
  captureButton: { backgroundColor: '#0f1a37ee', borderRadius: 24, padding: 40, alignItems: 'center', gap: 12, marginBottom: 16, borderWidth: 1, borderColor: '#203463' },
  captureText: { color: '#9fb1d1', fontSize: 15, fontWeight: '600' },
  textInputContainer: { gap: 10, marginBottom: 16 },
  textInput: { backgroundColor: '#121d3f', borderRadius: 16, padding: 14, color: '#fff', minHeight: 80, borderWidth: 1, borderColor: '#23386b' },
  analyzeButton: { backgroundColor: '#7dd3fc', borderRadius: 14, padding: 14, alignItems: 'center' },
  analyzeButtonText: { color: '#07111f', fontWeight: '800', fontSize: 16 },
  previewImage: { width: '100%', height: 220, borderRadius: 18, marginBottom: 16 },
  scanningContainer: { alignItems: 'center', padding: 30, gap: 12 },
  scanningText: { color: '#9fb1d1', fontSize: 15, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#eff6ff', marginBottom: 12 },
  mealPicker: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mealChip: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: '#122041', alignItems: 'center', borderWidth: 1, borderColor: '#23386b' },
  mealChipActive: { backgroundColor: '#6ee7b720', borderWidth: 1, borderColor: '#6ee7b7' },
  mealChipText: { color: '#b6c7e3', fontSize: 13, fontWeight: '600' },
  mealChipTextActive: { color: '#6ee7b7', fontWeight: '800' },
  // Context picker
  contextPickerContainer: { marginBottom: 16 },
  contextPickerLabel: { color: '#9fb1d1', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  contextPicker: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  contextChip: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#122041', borderWidth: 1, borderColor: '#23386b', alignItems: 'center', flexDirection: 'row', gap: 4 },
  contextChipActive: { backgroundColor: '#6ee7b720', borderColor: '#6ee7b7' },
  contextChipIcon: { fontSize: 16 },
  contextChipText: { color: '#b6c7e3', fontSize: 12, fontWeight: '600' },
  contextChipTextActive: { color: '#6ee7b7', fontWeight: '800' },
  resultItem: { marginBottom: 10 },
  resultItemLowConf: { borderColor: '#7f1d1d', borderWidth: 1 },
  confidenceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  confidenceBadge: { fontSize: 12, fontWeight: '700' },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#1c1c2e', borderWidth: 1, borderColor: '#374151' },
  removeBtnText: { color: '#f87171', fontSize: 12, fontWeight: '700' },
  nameEditInput: { backgroundColor: '#0b1330', borderRadius: 10, padding: 10, color: '#fff', fontSize: 15, fontWeight: '700', borderWidth: 1.5, borderColor: '#6ee7b7', marginBottom: 6 },
  resultNameButton: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  calorieColumn: { alignItems: 'flex-end' },
  editHint: { fontSize: 12, opacity: 0.5 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  resultName: { color: '#fff', fontWeight: '700', flex: 1 },
  resultCalorie: { color: '#6ee7b7', fontWeight: '800' },
  resultRange: { color: '#9fb1d1', fontSize: 12, marginTop: 2 },
  resultDetail: { color: '#9fb1d1', fontSize: 13, marginBottom: 2 },
  resultMacros: { color: '#8194ba', fontSize: 12 },
  adjustRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  adjustBtn: { backgroundColor: '#11244c', borderWidth: 1, borderColor: '#2b4f8c', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  adjustBtnText: { color: '#bfdbfe', fontSize: 12, fontWeight: '700' },
  lowConfidenceBanner: { backgroundColor: '#2d1010', borderColor: '#7f1d1d', borderWidth: 1, marginBottom: 12 },
  lowConfidenceTitle: { color: '#f87171', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  lowConfidenceBody: { color: '#fca5a5', fontSize: 13, lineHeight: 19 },
  scanNoticeCard: { backgroundColor: '#2d1010', borderColor: '#7f1d1d', borderWidth: 1, marginBottom: 12 },
  scanNoticeTitle: { color: '#f87171', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  scanNoticeBody: { color: '#fca5a5', fontSize: 13, lineHeight: 19 },
  totalCard: { marginVertical: 12, alignItems: 'center' },
  totalLabel: { color: '#9fb1d1', fontSize: 13, marginBottom: 4 },
  totalCalorie: { color: '#6ee7b7', fontSize: 30, fontWeight: '800' },
  totalRange: { color: '#9fb1d1', fontSize: 13, marginTop: 4 },
  totalMacros: { color: '#9fb1d1', fontSize: 13, marginTop: 4 },
  saveButton: { backgroundColor: '#6ee7b7', borderRadius: 16, padding: 16, alignItems: 'center', marginBottom: 10 },
  saveButtonText: { color: '#07111f', fontWeight: '800', fontSize: 16 },
  secondaryButton: { borderRadius: 16, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#7dd3fc', backgroundColor: '#0d2440' },
  secondaryButtonText: { color: '#7dd3fc', fontWeight: '700', fontSize: 15 },
  buttonDisabled: { opacity: 0.4 },
  refineContainer: { marginBottom: 20 },
  refineTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 4 },
  refineHint: { color: '#9fb1d1', fontSize: 13, marginBottom: 10 },
  refineInput: { backgroundColor: '#0b1330', borderRadius: 14, padding: 12, color: '#fff', minHeight: 60, marginBottom: 10, borderWidth: 1, borderColor: '#203463' },
  refineButton: { backgroundColor: '#8b5cf6', borderRadius: 12, padding: 12, alignItems: 'center' },
  refineButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  // Barcode
  barcodeContainer: { marginBottom: 16 },
  barcodeCamera: { width: '100%', height: 280, borderRadius: 16, overflow: 'hidden' },
  barcodeScanningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0008' },
  barcodeHint: { color: '#9fb1d1', textAlign: 'center', marginTop: 10, fontSize: 13 },
  barcodeImage: { width: '100%', height: 160, borderRadius: 16, marginBottom: 12 },
  barcodeProductName: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  barcodeServing: { color: '#9fb1d1', fontSize: 13, marginBottom: 12 },
  // Voice recording styles
  recordingActiveContainer: { alignItems: 'center', paddingVertical: 20, gap: 20 },
  recordingPulse: { 
    width: 120, 
    height: 120, 
    borderRadius: 60, 
    backgroundColor: '#f87171', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fee2e2',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 0px 10px rgba(248, 113, 113, 0.5)' }
      : {
          shadowColor: '#f87171',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 10,
        }),
    elevation: 8,
  },
  recordingDuration: { color: '#fff', fontSize: 32, fontWeight: '800' },
  stopRecordingButton: { backgroundColor: '#f87171', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  stopRecordingText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  captureButtonSecondary: { opacity: 0.7 },
  transcriptContainer: { marginVertical: 12 },
  transcriptLabel: { color: '#9fb1d1', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  voiceHintText: { color: '#9fb1d1', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginVertical: 16, lineHeight: 20 },
});
