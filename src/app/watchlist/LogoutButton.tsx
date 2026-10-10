'use client';

import { useFormStatus } from 'react-dom';
import { LoaderCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ko } from '@/lib/i18n/ko';

export function LogoutButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground" disabled={pending}>
      {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <LogOut aria-hidden />}
      {pending ? ko.watch.loggingOut : ko.watch.logout}
    </Button>
  );
}
