// Chạy toàn bộ bộ kiểm thử: `npm test`.
// `npm run test:report` chạy xong thì ghi bảng ca kiểm thử đại diện vào docs/test-results.md.
const fs = require('fs');
const path = require('path');
const { compile, newEnv, createRecorder } = require('./lib');

const REPORT = path.join(__dirname, '..', 'docs', 'test-results.md');

(async () => {
  const info = compile();
  console.log(`Biên dịch: ${info.solcVersion}, EVM paris, runtime ${info.runtimeSize} byte, PUSH0: ${info.hasPush0 ? 'CÓ' : 'không'}\n`);

  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
  const all = [];
  for (const file of files) {
    const suite = require(path.join(__dirname, file));
    console.log(suite.group);
    const t = createRecorder(suite.group);
    try {
      await suite.run(t, await newEnv());
    } catch (e) {
      t.ok(`lỗi không mong đợi: ${e.message}`, false);
    }
    all.push(...t.results);
    console.log('');
  }
  if (info.hasPush0) all.push({ group: 'Biên dịch', name: 'bytecode có opcode PUSH0 (Rootstock không hỗ trợ)', passed: false });

  const failed = all.filter(r => !r.passed);
  const cases = all.filter(r => r.tc).sort((x, y) => x.tc.localeCompare(y.tc));
  console.log(`Tổng: ${all.length - failed.length}/${all.length} kiểm tra đạt; ${cases.filter(r => r.passed).length}/${cases.length} ca kiểm thử đại diện đạt.`);
  if (failed.length) {
    console.log('\nKiểm tra không đạt:');
    for (const r of failed) console.log(`  - [${r.group}] ${r.tc ? r.tc + ' ' : ''}${r.name}`);
  }

  if (process.argv.includes('--report')) {
    fs.writeFileSync(REPORT, report(all, cases, info));
    console.log(`\nĐã ghi ${path.relative(process.cwd(), REPORT)}`);
  }
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e.message || e); process.exit(1); });

function report(all, cases, info) {
  const day = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const passedAll = all.filter(r => r.passed).length;
  const rows = cases.map(r => `| ${r.tc} | ${r.group} | ${r.name} | ${r.expected ?? ''} | ${r.passed ? 'Đạt' : '**Không đạt**'} |`);
  const groups = [...new Set(all.map(r => r.group))].map(g => {
    const list = all.filter(r => r.group === g);
    return `| ${g} | ${list.length} | ${list.filter(r => r.passed).length} |`;
  });
  return `# Kết quả kiểm thử smart contract (T12)

File này do \`npm run test:report\` tự sinh từ lần chạy thật; không sửa tay.

- Ngày chạy: ${day}
- Trình biên dịch: ${info.solcVersion}, EVM \`paris\`; bytecode runtime ${info.runtimeSize} byte; ${info.hasPush0 ? '**có** opcode PUSH0' : 'không có opcode PUSH0'}
- Môi trường: chuỗi giả lập cục bộ Ganache, mỗi nhóm kiểm thử chạy trên một chuỗi mới
- Tổng cộng: **${passedAll}/${all.length}** kiểm tra đạt; **${cases.filter(r => r.passed).length}/${cases.length}** ca kiểm thử đại diện đạt

## Ca kiểm thử đại diện

| Mã | Nhóm | Ca kiểm thử | Kết quả mong đợi | Kết quả |
|---|---|---|---|---|
${rows.join('\n')}

## Số kiểm tra theo nhóm

| Nhóm | Số kiểm tra | Đạt |
|---|---|---|
${groups.join('\n')}
`;
}
