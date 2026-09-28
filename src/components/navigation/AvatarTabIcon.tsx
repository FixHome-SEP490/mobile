import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { User } from 'lucide-react-native';

// Some malformed/relative avatarUrl values never fire RN Image's onError —
// the native loader just stalls silently instead of erroring out. Guard
// against both: reject anything that isn't an absolute http(s) URL up
// front, and fall back if a load hasn't finished within a few seconds.
const LOAD_TIMEOUT_MS = 4000;

function isLoadableUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri.trim());
}

export function AvatarTabIcon({
  uri,
  size,
  color,
  focused,
}: {
  uri: string;
  size: number;
  color: string;
  focused: boolean;
}) {
  const [state, setState] = useState(() => ({
    uri,
    failed: !isLoadableUri(uri),
    loaded: false,
  }));

  // Reset when a different avatar URL comes in (e.g. user updates their photo).
  if (state.uri !== uri) {
    setState({ uri, failed: !isLoadableUri(uri), loaded: false });
  }

  useEffect(() => {
    if (state.uri !== uri || state.failed || state.loaded) return;
    const timer = setTimeout(() => {
      setState((s) => (s.uri === uri && !s.loaded ? { ...s, failed: true } : s));
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [uri, state.uri, state.failed, state.loaded]);

  if (state.failed) {
    return <User size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
  }

  return (
    <Image
      source={{ uri }}
      onLoad={() => setState((s) => (s.uri === uri ? { ...s, loaded: true } : s))}
      onError={() => setState((s) => (s.uri === uri ? { ...s, failed: true } : s))}
      style={{ width: size + 5, height: size + 5, borderRadius: (size + 5) / 2, borderColor: '#FFFFFF' }}
    />
  );
}
