export type RoomPeriod = [from: Date, to: Date];

interface Photo {
  id: number;
  url: string;
  isMain: boolean;
  sortOrder: number;
}

export interface RoomRow {
  id: string | number;
  owner_id: string | number;
  category_id: string | number;
  title: string;
  description: string | null;
  address: string;
  area_m2: string | number;
  capacity: number;
  price_per_hour: string | number;
  price_per_day: string | number | null;
  is_active: boolean;
  avg_rating: string | number | null;
  reviews_count: string | number;
  photos: Photo[];
}

export type BusySlotRow = {
  start_at: Date;
  end_at: Date;
} & (
  | { kind: 'booking'; status: 'pending' | 'active' }
  | { kind: 'block'; status: 'blocked' }
);

export function roomResponse(room: RoomRow) {
  return {
    id: Number(room.id),
    ownerId: Number(room.owner_id),
    categoryId: Number(room.category_id),
    title: room.title,
    ...(room.description !== null && { description: room.description }),
    address: room.address,
    areaM2: Number(room.area_m2),
    capacity: room.capacity,
    pricePerHour: Number(room.price_per_hour),
    pricePerDay: room.price_per_day === null ? null : Number(room.price_per_day),
    isActive: room.is_active,
    avgRating: room.avg_rating === null ? null : Number(room.avg_rating),
    reviewsCount: Number(room.reviews_count),
    photos: room.photos,
  };
}
