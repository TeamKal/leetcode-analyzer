"use server";

import type { User } from "@supabase/supabase-js";
import { createAuthAdminClient } from "@/lib/supabase/admin";
import { getCurrentApplicationAccess } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";

const USERS_PER_PAGE = 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

async function getAdminContext(): Promise<AdminContext | null> {
  try {
    const supabase = await createClient();
    const access = await getCurrentApplicationAccess(supabase);

    if (access.status !== "allowed" || access.role !== "admin") {
      return null;
    }

    return { supabase, userId: access.user.id };
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

function getConfirmedGoogleEmail(user: User) {
  if (!user.email_confirmed_at) return null;

  const email = normalizeEmail(user.email);
  if (!email) return null;

  const hasMatchingGoogleIdentity = user.identities?.some(
    (identity) =>
      identity.provider === "google" &&
      normalizeEmail(identity.identity_data?.email) === email,
  );

  return hasMatchingGoogleIdentity ? email : null;
}

export async function findMentorCandidate(googleEmail: unknown) {
  const adminContext = await getAdminContext();
  if (!adminContext)
    return { ok: false as const, error: "unauthorized" as const };

  const normalizedEmail = normalizeEmail(googleEmail);
  if (!normalizedEmail) {
    return { ok: false as const, error: "invalid_email" as const };
  }

  try {
    const authAdmin = createAuthAdminClient();

    for (let page = 1; ; page += 1) {
      const { data, error } = await authAdmin.auth.admin.listUsers({
        page,
        perPage: USERS_PER_PAGE,
      });

      if (error) {
        return {
          ok: false as const,
          error: "candidate_lookup_failed" as const,
        };
      }

      const candidate = data.users.find(
        (user) =>
          Boolean(user.email_confirmed_at) &&
          normalizeEmail(user.email) === normalizedEmail,
      );

      if (candidate) {
        const { data: candidateResult, error: candidateError } =
          await authAdmin.auth.admin.getUserById(candidate.id);

        if (candidateError) {
          return {
            ok: false as const,
            error: "candidate_lookup_failed" as const,
          };
        }

        if (
          candidateResult.user &&
          getConfirmedGoogleEmail(candidateResult.user) === normalizedEmail
        ) {
          return {
            ok: true as const,
            candidate: { userId: candidate.id, email: normalizedEmail },
          };
        }
      }

      if (data.users.length < USERS_PER_PAGE) break;
    }

    return { ok: false as const, error: "candidate_not_found" as const };
  } catch {
    return { ok: false as const, error: "candidate_lookup_failed" as const };
  }
}

export async function provisionMentor(input: unknown) {
  const adminContext = await getAdminContext();
  if (!adminContext)
    return { ok: false as const, error: "unauthorized" as const };

  if (typeof input !== "object" || input === null) {
    return { ok: false as const, error: "invalid_input" as const };
  }

  const { classId, candidateUserId } = input as {
    classId?: unknown;
    candidateUserId?: unknown;
  };
  if (
    typeof classId !== "string" ||
    !UUID_PATTERN.test(classId) ||
    typeof candidateUserId !== "string" ||
    !UUID_PATTERN.test(candidateUserId)
  ) {
    return { ok: false as const, error: "invalid_input" as const };
  }
  if (candidateUserId === adminContext.userId) {
    return { ok: false as const, error: "invalid_candidate" as const };
  }

  try {
    const authAdmin = createAuthAdminClient();
    const { data, error: lookupError } =
      await authAdmin.auth.admin.getUserById(candidateUserId);
    if (lookupError || !data.user || !getConfirmedGoogleEmail(data.user)) {
      return { ok: false as const, error: "invalid_candidate" as const };
    }

    const { error: provisioningError } = await adminContext.supabase.rpc(
      "provision_mentor",
      {
        p_class_id: classId,
        p_mentor_user_id: candidateUserId,
      },
    );

    if (provisioningError) {
      return { ok: false as const, error: "provisioning_failed" as const };
    }

    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "provisioning_failed" as const };
  }
}
