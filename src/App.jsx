import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ChargingCalculator from './components/ChargingCalculator';
import LoginPage from './components/LoginPage';
import './styles/custom.css';

function AppContent() {
    const { user, loading } = useAuth();

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
        return <LoginPage />;
    }

    return <ChargingCalculator />;
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;