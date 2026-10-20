// Bước 4 và 5: chuyển giao hai chiều (initiateTransfer, confirmTransfer)
const { Role, Status, Doc, ZERO_ADDRESS, ZERO_HASH } = require('./lib');

module.exports = {
  group: 'Bước 4–5: Chuyển giao',
  async run(t, env) {
    const { c, a, grant, grantAll, make, status } = env;
    await grantAll();
    const init = (id, to = a.rcv, h = Doc.delivery) => c.methods.initiateTransfer(id, to, h);
    const conf = (id, h = Doc.receipt) => c.methods.confirmTransfer(id, h);
    const get = id => c.methods.getBatch(id).call();

    // Bước 4
    const b1 = await make('LOT-1', 'Imported');
    const tx1 = await init(b1).send({ from: a.imp, gas: 3e5 });
    const e1 = tx1.events.TransferInitiated.returnValues;
    let g = await get(b1);
    t.ok('Importer khởi tạo chuyển giao: sang InTransfer, ghi Receiver, người giữ vẫn là Importer',
      Number(g.status) === Status.InTransfer && g.receiver === a.rcv && g.holder === a.imp
      && Number(e1.batchId) === b1 && e1.from === a.imp && e1.to === a.rcv && e1.docHash === Doc.delivery,
      { id: 'TC22', expected: 'Trạng thái InTransfer; Receiver được ghi nhận; event TransferInitiated' });
    await t.reverts('khởi tạo lại lô đã InTransfer', init(b1).call({ from: a.imp }), 'BR: wrong status');

    const b2 = await make('LOT-2', 'Imported');
    await t.reverts('Importer khác không được chỉ định', init(b2).call({ from: a.imp2 }), 'BR: not designated');
    for (const [who, name] of [[a.mfr, 'Manufacturer'], [a.insp, 'Inspector'], [a.rcv, 'Receiver'], [a.admin, 'Admin'], [a.other, 'ví không vai trò']])
      await t.reverts(`${name} khởi tạo chuyển giao`, init(b2).call({ from: who }), 'BR: wrong role');
    await t.reverts('bên nhận là ví Importer', init(b2, a.imp2).call({ from: a.imp }), 'BR: not receiver',
      { id: 'TC23', expected: 'Từ chối: BR: not receiver' });
    await t.reverts('bên nhận là ví không vai trò', init(b2, a.other).call({ from: a.imp }), 'BR: not receiver');
    await t.reverts('bên nhận là địa chỉ 0', init(b2, ZERO_ADDRESS).call({ from: a.imp }), 'BR: not receiver');
    await t.reverts('hash phiếu giao hàng bằng 0', init(b2, a.rcv, ZERO_HASH).call({ from: a.imp }), 'BR: zero hash');
    await t.reverts('lô không tồn tại', init(99).call({ from: a.imp }), 'BR: batch not found');
    await t.reverts('lô Registered', init(await make('LOT-REG')).call({ from: a.imp }), 'BR: wrong status');
    await t.reverts('lô Tested (chưa nhập khẩu)', init(await make('LOT-TESTED', 'Tested')).call({ from: a.imp }), 'BR: wrong status');
    g = await get(b2);
    t.ok('lô bị từ chối vẫn ở Imported, chưa có Receiver', Number(g.status) === Status.Imported && g.receiver === ZERO_ADDRESS);

    // Bước 5
    const tx2 = await conf(b1).send({ from: a.rcv, gas: 3e5 });
    const e2 = tx2.events.TransferConfirmed.returnValues;
    g = await get(b1);
    t.ok('Receiver được chỉ định xác nhận: sang Received, người giữ là Receiver',
      Number(g.status) === Status.Received && g.holder === a.rcv && g.importer === a.imp && g.manufacturer === a.mfr
      && Number(e2.batchId) === b1 && e2.receiver === a.rcv && e2.docHash === Doc.receipt,
      { id: 'TC24', expected: 'Trạng thái Received; người giữ lô là Receiver; event TransferConfirmed' });
    await t.reverts('xác nhận lại lô đã Received', conf(b1).call({ from: a.rcv }), 'BR: wrong status');

    const b3 = await make('LOT-3', 'InTransfer');
    await t.reverts('Receiver khác không được chỉ định', conf(b3).call({ from: a.rcv2 }), 'BR: not designated',
      { id: 'TC25', expected: 'Từ chối: BR: not designated' });
    for (const [who, name] of [[a.mfr, 'Manufacturer'], [a.insp, 'Inspector'], [a.imp, 'Importer (bên giao)'], [a.admin, 'Admin'], [a.other, 'ví không vai trò']])
      await t.reverts(`${name} xác nhận tiếp nhận`, conf(b3).call({ from: who }), 'BR: wrong role');
    await t.reverts('hash biên bản nhận hàng bằng 0', conf(b3, ZERO_HASH).call({ from: a.rcv }), 'BR: zero hash');
    await t.reverts('lô không tồn tại', conf(99).call({ from: a.rcv }), 'BR: batch not found');
    await t.reverts('lô Imported (chưa khởi tạo chuyển giao)', conf(b2).call({ from: a.rcv }), 'BR: wrong status');
    g = await get(b3);
    t.ok('không xác nhận thì lô giữ InTransfer, người giữ vẫn là Importer', Number(g.status) === Status.InTransfer && g.holder === a.imp);

    // Thu hồi Receiver
    await c.methods.revokeRole(a.rcv).send({ from: a.admin, gas: 3e5 });
    await t.reverts('Receiver được chỉ định đã bị thu hồi', conf(b3).call({ from: a.rcv }), 'BR: wrong role');
    const b4 = await make('LOT-4', 'Imported');
    await t.reverts('khởi tạo chuyển giao cho Receiver đã bị thu hồi', init(b4).call({ from: a.imp }), 'BR: not receiver');
    await grant(a.rcv, Role.Receiver, 'Nhà máy dược Delta');
    await conf(b3).send({ from: a.rcv, gas: 3e5 });
    t.ok('cấp lại vai trò Receiver thì xác nhận được', (await status(b3)) === Status.Received);

    // Giao cho Receiver thứ hai
    await init(b4, a.rcv2).send({ from: a.imp, gas: 3e5 });
    await t.reverts('Receiver đầu tiên không xác nhận được lô giao cho Receiver 2', conf(b4).call({ from: a.rcv }), 'BR: not designated');
    await conf(b4).send({ from: a.rcv2, gas: 3e5 });
    g = await get(b4);
    t.ok('Receiver 2 xác nhận và trở thành người giữ lô', Number(g.status) === Status.Received && g.holder === a.rcv2);
  },
};
