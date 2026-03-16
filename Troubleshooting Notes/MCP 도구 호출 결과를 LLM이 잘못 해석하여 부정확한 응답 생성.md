**Title:** MCP 도구 호출 결과를 LLM이 잘못 해석하여 부정확한 응답 생성

**Category:** Backend

**Stack:** MCP, LangChain

**Status:** Resolved

**Priority:** High

---

## Environment

- MCP 서버: 커스텀 도구 서버 (SSE 또는 stdio 기반)
- LLM: Claude, GPT 등
- MCP 클라이언트에서 도구를 등록하고 LLM이 자율적으로 호출하는 구조

## Symptom

LLM이 MCP 도구를 호출한 뒤 결과를 사용자에게 전달할 때, 실제 데이터와 다른 내용을 답변하거나 결과의 일부만 사용하고 나머지를 무시한다. 구체적으로 다음과 같은 양상이 나타난다.

- 도구가 반환한 숫자의 단위를 잘못 해석한다 (예: 분 단위를 시간 단위로 오해)
- 여러 필드 중 어떤 것이 핵심 결과인지 판단하지 못하고 엉뚱한 필드를 인용한다
- 도구가 에러를 반환했는데 정상 결과인 것처럼 답변한다
- 도구를 호출해야 할 상황에서 호출하지 않거나, 불필요한 상황에서 호출한다

도구 자체는 정상 동작하고 올바른 데이터를 반환하는데, LLM이 그 결과를 해석하는 단계에서 문제가 발생한다.

## Cause

MCP에서 도구는 이름, 설명(description), 입력 스키마(inputSchema)로 정의된다. LLM은 이 정보만 보고 언제 도구를 호출할지, 어떤 파라미터를 넣을지, 반환된 결과를 어떻게 해석할지를 결정한다. 이 정의가 모호하면 LLM이 잘못된 판단을 내린다.

**원인 1. 도구 description이 모호하다**

```json
{
  "name": "get_data",
  "description": "데이터를 가져옵니다"
}
```

"데이터를 가져옵니다"만으로는 어떤 데이터인지, 언제 이 도구를 써야 하는지 LLM이 판단할 수 없다. 비슷한 이름의 도구가 여러 개 있으면 잘못된 도구를 호출하거나, 호출해야 할 상황을 놓친다.

**원인 2. 입력 파라미터의 의미가 불명확하다**

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "id": { "type": "string" },
      "type": { "type": "string" }
    }
  }
}
```

`id`가 사용자 ID인지 주문 ID인지, `type`에 어떤 값이 들어갈 수 있는지 알 수 없다. LLM이 추측으로 파라미터를 채우면 도구가 에러를 반환하거나 엉뚱한 데이터를 조회한다.

**원인 3. 응답 형식에 대한 설명이 없다**

도구가 복잡한 JSON을 반환할 때, 각 필드의 의미나 단위에 대한 설명이 없으면 LLM이 자의적으로 해석한다. 예를 들어 `{ "duration": 120 }`이 120초인지 120분인지, `{ "status": 0 }`이 성공인지 실패인지 LLM은 알 수 없다.

**원인 4. 에러 응답과 정상 응답의 구분이 안 된다**

도구가 에러 시에도 HTTP 200에 에러 메시지를 텍스트로 반환하면, LLM은 이를 정상 결과로 간주하고 에러 메시지 내용을 답변에 포함시킨다.

## Solution

**1. description을 구체적이고 상세하게 작성한다**

```json
{
  "name": "get_production_status",
  "description": "특정 생산 라인의 현재 가동 상태를 조회합니다. 라인별 가동률, 현재 생산 중인 품목, 목표 대비 달성률을 반환합니다. 생산 현황이나 라인 상태를 물어볼 때 사용하세요. 과거 이력 조회에는 get_production_history를 사용하세요."
}
```

핵심은 세 가지를 명시하는 것이다. 이 도구가 무엇을 하는지, 어떤 상황에서 사용해야 하는지, 유사한 다른 도구와의 차이가 무엇인지.

**2. 입력 파라미터에 description과 제약 조건을 명시한다**

```json
{
  "inputSchema": {
    "type": "object",
    "properties": {
      "line_id": {
        "type": "string",
        "description": "생산 라인 ID. 'LINE-01', 'LINE-02' 형식. 전체 라인 조회 시 'ALL'"
      },
      "date": {
        "type": "string",
        "description": "조회 날짜. ISO 8601 형식 (YYYY-MM-DD). 미입력 시 오늘 날짜"
      }
    },
    "required": ["line_id"]
  }
}
```

파라미터마다 의미, 형식, 예시값, 기본값을 적어주면 LLM이 정확한 값을 채울 수 있다.

**3. 응답에 단위와 필드 설명을 포함한다**

```json
{
  "result": {
    "line_id": "LINE-01",
    "status": "running",
    "uptime_percent": 87.5,
    "uptime_unit": "percent",
    "current_product": "제품A",
    "target_quantity": 1000,
    "actual_quantity": 875,
    "quantity_unit": "개",
    "updated_at": "2025-03-13T14:30:00+09:00"
  }
}
```

숫자 필드 옆에 단위를 명시하거나, 필드명 자체를 `uptime_percent`처럼 단위를 포함하도록 작성한다. LLM이 "가동률 87.5%"라고 정확히 답변할 수 있게 된다.

**4. 에러 응답을 MCP 프로토콜에 맞게 구분한다**

```python
# MCP 서버에서 도구 응답 시
# 정상
return {
    "content": [
        {"type": "text", "text": json.dumps(result)}
    ]
}

# 에러 - isError 플래그를 명시
return {
    "content": [
        {"type": "text", "text": "라인 ID 'LINE-99'는 존재하지 않습니다."}
    ],
    "isError": True
}
```

`isError: True`를 반환하면 LLM이 이를 에러로 인식하고, 사용자에게 에러 상황을 안내하거나 재시도 판단을 할 수 있다.

**5. 도구가 많으면 카테고리별로 이름 규칙을 통일한다**

```
# 네이밍 규칙 예시
get_*      → 조회 (get_production_status, get_order_detail)
create_*   → 생성 (create_work_order, create_report)
update_*   → 수정 (update_schedule, update_quantity)
search_*   → 검색 (search_products, search_defects)
```

이름만 보고도 동작을 예측할 수 있으면, LLM이 올바른 도구를 선택할 확률이 크게 올라간다.

## Notes

- description은 사람이 읽는 문서가 아니라 LLM이 읽는 프롬프트라고 생각해야 한다. 짧고 함축적인 것보다 길더라도 명확한 것이 훨씬 낫다
- 도구가 10개를 넘어가면 LLM의 도구 선택 정확도가 떨어지기 시작한다. 관련 도구를 하나로 합치거나, 상황에 따라 노출 도구를 제한하는 것을 고려해야 한다
- 도구 정의를 변경하면 반드시 실제 대화에서 테스트해야 한다. description의 사소한 표현 차이가 LLM의 도구 호출 패턴을 크게 바꿀 수 있다
- MCP 서버를 여러 개 연결할 때 도구 이름이 겹치면 라우팅 혼란이 발생한다. 서버별로 네임스페이스 접두사를 붙이는 것이 안전하다 (예: `production_get_status`, `quality_get_status`)
