# hd-project21 — MCU-SPEC-Generator 인수인계 문서

> 목적: 세션·모델이 바뀌어도 같은 방식으로 이어서 개발하게 하는 문서.
> 원칙: 실측 사실만 기록, 왜 그렇게 했는지 함께 적는다. 이 문서는 전역 `~/.claude/CLAUDE.md`를 전제로 하며, 거기 없는 이 프로젝트 고유 내용만 담는다.
> 갱신일: 2026-08-27

## 1. 이 프로젝트가 무엇인가

MCU 베어메탈 C 소스코드를 역설계(Reverse Engineering)해 「MCU 제어 시스템 기능 사양서」(Word .docx)를 자동 생성하는 도구.
계기는 현대사이트솔루션(협력사) 지게차 MCU 펌웨어처럼 **문서화 없이 개발된 레거시 C 코드**를 분석해 당사 표준 사양서 양식으로 역산해내는 실무 요구.

- **입력**: `.c`/`.h`/`.txt` 파일 업로드 또는 붙여넣기 (CP949/UTF-8 자동 판별)
- **출력**: Word(.docx) 기능 사양서 Draft — 표지·Revision History·개요·시스템 기능 정의(기능별 상세+제어흐름+CAN표)·부록
- **원칙**: 전 과정 브라우저 로컬 처리, 소스코드가 네트워크로 나가지 않는다(화면 상단에도 명시).

## 2. 아키텍처 원칙 — 왜 이렇게 짰는가

- **`docs/index.html` 단일 파일** (현재 1,340줄). CSS/JS 전부 인라인. 이유: 대표 요구사항이 "깃허브에 html 하나로 등록"이었고, 사내망·오프라인 배포 상황을 고려해 외부 CDN 의존을 없애기 위함.
- **`.docx`를 라이브러리 없이 직접 생성한다** (CRC32 + ZIP STORE writer를 손으로 구현, OOXML XML을 문자열로 조립). 원래 Revision01은 `docx@8.5.0`을 jsdelivr CDN에서 로드했는데, 그러면 오프라인/사내망에서 다운로드 버튼이 통째로 죽는다. STORE(무압축) 방식을 쓴 이유: DEFLATE(`CompressionStream`)는 구형 브라우저 미지원 위험이 있고, ZIP 스펙상 STORE도 완전히 유효한 방식이라 Word가 문제없이 연다(LibreOffice로 실제 검증됨, §5).
- **화면 흐름도(SVG)와 Word 흐름도(구조화 텍스트)를 이원화**했다. 처음엔 SVG를 PNG로 래스터화해 Word에 이미지로 박는 것도 고려했으나, `<w:drawing>`/media rels/`[Content_Types].xml` 이미지 타입 등록까지 다 맞아야 하는 고위험·저효용 작업이라 스코프를 줄였다. 화면은 진짜 다이아몬드/화살표 플로우차트(`flowToSVG`), Word는 들여쓰기+색상 기호(◆/◇/■) 구조화 텍스트(`flowToDocxParas`) — 별도 렌더러 2개다. 하나 고쳤다고 다른 하나가 따라 바뀌지 않는다는 뜻이니 흐름도 관련 요청이 오면 **어느 쪽 얘기인지 먼저 확인**할 것.

## 3. 파일 구조 — reference/ 는 절대 docs/ 로 옮기지 말 것

```
hd-project21/
├── CLAUDE.md              # 이 문서
├── README.md              # 사용법 요약(대표/사용자용)
├── docs/index.html         # 배포되는 앱 전체 — Pages가 서빙하는 유일한 경로
├── reference/Alogrithm.c   # 실제 원본 소스(대외비) — Pages 미노출 경로
├── scripts/verify.mjs      # §7 검증 워크플로 자동화(로컬 전용, .verify-tmp/ 는 git 제외)
└── Dev_md/                 # 개발일지(날짜별)
```

