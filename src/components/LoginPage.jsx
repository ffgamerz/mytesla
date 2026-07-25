import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const { signIn, signUp } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!email || !password) {
            setError('Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        try {
            if (isSignUp) {
                await signUp(email, password);
                setSuccess('Account created! Check your email to confirm.');
            } else {
                await signIn(email, password);
            }
        } catch (err) {
            setError(err.message || 'An error occurred');
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header">
                    <div className="login-logo">
                        <span className="material-symbols-outlined login-logo-icon">bolt</span>
                    </div>
                    <h1>My Tesla Monitor</h1>
                    <p>Sign in to manage your charging</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-message login-error">
                            <span className="material-symbols-outlined msg-icon">error</span>
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="login-message login-success">
                            <span className="material-symbols-outlined msg-icon">check_circle</span>
                            {success}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            type="email"
                            className="form-control-custom"
                            placeholder="your@email.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            type="password"
                            className="form-control-custom"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete={isSignUp ? 'new-password' : 'current-password'}
                        />
                    </div>

                    <button type="submit" className="btn-primary-custom login-btn">
                        <span className="material-symbols-outlined btn-icon">
                            {isSignUp ? 'person_add' : 'login'}
                        </span>
                        {isSignUp ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <div className="login-toggle">
                    <span>{isSignUp ? 'Already have an account?' : "Don't have an account?"}</span>
                    <button
                        className="login-toggle-btn"
                        onClick={() => {
                            setIsSignUp(!isSignUp);
                            setError('');
                            setSuccess('');
                        }}
                    >
                        {isSignUp ? 'Sign In' : 'Create One'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;