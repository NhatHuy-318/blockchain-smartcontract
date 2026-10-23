// Truy xuất: vòng đời đầy đủ, tìm theo hash, hàm đọc và danh sách lô
const { Status, Doc, MAX_UINT } = require('./lib');

const EVENTS = ['BatchRegistered', 'BatchTested', 'BatchImported', 'TransferInitiated', 'TransferConfirmed', 'ReceivingInspected'];

module.exports = {
  group: 'Truy xuất và hàm đọc',
  async run(t, env) {
    const { c, a, grantAll, make } = env;

    t.ok('chưa có lô: getBatchCount = 0, getBatches trả mảng rỗng',
      Number(await c.methods.getBatchCount().call()) === 0 && (await c.methods.getBatches(1, 10).call()).length === 0);
    await grantAll();

    // Lô ví dụ của proposal đi trọn Bước 1 đến 6
    const id = await make('PEN-K-20260901-001', 'Released');
    const evs = [];
    for (const name of EVENTS)
      for (const e of await c.getPastEvents(name, { filter: { batchId: id }, fromBlock: 0 }))
        evs.push({ name, block: Number(e.blockNumber), hash: e.returnValues.docHash });
    evs.sort((x, y) => x.block - y.block);
    t.ok('vòng đời lô PEN-K-20260901-001: đủ 6 event theo đúng thứ tự, mỗi event mang đúng hash hồ sơ của bước',
      evs.map(e => e.name).join() === EVENTS.join()
      && evs.map(e => e.hash).join() === [Doc.coa, Doc.test, Doc.decl, Doc.delivery, Doc.receipt, Doc.qc].join(),
      { id: 'TC32', expected: '6 event từ BatchRegistered tới ReceivingInspected, đúng thứ tự và đúng hash' });

    // Tìm lô từ hash của một file
    let found = null;
    for (const name of EVENTS) {
      const hit = await c.getPastEvents(name, { filter: { docHash: Doc.decl }, fromBlock: 0 });
      if (hit.length) found = { name, batchId: Number(hit[0].returnValues.batchId) };
    }
    t.ok('tìm theo hash tờ khai: ra đúng lô và đúng bước', found && found.name === 'BatchImported' && found.batchId === id,
      { id: 'TC33', expected: 'Tìm thấy lô PEN-K-20260901-001 ở bước BatchImported' });
    const none = await c.getPastEvents('BatchImported', { filter: { docHash: '0x' + '99'.repeat(32) }, fromBlock: 0 });
    t.ok('hash không có trên chuỗi: không tìm thấy', none.length === 0);

    // 8 lô nữa, tổng cộng đủ 8 trạng thái
    const states = ['Registered', 'Tested', 'Rejected', 'Imported', 'InTransfer', 'Received', 'Quarantined', 'Registered'];
    for (let i = 0; i < states.length; i++) await make(`LOT-${String(i + 2).padStart(3, '0')}`, states[i]);
    const all = await c.methods.getBatches(1, 100).call();
    const expected = ['Released', ...states];
    t.ok('getBatches(1, 100) trả đủ 9 lô theo thứ tự id, đúng trạng thái từng lô',
      all.length === 9 && all.every((b, i) => Number(b.id) === i + 1 && Number(b.status) === Status[expected[i]]));

    const holder = { Registered: a.mfr, Tested: a.mfr, Rejected: a.mfr, Imported: a.imp, InTransfer: a.imp, Received: a.rcv, Released: a.rcv, Quarantined: a.rcv };
    t.ok('người đang giữ lô đúng ở cả 8 trạng thái', all.every((b, i) => b.holder === holder[expected[i]]));

    const p1 = await c.methods.getBatches(1, 4).call();
    const p2 = await c.methods.getBatches(5, 4).call();
    const p3 = await c.methods.getBatches(9, 4).call();
    t.ok('phân trang 4 + 4 + 1: các trang nối nhau, không trùng, không sót',
      [...p1, ...p2, ...p3].map(b => Number(b.id)).join() === '1,2,3,4,5,6,7,8,9',
      { id: 'TC34', expected: '3 trang nối đủ 9 lô, không trùng, không sót' });
    t.ok('getBatches: fromId = 0, fromId vượt số lô, count = 0 đều trả mảng rỗng',
      (await c.methods.getBatches(0, 5).call()).length === 0 && (await c.methods.getBatches(10, 5).call()).length === 0
      && (await c.methods.getBatches(1, 0).call()).length === 0);
    t.ok('getBatches với giá trị uint256 lớn nhất không lỗi tràn số',
      (await c.methods.getBatches(3, MAX_UINT).call()).length === 7 && (await c.methods.getBatches(MAX_UINT, 5).call()).length === 0);

    await t.reverts('getBatch(0)', c.methods.getBatch(0).call(), 'BR: batch not found');
    await t.reverts('getBatch vượt số lô', c.methods.getBatch(10).call(), 'BR: batch not found');
    await t.reverts('isExpired lô không tồn tại', c.methods.isExpired(99).call(), 'BR: batch not found');
    t.ok('getBatchIdByNo: tra đúng; số lô chưa có trả 0', Number(await c.methods.getBatchIdByNo('LOT-005').call()) === 5
      && Number(await c.methods.getBatchIdByNo('KHONG-CO').call()) === 0);
    t.ok('getBatchIdByNo với chữ thường trả 0 (số lô luôn là chữ hoa, DApp đổi trước khi tra)', Number(await c.methods.getBatchIdByNo('lot-005').call()) === 0);
  },
};
