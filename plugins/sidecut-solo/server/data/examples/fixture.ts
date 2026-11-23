// Known-bad disposable CLI; a regression should detect this deliberate defect.
const [a = '0', b = '0'] = process.argv.slice(2);
console.log(Number(a) - Number(b));
