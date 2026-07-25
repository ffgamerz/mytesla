import { createContext, useContext, useState, useEffect } from 'react';
import supabase from '../../supabase/client';
import { getLocations, saveLocation } from '../../supabase/client';

const DEFAULT_LOCATIONS = [
    { name: 'Home', rate: 0.38, voltage: 240, max_amps: 32, icon: 'home' },
    { name: 'Office', rate: 0.45, voltage: 240, max_amps: 32, icon: 'business' },
    { name: 'Supercharger', rate: 1.20, voltage: 480, max_amps: 500, icon: 'bolt' },
    { name: 'Public AC', rate: 0.60, voltage: 240, max_amps: 32, icon: 'location_on' },
];

const AuthContext = createContext(null);

async function seedDefaultLocations(userId) {
    try {
        // Check if user already has locations
        const existing = await getLocations(userId);
        if (existing.length > 0) return; // Already has locations

        // Insert default locations
        for (const loc of DEFAULT_LOCATIONS) {
            await saveLocation(userId, loc);
        }
    } catch (e) {
        console.error('Failed to seed default locations:', e);
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => {
            const u = session?.user ?? null;
            setUser(u);
            if (u) seedDefaultLocations(u.id);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const u = session?.user ?? null;
            setUser(u);
            if (u) seedDefaultLocations(u.id);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (error) throw error;
        return data;
    };

    const signUp = async (email, password) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        if (error) throw error;
        return data;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            signIn,
            signUp,
            signOut,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

export default AuthContext;