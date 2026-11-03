import { redirect } from 'next/navigation';

// The dashboard guard sends visitors on to /login or /admin
export default function HomePage() {
  redirect('/dashboard');
}
