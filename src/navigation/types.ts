import type { NavigatorScreenParams } from '@react-navigation/native';

/* ------------------------------ Tab routes ------------------------------ */

export type TabParams = {
  Home: undefined;
  Documents: undefined;
  Models: undefined;
  Settings: undefined;
};

/* ----------------------------- Stack routes ----------------------------- */

export type ChatParams = {
  conversationId?: string;
  presetId?: string;
  useDocs?: boolean;
  prompt?: string;
};

export type RootStackParams = {
  /** Nested tab navigator — accepts `{ screen: 'Models' }` etc. */
  Tabs: NavigatorScreenParams<TabParams>;

  /** Chat screen — params are optional; navigate to start a blank chat. */
  Chat: ChatParams | undefined;

  /** Modal-ish screens with no params. */
  Upgrade: undefined;
  Memory: undefined;
  About: undefined;
};

/* ------------------------------- helpers -------------------------------- */

/** Convenience aliases for use in screens. */
export type RootStackNavigation = import('@react-navigation/native-stack').NativeStackNavigationProp<RootStackParams>;
export type RootStackScreenProps<T extends keyof RootStackParams> =
  import('@react-navigation/native-stack').NativeStackScreenProps<RootStackParams, T>;

export type TabNavigation = import('@react-navigation/bottom-tabs').BottomTabNavigationProp<TabParams>;
export type TabScreenProps<T extends keyof TabParams> =
  import('@react-navigation/bottom-tabs').BottomTabScreenProps<TabParams, T>;