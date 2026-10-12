import { Card } from '../../components/ui';
import { useSession } from '../../lib/auth';
import { ChangePasswordCard } from '../shared/ChangePassword';
import { LogoutButton } from '../shared/LogoutButton';

export function WasherProfile() {
  const { user } = useSession();
  return (
    <div className="px-5 pt-[18px] flex flex-col gap-3.5">
      <h1 className="text-[27px] font-bold tracking-[-0.5px]">Profile</h1>
      <Card>
        <div className="font-semibold text-lg">{user?.name}</div>
        <div className="text-muted">{user?.mobile}</div>
      </Card>
      <ChangePasswordCard />
      <LogoutButton />
    </div>
  );
}
