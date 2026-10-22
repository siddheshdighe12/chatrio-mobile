/**
 * LinkifiedText
 *
 * Splits a plain-text string into URL and non-URL segments, renders URLs as
 * tappable blue links and the remaining text with the caller's style.
 *
 * - Uses expo-linking (already installed) — no new packages needed.
 * - Validates URLs before opening to prevent Linking.openURL crashes.
 * - Handles null / undefined text gracefully.
 */
import React from 'react';
import { Text, StyleProp, TextStyle, Alert } from 'react-native';
import * as Linking from 'expo-linking';

// Matches http:// or https:// URLs — deliberately conservative to avoid
// false positives on arbitrary text like "e.g." or version strings.
const URL_REGEX = /https?:\/\/[^\s<>"'`\u0000-\u001F]+/gi;

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function openUrl(url: string) {
  if (!isValidUrl(url)) {
    Alert.alert('Invalid link', 'This does not appear to be a valid URL.');
    return;
  }
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Cannot open link', 'Your device cannot open this URL.');
      return;
    }
    await Linking.openURL(url);
  } catch (err: any) {
    Alert.alert('Failed to open link', err?.message ?? 'Unknown error');
  }
}

interface Props {
  text: string | null | undefined;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function LinkifiedText({ text, style, linkStyle, numberOfLines }: Props) {
  if (!text) return null;

  const parts: Array<{ text: string; isUrl: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state (global flag remembers position between calls)
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isUrl: false });
    }
    let url = match[0];
    let trailingPunct = '';
    const punctMatch = /[.,!?:;)]+$/.exec(url);
    if (punctMatch) {
      trailingPunct = punctMatch[0];
      url = url.slice(0, -trailingPunct.length);
    }
    parts.push({ text: url, isUrl: true });
    if (trailingPunct) {
      parts.push({ text: trailingPunct, isUrl: false });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isUrl: false });
  }

  // No URLs found — render as plain Text to avoid overhead
  if (parts.length === 1 && !parts[0].isUrl) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) =>
        part.isUrl ? (
          <Text
            key={index}
            style={[{ color: '#60A5FA', textDecorationLine: 'underline' }, linkStyle]}
            onPress={() => openUrl(part.text)}
            suppressHighlighting
          >
            {part.text}
          </Text>
        ) : (
          <Text key={index}>{part.text}</Text>
        )
      )}
    </Text>
  );
}
