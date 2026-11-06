import { useLayoutEffect, useRef, type ComponentProps } from 'react';

type DialogProps = Omit<ComponentProps<'dialog'>, 'open' | 'onCancel' | 'onClose'> & {
  open: boolean;
  onDismiss: () => void;
};

export function Dialog({ open, onDismiss, ...props }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  return <dialog
    {...props}
    ref={ref}
    onCancel={event => {
      event.preventDefault();
      onDismiss();
    }}
  />;
}
