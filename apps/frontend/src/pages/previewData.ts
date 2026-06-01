import {
  AvailabilitySummary,
  Billing,
  DashboardSummary,
  HousekeepingTask,
  InventoryCalendarSummary,
  PaymentTransaction,
  Property,
  RatePlan,
  ReservationGroup,
  ReservationGroupFolio,
  Room,
  RoomCategory,
} from '../api/types';

export const PREVIEW_DATA_STORAGE_KEY = 'hms_sample_data_preview';
export const PREVIEW_DATA_EVENT = 'hms-sample-data-preview-change';
export const PREVIEW_ID_PREFIX = 'sample-';

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isPreviewId(id: string | null | undefined) {
  return Boolean(id?.startsWith(PREVIEW_ID_PREFIX));
}

export function readPreviewDataEnabled() {
  return localStorage.getItem(PREVIEW_DATA_STORAGE_KEY) === 'true';
}

export function writePreviewDataEnabled(enabled: boolean) {
  localStorage.setItem(PREVIEW_DATA_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent(PREVIEW_DATA_EVENT, { detail: enabled }));
}

const property: Property = {
  id: 'sample-property-harbour',
  name: 'Harbour Grand Demo',
  code: 'HGD',
  phone: '+91 98765 43210',
  email: 'frontdesk@harbour-demo.local',
  address: 'Marine Drive, Mumbai',
  timezone: 'Asia/Kolkata',
  is_active: true,
  images: [],
};

const propertyRef = { id: property.id, name: property.name, code: property.code };

const categories: RoomCategory[] = [
  ['suite', 'Suite', 'STE', 3],
  ['deluxe', 'Deluxe King', 'DLX', 2],
  ['twin', 'Superior Twin', 'TWN', 2],
  ['classic', 'Classic Double', 'CLS', 2],
].map(([slug, name, code, maxOccupancy]) => ({
  id: `sample-category-${slug}`,
  property_id: property.id,
  name: String(name),
  code: String(code),
  description: null,
  max_occupancy: Number(maxOccupancy),
  property: propertyRef,
  images: [],
}));

const categoryBySlug = new Map(categories.map(category => [category.id.replace('sample-category-', ''), category]));

function category(slug: string) {
  return categoryBySlug.get(slug)!;
}

const rates: RatePlan[] = categories.map(cat => ({
  id: `sample-rate-${cat.code.toLowerCase()}`,
  property_id: property.id,
  room_category_id: cat.id,
  name: `${cat.name} Flexible`,
  code: `${cat.code}-FLEX`,
  base_rate: cat.code === 'STE' ? 14200 : cat.code === 'DLX' ? 8900 : cat.code === 'TWN' ? 7600 : 6400,
  currency: 'INR',
  is_active: true,
  property: propertyRef,
  room_category: { id: cat.id, name: cat.name, code: cat.code },
}));

function rateFor(cat: RoomCategory) {
  return rates.find(rate => rate.room_category_id === cat.id)!;
}

const roomSpecs = [
  ['101', 'classic'], ['102', 'classic'], ['201', 'deluxe'], ['202', 'deluxe'],
  ['301', 'twin'], ['302', 'twin'], ['401', 'suite'], ['402', 'suite'],
] as const;

const rooms: Room[] = roomSpecs.map(([number, slug]) => {
  const cat = category(slug);
  return {
    id: `sample-room-${number}`,
    property_id: property.id,
    room_category_id: cat.id,
    room_number: number,
    property: propertyRef,
    room_category: { id: cat.id, name: cat.name, code: cat.code },
    status: 'AVAILABLE',
  };
});

function room(number: string) {
  return rooms.find(room => room.room_number === number)!;
}

type StayInput = {
  id: string;
  guest: string;
  phone: string;
  roomNumber: string;
  categorySlug: string;
  arrival: string;
  departure: string;
  status: ReservationGroup['reservation_status'];
  total: number;
  source?: string;
};

