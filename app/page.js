import AuthGate from '../components/AuthGate';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <AuthGate />;
}
