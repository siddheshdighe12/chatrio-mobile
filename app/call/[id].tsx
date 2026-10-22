import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  LiveKitRoom,
  VideoTrack,
  useTracks,
  useLocalParticipant,
  useParticipants,
  AudioSession,
} from '@livekit/react-native';
import {
  Track,
  VideoPresets,
  type RoomOptions,
  type VideoCaptureOptions,
} from 'livekit-client';
import { useCallStore } from '../../store/callStore';

// ─────────────────────────────────────────────────────────────────────────────
// Room-level options — passed once to <LiveKitRoom options={...}>
// adaptiveStream: remote video quality adapts to the render element's size
// dynacast:       only publish simulcast layers that subscribers need
// ─────────────────────────────────────────────────────────────────────────────
const ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: {
    videoEncoding: {
      // 720p @ 30 fps cap — real bitrate is negotiated adaptively downward
      maxBitrate: 1_500_000,
      maxFramerate: 30,
    },
    // Two lower simulcast layers so weak-link subscribers still get video
    videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h540],
    simulcast: true,
    dtx: true, // discontinuous audio transmission (saves bandwidth on silence)
    red: true, // audio redundancy packets
  },
};

// Default capture options for the front camera at 720p / 30 fps.
// This is the primary reason for blurry video: without an explicit resolution
// the SDK falls back to the WebRTC default, which is typically 640×480 or lower.
const DEFAULT_VIDEO_CAPTURE: VideoCaptureOptions = {
  facingMode: 'user',
  resolution: { width: 1280, height: 720, frameRate: 30 },
};

const { width, height } = Dimensions.get('window');

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Inner component mounted inside LiveKitRoom once credentials exist.
 */