function makeGroup(input: StayInput): ReservationGroup {
  const cat = category(input.categorySlug);
  const selectedRoom = room(input.roomNumber);
  const guestId = `sample-guest-${input.id}`;
  const groupId = `sample-group-${input.id}`;
  return {
    id: groupId,
    property_id: property.id,
    primary_guest_id: guestId,
    channel_connection_id: 'sample-channel-zodomus',
    external_reservation_id: `HGD-${input.id.toUpperCase()}`,
    external_reservation_version: '1',
    external_status: input.status,
    source: input.source ?? 'ZODOMUS',
    currency: 'INR',
    total_amount: input.total,
    reservation_status: input.status,
    remarks: null,
    booked_at: `${input.arrival}T08:30:00.000Z`,
    modified_at: null,
    arrival_date: input.arrival,
    departure_date: input.departure,
    created_at: `${input.arrival}T08:30:00.000Z`,
    updated_at: `${input.arrival}T08:30:00.000Z`,
    property: propertyRef,
    primary_guest: { id: guestId, name: input.guest, phone: input.phone, email: `${input.id}@preview.local` },
    rooms: [{
      id: `sample-stay-${input.id}`,
      external_room_reservation_id: `HGD-${input.id.toUpperCase()}-1`,
      external_room_id: cat.code,
      arrival_date: input.arrival,
      departure_date: input.departure,
      total_amount: input.total,
      currency: 'INR',
      reservation_status: input.status,
      guest_name: input.guest,
      adults: 2,
      children: input.id === 'mehta' ? 1 : 0,
      room_category: { id: cat.id, name: cat.name, code: cat.code },
      rate_plan: {
        id: rateFor(cat).id,
        name: rateFor(cat).name,
        code: rateFor(cat).code,
        base_rate: rateFor(cat).base_rate,
        currency: 'INR',
      },
      room: { id: selectedRoom.id, room_number: selectedRoom.room_number, status: selectedRoom.status },
    }],
  };
}

function buildGroups(today: string) {
  return [
    makeGroup({ id: 'mehta', guest: 'Riya Mehta', phone: '+91 98100 41001', roomNumber: '201', categorySlug: 'deluxe', arrival: today, departure: addDays(today, 3), status: 'BOOKED', total: 26700 }),
    makeGroup({ id: 'nair', guest: 'Arjun Nair', phone: '+91 98100 41002', roomNumber: '401', categorySlug: 'suite', arrival: addDays(today, -1), departure: addDays(today, 2), status: 'BOOKED', total: 42600 }),
    makeGroup({ id: 'shah', guest: 'Kabir Shah', phone: '+91 98100 41003', roomNumber: '301', categorySlug: 'twin', arrival: addDays(today, -2), departure: addDays(today, 2), status: 'CHECKED_IN', total: 30400 }),
    makeGroup({ id: 'rao', guest: 'Ananya Rao', phone: '+91 98100 41004', roomNumber: '402', categorySlug: 'suite', arrival: addDays(today, -3), departure: today, status: 'CHECKED_IN', total: 42600 }),
    makeGroup({ id: 'kapoor', guest: 'Vikram Kapoor', phone: '+91 98100 41005', roomNumber: '102', categorySlug: 'classic', arrival: addDays(today, -2), departure: today, status: 'CHECKED_OUT', total: 12800, source: 'DIRECT' }),
    makeGroup({ id: 'iyer', guest: 'Maya Iyer', phone: '+91 98100 41006', roomNumber: '202', categorySlug: 'deluxe', arrival: addDays(today, 2), departure: addDays(today, 5), status: 'BOOKED', total: 26700 }),
  ];
}

