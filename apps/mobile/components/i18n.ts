import { useEffect, useMemo } from 'react';
import { AlertButton } from 'react-native';
import { useLocaleStore } from '../store/locale.store';

export type Locale = 'vi' | 'en';

type Params = Record<string, string | number | null | undefined>;

const STRINGS = {
  vi: {
    'tabs.today': 'Hôm nay',
    'tabs.scan': 'Scan',
    'tabs.log': 'Log',
    'tabs.coach': 'Coach',
    'tabs.profile': 'Hồ sơ',
    'tabs.body': 'Cơ thể',
    'tabs.insights': 'Insight',
    'tabs.strength': 'Tập tạ',
    'locale.vi': 'Tiếng Việt',
    'locale.en': 'English',
    'locale.system': 'Theo máy',
    'profile.language.title': 'Ngôn ngữ',
    'profile.language.body': 'Đổi ngôn ngữ giao diện cho toàn app.',
    'profile.appearance.title': 'Giao diện',
    'profile.appearance.body': 'Chọn nền sáng, tối hoặc theo thiết bị.',
    'profile.appearance.light': 'Sáng',
    'profile.appearance.dark': 'Tối',
    'profile.appearance.system': 'Theo máy',
  },
  en: {
    'tabs.today': 'Today',
    'tabs.scan': 'Scan',
    'tabs.log': 'Log',
    'tabs.coach': 'Coach',
    'tabs.profile': 'Profile',
    'tabs.body': 'Body',
    'tabs.insights': 'Insights',
    'tabs.strength': 'Strength',
    'locale.vi': 'Vietnamese',
    'locale.en': 'English',
    'locale.system': 'System',
    'profile.language.title': 'Language',
    'profile.language.body': 'Change the interface language across the app.',
    'profile.appearance.title': 'Appearance',
    'profile.appearance.body': 'Choose light, dark, or follow the device setting.',
    'profile.appearance.light': 'Light',
    'profile.appearance.dark': 'Dark',
    'profile.appearance.system': 'System',
  },
} as const;

export type I18nKey = keyof typeof STRINGS.vi;

