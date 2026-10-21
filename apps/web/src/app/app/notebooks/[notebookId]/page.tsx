import { Workspace } from '@/components/workspace/Workspace';

export const dynamic = 'force-dynamic';

export default function NotebookPage({
  params,
}: {
  params: { notebookId: string };
}) {
  return <Workspace notebookId={params.notebookId} />;
}
