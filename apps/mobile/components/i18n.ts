import { useEffect, useMemo } from 'react';
import { AlertButton } from 'react-native';
import { useLocaleStore } from '../store/locale.store';
import { GENERATED_STRINGS } from './i18n-generated';

export type Locale = 'vi' | 'en';

type Params = Record<string, string | number | null | undefined>;

export const STRINGS = {
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

    'common.error': 'Lỗi',
    'common.cancel': 'Hủy',
    'common.delete': 'Xóa',
    'common.tryAgain': 'Vui lòng thử lại.',
    'common.save': 'Lưu',
    'common.saving': 'Đang lưu...',

    'auth.brand': 'Vietnamese AI Nutrition',
    'auth.login.eyebrow': 'Vietnamese AI Nutrition',
    'auth.login.title': 'Đẹp dáng và tự tin hơn, theo cách nhẹ nhàng mỗi ngày.',
    'auth.login.body': 'Không cần hoàn hảo. Chỉ cần bắt đầu lại hôm nay với vài thao tác nhanh, app sẽ đồng hành và nhắc bạn đi đúng hướng.',
    'auth.login.photoScan': 'Scan ảnh',
    'auth.login.vietnameseFood': 'Món Việt',
    'auth.login.aiCoach': 'AI Coach',
    'auth.login.formTitle': 'Đăng nhập',
    'auth.login.subtitle': 'Quay lại hành trình tự tin hơn mỗi ngày.',
    'auth.login.submit': 'Đăng nhập',
    'auth.login.createAccount': 'Chưa có tài khoản? Tạo tài khoản',
    'auth.login.failed': 'Đăng nhập thất bại',
    'auth.email.placeholder': 'Email',
    'auth.password.placeholder': 'Mật khẩu',

    'auth.register.eyebrow': 'Build Your Nutrition Loop',
    'auth.register.title': 'Tạo tài khoản để bắt đầu hành trình đẹp dáng bền vững.',
    'auth.register.body': 'Bạn không cần siết cực đoan. App giúp bạn theo dõi nhẹ nhàng, điều chỉnh thực tế và giữ động lực đều đặn.',
    'auth.register.formTitle': 'Tạo tài khoản',
    'auth.register.subtitle': 'Chỉ vài giây để bắt đầu cảm thấy kiểm soát tốt hơn mỗi ngày.',
    'auth.register.fullName.placeholder': 'Họ và tên (tùy chọn)',
    'auth.register.password.placeholder': 'Mật khẩu (tối thiểu 6 ký tự)',
    'auth.register.submit': 'Tạo tài khoản',
    'auth.register.backToLogin': 'Đã có tài khoản? Quay về đăng nhập',
    'auth.register.failed': 'Đăng ký thất bại',

    'profile.hero.eyebrow': 'Hồ sơ cá nhân',
    'profile.hero.title': 'Thiết lập hồ sơ để AI tính mục tiêu hợp lý hơn.',
    'profile.hero.body': 'Cập nhật chỉ số, mục tiêu, lộ trình vận động và nhắc nhở.',
    'profile.shortcut.body': 'Cơ thể',
    'profile.shortcut.insights': 'Insight',
    'profile.shortcut.achievements': 'Thành tích',
    'profile.language.title': 'Ngôn ngữ',
    'profile.language.body': 'Đổi ngôn ngữ giao diện cho toàn app.',
    'profile.appearance.title': 'Giao diện',
    'profile.appearance.body': 'Chọn nền sáng, tối hoặc theo thiết bị.',
    'profile.appearance.light': 'Sáng',
    'profile.appearance.dark': 'Tối',
    'profile.appearance.system': 'Theo máy',
    'profile.setup.eyebrow': 'Thiết lập nhanh',
    'profile.setup.title': '{{completed}}/{{total}} mục đã sẵn sàng',
    'profile.setup.save': 'Lưu hồ sơ',
    'profile.setup.saving': 'Đang lưu hồ sơ...',
    'profile.logout': 'Đăng xuất',
    'profile.logout.confirmTitle': 'Đăng xuất',
    'profile.logout.confirmMessage': 'Bạn có chắc muốn đăng xuất?',
    'profile.save.failed': 'Không thể lưu.',
    'profile.subscription.updated': 'Đã cập nhật gói',
    'profile.subscription.updateFailed': 'Không thể cập nhật gói',
    'profile.subscription.updatedBody': 'User hiện đang ở gói {{tier}}.',
    'profile.roadmap.duplicateTitle': 'Hoạt động đã có',
    'profile.roadmap.duplicateBody': 'Bài này đã nằm trong lộ trình. Hãy dùng nút Sửa trên bài đó nếu muốn đổi thời gian.',
    'profile.roadmap.saveExerciseFailed': 'Không thể lưu bài tập',
    'profile.roadmap.deleteExerciseFailed': 'Không thể xóa bài tập',
    'profile.roadmap.deleteTitle': 'Xóa bài tập',
    'profile.roadmap.deleteConfirm': 'Xóa "{{title}}" khỏi lộ trình?',
    'profile.roadmap.editSaved': 'Đã sửa lộ trình',
    'profile.roadmap.exerciseAdded': 'Đã thêm bài tập',
    'profile.roadmap.exerciseDeleted': 'Đã xóa bài tập',

    'reward.profileSaved.title': 'Đã lưu hồ sơ',
    'reward.profileSaved.body': 'Mục tiêu, nhắc nhở và lộ trình đã được cập nhật.',
    ...GENERATED_STRINGS.vi,
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

    'common.error': 'Error',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.tryAgain': 'Please try again.',
    'common.save': 'Save',
    'common.saving': 'Saving...',

    'auth.brand': 'Vietnamese AI Nutrition',
    'auth.login.eyebrow': 'Vietnamese AI Nutrition',
    'auth.login.title': 'Feel fitter and more confident, one gentle day at a time.',
    'auth.login.body': 'No need to be perfect. Start again today with a few quick actions, and the app will help keep you on track.',
    'auth.login.photoScan': 'Photo scan',
    'auth.login.vietnameseFood': 'Vietnamese food',
    'auth.login.aiCoach': 'AI Coach',
    'auth.login.formTitle': 'Log in',
    'auth.login.subtitle': 'Return to your daily confidence routine.',
    'auth.login.submit': 'Log in',
    'auth.login.createAccount': "Don't have an account? Create one",
    'auth.login.failed': 'Login failed',
    'auth.email.placeholder': 'Email',
    'auth.password.placeholder': 'Password',

    'auth.register.eyebrow': 'Build Your Nutrition Loop',
    'auth.register.title': 'Create an account to start a sustainable fitness journey.',
    'auth.register.body': 'You do not need extreme restriction. The app helps you track gently, adjust realistically, and stay consistent.',
    'auth.register.formTitle': 'Create account',
    'auth.register.subtitle': 'It only takes a few seconds to feel more in control each day.',
    'auth.register.fullName.placeholder': 'Full name (optional)',
    'auth.register.password.placeholder': 'Password (at least 6 characters)',
    'auth.register.submit': 'Create account',
    'auth.register.backToLogin': 'Already have an account? Back to login',
    'auth.register.failed': 'Registration failed',

    'profile.hero.eyebrow': 'Profile',
    'profile.hero.title': 'Set up your profile so AI can calculate better targets.',
    'profile.hero.body': 'Update stats, goals, movement routines, and reminders.',
    'profile.shortcut.body': 'Body',
    'profile.shortcut.insights': 'Insight',
    'profile.shortcut.achievements': 'Achievements',
    'profile.language.title': 'Language',
    'profile.language.body': 'Change the interface language across the app.',
    'profile.appearance.title': 'Appearance',
    'profile.appearance.body': 'Choose light, dark, or follow the device setting.',
    'profile.appearance.light': 'Light',
    'profile.appearance.dark': 'Dark',
    'profile.appearance.system': 'System',
    'profile.setup.eyebrow': 'Quick setup',
    'profile.setup.title': '{{completed}}/{{total}} items ready',
    'profile.setup.save': 'Save profile',
    'profile.setup.saving': 'Saving profile...',
    'profile.logout': 'Log out',
    'profile.logout.confirmTitle': 'Log out',
    'profile.logout.confirmMessage': 'Are you sure you want to log out?',
    'profile.save.failed': 'Could not save.',
    'profile.subscription.updated': 'Plan updated',
    'profile.subscription.updateFailed': 'Could not update plan',
    'profile.subscription.updatedBody': 'User is now on the {{tier}} plan.',
    'profile.roadmap.duplicateTitle': 'Activity already exists',
    'profile.roadmap.duplicateBody': 'This exercise is already in your routine. Use Edit on that exercise if you want to change the duration.',
    'profile.roadmap.saveExerciseFailed': 'Could not save exercise',
    'profile.roadmap.deleteExerciseFailed': 'Could not delete exercise',
    'profile.roadmap.deleteTitle': 'Delete exercise',
    'profile.roadmap.deleteConfirm': 'Remove "{{title}}" from your routine?',
    'profile.roadmap.editSaved': 'Routine updated',
    'profile.roadmap.exerciseAdded': 'Exercise added',
    'profile.roadmap.exerciseDeleted': 'Exercise deleted',

    'reward.profileSaved.title': 'Profile saved',
    'reward.profileSaved.body': 'Goals, reminders, and routines have been updated.',
    ...GENERATED_STRINGS.en,
  },
} as const;

export type I18nKey = keyof typeof STRINGS.vi;

const I18N_KEYS = new Set<string>(Object.keys(STRINGS.vi));

function interpolate(value: string, params?: Params): string {
  if (!params) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const param = params[key];
    return param === null || param === undefined ? '' : String(param);
  });
}

export function getDefaultLocale(): Locale {
  return 'vi';
}

export function isI18nKey(value: string): value is I18nKey {
  return I18N_KEYS.has(value);
}

export function tr(key: I18nKey, locale: Locale = getDefaultLocale(), params?: Params) {
  return interpolate(STRINGS[locale][key] ?? STRINGS.vi[key], params);
}

export function translateText(source: string, locale: Locale = getDefaultLocale(), params?: Params): string {
  return isI18nKey(source) ? tr(source, locale, params) : interpolate(source, params);
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