const EN_BY_VI: Record<string, string> = {
  'Hôm nay': 'Today',
  'Tổng quan hôm nay': 'Today overview',
  'Nhìn nhanh calo, bữa ăn và việc cần chỉnh ở bữa kế tiếp.': 'Quickly review calories, meals, and what to adjust next.',
  'Scan bữa ăn': 'Scan meal',
  'Ưu tiên ngay': 'Top priority',
  'Bắt đầu ngày': 'Start the day',
  'Việc nên làm tiếp': 'Next action',
  'Bữa kế tiếp': 'Next meal',
  'Ổn định': 'Stable',
  'Log bữa đầu tiên': 'Log your first meal',
  'Scan ảnh hoặc nhập nhanh để app tính phần còn lại trong ngày chính xác hơn.': 'Scan a photo or add a quick entry so the app can calculate the rest of the day more accurately.',
  'Giữ nhịp hôm nay': 'Keep today steady',
  'Tiếp tục log bữa kế tiếp và duy trì vận động nền.': 'Keep logging the next meal and maintain baseline movement.',
  'Mở nhật ký': 'Open log',
  'Mục tiêu': 'Target',
  'Đã nạp': 'Consumed',
  'Đã đốt': 'Burned',
  'Protein': 'Protein',
  'Tinh bột': 'Carbs',
  'Béo': 'Fat',
  'Chất xơ': 'Fiber',
  'Muối': 'Sodium',
  'Đường': 'Sugar',
  'Béo bão hòa': 'Saturated fat',
  'Mục tiêu calo': 'Calorie target',
  'Vận động hôm nay': 'Today movement',
  'Việc nên làm tiếp theo': 'Next suggested action',
  'Vận động nền hôm nay': 'Baseline movement today',
  'Hoàn thành': 'Complete',
  'Đang log': 'Logging',
  'Đã log': 'Logged',
  'Sửa lộ trình': 'Edit routine',
  'Log thủ công': 'Manual log',
  'Mở Profile': 'Open Profile',
  'Bữa ăn hôm nay': "Today's meals",
  'Xem nhật ký': 'View log',
  'Chưa log': 'Not logged',
  'Cơ thể': 'Body',
  'Thành tích': 'Achievements',
  'Chưa có bữa nào hôm nay': 'No meals today yet',
  'Scan món Việt đầu tiên hoặc log nhanh từ nhật ký.': 'Scan your first meal or add a quick manual log.',

  'Log món ăn nhanh hơn.': 'Log meals faster.',
  'Chụp, nói hoặc nhập món Việt trong vài giây.': 'Take a photo, speak, or type a meal in seconds.',
  'Camera': 'Camera',
  'Ảnh': 'Photo',
  'Nhập': 'Type',
  'Khác': 'Other',
  'Giọng nói': 'Voice',
  'Hóa đơn': 'Receipt',
  'Mã vạch': 'Barcode',
  'Tìm món': 'Search food',
  'Hôm nay bạn đang:': 'Today you feel:',
  'Áp lực': 'Stressed',
  'Kỳ kinh': 'Period',
  'Bận': 'Busy',
  'Du lịch': 'Travel',
  'Ngủ kém': 'Poor sleep',
  'Tiệc': 'Party',
  'Chụp ảnh đồ ăn': 'Take a food photo',
  'Phân tích': 'Analyze',
  'Phân tích lại': 'Analyze again',
  'Lưu vào nhật ký': 'Save to log',
  'Tổng cộng': 'Total',
  'Chọn bữa': 'Choose meal',
  'Xóa': 'Delete',

  'Nhật ký': 'Log',
  'Ghi lại bữa ăn, hoạt động và lộ trình tập luyện.': 'Track meals, activity, and training routines.',
  'Bữa sáng': 'Breakfast',
  'Bữa trưa': 'Lunch',
  'Bữa tối': 'Dinner',
  'Ăn vặt': 'Snack',
  'Hoạt động': 'Activity',
  'Thêm': 'Add',
  'Không có dữ liệu': 'No data',
  'Món đã lưu': 'Saved meals',
  'Đã lưu': 'Saved',
  'Không lưu được': 'Could not save',
  'Vui lòng thử lại sau.': 'Please try again later.',

  'AI Coach': 'AI Coach',
  'Coach': 'Coach',
  'Hỏi Coach': 'Ask Coach',
  'Gửi': 'Send',
  'Đang tải...': 'Loading...',
  'Những gợi ý cho bạn:': 'Suggestions for you:',
  'Tôi đã hiểu': 'Got it',

  'Hồ sơ cá nhân': 'Profile',
  'Thiết lập hồ sơ để AI tính mục tiêu hợp lý hơn.': 'Set up your profile so AI can calculate better targets.',
  'Cập nhật chỉ số, mục tiêu, lộ trình vận động và nhắc nhở.': 'Update stats, goals, movement routines, and reminders.',
  'Thiết lập nhanh': 'Quick setup',
  'Thiết lập thông tin thể trạng': 'Body profile setup',
  'Họ và tên': 'Full name',
  'Tuổi': 'Age',
  'Giới tính': 'Sex',
  'Chiều cao': 'Height',
  'Cân nặng': 'Weight',
  'Mục tiêu chính': 'Main goal',
  'Lưu hồ sơ': 'Save profile',
  'Kế hoạch cá nhân': 'Personal plan',
  'Lộ trình vận động': 'Movement routine',
  'Nhắc nhở': 'Reminders',
  'Gói hiện tại': 'Current plan',
  'Đăng xuất': 'Log out',
  'Ngôn ngữ': 'Language',
  'Giao diện': 'Appearance',
  'Sáng': 'Light',
  'Tối': 'Dark',
  'Theo máy': 'System',
  'Tiếng Việt': 'Vietnamese',
  'English': 'English',

  'Đăng nhập': 'Log in',
  'Tạo tài khoản': 'Create account',
  'Email': 'Email',
  'Mật khẩu': 'Password',
  'Mật khẩu (tối thiểu 6 ký tự)': 'Password (at least 6 characters)',
  'Họ và tên (tuỳ chọn)': 'Full name (optional)',
  'Chưa có tài khoản? Tạo tài khoản': "Don't have an account? Create one",
  'Đã có tài khoản? Quay về đăng nhập': 'Already have an account? Back to login',
  'Đẹp dáng và tự tin hơn, theo cách nhẹ nhàng mỗi ngày.': 'Feel fitter and more confident, one gentle day at a time.',
  'Scan ảnh': 'Photo scan',
  'Món Việt': 'Vietnamese food',
  'Tạo tài khoản để bắt đầu hành trình đẹp dáng bền vững.': 'Create an account to start a sustainable fitness journey.',
  'Chỉ vài giây để bắt đầu cảm thấy kiểm soát tốt hơn mỗi ngày.': 'It only takes a few seconds to feel more in control each day.',
  'Quay lại hành trình tự tin hơn mỗi ngày.': 'Return to your daily confidence routine.',
  'Bạn không cần siết cực đoan. App giúp bạn theo dõi nhẹ nhàng, điều chỉnh thực tế và giữ động lực đều đặn.':
    'You do not need extreme restriction. The app helps you track gently, adjust realistically, and stay consistent.',
  'Không cần hoàn hảo. Chỉ cần bắt đầu lại hôm nay với vài thao tác nhanh, app sẽ đồng hành và nhắc bạn đi đúng hướng.':
    'No need to be perfect. Start again today with a few quick actions, and the app will help keep you on track.',

  'Phân bổ dinh dưỡng': 'Nutrition split',
  'Chưa có mục tiêu calo để tính macros.': 'No calorie target yet for macro calculation.',
  'Calo/ngày': 'Calories/day',
  'Chất béo': 'Fat',
  'Carbs': 'Carbs',
  'Mục tiêu chất lượng': 'Quality targets',
  'Đường tự do': 'Free sugar',
  'Hồ sơ có yếu tố sức khỏe cần chuyên gia xem lại trước khi dùng mục tiêu này.':
    'This profile has health factors that should be reviewed by a professional before using this target.',
  'Tuân thủ tuần': 'Weekly adherence',
  'Chưa có dữ liệu tuần này. Ghi nhật ký ăn uống để nhận phân tích.':
    'No data this week yet. Log meals to receive analysis.',
  'Tuân thủ': 'Adherence',
  'Ghi chép': 'Logs',
  'Trên mục tiêu': 'Above target',
  'Đúng đích': 'On target',
  'Dưới mục tiêu': 'Below target',
  'Mở Coach': 'Open Coach',

  'Lỗi': 'Error',
  'Không mở được': 'Could not open',
  'Không tải lại được': 'Could not reload',
  'Không thể lưu mục tiêu.': 'Could not save target.',
  'Không thể ghi hoạt động lúc này.': 'Could not log activity right now.',
  'Đã lưu mục tiêu': 'Target saved',
  'Đã log vận động': 'Movement logged',
  'Không thể tải thông tin tuần.': 'Could not load weekly insights.',
  'Thử lại': 'Try again',
};

