import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import Select from './Select';
import SegmentedControl from './SegmentedControl';
import { useVoiceConversation } from '../hooks/useVoiceConversation';
import { PAUSE_PRESETS } from '../lib/voice/endpointing';
import { INTERPRETER_LANGS } from '../lib/voice/settings';
import BottomSheet from './BottomSheet';
import { colors, gradient, radius } from '../theme';
import { useTranslation } from '../i18n/I18nContext';
import { openAppSettings, canOpenSettings } from '../lib/permissions';

const NATIVE = Platform.OS !== 'web';

// What each state looks like to the person.
function describe(state, mode, muted, t) {
  const translating = mode === 'interpreter';
  switch (state) {
    case 'starting': return { label: t('voice.state.opening'), color: colors.textMuted, icon: 'mic-outline' };
    case 'listening': return { label: t('voice.state.listening'), color: colors.primary, icon: 'mic' };
    case 'hearing': return { label: t('voice.state.hearing'), color: colors.success, icon: 'mic' };
    case 'holding': return { label: t('voice.state.holding'), color: colors.warning, icon: 'ellipsis-horizontal' };
    case 'transcribing': return { label: t('voice.state.understanding'), color: colors.primary, icon: 'ear-outline' };
    case 'thinking': return translating ? { label: t('voice.state.translating'), color: colors.gradientStart, icon: 'language' } : { label: t('voice.state.thinking'), color: colors.gradientStart, icon: 'sparkles' };
    case 'speaking': return { label: t('voice.state.speaking'), color: colors.primaryDark, icon: 'volume-high' };
    case 'paused': return { label: t('voice.state.muted'), color: colors.textMuted, icon: 'mic-off' };
    case 'error': return { label: t('voice.state.error'), color: colors.danger, icon: 'alert-circle-outline' };
    default: return { label: muted ? t('voice.state.muted') : t('voice.state.tapStart'), color: colors.textMuted, icon: 'mic-outline' };
  }
}

function Orb({ state, label, level, color, icon, size = 92 }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const live = ['listening', 'hearing', 'holding', 'transcribing', 'thinking', 'speaking'].includes(state);

  useEffect(() => {
    if (!live) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: state === 'thinking' || state === 'transcribing' ? 700 : 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(pulse, { toValue: 0, duration: state === 'thinking' || state === 'transcribing' ? 700 : 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [live, state, pulse]);

  const voiceScale = state === 'hearing' ? 1 + level * 0.35 : 1;
  const ring = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, state === 'speaking' ? 1.35 : 1.2] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.08] });

  return (
    <View style={[styles.orbBox, { height: Math.round(size * 1.63) }]} accessibilityLabel={label || undefined}>
      <Animated.View style={[styles.ring, { width: size + 12, height: size + 12, borderRadius: (size + 12) / 2, backgroundColor: color, opacity: ringOpacity, transform: [{ scale: ring }] }]} />
      <View style={{ transform: [{ scale: voiceScale }] }}>
        <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>
          <Icon name={icon} size={Math.round(size * 0.41)} color={colors.white} />
        </LinearGradient>
      </View>
    </View>
  );
}

function Caption({ c }) {
  const { t } = useTranslation();
  const mine = c.role === 'user';
  const text = c.text || (c.interrupted ? '…' : '');
  if (!text && !c.actions?.length) return null;
  return (
    <View style={[styles.capRow, mine ? styles.capRight : styles.capLeft]}>
      <View style={[styles.cap, mine ? styles.capMine : styles.capAi, !c.final && mine && { opacity: 0.7 }]}>
        <Text style={[styles.capText, mine && { color: colors.white }]}>{text}</Text>
        {Array.isArray(c.actions)
          ? c.actions
              .filter((a) => a.write)
              .map((a, i) => (
                <Text key={i} style={[styles.capAction, { color: a.ok ? colors.success : colors.danger }]}>
                  {a.ok ? '✓ ' : '✗ '}
                  {a.ok ? a.summary || t('voice.done') : a.error || t('voice.notDone')}
                </Text>
              ))
          : null}
      </View>
    </View>
  );
}

