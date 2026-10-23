"use client";

import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  busy: boolean;
  onConfirm: () => void;
}

export function DeleteDialog({
  open,
  onOpenChange,
  title,
  busy,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="delete-dialog">
        <DialogHeader>
          <DialogTitle>Delete chat thread?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete &ldquo;{title || "this chat"}&rdquo;? All messages, versions, and deliberation history in this thread will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="delete-dialog-actions">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            <Trash2 size={14} /> Delete thread
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
