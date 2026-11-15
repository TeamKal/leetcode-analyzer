import { signOut } from "@/app/actions";

type EnrollmentRequiredPageProps = {
  searchParams: Promise<{ issue?: string }>;
};

export default async function EnrollmentRequiredPage({
  searchParams,
}: EnrollmentRequiredPageProps) {
  const { issue } = await searchParams;
  const heading =
    issue === "link"
      ? "We couldn't verify your enrollment"
      : "No matching enrollment found";

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="enrollment-title">
        <p className="eyebrow">STUDENT ACCESS</p>
        <h1 id="enrollment-title">{heading}</h1>
        <p className="login-copy">
          Please contact your mentor and confirm that you signed in with the
          Google account used for your student enrollment.
        </p>
        <form action={signOut} className="onboarding-actions">
          <button className="button button-secondary" type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
