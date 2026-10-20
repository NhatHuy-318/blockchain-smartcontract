// Tiện ích dùng chung cho bộ kiểm thử: biên dịch contract, dựng chuỗi giả lập, ghi nhận kết quả.
const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { Web3 } = require('web3');

// Ganache in cảnh báo về thư viện WebSocket khi nạp; không ảnh hưởng tới kiểm thử nên tắt đi.
const ganache = (() => {
  const write = process.stderr.write;
  process.stderr.write = () => true;
  try { return require('ganache'); } finally { process.stderr.write = write; }
})();

const CONTRACT = path.join(__dirname, '..', 'contracts', 'BatchRegistry.sol');

const Role = { None: 0, Admin: 1, Manufacturer: 2, Inspector: 3, Importer: 4, Receiver: 5 };
const Status = { None: 0, Registered: 1, Tested: 2, Rejected: 3, Imported: 4, InTransfer: 5, Received: 6, Released: 7, Quarantined: 8 };
const ZERO_ADDRESS = '0x' + '00'.repeat(20);
const ZERO_HASH = '0x' + '00'.repeat(32);
const MAX_UINT = (2n ** 256n - 1n).toString();
const DAY = 86400;

// Hash giả lập cho hồ sơ của từng bước (trong DApp đây là SHA-256 của file).
const Doc = {
  license: '0x' + '11'.repeat(32),
  coa: '0x' + 'a1'.repeat(32),
  test: '0x' + 'f6'.repeat(32),
  decl: '0x' + 'c4'.repeat(32),
  delivery: '0x' + 'd2'.repeat(32),
  receipt: '0x' + 'e8'.repeat(32),
  qc: '0x' + 'b7'.repeat(32),
};

