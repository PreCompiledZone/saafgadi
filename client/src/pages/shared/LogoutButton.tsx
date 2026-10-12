import { useNavigate } from 'react-router-dom';
import { Logout } from '../../components/icons';
import { Button } from '../../components/ui';
import { useAuthActions } from '../../lib/auth';

export function LogoutButton() {
  const { logout } = useAuthActions();
  const navigate = useNavigate();
  return (
    <Button
      variant="danger"
      block
      onClick={async () => {
        await logout();
        navigate('/login', { replace: true });
      }}
    >
      <Logout size={18} /> Log out
    </Button>
  );
}
