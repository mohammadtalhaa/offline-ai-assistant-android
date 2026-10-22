import React from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';
import ChatScreen from '../screens/ChatScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import HomeScreen from '../screens/HomeScreen';
import MemoryScreen from '../screens/MemoryScreen';
import ModelsScreen from '../screens/ModelsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import UpgradeScreen from '../screens/UpgradeScreen';
import AboutScreen from '../screens/AboutScreen';
import type { RootStackParams, TabParams } from './types';

const Stack = createNativeStackNavigator<RootStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

export const TAB_BAR_HEIGHT = 60;

function Tabs() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const paddingBottom = Math.max(insets.bottom, 8);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.bg,
          borderTopColor: c.border,
          borderTopWidth: 0.5,
          height: TAB_BAR_HEIGHT + paddingBottom,
          paddingBottom,
          paddingTop: 10,
        },
        tabBarActiveTintColor: c.text,
        tabBarInactiveTintColor: c.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Documents"
        component={DocumentsScreen}
        options={{
          tabBarLabel: 'Docs',
          tabBarIcon: ({ color }) => <Feather name="file-text" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Models"
        component={ModelsScreen}
        options={{
          tabBarLabel: 'Models',
          tabBarIcon: ({ color }) => <Feather name="layers" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'More',
          tabBarIcon: ({ color }) => <Feather name="more-horizontal" size={20} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { dark, c } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer
      theme={{
        ...base,
        colors: {
          ...base.colors,
          background: c.bg,
          card: c.bg,
          text: c.text,
          border: c.border,
          primary: c.primary,
        },
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerTitleStyle: { fontWeight: '600', fontSize: 16 },
          headerShadowVisible: false,
          headerBackTitle: '',
        }}
      >
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Upgrade" component={UpgradeScreen} options={{ title: 'Upgrade' }} />
        <Stack.Screen name="Memory" component={MemoryScreen} options={{ title: 'Memory' }} />
        <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}