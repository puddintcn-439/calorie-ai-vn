import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BodyText, Eyebrow, HeroTitle, ScreenShell, SurfaceCard } from '../../components/ui-shell';
import { UiButton } from '../../components/ui-button';
import { UiInput } from '../../components/ui-input';
import { askCoach } from '../../services/ai.service';
import { useLogStore } from '../../store/log.store';

interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
}

export default function CoachScreen() {
  const { dailyLog, fetchDailyLog } = useLogStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'coach',
      text: 'Xin chao. Toi la AI Coach. Ban co the hoi ve bua an, macro hoac cach dat muc tieu calo hom nay.',
    },
  ]);

  useEffect(() => {
    fetchDailyLog().catch(() => {});
  }, []);

  const context = useMemo(() => {
    const consumed = dailyLog?.total_calories ?? 0;
    const target = dailyLog?.target_calories ?? 1800;
    return {
      today_calories: consumed,
      target_calories: target,
    };
  }, [dailyLog]);

  const handleSend = async () => {
    const message = input.trim();
    if (!message || loading) return;

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await askCoach(message, context);
      const coachMessage: ChatMessage = {
        id: `c-${Date.now()}`,
        role: 'coach',
        text: res.message,
      };
      setMessages((prev) => [...prev, coachMessage]);
    } catch {
      const fallback: ChatMessage = {
        id: `c-${Date.now()}`,
        role: 'coach',
        text: 'Xin loi, toi dang bi gian doan ket noi. Ban thu lai sau it phut nhe.',
      };
      setMessages((prev) => [...prev, fallback]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenShell>
      <Eyebrow>AI Coach</Eyebrow>
      <HeroTitle>Hoi nhanh, nhan goi y theo calories hom nay.</HeroTitle>
      <BodyText style={styles.heroBody}>
        Coach dung du lieu da an va muc tieu trong ngay de tra loi ngan gon, de ap dung.
      </BodyText>

      <SurfaceCard style={styles.contextCard}>
        <Text style={styles.contextTitle}>Hom nay cua ban</Text>
        <Text style={styles.contextLine}>Da an: {context.today_calories} kcal</Text>
        <Text style={styles.contextLine}>Muc tieu: {context.target_calories} kcal</Text>
        <Text style={styles.contextLine}>Con lai: {context.target_calories - context.today_calories} kcal</Text>
      </SurfaceCard>

      <View style={styles.chatList}>
        {messages.map((msg) => (
          <SurfaceCard
            key={msg.id}
            style={[
              styles.messageCard,
              msg.role === 'user' ? styles.userCard : styles.coachCard,
            ]}
          >
            <Text style={styles.roleLabel}>{msg.role === 'user' ? 'Ban' : 'Coach'}</Text>
            <Text style={styles.messageText}>{msg.text}</Text>
          </SurfaceCard>
        ))}
      </View>

      <SurfaceCard style={styles.inputCard}>
        <UiInput
          label="Dat cau hoi"
          value={input}
          onChangeText={setInput}
          placeholder="VD: Toi con 400 kcal thi nen an gi toi nay?"
          multiline
          style={styles.input}
        />
        <UiButton label="Gui cho Coach" onPress={handleSend} loading={loading} />
        {loading ? <ActivityIndicator color="#6ee7b7" style={styles.loading} /> : null}
      </SurfaceCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  heroBody: {
    marginBottom: 14,
    maxWidth: 720,
  },
  contextCard: {
    marginBottom: 12,
    borderColor: '#27426f',
  },
  contextTitle: {
    color: '#eff6ff',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  contextLine: {
    color: '#b8c8e8',
    fontSize: 13,
    marginBottom: 4,
  },
  chatList: {
    gap: 10,
    marginBottom: 12,
  },
  messageCard: {
    borderWidth: 1,
  },
  userCard: {
    borderColor: '#6ee7b7',
    backgroundColor: '#0f2d2a',
  },
  coachCard: {
    borderColor: '#2b3f6f',
    backgroundColor: '#101a37',
  },
  roleLabel: {
    color: '#93c5fd',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  messageText: {
    color: '#ecf2ff',
    fontSize: 14,
    lineHeight: 21,
  },
  inputCard: {
    marginBottom: 20,
  },
  input: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  loading: {
    marginTop: 10,
  },
});
