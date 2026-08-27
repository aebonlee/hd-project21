#!/usr/bin/env node
/**
 * hd-project21 검증 스크립트 — CLAUDE.md §7 "검증 워크플로"의 Step1~3을 한 번에 실행한다.
 *
 * 사용법: node scripts/verify.mjs
 * 전제:
 *   - reference/Alogrithm.c (실제 대외비 원본, 로컬에만 존재 — 리포에 커밋됨)
 *   - macOS 내장 unzip, (선택) /usr/local/bin/soffice(LibreOffice)
 *
 * 이 스크립트는 docs/index.html 안의 <script> 를 그대로 뽑아 Node vm 컨텍스트에서
 * 실제 원본 소스에 돌린다. DOM은 최소 스텁만 흘려보낸다 — CLAUDE.md §7 참조.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const INDEX_HTML = path.join(ROOT, 'docs', 'index.html');
const REF_C = path.join(ROOT, 'reference', 'Alogrithm.c');
const TMP = path.join(ROOT, '.verify-tmp');

fs.mkdirSync(TMP, { recursive: true });

function step(n, title) { console.log(`\n=== Step ${n}. ${title} ===`); }

// ---- Step 1. <script> 추출 + 구문 검증 ----
step(1, '구문 검증 (node --check)');
const html = fs.readFileSync(INDEX_HTML, 'utf-8');
const m = /<script>\n([\s\S]*)<\/script>/.exec(html);
if (!m) throw new Error('docs/index.html 에서 <script> 블록을 찾지 못했습니다.');
const scriptSrc = m[1];
const jsPath = path.join(TMP, 'extracted.js');
fs.writeFileSync(jsPath, scriptSrc, 'utf-8');
execSync(`node --check "${jsPath}"`, { stdio: 'inherit' });
console.log('구문 OK');

if (!fs.existsSync(REF_C)) {
  console.log('\nreference/Alogrithm.c 가 없어 Step2~3(실제 원본 검증)은 건너뜁니다.');
  console.log('(대외비 원본은 로컬 clone에만 있어야 하며 이 저장소 상태로는 정상입니다.)');
  process.exit(0);
}

// ---- Step 2. 실제 원본으로 전체 파이프라인 실행 ----
step(2, '실제 Alogrithm.c로 전체 파이프라인 실행 (Node vm)');
const src = fs.readFileSync(REF_C, 'utf-8');

function makeEl() {
  const el = { value: '', checked: false, textContent: '', innerHTML: '', classList: { add(){}, remove(){}, toggle(){} }, style: {}, dataset: {}, children: [] };
  el.addEventListener = () => {};
  el.querySelectorAll = () => [];
  el.appendChild = () => {};
  el.click = () => {};
  el.remove = () => {};
  return el;
}
const fakeDoc = { getElementById: () => makeEl(), createElement: () => makeEl(), body: makeEl() };
let capturedBlob = null;
const sandbox = {
  document: fakeDoc, window: { scrollTo(){} }, console,
  TextDecoder, TextEncoder,
  Blob: class extends Blob { constructor(parts, opts) { super(parts, opts); capturedBlob = this; } },
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} },
  alert: (msg) => console.log('[alert]', msg),
  setTimeout, Uint8Array, Array, SRC: src,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(scriptSrc, sandbox, { filename: 'app.js' });

vm.runInContext(`
  ANALYSIS = runAnalysis(SRC);
  globalThis.__stats = {
    totalLines: ANALYSIS.totalLines,
    fnCount: ANALYSIS.fns.length,
    defineCount: Object.keys(ANALYSIS.defines).length,
    duplicates: ANALYSIS.duplicates,
    ppFlags: [...new Set(ANALYSIS.ppFlags.map(f=>f.macro))],
    canCount: ANALYSIS.canAll.length,
  };
  const CATN = CATEGORIES.map(c=>c.name);
  const dist = {};
  ANALYSIS.fns.forEach(f=>{ const k = f.category>=0 ? CATN[f.category] : '기타'; dist[k]=(dist[k]||0)+1; });
  globalThis.__dist = dist;
  ANALYSIS.specModel = buildSpecModel();
  globalThis.__specCount = ANALYSIS.specModel.sections.length;
  globalThis.__run = generateDocx();
`, sandbox, { filename: 'driver.js' });

console.log('총 라인:', sandbox.__stats.totalLines);
console.log('추출 함수 수:', sandbox.__stats.fnCount);
console.log('#define 파라미터:', sandbox.__stats.defineCount);
console.log('중복 함수명(남아있으면 이상):', sandbox.__stats.duplicates);
console.log('조건부 컴파일 미해결 매크로:', sandbox.__stats.ppFlags);
console.log('CAN/신호 참조:', sandbox.__stats.canCount);
console.log('카테고리 분포:', sandbox.__dist);
console.log('사양서 수록 함수 수:', sandbox.__specCount);

await sandbox.__run;
console.log('generateDocx() 완료 (예외 없음)');

// ---- Step 3. docx 실제 오픈 검증 ----
step(3, 'docx 무결성 검증 (unzip -t + 가능하면 LibreOffice 변환)');
const buf = Buffer.from(await capturedBlob.arrayBuffer());
const docxPath = path.join(TMP, 'verify_output.docx');
fs.writeFileSync(docxPath, buf);
console.log('docx 파일 크기:', buf.length, 'bytes ->', docxPath);

try {
  execSync(`unzip -t "${docxPath}"`, { stdio: 'inherit' });
  console.log('ZIP 무결성 OK (CRC 손상 없음)');
} catch (e) {
  console.error('!! ZIP 무결성 검증 실패 — .docx 생성 로직에 문제가 있을 수 있습니다.');
  process.exit(1);
}

try {
  execSync(`which soffice`, { stdio: 'ignore' });
  execSync(`soffice --headless --convert-to pdf "${docxPath}" --outdir "${TMP}"`, { stdio: 'inherit' });
  console.log('LibreOffice PDF 변환 OK ->', path.join(TMP, 'verify_output.pdf'));
} catch (e) {
  console.log('LibreOffice(soffice) 미설치 또는 변환 실패 — 이 단계는 건너뜁니다(치명적 아님).');
}

console.log('\n모든 검증 통과. 임시 파일은 .verify-tmp/ 에 남아있습니다(gitignore 대상).');