- **왜 `docs/`인가**: GitHub Pages 소스를 `main` 브랜치의 `/docs` 경로로 설정했다(`gh api -X POST repos/aebonlee/hd-project21/pages -f "source[branch]=main" -f "source[path]=/docs"`). `docs/` 밖에 있는 파일은 Pages가 서빙하지 않는다.
- **왜 `reference/`가 위험한가**: 전역 CLAUDE.md §3.8 실측 — **리포가 private여도 Pages가 서빙하는 경로의 파일은 인증 없이 그대로 공개 다운로드된다.** `reference/Alogrithm.c`를 `docs/` 밑으로 옮기면 그 순간 `aebonlee.github.io/hd-project21/reference/Alogrithm.c`로 대외비 원본이 새어나간다. 실제로 `curl -I https://aebonlee.github.io/hd-project21/reference/Alogrithm.c`가 404인지 배포마다 확인해왔다.
- **실제 사양서 템플릿 원본(.docx)은 커밋한 적 없다.** 구조만 파악해 `generateDocx()`에 반영했다. 앱 내 "샘플 코드 불러오기"는 자체 제작한 합성(가상) 데모 소스(`SAMPLE_C`, ~150줄)를 쓴다 — 실제 고객사 로직 아님.

## 4. 코드 구조 맵 (docs/index.html 안의 섹션, 함수명 기준)

라인 번호는 수정될 때마다 바뀌므로 `grep -n "^function 이름"`으로 확인할 것. 흐름 순서대로:

| 구역 | 함수 | 역할 |
|---|---|---|
| 유틸 | `esc`, `clamp`, `$` | 공통 헬퍼 |
| 텍스트 디코딩 | `decodeBuffer` | UTF-8 실패 시 EUC-KR(CP949)로 폴백 |
| **전처리기 해석** | `resolvePreprocessor` | `#if/#ifdef/#ifndef/#elif/#else/#endif` 실제 해석 — §5 참조, 가장 정확도가 중요한 구역 |
| 마스킹 | `maskLiterals` | 문자열/주석을 같은 길이 공백으로 치환(라인 보존) + 주석 수집 |
| 파서 | `buildLineIndex`, `lineOf`, `matchBrace`, `parseFunctions` | 전역 스코프 함수 추출(중괄호 깊이 0에서만 매칭) |
| | `attachComments` | 함수별 주석 매핑 — **직전 함수 endLine을 하한선으로 clamp**(2026-08-27에 이 clamp 없어서 이전 함수 주석이 새는 버그 있었음) |
| 흐름 분석 | `scanBlock`, `buildFlow`, `flattenBranches` | if/else/switch/return 트리 추출(최대 깊이 4, 노드 40개 캡) |
| CAN 추출 | `extractCAN` | `구조체SPN.필드`, `RX_/CAN_..._PGN` 패턴 스캔 |
| **분류/설명** | `tokenize`, `kwHitTok`, `kwHitText`, `classify`, `describeFunc` | 카테고리 자동 분류 + 한글 설명 자동 생성 — §6 단어경계 버그 교훈 필독 |
| 분석 오케스트레이션 | `runAnalysis` | 위 전부를 묶어 `ANALYSIS` 객체 생성 |
| Phase 전환/렌더 | `setPhase`, `renderStats`, `renderChips`, `renderTable` | Phase2 화면 — 검색(`FN_SEARCH`)·정렬(`FN_SORT`) 여기 있음 |
| **화면 플로우차트** | `pairBranches`, `flowDiamond`, `flowTerminal`, `flowArrowDown`, `flowArrowRightDown`, `flowMergeBack`, `flowLayoutSeq`, `flowToSVG` | 다이아몬드/화살표 SVG 렌더러(화면 전용) |
| 상세 패널 | `showDetail` | Phase2 우측 상세 |
| 사양서 모델 | `buildSpecModel`, `getMeta`, `renderSpecPreview` | Phase3 — 카테고리별 상위 N개 함수 선정 + 표지 메타 입력 |
| 교차검증 | `renderXCheck` | Phase4 — 근거 일치/확인 필요 판정 |
| **ZIP/OOXML** | `CRC_TABLE`, `strToBytes`, `concatBytes`, `buildZip` | .docx 컨테이너(ZIP STORE) 직접 생성 |
| | `xesc`, `run`, `para`, `emptyPara`, `cellXml`, `rowXml`, `tableXml`, `flowToDocxParas` | word/document.xml 조각 빌더 |
| **문서 조립** | `generateDocx` | 위 전부를 묶어 `.docx` Blob 다운로드 트리거 |
| 배선 | `init` | 전 이벤트 리스너 연결(파일업로드/드래그/버튼/검색/정렬) |

## 5. 전처리기 해석 규칙 — 정확도가 이 도구의 존재 이유다

