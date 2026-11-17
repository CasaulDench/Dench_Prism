import { PrismaClient, Role } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../src/lib/accounting/chartOfAccounts';
import { AccountingService } from '../src/services/accountingService';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding for PRISM...');

  // 1. Clean existing records (in reverse relation order)
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.updateMany({ data: { reversesId: null } });
  await prisma.journalEntry.deleteMany();
  await prisma.account.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.cashReconciliation.deleteMany();
  await prisma.salesReading.deleteMany();
  await prisma.transactionItem.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.productIngredient.deleteMany();
  await prisma.product.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.coopMember.deleteMany();
  await prisma.schoolBranch.deleteMany();
  await prisma.user.deleteMany();

  // 2. Seed Users
  console.log('Seeding users...');
  const adminUser = await prisma.user.create({
    data: {
      id: 'admin',
      username: 'admin',
      password: 'admin123',
      name: 'Admin User',
      role: Role.ADMIN,
    },
  });

  const cashierUser = await prisma.user.create({
    data: {
      id: 'cashier',
      username: 'user',
      password: 'user123',
      name: 'Standard Cashier',
      role: Role.CASHIER,
    },
  });

  const managerUser = await prisma.user.create({
    data: {
      id: 'manager',
      username: 'manager',
      password: 'manager123',
      name: 'Elena Gomez',
      role: Role.MANAGER,
    },
  });

  // 3. Seed School Branches (Cooperatives)
  console.log('Seeding school branches...');
  const gordonCollege = await prisma.schoolBranch.create({
    data: {
      name: 'Gordon College',
      address: 'Olongapo City Sports Complex, East Tapinac',
      level: 'College',
      monthlyProfit: new Decimal('124500.00'),
      stockStatus: 'In Stock',
    },
  });

  const staRitaElem = await prisma.schoolBranch.create({
    data: {
      name: 'Sta. Rita Elementary',
      address: 'Sta. Rita Road, Barangay Sta. Rita',
      level: 'Elementary',
      monthlyProfit: new Decimal('88230.50'),
      stockStatus: 'Low Stock',
    },
  });

  const tapinacHigh = await prisma.schoolBranch.create({
    data: {
      name: 'Tapinac Senior High School',
      address: 'Donor Street, East Tapinac, Olongapo City',
      level: 'High School',
      monthlyProfit: new Decimal('215900.00'),
      stockStatus: 'Stock Out',
    },
  });

  const ocnhs = await prisma.schoolBranch.create({
    data: {
      name: 'Olongapo City National High School',
      address: 'Rizal Avenue corner 14th Street, East Bajac-Bajac',
      level: 'High School',
      monthlyProfit: new Decimal('92400.00'),
      stockStatus: 'In Stock',
    },
  });

  // 4. Seed Coop Members
  console.log('Seeding cooperative members...');
  const member1 = await prisma.coopMember.create({
    data: {
      memberCode: 'MEM-GC-001',
      fullName: 'Maria Santos',
      email: 'm.santos@gordoncollege.edu.ph',
      phone: '0917-123-4567',
      branchId: gordonCollege.id,
      status: 'ACTIVE',
      shareCapital: new Decimal('15000.00'),
      accumulatedPatronage: new Decimal('3420.50'),
    },
  });

  const member2 = await prisma.coopMember.create({
    data: {
      memberCode: 'MEM-SRE-002',
      fullName: 'Juan Dela Cruz',
      email: 'j.delacruz@deped.gov.ph',
      phone: '0920-987-6543',
      branchId: staRitaElem.id,
      status: 'ACTIVE',
      shareCapital: new Decimal('10000.00'),
      accumulatedPatronage: new Decimal('1850.00'),
    },
  });

  const member3 = await prisma.coopMember.create({
    data: {
      memberCode: 'MEM-THS-003',
      fullName: 'Robert Tan',
      email: 'r.tan@tapinachs.edu.ph',
      phone: '0918-555-7890',
      branchId: tapinacHigh.id,
      status: 'ACTIVE',
      shareCapital: new Decimal('20000.00'),
      accumulatedPatronage: new Decimal('5200.00'),
    },
  });

  // 5. Seed Inventory Items (Raw materials / Supplies)
  console.log('Seeding inventory items...');
  const beefPatty = await prisma.inventoryItem.create({
    data: {
      name: 'Premium Beef Patty',
      packaging: 'Box of 50',
      sku: 'PRM-BP-050',
      category: 'Proteins',
      supplier: 'Meat Masters Inc.',
      deliveryDays: 'Mon, Thu',
      price: new Decimal('4250.00'),
      stock: new Decimal('50.000'), // 50 individual patties or units
      unit: 'Pcs',
      status: 'Optimal',
    },
  });

  const briocheBuns = await prisma.inventoryItem.create({
    data: {
      name: 'Artisan Brioche Buns',
      packaging: 'Pack of 12',
      sku: 'BKY-BB-012',
      category: 'Bakery',
      supplier: 'Local Oven Co.',
      deliveryDays: 'Tue, Fri',
      price: new Decimal('300.00'),
      stock: new Decimal('100.000'), // 100 buns
      unit: 'Pcs',
      status: 'Optimal',
    },
  });

  const springWater = await prisma.inventoryItem.create({
    data: {
      name: 'Spring Water 500ml',
      packaging: 'Case of 24',
      sku: 'BEV-SW-500',
      category: 'Beverages',
      supplier: 'Aqua Pure Dist.',
      deliveryDays: 'Daily',
      price: new Decimal('625.00'),
      stock: new Decimal('145.000'),
      unit: 'Bottles',
      status: 'Optimal',
    },
  });

  const espressoBeans = await prisma.inventoryItem.create({
    data: {
      name: 'Espresso Roast Beans',
      packaging: '1kg Bag',
      sku: 'BEV-CB-1KG',
      category: 'Beverages',
      supplier: 'Global Roasters',
      deliveryDays: 'Wed',
      price: new Decimal('1200.00'),
      stock: new Decimal('32.000'), // 32.000 kg
      unit: 'kg',
      status: 'Optimal',
    },
  });

  // 6. Seed Finished Products (POS Catalog)
  console.log('Seeding products...');
  const burgerProduct = await prisma.product.create({
    data: {
      name: 'Classic Cheeseburger',
      sku: 'MEAL-001',
      category: 'Hot Meals',
      price: new Decimal('275.00'),
      stock: 45,
      image: '',
    },
  });

  const pepperoniProduct = await prisma.product.create({
    data: {
      name: 'Pepperoni Slice',
      sku: 'MEAL-012',
      category: 'Hot Meals',
      price: new Decimal('150.00'),
      stock: 20,
      image: '',
    },
  });

  const latteProduct = await prisma.product.create({
    data: {
      name: 'Iced Latte',
      sku: 'BEV-045',
      category: 'Beverages',
      price: new Decimal('225.00'),
      stock: 35,
      image: '',
    },
  });

  const waterProduct = await prisma.product.create({
    data: {
      name: 'Bottled Water',
      sku: 'BEV-001',
      category: 'Beverages',
      price: new Decimal('75.00'),
      stock: 145,
      image: '',
    },
  });

  // 7. Seed ProductIngredient Recipes (Linking Products to raw Inventory)
  console.log('Seeding product recipe ingredients...');
  // 1 Classic Cheeseburger requires 1 Beef Patty and 2 Brioche Buns
  await prisma.productIngredient.create({
    data: {
      productId: burgerProduct.id,
      inventoryItemId: beefPatty.id,
      quantityRequired: new Decimal('1.000'),
    },
  });

  await prisma.productIngredient.create({
    data: {
      productId: burgerProduct.id,
      inventoryItemId: briocheBuns.id,
      quantityRequired: new Decimal('2.000'),
    },
  });

  // 1 Iced Latte requires 0.020 kg of Espresso Roast Beans
  await prisma.productIngredient.create({
    data: {
      productId: latteProduct.id,
      inventoryItemId: espressoBeans.id,
      quantityRequired: new Decimal('0.020'),
    },
  });

  // 1 Bottled Water sells 1 Spring Water Bottle directly
  await prisma.productIngredient.create({
    data: {
      productId: waterProduct.id,
      inventoryItemId: springWater.id,
      quantityRequired: new Decimal('1.000'),
    },
  });

  // 8. Seed Vendors (concessionaires) and their consigned products
  console.log('Seeding vendors and consigned products...');
  const kakanin = await prisma.vendor.create({
    data: {
      name: "Aling Nena's Kakanin",
      contactPerson: 'Nena Bautista',
      phone: '0917-222-3344',
      coopSharePercent: new Decimal('15.00'),
    },
  });
  const bakeshop = await prisma.vendor.create({
    data: {
      name: 'Subic Bay Bakeshop',
      contactPerson: 'Ramon Lim',
      phone: '0928-111-2233',
      coopSharePercent: new Decimal('12.50'),
    },
  });

  const vendorProducts = await Promise.all([
    prisma.product.create({
      data: { name: 'Pancit Canton', sku: 'VND-KAK-001', category: 'Hot Meals', price: new Decimal('60.00'), stock: 200, image: '', vendorId: kakanin.id },
    }),
    prisma.product.create({
      data: { name: 'Bibingka', sku: 'VND-KAK-002', category: 'Snacks', price: new Decimal('35.00'), stock: 200, image: '', vendorId: kakanin.id },
    }),
    prisma.product.create({
      data: { name: 'Pandesal (6 pcs)', sku: 'VND-SBB-001', category: 'Bakery', price: new Decimal('30.00'), stock: 200, image: '', vendorId: bakeshop.id },
    }),
    prisma.product.create({
      data: { name: 'Ensaymada', sku: 'VND-SBB-002', category: 'Bakery', price: new Decimal('45.00'), stock: 200, image: '', vendorId: bakeshop.id },
    }),
  ]);

  // 9. Seed sample sales history for the last 3 Manila business days (incl. today),
  // so the Daily Sales module has data before the POS is wired to checkout.
  // Written directly (not via TransactionService) so stock levels stay untouched.
  console.log('Seeding sample sales history...');
  const catalog = [
    { p: burgerProduct, vendor: null },
    { p: pepperoniProduct, vendor: null },
    { p: latteProduct, vendor: null },
    { p: waterProduct, vendor: null },
    { p: vendorProducts[0], vendor: kakanin },
    { p: vendorProducts[1], vendor: kakanin },
    { p: vendorProducts[2], vendor: bakeshop },
    { p: vendorProducts[3], vendor: bakeshop },
  ];

  let rngState = 20261117;
  const rand = () => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
    return rngState / 0x100000000;
  };

  const manilaToday = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  let txSeq = 1001;
  for (let dayOffset = 2; dayOffset >= 0; dayOffset--) {
    const dayStart = new Date(new Date(`${manilaToday}T00:00:00+08:00`).getTime() - dayOffset * 86_400_000);
    const salesToday = dayOffset === 0 ? 14 : 24;
    const minutes = Array.from({ length: salesToday }, () => (7 + Math.floor(rand() * 10)) * 60 + Math.floor(rand() * 60)).sort((a, b) => a - b);

    for (const minute of minutes) {
      const createdAt = new Date(dayStart.getTime() + minute * 60_000);
      if (createdAt > new Date()) continue; // never seed sales in the future

      const lines = new Map<number, { entry: (typeof catalog)[number]; qty: number }>();
      const lineCount = 1 + Math.floor(rand() * 3);
      for (let l = 0; l < lineCount; l++) {
        const entry = catalog[Math.floor(rand() * catalog.length)];
        const existing = lines.get(entry.p.id);
        if (existing) existing.qty += 1;
        else lines.set(entry.p.id, { entry, qty: 1 + Math.floor(rand() * 2) });
      }

      const items = [...lines.values()].map(({ entry, qty }) => ({
        productId: entry.p.id,
        quantity: qty,
        unitPrice: entry.p.price,
        subtotal: entry.p.price.mul(qty),
        vendorId: entry.vendor?.id ?? null,
        coopSharePercent: entry.vendor?.coopSharePercent ?? null,
      }));
      const subtotal = items.reduce((a, i) => a.add(i.subtotal), new Decimal(0));
      const taxAmount = subtotal.mul('0.05').toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      await prisma.transaction.create({
        data: {
          transactionNumber: `#${txSeq++}`,
          cashierId: rand() < 0.6 ? cashierUser.id : managerUser.id,
          memberId: rand() < 0.3 ? [member1, member2, member3][Math.floor(rand() * 3)].id : null,
          subtotal,
          taxAmount,
          totalAmount: subtotal.add(taxAmount),
          paymentMethod: 'CASH',
          status: rand() < 0.05 ? 'VOIDED' : 'COMPLETED',
          createdAt,
          items: { create: items },
        },
      });
    }
  }

  // 10. Seed the general ledger: chart of accounts, opening balances, last
  // month's activity and this month's expenses, then post every seeded POS
  // sale through the same code path the live POS uses.
  console.log('Seeding chart of accounts and general ledger...');
  await seedLedger(managerUser.id, manilaToday);
  const posted = await AccountingService.syncPendingPostings();
  console.log(`  posted ${posted.salesPosted} POS sales to the ledger`);

  // 11. Seed Initial Audit Log
  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'SYSTEM_INITIALIZATION',
      entityType: 'System',
      details: JSON.stringify({ note: 'Initial schema and seed dataset loaded successfully' }),
    },
  });

  console.log('✅ Database seeding completed successfully!');
}