function buildHousekeeping(today: string, groups: ReservationGroup[]): HousekeepingTask[] {
  const group = (id: string) => groups.find(group => group.id === `sample-group-${id}`)!;
  const reservationLink = (id: string) => {
    const selected = group(id);
    return {
      id: selected.rooms[0].id,
      external_room_reservation_id: selected.rooms[0].external_room_reservation_id,
      reservation_group_id: selected.id,
      external_reservation_id: selected.external_reservation_id,
    };
  };
  const task = (id: string, roomNumber: string, status: HousekeepingTask['status'], priority: HousekeepingTask['priority'], notes: string, reservationId?: string, due = today, completed_at: string | null = null): HousekeepingTask => {
    const selectedRoom = room(roomNumber);
    return {
      id: `sample-task-${id}`,
      property_id: property.id,
      room_id: selectedRoom.id,
      reservation_room_id: reservationId ? group(reservationId).rooms[0].id : null,
      status,
      priority,
      notes,
      due_date: due,
      completed_at,
      property: propertyRef,
      room: { id: selectedRoom.id, room_number: selectedRoom.room_number, room_category: selectedRoom.room_category },
      reservation_room: reservationId ? reservationLink(reservationId) : null,
    };
  };
  return [
    task('101', '101', 'DIRTY', 'URGENT', 'Priority clean before early arrival.', undefined, addDays(today, -1)),
    task('201', '201', 'CLEANING', 'HIGH', 'Extra towels requested for family stay.', 'mehta'),
    task('301', '301', 'CLEAN', 'NORMAL', 'Ready for supervisor inspection.', 'shah'),
    task('102', '102', 'INSPECTED', 'NORMAL', 'Checkout clean completed.', 'kapoor', today, `${today}T09:45:00.000Z`),
    task('302', '302', 'OUT_OF_SERVICE', 'HIGH', 'Air-conditioning service in progress.'),
  ];
}

function buildBilling(groups: ReservationGroup[]) {
  const byId = new Map(groups.map(group => [group.id.replace('sample-group-', ''), group]));
  const invoice = (id: string, groupKey: string, amount: number, tax: number, paid: number, extra = 0): Billing => {
    const group = byId.get(groupKey)!;
    const stay = group.rooms[0];
    const total = amount + tax + extra;
    const balance = total - paid;
    return {
      id: `sample-billing-${id}`,
      reservation_room_id: stay.id,
      amount,
      tax,
      extra_charges_total: extra,
      paid_total: paid,
      refunded_total: 0,
      balance_due: balance,
      total,
      payment_status: balance === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
      reservation_room: {
        id: stay.id,
        reservation_group_id: group.id,
        external_room_reservation_id: stay.external_room_reservation_id,
        external_reservation_id: group.external_reservation_id,
        reservation_status: stay.reservation_status,
        property: propertyRef,
        check_in_date: stay.arrival_date,
        check_out_date: stay.departure_date,
        guest: { id: group.primary_guest?.id ?? null, name: group.primary_guest?.name ?? 'Imported guest', phone: group.primary_guest?.phone ?? null, email: group.primary_guest?.email ?? null },
        room_category: stay.room_category,
        rate_plan: { id: stay.rate_plan.id, name: stay.rate_plan.name, code: stay.rate_plan.code, base_rate: stay.rate_plan.base_rate },
        room: { id: stay.room.id, room_number: stay.room.room_number },
      },
      extra_charges: extra ? [{ id: `sample-extra-${id}`, description: 'Airport transfer', amount: extra, created_at: `${stay.arrival_date}T10:00:00.000Z` }] : [],
      payments: paid ? [{ id: `sample-payment-${id}`, provider: 'CARD', provider_reference: `PREVIEW-${id.toUpperCase()}`, amount: paid, status: 'SUCCEEDED', created_at: `${stay.arrival_date}T11:00:00.000Z` }] : [],
    };
  };
  return [
    invoice('rao', 'rao', 38000, 4560, 20000, 1800),
    invoice('kapoor', 'kapoor', 11428, 1372, 12800),
    invoice('shah', 'shah', 27142, 3258, 0),
  ];
}

function buildTransactions(billings: Billing[]): PaymentTransaction[] {
  return billings.flatMap(billing => billing.payments.map(payment => ({
    id: payment.id,
    billing_id: billing.id,
    provider: payment.provider,
    provider_reference: payment.provider_reference,
    amount: payment.amount,
    status: payment.status,
    reservation_room: {
      id: billing.reservation_room.id,
      guest_name: billing.reservation_room.guest.name,
      property_name: billing.reservation_room.property.name,
    },
    created_at: payment.created_at,
  })));
}

