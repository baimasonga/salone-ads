import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdministratorControlCentre } from './AdministratorControlCentre';
import * as api from './administratorControlCentreApi';

vi.mock('./administratorControlCentreApi', () => ({
  fetchAdministratorControlCentre: vi.fn(),
  updatePlatformIntakeControl: vi.fn(),
}));

const snapshot = {
  role: 'owner' as const, generatedAt: '2026-08-11T09:00:00Z', canManageControls: true,
  metrics: [{ label:'Genuine subscribers', value:12, format:'number' as const, href:'admin-organizations' }],
  queues: [{ label:'Tender moderation', value:3, href:'admin-tender-review' }], risks: [], health: [],
  controls: [{ key:'service_requests' as const,label:'Service requests',enabled:true,reason:null,updatedAt:'2026-08-11T09:00:00Z',updatedBy:null }],
};

describe('AdministratorControlCentre',()=>{
  beforeEach(()=>{vi.mocked(api.fetchAdministratorControlCentre).mockResolvedValue(snapshot);vi.mocked(api.updatePlatformIntakeControl).mockResolvedValue();});

  it('shows a deliberate loading state before the live snapshot arrives',()=>{
    vi.mocked(api.fetchAdministratorControlCentre).mockReturnValue(new Promise(()=>{}));
    render(<AdministratorControlCentre role="owner" onNavigate={vi.fn()}/>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading live platform operations');
  });

  it('renders real role-aware metrics and drills into existing workspaces',async()=>{
    const navigate=vi.fn();render(<AdministratorControlCentre role="owner" onNavigate={navigate}/>);
    await userEvent.click(await screen.findByRole('button',{name:/Genuine subscribers/i}));
    expect(screen.getByText('12')).toBeInTheDocument();expect(navigate).toHaveBeenCalledWith('admin-organizations');
  });

  it('requires a reason and sends emergency changes through the guarded command',async()=>{
    render(<AdministratorControlCentre role="owner" onNavigate={vi.fn()}/>);
    await userEvent.click(await screen.findByRole('button',{name:/Service requests/i}));
    const confirm=screen.getByRole('button',{name:'Confirm change'});expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'),'Planned incident containment');await userEvent.click(confirm);
    await waitFor(()=>expect(api.updatePlatformIntakeControl).toHaveBeenCalledWith('service_requests',false,'Planned incident containment'));
  });
});
