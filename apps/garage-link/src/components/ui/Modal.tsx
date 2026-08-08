'use client';

import { createPortal } from 'react-dom';
import { type ReactNode, type RefObject, useEffect, useId, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  dialogClassName?: string;
};

export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  initialFocusRef,
  dialogClassName = 'max-w-xl',
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    previouslyFocusedElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const modalLayer = dialogRef.current.parentElement;
    const background = Array.from(document.body.children).filter((element) => element !== modalLayer);
    const priorBackgroundState = background.map((element) => ({
      element: element as HTMLElement,
      inert: (element as HTMLElement).inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }));
    for (const element of background) {
      (element as HTMLElement).inert = true;
      element.setAttribute('aria-hidden', 'true');
    }

    const focusInitial = window.requestAnimationFrame(() => {
      (initialFocusRef?.current ?? closeRef.current)?.focus();
    });
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusInitial);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      for (const state of priorBackgroundState) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) state.element.removeAttribute('aria-hidden');
        else state.element.setAttribute('aria-hidden', state.ariaHidden);
      }
      previouslyFocusedElement.current?.focus();
    };
  }, [initialFocusRef, onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal-backdrop)] flex items-center justify-center p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] [padding-top:max(1rem,env(safe-area-inset-top))]"
      data-modal-layer="true"
    >
      <button type="button" aria-label={`${title}を閉じる`} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`relative z-[var(--z-modal-dialog)] flex max-h-[calc(100dvh-32px)] w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl ${dialogClassName}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-black text-slate-950">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-100" aria-label="閉じる">×</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