let compiled;
function compile() {
  if (compiled) return compiled;
  const input = {
    language: 'Solidity',
    sources: { 'BatchRegistry.sol': { content: fs.readFileSync(CONTRACT, 'utf8') } },
    settings: {
      evmVersion: 'paris',
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.opcodes'] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const problems = (out.errors || []).filter(e => e.severity === 'error' || e.severity === 'warning');
  if (problems.length) throw new Error('Biên dịch có lỗi hoặc cảnh báo:\n' + problems.map(e => e.formattedMessage).join('\n'));
  const c = out.contracts['BatchRegistry.sol'].BatchRegistry;
  compiled = {
    abi: c.abi,
    bytecode: '0x' + c.evm.bytecode.object,
    runtimeSize: c.evm.deployedBytecode.object.length / 2,
    hasPush0: / PUSH0 /.test(' ' + c.evm.deployedBytecode.opcodes + ' '),
    solcVersion: solc.version(),
  };
  return compiled;
}

// Dựng một chuỗi giả lập mới và deploy contract. Mỗi file kiểm thử dùng một môi trường riêng.
async function newEnv() {
  const { abi, bytecode } = compile();
  const provider = ganache.provider({ logging: { quiet: true }, chain: { hardfork: 'merge' } });
  const web3 = new Web3(provider);
  const list = await web3.eth.getAccounts();
  const names = ['admin', 'mfr', 'insp', 'imp', 'rcv', 'other', 'mfr2', 'insp2', 'imp2', 'rcv2'];
  const a = Object.fromEntries(names.map((n, i) => [n, list[i]]));
  const c = await new web3.eth.Contract(abi).deploy({ data: bytecode }).send({ from: a.admin, gas: 7e6 });

  const env = {
    web3, provider, c, a,
    async now() { return Number((await web3.eth.getBlock('latest')).timestamp); },
    async mine(seconds) {
      await provider.request({ method: 'evm_increaseTime', params: [seconds] });
      await provider.request({ method: 'evm_mine', params: [] });
    },
    async grant(account, role, orgName) {
      return c.methods.grantRole(account, role, orgName, Doc.license).send({ from: a.admin, gas: 3e5 });
    },
    // Cấp vai trò cho đủ các bên của lô ví dụ trong proposal, cộng một ví dự phòng cho mỗi vai trò.
    async grantAll() {
      await env.grant(a.mfr, Role.Manufacturer, 'Công ty Hóa dược ABC');
      await env.grant(a.insp, Role.Inspector, 'Trung tâm kiểm nghiệm Beta');
      await env.grant(a.imp, Role.Importer, 'Công ty nhập khẩu Gamma');
      await env.grant(a.rcv, Role.Receiver, 'Nhà máy dược Delta');
      await env.grant(a.mfr2, Role.Manufacturer, 'Nhà sản xuất 2');
      await env.grant(a.insp2, Role.Inspector, 'Đơn vị kiểm nghiệm 2');
      await env.grant(a.imp2, Role.Importer, 'Đơn vị nhập khẩu 2');
      await env.grant(a.rcv2, Role.Receiver, 'Nhà máy dược 2');
    },
    // Đăng ký một lô rồi đưa lô tới trạng thái `upTo`. Trả về batchId.
    async make(batchNo, upTo = 'Registered', { exp, passed2 = true, passed6 = true, receiver = a.rcv } = {}) {
      const t = await env.now();
      await c.methods.registerBatch(batchNo, 'Penicillin G potassium', t - DAY, exp ?? t + 3 * 365 * DAY, 'Nơi khô mát, dưới 25 độ C', a.imp, Doc.coa)
        .send({ from: a.mfr, gas: 1e6 });
      const id = Number(await c.methods.getBatchIdByNo(batchNo).call());
      const order = ['Registered', 'Tested', 'Imported', 'InTransfer', 'Received', 'Done'];
      const target = order.indexOf(upTo === 'Rejected' ? 'Tested' : ['Released', 'Quarantined'].includes(upTo) ? 'Done' : upTo);
      if (upTo === 'Rejected') passed2 = false;
      if (upTo === 'Quarantined') passed6 = false;
      if (target >= 1) await c.methods.recordTestResult(id, passed2, 'KN-0932', t, Doc.test).send({ from: a.insp, gas: 3e5 });
      if (target >= 2) await c.methods.recordImport(id, 'Ấn Độ', 'TK-' + id, t, Doc.decl).send({ from: a.imp, gas: 3e5 });
      if (target >= 3) await c.methods.initiateTransfer(id, receiver, Doc.delivery).send({ from: a.imp, gas: 3e5 });
      if (target >= 4) await c.methods.confirmTransfer(id, Doc.receipt).send({ from: receiver, gas: 3e5 });
      if (target >= 5) await c.methods.recordReceivingInspection(id, passed6, 'QC-DELTA-0457', t, Doc.qc).send({ from: receiver, gas: 3e5 });
      return id;
    },
    async status(id) { return Number((await c.methods.getBatch(id).call()).status); },
  };
  return env;
}

// Ghi nhận kết quả. `tc` (tùy chọn) gắn mã ca kiểm thử đại diện để đưa vào bảng báo cáo.
function createRecorder(group) {
  const results = [];
  const record = (name, passed, tc, detail) => {
    results.push({ group, name, passed, tc: tc?.id, expected: tc?.expected });
    console.log(`  ${passed ? 'PASS' : 'FAIL'} ${tc?.id ? tc.id + ' ' : ''}${name}`);
    if (!passed && detail) console.log('       ' + detail);
  };
  return {
    results,
    ok(name, cond, tc) { record(name, Boolean(cond), tc); },
    // Gọi thử bằng eth_call để đọc được lý do revert (gửi giao dịch thật thì Web3.js không trả lý do).
    async reverts(name, call, message, tc) {
      try {
        await call;
        record(name, false, tc, 'giao dịch không bị từ chối');
      } catch (e) {
        const m = String(e.cause?.message || e.innerError?.message || e.data || e.message);
        record(name, m.includes(message), tc, `mong đợi "${message}", nhận được: ${m.slice(0, 160)}`);
      }
    },
  };
}

module.exports = { Role, Status, Doc, DAY, ZERO_ADDRESS, ZERO_HASH, MAX_UINT, compile, newEnv, createRecorder };