function buildInventory(today: string): { availability: AvailabilitySummary; inventoryCalendar: InventoryCalendarSummary } {
  const rows = categories.map((cat, categoryIndex) => ({
    room_category_id: cat.id,
    name: cat.name,
    code: cat.code,
    rows: Array.from({ length: 30 }, (_, index) => {
      const reserved = (index + categoryIndex) % 5 === 0 ? 2 : (index + categoryIndex) % 3 === 0 ? 1 : 0;
      const blocked = index === 7 && categoryIndex === 2 ? 1 : 0;
      const stopSell = index === 11 && categoryIndex === 1;
      const total = categoryIndex === 0 ? 2 : 3;
      return {
        date: addDays(today, index),
        total_rooms: total,
        blocked_rooms: blocked,
        reserved_rooms: stopSell ? total : reserved,
        available_rooms: stopSell ? 0 : Math.max(0, total - blocked - reserved),
        stop_sell: stopSell,
        closed_to_arrival: index === 5 && categoryIndex === 0,
        closed_to_departure: false,
        min_stay: index === 9 && categoryIndex === 3 ? 2 : null,
        max_stay: null,
      };
    }),
  }));
  return {
    availability: {
      property_id: property.id,
      property_name: property.name,
      from: today,
      to: addDays(today, 29),
      categories: rows.map(cat => ({
        room_category_id: cat.room_category_id,
        name: cat.name,
        code: cat.code,
        total_inventory: cat.rows.reduce((sum, row) => sum + row.total_rooms, 0),
        out_of_service: cat.rows.reduce((sum, row) => sum + row.blocked_rooms, 0),
        reserved_room_stays: cat.rows.reduce((sum, row) => sum + row.reserved_rooms, 0),
        available: cat.rows.reduce((sum, row) => sum + row.available_rooms, 0),
        lowest_rate: rateFor(category(cat.room_category_id.replace('sample-category-', ''))).base_rate,
        currency: 'INR',
      })),
    },
    inventoryCalendar: { property_id: property.id, property_name: property.name, from: today, to: addDays(today, 29), categories: rows },
  };
}

export function createPreviewData() {
  const today = localToday();
  const reservationGroups = buildGroups(today);
  const housekeeping = buildHousekeeping(today, reservationGroups);
  const billings = buildBilling(reservationGroups);
  const { availability, inventoryCalendar } = buildInventory(today);
  const dashboard: DashboardSummary = {
    date: today,
    reservation_groups_today: 2,
    occupancy_rate: 63,
    occupied_rooms: 5,
    total_rooms: rooms.length,
    revenue_today: 38400,
    reservation_room_arrivals_today: 2,
    reservation_room_departures_today: 2,
    active_reservation_groups: 5,
    open_housekeeping_tasks: housekeeping.filter(task => !task.completed_at).length,
    pending_balance_total: billings.reduce((sum, billing) => sum + billing.balance_due, 0),
  };
  const folios = new Map<string, ReservationGroupFolio>();
  for (const group of reservationGroups) {
    const invoices = billings.filter(billing => billing.reservation_room.reservation_group_id === group.id);
    if (invoices.length === 0) continue;
    folios.set(group.id, {
      reservation_group_id: group.id,
      external_reservation_id: group.external_reservation_id,
      reservation_status: group.reservation_status,
      property: propertyRef,
      guest: group.primary_guest,
      room_count: group.rooms.length,
      invoiced_room_count: invoices.length,
      total_amount: group.total_amount ?? 0,
      billed_total: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
      paid_total: invoices.reduce((sum, invoice) => sum + invoice.paid_total, 0),
      refunded_total: invoices.reduce((sum, invoice) => sum + invoice.refunded_total, 0),
      balance_due: invoices.reduce((sum, invoice) => sum + invoice.balance_due, 0),
      invoices,
      rooms: group.rooms.map(stay => ({
        id: stay.id,
        external_room_reservation_id: stay.external_room_reservation_id,
        arrival_date: stay.arrival_date,
        departure_date: stay.departure_date,
        total_amount: stay.total_amount ?? 0,
        reservation_status: stay.reservation_status,
        room_category: stay.room_category,
        rate_plan: { id: stay.rate_plan.id, name: stay.rate_plan.name, code: stay.rate_plan.code },
        room: { id: stay.room.id, room_number: stay.room.room_number },
        billing_id: invoices.find(invoice => invoice.reservation_room_id === stay.id)?.id ?? null,
      })),
    });
  }
  return {
    properties: [property],
    categories,
    rates,
    rooms,
    reservationGroups,
    housekeeping,
    billings,
    payments: buildTransactions(billings),
    availability,
    inventoryCalendar,
    dashboard,
    folios,
  };
}

