/**
 * Media, Files & Links Gallery Screen
 *
 * Shows all shared media/files/links for a conversation in a
 * tabbed, paginated UI that matches the Chatrio design system.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';

import { api } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/media';
import { useThemeColors } from '../../hooks/useThemeColors';
import { FontSize, Spacing, Radius } from '../../constants/Typography';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'images' | 'files' | 'links';

interface MediaSender {
  id: string;
  displayName: string;
}

interface ImageItem {
  id: string;
  type: 'IMAGE';
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  createdAt: string;
  message: {
    id: string;
    createdAt: string;
    sender: MediaSender | null;
  };
}

interface FileItem {
  id: string;
  type: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  message: {
    id: string;
    createdAt: string;
    sender: MediaSender | null;
  };
}

interface LinkItem {
  messageId: string;
  url: string;
  content: string;
  createdAt: string;
  sender: MediaSender | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_COLS = 3;
const GRID_GAP = 2;
const CELL_SIZE = (SCREEN_W - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.slice(0, 30);
  }
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('video/')) return 'videocam-outline';
  if (mimeType.startsWith('audio/')) return 'musical-note-outline';
  if (mimeType.includes('pdf')) return 'document-text-outline';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'document-outline';
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType.includes('csv')) return 'grid-outline';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'easel-outline';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'archive-outline';
  return 'attach-outline';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle, C }: {
  icon: string;
  title: string;
  subtitle: string;
  C: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={emptyStyles.container}>
      <View style={[emptyStyles.iconWrap, { backgroundColor: C.primaryLight }]}>
        <Ionicons name={icon as any} size={40} color={C.primary} />
      </View>
      <Text style={[emptyStyles.title, { color: C.textPrimary }]}>{title}</Text>
      <Text style={[emptyStyles.subtitle, { color: C.textSecondary }]}>{subtitle}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingTop: 60 },
  iconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontSize: FontSize.lg, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
});

function GridSkeleton({ C }: { C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: GRID_GAP }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <View key={i} style={{ width: CELL_SIZE, height: CELL_SIZE, margin: GRID_GAP / 2, backgroundColor: C.shimmer, borderRadius: Radius.sm }} />
      ))}
    </View>
  );
}

function ListSkeleton({ C }: { C: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={{ padding: Spacing.base }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base }}>
          <View style={{ width: 44, height: 44, borderRadius: Radius.md, backgroundColor: C.shimmer, marginRight: Spacing.md }} />
          <View style={{ flex: 1 }}>
            <View style={{ height: 14, backgroundColor: C.shimmer, borderRadius: 6, marginBottom: 8, width: '70%' }} />
            <View style={{ height: 12, backgroundColor: C.shimmer, borderRadius: 6, width: '45%' }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function LightboxImageItem({ img }: { img: ImageItem }) {
  const [failed, setFailed] = useState(false);
  const resolvedUrl = resolveMediaUrl(img.url);

  return (
    <View style={{ width: SCREEN_W, justifyContent: 'center', alignItems: 'center' }}>
      {failed ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setFailed(false)}
          style={{ alignItems: 'center', padding: 20 }}
        >
          <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.7)" />
          <Text style={{ color: '#fff', fontSize: FontSize.sm, marginTop: 10, fontWeight: '600' }}>
            Unable to load image
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 }}>
            <Ionicons name="refresh-outline" size={16} color="#60A5FA" />
            <Text style={{ color: '#60A5FA', fontSize: FontSize.xs, fontWeight: '600' }}>Tap to retry</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: SCREEN_W, height: SCREEN_W * 1.2 }}
          contentFit="contain"
          transition={200}
          cachePolicy="memory-disk"
          placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          onError={(e) => {
            console.warn(`[Lightbox] Failed to load image: id=${img.id}, url=${resolvedUrl}:`, e.error);
            setFailed(true);
          }}
        />
      )}
    </View>
  );
}

function ImageLightbox({ images, initialIndex, onClose }: {
  images: ImageItem[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isSaving, setIsSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: initialIndex * SCREEN_W, animated: false });
    }, 0);
  }, [initialIndex]);

  const current = images[currentIndex];

  const handleSave = async (url: string) => {
    if (isSaving) return;
    setIsSaving(true);
    const imageUrl = resolveMediaUrl(url);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Chatrio needs permission to save images to your device gallery.');
        return;
      }
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDir) {
        throw new Error('Temporary storage is unavailable.');
      }
      const dirWithSlash = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
      const urlWithoutQuery = imageUrl.split('?')[0].split('#')[0];
      const match = /\.(jpe?g|png|webp|gif)$/i.exec(urlWithoutQuery);
      const ext = match ? match[1].toLowerCase() : 'jpg';
      const filename = `chatrio_${Date.now()}.${ext}`;
      const tempDest = `${dirWithSlash}${filename}`;

      const downloadRes = await FileSystem.downloadAsync(imageUrl, tempDest);
      if (downloadRes.status < 200 || downloadRes.status >= 300) {
        throw new Error(`Download failed with status ${downloadRes.status}`);
      }

      await MediaLibrary.saveToLibraryAsync(downloadRes.uri);
      FileSystem.deleteAsync(downloadRes.uri, { idempotent: true }).catch(() => {});

      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert('Saved to Gallery', 'Image has been saved to your photo gallery.');
    } catch (err: any) {
      console.warn('Failed to save image:', err);
      Alert.alert('Save Failed', err?.message || 'Could not save image to gallery.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={lbStyles.bg}>
        <View style={lbStyles.topBar}>
          <TouchableOpacity style={lbStyles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={lbStyles.counter}>{currentIndex + 1} / {images.length}</Text>
          <TouchableOpacity
            style={lbStyles.saveBtn}
            onPress={() => current && handleSave(current.url)}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="download-outline" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
            setCurrentIndex(idx);
          }}
        >
          {images.map((img) => (
            <LightboxImageItem key={img.id} img={img} />
          ))}
        </ScrollView>

        {current && (
          <View style={lbStyles.caption}>
            <Text style={lbStyles.captionName}>{current.message.sender?.displayName ?? 'Unknown'}</Text>
            <Text style={lbStyles.captionDate}>{formatDate(current.message.createdAt)}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const lbStyles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, position: 'absolute', top: 44, left: 0, right: 0, zIndex: 10 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  counter: { color: '#fff', fontSize: FontSize.base, fontWeight: '600' },
  caption: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 24 },
  captionName: { color: '#fff', fontWeight: '600', fontSize: FontSize.sm },
  captionDate: { color: 'rgba(255,255,255,0.6)', fontSize: FontSize.xs, marginTop: 2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function GalleryScreen() {
  const { id: conversationId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const C = useThemeColors();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<Tab>('images');

  const [images, setImages] = useState<ImageItem[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesCursor, setImagesCursor] = useState<string | null>(null);
  const [imagesHasMore, setImagesHasMore] = useState(true);
  const imagesLoadedRef = useRef(false);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesCursor, setFilesCursor] = useState<string | null>(null);
  const [filesHasMore, setFilesHasMore] = useState(true);
  const filesLoadedRef = useRef(false);

  const [links, setLinks] = useState<LinkItem[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linksCursor, setLinksCursor] = useState<string | null>(null);
  const [linksHasMore, setLinksHasMore] = useState(true);
  const linksLoadedRef = useRef(false);

  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleRetryImage = useCallback((id: string) => {
    setFailedImages((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const loadImages = useCallback(async (cursor?: string) => {
    if (imagesLoading) return;
    setImagesLoading(true);
    try {
      const params: Record<string, string> = { tab: 'images', limit: '40' };
      if (cursor) params.cursor = cursor;
      const res = await api.get(`/conversations/${conversationId}/media`, { params });
      const { items, nextCursor } = res.data as { items: ImageItem[]; nextCursor: string | null };
      setImages((prev) => cursor ? [...prev, ...items] : items);
      setImagesCursor(nextCursor);
      setImagesHasMore(!!nextCursor);
    } catch (err: any) {
      console.warn('[Gallery] images:', err?.message);
    } finally {
      setImagesLoading(false);
    }
  }, [conversationId]);

  const loadFiles = useCallback(async (cursor?: string) => {
    if (filesLoading) return;
    setFilesLoading(true);
    try {
      const params: Record<string, string> = { tab: 'files', limit: '40' };
      if (cursor) params.cursor = cursor;
      const res = await api.get(`/conversations/${conversationId}/media`, { params });
      const { items, nextCursor } = res.data as { items: FileItem[]; nextCursor: string | null };
      setFiles((prev) => cursor ? [...prev, ...items] : items);
      setFilesCursor(nextCursor);
      setFilesHasMore(!!nextCursor);
    } catch (err: any) {
      console.warn('[Gallery] files:', err?.message);
    } finally {
      setFilesLoading(false);
    }
  }, [conversationId]);

  const loadLinks = useCallback(async (cursor?: string) => {
    if (linksLoading) return;
    setLinksLoading(true);
    try {
      const params: Record<string, string> = { tab: 'links', limit: '40' };
      if (cursor) params.cursor = cursor;
      const res = await api.get(`/conversations/${conversationId}/media`, { params });
      const { items, nextCursor } = res.data as { items: LinkItem[]; nextCursor: string | null };
      setLinks((prev) => cursor ? [...prev, ...items] : items);
      setLinksCursor(nextCursor);
      setLinksHasMore(!!nextCursor);
    } catch (err: any) {
      console.warn('[Gallery] links:', err?.message);
    } finally {
      setLinksLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (activeTab === 'images' && !imagesLoadedRef.current) {
      imagesLoadedRef.current = true;
      loadImages();
    }
  }, [activeTab, loadImages]);

  useEffect(() => {
    if (activeTab === 'files' && !filesLoadedRef.current) {
      filesLoadedRef.current = true;
      loadFiles();
    }
  }, [activeTab, loadFiles]);

  useEffect(() => {
    if (activeTab === 'links' && !linksLoadedRef.current) {
      linksLoadedRef.current = true;
      loadLinks();
    }
  }, [activeTab, loadLinks]);

  const openLink = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
    } catch { /* silent */ }
  }, []);

  const openFile = useCallback(async (url: string) => {
    try { await Linking.openURL(url); } catch { /* silent */ }
  }, []);

  const renderImageCell = useCallback(({ item, index }: { item: ImageItem; index: number }) => {
    const isFailed = !!failedImages[item.id];
    const resolvedUrl = resolveMediaUrl(item.url);

    if (isFailed) {
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleRetryImage(item.id)}
          style={[gridStyles.cell, gridStyles.errorCell, { backgroundColor: C.backgroundTertiary, borderColor: C.border }]}
        >
          <Ionicons name="alert-circle-outline" size={24} color={C.textTertiary} />
          <Text style={[gridStyles.errorText, { color: C.textTertiary }]} numberOfLines={1}>Unable to load</Text>
          <View style={gridStyles.retryRow}>
            <Ionicons name="refresh-outline" size={11} color={C.primary} />
            <Text style={[gridStyles.retryText, { color: C.primary }]}>Retry</Text>
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setLightboxIndex(index)}
        style={[gridStyles.cell, { backgroundColor: C.backgroundTertiary }]}
      >
        <Image
          source={{ uri: resolvedUrl }}
          style={gridStyles.cellImg}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
          placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          onError={(e) => {
            console.warn(`[Gallery] Image load error: id=${item.id}, fileName=${item.fileName}, url=${resolvedUrl}, rawUrl=${item.url}, error=`, e.error);
            setFailedImages((prev) => ({ ...prev, [item.id]: true }));
          }}
        />
      </TouchableOpacity>
    );
  }, [C, failedImages, handleRetryImage]);

  const renderFileRow = useCallback(({ item }: { item: FileItem }) => {
    const resolvedUrl = resolveMediaUrl(item.url);
    return (
      <TouchableOpacity style={[fileStyles.row, { borderBottomColor: C.divider }]} activeOpacity={0.7} onPress={() => openFile(resolvedUrl)}>
        <View style={[fileStyles.iconWrap, { backgroundColor: C.primaryLight }]}>
          <Ionicons name={getFileIcon(item.mimeType) as any} size={22} color={C.primary} />
        </View>
        <View style={fileStyles.info}>
          <Text style={[fileStyles.name, { color: C.textPrimary }]} numberOfLines={1}>{item.fileName}</Text>
          <Text style={[fileStyles.meta, { color: C.textSecondary }]}>
            {formatBytes(item.size)} · {formatDate(item.message.createdAt)}
            {item.message.sender ? ` · ${item.message.sender.displayName}` : ''}
          </Text>
        </View>
        <Ionicons name="open-outline" size={18} color={C.textTertiary} />
      </TouchableOpacity>
    );
  }, [C, openFile]);

  const renderLinkRow = useCallback(({ item }: { item: LinkItem }) => (
    <TouchableOpacity style={[linkStyles.row, { backgroundColor: C.surface, borderColor: C.border }]} activeOpacity={0.7} onPress={() => openLink(item.url)}>
      <View style={[linkStyles.iconWrap, { backgroundColor: C.primaryLight }]}>
        <Ionicons name="link-outline" size={20} color={C.primary} />
      </View>
      <View style={linkStyles.info}>
        <Text style={[linkStyles.domain, { color: C.primary }]} numberOfLines={1}>{getDomain(item.url)}</Text>
        <Text style={[linkStyles.preview, { color: C.textSecondary }]} numberOfLines={2}>{item.content}</Text>
        <Text style={[linkStyles.meta, { color: C.textTertiary }]}>
          {item.sender?.displayName ?? 'Unknown'} · {formatDate(item.createdAt)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textTertiary} />
    </TouchableOpacity>
  ), [C, openLink]);

  const isFirstLoad = (tab: Tab) => {
    if (tab === 'images') return imagesLoading && images.length === 0;
    if (tab === 'files') return filesLoading && files.length === 0;
    return linksLoading && links.length === 0;
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'images', label: 'Media' },
    { key: 'files', label: 'Files' },
    { key: 'links', label: 'Links' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.surface, borderBottomColor: C.border, paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: C.textPrimary }]} numberOfLines={1}>Media, Files & Links</Text>
          {name ? <Text style={[styles.headerSub, { color: C.textSecondary }]} numberOfLines={1}>{name}</Text> : null}
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && { borderBottomColor: C.primary }]}
            onPress={() => setActiveTab(t.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabLabel, { color: activeTab === t.key ? C.primary : C.textSecondary }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Images tab */}
      {activeTab === 'images' && (
        isFirstLoad('images') ? <GridSkeleton C={C} /> :
        images.length === 0 ? (
          <EmptyState icon="images-outline" title="No media shared yet" subtitle="Images and videos shared in this conversation will appear here." C={C} />
        ) : (
          <FlatList
            data={images}
            keyExtractor={(item) => item.id}
            renderItem={renderImageCell}
            numColumns={GRID_COLS}
            contentContainerStyle={gridStyles.grid}
            columnWrapperStyle={gridStyles.row}
            onEndReached={() => imagesHasMore && !imagesLoading && loadImages(imagesCursor ?? undefined)}
            onEndReachedThreshold={0.4}
            ListFooterComponent={imagesHasMore && imagesLoading ? <ActivityIndicator color={C.primary} style={{ margin: Spacing.lg }} /> : null}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* Files tab */}
      {activeTab === 'files' && (
        isFirstLoad('files') ? <ListSkeleton C={C} /> :
        files.length === 0 ? (
          <EmptyState icon="document-outline" title="No files shared yet" subtitle="Documents and other files shared here will appear in this list." C={C} />
        ) : (
          <FlatList
            data={files}
            keyExtractor={(item) => item.id}
            renderItem={renderFileRow}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            onEndReached={() => filesHasMore && !filesLoading && loadFiles(filesCursor ?? undefined)}
            onEndReachedThreshold={0.4}
            ListFooterComponent={filesHasMore && filesLoading ? <ActivityIndicator color={C.primary} style={{ margin: Spacing.lg }} /> : null}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* Links tab */}
      {activeTab === 'links' && (
        isFirstLoad('links') ? <ListSkeleton C={C} /> :
        links.length === 0 ? (
          <EmptyState icon="link-outline" title="No links shared yet" subtitle="URLs shared in conversation messages will appear here." C={C} />
        ) : (
          <FlatList
            data={links}
            keyExtractor={(item, i) => `${item.messageId}-${i}`}
            renderItem={renderLinkRow}
            contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 16 }}
            onEndReached={() => linksHasMore && !linksLoading && loadLinks(linksCursor ?? undefined)}
            onEndReachedThreshold={0.4}
            ListFooterComponent={linksHasMore && linksLoading ? <ActivityIndicator color={C.primary} style={{ margin: Spacing.lg }} /> : null}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* Image lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox images={images} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 56 },
  backBtn: { padding: Spacing.xs, marginRight: Spacing.sm },
  headerTitle: { fontSize: FontSize.md, fontWeight: '700' },
  headerSub: { fontSize: FontSize.xs, marginTop: 1 },
  tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabLabel: { fontSize: FontSize.sm, fontWeight: '600' },
});

const gridStyles = StyleSheet.create({
  grid: { padding: GRID_GAP },
  row: { marginBottom: GRID_GAP },
  cell: { width: CELL_SIZE, height: CELL_SIZE, margin: GRID_GAP / 2, borderRadius: Radius.sm, overflow: 'hidden' },
  cellImg: { width: '100%', height: '100%' },
  errorCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    padding: 6,
  },
  errorText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  retryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 3,
  },
  retryText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

const fileStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  iconWrap: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  info: { flex: 1, marginRight: Spacing.sm },
  name: { fontSize: FontSize.sm, fontWeight: '600', marginBottom: 3 },
  meta: { fontSize: FontSize.xs },
});

const linkStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth },
  iconWrap: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  info: { flex: 1, marginRight: Spacing.sm },
  domain: { fontSize: FontSize.sm, fontWeight: '700', marginBottom: 3 },
  preview: { fontSize: FontSize.xs, lineHeight: 17, marginBottom: 4 },
  meta: { fontSize: FontSize.xs },
});
