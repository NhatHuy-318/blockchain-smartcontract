// Bước 6: kiểm tra tại nơi nhận (recordReceivingInspection)
const { Status, Doc, ZERO_HASH } = require('./lib');

module.exports = {
  group: 'Bước 6: Kiểm tra tại nơi nhận',
  async run(t, env) {
    const { c, a, grantAll, make, status } = env;
    await grantAll();
    const qc = (id, passed, o = {}) => c.methods.recordReceivingInspection(id, passed, o.rep ?? 'QC-DELTA-0457', o.date ?? 1758672000, o.h ?? Doc.qc);

    const b1 = await make('LOT-1', 'Received');
    const tx = await qc(b1, true).send({ from: a.rcv, gas: 3e5 });
    const ev = tx.events.ReceivingInspected.returnValues;
    const g = await c.methods.getBatch(b1).call();
    t.ok('kiểm tra tại nơi nhận Đạt: Received sang Released',
      Number(g.status) === Status.Released && g.holder === a.rcv && Number(ev.batchId) === b1 && ev.receiver === a.rcv
      && ev.docHash === Doc.qc && ev.passed === true && ev.reportNo === 'QC-DELTA-0457' && Number(ev.inspectDate) === 1758672000,
      { id: 'TC26', expected: 'Trạng thái Released (được đưa vào sử dụng); event ReceivingInspected' });

    const b2 = await make('LOT-2', 'Received');
    await qc(b2, false, { rep: 'QC-DELTA-0458' }).send({ from: a.rcv, gas: 3e5 });
    t.ok('kiểm tra tại nơi nhận Không đạt: Received sang Quarantined', (await status(b2)) === Status.Quarantined,
      { id: 'TC27', expected: 'Trạng thái Quarantined (biệt trữ, kết thúc)' });

    await t.reverts('ghi lại kết quả cho lô đã Released', qc(b1, true).call({ from: a.rcv }), 'BR: wrong status',
      { id: 'TC28', expected: 'Từ chối: BR: wrong status' });
    await t.reverts('ghi lại lô đã Released thành Không đạt', qc(b1, false).call({ from: a.rcv }), 'BR: wrong status');
    await t.reverts('ghi lại lô đã Quarantined', qc(b2, true).call({ from: a.rcv }), 'BR: wrong status');
    await t.reverts('lô Released không chuyển giao lại được', c.methods.initiateTransfer(b1, a.rcv2, Doc.delivery).call({ from: a.imp }), 'BR: wrong status');
    await t.reverts('lô Quarantined không xác nhận lại được', c.methods.confirmTransfer(b2, Doc.receipt).call({ from: a.rcv }), 'BR: wrong status');

    await t.reverts('lô Imported (chưa giao)', qc(await make('LOT-IMP', 'Imported'), true).call({ from: a.rcv }), 'BR: wrong status');
    await t.reverts('lô InTransfer (chưa xác nhận tiếp nhận)', qc(await make('LOT-TR', 'InTransfer'), true).call({ from: a.rcv }), 'BR: wrong status');

    const b3 = await make('LOT-3', 'Received');
    await t.reverts('Receiver khác không được chỉ định', qc(b3, true).call({ from: a.rcv2 }), 'BR: not designated');
    for (const [who, name] of [[a.mfr, 'Manufacturer'], [a.insp, 'Inspector'], [a.imp, 'Importer'], [a.admin, 'Admin'], [a.other, 'ví không vai trò']])
      await t.reverts(`${name} ghi kiểm tra tại nơi nhận`, qc(b3, true).call({ from: who }), 'BR: wrong role');
    await t.reverts('lô không tồn tại', qc(99, true).call({ from: a.rcv }), 'BR: batch not found');
    await t.reverts('hash phiếu bằng 0', qc(b3, true, { h: ZERO_HASH }).call({ from: a.rcv }), 'BR: zero hash');
    await t.reverts('số phiếu rỗng', qc(b3, true, { rep: '' }).call({ from: a.rcv }), 'BR: empty reportNo');
    t.ok('lô bị từ chối vẫn ở Received', (await status(b3)) === Status.Received);
  },
};
