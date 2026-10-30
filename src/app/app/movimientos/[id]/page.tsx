import { requireUser } from "@/lib/session";
import { MovementDetail } from "../movement-detail";

export default async function MovimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  return <MovementDetail id={Number((await params).id)} role={user.role} />;
}
