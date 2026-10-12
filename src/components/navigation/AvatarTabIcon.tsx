import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  return <AvatarTabIconImage key={uri} uri={uri} size={size} color={color} focused={focused} />;
}

function AvatarTabIconImage({
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
  const stateRef = useRef(state);

  useEffect(() => {
    if (state.uri !== uri || state.failed || state.loaded) return;
    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current.uri !== uri || current.loaded || current.failed) return;
      const next = { ...current, failed: true };
      stateRef.current = next;
      setState(next);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [uri, state.uri, state.failed, state.loaded]);

  // react-native-web's Image effect depends on source and callback identity.
  // Keep all three stable across tab-bar renders to avoid restarting decode.
  const source = useMemo(() => ({ uri }), [uri]);
  const handleLoad = useCallback(() => {
    const current = stateRef.current;
    if (current.uri !== uri || current.loaded || current.failed) return;
    const next = { ...current, loaded: true };
    stateRef.current = next;
    setState(next);
  }, [uri]);
  const handleError = useCallback(() => {
    const current = stateRef.current;
    if (current.uri !== uri || current.loaded || current.failed) return;
    const next = { ...current, failed: true };
    stateRef.current = next;
    setState(next);
  }, [uri]);

  if (state.failed) {
    return <User size={size} color={color} strokeWidth={focused ? 2.5 : 2} />;
  }

  return (
    <Image
      source={source}
      onLoad={handleLoad}
      onError={handleError}
      style={{ width: size + 5, height: size + 5, borderRadius: (size + 5) / 2, borderColor: '#FFFFFF' }}
    />
  );
}
