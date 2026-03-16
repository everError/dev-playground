**Title:** OPC UA Int64/UInt64 값이 비정상적인 쉼표 구분 문자열로 저장됨

**Category:** Backend

**Stack:** Node.js, OPC UA

**Status:** Resolved

**Priority:** High

---

## Environment

- OPC UA 클라이언트: node-opcua (Node.js)
- 설비에서 OPC UA로 데이터를 수집하여 DB에 저장하는 구조
- 수집 대상 값 중 Int64/UInt64 타입이 포함됨

## Symptom

OPC UA 서버에서 수집한 값이 DB에 비정상적인 형태로 저장된다. 예를 들어 실제 값이 `92389505232`여야 하는데, DB에는 `21,1916843952`로 저장된다. 쉼표가 포함된 문자열이 들어가면서 이후 이 값을 숫자로 파싱하는 로직에서도 연쇄적으로 에러가 발생한다.

모든 태그에서 발생하는 것이 아니라, Int64 또는 UInt64 타입의 태그에서만 발생한다. Int32 이하의 정수나 Float, Double 값은 정상적으로 저장된다.

## Cause

JavaScript의 Number 타입은 IEEE 754 배정밀도 부동소수점이므로, 안전하게 표현할 수 있는 정수 범위가 `Number.MAX_SAFE_INTEGER`(2^53 - 1, 약 9천조)까지다. 그런데 Int64는 최대 2^63 - 1, UInt64는 최대 2^64 - 1까지 표현해야 하므로 JavaScript Number로는 정밀도 손실 없이 담을 수 없다.

이 때문에 node-opcua는 Int64/UInt64 값을 Number가 아닌 `[high, low]` 형태의 32비트 정수 배열로 반환한다.

```javascript
// node-opcua가 반환하는 실제 구조
// 실제 값: 92389505232
// high: 21 (상위 32비트)
// low: 1916843952 (하위 32비트)
rawValue = [21, 1916843952];
```

문제는 이 배열을 `String()`으로 변환하는 부분에서 발생한다.

```javascript
// 의도: 숫자를 문자열로 변환
const valueStr = String(rawValue);

// 실제 결과: 배열의 toString()이 호출됨
// "21,1916843952" ← 쉼표 구분 문자열
```

JavaScript에서 배열에 `String()`을 적용하면 `Array.prototype.toString()`이 호출되어 각 요소를 쉼표로 이어붙인다. 이 결과가 그대로 DB에 저장되면서 비정상적인 값이 기록된 것이다.

복원 공식으로 보면, 원래 값은 `high × 2^32 + low`로 계산된다.

```
21 × 4,294,967,296 + 1,916,843,952 = 92,389,505,168 + 1,916,843,952 = 92,389,505,232 ???

실제: 21 × 4,294,967,296 = 90,194,313,216
90,194,313,216 + 1,916,843,952 = 92,111,157,168
```

`실제 값 = high × 4,294,967,296(2^32) + low`

## Solution

**`String()` 변환 전에 배열 여부를 확인하고, Int64/UInt64인 경우 BigInt 연산으로 원래 값을 복원한다.**

```javascript
function convertOpcuaValue(rawValue) {
  // Int64/UInt64는 [high, low] 배열로 반환됨
  if (Array.isArray(rawValue) && rawValue.length === 2) {
    const [high, low] = rawValue;
    // BigInt로 상위 32비트와 하위 32비트를 합산
    // low >>> 0은 음수를 부호 없는 정수로 변환
    return (BigInt(high) * BigInt(4294967296) + BigInt(low >>> 0)).toString();
  }

  return String(rawValue);
}
```

**`low >>> 0`을 사용하는 이유:**

하위 32비트 값이 2^31 이상이면 JavaScript에서 음수로 표현될 수 있다. `>>> 0`(부호 없는 오른쪽 시프트)을 적용하면 부호 없는 32비트 정수로 올바르게 변환된다.

```javascript
// 예시: low가 음수로 들어오는 경우
const low = -1; // 실제로는 4294967295(0xFFFFFFFF)
low >>> 0; // 4294967295 (부호 없는 정수로 변환)
BigInt(low >>> 0); // 4294967295n
```

**적용 후 검증:**

```javascript
// 검증: [21, 1916843952] → "92111157168"
const result = convertOpcuaValue([21, 1916843952]);
console.log(result); // "92111157168"

// 기존 타입은 영향 없음
convertOpcuaValue(12345); // "12345"
convertOpcuaValue(3.14); // "3.14"
convertOpcuaValue("hello"); // "hello"
```

## Notes

- node-opcua 외에 다른 OPC UA 라이브러리에서도 Int64/UInt64를 배열이나 특수 객체로 반환하는 경우가 있다. 라이브러리별로 반환 형식을 반드시 확인해야 한다
- DB에 이미 `21,1916843952` 형태로 저장된 기존 데이터가 있다면, 마이그레이션 스크립트로 쉼표 기준 분리 후 BigInt 연산으로 복원할 수 있다
- JavaScript의 BigInt는 JSON.stringify에서 기본적으로 지원되지 않으므로, API 응답이나 로깅에서 BigInt를 사용할 때는 `.toString()`으로 문자열 변환 후 전달해야 한다
- DB 컬럼 타입이 INT라면 Int64 범위를 담을 수 없으므로, BIGINT 또는 VARCHAR로 저장해야 한다
