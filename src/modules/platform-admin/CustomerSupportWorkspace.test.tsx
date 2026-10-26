import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
vi.mock('../service-requests/AdminServiceRequestsWorkspace', () => ({ AdminServiceRequestsWorkspace: () => <div>Support cases inbox</div> }));
import { CustomerSupportWorkspace } from './PlatformAdminWorkspace';
it('opens cases by default and preserves operational workflows in a second view', async () => {
  const navigate = vi.fn(); const user = userEvent.setup();
  render(<CustomerSupportWorkspace onNavigate={navigate} />);
  await screen.findByText('Support cases inbox');
  await user.click(screen.getByRole('button', { name: 'Operational requests' }));
  expect(screen.queryByText('Support cases inbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Verification/ }));
  expect(navigate).toHaveBeenCalledWith('admin-verification');
  await user.click(screen.getByRole('button', { name: 'Cases & service requests' }));
  await screen.findByText('Support cases inbox');
});
