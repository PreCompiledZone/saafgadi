import { PageTitle } from '../../components/ui';
import { ChangePasswordCard } from '../shared/ChangePassword';

export function AdminProfile() {
  return (
    <>
      <PageTitle title="Your password" />
      <div className="max-w-md">
        <ChangePasswordCard />
      </div>
    </>
  );
}
