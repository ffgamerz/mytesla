import { createContext, useContext, useState, useEffect, useRef } from 'react';
import supabase from '../../supabase/client';
import { saveLocation } from '../../supabase/client';
import { getLocations } from '../../supabase/client';

const DEFAULT_NAMES = ['Home', 'Office', 'Supercharger', 'Public AC'];

const DEFAULT_LOCATIONS = [
    { name: 'Home', rate: 0.38, voltage: 240, max_amps: 32, icon: 'home' },
    { name: 'Office', rate: 0.45, voltage: 240, max_amps: 32, icon: 'business' },
    { name: 'Supercharger', rate: 1.20, voltage: 480, max_amps: 500, icon: 'bolt' },
    { name: 'Public AC', rate: 0.60, voltage: 240, max_amps: 32, icon: 'location_on' },
];

const AuthContext = createContext(null);

// Track seeding per user to prevent double inserts from parallel calls
const seedingInProgress = new Set();

async function seedDefaultLocations(userId) {
    // Guard: prevent duplicate runs
    if (seedingInProgress.has(userId)) return;
    seedingInProgress.add(userId);

    try {
        // Check if default locations already exist by name
        const existing = await getLocations(userId);
        const existingNames = new Set(existing.map(l => l.name));

        const needsSeeding = DEFAULT_NAMES.some(name => !existingNames.has(name));
        if (!needsSeeding) return;

        // Only insert missing ones
        for (const loc of DEFAULT_LOCATIONS) {
            if (!existingNames.has(loc.name)) {
                await saveLocation(userId, loc);
            }
        }
    } catch (e) {
        console.error('Failed to seed default locations:', e);
    } finally {
        seedingInProgress.delete(userId);
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const seededRef = useRef(false);

    useEffect(() => {
        // Only run seed once from getSession
        supabase.auth.getSession().then(({ data: { session } }) => {
            const u = session?.user ?? null;
            setUser(u);
            setLoading(false);

            if (u && !seededRef.current) {
                seededRef.current = true;
                seedDefaultLocations(u.id);
            }
        });

        // Listen for auth changes - just update user state, don't seed here
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const u = session?.user ?? null;
            setUser(u);
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