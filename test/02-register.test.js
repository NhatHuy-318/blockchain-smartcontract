// Bước 1: đăng ký lô (registerBatch)
const { Status, Doc, DAY, ZERO_ADDRESS, ZERO_HASH } = require('./lib');

module.exports = {
  group: 'Bước 1: Đăng ký lô',
  async run(t, env) {
    const { c, a, now, mine, grantAll } = env;
    await grantAll();
    const t0 = await now();
    const mfg = t0 - DAY, exp = t0 + 3 * 365 * DAY;
    const reg = (o = {}) => c.methods.registerBatch(
      o.no ?? 'PEN-K-20260901-001', o.mat ?? 'Penicillin G potassium', o.mfg ?? mfg, o.exp ?? exp,
      o.st ?? 'Nơi khô mát, dưới 25 độ C', o.imp ?? a.imp, o.h ?? Doc.coa);

    t.ok('eth_call trả trước batchId = 1', Number(await reg().call({ from: a.mfr })) === 1);
    const tx = await reg().send({ from: a.mfr, gas: 1e6 });
    const ev = tx.events.BatchRegistered.returnValues;
    const b = await c.methods.getBatch(1).call();
    t.ok('Manufacturer đăng ký lô hợp lệ: trạng thái Registered, người giữ là Manufacturer, event đủ 10 trường',
      Number(b.status) === Status.Registered && b.holder === a.mfr && b.importer === a.imp && b.receiver === ZERO_ADDRESS
      && Number(b.expiryDate) === exp && Number(b.createdAt) > 0
      && Number(ev.batchId) === 1 && ev.manufacturer === a.mfr && ev.docHash === Doc.coa && ev.batchNo === 'PEN-K-20260901-001'
      && ev.materialName === 'Penicillin G potassium' && Number(ev.mfgDate) === mfg && Number(ev.expiryDate) === exp
      && ev.storageConditions === 'Nơi khô mát, dưới 25 độ C' && ev.importer === a.imp && Number(ev.at) > 0,
      { id: 'TC08', expected: 'batchId = 1; trạng thái Registered; event BatchRegistered đủ dữ liệu' });
    t.ok('getBatchCount = 1, getBatchIdByNo tra đúng', Number(await c.methods.getBatchCount().call()) === 1
      && Number(await c.methods.getBatchIdByNo('PEN-K-20260901-001').call()) === 1);

    await t.reverts('Inspector đăng ký lô', reg({ no: 'X1' }).call({ from: a.insp }), 'BR: wrong role',
      { id: 'TC09', expected: 'Từ chối: BR: wrong role' });
    await t.reverts('Admin đăng ký lô', reg({ no: 'X1' }).call({ from: a.admin }), 'BR: wrong role');
    await t.reverts('ví không vai trò đăng ký lô', reg({ no: 'X1' }).call({ from: a.other }), 'BR: wrong role');
    await t.reverts('trùng số lô', reg().call({ from: a.mfr }), 'BR: batchNo used',
      { id: 'TC10', expected: 'Từ chối: BR: batchNo used' });
    await t.reverts('trùng số lô với lô của nhà sản xuất khác', reg().call({ from: a.mfr2 }), 'BR: batchNo used');
    await t.reverts('hash COA bằng 0', reg({ no: 'X1', h: ZERO_HASH }).call({ from: a.mfr }), 'BR: zero hash',
      { id: 'TC14', expected: 'Từ chối: BR: zero hash' });
    await t.reverts('số lô rỗng', reg({ no: '' }).call({ from: a.mfr }), 'BR: empty batchNo');
    await t.reverts('tên nguyên liệu rỗng', reg({ no: 'X1', mat: '' }).call({ from: a.mfr }), 'BR: empty material');
    await t.reverts('ngày sản xuất bằng hạn dùng', reg({ no: 'X1', mfg: exp, exp }).call({ from: a.mfr }), 'BR: invalid dates',
      { id: 'TC11', expected: 'Từ chối: BR: invalid dates' });
    await t.reverts('ngày sản xuất sau hạn dùng', reg({ no: 'X1', mfg: exp + 1, exp }).call({ from: a.mfr }), 'BR: invalid dates');
    await t.reverts('hạn dùng đã qua', reg({ no: 'X1', mfg: t0 - 10 * DAY, exp: t0 - DAY }).call({ from: a.mfr }), 'BR: expired',
      { id: 'TC12', expected: 'Từ chối: BR: expired' });
    await t.reverts('Importer chỉ định là ví Receiver', reg({ no: 'X1', imp: a.rcv }).call({ from: a.mfr }), 'BR: not importer',
      { id: 'TC13', expected: 'Từ chối: BR: not importer' });
    await t.reverts('Importer chỉ định là ví không vai trò', reg({ no: 'X1', imp: a.other }).call({ from: a.mfr }), 'BR: not importer');
    await t.reverts('Importer chỉ định là địa chỉ 0', reg({ no: 'X1', imp: ZERO_ADDRESS }).call({ from: a.mfr }), 'BR: not importer');

    await reg({ no: 'PEN-K-20260901-002' }).send({ from: a.mfr2, gas: 1e6 });
    t.ok('lô thứ hai của nhà sản xuất khác có batchId = 2', Number(await c.methods.getBatchIdByNo('PEN-K-20260901-002').call()) === 2);

    await c.methods.revokeRole(a.imp2).send({ from: a.admin, gas: 3e5 });
    await t.reverts('chỉ định Importer đã bị thu hồi', reg({ no: 'X3', imp: a.imp2 }).call({ from: a.mfr }), 'BR: not importer');

    const t1 = await now();
    await reg({ no: 'SHORT-001', mfg: t1 - DAY, exp: t1 + 120 }).send({ from: a.mfr, gas: 1e6 });
    const before = await c.methods.isExpired(3).call();
    await mine(300);
    t.ok('lô hạn ngắn: isExpired chuyển từ false sang true khi qua hạn', before === false && (await c.methods.isExpired(3).call()) === true);
    t.ok('gas registerBatch dưới 250.000', Number(tx.gasUsed) < 250000);
  },
};
