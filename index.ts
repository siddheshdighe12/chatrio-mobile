import { registerGlobals } from '@livekit/react-native';

// LiveKit WebRTC polyfills must be registered before any component tree mounts
registerGlobals();

import 'expo-router/entry';
