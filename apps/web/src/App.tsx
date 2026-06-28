import { Suspense, lazy } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
// Eager: shipped on first paint. FeedPage is "/" so users land here; AuthPage
// has to be reachable when unauthenticated and is cheap. Everything else is
// lazy so first-load JS doesn't drag in all 17 pages.
import FeedPage from './pages/FeedPage';
import AuthPage from './pages/AuthPage';
const UploadPage = lazy(() => import('./pages/UploadPage'));
const TutorPage = lazy(() => import('./pages/TutorPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ChapterHubPage = lazy(() => import('./pages/ChapterHubPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const ChallengePage = lazy(() => import('./pages/ChallengePage'));
const ActivityFeedPage = lazy(() => import('./pages/ActivityFeedPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const BadgesPage = lazy(() => import('./pages/BadgesPage'));
const PrivacySettingsPage = lazy(() => import('./pages/PrivacySettingsPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
import { TopHud } from '@/components/gamify/TopHud';
import { AchievementToast } from '@/components/gamify/AchievementToast';
import { SideNav } from '@/components/chrome/SideNav';
import { TopBar } from '@/components/chrome/TopBar';
import { BottomNav } from '@/components/chrome/BottomNav';
import { LoadingScreen } from '@/components/chrome/LoadingScreen';
import { ToastHost } from '@/components/social/ToastHost';
import { useSocialBootstrap } from '@/lib/social';
import '@/lib/notifications';

// Chrome layout:
//   ┌──────────┬──────────────────────────────┐
//   │          │  TopBar (search + bell)      │  ← sticky
//   │  SideNav ├──────────────────────────────┤
//   │  (md+)   │  <Routes />                  │  ← page content
//   │          ├──────────────────────────────┤
//   │          │  BottomNav (mobile only)     │
//   └──────────┴──────────────────────────────┘
//
// On full-screen surfaces (the reel FeedPage), the page itself fills the
// viewport and the TopBar floats over it. On other pages, TopBar is a normal
// flow header sitting above the page content.
//
// Theme: handled globally — the `.dark` class is applied to <html> by
// src/lib/theme.ts based on the user's preference (light / dark / system).
// All semantic tokens (bg-surface, text-on-surface, etc.) resolve via CSS
// variables and adapt automatically, so no per-route override lives here.

export default function App() {
  const { pathname } = useLocation();
  const isAuthRoute = pathname.startsWith('/auth');
  const showChrome = !isAuthRoute;
  useSocialBootstrap();

  return (
    <div className="min-h-dvh bg-background text-on-background">
      {showChrome && <TopHud /* gamify state bootstrap, renders nothing */ />}
      {showChrome && <SideNav />}
      <div className={showChrome ? 'md:ml-64' : ''}>
        {showChrome && <TopBar />}
        <main className={showChrome ? 'pb-20 md:pb-0' : ''}>

          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<FeedPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/tutor" element={<TutorPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/doc/:id" element={<ChapterHubPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/profile/me" element={<ProfilePage />} />
              <Route path="/u/:username" element={<ProfilePage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/challenge" element={<ChallengePage />} />
              <Route path="/activity" element={<ActivityFeedPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="/badges" element={<BadgesPage />} />
              <Route path="/settings/privacy" element={<PrivacySettingsPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/auth/reset" element={<ResetPasswordPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <AchievementToast />
      {showChrome && <ToastHost />}
      {showChrome && <BottomNav />}
    </div>
  );
}

function RouteFallback() {
  return <LoadingScreen />;
}
