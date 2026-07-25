import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ChargingCalculator from './components/ChargingCalculator';
import TeslaSettings from './components/TeslaSettings';
import LoginPage from './components/LoginPage';
import './styles/custom.css';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tesla-proxy`
    : '';

function AppContent() {
    const { user, loading } = useAuth();
    const [page, setPage] = useState('calculator');
    const [teslaStatus, setTeslaStatus] = useState(null);

    // Handle OAuth callback from Tesla redirect
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');
        const error = params.get('error');

        if (error) {
            setTeslaStatus({ type: 'error', text: `Tesla auth failed: ${error}` });
            window.history.replaceState({}, '', window.location.pathname);
        } else if (code && state) {
            // Store callback params for later when user is ready
            window.__tesla_callback = { code, state };
            window.history.replaceState({}, '', '/');
        }
    }, []);

    // Process callback when user is available
    useEffect(() => {
        const cb = window.__tesla_callback;
        if (cb && user && !loading) {
            delete window.__tesla_callback;
            handleCallback(cb.code, cb.state);
        }
    }, [user, loading]);

    const handleCallback = async (code, state) => {

        try {
            const res = await fetch(`${EDGE_FUNCTION_BASE}/callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, state, user_id: user.id }),
            });
            const data = await res.json();

            if (data.success) {
                setTeslaStatus({ type: 'success', text: `Tesla connected! ${data.name || 'Tesla'} linked.` });
                setPage('settings');
            } else {
                setTeslaStatus({ type: 'error', text: data.error || 'Failed to connect Tesla' });
            }
        } catch (e) {
            setTeslaStatus({ type: 'error', text: 'Failed to exchange token: ' + e.message });
        }

        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
    };

    if (loading) {
        return (
            <div className="app-loading">
                <div className="loading-spinner">
                    <span className="material-symbols-outlined">bolt</span>
                </div>
            </div>
        );
    }

    if (!user) {
        // If callback params exist but user not logged in, show login first
        return <LoginPage />;
    }

    if (page === 'settings') {
        return (
            <TeslaSettings
                onBack={() => { setPage('calculator'); setTeslaStatus(null); }}
                initialMessage={teslaStatus}
            />
        );
    }

    return (
        <>
            {teslaStatus && (
                <div className={`tesla-toast ${teslaStatus.type === 'error' ? 'tesla-toast-error' : 'tesla-toast-success'}`}>
                    <span className="material-symbols-outlined">{teslaStatus.type === 'error' ? 'error' : 'check_circle'}</span>
                    {teslaStatus.text}
                    <button className="toast-close" onClick={() => setTeslaStatus(null)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
            )}
            <ChargingCalculator onNavigateSettings={() => setPage('settings')} />
        </>
    );
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;