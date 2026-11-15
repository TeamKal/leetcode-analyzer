import { signOut } from "@/app/actions";

export default function AccessDeniedPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="access-denied-title">
        <p className="eyebrow">ACCOUNT ACCESS</p>
        <h1 id="access-denied-title">Access could not be verified</h1>
        <p className="login-copy">
          Your account does not have an active application role, or we could not
          verify it. Contact an administrator for help.
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
