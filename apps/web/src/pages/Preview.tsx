import { useCallback } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { TaskSidebar } from "../components/TaskSidebar";

type BoardOutlet = {
  onTaskChanged?: () => Promise<void> | void;
};

export function PreviewPage() {
  const { workspaceId = "", taskId = "" } = useParams();
  const { onTaskChanged } = useOutletContext<BoardOutlet>();
  const navigate = useNavigate();
  const onClose = useCallback(() => {
    navigate(`/w/${workspaceId}`);
  }, [navigate, workspaceId]);

  return (
    <TaskSidebar
      workspaceId={workspaceId}
      taskId={taskId}
      onClose={onClose}
      onTaskChanged={onTaskChanged}
      onEdgeDeleted={() => void onTaskChanged?.()}
      onEdgeKindChanged={() => void onTaskChanged?.()}
    />
  );
}
