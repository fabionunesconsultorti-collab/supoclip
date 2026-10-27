import { NextResponse } from "next/server";

import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

async function requireSession() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}

export async function GET() {
  const check = await requireSession();
  if (check.error) {
    return check.error;
  }

  const upstream = await fetchBackend("/admin/runtime-settings", {
    method: "GET",
    userId: check.session.user.id,
    cache: "no-store",
  });

  return createTextProxyResponse(upstream);
}

export async function PATCH(request: Request) {
  const check = await requireSession();
  if (check.error) {
    return check.error;
  }

  const body = await request.text();
  const upstream = await fetchBackend("/admin/runtime-settings", {
    method: "PATCH",
    userId: check.session.user.id,
    extraHeaders: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });

  return createTextProxyResponse(upstream);
}
