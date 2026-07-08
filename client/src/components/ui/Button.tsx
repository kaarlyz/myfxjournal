import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'yellow' | 'ghost' | 'danger' | 'success' | 'blue' | 'dark' | 'profit' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
}

const variantMap: Record<ButtonVariant, string> = {
  primary: 'btn btn-primary',
  secondary: 'btn btn-secondary',
  accent: 'btn btn-accent',
  yellow: 'btn btn-yellow',
  ghost: 'btn btn-ghost',
  danger: 'btn btn-danger',
  success: 'btn btn-success',
  blue: 'btn btn-primary',
  dark: 'btn btn-secondary',
  profit: 'btn btn-accent',
  warning: 'btn btn-yellow',
};

const sizeMap: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', fullWidth, isLoading, className = '', children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          ${variantMap[variant]}
          ${sizeMap[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `.trim()}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <span
              className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