`resolvePreprocessor()`가 리터럴 `0`/`1`, `defined(X)`, 단순 정수 상수식을 안전하게 평가한다(`Function('return (...)')`, 문자 화이트리스트로 제한).
**정의되지 않은 매크로(예: `TEST_MODE`)는 기본적으로 `#else`(비활성) 경로를 채택**하고 `ppFlags`에 기록해 화면·문서에 `[확인 필요]`로 노출한다(§6.1 정확성 원칙 — 확신 없으면 확정하지 않는다).

- **`#if 조건 //주석` 처럼 조건 뒤에 주석이 붙는 실제 사례가 있었다.** 주석을 안 떼면 `1`이라는 멀쩡한 리터럴도 "미해결"로 오탐된다 — 반드시 `rest.replace(/\/\/.*$/,'').replace(/\/\*.*?\*\//g,'')`로 먼저 벗겨낸다.
- 실제 `Alogrithm.c`에서 `#if TEST_MODE`/`#if 0` 두 케이스로 검증됨: `Make_FuelSensorValue`(두 정의 중 `#else` 채택), `Make_SpeedValue`(`#if 0` 블록 완전 제거) — 둘 다 최종 활성 코드 1개만 남는 것을 실측 확인했다.

## 6. 카테고리 분류/키워드 매칭 — 반복해서 밟은 함정

`classify()`/`describeFunc()`는 함수명 토큰(`tokenize()` — `_`/숫자 경계로 분리)과 분기조건·CAN신호 텍스트에서 `CATEGORIES` 키워드 히트 점수로 분류한다.

- **짧은 키워드(3자 이하)는 절대 `text.includes(k)` 부분일치로 매칭하지 말 것.** `'ain'`이 `'maintenance'` 안에 그대로 들어있어서(m-**ain**tenance) `Check_Maintenance_Info()`가 엉뚱하게 이중 분류된 실사고가 있었다.
- **그렇다고 JS `\b` 정규식으로 고치는 것도 함정이다.** `\b`는 `_`를 단어문자로 취급해서 `HCESPN.rpm_310`에서 `rpm`(뒤에 `_310`)을 못 잡는다. `Power_Standard_Mode()`가 "동력/주행"→"기타"로 밀려나는 회귀가 이렇게 났다.
- **정답: 영문자 연속 구간만 뽑아 토큰화한 뒤 완전일치**(`kwHitTok`/`kwHitText`, `text.match(/[a-z]+/g)`). `tokenize()`와 같은 철학으로 통일했다. **키워드 매칭 로직을 또 고칠 일이 생기면 이 두 함정을 다시 밟지 말 것.**
- `CATEGORIES` 키워드는 **일반 자동차/임베디드 도메인 용어만** 넣는다(torque, seatbelt, password, maintenance 등). 이 회사·이 파일에만 있는 특정 함수명을 하드코딩하지 않는다 — 이 도구는 임의의 C 파일에 범용으로 동작해야 하고, 특정 함수명을 박으면 공개 배포되는 `docs/index.html`에 원본 로직 냄새가 새어나간다.

## 7. 검증 워크플로 — 다음에 코드를 고칠 때 반드시 이 순서로

이 프로젝트는 **화면(브라우저 클릭)과 로직(파서/OOXML)을 분리해서 검증**해야 한다. 실제로 로직만 Node로 검증하고 넘어갔다가 브라우저에서 실클릭하고서야 주석 오염·카테고리 오탐 버그를 발견한 전례가 있다(§9 커밋 이력).

**Step 1~3 — `scripts/verify.mjs` 한 번으로 끝난다**
```sh
node scripts/verify.mjs
```
구문 검증 → (`reference/Alogrithm.c`가 있으면) 실제 원본으로 `runAnalysis()`→`buildSpecModel()`→`generateDocx()` 전체 파이프라인 실행 → 생성된 `.docx`를 `unzip -t`로 CRC 무결성 검증 → `soffice`(LibreOffice)가 있으면 PDF 변환까지 자동으로 돈다. 결과물은 `.verify-tmp/`(git 추적 제외)에 남는다.

