import { useEffect, type ReactNode } from 'react';
import { RouterProvider, matchPath, useRouter } from './lib/router.js';
import { AuthProvider } from './lib/auth.js';
import { Layout } from './components/Layout.js';
import { HomePage } from './pages/Home.js';
import { HotelsPage } from './pages/Hotels.js';
import { HotelDetailPage } from './pages/HotelDetail.js';
import { RoomDetailPage } from './pages/RoomDetail.js';
import { CheckoutPage } from './pages/Checkout.js';
import { ConfirmationPage } from './pages/Confirmation.js';
import { AboutPage, ContactPage, DestinationsPage, OffersPage } from './pages/Static.js';
import { ForgotPasswordPage, RegisterPage, ResetPasswordPage, SignInPage } from './pages/Auth.js';
import { BookingDetailPage, FavoritesPage, MyBookingsPage, ProfilePage } from './pages/account/Account.js';
import { AdminOverviewPage } from './pages/admin/Overview.js';
import { AdminReservationDetailPage, AdminReservationsPage } from './pages/admin/Reservations.js';
import { AdminHotelEditPage, AdminHotelsPage } from './pages/admin/Hotels.js';
import { AdminCustomerDetailPage, AdminCustomersPage, AdminMessagesPage } from './pages/admin/Customers.js';
import { NotFoundPage } from './pages/NotFound.js';

type P = Record<string, string>;
const ROUTES: [string, (p: P) => ReactNode][] = [
  ['/', () => <HomePage />],
  ['/destinations', () => <DestinationsPage />],
  ['/hotels', () => <HotelsPage />],
  ['/hotels/:slug', (p) => <HotelDetailPage slug={p.slug!} />],
  ['/hotels/:slug/rooms/:room', (p) => <RoomDetailPage slug={p.slug!} roomSlug={p.room!} />],
  ['/offers', () => <OffersPage />],
  ['/about', () => <AboutPage />],
  ['/contact', () => <ContactPage />],
  ['/checkout', () => <CheckoutPage />],
  ['/bookings/:code/confirmation', (p) => <ConfirmationPage code={p.code!} />],
  ['/account', () => <MyBookingsPage />],
  ['/account/bookings', () => <MyBookingsPage />],
  ['/account/bookings/:code', (p) => <BookingDetailPage code={p.code!} />],
  ['/account/favorites', () => <FavoritesPage />],
  ['/account/profile', () => <ProfilePage />],
  ['/sign-in', () => <SignInPage />],
  ['/register', () => <RegisterPage />],
  ['/forgot-password', () => <ForgotPasswordPage />],
  ['/reset-password', () => <ResetPasswordPage />],
  ['/admin', () => <AdminOverviewPage />],
  ['/admin/reservations', () => <AdminReservationsPage />],
  ['/admin/reservations/:id', (p) => <AdminReservationDetailPage id={p.id!} />],
  ['/admin/hotels', () => <AdminHotelsPage />],
  ['/admin/hotels/:id', (p) => <AdminHotelEditPage id={p.id!} />],
  ['/admin/customers', () => <AdminCustomersPage />],
  ['/admin/customers/:id', (p) => <AdminCustomerDetailPage id={p.id!} />],
  ['/admin/messages', () => <AdminMessagesPage />],
];

function Routes() {
  const { location } = useRouter();
  // Move focus to <main> on navigation so screen-reader users land on the new page.
  useEffect(() => {
    if (location.hash) { document.getElementById(location.hash.slice(1))?.scrollIntoView(); return; }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [location.pathname, location.hash]);

  for (const [pattern, render] of ROUTES) {
    const params = matchPath(pattern, location.pathname);
    // Keying by pathname resets page state when moving between e.g. two hotels.
    if (params) return <div key={location.pathname} className="route">{render(params)}</div>;
  }
  return <NotFoundPage />;
}

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <Layout><Routes /></Layout>
      </AuthProvider>
    </RouterProvider>
  );
}
