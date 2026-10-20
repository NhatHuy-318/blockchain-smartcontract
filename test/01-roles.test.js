// Bước 0: phân quyền (grantRole, revokeRole, getRole)
const { Role, Doc, ZERO_ADDRESS, ZERO_HASH } = require('./lib');

module.exports = {
  group: 'Bước 0: Phân quyền',
  async run(t, { c, a, grant, now, make, status }) {
    const L = Doc.license;

    t.ok('ví deploy là Admin và có vai trò Admin', (await c.methods.admin().call()) === a.admin && Number(await c.methods.getRole(a.admin).call()) === Role.Admin,
      { id: 'TC01', expected: 'Ví deploy contract là Admin' });
    t.ok('ví chưa được cấp có vai trò None', Number(await c.methods.getRole(a.other).call()) === Role.None);

    await t.reverts('ví không phải Admin cấp vai trò', c.methods.grantRole(a.mfr, Role.Manufacturer, 'ABC', L).call({ from: a.other }), 'BR: not admin',
      { id: 'TC03', expected: 'Từ chối: BR: not admin' });
    await t.reverts('cấp vai trò Admin', c.methods.grantRole(a.mfr, Role.Admin, 'ABC', L).call({ from: a.admin }), 'BR: invalid role',
      { id: 'TC05', expected: 'Từ chối: BR: invalid role' });
    await t.reverts('cấp vai trò None', c.methods.grantRole(a.mfr, Role.None, 'ABC', L).call({ from: a.admin }), 'BR: invalid role');
    await t.reverts('hash hồ sơ pháp lý bằng 0', c.methods.grantRole(a.mfr, Role.Manufacturer, 'ABC', ZERO_HASH).call({ from: a.admin }), 'BR: zero hash');
    await t.reverts('tên đơn vị rỗng', c.methods.grantRole(a.mfr, Role.Manufacturer, '', L).call({ from: a.admin }), 'BR: empty org name');
    await t.reverts('cấp cho địa chỉ 0', c.methods.grantRole(ZERO_ADDRESS, Role.Manufacturer, 'ABC', L).call({ from: a.admin }), 'BR: zero address');

    const tx = await c.methods.grantRole(a.mfr, Role.Manufacturer, 'Công ty Hóa dược ABC', L).send({ from: a.admin, gas: 3e5 });
    const ev = tx.events.RoleGranted.returnValues;
    t.ok('Admin cấp vai trò Manufacturer, event RoleGranted có tên đơn vị và hash hồ sơ',
      Number(await c.methods.getRole(a.mfr).call()) === Role.Manufacturer && ev.account === a.mfr && Number(ev.role) === Role.Manufacturer
      && ev.orgName === 'Công ty Hóa dược ABC' && ev.licenseHash === L,
      { id: 'TC02', expected: 'Ví có vai trò Manufacturer; event RoleGranted đúng dữ liệu' });

    await t.reverts('cấp vai trò thứ hai cho ví đã có vai trò', c.methods.grantRole(a.mfr, Role.Inspector, 'ABC', L).call({ from: a.admin }), 'BR: account has role',
      { id: 'TC04', expected: 'Từ chối: BR: account has role' });
    await t.reverts('thu hồi ví chưa có vai trò', c.methods.revokeRole(a.other).call({ from: a.admin }), 'BR: no role');
    await t.reverts('thu hồi vai trò Admin', c.methods.revokeRole(a.admin).call({ from: a.admin }), 'BR: cannot revoke admin',
      { id: 'TC07', expected: 'Từ chối: BR: cannot revoke admin' });
    await t.reverts('ví không phải Admin thu hồi vai trò', c.methods.revokeRole(a.mfr).call({ from: a.other }), 'BR: not admin');

    // Thu hồi: ví mất quyền thao tác ngay
    await grant(a.imp, Role.Importer, 'Gamma');
    const t0 = await now();
    const tx2 = await c.methods.revokeRole(a.mfr).send({ from: a.admin, gas: 3e5 });
    const revoked = Number(tx2.events.RoleRevoked.returnValues.previousRole) === Role.Manufacturer && Number(await c.methods.getRole(a.mfr).call()) === Role.None;
    await t.reverts('ví đã bị thu hồi không đăng ký lô được',
      c.methods.registerBatch('X', 'Y', t0 - 1, t0 + 1e6, 'Z', a.imp, Doc.coa).call({ from: a.mfr }), 'BR: wrong role');
    t.ok('thu hồi vai trò: event RoleRevoked, ví về None', revoked,
      { id: 'TC06', expected: 'Ví về None; mọi thao tác sau đó bị từ chối (BR: wrong role)' });

    await grant(a.mfr, Role.Inspector, 'Beta');
    t.ok('thu hồi xong cấp lại vai trò khác được', Number(await c.methods.getRole(a.mfr).call()) === Role.Inspector);
  },
};
