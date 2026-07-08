import React from 'react';

/* ── Text Input ── */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, wrapperClassName = '', className = '', id, ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
        {label && (
          <label className="input-label" htmlFor={inputId}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`input ${error ? 'border-[var(--loss)] focus:shadow-[4px_4px_0px_0px_var(--loss)]' : ''} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p
            id={`${inputId}-error`}
            className="text-xs font-semibold"
            style={{ color: 'var(--loss)', fontFamily: 'Outfit, sans-serif' }}
            role="alert"
          >
            {error}
          </p>
        )}
        {hint && !error && (
          <p
            id={`${inputId}-hint`}
            className="text-xs"
            style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}
          >
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

/* ── Select ── */
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, wrapperClassName = '', className = '', id, children, ...props }, ref) => {
    const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
        {label && (
          <label className="input-label" htmlFor={selectId}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`input ${error ? 'border-[var(--loss)]' : ''} ${className}`}
          aria-invalid={!!error}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p
            className="text-xs font-semibold"
            style={{ color: 'var(--loss)', fontFamily: 'Outfit, sans-serif' }}
            role="alert"
          >
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

/* ── Textarea ── */
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, wrapperClassName = '', className = '', id, ...props }, ref) => {
    const textareaId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={`flex flex-col gap-1.5 ${wrapperClassName}`}>
        {label && (
          <label className="input-label" htmlFor={textareaId}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`input resize-y min-h-[80px] ${error ? 'border-[var(--loss)]' : ''} ${className}`}
          aria-invalid={!!error}
          {...props}
        />
        {error && (
          <p
            className="text-xs font-semibold"
            style={{ color: 'var(--loss)', fontFamily: 'Outfit, sans-serif' }}
            role="alert"
          >
            {error}
          </p>
        )}
        {hint && !error && (
          <p className="text-xs" style={{ color: 'var(--text-muted)', fontFamily: 'Outfit, sans-serif' }}>
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
