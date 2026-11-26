import * as React from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { t } from "@/lib/i18n/panel"

interface ConfirmContentProps {
  title: string
  description: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}

function ConfirmContent({ title, description, confirmLabel = t("Delete"), onConfirm }: ConfirmContentProps) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={() => void onConfirm()}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

/** Wraps a trigger element with a destructive confirmation dialog. */
export function ConfirmButton({ children, ...props }: ConfirmContentProps & { children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <ConfirmContent {...props} />
    </AlertDialog>
  )
}

/** The same dialog, opened from state, for triggers that can't wrap it (menu items). */
export function ConfirmDialog({
  open,
  onOpenChange,
  ...props
}: ConfirmContentProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <ConfirmContent {...props} />
    </AlertDialog>
  )
}
