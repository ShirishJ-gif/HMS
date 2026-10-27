import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { BookingService } from '../modules/booking/booking.service';
import { BookingController } from '../modules/booking/booking.controller';
import { InventoryService } from '../modules/inventory/inventory.service';
import { PricingService } from '../modules/pricing/pricing.service';
import { RoomOutOfServiceCalendarService } from '../modules/room-out-of-service/room-out-of-service-calendar.service';
import { BillingService } from '../modules/billing/billing.service';
import { BillingController } from '../modules/billing/billing.controller';
import { PaymentService } from '../modules/payment/payment.service';
import { PaymentController } from '../modules/payment/payment.controller';
import { PaymentProviderService } from '../modules/payment/payment-provider.service';
import { PropertyService } from '../modules/property/property.service';
import { RoomController } from '../modules/room/room.controller';
import { RoomService } from '../modules/room/room.service';
import { AuthGuard, AuthenticatedUser } from '../modules/auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ApiCallTraceService } from '../common/api-call-trace/api-call-trace.service';
import { AuditLogService } from '../modules/audit-log/audit-log.service';
import * as reservationLocks from '../modules/booking/reservation-lock';

// Destructive fixtures are permitted ONLY in a disposable restored audit database.
const auditSuite = process.env.RUN_OPERATIONS_AUDIT === 'true' ? describe : describe.skip;
auditSuite('Operations production audit — isolated restore only', () => {
  const prisma = new PrismaClient();
  const calendar = new RoomOutOfServiceCalendarService(prisma as never);
  const audit = new AuditLogService(prisma as never);
  const background = { enqueue: jest.fn(), queueInventorySyncsForProperty: jest.fn() };
  const inventory = new InventoryService(prisma as never, audit, {} as never, calendar);
  const pricing = new PricingService(prisma as never, calendar);
  const providers = new PaymentProviderService();
  const booking = new BookingService(prisma as never, background as never, audit, inventory, providers, pricing);
  const billing = new BillingService(prisma as never);
  const payments = new PaymentService(prisma as never, providers,
    { run: (_key: unknown, _scope: unknown, _input: unknown, _user: unknown, action: () => Promise<unknown>) => action() } as never,
    { recordPaymentCollect: jest.fn(), recordPaymentRefund: jest.fn() } as never);
  const jwt = new JwtService({ secret: 'isolated-operations-audit-only' });
  let app: INestApplication;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/hms_audit_[a-f0-9]+$/.test(url.pathname))
      throw new Error('Refusing audit writes outside a disposable local hms_audit_* database');
    const module = await Test.createTestingModule({
      controllers: [BookingController, BillingController, PaymentController, RoomController],
      providers: [
        { provide: BookingService, useValue: booking }, { provide: BillingService, useValue: billing },
        { provide: PaymentService, useValue: payments }, { provide: RoomService, useValue: {} },
        { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: jwt },
        { provide: ApiCallTraceService, useValue: { attachAuthenticatedUser: jest.fn() } },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); await prisma.$disconnect(); });

  async function fixture(roomCount = 1) {
    const property = await prisma.property.create({ data: { name: 'Isolated audit', code: randomUUID(), address: 'Test' } });
    const category = await prisma.roomCategory.create({ data: { propertyId: property.id, name: 'Test', code: 'TEST' } });
    const rate = await prisma.ratePlan.create({ data: { propertyId: property.id, roomCategoryId: category.id, name: 'Test', code: 'TEST', baseRate: 100 } });
    await prisma.room.createMany({ data: Array.from({length:roomCount}, (_, i) => ({propertyId:property.id, roomCategoryId:category.id, roomNumber:String(i+1)})) });
    const rooms = await prisma.room.findMany({ where: { propertyId:property.id }, orderBy:{roomNumber:'asc'} });
    const guest = await prisma.guest.create({ data: { propertyId:property.id, name:'Audit guest', phone:'1234567890', idProof:'Passport', address:'Test' } });
    const staff = await prisma.user.create({ data: { propertyId:property.id, name:'Audit staff', email:`${randomUUID()}@example.test`, role:'STAFF', passwordHash:'not-a-login-hash' } });
    const user: AuthenticatedUser = { sub:staff.id, email:staff.email, role:'STAFF', property_id:property.id, organization_id:null };
    const dto = { property_id:property.id, guest_id:guest.id, room_category_id:category.id, rate_plan_id:rate.id, check_in_date:'2035-01-10', check_out_date:'2035-01-12' };
    return { property, category, rate, rooms, guest, user, dto, token:jwt.sign(user) };
  }
  function auth(token:string) { return { Authorization:`Bearer ${token}` }; }

  it('prevents simultaneous bookings from selling the last hotel room twice', async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([booking.createDirectReservation(f.dto,f.user), booking.createDirectReservation(f.dto,f.user)]);
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(await prisma.reservationRoom.count({where:{propertyId:f.property.id}})).toBe(1);
  });

  it('allows checkout-day arrivals and rolls back an extension into a sold-out night', async () => {
    const f = await fixture();
    const first = await booking.createDirectReservation(f.dto,f.user);
    const invoice = await billing.createInvoice({reservation_room_id:first.rooms[0].id},f.user);
    await booking.createDirectReservation({...f.dto,check_in_date:'2035-01-12',check_out_date:'2035-01-14'},f.user);
    await expect(booking.updateDirectReservation(first.id,{...f.dto,check_out_date:'2035-01-13'},f.user)).rejects.toThrow('Insufficient inventory');
    expect((await prisma.reservationRoom.findUniqueOrThrow({where:{id:first.rooms[0].id}})).departureDate.toISOString().slice(0,10)).toBe('2035-01-12');
    expect(await billing.findOne(invoice.id,f.user)).toMatchObject({amount:200,total:200});
  });

  it('reserves every room for a whole villa and prevents overlapping room-count bookings', async () => {
    const f = await fixture();
    const properties = new PropertyService(prisma as never);
    const villa = await properties.createProperty({name:'Audit villa',code:randomUUID(),address:'Test',property_type:'RENTAL_VILLAS',nightly_rate:400});
    await properties.updateVillaRate(villa.id,{nightly_rate:400,total_rooms:4,min_rooms:1,max_rooms:4,whole_villa_rate:400,per_room_rate:100});
    const guest = await prisma.guest.create({data:{propertyId:villa.id,name:'Villa guest',phone:'1234567890',idProof:'Passport',address:'Test'}});
    const dto = {...f.dto,property_id:villa.id,guest_id:guest.id,villa_booking_mode:'WHOLE_VILLA' as const};
    const reserved = await booking.createDirectReservation(dto);
    expect(reserved.rooms).toHaveLength(4);
    expect(reserved.total_amount).toBe(800);
    await expect(booking.createDirectReservation({...dto,villa_booking_mode:'ROOM_COUNT',room_count:1})).rejects.toThrow('Insufficient inventory');
  });

  it('completes a stay with advance, extras, collection, partial refund, checkout and one invoice', async () => {
    const f = await fixture();
    const group = await booking.createDirectReservation({...f.dto,advance_amount:'50'},f.user);
    await booking.checkInReservationRoom(group.rooms[0].id,{},f.user);
    let folio = await billing.findReservationGroupFolio(group.id,f.user);
    expect(folio).toMatchObject({billed_total:200,paid_total:50,balance_due:150});
    const invoice = folio.invoices[0];
    await billing.addExtraCharge(invoice.id,{description:'Food',amount:'25'},f.user);
    const paid = await payments.collect({billing_id:invoice.id,amount:'175',provider:'CASH'},f.user);
    await payments.refund(paid.id,{amount:'10',reason:'Partial refund'},f.user);
    await booking.checkOutReservationRoom(group.rooms[0].id,f.user);
    folio = await billing.findReservationGroupFolio(group.id,f.user);
    expect(folio).toMatchObject({billed_total:225,paid_total:225,refunded_total:10,balance_due:10});
    expect(folio.invoices).toHaveLength(1);
    writeFileSync('/tmp/hms-audit-print-fixture.json', JSON.stringify(folio.invoices[0]), { mode: 0o600 });
    expect(await prisma.housekeepingTask.count({where:{propertyId:f.property.id}})).toBe(1);
    expect((await prisma.room.findUniqueOrThrow({where:{id:f.rooms[0].id}})).status).toBe('AVAILABLE');
    expect(await prisma.auditLog.count({where:{propertyId:f.property.id}})).toBeGreaterThanOrEqual(6);
  });

  it('rejects cross-property invoice reads, booking edits, check-in, payments and charge removal through HTTP', async () => {
    const a = await fixture(), b = await fixture();
    const group = await booking.createDirectReservation(a.dto,a.user);
    const invoice = await billing.createInvoice({reservation_room_id:group.rooms[0].id},a.user);
    await billing.addExtraCharge(invoice.id,{description:'Food',amount:'25'},a.user);
    const charge = await prisma.billingExtraCharge.findFirstOrThrow({where:{billingId:invoice.id}});
    await request(app.getHttpServer()).get(`/billings/${invoice.id}`).set(auth(b.token)).expect(403);
    await request(app.getHttpServer()).put(`/reservations/direct/${group.id}`).set(auth(b.token)).send({...a.dto}).expect(403);
    await request(app.getHttpServer()).put(`/bookings/groups/rooms/${group.rooms[0].id}/checkin`).set(auth(b.token)).send({}).expect(403);
    await request(app.getHttpServer()).post('/payments/collect').set(auth(b.token)).send({billing_id:invoice.id,amount:'10',provider:'CASH'}).expect(403);
    await request(app.getHttpServer()).delete(`/billings/${invoice.id}/extra-charges/${charge.id}`).set(auth(b.token)).expect(403);
    expect(await prisma.billingExtraCharge.count({where:{id:charge.id}})).toBe(1);
  });

  it('uses the current database role and revokes disabled or version-expired sessions', async () => {
    const f = await fixture();
    const inflatedToken = jwt.sign({...f.user,role:'PLATFORM_OWNER'});
    await request(app.getHttpServer()).post('/rooms').set(auth(inflatedToken)).send({}).expect(403);
    await request(app.getHttpServer()).get('/billings').expect(401);
    await prisma.user.update({where:{id:f.user.sub},data:{isActive:false}});
    await request(app.getHttpServer()).get('/billings').set(auth(f.token)).expect(401);
    await prisma.user.update({where:{id:f.user.sub},data:{isActive:true,tokenVersion:1}});
    await request(app.getHttpServer()).get('/billings').set(auth(f.token)).expect(401);
  });

  it('refreshes organization property access from the database instead of trusting token property IDs', async () => {
    const a=await fixture(), b=await fixture(), outsider=await fixture();
    const org=await prisma.organization.create({data:{name:'Audit organization'}});
    await prisma.property.updateMany({where:{id:{in:[a.property.id,b.property.id]}},data:{organizationId:org.id}});
    await prisma.user.update({where:{id:a.user.sub},data:{role:'ORG_OWNER',organizationId:org.id,propertyId:null}});
    const token=jwt.sign({...a.user,role:'ORG_OWNER',property_ids:[outsider.property.id]});
    const group=await booking.createDirectReservation(b.dto,b.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id},b.user);
    await request(app.getHttpServer()).get(`/billings/${invoice.id}`).set(auth(token)).expect(200);
    const outsideGroup=await booking.createDirectReservation(outsider.dto,outsider.user);
    const outsideInvoice=await billing.createInvoice({reservation_room_id:outsideGroup.rooms[0].id},outsider.user);
    await request(app.getHttpServer()).get(`/billings/${outsideInvoice.id}`).set(auth(token)).expect(403);
  });

  it('blocks out-of-service inventory at booking time and releases cancelled stays when rebuilding availability', async () => {
    const f=await fixture();
    const block=await inventory.createInventoryBlock({property_id:f.property.id,room_category_id:f.category.id,from_date:'2035-01-10',to_date:'2035-01-11',blocked_rooms:1,reason:'Audit'},f.user);
    await expect(booking.createDirectReservation(f.dto,f.user)).rejects.toThrow('Insufficient inventory');
    await inventory.removeInventoryBlock(block.id,false,f.user);
    const group=await booking.createDirectReservation(f.dto,f.user);
    // A direct cancellation endpoint does not exist; this verifies calendar state only.
    await prisma.reservationRoom.update({where:{id:group.rooms[0].id},data:{status:'CANCELLED'}});
    await prisma.reservationGroup.update({where:{id:group.id},data:{status:'CANCELLED'}});
    const rows=await inventory.rebuildCalendarRange({propertyId:f.property.id,from:new Date('2035-01-10'),to:new Date('2035-01-11')});
    expect(rows.every(row=>row.availableRooms===1)).toBe(true);
  });

  it('documents that ordinary staff currently can refund and remove charges within their own property', async () => {
    const f = await fixture();
    const group = await booking.createDirectReservation(f.dto,f.user);
    const invoice = await billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user);
    await billing.addExtraCharge(invoice.id,{description:'Food',amount:'25'},f.user);
    const charge = await prisma.billingExtraCharge.findFirstOrThrow({where:{billingId:invoice.id}});
    const payment = await payments.collect({billing_id:invoice.id,amount:'100',provider:'CASH'},f.user);
    await request(app.getHttpServer()).post(`/payments/${payment.id}/refund`).set(auth(f.token)).send({amount:'10',reason:'Audit'}).expect(201);
    await request(app.getHttpServer()).delete(`/billings/${invoice.id}/extra-charges/${charge.id}`).set(auth(f.token)).expect(200);
  });

  // The following assertions encode intended operational safeguards. Failures are audit findings.
  it('does not occupy two physical rooms when the same booking is checked in concurrently', async () => {
    const f = await fixture(2);
    const group = await booking.createDirectReservation(f.dto,f.user);
    const realLock = reservationLocks.lockReservationRoomGroup;
    let arrivals=0, release!:()=>void;
    const rendezvous=new Promise<void>(resolve=>{release=resolve;});
    const spy=jest.spyOn(reservationLocks,'lockReservationRoomGroup').mockImplementation(async (tx, roomId) => {
      if(roomId===group.rooms[0].id) { arrivals++; if(arrivals===2) release(); await rendezvous; }
      return realLock(tx,roomId);
    });
    let outcomes:PromiseSettledResult<unknown>[];
    try { outcomes=await Promise.allSettled([booking.checkInReservationRoom(group.rooms[0].id,{},f.user),booking.checkInReservationRoom(group.rooms[0].id,{},f.user)]); }
    finally {spy.mockRestore();}
    expect({successful:outcomes.filter(result=>result.status==='fulfilled').length,occupied:await prisma.room.count({where:{propertyId:f.property.id,status:'OCCUPIED'}})}).toEqual({successful:1,occupied:1});
    await expect(booking.checkInReservationRoom(group.rooms[0].id,{},f.user)).rejects.toThrow('Only booked');
    const stay=await prisma.reservationRoom.findUniqueOrThrow({where:{id:group.rooms[0].id}});
    expect((await prisma.room.findUniqueOrThrow({where:{id:stay.roomId!}})).status).toBe('OCCUPIED');
  });

  it('performs concurrent checkout only once and creates one housekeeping task', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    await booking.checkInReservationRoom(group.rooms[0].id,{},f.user);
    const outcomes=await Promise.allSettled([
      booking.checkOutReservationRoom(group.rooms[0].id,f.user),
      booking.checkOutReservationRoom(group.rooms[0].id,f.user),
    ]);
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(await prisma.housekeepingTask.count({where:{propertyId:f.property.id}})).toBe(1);
    await expect(booking.checkOutReservationRoom(group.rooms[0].id,f.user)).rejects.toThrow('Only checked-in');
  });

  it('rejects assigning a room with a dated maintenance block during the booked stay', async () => {
    const f=await fixture(2);
    const today=new Date().toISOString().slice(0,10);
    const checkout=new Date(Date.parse(today)+2*86400000).toISOString().slice(0,10);
    const group=await booking.createDirectReservation({...f.dto,check_in_date:today,check_out_date:checkout},f.user);
    const roomService=new RoomService(prisma as never,audit,background as never,inventory);
    await roomService.createOutOfServicePeriod(f.rooms[0].id,{from_date:today,to_date:today,reason:'Audit maintenance'},f.user);
    await expect(booking.checkInReservationRoom(group.rooms[0].id,{room_id:f.rooms[0].id},f.user)).rejects.toThrow();
  });

  it('keeps an already-issued full invoice aligned after changing booked stay dates', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user);
    await booking.updateDirectReservation(group.id,{...f.dto,check_out_date:'2035-01-13'},f.user);
    expect((await billing.findOne(invoice.id,f.user)).amount).toBe(300);
  });

  it.each(['automatic', 'preassigned'] as const)('checks dated maintenance for %s room assignment', async mode => {
    const f=await fixture(2);
    const group=await booking.createDirectReservation(f.dto,f.user);
    const roomService=new RoomService(prisma as never,audit,background as never,inventory);
    await roomService.createOutOfServicePeriod(f.rooms[0].id,{from_date:'2035-01-11',to_date:'2035-01-11',reason:'Test'},f.user);
    if(mode==='preassigned') {
      await prisma.reservationRoom.update({where:{id:group.rooms[0].id},data:{roomId:f.rooms[0].id}});
      await expect(booking.checkInReservationRoom(group.rooms[0].id,{},f.user)).rejects.toThrow('No physical room');
      expect(await prisma.room.count({where:{propertyId:f.property.id,status:'OCCUPIED'}})).toBe(0);
    } else {
      const checkedIn=await booking.checkInReservationRoom(group.rooms[0].id,{},f.user);
      expect(checkedIn.room.id).toBe(f.rooms[1].id);
    }
  });

  it('allows maintenance starting on checkout day or ending before arrival', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const roomService=new RoomService(prisma as never,audit,background as never,inventory);
    await roomService.createOutOfServicePeriod(f.rooms[0].id,{from_date:'2035-01-09',to_date:'2035-01-09',reason:'Before stay'},f.user);
    await roomService.createOutOfServicePeriod(f.rooms[0].id,{from_date:'2035-01-12',to_date:'2035-01-13',reason:'After stay'},f.user);
    expect((await booking.checkInReservationRoom(group.rooms[0].id,{room_id:f.rooms[0].id},f.user)).room.id).toBe(f.rooms[0].id);
  });

  it('preserves tax, extras, payments and refunds when amending a full invoice', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id,tax:'20'},f.user);
    await billing.addExtraCharge(invoice.id,{description:'Food',amount:'25'},f.user);
    const payment=await payments.collect({billing_id:invoice.id,amount:'100',provider:'CASH'},f.user);
    await payments.refund(payment.id,{amount:'10'},f.user);
    await booking.updateDirectReservation(group.id,{...f.dto,check_out_date:'2035-01-13'},f.user);
    expect(await billing.findOne(invoice.id,f.user)).toMatchObject({amount:300,tax:20,total:345,paid_total:100,refunded_total:10,balance_due:255,payment_status:'PARTIAL'});
    expect(await prisma.auditLog.count({where:{entityId:invoice.id,metadata:{path:['operation'],equals:'stay_amended'}}})).toBe(1);
  });

  it('retains overpayment as credit when a paid full invoice is shortened', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user);
    await payments.collect({billing_id:invoice.id,amount:'200',provider:'CASH'},f.user);
    await booking.updateDirectReservation(group.id,{...f.dto,check_out_date:'2035-01-11'},f.user);
    expect(await billing.findOne(invoice.id,f.user)).toMatchObject({amount:100,paid_total:200,credit_balance:100,balance_due:0,payment_status:'PAID'});
  });

  it('keeps an advance receipt unchanged until check-in expands it to the edited stay', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation({...f.dto,advance_amount:'50'},f.user);
    await booking.updateDirectReservation(group.id,{...f.dto,check_out_date:'2035-01-13'},f.user);
    expect(await billing.findReservationGroupFolio(group.id,f.user)).toMatchObject({billed_total:50,paid_total:50});
    await booking.checkInReservationRoom(group.rooms[0].id,{},f.user);
    expect(await billing.findReservationGroupFolio(group.id,f.user)).toMatchObject({billed_total:300,paid_total:50,balance_due:250});
  });

  it('serializes invoice creation with stay edits so the final full invoice is current', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    await Promise.all([
      billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user),
      booking.updateDirectReservation(group.id,{...f.dto,check_out_date:'2035-01-13'},f.user),
    ]);
    expect(await billing.findReservationGroupFolio(group.id,f.user)).toMatchObject({billed_total:300});
  });

  it('updates every full invoice in a multi-room booking and does not issue missing invoices on edit', async () => {
    const f=await fixture(3);
    const group=await booking.createDirectReservation({...f.dto,room_count:3},f.user);
    for (const room of group.rooms.slice(0,2)) await billing.createInvoice({reservation_room_id:room.id},f.user);
    await booking.updateDirectReservation(group.id,{...f.dto,room_count:3,check_out_date:'2035-01-13'},f.user);
    const folio=await billing.findReservationGroupFolio(group.id,f.user);
    expect(folio).toMatchObject({billed_total:600});
    expect(folio.invoices).toHaveLength(2);
    expect(folio.invoices.every(invoice=>invoice.amount===300)).toBe(true);
  });

  it('does not refund more than the selected original payment amount', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user);
    const first=await payments.collect({billing_id:invoice.id,amount:'50',provider:'CASH'},f.user);
    await payments.collect({billing_id:invoice.id,amount:'150',provider:'CARD'},f.user);
    await expect(payments.refund(first.id,{amount:'100',reason:'Audit payment boundary'},f.user)).rejects.toThrow();
  });

  it('tracks each payment refund separately and preserves its method', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user);
    const cash=await payments.collect({billing_id:invoice.id,amount:'50',provider:'CASH'},f.user);
    const card=await payments.collect({billing_id:invoice.id,amount:'150',provider:'CARD'},f.user);
    const refund=await payments.refund(cash.id,{amount:'30'},f.user);
    expect(await prisma.paymentTransaction.findUniqueOrThrow({where:{id:refund.id}})).toMatchObject({provider:'CASH',metadata:{original_payment_id:cash.id}});
    await expect(payments.refund(cash.id,{amount:'21'},f.user)).rejects.toThrow('selected payment');
    await payments.refund(cash.id,{amount:'20'},f.user);
    await payments.refund(card.id,{amount:'150'},f.user);
    await expect(payments.refund(cash.id,{amount:'1'},f.user)).rejects.toThrow('selected payment');
    expect(await billing.findOne(invoice.id,f.user)).toMatchObject({refunded_total:200});
  });

  it('serializes concurrent refunds against the same original payment', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user);
    const cash=await payments.collect({billing_id:invoice.id,amount:'50',provider:'CASH'},f.user);
    await payments.collect({billing_id:invoice.id,amount:'150',provider:'CARD'},f.user);
    const outcomes=await Promise.allSettled([payments.refund(cash.id,{amount:'30'},f.user),payments.refund(cash.id,{amount:'30'},f.user)]);
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(await billing.findOne(invoice.id,f.user)).toMatchObject({refunded_total:30});
  });

  it('conservatively reserves unlinked legacy refunds without assigning them to a payment', async () => {
    const f=await fixture();
    const group=await booking.createDirectReservation(f.dto,f.user);
    const invoice=await billing.createInvoice({reservation_room_id:group.rooms[0].id},f.user);
    const cash=await payments.collect({billing_id:invoice.id,amount:'50',provider:'CASH'},f.user);
    await payments.collect({billing_id:invoice.id,amount:'150',provider:'CARD'},f.user);
    const legacy=await prisma.paymentTransaction.create({data:{billingId:invoice.id,amount:30,status:'REFUNDED',provider:'CASH'}});
    await expect(payments.refund(cash.id,{amount:'21'},f.user)).rejects.toThrow('selected payment');
    await payments.refund(cash.id,{amount:'20'},f.user);
    expect((await prisma.paymentTransaction.findUniqueOrThrow({where:{id:legacy.id}})).metadata).toBeNull();
  });
});
