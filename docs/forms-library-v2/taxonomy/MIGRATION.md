# 자료실 분류 확장 적용

기존 `documents[]` 177개 레코드는 필드·값을 그대로 보존하고 각 레코드의
`resource` 키에 `resource.schema.json`에 맞는 객체를 추가한다. 기존 `deadline`
문자열과 신규 `resource.deadline` 객체는 별개이며 기존 문자열을 자동으로 기한
계산 규칙으로 변환하지 않는다.

## 수집 선행조건과 실행

수집 작업표 109건이 모두 `확인 완료`이고 summary의 완료 109/미완료 0,
필수 원본 미확보 목록이 비어 있을 때에만 스크립트를 실행할 수 있다.
분류 스크립트는 수집 완료 상태나 수집 근거를 수정하지 않는다.

```sh
python -m pip install jsonschema
python scripts/migrate-forms-taxonomy.py
python scripts/migrate-forms-taxonomy.py --apply
python scripts/validate-forms-taxonomy.py
```

첫 명령 다음의 기본 실행은 읽기 전용 미리보기다. `--apply`만 데이터를 쓴다.
실행 직전의 최신 manifest를 `docs/forms-library-v2/evidence/pre-migration-manifest.json`에
보존하므로 수집 단계에서 적법하게 교체한 URL도 기준값에 포함된다. HEAD의 과거 URL을
기준으로 되돌리지 않는다. 파일·썸네일·ZIP의 바이트와 해시는
`pre-migration-files.json`으로 고정한다. 기존 baseline이나 resource 키가 있으면
덮어쓰지 않고 실패한다.

## 생성물과 집계

- 기존 manifest: `documents[].resource`만 추가하며 177개 레코드를 유지한다.
- `public/downloads/official-forms/presentation-groups.json`: 19개 가상 묶음 배열.
  각 묶음은 승인된 `id`, `title`, `member_resource_ids` 등과 새 `resource` 객체를 가진다.
- 84개 독립 자료 + 19개 가상 묶음 = 103개 대표카드.
- 62개 묶음 소속, 22개 본서식 아래 자료, 9개 보관 자료는 원본과 직접 링크를 유지한다.
- 본서식 아래 자료 22개는 부표·합본첨부 9개와 작성사례·참고자료 13개로 구분한다.

가상 묶음의 합산 패싯은 요약 정보다. 필터 일치 여부는 원자료 한 건에서
같은 축 OR/서로 다른 축 AND로 판정한 후 묶어야 한다. 자식이 검색되면 부모와
일치한 자식을 표시한다. `relations[]`의 복수 부모를 모두 보존한다.

## 근거 참조와 검토 상태

스키마의 근거 참조 문자열은 다음 로컬 레지스트리로 해석한다.

| 참조 | 근거 위치 |
|---|---|
| `legacy:<ID>` | 실행 직전 baseline의 해당 document; 수집 검증·첨부파일·해시 포함 |
| `collection:<ID>` | `docs/forms-expansion-109/results.json`의 해당 수집 작업 |
| `taxonomy:<ID>` | 본 디렉터리의 resource-mapping 또는 presentation-groups 항목 |
| `forms-group:<ID>` | 공개 presentation-groups의 해당 가상 묶음 |

`source_verification`은 보존된 수집 증거가 있을 때만 verified로 이관한다.
완료 체크만 있고 검증 근거가 없으면 pending으로 남는다. `reviewed_at`은 수집일을
만들어 넣은 값이 아니라, 보존된 증거를 이관 검증한 시각이다.

탐색 목적·시점·단계는 승인 배치표를 유지한다. 자산은 자료 제목의 명시적 단서만
사용하고 미확인은 빈 배열로 둔다. 자료 유형은 제목·기관 첨부·제공 형태로 판정하며
임시값은 검토 메모를 남긴다. 원자료 분류 상태는 `needs_review`, 법적 적용조건은
`pending`으로 남긴다. 묶음·참고자료 연결의 편집 검증은 개별 사건의 법적 적용
검증을 의미하지 않는다. 작성사례·안내·링크에 독립 신고 절차를 생성하지 않는다.

P1-13의 공통 등기 참고자료는 상속·증여·매매 등기에, P9-03은 금전대차·차용증에
각각 연결한다. 부표를 사례로, 사례를 법정부표로 바꾸지 않는다.

`resource.deadline`은 전부 `unknown`, 규칙 배열은 비워 둔다. P8-09의 준비 시기
안내는 정성적 검토 항목으로만 기록하고 `needs_review`로 둔다. 날짜, 법정 기간,
개인별 능력·자격, 효과 보장 또는 D-day를 생성하지 않는다.

## 첫 진입 규칙

`catalog-navigation.json`은 종전 설계안의 생전/S1 고정값을 최신 합의에 맞춰 수정했다.
직접 진입과 전체 초기화는 목적·시점·단계 모두 전체다. 새 선택 화면을 요구하지 않고,
사용자가 명시적으로 관련 자료 링크를 누른 경우에만 현재 precheck 답변을 재사용한다.
기존 특정 자료·필터 URL을 우선하고 오래된 상담 저장값을 자동 적용하지 않는다.
생전 우선은 추천 콘텐츠 순서에 반영한다.
