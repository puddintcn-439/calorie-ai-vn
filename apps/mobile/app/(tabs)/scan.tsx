import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { AIScanResponse, AIDetectedItem, MealType } from '@calorie-ai/types';
import { scanImageFromUri, scanText, refineScan } from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';
import { apiClient } from '../../services/api';
import { router } from 'expo-router';

type InputMode = 'camera' | 'gallery' | 'text' | 'barcode';

const MODE_ICONS: Record<InputMode, string> = {
  camera: '📸', gallery: '🖼', text: '✏️', barcode: '🔍',
};

export default function ScanScreen() {
  const [mode, setMode] = useState<InputMode>('camera');
  const [textInput, setTextInput] = useState('');
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<AIScanResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<MealType>('lunch');
  const [refineContext, setRefineContext] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [isSavingMeal, setIsSavingMeal] = useState(false);
  // Barcode
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [barcodeResult, setBarcodeResult] = useState<any | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const { addLog, saveMeal } = useLogStore();

  // ─────────────────────── Handlers ───────────────────────

  const handleCameraCapture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Cần quyền truy cập camera'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) await runImageScan(result.assets[0].uri);
  };

  const handleGalleryPick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled) await runImageScan(result.assets[0].uri);
  };

  const runImageScan = async (uri: string) => {
    setScannedImage(uri); setScanResult(null); setRefineContext(''); setIsScanning(true);
    try { setScanResult(await scanImageFromUri(uri)); }
    catch { Alert.alert('Lỗi', 'Không thể phân tích ảnh.'); }
    finally { setIsScanning(false); }
  };

  const handleTextScan = async () => {
    if (!textInput.trim()) return;
    setScanResult(null); setRefineContext(''); setIsScanning(true);
    try { setScanResult(await scanText(textInput.trim())); }
    catch { Alert.alert('Lỗi', 'Không thể phân tích.'); }
    finally { setIsScanning(false); }
  };

  const handleRefineScan = async () => {
    if (!refineContext.trim() || !scanResult) return;
    setIsRefining(true);
    try {
      const summary = scanResult.items.map((i) => `- ${i.name_vi ?? i.name}: ${i.calories}kcal, ${i.estimated_grams}g`).join('\n');
      const refined = await refineScan(summary, refineContext.trim(), scanResult.scan_id);
      if (refined.success && refined.items.length > 0) { setScanResult(refined); setRefineContext(''); }
      else Alert.alert('Không thể điều chỉnh', 'AI không hiểu thông tin bổ sung. Thử lại!');
    } catch { Alert.alert('Lỗi', 'Không thể phân tích lại.'); }
    finally { setIsRefining(false); }
  };

  const handleSaveLog = async () => {
    if (!scanResult?.items.length) return;
    try {
      for (const item of scanResult.items) {
        await addLog({ name: item.name_vi ?? item.name, meal_type: selectedMeal, calories: item.calories, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, estimated_grams: item.estimated_grams, scan_id: scanResult.scan_id, image_url: scannedImage ?? undefined });
      }
      Alert.alert('✅ Đã lưu!', `${scanResult.items.length} món`, [{ text: 'OK', onPress: () => router.replace('/(tabs)/') }]);
    } catch { Alert.alert('Lỗi', 'Không thể lưu log'); }
  };

  const handleSaveAsMeal = async () => {
    if (!scanResult?.items.length) return;
    Alert.prompt('💾 Lưu bộ sưu tập', 'Đặt tên cho bữa ăn:', async (name) => {
      if (!name?.trim()) return;
      setIsSavingMeal(true);
      try {
        await saveMeal(name.trim(), scanResult.items.map((i) => ({ name: i.name, name_vi: i.name_vi, calories: i.calories, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, estimated_grams: i.estimated_grams })));
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
      Alert.alert('✅ Đã lưu!', undefined, [{ text: 'OK', onPress: () => router.replace('/(tabs)/') }]);
    } catch { Alert.alert('Lỗi', 'Không thể lưu log'); }
  };

  // ─────────────────────── Render ───────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Scan đồ ăn</Text>

        {/* Mode Tabs */}
        <View style={styles.modeTabs}>
          {(Object.keys(MODE_ICONS) as InputMode[]).map((m) => (
            <TouchableOpacity key={m} style={[styles.modeTab, mode === m && styles.modeTabActive]}
              onPress={() => { setMode(m); setBarcodeScanned(false); setBarcodeResult(null); setScanResult(null); }}>
              <Text style={[styles.modeTabText, mode === m && styles.modeTabTextActive]}>{MODE_ICONS[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>

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
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Dinh dưỡng / 100g</Text>
              <Text style={styles.totalCalorie}>{barcodeResult.calories_per_100g ?? 0} kcal</Text>
              <Text style={styles.totalMacros}>P: {barcodeResult.protein_g ?? 0}g  C: {barcodeResult.carbs_g ?? 0}g  F: {barcodeResult.fat_g ?? 0}g</Text>
            </View>
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

        {/* Preview Image (camera/gallery) */}
        {scannedImage && mode !== 'barcode' && (
          <Image source={{ uri: scannedImage }} style={styles.previewImage} resizeMode="cover" />
        )}

        {/* Loading spinner for AI scan */}
        {isScanning && mode !== 'barcode' && (
          <View style={styles.scanningContainer}>
            <ActivityIndicator size="large" color="#4ade80" />
            <Text style={styles.scanningText}>AI đang phân tích...</Text>
          </View>
        )}

        {/* ── AI Scan Results ── */}
        {scanResult && !isScanning && (
          <View>
            <Text style={styles.sectionTitle}>
              Kết quả ({Math.round(scanResult.ai_confidence * 100)}% độ tin cậy)
            </Text>
            <MealPicker selected={selectedMeal} onSelect={setSelectedMeal} />
            {scanResult.items.map((item, i) => <ScanResultItem key={i} item={item} />)}
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Tổng cộng</Text>
              <Text style={styles.totalCalorie}>{scanResult.total_calories} kcal</Text>
              <Text style={styles.totalMacros}>P: {Math.round(scanResult.total_protein_g)}g  C: {Math.round(scanResult.total_carbs_g)}g  F: {Math.round(scanResult.total_fat_g)}g</Text>
            </View>
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveLog}>
              <Text style={styles.saveButtonText}>✅ Lưu vào nhật ký</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, isSavingMeal && styles.buttonDisabled]} onPress={handleSaveAsMeal} disabled={isSavingMeal}>
              <Text style={styles.secondaryButtonText}>💾 Lưu vào bộ sưu tập</Text>
            </TouchableOpacity>
            {/* Refine */}
            <View style={styles.refineContainer}>
              <Text style={styles.refineTitle}>🔄 Điều chỉnh kết quả</Text>
              <Text style={styles.refineHint}>AI ước lượng sai? Nhập thêm thông tin:</Text>
              <TextInput style={styles.refineInput} value={refineContext} onChangeText={setRefineContext}
                placeholder='VD: "Thực ra là 2 phần", "Thêm 1 quả trứng"' placeholderTextColor="#6b7280" multiline />
              <TouchableOpacity style={[styles.refineButton, (!refineContext.trim() || isRefining) && styles.buttonDisabled]}
                onPress={handleRefineScan} disabled={!refineContext.trim() || isRefining}>
                {isRefining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.refineButtonText}>Phân tích lại</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {scanResult?.items.length === 0 && !isScanning && (
          <Text style={styles.emptyText}>Không nhận ra đồ ăn. Thử lại nhé!</Text>
        )}
      </ScrollView>
    </SafeAreaView>
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

function ScanResultItem({ item }: { item: AIDetectedItem }) {
  return (
    <View style={styles.resultItem}>
      <View style={styles.resultHeader}>
        <Text style={styles.resultName}>{item.name_vi}</Text>
        <Text style={styles.resultCalorie}>{item.calories} kcal</Text>
      </View>
      <Text style={styles.resultDetail}>{item.quantity} {item.unit} (~{item.estimated_grams}g)</Text>
      <Text style={styles.resultMacros}>P: {Math.round(item.protein_g)}g  C: {Math.round(item.carbs_g)}g  F: {Math.round(item.fat_g)}g</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  modeTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeTab: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#1a1a2e', alignItems: 'center' },
  modeTabActive: { backgroundColor: '#4ade80' },
  modeTabText: { color: '#9ca3af', fontWeight: '600', fontSize: 18 },
  modeTabTextActive: { color: '#0f0f1a' },
  captureButton: { backgroundColor: '#1a1a2e', borderRadius: 16, padding: 40, alignItems: 'center', gap: 12, marginBottom: 16 },
  captureText: { color: '#9ca3af', fontSize: 15 },
  textInputContainer: { gap: 10, marginBottom: 16 },
  textInput: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14, color: '#fff', minHeight: 80 },
  analyzeButton: { backgroundColor: '#4ade80', borderRadius: 12, padding: 14, alignItems: 'center' },
  analyzeButtonText: { color: '#0f0f1a', fontWeight: 'bold', fontSize: 16 },
  previewImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 16 },
  scanningContainer: { alignItems: 'center', padding: 30, gap: 12 },
  scanningText: { color: '#9ca3af', fontSize: 15, marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 12 },
  mealPicker: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  mealChip: { flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#1a1a2e', alignItems: 'center' },
  mealChipActive: { backgroundColor: '#4ade8033', borderWidth: 1, borderColor: '#4ade80' },
  mealChipText: { color: '#9ca3af', fontSize: 13, fontWeight: '500' },
  mealChipTextActive: { color: '#4ade80', fontWeight: '700' },
  resultItem: { backgroundColor: '#1a1a2e', borderRadius: 12, padding: 14, marginBottom: 10 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  resultName: { color: '#fff', fontWeight: '600', flex: 1 },
  resultCalorie: { color: '#4ade80', fontWeight: 'bold' },
  resultDetail: { color: '#9ca3af', fontSize: 13, marginBottom: 2 },
  resultMacros: { color: '#6b7280', fontSize: 12 },
  totalCard: { backgroundColor: '#1a1a2e', borderRadius: 14, padding: 16, marginVertical: 12, alignItems: 'center' },
  totalLabel: { color: '#9ca3af', fontSize: 13, marginBottom: 4 },
  totalCalorie: { color: '#4ade80', fontSize: 28, fontWeight: 'bold' },
  totalMacros: { color: '#9ca3af', fontSize: 13, marginTop: 4 },
  saveButton: { backgroundColor: '#4ade80', borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 10 },
  saveButtonText: { color: '#0f0f1a', fontWeight: 'bold', fontSize: 16 },
  secondaryButton: { borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: '#4ade80', backgroundColor: '#4ade8011' },
  secondaryButtonText: { color: '#4ade80', fontWeight: '600', fontSize: 15 },
  buttonDisabled: { opacity: 0.4 },
  refineContainer: { backgroundColor: '#1a1a2e', borderRadius: 14, padding: 16, marginBottom: 20 },
  refineTitle: { color: '#fff', fontWeight: '600', fontSize: 16, marginBottom: 4 },
  refineHint: { color: '#9ca3af', fontSize: 13, marginBottom: 10 },
  refineInput: { backgroundColor: '#0f0f1a', borderRadius: 10, padding: 12, color: '#fff', minHeight: 60, marginBottom: 10 },
  refineButton: { backgroundColor: '#6366f1', borderRadius: 10, padding: 12, alignItems: 'center' },
  refineButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyText: { color: '#9ca3af', textAlign: 'center', marginTop: 30, fontSize: 15 },
  // Barcode
  barcodeContainer: { marginBottom: 16 },
  barcodeCamera: { width: '100%', height: 280, borderRadius: 16, overflow: 'hidden' },
  barcodeScanningOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0008' },
  barcodeHint: { color: '#9ca3af', textAlign: 'center', marginTop: 10, fontSize: 13 },
  barcodeImage: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12 },
  barcodeProductName: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  barcodeServing: { color: '#9ca3af', fontSize: 13, marginBottom: 12 },
});
