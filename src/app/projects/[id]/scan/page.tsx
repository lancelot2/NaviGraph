import { ScanWizard } from "@/components/capture/scan-wizard"

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div className="flex h-screen flex-1 flex-col">
      <ScanWizard projectId={id} />
    </div>
  )
}