// A round control with a short caption under it (so every button says what it does).
function Control({ icon, label, onPress, disabled, on, a11y }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.ctlBox, disabled && { opacity: 0.38 }]} accessibilityRole="button" accessibilityLabel={a11y || label} accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(on) }}>
      <View style={[styles.ctl, on && styles.ctlOn]}>
        <Icon name={icon} size={20} color={on ? colors.white : colors.text} />
      </View>
      <Text style={[styles.ctlText, on && { color: colors.danger }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// One settings section: a title, an optional one-line explanation, then the control.
function SettingBlock({ title, hint, children }) {
  return (
    <View style={styles.sBlock}>
      <Text style={styles.sTitle}>{title}</Text>
      {hint ? <Text style={styles.sHint}>{hint}</Text> : null}
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

function SwitchRow({ title, hint, value, onChange }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.sTitle}>{title}</Text>
        {hint ? <Text style={styles.sHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} accessibilityLabel={title} />
    </View>
  );
}

// Live Voice: a hands-free conversation in English, or an interpreter between English, isiZulu and Afrikaans.
//   onBack    - return to the typed chat
//   history   - recent chat turns [{ role, content }] so the AI knows the context
//   onTurn    - ({ mode, user, assistant }) called after each finished exchange
export default function VoiceConversation({ onBack, history = [], onTurn }) {
  const { t } = useTranslation();
  const v = useVoiceConversation({ initialHistory: history, onTurn });
  const { settings, state } = v;
  const [showSettings, setShowSettings] = useState(false);
  // The size this screen actually got, so small phones, landscape and desktop all fit without clipping.
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
  }, []);
  const compact = box.h > 0 && box.h < 640;
  const tiny = box.h > 0 && box.h < 470;
  const orbSize = tiny ? 60 : compact ? 76 : 100;
  const scrollRef = useRef(null);
  const active = state !== 'idle' && state !== 'error';
  const info = describe(state, settings.mode, v.muted, t);
  const interpreter = settings.mode === 'interpreter';
  const langLabel = (code) => t(`voice.lang.${code}`);

  // Begin as soon as the screen opens: no extra tap, fully hands-free.
  useEffect(() => {
    v.start();
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const back = async () => {
    await v.stop();
    onBack?.();
  };

  // The pause setting shown as three clear choices (the nearest one is highlighted for older values).
  const pausePreset = PAUSE_PRESETS.reduce((best, p) => (Math.abs(p.ms - settings.pauseMs) < Math.abs(best.ms - settings.pauseMs) ? p : best), PAUSE_PRESETS[0]);
  const canSend = ['hearing', 'holding'].includes(state);
  const canStop = state === 'speaking' || state === 'thinking';

  const subtitle = interpreter
    ? `${langLabel(settings.homeLang)}  ⇄  ${langLabel(settings.targetLang)}`
    : t('voiceConversation.handsFreeEnglish');

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View style={[styles.header, compact && { paddingTop: 10, paddingBottom: 8 }]}>
        <Pressable onPress={back} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('voiceConversation.backToChat')} style={styles.iconBtn}>
          <Icon name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('voiceConversation.liveVoice')}</Text>
          <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Pressable onPress={() => setShowSettings(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('voiceConversation.voiceSettings')} style={styles.iconBtn}>
          <Icon name="options-outline" size={19} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.body, compact && { padding: 12, gap: 10 }]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (v.captions.length > 0) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <SegmentedControl
          options={[{ value: 'conversation', label: t('voice.modeConversation') }, { value: 'interpreter', label: t('voice.modeInterpreter') }]}
          value={settings.mode}
          onChange={(mode) => v.updateSettings({ mode })}
        />

        {interpreter ? (
          <View style={styles.langCard}>
            <View style={{ flex: 1 }}>
              <Select
                label={t('voice.iSpeakLabel')}
                value={settings.homeLang}
                options={INTERPRETER_LANGS}
                renderOption={langLabel}
                onChange={(code) => v.updateSettings(code === settings.targetLang ? { homeLang: code, targetLang: settings.homeLang } : { homeLang: code })}
              />
            </View>
            <Pressable
              onPress={() => v.updateSettings({ homeLang: settings.targetLang, targetLang: settings.homeLang })}
              style={styles.swap}
              accessibilityRole="button"
              accessibilityLabel={t('voice.swapLanguages')}
              hitSlop={6}
            >
              <Icon name="swap-horizontal" size={18} color={colors.primary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Select
                label={t('voice.translateTo')}
                value={settings.targetLang}
                options={INTERPRETER_LANGS}
                renderOption={langLabel}
                onChange={(code) => v.updateSettings(code === settings.homeLang ? { targetLang: code, homeLang: settings.targetLang } : { targetLang: code })}
              />
            </View>
          </View>
        ) : null}

        <View style={[styles.stage, compact && { paddingVertical: 6 }]}>
          <Orb state={state} label={info.label} level={v.level} color={info.color} icon={info.icon} size={orbSize} />
          <Text style={[styles.stateLabel, { color: info.color }]} accessibilityLiveRegion="polite">{info.label}</Text>
        </View>

        {v.error ? (
          <View style={styles.banner} accessibilityRole="alert">
            <Icon name="alert-circle" size={16} color={colors.danger} />
            <Text style={[styles.bannerText, { color: colors.danger }]}>{v.error.message}</Text>
            {v.error.denied && canOpenSettings ? (
              <Pressable onPress={openAppSettings} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.retry}>{t('voiceErr.openSettings')}</Text>
              </Pressable>
            ) : null}
            {v.error.fatal ? (
              <Pressable onPress={v.start} accessibilityRole="button" hitSlop={8}><Text style={styles.retry}>{t('common.retry')}</Text></Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.caps}>
          {v.captions.length === 0 ? (
            <Text style={styles.hint}>{interpreter ? t('voice.hintInterpreter') : t('voice.hintConversation')}</Text>
          ) : (
            v.captions.map((c) => <Caption key={c.id} c={c} />)
          )}
        </View>
      </ScrollView>

      <View style={[styles.controls, compact && { paddingVertical: 8 }]}>
        <Control icon={v.muted ? 'mic-off' : 'mic'} label={v.muted ? t('voice.ctlUnmute') : t('voice.ctlMute')} a11y={v.muted ? t('voice.unmute') : t('voice.mute')} onPress={v.toggleMute} disabled={!active} on={v.muted} />
        <Control icon="arrow-up" label={t('voice.ctlSend')} a11y={t('voiceConversation.sendNow')} onPress={v.sendNow} disabled={!canSend} />
        <Control icon="stop" label={t('voice.ctlStop')} a11y={t('voiceConversation.stopSpeaking')} onPress={v.interrupt} disabled={!canStop} />
        <Pressable onPress={active ? back : v.start} style={styles.endWrap} accessibilityRole="button" accessibilityLabel={active ? t('voice.endLive') : t('voice.startLive')}>
          <LinearGradient colors={active ? [colors.danger, colors.danger] : gradient.colors} start={gradient.start} end={gradient.end} style={styles.end}>
            <Icon name={active ? 'call' : 'mic'} size={18} color={colors.white} />
            <Text style={styles.endText}>{active ? t('voice.end') : t('voice.start')}</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <BottomSheet visible={showSettings} title={t('voiceConversation.voiceSettings')} onClose={() => setShowSettings(false)}>
        <SettingBlock title={t('voice.set.pauseTitle')} hint={t('voice.set.pauseHint')}>
          <SegmentedControl options={PAUSE_PRESETS.map((p) => ({ value: p.ms, label: t(`voice.pause.${p.value}`) }))} value={pausePreset.ms} onChange={(pauseMs) => v.updateSettings({ pauseMs })} />
        </SettingBlock>
        <SettingBlock title={t('voiceConversation.microphoneSensitivity')} hint={t('voice.set.sensitivityHint')}>
          <SegmentedControl options={[{ value: 'low', label: t('voice.low') }, { value: 'normal', label: t('voice.normal') }, { value: 'high', label: t('voice.high') }]} value={settings.sensitivity} onChange={(sensitivity) => v.updateSettings({ sensitivity })} />
        </SettingBlock>
        <SettingBlock title={t('voiceConversation.voiceSpeed')}>
          <SegmentedControl options={[{ value: 0.85, label: t('voice.slower') }, { value: 1, label: t('voice.normal') }, { value: 1.2, label: t('voice.faster') }]} value={settings.speed} onChange={(speed) => v.updateSettings({ speed })} />
        </SettingBlock>
        <SwitchRow title={t('voiceConversation.readAnswersAloud')} value={settings.speak} onChange={(speak) => v.updateSettings({ speak })} />
        <SwitchRow title={t('voiceConversation.letMeInterrupt')} hint={t('voice.set.interruptHint')} value={settings.interrupt} onChange={(interrupt) => v.updateSettings({ interrupt })} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  // flex:1 + minHeight:0 so the header and the buttons keep their size and only the middle scrolls.
  wrap: { flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch', backgroundColor: colors.bg },
  scroll: { flex: 1, minHeight: 0 },
  header: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inputBg },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  body: { padding: 16, gap: 14, paddingBottom: 24, width: '100%', maxWidth: 560, alignSelf: 'center' },
  langCard: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, paddingBottom: 0, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  swap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  stage: { alignItems: 'center', paddingVertical: 8 },
  orbBox: { height: 150, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 104, height: 104, borderRadius: 52 },
  orb: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center' },
  stateLabel: { textAlign: 'center', fontSize: 15.5, fontWeight: '700', marginTop: -4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.dangerBg },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  retry: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  caps: { gap: 8, minHeight: 60 },
  hint: { textAlign: 'center', color: colors.textMuted, fontSize: 13.5, lineHeight: 20, paddingHorizontal: 16 },
  capRow: { flexDirection: 'row' },
  capLeft: { justifyContent: 'flex-start' },
  capRight: { justifyContent: 'flex-end' },
  cap: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.lg },
  capMine: { backgroundColor: colors.primary, borderBottomRightRadius: 6 },
  capAi: { backgroundColor: colors.inputBg, borderBottomLeftRadius: 6 },
  capText: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  capAction: { fontSize: 12, fontWeight: '600', marginTop: 5 },
  sBlock: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  sTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  sHint: { fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  controls: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  ctlBox: { alignItems: 'center', width: 58, gap: 4 },
  ctl: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  ctlOn: { backgroundColor: colors.danger },
  ctlText: { fontSize: 11, fontWeight: '600', color: colors.textSoft },
  endWrap: { flex: 1, marginLeft: 4, marginBottom: 17 },
  end: { height: 48, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  endText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
