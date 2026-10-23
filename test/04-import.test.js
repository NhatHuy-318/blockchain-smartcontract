// Bước 3: nhập khẩu (recordImport)
const { Role, Status, Doc, ZERO_ADDRESS, ZERO_HASH } = require('./lib');

module.exports = {
  group: 'Bước 3: Nhập khẩu',
  async run(t, env) {
    const { c, a, grant, grantAll, make, status } = env;
    await grantAll();
    const imp = (id, o = {}) => c.methods.recordImport(id, o.origin ?? 'Ấn Độ', o.decl ?? '105123456789', o.date ?? 1757894400, o.h ?? Doc.decl);

    const b1 = await make('LOT-1', 'Tested');
    const tx = await imp(b1).send({ from: a.imp, gas: 3e5 });
    const ev = tx.events.BatchImported.returnValues;
    const g = await c.methods.getBatch(b1).call();
    t.ok('Importer được chỉ định nhập khẩu lô Tested: sang Imported, người giữ là Importer',
      Number(g.status) === Status.Imported && g.holder === a.imp && g.manufacturer === a.mfr && g.receiver === ZERO_ADDRESS
      && Number(ev.batchId) === b1 && ev.importer === a.imp && ev.docHash === Doc.decl && ev.originCountry === 'Ấn Độ'
      && ev.customsDeclNo === '105123456789' && Number(ev.importDate) === 1757894400,
      { id: 'TC19', expected: 'Trạng thái Imported; người giữ lô là Importer; event BatchImported đúng dữ liệu' });

    await t.reverts('nhập khẩu lại lô đã Imported', imp(b1).call({ from: a.imp }), 'BR: wrong status');
    const bReg = await make('LOT-REG');
    await t.reverts('nhập khẩu lô chưa kiểm nghiệm (Registered)', imp(bReg).call({ from: a.imp }), 'BR: wrong status',
      { id: 'TC20', expected: 'Từ chối: BR: wrong status' });
    const bRej = await make('LOT-REJ', 'Rejected');
    await t.reverts('nhập khẩu lô Rejected', imp(bRej).call({ from: a.imp }), 'BR: wrong status');

    const b2 = await make('LOT-2', 'Tested');
    await t.reverts('Importer khác không được chỉ định', imp(b2).call({ from: a.imp2 }), 'BR: not designated',
      { id: 'TC21', expected: 'Từ chối: BR: not designated' });
    for (const [who, name] of [[a.mfr, 'Manufacturer'], [a.insp, 'Inspector'], [a.rcv, 'Receiver'], [a.admin, 'Admin'], [a.other, 'ví không vai trò']])
      await t.reverts(`${name} ghi nhập khẩu`, imp(b2).call({ from: who }), 'BR: wrong role');
    await t.reverts('lô không tồn tại', imp(99).call({ from: a.imp }), 'BR: batch not found');
    await t.reverts('hash tờ khai bằng 0', imp(b2, { h: ZERO_HASH }).call({ from: a.imp }), 'BR: zero hash');
    await t.reverts('nước xuất xứ rỗng', imp(b2, { origin: '' }).call({ from: a.imp }), 'BR: empty origin');
    await t.reverts('số tờ khai rỗng', imp(b2, { decl: '' }).call({ from: a.imp }), 'BR: empty customsDeclNo');
    await t.reverts('ngày nhập khẩu = 0', imp(b2, { date: 0 }).call({ from: a.imp }), 'BR: invalid date');
    await t.reverts('ngày nhập khẩu trong tương lai', imp(b2, { date: (await env.now()) + 86400 }).call({ from: a.imp }), 'BR: invalid date');
    const g2 = await c.methods.getBatch(b2).call();
    t.ok('lô bị từ chối vẫn ở Tested, người giữ vẫn là Manufacturer', Number(g2.status) === Status.Tested && g2.holder === a.mfr);

    await c.methods.revokeRole(a.imp).send({ from: a.admin, gas: 3e5 });
    await t.reverts('Importer được chỉ định đã bị thu hồi', imp(b2).call({ from: a.imp }), 'BR: wrong role');
    await grant(a.imp, Role.Importer, 'Công ty nhập khẩu Gamma');
    await imp(b2).send({ from: a.imp, gas: 3e5 });
    t.ok('cấp lại vai trò Importer cho đúng ví thì nhập khẩu được lô cũ', (await status(b2)) === Status.Imported);
  },
};
