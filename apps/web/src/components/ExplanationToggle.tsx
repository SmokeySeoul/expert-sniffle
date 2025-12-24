import React from 'react';

interface ExplanationToggleProps {
  id: string;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
  /** Optional custom button text. Defaults to "Why am I seeing this?" */
  buttonText?: string;
}

/**
 * Reusable component for optional, educational explanations.
 * 
 * Used throughout the app to provide calm, trust-focused context
 * for data, subscriptions, and recommendations. Never framed as AI authority.
 * 
 * Collapsed by default to keep UI calm and uncluttered.
 */
export const ExplanationToggle: React.FC<ExplanationToggleProps> = ({
  id,
  isExpanded,
  onToggle,
  children,
  buttonText = 'Why am I seeing this?',
}) => {
  const buttonBaseStyles = {
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#0066cc',
    fontSize: '13px',
    cursor: 'pointer',
    textDecoration: 'underline',
    fontFamily: 'inherit',
    transition: 'color 0.2s ease-out',
  };

  const buttonFocusStyles = {
    outline: '2px solid #0066cc',
    outlineOffset: '1px',
  };

  return (
    <div>
      <button
        onClick={() => onToggle(id)}
        style={buttonBaseStyles}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#004499';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#0066cc';
        }}
        onFocus={(e) => {
          Object.assign(e.currentTarget.style, buttonFocusStyles);
        }}
        onBlur={(e) => {
          e.currentTarget.style.outline = 'none';
        }}
      >
        {buttonText}
      </button>
      {isExpanded && (
        <div
          style={{
            marginTop: '8px',
            padding: '8px 0',
            borderTop: '1px solid #e8e8e8',
            paddingTop: '8px',
            fontSize: '13px',
            color: '#666',
            lineHeight: '1.5',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
