import React, { useMemo, useCallback } from 'react';
import { StyleSheet, Text, View, Pressable, Modal } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { colors, fonts, fontSize, spacing } from '../theme';
import { useSongStore, type ProjectEntry } from '../store';
import { RetroAvatar } from './RetroAvatar';

interface LoadModalProps {
  visible: boolean;
  onClose: () => void;
  onProjectLoaded: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function computeDuration(entry: ProjectEntry): number {
  const song = entry.song;
  const rowDuration = 60 / song.config.bpm / 4;
  const patternDuration = 32 * rowDuration;
  return song.sequence.length * patternDuration;
}

const ProjectRow = React.memo(function ProjectRow({
  entry,
  isActive,
  onLoad,
  onDelete,
}: {
  entry: ProjectEntry;
  isActive: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { song } = entry;
  const config = song.config;
  const duration = computeDuration(entry);
  const sequenceLabels = song.sequence
    .map((idx) => song.patternOrder[idx])
    .join('');

  const name = config.name || `${config.vibe} ${config.key} ${config.scale}`;

  const handlePress = useCallback(() => onLoad(entry.id), [onLoad, entry.id]);
  const handleDelete = useCallback((e: any) => {
    e.stopPropagation();
    onDelete(entry.id);
  }, [onDelete, entry.id]);

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.row, isActive && styles.rowActive]}
      accessibilityRole="button"
      accessibilityLabel={`Load project: ${name}`}
      accessibilityState={{ selected: isActive }}
    >
      <View style={styles.avatarCol}>
        <RetroAvatar name={name} size={36} color={isActive ? colors.accentPrimary : colors.textSecondary} />
      </View>
      <View style={styles.infoCol}>
        <View style={styles.nameRow}>
          <Text style={[styles.nameText, isActive && styles.nameTextActive]} numberOfLines={1}>
            {name}
          </Text>
          {isActive && <Text style={styles.activeBadge}>ACTIVE</Text>}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, isActive && styles.metaTextActive]}>
            {config.vibe.toUpperCase()}
          </Text>
          <Text style={[styles.metaDivider, isActive && styles.metaDividerActive]}>/</Text>
          <Text style={[styles.metaText, isActive && styles.metaTextActive]}>
            {config.key} {config.scale}
          </Text>
          <Text style={[styles.metaDivider, isActive && styles.metaDividerActive]}>/</Text>
          <Text style={[styles.metaText, isActive && styles.metaTextActive]}>
            {config.bpm} BPM
          </Text>
          <Text style={[styles.metaDivider, isActive && styles.metaDividerActive]}>/</Text>
          <Text style={[styles.metaText, isActive && styles.metaTextActive]}>
            {formatTime(duration)}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaDim, isActive && styles.metaTextActive]}>
            {config.length.toUpperCase()}
          </Text>
          <Text style={[styles.metaDivider, isActive && styles.metaDividerActive]}>/</Text>
          <Text style={[styles.metaDim, isActive && styles.metaTextActive]}>
            SEQ: {sequenceLabels}
          </Text>
          <Text style={[styles.metaDivider, isActive && styles.metaDividerActive]}>/</Text>
          <Text style={[styles.metaDim, isActive && styles.metaTextActive]}>
            {formatTimestamp(entry.lastSaved)}
          </Text>
        </View>
      </View>
      {!isActive && (
        <Pressable
          onPress={handleDelete}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={`Delete project: ${name}`}
        >
          <Text style={styles.deleteBtnText}>X</Text>
        </Pressable>
      )}
    </Pressable>
  );
});

const ItemSeparator = () => <View style={styles.separator} />;

const ListEmpty = () => (
  <View style={styles.empty}>
    <Text style={styles.emptyText}>No projects yet. Generate a song to get started.</Text>
  </View>
);

export function LoadModal({ visible, onClose, onProjectLoaded }: LoadModalProps) {
  const projects = useSongStore((s) => s.projects);
  const activeProjectId = useSongStore((s) => s.activeProjectId);
  const loadProject = useSongStore((s) => s.loadProject);
  const deleteProject = useSongStore((s) => s.deleteProject);

  const sortedProjects = useMemo(() => {
    return Object.values(projects).sort((a, b) => b.lastSaved - a.lastSaved);
  }, [projects]);

  const handleLoad = useCallback((id: string) => {
    loadProject(id);
    onProjectLoaded();
    onClose();
  }, [loadProject, onProjectLoaded, onClose]);

  const handleDelete = useCallback((id: string) => {
    deleteProject(id);
  }, [deleteProject]);

  const renderItem = useCallback(({ item }: { item: ProjectEntry }) => (
    <ProjectRow
      entry={item}
      isActive={item.id === activeProjectId}
      onLoad={handleLoad}
      onDelete={handleDelete}
    />
  ), [activeProjectId, handleLoad, handleDelete]);

  const keyExtractor = useCallback((item: ProjectEntry) => item.id, []);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>LOAD PROJECT</Text>
            <Text style={styles.countText}>{sortedProjects.length} projects</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close load modal">
              <Text style={styles.closeBtnText}>X</Text>
            </Pressable>
          </View>

          {/* Project list */}
          <View style={styles.list}>
            <FlashList
              data={sortedProjects}
              renderItem={renderItem}
              keyExtractor={keyExtractor}

              ItemSeparatorComponent={ItemSeparator}
              ListEmptyComponent={ListEmpty}
              contentContainerStyle={styles.listContent}
              extraData={activeProjectId}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    flex: 1,
    width: '100%',
    maxWidth: 700,
    maxHeight: '80%',
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    gap: spacing.lg,
  },
  title: {
    fontFamily: fonts.mono,
    fontSize: fontSize.panelTitle,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 2,
  },
  countText: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textDim,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  closeBtnText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.buttonLabel,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
  },
  separator: {
    height: spacing.xs,
  },
  empty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackSub,
    color: colors.textDim,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
  },
  rowActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.bgCursor,
  },
  avatarCol: {
    width: 36,
    height: 36,
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nameText: {
    fontFamily: fonts.mono,
    fontSize: fontSize.trackHeader,
    fontWeight: '700',
    color: '#A0A0A6',
    flexShrink: 1,
  },
  nameTextActive: {
    color: colors.accentPrimary,
  },
  activeBadge: {
    fontFamily: fonts.mono,
    fontSize: 8,
    fontWeight: '700',
    color: colors.accentPrimary,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    paddingHorizontal: 4,
    paddingVertical: 1,
    letterSpacing: 0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  metaTextActive: {
    color: colors.textPrimary,
  },
  metaDivider: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
  },
  metaDividerActive: {
    color: colors.textSecondary,
  },
  metaDim: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  deleteBtn: {
    width: 22,
    height: 22,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  deleteBtnText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.textDim,
    fontWeight: '700',
  },
});
