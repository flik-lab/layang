"use client";

import { Slot } from "@radix-ui/react-slot";
import { X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type DialogHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("Dialog components must be used inside Dialog");
  return context;
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, defaultOpen = false, onOpenChange, children }: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const generatedId = useId();
  const resolvedOpen = open ?? internalOpen;
  const value = useMemo<DialogContextValue>(
    () => ({
      open: resolvedOpen,
      titleId: `${generatedId}-title`,
      descriptionId: `${generatedId}-description`,
      setOpen: (nextOpen) => {
        if (open === undefined) setInternalOpen(nextOpen);
        onOpenChange?.(nextOpen);
      },
    }),
    [generatedId, onOpenChange, open, resolvedOpen],
  );
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export interface DialogTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const DialogTrigger = forwardRef<HTMLButtonElement, DialogTriggerProps>(function DialogTrigger(
  { asChild = false, onClick, type, ...props },
  ref,
) {
  const { setOpen } = useDialogContext();
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      data-slot="dialog-trigger"
      type={asChild ? undefined : (type ?? "button")}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      }}
      {...props}
    />
  );
});

export interface DialogContentProps extends DialogHTMLAttributes<HTMLDialogElement> {
  showCloseButton?: boolean;
}

export const DialogContent = forwardRef<HTMLDialogElement, DialogContentProps>(function DialogContent(
  { className, children, showCloseButton = true, onCancel, onClose, onClick, ...props },
  forwardedRef,
) {
  const { open, setOpen, titleId, descriptionId } = useDialogContext();
  const localRef = useRef<HTMLDialogElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const dialog = localRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={(node) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      data-slot="dialog-content"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={cn(
        "m-auto max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-lg border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-background/75 backdrop:backdrop-blur-sm open:flex open:flex-col",
        className,
      )}
      onCancel={(event) => {
        onCancel?.(event);
        if (!event.defaultPrevented) {
          event.preventDefault();
          setOpen(false);
        }
      }}
      onClose={(event) => {
        onClose?.(event);
        if (open) setOpen(false);
      }}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && event.target === event.currentTarget) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
        }
      }}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close dialog"
          className="absolute right-2 top-2"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </dialog>,
    document.body,
  );
});

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 border-b border-border px-4 py-3", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex justify-end gap-2 border-t border-border px-4 py-3", className)}
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="dialog-body" className={cn("min-h-0 flex-1 overflow-auto px-4 py-3", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useDialogContext();
  return (
    <h2
      id={titleId}
      data-slot="dialog-title"
      className={cn("text-[length:var(--font-size-dialog-title)] font-semibold leading-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = useDialogContext();
  return (
    <p
      id={descriptionId}
      data-slot="dialog-description"
      className={cn("text-[length:var(--font-size-caption)] font-normal text-muted-foreground", className)}
      {...props}
    />
  );
}

export interface DialogCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(function DialogClose(
  { asChild = false, onClick, type, ...props },
  ref,
) {
  const { setOpen } = useDialogContext();
  const Component = asChild ? Slot : "button";
  return (
    <Component
      ref={ref}
      data-slot="dialog-close"
      type={asChild ? undefined : (type ?? "button")}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      {...props}
    />
  );
});
