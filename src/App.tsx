import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ToastProvider, useToastContext } from './contexts/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { OwnerRoute } from './components/OwnerRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MobileTopNav } from './components/MobileTopNav';
import { BottomNav } from './components/BottomNav';
import { Loading } from './components/Loading';
import { OfflineIndicator } from './components/OfflineIndicator';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { Invoices } from './pages/Invoices';
import { Clients } from './pages/Clients';
import { Account } from './pages/Account';
import { Paywall } from './pages/Paywall';
import { Language } from './pages/Language';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';
import Settings from './pages/Settings';
import Receipts from './pages/Receipts';
import { initSyncManager, onSyncFlush } from './lib/syncManager';
import { supabase } from './lib/supabase';

const InvoiceForm = lazy(() =>
  import('./pages/InvoiceForm').then((module) => ({ default: module.InvoiceForm }))
);
const InvoiceView = lazy(() =>
  import('./pages/InvoiceView').then((module) => ({ default: module.InvoiceView }))
);
const ClientForm = lazy(() =>
  import('./pages/ClientForm').then((module) => ({ default: module.ClientForm }))
);
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const Onboarding = lazy(() =>
  import('./pages/Onboarding').then((module) => ({ default: module.Onboarding }))
);
const ClientInvoices = lazy(() =>
  import('./pages/ClientInvoices').then((module) => ({ default: module.ClientInvoices }))
);
const ReceiptForm = lazy(() => import('./pages/ReceiptForm'));
const PdfCreator = lazy(() => import('./pages/PdfCreator'));
const ScanReceipt = lazy(() => import('./pages/ScanReceipt'));
const Prices = lazy(() => import('./pages/Prices'));
const Calculator = lazy(() => import('./pages/Calculator'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Payments = lazy(() => import('./pages/Payments'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/ProjectDetail'));
const Owner = lazy(() => import('./pages/Owner'));
const Contact = lazy(() => import('./pages/Contact'));
const Chat = lazy(() => import('./pages/Chat'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (failureCount) => {
        if (!navigator.onLine) return false;
        return failureCount < 2;
      },
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

function SyncInit() {
  const { showSuccess } = useToastContext();

  useEffect(() => {
    onSyncFlush((count) => {
      showSuccess(`${count} ${count === 1 ? 'зміну синхронізовано' : 'змін синхронізовано'}`);
      queryClient.invalidateQueries();
    });

    initSyncManager();
  }, [showSuccess]);

  return null;
}

function RootPage() {
  const [loading, setLoading] = React.useState(true);
  const [authenticated, setAuthenticated] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthenticated(!!data.session);
      setLoading(false);
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthenticated(!!session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cpc-bg)' }}>
        <div className="text-xl" style={{ color: 'var(--cpc-text)' }}>Завантаження...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <Landing />;
  }

  return (
    <>
      <MobileTopNav />
      <div className="pt-14 pb-32">
        <Home />
      </div>
      <BottomNav />
    </>
  );
}

function AppContent() {
  const location = useLocation();
  const { language } = useLanguage();

  const isPublicAuthPage =
    location.pathname === '/login' ||
    location.pathname === '/signup' ||
    location.pathname === '/onboarding' ||
    location.pathname === '/privacy' ||
    location.pathname === '/terms';

  const isRoot = location.pathname === '/';
  const hideChrome =
    isPublicAuthPage ||
    location.pathname === '/pdf-creator' ||
    isRoot;

  const showAppChrome = !hideChrome;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: 'var(--cpc-page)' }} key={language}>
      <SyncInit />
      <OfflineIndicator />

      {showAppChrome && (
        <ProtectedRoute>
          <>
            <MobileTopNav />
            <BottomNav />
          </>
        </ProtectedRoute>
      )}

      <div className={showAppChrome ? 'pt-14 pb-32 print:pt-0 print:pb-0' : ''}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/" element={<RootPage />} />

            <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
            <Route path="/invoices/new" element={<ProtectedRoute><InvoiceForm /></ProtectedRoute>} />
            <Route path="/invoices/:id/edit" element={<ProtectedRoute><InvoiceForm /></ProtectedRoute>} />
            <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceForm /></ProtectedRoute>} />
            <Route path="/invoices/:id/view" element={<ProtectedRoute><InvoiceView /></ProtectedRoute>} />
            <Route path="/invoices/:id/preview" element={<ProtectedRoute><InvoiceView /></ProtectedRoute>} />

            <Route path="/clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="/clients/new" element={<ProtectedRoute><ClientForm /></ProtectedRoute>} />
            <Route path="/clients/:id/edit" element={<ProtectedRoute><ClientForm /></ProtectedRoute>} />
            <Route path="/clients/:id/invoices" element={<ProtectedRoute><ClientInvoices /></ProtectedRoute>} />
            <Route path="/clients/:id" element={<ProtectedRoute><ClientDetail /></ProtectedRoute>} />

            <Route path="/receipts" element={<ProtectedRoute><Receipts /></ProtectedRoute>} />
            <Route path="/scan" element={<ProtectedRoute><ScanReceipt /></ProtectedRoute>} />
            <Route path="/scanner" element={<Navigate to="/scan" replace />} />
            <Route path="/receipt/:id" element={<ProtectedRoute><ReceiptForm /></ProtectedRoute>} />
            <Route path="/pdf-creator" element={<ProtectedRoute><PdfCreator /></ProtectedRoute>} />
            <Route path="/prices" element={<ProtectedRoute><Prices /></ProtectedRoute>} />
            <Route path="/calculator" element={<ProtectedRoute><Calculator /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
            <Route path="/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
            <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
            <Route path="/contact" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
            <Route path="/community" element={<Navigate to="/chat" replace />} />
            <Route
              path="/owner"
              element={
                <ProtectedRoute>
                  <OwnerRoute>
                    <Owner />
                  </OwnerRoute>
                </ProtectedRoute>
              }
            />

            <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
            <Route path="/language" element={<ProtectedRoute><Language /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/paywall" element={<ProtectedRoute><Paywall /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ErrorBoundary>
          <ToastProvider>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </ToastProvider>
        </ErrorBoundary>
      </LanguageProvider>
    </QueryClientProvider>
  );
}