/**
 * Opening balances plus a month and a half of typical canteen bookkeeping,
 * dated relative to today so the statements always have recent data.
 */
async function seedLedger(createdById: string, today: string) {
  for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
    await prisma.account.create({
      data: {
        code: a.code,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        description: a.description ?? null,
        systemKey: a.systemKey ?? null,
      },
    });
  }
  const accounts = await prisma.account.findMany({ select: { id: true, code: true } });
  const id = new Map(accounts.map((a) => [a.code, a.id]));

  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevLast = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const prev = (d: number) => `${prevY}-${pad(prevM)}-${pad(Math.min(d, prevLast))}`;
  const curr = (d: number) => `${y}-${pad(m)}-${pad(d)}`;

  // Share capital on the books matches what the seeded members have paid up.
  const memberCapital = await prisma.coopMember.aggregate({ _sum: { shareCapital: true } });
  const shareCapital = Number(memberCapital._sum.shareCapital ?? 0);

  type L = [code: string, debit: number, credit: number, memo?: string];
  const entries: { date: string; description: string; reference?: string; source: 'OPENING' | 'MANUAL'; lines: L[] }[] = [
    {
      date: prev(1),
      source: 'OPENING',
      description: 'Opening balances carried forward',
      lines: [
        ['1010', 5000, 0],
        ['1020', 120000, 0],
        ['1200', 60000, 0],
        ['1500', 180000, 0],
        ['1520', 45000, 0],
        ['1510', 0, 36000],
        ['2010', 0, 18500],
        ['3010', 0, shareCapital],
        ['3030', 0, 410000 - 36000 - 18500 - shareCapital],
      ],
    },
    { date: prev(5), source: 'MANUAL', reference: 'SI-0412', description: 'Purchase of beef patties on account – Meat Masters Inc.', lines: [['1200', 22400, 0], ['2010', 0, 22400]] },
    { date: prev(10), source: 'MANUAL', reference: 'CV-1031', description: 'Payment to suppliers', lines: [['2010', 18500, 0], ['1020', 0, 18500]] },
    { date: prev(15), source: 'MANUAL', reference: 'PR-10A', description: 'Canteen staff salaries', lines: [['6010', 28000, 0], ['1020', 0, 28000]] },
    { date: prev(20), source: 'MANUAL', reference: 'OLECO-10', description: 'Electricity and water bill', lines: [['6020', 6850, 0], ['1020', 0, 6850]] },
    { date: prev(25), source: 'MANUAL', reference: 'OR-2210', description: 'Canteen space rental – City Government', lines: [['6030', 5000, 0], ['1020', 0, 5000]] },
    { date: prev(27), source: 'MANUAL', reference: 'SI-7781', description: 'Purchase of chest freezer', lines: [['1500', 32000, 0], ['1020', 0, 32000]] },
    { date: prev(28), source: 'MANUAL', reference: 'OR-0098', description: 'Additional share capital paid by members', lines: [['1020', 10000, 0], ['3010', 0, 10000]] },
    {
      date: prev(prevLast),
      source: 'MANUAL',
      reference: 'SUM-PREV',
      description: 'Canteen sales for the month before the POS went live (summary)',
      lines: [['1020', 96600, 0], ['4010', 0, 92000], ['2030', 0, 4600], ['5010', 51000, 0], ['1200', 0, 51000]],
    },
    { date: prev(prevLast), source: 'MANUAL', description: 'Monthly depreciation – kitchen equipment', lines: [['6060', 3000, 0], ['1510', 0, 3000]] },
    { date: curr(3), source: 'MANUAL', reference: 'CV-1102', description: 'Purchase of beverages and dry goods', lines: [['1200', 15750, 0], ['1020', 0, 15750]] },
    { date: curr(8), source: 'MANUAL', reference: 'TAX-REM', description: 'Remittance of last month’s output tax', lines: [['2030', 4600, 0], ['1020', 0, 4600]] },
    { date: curr(12), source: 'MANUAL', reference: 'CV-1109', description: 'Cleaning and kitchen supplies', lines: [['6040', 2340, 0], ['1020', 0, 2340]] },
    { date: curr(15), source: 'MANUAL', reference: 'PR-11A', description: 'Canteen staff salaries', lines: [['6010', 28000, 0], ['1020', 0, 28000]] },
  ];

  for (const e of entries) {
    if (e.date > today) continue; // never seed future-dated entries
    await prisma.journalEntry.create({
      data: {
        date: new Date(`${e.date}T00:00:00Z`),
        description: e.description,
        reference: e.reference ?? null,
        source: e.source,
        createdById,
        lines: {
          create: e.lines.map(([code, debit, credit, memo]) => ({
            accountId: id.get(code)!,
            debit: new Decimal(debit.toFixed(2)),
            credit: new Decimal(credit.toFixed(2)),
            memo: memo ?? null,
          })),
        },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
