export type BookingStatus = 'pending' | 'active' | 'completed' | 'cancelled';

interface StatusChange {
  oldStatus: BookingStatus | null;
  newStatus: BookingStatus;
  changedAt: string;
}

export interface BookingRow {
  id: string;
  room_id: string;
  tenant_id: string;
  start_at: Date;
  end_at: Date;
  status: BookingStatus;
  total_price: string;
  actual_return_at: Date | null;
  is_overdue: boolean;
  history: StatusChange[];
  has_review?: boolean;
  has_tenant_review?: boolean;
}

export interface BookingTarget {
  tenant_id: string;
  owner_id: string;
  start_at: Date;
  status: BookingStatus;
  db_now: Date;
}

export function bookingResponse(booking: BookingRow) {
  return {
    id: Number(booking.id),
    roomId: Number(booking.room_id),
    tenantId: Number(booking.tenant_id),
    startAt: booking.start_at.toISOString(),
    endAt: booking.end_at.toISOString(),
    status: booking.status,
    totalPrice: Number(booking.total_price),
    actualReturnAt: booking.actual_return_at?.toISOString() ?? null,
    isOverdue: booking.is_overdue,
    hasReview: booking.has_review ?? false,
    hasTenantReview: booking.has_tenant_review ?? false,
    history: booking.history.map(({ changedAt, ...status }) => ({
      ...status,
      changedAt: new Date(changedAt).toISOString(),
    })),
  };
}
