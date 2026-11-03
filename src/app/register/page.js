'use client';

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RegisterForm } from '@/features/auth/register-form';

// FR1 Registration screen (UC1)
export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>Create an account</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
        <CardFooter>
          <Link href="/login" className={buttonVariants({ variant: 'link', size: 'lg' })}>
            I already have an account
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
