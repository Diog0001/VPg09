import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { Dialog } from "./ui";

type DeleteTaskDialogProps = {
  task: { id: string; title: string } | null;
  open: boolean;
  onClose: () => void;
  onDeleted: (taskId: string) => void;
};

export function DeleteTaskDialog({ task, open, onClose, onDeleted }: DeleteTaskDialogProps) {
  const [warning, setWarning] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setWarning("");
      setForce(false);
      setBusy(false);
    }
  }, [open, task?.id]);

  async function confirm() {
    if (!task) {
      return;
    }
    setBusy(true);
    try {
      await api.deleteTask(task.id, force);
      onDeleted(task.id);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setWarning(err.message);
        setForce(true);
        setBusy(false);
        return;
      }
      setWarning(err instanceof Error ? err.message : "Не удалось удалить задачу");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      danger
      title="Удалить задачу"
      primaryLabel={force ? "Удалить вместе со связями" : "Удалить"}
      primaryDisabled={!task || busy}
      onClose={onClose}
      onPrimary={() => void confirm()}
    >
      {task ? (
        <p>
          Задача «{task.title}» исчезнет с доски и из конструктора. Связи этой задачи тоже удалятся.
        </p>
      ) : null}
      {warning ? <p className="vyaz-error">{warning}</p> : null}
    </Dialog>
  );
}
