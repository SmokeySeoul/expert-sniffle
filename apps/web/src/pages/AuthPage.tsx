import { useState } from 'react';
import { ExplanationToggle } from '../components/ExplanationToggle';

type AuthMode = 'login' | 'signup';

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const toggleExplanation = (id: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // UI only - no actual authentication
    console.log('Form submitted:', { email, password, mode });
  };

  const buttonBaseStyles = {
    transition: 'all 0.2s ease-out',
  };

  const buttonFocusStyles = {
    outline: '2px solid #000',
    outlineOffset: '2px',
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: '600' }}>Substream</h1>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>Your subscriptions, your control.</p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', backgroundColor: '#f5f5f5', padding: '4px', borderRadius: '6px' }}>
        <button
          onClick={() => setMode('login')}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            backgroundColor: mode === 'login' ? '#fff' : 'transparent',
            color: mode === 'login' ? '#000' : '#999',
            transition: 'all 0.2s ease-out',
          }}
          onMouseEnter={(e) => {
            if (mode !== 'login') e.currentTarget.style.color = '#333';
          }}
          onMouseLeave={(e) => {
            if (mode !== 'login') e.currentTarget.style.color = '#999';
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          Log in
        </button>
        <button
          onClick={() => setMode('signup')}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            backgroundColor: mode === 'signup' ? '#fff' : 'transparent',
            color: mode === 'signup' ? '#000' : '#999',
            transition: 'all 0.2s ease-out',
          }}
          onMouseEnter={(e) => {
            if (mode !== 'signup') e.currentTarget.style.color = '#333';
          }}
          onMouseLeave={(e) => {
            if (mode !== 'signup') e.currentTarget.style.color = '#999';
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          Sign up
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
        {/* Email Field */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: '1px solid #e8e8e8',
              borderRadius: '6px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s ease-out, box-shadow 0.2s ease-out',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#000';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e8e8e8';
              e.currentTarget.style.boxShadow = 'none';
            }}
            placeholder={mode === 'login' ? 'your@email.com' : 'your@email.com'}
          />
          <div style={{ marginTop: '12px' }}>
            <ExplanationToggle
              id="email-explanation"
              isExpanded={expandedExplanations['email-explanation'] || false}
              onToggle={toggleExplanation}
              buttonText="Why do you need this?"
            >
              <p style={{ margin: 0, lineHeight: '1.5' }}>
                We use your email to:
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '13px' }}>
                  <li>Log you in securely</li>
                  <li>Send password resets (only if you ask)</li>
                  <li>Keep your data private to your account</li>
                </ul>
                We never sell your email or use it for marketing.
              </p>
            </ExplanationToggle>
          </div>
        </div>

        {/* Password Field */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }} htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              border: '1px solid #e8e8e8',
              borderRadius: '6px',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              transition: 'border-color 0.2s ease-out, box-shadow 0.2s ease-out',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#000';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 0, 0, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#e8e8e8';
              e.currentTarget.style.boxShadow = 'none';
            }}
            placeholder={mode === 'login' ? 'Your secure password' : 'Create a strong password'}
          />
          <div style={{ marginTop: '12px' }}>
            <ExplanationToggle
              id="password-explanation"
              isExpanded={expandedExplanations['password-explanation'] || false}
              onToggle={toggleExplanation}
              buttonText="Why do you need this?"
            >
              <p style={{ margin: 0, lineHeight: '1.5' }}>
                Your password:
                <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', fontSize: '13px' }}>
                  <li>Never leaves your device in plain text</li>
                  <li>Is hashed on our server (we can't read it)</li>
                  <li>Protects your subscription data from unauthorized access</li>
                </ul>
              </p>
            </ExplanationToggle>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: '#000',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            ...buttonBaseStyles,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#222';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#000';
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
        >
          {mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>

      {/* Trust Statements */}
      <div style={{ padding: '20px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid #e8e8e8', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>Your data is yours.</h3>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.6', color: '#666' }}>
          <li><strong>No bank connections.</strong> We never ask for bank credentials or API access. Subscriptions are manual.</li>
          <li><strong>No AI actions.</strong> We don't use your data for training, analysis, or recommendations. No algorithms watching you.</li>
          <li><strong>Delete anytime.</strong> You can permanently delete your account and all data with one click. No questions asked.</li>
          <li><strong>No tracking.</strong> No analytics, session tracking, or pixels. We don't know how you use the app.</li>
        </ul>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: '12px', color: '#999', lineHeight: '1.5' }}>
        <p style={{ margin: 0 }}>
          By {mode === 'login' ? 'logging in' : 'signing up'}, you agree to our{' '}
          <a href="#" style={{ color: '#0066cc', textDecoration: 'none', borderBottom: '1px solid #0066cc' }}>
            Privacy Policy
          </a>
          .
        </p>
        <p style={{ margin: '8px 0 0 0' }}>
          <a href="/trust-center" style={{ color: '#0066cc', textDecoration: 'none', borderBottom: '1px solid #0066cc' }}>
            See our Trust Center
          </a>
          {' '}for radical transparency.
        </p>
      </div>
    </div>
  );
}
