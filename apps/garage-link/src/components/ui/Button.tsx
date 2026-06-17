import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

type BaseButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
};

type ButtonProps = BaseButtonProps & ButtonHTMLAttributes<HTMLButtonElement>;

type ButtonLinkProps = BaseButtonProps & {
  href: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white shadow-sm hover:bg-blue-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50',
  success: 'bg-green-600 text-white shadow-sm hover:bg-green-700',
  danger: 'border border-red-200 bg-red-50 text-red-700 shadow-sm hover:bg-red-100',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950',
};

const baseClass =
  'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60';

export function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`${baseClass} ${variantClasses[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = 'secondary',
  className = '',
}: ButtonLinkProps) {
  return (
    <Link href={href} className={`${baseClass} ${variantClasses[variant]} ${className}`}>
      {children}
    </Link>
  );
}
