import { NextResponse } from "next/server";
import { canBeBlocked } from "@/lib/flags/blocked";
import { blockUser, canRunFinale } from "@/lib/flags/blockedServer";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

/**
 * Takes no input. Who is blocked comes only from the signed-in session, and only
 * a student account on the finale list can be blocked this way.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const access = await getCurrentApplicationAccess(supabase);
    if (access.status === "unauthenticated") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (access.status !== "allowed" || !canBeBlocked(access.role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!(await canRunFinale(access.user.id))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const ok = await blockUser(access.user.id);
    return ok
      ? NextResponse.json({ blocked: true })
      : NextResponse.json({ error: "unavailable" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
