import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Navigation from './src/navigation';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useApp } from './src/store/useApp';
import { useTheme } from './src/theme/theme';

export default function App() {
  const ready = useApp((s) => s.ready);
  const hydrate = useApp((s) => s.hydrate);
  const { dark, c } = useTheme();
  const [error, setError] = useState<string | null>(null);

  // Global JS error handler — logs everything, crashes only on fatal errors.
  useEffect(() => {
    const EU = (global as any).ErrorUtils;
    if (!EU?.setGlobalHandler) return;

    const defaultHandler = EU.getGlobalHandler?.();
    EU.setGlobalHandler((err: Error, isFatal: boolean) => {
      // eslint-disable-next-line no-console
      console.error('[GlobalError]', {
        isFatal,
        message: err?.message,
        stack: err?.stack,
      });
      if (isFatal && defaultHandler) defaultHandler(err, isFatal);
    });

    return () => {
      if (defaultHandler) EU.setGlobalHandler(defaultHandler);
    };
  }, []);

  // Boot: hydrate the store from storage.
  useEffect(() => {
    hydrate().catch((e) => setError(String((e as Error)?.message ?? e)));
  }, [hydrate]);

  if (error) {
    return (
      <SafeAreaProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View
          style={{
            flex: 1,
            backgroundColor: c.bg,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            Couldn't start the app
          </Text>
          <Text
            style={{
              color: c.textMuted,
              fontSize: 14,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {error}
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View
          style={{
            flex: 1,
            backgroundColor: c.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator color={c.text} />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ErrorBoundary>
        <Navigation />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}