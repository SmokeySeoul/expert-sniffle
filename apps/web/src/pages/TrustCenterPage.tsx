import { useState } from 'react';

// Shared button styles
const buttonBaseStyles = {
  transition: 'all 0.2s ease-out',
};

const buttonFocusStyles = {
  outline: '2px solid #000',
  outlineOffset: '2px',
};

const disabledButtonStyles = {
  opacity: 0.6,
  cursor: 'not-allowed',
};

interface TrustCenterPageProps {
  userSubscriptionCount?: number;
}

function TrustCenterPage({ userSubscriptionCount = 0 }: TrustCenterPageProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    dataPrivacy: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const auditLog = [
    { timestamp: '—', action: 'No actions recorded yet.' },
  ];

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ margin: '0 0 8px 0' }}>Trust Center</h1>
        <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
          Radical transparency. See exactly what data we have and what permissions are enabled.
        </p>
      </div>

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            padding: '20px',
            backgroundColor: '#fafafa',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Data Stored
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>
            {userSubscriptionCount > 0 ? `${userSubscriptionCount} manual` : 'Manual only'}
          </div>
          <div style={{ fontSize: '11px', color: '#ccc', marginTop: '4px' }}>Subscriptions (local)</div>
        </div>

        <div
          style={{
            padding: '20px',
            backgroundColor: '#fafafa',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Data Accessed
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>None</div>
          <div style={{ fontSize: '11px', color: '#ccc', marginTop: '4px' }}>No external sources</div>
        </div>

        <div
          style={{
            padding: '20px',
            backgroundColor: '#fafafa',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            AI Actions
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>None</div>
          <div style={{ fontSize: '11px', color: '#ccc', marginTop: '4px' }}>No AI processing</div>
        </div>

        <div
          style={{
            padding: '20px',
            backgroundColor: '#fafafa',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
            Permissions
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>Local-only</div>
          <div style={{ fontSize: '11px', color: '#ccc', marginTop: '4px' }}>No external access</div>
        </div>
      </div>

      {/* Data & Privacy Section */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => toggleSection('dataPrivacy')}
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: '#fff',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
            textAlign: 'left',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            ...buttonBaseStyles,
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fafafa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
          }}
        >
          <span>Data & Privacy</span>
          <span style={{ fontSize: '20px', color: '#999' }}>
            {expandedSections.dataPrivacy ? '−' : '+'}
          </span>
        </button>

        {expandedSections.dataPrivacy && (
          <div
            style={{
              padding: '20px',
              backgroundColor: '#fafafa',
              border: '1px solid #e8e8e8',
              borderTop: 'none',
              borderBottomLeftRadius: '8px',
              borderBottomRightRadius: '8px',
            }}
          >
            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>What we store</h3>
              <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
                Only subscriptions you manually enter. No bank data. No transaction history. No emails parsed. Everything stays on your device.
              </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>How we use it</h3>
              <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
                We show you an accurate total of your recurring expenses. That's it. No profiling. No targeting. No third-party sharing.
              </p>
            </div>

            <div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600' }}>Encryption</h3>
              <p style={{ margin: 0, color: '#666', fontSize: '14px', lineHeight: '1.5' }}>
                Your data is stored locally in your browser. If you sync (coming later), transport will use standard TLS encryption.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Permissions Section */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => toggleSection('permissions')}
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: '#fff',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
            textAlign: 'left',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            ...buttonBaseStyles,
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fafafa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
          }}
        >
          <span>Permissions</span>
          <span style={{ fontSize: '20px', color: '#999' }}>
            {expandedSections.permissions ? '−' : '+'}
          </span>
        </button>

        {expandedSections.permissions && (
          <div
            style={{
              padding: '20px',
              backgroundColor: '#fafafa',
              border: '1px solid #e8e8e8',
              borderTop: 'none',
              borderBottomLeftRadius: '8px',
              borderBottomRightRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600' }}>Bank connections</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Access to financial accounts</p>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase' }}>
                  ✓ Disabled
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600' }}>Email parsing</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Scanning for subscription emails</p>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase' }}>
                  ✓ Disabled
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600' }}>AI detection</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Automatic subscription discovery</p>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase' }}>
                  ✓ Disabled
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '13px', fontWeight: '600' }}>Analytics</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Usage tracking and telemetry</p>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase' }}>
                  ✓ Disabled
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audit Log Section */}
      <div style={{ marginBottom: '32px' }}>
        <button
          onClick={() => toggleSection('auditLog')}
          style={{
            width: '100%',
            padding: '16px',
            backgroundColor: '#fff',
            border: '1px solid #e8e8e8',
            borderRadius: '8px',
            textAlign: 'left',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            ...buttonBaseStyles,
          }}
          onFocus={(e) => {
            Object.assign(e.currentTarget.style, buttonFocusStyles);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = 'none';
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#fafafa';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
          }}
        >
          <span>Audit Log</span>
          <span style={{ fontSize: '20px', color: '#999' }}>
            {expandedSections.auditLog ? '−' : '+'}
          </span>
        </button>

        {expandedSections.auditLog && (
          <div
            style={{
              padding: '20px',
              backgroundColor: '#fafafa',
              border: '1px solid #e8e8e8',
              borderTop: 'none',
              borderBottomLeftRadius: '8px',
              borderBottomRightRadius: '8px',
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd' }}>
                  <th style={{ padding: '8px 0', textAlign: 'left', color: '#999', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>
                    Timestamp
                  </th>
                  <th style={{ padding: '8px 0', textAlign: 'left', color: '#999', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry, idx) => (
                  <tr key={idx} style={{ borderBottom: idx < auditLog.length - 1 ? '1px solid #eee' : 'none' }}>
                    <td style={{ padding: '8px 0', color: '#999' }}>{entry.timestamp}</td>
                    <td style={{ padding: '8px 0', color: '#666' }}>{entry.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actions Section */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>Next Steps</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div
            style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600' }}>Connect bank</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Not available in Calm MVP. We're designing this carefully to keep you in control.</p>
            </div>
            <button
              disabled
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '500',
                backgroundColor: '#e0e0e0',
                color: '#999',
                border: 'none',
                borderRadius: '6px',

                whiteSpace: 'nowrap',
                marginLeft: '16px',
                ...disabledButtonStyles,
              }}
            >
              Coming later
            </button>
          </div>

          <div
            style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600' }}>Export data</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Coming later. You'll be able to download your subscriptions as CSV.</p>
            </div>
            <button
              disabled
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '500',
                backgroundColor: '#e0e0e0',
                color: '#999',
                border: 'none',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
                marginLeft: '16px',
                ...disabledButtonStyles,
              }}
            >
              Coming later
            </button>
          </div>

          <div
            style={{
              padding: '16px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '600' }}>Delete account</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>Coming later. Securely delete all your data from our systems.</p>
            </div>
            <button
              disabled
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '500',
                backgroundColor: '#e0e0e0',
                color: '#999',
                border: 'none',
                borderRadius: '6px',
                whiteSpace: 'nowrap',
                marginLeft: '16px',
                ...disabledButtonStyles,
              }}
            >
              Coming later
            </button>
          </div>
        </div>
      </div>

      {/* Trust Statement */}
      <div
        style={{
          padding: '20px',
          backgroundColor: '#fafafa',
          border: '1px solid #e8e8e8',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#666',
          lineHeight: '1.6',
        }}
      >
        <p style={{ margin: '0 0 12px 0' }}>
          <strong>Why are you seeing this?</strong>
        </p>
        <p style={{ margin: 0 }}>
          You're in control. We don't hide our architecture behind marketing language. No AI surprises. No surprise data sharing. No dark patterns. 
          If we add a feature later, it will be opt-in and clearly explained here.
        </p>
      </div>
    </div>
  );
}

export default TrustCenterPage;
