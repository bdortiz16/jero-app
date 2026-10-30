import { requireUser } from "@/lib/session";
import { InvoiceDetail } from "../invoice-detail";

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  return <InvoiceDetail id={Number((await params).id)} />;
}
