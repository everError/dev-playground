# 🧪 TDD (Test-Driven Development) 가이드

TDD(Test-Driven Development)는 테스트 주도 개발 방법론으로, **"테스트 코드를 먼저 작성한 뒤 실제 코드를 구현"** 하는 개발 방식입니다.

---

## ✅ TDD 핵심 사이클: Red → Green → Refactor

1. **Red** : 실패하는 테스트 작성
2. **Green** : 테스트가 통과할 정도로 최소한의 코드 작성
3. **Refactor** : 테스트를 유지하면서 코드 리팩터링

---

## 💡 TDD의 이점

- 명세 기반 개발 (요구사항이 테스트로 표현됨)
- 높은 코드 품질 및 유지보수성
- 빠른 피드백 루프
- 테스트 커버리지가 자동으로 확보됨

---

## 🛠 .NET에서의 TDD 흐름 (xUnit 기준)

### 1. 실패하는 테스트 작성 (Red)

```csharp
[Fact]
public void Add_ReturnsSum()
{
    var calc = new Calculator();
    var result = calc.Add(2, 3);
    Assert.Equal(5, result); // Calculator 클래스는 아직 없음
}
```

### 2. 최소한의 실제 코드 작성 (Green)

```csharp
public class Calculator
{
    public int Add(int a, int b) => a + b;
}
```

### 3. 리팩터링 (Refactor)

- 중복 제거, 네이밍 정리, 예외 처리 등 리팩터링 수행
- 테스트는 그대로 유지되어야 함

---

## 🔁 테스트와 구현의 반복 구조

```
1. 테스트 작성 → 실패 확인
2. 실제 코드 작성 → 성공 확인
3. 구조 개선 (리팩터링)
4. 다음 기능 테스트 작성 → 반복
```

---

## ✍️ TDD 실천 팁

- 한 번에 하나의 작은 테스트부터 시작할 것
- 지나치게 미래 기능을 예측하지 말 것 (YAGNI)
- 테스트 이름은 시나리오 기반으로 작성할 것
- 테스트 실패 메시지는 원인을 명확히 알 수 있어야 함

---

## 🧱 테스트 코드 예시 구조

```csharp
public class OrderServiceTests
{
    [Fact]
    public void PlaceOrder_Should_Throw_When_Product_Is_OutOfStock()
    {
        var service = new OrderService();
        Assert.Throws<OutOfStockException>(() => service.PlaceOrder("ProductA"));
    }
}
```

---

## 🧠 자주 쓰는 테스트 어서션 (xUnit 기준)

| 어서션                                         | 설명           |
| ---------------------------------------------- | -------------- |
| `Assert.Equal(expected, actual)`               | 값 비교        |
| `Assert.True(condition)`                       | 조건 확인      |
| `Assert.Throws<T>(action)`                     | 예외 발생 확인 |
| `Assert.Null(value)` / `Assert.NotNull(value)` | null 여부      |

---

> TDD는 단위 테스트를 넘어 소프트웨어 설계 자체를 견고하게 만드는 개발 철학입니다.