const MOJIBAKE_MARKERS = /(?:Ã|Ä|Â|Æ|Å|â|ð|áº|á»|àª|¤|º|»|||||œ|€|™)/;
const WINDOWS_1252_BYTES: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function normaliseBrokenMojibake(value: string): string {
  return value
    .replace(/vÃ i/g, 'vài')
    .replace(/vÃ (?=[A-Za-zÀ-ỹ])/g, 'và ')
    .replace(/nÃy/g, 'này')
    .replace(/lÃm/g, 'làm')
    .replace(/mÃ (?=[A-Za-zÀ-ỹ])/g, 'mà ')
    .replace(/nÃ (?=[A-Za-zÀ-ỹ])/g, 'nà ');
}

function decodeMojibakeChunk(chunk: string): string {
  if (!chunk || !MOJIBAKE_MARKERS.test(chunk)) return chunk;
  try {
    let encoded = '';
    for (let i = 0; i < chunk.length; i += 1) {
      const code = chunk.charCodeAt(i);
      const byte = code <= 0xff ? code : WINDOWS_1252_BYTES[code];
      if (byte === undefined) return chunk;
      encoded += `%${byte.toString(16).padStart(2, '0')}`;
    }
    return decodeURIComponent(encoded);
  } catch {
    return chunk;
  }
}

export function getDefaultLocale(): Locale {
  return 'vi';
}

export function repairMojibake(value: string): string {
  const normalised = normaliseBrokenMojibake(value);
  if (!MOJIBAKE_MARKERS.test(normalised)) return normalised;

  let fixed = '';
  let chunk = '';

  for (let i = 0; i < normalised.length; i += 1) {
    const char = normalised[i];
    const code = normalised.charCodeAt(i);
    const canDecodeAsByte = code <= 0xff || WINDOWS_1252_BYTES[code] !== undefined;

    if (canDecodeAsByte) {
      chunk += char;
    } else {
      fixed += decodeMojibakeChunk(chunk);
      chunk = '';
      fixed += char;
    }
  }

  return fixed + decodeMojibakeChunk(chunk);
}

function interpolate(value: string, params?: Params): string {
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const param = params[key];
    return param === null || param === undefined ? '' : String(param);
  });
}

export function tr(key: I18nKey, locale: Locale = getDefaultLocale(), params?: Params) {
  return interpolate(STRINGS[locale][key] ?? STRINGS.vi[key], params);
}

function preserveOuterWhitespace(source: string, translated: string): string {
  const prefix = source.match(/^\s*/)?.[0] ?? '';
  const suffix = source.match(/\s*$/)?.[0] ?? '';
  return `${prefix}${translated}${suffix}`;
}

export function translateText(source: string, locale: Locale = getDefaultLocale(), params?: Params): string {
  const fixed = repairMojibake(source);
  if (!fixed.trim()) return fixed;
  if (locale === 'vi') return interpolate(fixed, params);

  const direct = EN_BY_VI[fixed] ?? EN_BY_VI[fixed.trim()];
  if (direct) {
    return interpolate(direct === EN_BY_VI[fixed.trim()] ? preserveOuterWhitespace(fixed, direct) : direct, params);
  }

  return interpolate(fixed, params);
}

export function translateAlertButtons(buttons: AlertButton[] | undefined, locale: Locale) {
  return buttons?.map((button) => ({
    ...button,
    text: button.text ? translateText(button.text, locale) : button.text,
  }));
}

export function useI18n() {
  const { locale, hydrated, loadLocale, setLocale } = useLocaleStore();

  useEffect(() => {
    if (!hydrated) {
      loadLocale();
    }
  }, [hydrated, loadLocale]);

  return useMemo(() => ({
    locale,
    setLocale,
    t: (key: I18nKey, params?: Params) => tr(key, locale, params),
    tx: (source: string, params?: Params) => translateText(source, locale, params),
  }), [locale, setLocale]);
}
