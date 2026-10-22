import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In production, forward this to Sentry or your crash reporter.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error?.message, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body} numberOfLines={6}>
            {this.state.error?.message ?? 'Unknown error'}
          </Text>
          <Pressable style={styles.btn} onPress={this.reset}>
            <Text style={styles.btnText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#F6F3EC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '600', color: '#1A1715', marginBottom: 12 },
  body: {
    fontSize: 14,
    color: '#6F675E',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: '#1A1715',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  btnText: { color: '#FDFCFA', fontWeight: '600', fontSize: 15 },
});