이 스크립트는 다음을 재현한다 — 직접 하네스를 다시 짤 일이 생기면 이 원리를 기억할 것:
- `let ANALYSIS=null` 같은 스크립트 최상위 `let/const`는 vm 컨텍스트 밖에서 `sandbox.ANALYSIS=...`로 직접 못 건드린다(브라우저의 non-module 스크립트와 동일한 스코프 규칙) — **반드시 같은 `vm.runInContext` 호출 안에서** `ANALYSIS = runAnalysis(SRC); ...` 형태로 대입해야 한다.
- DOM은 `document.getElementById`가 `{value,checked,classList:{add(){},...},addEventListener(){},...}` 형태의 가짜 엘리먼트를 리턴하는 최소 스텁이면 충분하다.
- 확인할 지표: 총 라인/함수 수, 카테고리 분포, `Make_FuelSensorValue`/`Make_SpeedValue`가 정확히 1개씩만 채택되는지, `ppFlags`(미해결 매크로) 목록, CRC 손상 없음 — 전부 실제로 "고쳤다"는 판정의 근거다(전역 CLAUDE.md §5.5 "되돌려서 확인" 원칙과 같은 맥락 — 여기서는 "실제 오피스 엔진이 열어야" 판정이 사실이 된다).
- `reference/Alogrithm.c`가 없는 환경(리포를 새로 clone만 하고 원본은 아직 안 받은 상태 등)에서는 Step2~3을 건너뛰고 구문 검증만 하고 끝난다 — 정상 동작이다.

**Step 4 — 브라우저 실클릭 (클로드인크롬)**
배포된 `https://aebonlee.github.io/hd-project21/`에서 샘플 코드 로드 → 분석 → Phase2 상세(함수 클릭·검색·정렬) → Phase3 미리보기 → Phase4 교차검증 → 다운로드까지 실제로 눌러본다. **좌표 클릭은 스크롤/리사이즈로 자주 어긋난다 — `find` 도구로 요소 참조(`ref_N`)를 받아 클릭하는 편이 훨씬 안정적이다.**

## 8. 배포

- 리포 `aebonlee/hd-project21` — **private**. Pages 소스: `main` 브랜치 `/docs`.
- 배포: `git push origin main` 후 자동 빌드되거나, 필요시 `gh api -X POST repos/aebonlee/hd-project21/pages/builds`.
- **같은 커밋에서 `built`/`errored`를 오가는 레이트리밋성 실패가 실제로 있었다.** 원인은 짧은 간격의 연속 수동 재트리거로 추정(전역 CLAUDE.md §4 "2~3분 간격 유지"와 같은 맥락). 재시도할 땐 재트리거보다 **대기 후 조회**를 우선한다.
- `gh api repos/aebonlee/hd-project21/pages/builds/latest --jq '{status,commit,error}'`로 상태·커밋 해시 확인. `curl -s https://aebonlee.github.io/hd-project21/ | grep -o "고유심볼명"`으로 실제 반영 여부를 커밋 해시보다 먼저 신뢰할 것 — 상태 API가 "building"이어도 CDN에는 이미 새 내용이 떠 있던 사례가 있었다.

## 9. 커밋 이력 요약 (2026-08-27, 최초 개발 회차)

| 커밋 | 내용 |
|---|---|
| `ded2b17` | 초기 구현 — 전처리기 해석·CAN 추출·자체 OOXML 생성기 |
| `699dd32` | 브라우저 실클릭 QA에서 주석 오귀속·`ain`⊂`maintenance` 오탐 발견·수정 |
| `c870484` | 화면 흐름도를 세로 박스 나열 → 다이아몬드/화살표 플로우차트로 교체 |
| `939faf6` | `\b`가 `_`를 못 넘는 회귀 버그 수정(§6) |
| `ccd0a5b` | Phase2 함수 표 검색·정렬 추가 |
| `8679706` | 개발일지 정리 |

상세 서술은 `Dev_md/2026-08-27_기획-착수.md`.

## 10. 남은 일 / 알려진 한계

- `switch`/`case`가 case별 개별 분기로 모델링되지 않고 전체가 다이아몬드 하나로 뭉뚱그려진다. 세분화하려면 `scanBlock()`에 `case`/`default` 키워드 인식을 추가해야 한다.
- Word 다운로드를 클로드인크롬 자동화 세션에서 클릭했을 때 에러는 없었으나, 그 세션의 다운로드 폴더를 찾지 못해 파일 저장 자체는 육안 확인을 못 했다(§7 Step 3의 Node+LibreOffice 검증으로 로직은 이미 증명됨 — 남은 건 실제 Word 앱에서의 최종 확인, 이건 사람이 직접 할 몫).
- 사양서 표지의 회사명·결재자 등은 전부 `[확인 필요]` 기본값 — 특정 회사명을 하드코딩하지 않는다(§3 자산 보호 원칙과 §6 범용성 원칙 둘 다 이유).
