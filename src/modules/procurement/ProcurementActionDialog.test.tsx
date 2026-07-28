import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProcurementActionDialog } from './ProcurementActionDialog';

function DialogHarness({ onSubmit }: { onSubmit: () => void }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <ProcurementActionDialog
      title="Reject tender"
      description="Provide a reason."
      submitLabel="Reject tender"
      submitting={false}
      tone="danger"
      onClose={() => setOpen(false)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="reason">Reason</label>
      <textarea id="reason" required />
    </ProcurementActionDialog>
  ) : null;
}

describe('ProcurementActionDialog', () => {
  it('exposes accessible dialog semantics and closes with Escape', async () => {
    const user = userEvent.setup();
    render(<DialogHarness onSubmit={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Reject tender' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses native required-field validation before submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DialogHarness onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Reject tender' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason'), 'The notice is incomplete.');
    await user.click(screen.getByRole('button', { name: 'Reject tender' }));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
