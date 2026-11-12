import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-api';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getServerSession();
  redirect(user ? '/dashboard' : '/login');
}
