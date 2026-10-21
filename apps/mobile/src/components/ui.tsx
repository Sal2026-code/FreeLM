/**
 * FreeLM — mobile UI kit.
 */

import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fontSize, radius, spacing } from '../theme';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function Title({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  numberOfLines,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  numberOfLines?: number;
  style?: object;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.body, muted && styles.bodyMuted, style]}
    >
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  loading,
  small,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    primary: { bg: colors.accent, fg: '#ffffff', border: 'transparent' },
    secondary: { bg: colors.surface2, fg: colors.text, border: colors.hairline },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
    danger: { bg: 'rgba(242,139,130,0.12)', fg: colors.danger, border: 'rgba(242,139,130,0.35)' },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            small && styles.buttonLabelSmall,
            { color: palette.fg },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Card & chips
// ---------------------------------------------------------------------------

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label,
  onPress,
  selected,
  style,
}: {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
        pressed && { opacity: 0.7 },
        style,
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          selected && { color: colors.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              style={[
                styles.segmentLabel,
                active && { color: colors.text },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export function Field({
  style,
  ...rest
}: TextInputProps & { style?: object }) {
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      style={[styles.field, style]}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Banner({
  tone,
  title,
  message,
  onRetry,
}: {
  tone: 'error' | 'info' | 'success' | 'warning';
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  const accent = {
    error: colors.danger,
    info: colors.accent,
    success: colors.success,
    warning: colors.warning,
  }[tone];

  return (
    <View
      style={[
        styles.banner,
        { borderColor: accent, backgroundColor: `${accent}18` },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: accent }]}>{title}</Text>
        {message ? <Text style={styles.bannerMessage}>{message}</Text> : null}
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.bannerAction}>
          <Text style={{ color: accent, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Empty({
  icon,
  title,
  message,
}: {
  icon: string;
  title: string;
  message: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontSize: 30, marginBottom: spacing.sm }}>{icon}</Text>
      <Text style={[styles.body, { color: colors.text, fontWeight: '600' }]}>
        {title}
      </Text>
      <Text style={[styles.bodyMuted, { textAlign: 'center', marginTop: 4 }]}>
        {message}
      </Text>
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.loader}>
      <ActivityIndicator color={colors.accent} />
      {label ? <Text style={styles.bodyMuted}>{label}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  body: {
    color: colors.text,
    fontSize: fontSize.base,
    lineHeight: 21,
  },
  bodyMuted: {
    color: colors.textMuted,
    fontSize: fontSize.base,
    lineHeight: 21,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  buttonSmall: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  buttonLabel: {
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  buttonLabelSmall: {
    fontSize: fontSize.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginBottom: spacing.xs,
    marginRight: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  chipLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  segmented: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  segment: {
    borderRadius: radius.pill,
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  field: {
    backgroundColor: colors.surface2,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: fontSize.base,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  banner: {
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  bannerTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
  },
  bannerMessage: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginTop: 2,
  },
  bannerAction: {
    paddingLeft: spacing.md,
    paddingTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 48,
  },
  loader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.lg,
  },
});