function ActiveCallSession({ onEndCall }: { onEndCall: () => void }) {
  const insets = useSafeAreaInsets();
  const {
    callType,
    otherUser,
    isGroupCall,
    groupName,
    isMuted,
    isCameraEnabled,
    isSpeakerOn,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
  } = useCallStore();

  const { localParticipant } = useLocalParticipant();
  const participants = useParticipants();

  // Track which lens is currently active so flip and re-enable stay consistent
  const facingModeRef = useRef<'user' | 'environment'>('user');

  // Query camera tracks for video rendering
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  // Separate local and remote video tracks
  const localTrackRef = tracks.find(
    (t) => t.participant.identity === localParticipant?.identity,
  );
  const remoteTrackRef = tracks.find(
    (t) => t.participant.identity !== localParticipant?.identity,
  );

  // Sync mute state → LiveKit microphone
  useEffect(() => {
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(!isMuted).catch((err) => {
      console.warn('[Call] setMicrophoneEnabled error:', err);
    });
  }, [isMuted, localParticipant]);

  // Sync camera state → LiveKit camera (pass capture options to maintain quality)
  useEffect(() => {
    if (!localParticipant || callType !== 'VIDEO') return;
    const opts: VideoCaptureOptions = {
      facingMode: facingModeRef.current,
      resolution: { width: 1280, height: 720, frameRate: 30 },
    };
    localParticipant.setCameraEnabled(isCameraEnabled, opts).catch((err) => {
      console.warn('[Call] setCameraEnabled error:', err);
      if (isCameraEnabled) {
        Alert.alert(
          'Camera Error',
          'Could not enable camera. Check permissions in Settings.',
          [{ text: 'OK' }],
        );
      }
    });
  }, [isCameraEnabled, localParticipant, callType]);

  // Sync audio output
  useEffect(() => {
    AudioSession.selectAudioOutput(isSpeakerOn ? 'speaker' : 'earpiece').catch(
      (err) => {
        console.warn('[Call] selectAudioOutput error:', err);
      },
    );
  }, [isSpeakerOn]);

  // Flip camera: use LiveKit's LocalVideoTrack.restartTrack API with fallback to native _switchCamera
  const handleFlipCamera = useCallback(async () => {
    if (!localParticipant || !isCameraEnabled) return;
    const next: 'user' | 'environment' =
      facingModeRef.current === 'user' ? 'environment' : 'user';
    facingModeRef.current = next;
    const opts: VideoCaptureOptions = {
      facingMode: next,
      resolution: { width: 1280, height: 720, frameRate: 30 },
    };

    try {
      const pub = localParticipant.getTrackPublication(Track.Source.Camera);
      const videoTrack = pub?.videoTrack;

      if (videoTrack && typeof (videoTrack as any).restartTrack === 'function') {
        await (videoTrack as any).restartTrack(opts);
      } else if (
        videoTrack &&
        typeof (videoTrack.mediaStreamTrack as any)?._switchCamera === 'function'
      ) {
        (videoTrack.mediaStreamTrack as any)._switchCamera();
      } else {
        // Fallback: unpublish previous camera track and re-enable with new facingMode
        if (pub?.track) {
          await localParticipant.unpublishTrack(pub.track, true);
        }
        await localParticipant.setCameraEnabled(true, opts);
      }
    } catch (err) {
      console.warn('[Call] flip camera error:', err);
    }
  }, [localParticipant, isCameraEnabled]);


  return (
    <View style={styles.fullscreen}>
      {callType === 'VIDEO' ? (
        // ── Video Call Layout ──────────────────────────────────────────
        isGroupCall ? (
          // ── Group Video Multi-Participant Grid ───────────────────────
          <View style={[styles.fullscreen, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 90 }]}>
            <View style={styles.groupVideoGrid}>
              {participants.map((p) => {
                const isLocal = p.identity === localParticipant?.identity;
                const pTrack = tracks.find((t) => t.participant.identity === p.identity);
                const hasVideo = isLocal ? isCameraEnabled && localTrackRef : !!pTrack;

                return (
                  <View key={p.identity} style={styles.groupVideoTile}>
                    {hasVideo && (isLocal ? localTrackRef : pTrack) ? (
                      <VideoTrack
                        trackRef={(isLocal ? localTrackRef : pTrack)!}
                        style={styles.gridVideo}
                        objectFit="cover"
                        mirror={isLocal && facingModeRef.current === 'user'}
                        zOrder={0}
                      />
                    ) : (
                      <View style={styles.groupTilePlaceholder}>
                        <View style={styles.groupTileAvatar}>
                          <Text style={styles.groupTileAvatarInitial}>
                            {(p.name || p.identity).charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Participant Name Badge */}
                    <View style={styles.groupTileTag}>
                      <Text style={styles.groupTileName} numberOfLines={1}>
                        {isLocal ? `${p.name || 'You'} (You)` : (p.name || p.identity)}
                      </Text>
                      {p.isSpeaking && (
                        <Ionicons name="volume-high" size={13} color="#10B981" />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          // ── One-on-One Video Call Layout ─────────────────────────────
          <View style={styles.fullscreen}>
            {/* Remote video — full-screen background; zOrder=0 (default OpenGL layer) */}
            {remoteTrackRef ? (
              <VideoTrack
                trackRef={remoteTrackRef}
                style={styles.fullscreenVideo}
                objectFit="contain"
                zOrder={0}
              />
            ) : (
              <View style={styles.waitingRemoteVideo}>
                {otherUser?.avatarUrl ? (
                  <Image source={{ uri: otherUser.avatarUrl }} style={styles.largeAvatar} />
                ) : (
                  <View style={[styles.largeAvatar, styles.placeholderAvatar]}>
                    <Text style={styles.largeAvatarInitial}>
                      {otherUser?.displayName?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                )}
                <Text style={styles.waitingVideoText}>
                  Waiting for {otherUser?.displayName || 'user'} video...
                </Text>
              </View>
            )}

            {/* Local PiP — must be zOrder=1 to render above remote on Android */}
            {isCameraEnabled && localTrackRef && (
              <View style={[styles.pipContainer, { top: insets.top + 20 }]}>
                <VideoTrack
                  trackRef={localTrackRef}
                  style={styles.pipVideo}
                  objectFit="cover"
                  mirror={facingModeRef.current === 'user'}
                  zOrder={1}
                />
              </View>
            )}
          </View>
        )
      ) : (
        // ── Audio Call Layout ──────────────────────────────────────────
        isGroupCall ? (
          // ── Group Audio Call Layout ──────────────────────────────────
          <View style={[styles.audioCenterContainer, { paddingTop: insets.top + 70 }]}>
            <View style={styles.groupAudioGrid}>
              {participants.map((p) => {
                const isLocal = p.identity === localParticipant?.identity;
                return (
                  <View key={p.identity} style={styles.groupAudioItem}>
                    <View style={[styles.groupAudioAvatarWrap, p.isSpeaking && styles.groupAudioAvatarSpeaking]}>
                      <View style={[styles.groupAudioAvatar, styles.placeholderAvatar]}>
                        <Text style={styles.groupAudioAvatarText}>
                          {(p.name || p.identity).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.groupAudioName} numberOfLines={1}>
                      {isLocal ? `${p.name || 'You'} (You)` : (p.name || p.identity)}
                    </Text>
                    {p.isSpeaking && (
                      <View style={styles.speakingBadge}>
                        <Text style={styles.speakingBadgeText}>Speaking</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={[styles.audioStatusBadge, { marginTop: 28 }]}>
              <View style={styles.liveIndicatorDot} />
              <Text style={styles.audioStatusText}>
                Group Audio • {participants.length} Active
              </Text>
            </View>
          </View>
        ) : (
          // ── One-on-One Audio Call Layout ─────────────────────────────
          <View style={styles.audioCenterContainer}>
            <View style={styles.audioAvatarGlow}>
              {otherUser?.avatarUrl ? (
                <Image source={{ uri: otherUser.avatarUrl }} style={styles.audioAvatar} />
              ) : (
                <View style={[styles.audioAvatar, styles.placeholderAvatar]}>
                  <Text style={styles.audioAvatarInitial}>
                    {otherUser?.displayName?.charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.otherUserName}>{otherUser?.displayName}</Text>
            <View style={styles.audioStatusBadge}>
              <View style={styles.liveIndicatorDot} />
              <Text style={styles.audioStatusText}>Audio Call Active</Text>
            </View>
          </View>
        )
      )}


      {/* Floating Control Bar */}
      <View style={[styles.controlsBar, { paddingBottom: insets.bottom + 20 }]}>
        {/* Mute Button */}
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={toggleMute}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isMuted ? 'mic-off' : 'mic'}
            size={24}
            color={isMuted ? '#EF4444' : '#FFFFFF'}
          />
          <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {/* Video specific controls */}
        {callType === 'VIDEO' && (
          <>
            <TouchableOpacity
              style={[styles.controlBtn, !isCameraEnabled && styles.controlBtnActive]}
              onPress={toggleCamera}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isCameraEnabled ? 'videocam' : 'videocam-off'}
                size={24}
                color={!isCameraEnabled ? '#EF4444' : '#FFFFFF'}
              />
              <Text style={styles.controlLabel}>{isCameraEnabled ? 'Cam Off' : 'Cam On'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.controlBtn} onPress={handleFlipCamera} activeOpacity={0.8}>
              <Ionicons name="camera-reverse" size={24} color="#FFFFFF" />
              <Text style={styles.controlLabel}>Flip</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Speaker Button */}
        <TouchableOpacity
          style={[styles.controlBtn, isSpeakerOn && styles.controlBtnAccent]}
          onPress={toggleSpeaker}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isSpeakerOn ? 'volume-high' : 'volume-medium'}
            size={24}
            color={isSpeakerOn ? '#6366F1' : '#FFFFFF'}
          />
          <Text style={styles.controlLabel}>Speaker</Text>
        </TouchableOpacity>

        {/* End Call Button */}
        <TouchableOpacity
          style={[styles.controlBtn, styles.endCallBtn]}
          onPress={onEndCall}
          activeOpacity={0.8}
        >
          <Ionicons name="call" size={28} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
          <Text style={styles.controlLabel}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Main Call Screen (`/call/[id]`)
 */
export default function CallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();

  const {
    stage,
    callId,
    callType,
    otherUser,
    token,
    serverUrl,
    duration,
    endReason,
    isGroupCall,
    groupName,
    cancelCall,
    endCall,
    setDuration,
    resetCall,
  } = useCallStore();

  const [connected, setConnected] = useState(false);

  // Timer for duration when ACTIVE
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (stage === 'ACTIVE') {
      timer = setInterval(() => {
        setDuration(duration + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [stage, duration]);

  // Navigate back when call ends
  useEffect(() => {
    if (stage === 'ENDED') {
      const timeout = setTimeout(() => {
        resetCall();
        router.back();
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [stage]);

  // Handle Cancel / End
  const handleCancel = async () => {
    await cancelCall();
    router.back();
  };

  const handleEnd = async () => {
    await endCall();
    router.back();
  };

  // Header info (caller name + call timer / status)
  return (
    <View style={styles.container}>
      {/* Top Floating Header */}
      <View style={[styles.topHeader, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            {isGroupCall ? (groupName || 'Group Call') : (otherUser?.displayName || 'Call')}
          </Text>
          <Text style={styles.headerSubtitle}>
            {stage === 'OUTGOING_RINGING'
              ? 'Ringing...'
              : stage === 'INCOMING_RINGING'
              ? 'Incoming...'
              : stage === 'CONNECTING'
              ? 'Connecting...'
              : stage === 'ACTIVE'
              ? (isGroupCall ? `Active • ${formatDuration(duration)}` : formatDuration(duration))
              : endReason || 'Call Ended'}
          </Text>
        </View>
      </View>

      {/* Screen Body depending on Call Stage */}
      {stage === 'OUTGOING_RINGING' || stage === 'CONNECTING' ? (
        // ── Ringing / Calling View ────────────────────────────────────
        <View style={styles.ringingContainer}>
          <View style={styles.ringingAvatarGlow}>
            {otherUser?.avatarUrl ? (
              <Image source={{ uri: otherUser.avatarUrl }} style={styles.ringingAvatar} />
            ) : (
              <View style={[styles.ringingAvatar, styles.placeholderAvatar]}>
                <Text style={styles.ringingAvatarInitial}>
                  {(isGroupCall ? groupName : otherUser?.displayName)?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.ringingName}>
            {isGroupCall ? (groupName || 'Group Call') : otherUser?.displayName}
          </Text>
          <Text style={styles.ringingStatus}>
            {stage === 'CONNECTING' ? 'Connecting to media server...' : 'Calling...'}
          </Text>
          {stage === 'CONNECTING' && <ActivityIndicator color="#6366F1" size="small" style={{ marginTop: 16 }} />}

          {/* Cancel Outgoing Call Button */}
          <View style={[styles.ringingControls, { paddingBottom: insets.bottom + 40 }]}>
            <TouchableOpacity style={styles.cancelCallBtn} onPress={handleCancel} activeOpacity={0.8}>
              <Ionicons name="call" size={32} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
            <Text style={styles.cancelCallLabel}>Cancel</Text>
          </View>
        </View>
      ) : stage === 'ACTIVE' && token && serverUrl ? (
        // ── Active LiveKit Session ────────────────────────────────────
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect={true}
          audio={true}
          video={callType === 'VIDEO' ? DEFAULT_VIDEO_CAPTURE : false}
          options={ROOM_OPTIONS}
          onConnected={() => setConnected(true)}
          onDisconnected={handleEnd}
          onError={(err) => {
            console.error('[Call] LiveKit Room error:', err);
          }}
          onMediaDeviceFailure={(failure) => {
            console.warn('[Call] Media device failure:', failure);
            Alert.alert(
              'Media Error',
              'A camera or microphone error occurred. Check app permissions in Settings.',
              [{ text: 'OK' }],
            );
          }}
        >
          <ActiveCallSession onEndCall={handleEnd} />
        </LiveKitRoom>
      ) : (
        // ── Ended / Error View ────────────────────────────────────────
        <View style={styles.endedContainer}>
          <View style={styles.endedIconWrapper}>
            <Ionicons name="call" size={44} color="#EF4444" style={{ transform: [{ rotate: '135deg' }] }} />
          </View>
          <Text style={styles.endedTitle}>{endReason || 'Call Ended'}</Text>
          {duration > 0 && <Text style={styles.endedDuration}>Duration: {formatDuration(duration)}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  fullscreen: {
    flex: 1,
  },
  fullscreenVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000000',
  },
  waitingRemoteVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F16',
    gap: 16,
  },
  waitingVideoText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '500',
  },
  largeAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  largeAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '700',
  },
  pipContainer: {
    position: 'absolute',
    right: 16,
    width: 110,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: '#1E1E2D',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  pipVideo: {
    width: '100%',
    height: '100%',
  },
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(10, 10, 15, 0.65)',
  },
  headerInfo: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#A5B4FC',
    fontSize: 14,
    fontWeight: '500',
  },
  audioCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  audioAvatarGlow: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 10,
    marginBottom: 24,
  },
  audioAvatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  audioAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '700',
  },
  otherUserName: {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
  },
  audioStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  liveIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  audioStatusText: {
    color: '#C7D2FE',
    fontSize: 13,
    fontWeight: '600',
  },
  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 22, 0.88)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 16,
    paddingHorizontal: 12,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  controlBtnAccent: {
    backgroundColor: 'rgba(99, 102, 241, 0.25)',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  endCallBtn: {
    backgroundColor: '#EF4444',
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  controlLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  placeholderAvatar: {
    backgroundColor: '#312E81',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringingAvatarGlow: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  ringingAvatar: {
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  ringingAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '700',
  },
  ringingName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  ringingStatus: {
    color: '#94A3B8',
    fontSize: 15,
  },
  ringingControls: {
    position: 'absolute',
    bottom: 20,
    alignItems: 'center',
    gap: 8,
  },
  cancelCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  cancelCallLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  endedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  endedIconWrapper: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endedTitle: {
    color: '#F8FAFC',
    fontSize: 22,
    fontWeight: '700',
  },
  endedDuration: {
    color: '#94A3B8',
    fontSize: 15,
  },
  // ── Group Video & Audio Styles ─────────────────────────────────────────────
  groupVideoGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupVideoTile: {
    width: (width - 28) / 2,
    height: (height - 240) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1E1E2D',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  gridVideo: {
    width: '100%',
    height: '100%',
  },
  groupTilePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#181824',
  },
  groupTileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3730A3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupTileAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  groupTileTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  groupTileName: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  groupAudioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 20,
  },
  groupAudioItem: {
    alignItems: 'center',
    width: (width - 100) / 3,
    marginBottom: 16,
  },
  groupAudioAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  groupAudioAvatarSpeaking: {
    backgroundColor: '#10B981',
  },
  groupAudioAvatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  groupAudioAvatarText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  groupAudioName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  speakingBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  speakingBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '600',
  },
});
