'use client';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  loading?: boolean;
  fullWidth?: boolean;
}

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-[0_1px_0_rgba(255,255,255,0.12)_inset]',
  secondary:
    'border border-hairline bg-surface-2 text-neutral-200 hover:border-hairline-strong hover:bg-surface-3',
  subtle: 'text-neutral-300 hover:bg-surface-2 hover:text-neutral-100',
  ghost: 'text-neutral-400 hover:bg-surface-2 hover:text-neutral-100',
  danger:
    'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  fullWidth,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: ButtonProps) {
  const [ripples, setRipples] = useState<
    { id: number; x: number; y: number; size: number }[]
  >([]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // A Material-style ripple that starts where the pointer went down.
    const rect = event.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const id = Date.now() + Math.random();
    setRipples((current) => [
      ...current,
      {
        id,
        x: event.clientX - rect.left - size / 2,
        y: event.clientY - rect.top - size / 2,
        size,
      },
    ]);
    window.setTimeout(() => {
      setRipples((current) => current.filter((ripple) => ripple.id !== id));
    }, 520);
    onClick?.(event);
  };

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={handleClick}
      className={cn(
        'ripple-host press relative inline-flex select-none items-center justify-center',
        'rounded-pill font-medium',
        'transition-colors duration-[--duration-short]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:pointer-events-none disabled:opacity-45',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="ripple-dot"
          style={{
            left: ripple.x,
            top: ripple.y,
            width: ripple.size,
            height: ripple.size,
          }}
        />
      ))}
      {loading ? (
        <Spinner size={size === 'lg' ? 16 : 14} />
      ) : icon ? (
        <span className="material-symbols-rounded" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// IconButton
// ---------------------------------------------------------------------------

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  label: string;
  size?: number;
  active?: boolean;
  tone?: 'default' | 'accent' | 'danger';
}

export function IconButton({
  icon,
  label,
  size = 20,
  active,
  tone = 'default',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        'transition-colors duration-[--duration-short]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:pointer-events-none disabled:opacity-40',
        active
          ? 'bg-accent/15 text-accent'
          : tone === 'accent'
            ? 'text-accent hover:bg-accent/10'
            : tone === 'danger'
              ? 'text-neutral-500 hover:bg-danger/10 hover:text-danger'
              : 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-100',
        className,
      )}
      {...rest}
    >
      <span
        className="material-symbols-rounded"
        style={{ fontSize: size }}
        aria-hidden
      >
        {icon}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Spinner
// ---------------------------------------------------------------------------

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('anim-spin inline-block rounded-full border-2 border-current border-t-transparent', className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  indeterminate?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
  className,
  ariaLabel,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate && !checked ? 'mixed' : checked}
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-2 text-left',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all',
          'duration-[--duration-short]',
          checked || indeterminate
            ? 'border-accent bg-accent text-white'
            : 'border-hairline-strong bg-surface-2 hover:border-neutral-500',
        )}
      >
        {indeterminate && !checked ? (
          <span className="material-symbols-rounded text-[14px]" aria-hidden>
            horizontal_rule
          </span>
        ) : checked ? (
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path className="check-draw" d="M4 12.5 9 17.5 20 6.5" />
          </svg>
        ) : null}
      </span>
      {label ? <span className="text-sm text-neutral-300">{label}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Segmented control
// ---------------------------------------------------------------------------

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: string;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface-2 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill font-medium transition',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]',
              active
                ? 'bg-accent text-white'
                : 'text-neutral-400 hover:bg-surface-3 hover:text-neutral-200',
            )}
          >
            {option.icon ? (
              <span className="material-symbols-rounded text-[16px]" aria-hidden>
                {option.icon}
              </span>
            ) : null}
            {option.label}
            {active ? (
              <span className="material-symbols-rounded text-[14px]" aria-hidden>
                check
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn('flex items-center gap-1 border-b border-hairline', className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-3 py-2 text-sm transition',
              active
                ? 'text-neutral-50'
                : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            {item.icon ? (
              <span className="material-symbols-rounded text-[18px]" aria-hidden>
                {item.icon}
              </span>
            ) : null}
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="rounded-pill bg-surface-3 px-1.5 py-0.5 text-[11px] text-neutral-400">
                {item.count}
              </span>
            ) : null}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip (CSS-only, no dependency)
// ---------------------------------------------------------------------------

export function Tooltip({
  label,
  children,
  side = 'top',
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  } as const;

  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-hairline',
          'bg-surface-3 px-2 py-1 text-xs text-neutral-200 opacity-0 shadow-glow',
          'transition-opacity duration-100 group-hover/tt:opacity-100',
          positions[side],
        )}
      >
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Collapse
// ---------------------------------------------------------------------------

export function Collapse({
  title,
  children,
  defaultOpen = true,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={cn('rounded-xl border border-hairline bg-surface-2', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-neutral-200"
      >
        {title}
        <span
          className={cn(
            'material-symbols-rounded text-[18px] text-neutral-500 transition-transform',
            open ? 'rotate-180' : '',
          )}
          aria-hidden
        >
          expand_more
        </span>
      </button>
      {open ? (
        <div id={id} className="border-t border-hairline px-3 py-2.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast host
// ---------------------------------------------------------------------------

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  tone: 'info' | 'success' | 'error' | 'warning';
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  push: (toast: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue>({
  push: () => undefined,
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const counter = useRef(0);

  const dismiss = (id: string) => {
    setLeaving((current) => new Set(current).add(id));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
      setLeaving((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 200);
  };

  const push = (toast: Omit<ToastMessage, 'id'>) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => dismiss(id), 6000);
  };

  const tones = {
    info: 'border-hairline',
    success: 'border-success/40',
    error: 'border-danger/50',
    warning: 'border-warning/40',
  } as const;

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const isLeaving = leaving.has(toast.id);
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                'pointer-events-auto rounded-xl border bg-surface-2 p-3 shadow-panel',
                tones[toast.tone],
                isLeaving ? 'anim-fade-out' : 'anim-slide-in-right',
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'material-symbols-rounded mt-0.5 text-[18px]',
                    toast.tone === 'error'
                      ? 'text-danger'
                      : toast.tone === 'success'
                        ? 'text-success'
                        : toast.tone === 'warning'
                          ? 'text-warning'
                          : 'text-accent',
                  )}
                  aria-hidden
                >
                  {toast.tone === 'error'
                    ? 'error'
                    : toast.tone === 'success'
                      ? 'check_circle'
                      : toast.tone === 'warning'
                        ? 'warning'
                        : 'info'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-100">
                    {toast.title}
                  </p>
                  {toast.description ? (
                    <p className="mt-0.5 text-[13px] text-neutral-400">
                      {toast.description}
                    </p>
                  ) : null}
                  {toast.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        toast.action?.onClick();
                        dismiss(toast.id);
                      }}
                      className="mt-2 text-[13px] font-medium text-accent hover:text-accent-hover"
                    >
                      {toast.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => dismiss(toast.id)}
                  className="icon-button press -mr-1 -mt-1 h-6 w-6"
                >
                  <span className="material-symbols-rounded text-[16px]" aria-hidden>
                    close
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
