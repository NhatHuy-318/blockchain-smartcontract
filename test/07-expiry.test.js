// Quy tắc hạn dùng (mục 5 của docs/design.md): chặn các bước đẩy lô tiến lên, nhưng luôn để lại lối ra.
const { Status, Doc } = require('./lib');

module.exports = {
  group: 'Quy tắc hạn dùng',
  async run(t, env) {
    const { c, a, now, mine, grantAll, make, status } = env;
    await grantAll();
    const t0 = await now();
    const exp = t0 + 600; // hết hạn sau 10 phút

    // Chuẩn bị lô ở từng trạng thái trước khi hết hạn
    const reg1 = await make('EXP-REG-1', 'Registered', { exp });
    const reg2 = await make('EXP-REG-2', 'Registered', { exp });
    const tested = await make('EXP-TESTED', 'Tested', { exp });
    const imported = await make('EXP-IMPORTED', 'Imported', { exp });
    const inTransfer = await make('EXP-TRANSFER', 'InTransfer', { exp });
    const received = await make('EXP-RECEIVED', 'Received', { exp });

    // Đúng thời điểm hạn dùng vẫn chưa hết hạn
    await mineAt(env, exp);
    t.ok('đúng thời điểm expiryDate: lô chưa hết hạn', (await c.methods.isExpired(reg1).call()) === false);

    await mine(600);
    t.ok('qua hạn dùng: isExpired = true', (await c.methods.isExpired(reg1).call()) === true);

    // Bước 2
    await t.reverts('lô hết hạn: ghi kiểm nghiệm Đạt', c.methods.recordTestResult(reg1, true, 'KN', t0, Doc.test).call({ from: a.insp }), 'BR: expired');
    await c.methods.recordTestResult(reg2, false, 'KN', t0, Doc.test).send({ from: a.insp, gas: 3e5 });
    t.ok('lô hết hạn: không ghi được Đạt ở Bước 2, ghi Không đạt thì sang Rejected', (await status(reg2)) === Status.Rejected,
      { id: 'TC29', expected: 'Ghi Đạt bị từ chối (BR: expired); ghi Không đạt được, lô sang Rejected' });

    // Bước 3 và 4
    await t.reverts('lô hết hạn: nhập khẩu', c.methods.recordImport(tested, 'Ấn Độ', 'TK', t0, Doc.decl).call({ from: a.imp }), 'BR: expired',
      { id: 'TC30', expected: 'Nhập khẩu và khởi tạo chuyển giao bị từ chối (BR: expired)' });
    await t.reverts('lô hết hạn: khởi tạo chuyển giao', c.methods.initiateTransfer(imported, a.rcv, Doc.delivery).call({ from: a.imp }), 'BR: expired');

    // Bước 5 và 6: lô đang vận chuyển khi hết hạn vẫn có lối ra Quarantined
    await c.methods.confirmTransfer(inTransfer, Doc.receipt).send({ from: a.rcv, gas: 3e5 });
    const confirmed = (await status(inTransfer)) === Status.Received;
    await t.reverts('lô hết hạn: ghi kiểm tra tại nơi nhận Đạt', c.methods.recordReceivingInspection(inTransfer, true, 'QC', t0, Doc.qc).call({ from: a.rcv }), 'BR: expired');
    await c.methods.recordReceivingInspection(inTransfer, false, 'QC', t0, Doc.qc).send({ from: a.rcv, gas: 3e5 });
    t.ok('lô hết hạn khi đang vận chuyển: xác nhận tiếp nhận được, Bước 6 chỉ ghi được Không đạt (Quarantined)',
      confirmed && (await status(inTransfer)) === Status.Quarantined,
      { id: 'TC31', expected: 'Xác nhận tiếp nhận được; Bước 6 ghi Đạt bị từ chối, ghi Không đạt thì sang Quarantined' });

    await t.reverts('lô Received hết hạn: ghi Đạt', c.methods.recordReceivingInspection(received, true, 'QC', t0, Doc.qc).call({ from: a.rcv }), 'BR: expired');
    await c.methods.recordReceivingInspection(received, false, 'QC', t0, Doc.qc).send({ from: a.rcv, gas: 3e5 });
    t.ok('lô Received hết hạn: ghi Không đạt thì sang Quarantined', (await status(received)) === Status.Quarantined);
  },
};

// Đào một khối có timestamp đúng bằng `timestamp`.
async function mineAt(env, timestamp) {
  await env.provider.request({ method: 'evm_mine', params: [{ timestamp }] });
}
