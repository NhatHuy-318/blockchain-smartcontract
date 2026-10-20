// Bước 2: kiểm nghiệm (recordTestResult)
const { Status, Doc, ZERO_HASH } = require('./lib');

module.exports = {
  group: 'Bước 2: Kiểm nghiệm',
  async run(t, env) {
    const { c, a, grantAll, make, status } = env;
    await grantAll();
    const test = (id, passed, o = {}) => c.methods.recordTestResult(id, passed, o.rep ?? 'KN-0932', o.date ?? 1757030400, o.h ?? Doc.test);

    const b1 = await make('LOT-PASS');
    const tx = await test(b1, true).send({ from: a.insp, gas: 3e5 });
    const ev = tx.events.BatchTested.returnValues;
    const g = await c.methods.getBatch(b1).call();
    t.ok('kiểm nghiệm Đạt: Registered sang Tested, event BatchTested đủ trường',
      Number(g.status) === Status.Tested && g.holder === a.mfr && Number(ev.batchId) === b1 && ev.inspector === a.insp
      && ev.docHash === Doc.test && ev.passed === true && ev.reportNo === 'KN-0932' && Number(ev.testDate) === 1757030400,
      { id: 'TC15', expected: 'Trạng thái Tested; event BatchTested đúng dữ liệu' });

    const b2 = await make('LOT-FAIL');
    await test(b2, false, { rep: 'KN-0933' }).send({ from: a.insp2, gas: 3e5 });
    t.ok('kiểm nghiệm Không đạt (Inspector khác): Registered sang Rejected', (await status(b2)) === Status.Rejected,
      { id: 'TC16', expected: 'Trạng thái Rejected (kết thúc)' });

    await t.reverts('ghi lại kết quả cho lô đã Tested', test(b1, true).call({ from: a.insp }), 'BR: wrong status',
      { id: 'TC17', expected: 'Từ chối: BR: wrong status' });
    await t.reverts('ghi lại lô đã Tested thành Không đạt', test(b1, false).call({ from: a.insp }), 'BR: wrong status');
    await t.reverts('ghi lại lô đã Rejected', test(b2, true).call({ from: a.insp }), 'BR: wrong status');

    const b3 = await make('LOT-3');
    await t.reverts('Manufacturer ghi kết quả kiểm nghiệm', test(b3, true).call({ from: a.mfr }), 'BR: wrong role',
      { id: 'TC18', expected: 'Từ chối: BR: wrong role' });
    for (const [who, name] of [[a.imp, 'Importer'], [a.rcv, 'Receiver'], [a.admin, 'Admin'], [a.other, 'ví không vai trò']])
      await t.reverts(`${name} ghi kết quả kiểm nghiệm`, test(b3, true).call({ from: who }), 'BR: wrong role');
    await t.reverts('lô không tồn tại', test(99, true).call({ from: a.insp }), 'BR: batch not found');
    await t.reverts('batchId = 0', test(0, true).call({ from: a.insp }), 'BR: batch not found');
    await t.reverts('hash phiếu bằng 0', test(b3, true, { h: ZERO_HASH }).call({ from: a.insp }), 'BR: zero hash');
    await t.reverts('số phiếu rỗng', test(b3, true, { rep: '' }).call({ from: a.insp }), 'BR: empty reportNo');
    t.ok('lô bị từ chối vẫn ở Registered', (await status(b3)) === Status.Registered);

    await c.methods.revokeRole(a.insp2).send({ from: a.admin, gas: 3e5 });
    await t.reverts('Inspector đã bị thu hồi', test(b3, true).call({ from: a.insp2 }), 'BR: wrong role');

    const byHash = await c.getPastEvents('BatchTested', { filter: { docHash: Doc.test }, fromBlock: 0 });
    // b1 và b2 dùng chung hash phiếu mẫu nên lọc ra đúng 2 event
    t.ok('lọc BatchTested theo hash phiếu', byHash.map(e => Number(e.returnValues.batchId)).join() === `${b1},${b2}`);
  },
};
