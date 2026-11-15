import { NextResponse, type NextRequest } from "next/server";
import { isLeetCodeProblemSlug } from "@/lib/leetcode";
import { getLeetCodeProblemMetadata } from "@/lib/leetcode/problemMetadata";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const slug =
    typeof body === "object" && body !== null && "slug" in body
      ? body.slug
      : null;
  if (!isLeetCodeProblemSlug(slug)) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 });
  }

  const metadata = await getLeetCodeProblemMetadata(slug);
  if (!metadata) {
    return NextResponse.json(
      { error: "metadata_unavailable" },
      { status: 502 },
    );
  }

  return NextResponse.json(metadata);
}
