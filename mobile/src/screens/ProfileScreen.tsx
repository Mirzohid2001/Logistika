import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { authService } from '../services/authService';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { AppHeader } from '../components/AppHeader';
import { AccountRestrictedBanner } from '../components/AccountRestrictedBanner';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { getMediaUrl } from '../services/api';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../theme';
import { useThemedStyles, type AppColors } from '../theme/useThemedStyles';
import { useAppTheme } from '../theme/useAppTheme';
import { toastService } from '../services/toastService';
import { userRequiresSubscription } from '../utils/account';
import { navigateRoot, navigateRoleStack, navigateMainTab } from '../utils/navigationHelpers';
import { ScreenBackground } from '../components/ScreenBackground';
import { DriverVerificationBanner } from '../components/DriverVerificationBanner';
import { TrustScoreCard } from '../components/TrustScoreCard';
import { useChatBadge } from '../context/ChatBadgeContext';
import { useThemePreference } from '../context/ThemeContext';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { ProfileMenuSection, ProfileMenuItem } from '../components/profile/ProfileMenu';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const { user, logout, updateUser, refreshUser, activeMarketplaceRole, canSwitchMarketplaceRole, setActiveMarketplaceRole } = useAuth();
  const { t, changeLanguage, currentLanguage } = useTranslation();
  const { preference: themePreference, cyclePreference } = useThemePreference();
  const styles = useThemedStyles(createStyles);
  const { colors } = useAppTheme();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [firstName, setFirstName] = useState(user?.first_name || '');
  const [lastName, setLastName] = useState(user?.last_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [inlineBanner, setInlineBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const getPrimaryRole = () => {
    if (!user) {return null;}
    if (user.is_dispatcher) {return 'dispatcher';}
    if (user.is_updater) {return 'updater';}
    if (activeMarketplaceRole) {return activeMarketplaceRole;}
    if (user.is_driver) {return 'driver';}
    if (user.is_client) {return 'client';}
    return null;
  };

  const primaryRole = getPrimaryRole();
  const { unreadCount: chatUnreadCount } = useChatBadge();

  const themeLabel =
    themePreference === 'dark'
      ? t('profile.themeDark')
      : themePreference === 'light'
        ? t('profile.themeLight')
        : t('profile.themeSystem');

  const languageLabel =
    currentLanguage === 'uz'
      ? t('profile.uzbek')
      : currentLanguage === 'ru'
        ? t('profile.russian')
        : t('profile.english');

  const documentsNeedAttention =
    !user?.is_verified || !user?.document_photos || user.document_photos.length === 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshUser({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [refreshUser]);

  const handleSave = async () => {
    if (!firstName || !lastName) {
      Alert.alert(t('common.error'), t('profile.firstNameRequired'));
      return;
    }

    try {
      setLoading(true);
      const updatedUser = await authService.updateProfile({
        first_name: firstName,
        last_name: lastName,
        email: email || undefined,
      });
      updateUser(updatedUser);
      setEditing(false);
      setInlineBanner({ type: 'success', message: t('profile.profileUpdated') });
      toastService.success(t('profile.profileUpdated'));
    } catch (error: any) {
      const message = error.response?.data?.error || t('profile.updateError');
      setInlineBanner({ type: 'error', message });
      toastService.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
        },
      },
    ]);
  };

  const handlePickAvatar = () => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1024,
        maxHeight: 1024,
      },
      async (response: ImagePickerResponse) => {
        if (response.didCancel) {return;}
        const asset = response.assets?.[0];
        if (!asset?.uri) {
          Alert.alert(t('common.error'), t('profile.updateError'));
          return;
        }
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
          Alert.alert(t('common.error'), t('profile.avatarMaxSize'));
          return;
        }

        try {
          setUploadingAvatar(true);
          const updatedUser = await authService.uploadAvatar({
            uri: asset.uri,
            type: asset.type || 'image/jpeg',
            fileName: asset.fileName || `avatar_${Date.now()}.jpg`,
          });
          updateUser(updatedUser);
          setInlineBanner({ type: 'success', message: t('profile.avatarUpdated') });
          toastService.success(t('profile.avatarUpdated'));
        } catch (error: any) {
          const message = error?.message || t('profile.updateError');
          setInlineBanner({ type: 'error', message });
          toastService.error(message);
        } finally {
          setUploadingAvatar(false);
        }
      }
    );
  };

  if (!user) {
    return <LoadingSpinner />;
  }

  return (
    <ScreenBackground>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }>
      <AppHeader variant="hero" title={t('profile.title')} subtitle={t('profile.subtitle')} />
      <AccountRestrictedBanner user={user} />
      {inlineBanner && (
        <View
          style={[
            styles.inlineBanner,
            inlineBanner.type === 'success' ? styles.inlineBannerSuccess : styles.inlineBannerError,
          ]}>
          <Text style={styles.inlineBannerText}>{inlineBanner.message}</Text>
        </View>
      )}
      <Card variant="elevated" style={styles.profileCard}>
        <View style={styles.profileHeroAccent} />
        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickAvatar} disabled={uploadingAvatar}>
          {user.avatar ? (
            <View style={styles.avatarFrame}>
              <Image
                source={{
                  uri: getMediaUrl(user.avatar) || '',
                }}
                style={styles.avatar}
                resizeMode="cover"
              />
            </View>
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {user.first_name[0]}{user.last_name[0]}
              </Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            {uploadingAvatar ? (
              <Text style={styles.avatarEditBadgeText}>...</Text>
            ) : (
              <MaterialIcons name="edit" size={14} color={colors.textLight} />
            )}
          </View>
        </TouchableOpacity>

        <Text style={styles.name}>
          {user.first_name} {user.last_name}
        </Text>
        <Text style={styles.phone}>{user.phone}</Text>
        {user.is_client && user.company_inn && (
          <Text style={styles.email}>
            {t('auth.companyInn')}: {user.company_inn}
          </Text>
        )}
        {user.email && <Text style={styles.email}>{user.email}</Text>}

        <View style={styles.ratingContainer}>
          <Text style={styles.ratingLabel}>{t('profile.rating')}:</Text>
          {user.average_rating !== undefined && user.average_rating > 0 ? (
            <>
              <View style={styles.ratingStars}>
                <Text style={styles.ratingValue}>{user.average_rating.toFixed(1)}</Text>
                <MaterialIcons name="star" size={20} color={colors.rating} />
              </View>
              {user.total_ratings && user.total_ratings > 0 && (
                <Text style={styles.ratingCount}>({user.total_ratings} {t('profile.ratingsCount')})</Text>
              )}
            </>
          ) : (
            <Text style={styles.noRatingText}>{t('profile.noRating')}</Text>
          )}
          {(user.complaints_received_count ?? 0) > 0 && (
            <View style={styles.complaintsRow}>
              <MaterialIcons name="report-problem" size={16} color={colors.warning} />
              <Text style={styles.complaintsCount}>
                {user.complaints_received_count} {t('complaints.receivedOnProfile')}
                {(user.complaints_pending_count ?? 0) > 0
                  ? ` (${user.complaints_pending_count} ${t('complaints.pendingShort')})`
                  : ''}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.badges}>
          <View style={[styles.badge, user.is_driver && styles.badgeActive]}>
            <Text style={[styles.badgeText, user.is_driver && styles.badgeTextActive]}>
              {user.is_driver ? `✓ ${t('profile.driver')}` : t('profile.driver')}
            </Text>
          </View>
          <View style={[styles.badge, user.is_client && styles.badgeActive]}>
            <Text style={[styles.badgeText, user.is_client && styles.badgeTextActive]}>
              {user.is_client ? `✓ ${t('profile.client')}` : t('profile.client')}
            </Text>
          </View>
          {user.is_dispatcher && (
            <View style={[styles.badge, styles.badgeActive]}>
              <Text style={[styles.badgeText, styles.badgeTextActive]}>✓ {t('profile.dispatcher')}</Text>
            </View>
          )}
          {user.is_updater && (
            <View style={[styles.badge, styles.badgeActive]}>
              <Text style={[styles.badgeText, styles.badgeTextActive]}>✓ {t('profile.updater')}</Text>
            </View>
          )}
          {user.is_verified && (
            <View style={[styles.badge, styles.badgeVerified]}>
              <Text style={[styles.badgeText, styles.badgeTextVerified]}>✓ {t('profile.verified')}</Text>
            </View>
          )}
          {!user.is_verified && user.verification_status === 'pending' && (
            <View style={[styles.badge, styles.badgePending]}>
              <Text style={[styles.badgeText, styles.badgeTextPending]}>⏳ {t('profile.verificationPending')}</Text>
            </View>
          )}
          {!user.is_verified && user.verification_status === 'rejected' && (
            <View style={[styles.badge, styles.badgeRejected]}>
              <Text style={[styles.badgeText, styles.badgeTextRejected]}>✕ {t('profile.verificationRejected')}</Text>
            </View>
          )}
        </View>
      </Card>

      <TrustScoreCard user={user} />

      {userRequiresSubscription(user) && user.subscription && (
        <Card style={styles.subscriptionCard}>
          <Text style={styles.subscriptionTitle}>{t('subscriptions.manage')}</Text>
          {user.subscription.active ? (
            <>
              {!!user.subscription.plan_name && (
                <Text style={styles.subscriptionPlan}>{user.subscription.plan_name}</Text>
              )}
              {user.subscription.days_remaining != null && (
                <Text style={styles.subscriptionMeta}>
                  {t('subscriptions.daysLeft', { count: user.subscription.days_remaining })}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.subscriptionInactive}>{t('subscriptions.subtitle')}</Text>
              {(user.subscription.trial?.remaining ?? user.account?.trial?.remaining ?? 0) > 0 && (
                <Text style={styles.trialRemaining}>
                  {t('subscriptions.trialRemaining', {
                    count: user.subscription.trial?.remaining ?? user.account?.trial?.remaining ?? 0,
                  })}
                </Text>
              )}
              {(user.subscription.trial?.remaining ?? user.account?.trial?.remaining ?? 0) <= 0 &&
                user.subscription.trial?.disabled &&
                !!user.subscription.trial?.disabled_reason && (
                  <Text style={styles.trialDisabled}>
                    {t(`subscriptions.trialDisabled.${user.subscription.trial.disabled_reason}`, {
                      defaultValue: t('subscriptions.trialExhausted'),
                    })}
                  </Text>
                )}
            </>
          )}
          <Button
            title={
              user.subscription.active
                ? t('subscriptions.renew')
                : (user.subscription.trial?.remaining ?? 0) > 0
                  ? t('subscriptions.subscribe')
                  : t('subscriptions.renew')
            }
            onPress={() => navigateRoot(navigation, 'SubscriptionPaywall')}
            variant={user.subscription.active ? 'outline' : 'primary'}
            style={styles.subscriptionButton}
          />
        </Card>
      )}

      <Card style={styles.editCard}>
        {editing ? (
          <>
            <Input
              label={t('profile.firstName')}
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t('profile.firstName')}
            />
            <Input
              label={t('profile.lastName')}
              value={lastName}
              onChangeText={setLastName}
              placeholder={t('profile.lastName')}
            />
            <Input
              label={t('profile.email')}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.editActions}>
              <Button
                title={t('common.save')}
                onPress={handleSave}
                loading={loading}
                variant="primary"
                style={styles.saveButton}
              />
              <Button
                title={t('common.cancel')}
                onPress={() => {
                  setFirstName(user.first_name);
                  setLastName(user.last_name);
                  setEmail(user.email || '');
                  setEditing(false);
                }}
                variant="outline"
                style={styles.cancelButton}
              />
            </View>
          </>
        ) : (
          <Button
            title={t('profile.editProfile')}
            onPress={() => setEditing(true)}
            variant="outline"
          />
        )}
      </Card>

      {primaryRole === 'driver' && <DriverVerificationBanner />}

      {canSwitchMarketplaceRole && (
        <Card style={styles.roleSwitchCard}>
          <Text style={styles.menuSectionTitle}>{t('profile.switchRole')}</Text>
          <View style={styles.roleSwitchRow}>
            <Button
              title={t('profile.client')}
              onPress={() => void setActiveMarketplaceRole('client')}
              variant={activeMarketplaceRole === 'client' ? 'primary' : 'outline'}
              style={styles.roleSwitchButton}
            />
            <Button
              title={t('profile.driver')}
              onPress={() => void setActiveMarketplaceRole('driver')}
              variant={activeMarketplaceRole === 'driver' ? 'primary' : 'outline'}
              style={styles.roleSwitchButton}
            />
          </View>
        </Card>
      )}

      {primaryRole === 'client' && (
        <ProfileMenuSection title={t('profile.menuSections.work')}>
          <ProfileMenuItem
            icon="campaign"
            iconColor={colors.primary}
            iconBackground={colors.primaryGlow}
            label={t('profile.myAdvertisements')}
            onPress={() => navigateRoleStack(navigation, 'ClientStack', 'MyAdvertisements')}
          />
          <ProfileMenuItem
            icon="assignment"
            iconColor={colors.primary}
            iconBackground={colors.primaryGlow}
            label={t('profile.myOrders')}
            onPress={() => navigateRoleStack(navigation, 'ClientStack', 'ClientOrders')}
          />
          <ProfileMenuItem
            icon="bar-chart"
            iconColor={colors.secondary}
            iconBackground={colors.secondaryGlow}
            label={t('profile.statistics')}
            onPress={() => navigateRoleStack(navigation, 'ClientStack', 'Statistics')}
          />
          <ProfileMenuItem
            icon="business"
            iconColor={colors.info}
            iconBackground={`${colors.info}22`}
            label={t('company.title')}
            onPress={() => navigateRoot(navigation, 'CompanyMembers')}
          />
        </ProfileMenuSection>
      )}

      {primaryRole === 'driver' && (
        <>
          <ProfileMenuSection title={t('profile.menuSections.work')}>
            <ProfileMenuItem
              icon="local-shipping"
              iconColor={colors.primary}
              iconBackground={colors.primaryGlow}
              label={t('profile.vehicles')}
              onPress={() => navigateRoleStack(navigation, 'DriverStack', 'Vehicles')}
            />
            <ProfileMenuItem
              icon="alt-route"
              iconColor={colors.primary}
              iconBackground={colors.primaryGlow}
              label={t('matching.lanes.title')}
              onPress={() => navigateRoleStack(navigation, 'DriverStack', 'DriverLanes')}
            />
            <ProfileMenuItem
              icon="local-offer"
              iconColor={colors.logisticsAccent}
              iconBackground={colors.accentGlow}
              label={t('matching.feed.title')}
              onPress={() => navigateRoleStack(navigation, 'DriverStack', 'DriverMatches')}
            />
            <ProfileMenuItem
              icon="assignment"
              iconColor={colors.primary}
              iconBackground={colors.primaryGlow}
              label={t('profile.currentOrders')}
              onPress={() => navigateRoleStack(navigation, 'DriverStack', 'Orders', { filter: 'active' })}
            />
            <ProfileMenuItem
              icon="description"
              iconColor={colors.logisticsAccent}
              iconBackground={colors.accentGlow}
              label={t('profile.myBids')}
              onPress={() => navigateRoleStack(navigation, 'DriverStack', 'MyBids')}
            />
            <ProfileMenuItem
              icon="history"
              iconColor={colors.textSecondary}
              iconBackground={colors.backgroundTertiary}
              label={t('profile.orderHistory')}
              onPress={() => navigateRoleStack(navigation, 'DriverStack', 'Orders', { filter: 'completed' })}
            />
          </ProfileMenuSection>

          <ProfileMenuSection title={t('profile.menuSections.documents')}>
            <ProfileMenuItem
              icon="upload-file"
              iconColor={colors.warning}
              iconBackground={colors.warningGlow}
              label={t('profile.uploadDocuments')}
              warningDot={documentsNeedAttention}
              onPress={() => navigateRoot(navigation, 'UploadDocuments')}
            />
            <ProfileMenuItem
              icon="folder"
              iconColor={colors.info}
              iconBackground={`${colors.info}22`}
              label={t('profile.documentCenter')}
              subtitle={t('profile.documentCenterSubtitle')}
              onPress={() => navigateRoot(navigation, 'DriverDocuments')}
            />
          </ProfileMenuSection>
        </>
      )}

      {primaryRole === 'dispatcher' && (
        <ProfileMenuSection title={t('profile.menuSections.work')}>
          <ProfileMenuItem
            icon="dashboard"
            iconColor={colors.primary}
            iconBackground={colors.primaryGlow}
            label={t('profile.dashboard')}
            onPress={() => navigateRoleStack(navigation, 'DispatcherStack', 'DispatcherDashboard')}
          />
          <ProfileMenuItem
            icon="inventory-2"
            iconColor={colors.primary}
            iconBackground={colors.primaryGlow}
            label={t('orders.title')}
            onPress={() => navigateRoleStack(navigation, 'DispatcherStack', 'DispatcherOrders')}
          />
          <ProfileMenuItem
            icon="bar-chart"
            iconColor={colors.secondary}
            iconBackground={colors.secondaryGlow}
            label={t('profile.statistics')}
            onPress={() => navigateRoleStack(navigation, 'DispatcherStack', 'DispatcherStatistics')}
          />
        </ProfileMenuSection>
      )}

      {primaryRole === 'updater' && (
        <ProfileMenuSection title={t('profile.menuSections.work')}>
          <ProfileMenuItem
            icon="dashboard"
            iconColor={colors.primary}
            iconBackground={colors.primaryGlow}
            label={t('profile.dashboard')}
            onPress={() => navigateRoleStack(navigation, 'UpdaterStack', 'UpdaterDashboard')}
          />
          <ProfileMenuItem
            icon="pending-actions"
            iconColor={colors.warning}
            iconBackground={colors.warningGlow}
            label={t('profile.pendingUpdates')}
            onPress={() => navigateRoleStack(navigation, 'UpdaterStack', 'UpdaterPendingUpdates')}
          />
          <ProfileMenuItem
            icon="my-location"
            iconColor={colors.info}
            iconBackground={`${colors.info}22`}
            label={t('profile.activeTracking')}
            onPress={() => navigateRoleStack(navigation, 'UpdaterStack', 'UpdaterActiveTracking')}
          />
          <ProfileMenuItem
            icon="history"
            iconColor={colors.textSecondary}
            iconBackground={colors.backgroundTertiary}
            label={t('profile.updateLogs')}
            onPress={() => navigateRoleStack(navigation, 'UpdaterStack', 'UpdaterLogs')}
          />
          <ProfileMenuItem
            icon="bar-chart"
            iconColor={colors.secondary}
            iconBackground={colors.secondaryGlow}
            label={t('profile.statistics')}
            onPress={() => navigateRoleStack(navigation, 'UpdaterStack', 'UpdaterStatistics')}
          />
        </ProfileMenuSection>
      )}

      {(primaryRole === 'client' || primaryRole === 'driver') && (
        <ProfileMenuSection title={t('profile.menuSections.activity')}>
          {primaryRole === 'driver' && (
            <ProfileMenuItem
              icon="insights"
              iconColor={colors.secondary}
              iconBackground={colors.secondaryGlow}
              label={t('profile.statistics')}
              onPress={() => navigateRoleStack(navigation, 'DriverStack', 'Statistics')}
            />
          )}
          <ProfileMenuItem
            icon="favorite"
            iconColor={colors.favorite}
            iconBackground={`${colors.favorite}18`}
            label={t('profile.favorites')}
            onPress={() => navigateRoot(navigation, 'Favorites')}
          />
          <ProfileMenuItem
            icon="bookmark"
            iconColor={colors.primary}
            iconBackground={colors.primaryGlow}
            label={t('profile.savedSearches')}
            onPress={() => navigateRoot(navigation, 'SavedSearches')}
          />
        </ProfileMenuSection>
      )}

      <ProfileMenuSection title={t('profile.menuSections.trust')}>
        <ProfileMenuItem
          icon="star"
          iconColor={colors.rating}
          iconBackground={`${colors.rating}22`}
          label={t('reviews.allReviews')}
          onPress={() => navigateRoot(navigation, 'ReviewsHistory')}
        />
        <ProfileMenuItem
          icon="report-problem"
          iconColor={colors.warning}
          iconBackground={colors.warningGlow}
          label={t('complaints.historyTitle')}
          onPress={() => navigateRoot(navigation, 'ComplaintsHistory')}
        />
      </ProfileMenuSection>

      {(primaryRole === 'client' || primaryRole === 'driver' || primaryRole === 'dispatcher') && (
        <ProfileMenuSection title={t('profile.menuSections.tools')}>
          <ProfileMenuItem
            icon="link"
            iconColor={colors.info}
            iconBackground={`${colors.info}22`}
            label={t('tracking.publicShare.openLinkTitle')}
            onPress={() => navigateRoot(navigation, 'OpenTrackingLink')}
          />
        </ProfileMenuSection>
      )}

      <ProfileMenuSection title={t('profile.menuSections.settings')}>
        <ProfileMenuItem
          icon="notifications"
          iconColor={colors.primary}
          iconBackground={colors.primaryGlow}
          label={t('notificationSettings.title')}
          onPress={() => navigateRoot(navigation, 'NotificationSettings')}
        />
        {(primaryRole === 'client' || primaryRole === 'driver' || primaryRole === 'dispatcher') && (
          <ProfileMenuItem
            icon="chat"
            iconColor={colors.secondary}
            iconBackground={colors.secondaryGlow}
            label={t('profile.chats')}
            badge={chatUnreadCount > 0 ? (chatUnreadCount > 99 ? '99+' : chatUnreadCount) : undefined}
            onPress={() => navigateMainTab(navigation, 'Chats')}
          />
        )}
        <ProfileMenuItem
          icon="dark-mode"
          iconColor={colors.textSecondary}
          iconBackground={colors.backgroundTertiary}
          label={t('profile.theme')}
          subtitle={themeLabel}
          onPress={cyclePreference}
        />
        <ProfileMenuItem
          icon="language"
          iconColor={colors.textSecondary}
          iconBackground={colors.backgroundTertiary}
          label={t('profile.language')}
          subtitle={languageLabel}
          onPress={() => {
            const languages: Array<'uz' | 'ru' | 'en'> = ['uz', 'ru', 'en'];
            const currentIndex = languages.indexOf(currentLanguage as 'uz' | 'ru' | 'en');
            const nextLanguage = languages[(currentIndex + 1) % languages.length];
            changeLanguage(nextLanguage);
          }}
        />
      </ProfileMenuSection>

      <ProfileMenuSection title={t('profile.menuSections.legal')}>
        <ProfileMenuItem
          icon="article"
          iconColor={colors.textSecondary}
          iconBackground={colors.backgroundTertiary}
          label={t('profile.news')}
          onPress={() => navigateRoot(navigation, 'NewsList')}
        />
        <ProfileMenuItem
          icon="gavel"
          iconColor={colors.textSecondary}
          iconBackground={colors.backgroundTertiary}
          label={t('profile.publicOffer')}
          onPress={() => navigateRoot(navigation, 'Content', { type: 'public-offer' })}
        />
        <ProfileMenuItem
          icon="info"
          iconColor={colors.textSecondary}
          iconBackground={colors.backgroundTertiary}
          label={t('profile.disclaimer')}
          onPress={() => navigateRoot(navigation, 'Content', { type: 'disclaimer' })}
        />
        {primaryRole === 'client' && (
          <ProfileMenuItem
            icon="menu-book"
            iconColor={colors.textSecondary}
            iconBackground={colors.backgroundTertiary}
            label={t('profile.guideClients')}
            onPress={() => navigateRoot(navigation, 'Content', { type: 'guide-clients' })}
          />
        )}
        {primaryRole === 'driver' && (
          <ProfileMenuItem
            icon="menu-book"
            iconColor={colors.textSecondary}
            iconBackground={colors.backgroundTertiary}
            label={t('profile.guideDrivers')}
            onPress={() => navigateRoot(navigation, 'Content', { type: 'guide-drivers' })}
          />
        )}
      </ProfileMenuSection>

      <Button
        title={t('profile.logout')}
        onPress={handleLogout}
        variant="danger"
        style={styles.logoutButton}
      />
    </ScrollView>
    </ScreenBackground>
  );
};

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl + 24,
  },
  inlineBanner: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  inlineBannerSuccess: {
    backgroundColor: colors.successGlow,
    borderWidth: 1,
    borderColor: `${colors.success}55`,
  },
  inlineBannerError: {
    backgroundColor: colors.dangerGlow,
    borderWidth: 1,
    borderColor: `${colors.danger}55`,
  },
  inlineBannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
  },
  subscriptionCard: {
    marginBottom: spacing.lg,
  },
  subscriptionTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subscriptionPlan: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  subscriptionMeta: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  subscriptionInactive: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  trialRemaining: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  trialDisabled: {
    fontSize: fontSize.sm,
    color: colors.warning,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  subscriptionButton: {
    marginTop: spacing.md,
    marginBottom: 0,
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  profileHeroAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 88,
    backgroundColor: colors.primaryGlow,
    opacity: 0.65,
  },
  avatarContainer: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    position: 'relative',
    zIndex: 1,
  },
  avatarFrame: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.round,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.backgroundSecondary,
    ...shadows.md,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.round,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.backgroundSecondary,
    ...shadows.colored(colors.primary),
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  avatarEditBadgeText: {
    color: colors.textLight,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  avatarText: {
    fontSize: fontSize.xxxl,
    fontWeight: fontWeight.extrabold,
    color: colors.textLight,
  },
  name: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
    letterSpacing: 0.3,
  },
  phone: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  email: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    fontWeight: fontWeight.medium,
  },
  ratingContainer: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  ratingLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  ratingStars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.warning,
    marginRight: spacing.xs,
  },
  starIcon: {
    fontSize: fontSize.xl,
  },
  ratingCount: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    fontWeight: fontWeight.medium,
  },
  noRatingText: {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    fontStyle: 'italic',
    fontWeight: fontWeight.medium,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundTertiary,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  badgeActive: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  badgeVerified: {
    backgroundColor: colors.successGlow,
    borderColor: colors.success,
  },
  badgePending: {
    backgroundColor: colors.primaryGlow,
    borderColor: colors.primary,
  },
  badgeRejected: {
    backgroundColor: colors.dangerGlow,
    borderColor: colors.danger,
  },
  badgeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  badgeTextActive: {
    color: colors.primary,
  },
  badgeTextVerified: {
    color: colors.success,
  },
  badgeTextPending: {
    color: colors.primary,
  },
  badgeTextRejected: {
    color: colors.danger,
  },
  editCard: {
    marginBottom: 16,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  saveButton: {
    flex: 1,
    marginBottom: 0,
  },
  cancelButton: {
    flex: 1,
    marginBottom: 0,
  },
  menuCard: {
    marginBottom: spacing.lg,
  },
  roleSwitchCard: {
    marginBottom: spacing.lg,
  },
  menuSectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  roleSwitchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  roleSwitchButton: {
    flex: 1,
    marginBottom: 0,
  },
  complaintsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  complaintsCount: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    flexShrink: 1,
  },
  warningCard: {
    backgroundColor: colors.warningGlow,
    borderColor: `${colors.warning}66`,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  warningTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  warningCardText: {
    fontSize: fontSize.md,
    color: colors.warning,
    lineHeight: 20,
  },
  logoutButton: {
    marginTop: 8,
  },
});

export default ProfileScreen;
