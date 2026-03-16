**Title:** EF Core DbContext Tracking 충돌로 인한 InvalidOperationException

**Category:** Backend

**Stack:** .NET, EF Core

**Status:** Resolved

**Priority:** High

---

## Environment

- ORM: Entity Framework Core
- DB: PostgreSQL (RDBMS 종류 무관하게 발생)
- DI 컨테이너에서 DbContext를 주입받아 사용하는 구조

## Symptom

동일 엔티티를 조회한 뒤 수정하거나, 여러 경로에서 같은 엔티티를 조회하는 로직에서 `InvalidOperationException`이 발생한다. 대표적인 에러 메시지는 다음과 같다.

```
The instance of entity type 'XXX' cannot be tracked because another instance with the same key value is already being tracked.
```

단건 처리에서는 발생하지 않고, 복잡한 비즈니스 로직에서 같은 엔티티를 여러 번 건드릴 때 간헐적으로 발생하여 원인 파악이 어렵다.

## Cause

EF Core의 Change Tracker는 DbContext 단위로 엔티티 인스턴스를 추적한다. 같은 DbContext 내에서 동일한 기본 키를 가진 엔티티가 두 개 이상 추적 상태에 들어가면 충돌이 발생한다.

흔히 발생하는 패턴은 다음과 같다.

**패턴 1. 조회 후 별도 인스턴스로 Update 시도**

```csharp
var user = await context.Users.FirstAsync(u => u.Id == id);  // 추적 시작
var updatedUser = new User { Id = id, Name = "변경" };
context.Users.Update(updatedUser);  // 같은 키로 두 번째 추적 시도 → 에러
```

`FirstAsync`로 이미 해당 키의 엔티티가 추적 중인데, `Update()`로 같은 키의 새 인스턴스를 추적에 넣으려 하면 충돌한다.

**패턴 2. 여러 서비스에서 같은 엔티티를 각각 조회**

```csharp
public async Task Process(int userId)
{
    var user = await _userService.GetById(userId);       // 추적됨
    var sameUser = await _orderService.GetUserById(userId); // 같은 DbContext라면 이미 추적 중
    sameUser.Point += 100;
    await context.SaveChangesAsync();  // 어떤 인스턴스를 기준으로 저장할지 모호
}
```

DbContext가 Scoped로 등록되어 있으면 하나의 HTTP 요청 안에서 모든 서비스가 같은 DbContext를 공유한다. 여러 서비스에서 같은 엔티티를 각각 조회하면 추적 충돌이 발생한다.

**패턴 3. 반복문 안에서 Attach/Update**

```csharp
foreach (var dto in dtoList)
{
    var entity = mapper.Map<User>(dto);
    context.Users.Update(entity);  // 같은 Id가 두 번 들어오면 에러
}
```

## Solution

**방법 1. 조회 후 해당 인스턴스를 직접 수정한다 (기본 원칙)**

```csharp
var user = await context.Users.FirstAsync(u => u.Id == id);
user.Name = "변경";  // 추적 중인 인스턴스를 직접 수정
await context.SaveChangesAsync();  // Change Tracker가 변경 감지하여 UPDATE 생성
```

새 인스턴스를 만들어 `Update()`를 호출하는 대신, 조회한 인스턴스의 프로퍼티를 직접 변경하면 추적 충돌이 발생하지 않는다.

**방법 2. 조회 전용에는 AsNoTracking을 사용한다**

```csharp
var user = await context.Users
    .AsNoTracking()
    .FirstAsync(u => u.Id == id);
```

읽기 전용 조회에 `AsNoTracking()`을 붙이면 Change Tracker에 등록되지 않으므로, 이후 같은 키의 엔티티를 추적해도 충돌하지 않는다. 메모리 사용량도 줄어든다.

**방법 3. 기존 추적을 해제한 뒤 새 인스턴스를 붙인다**

부득이하게 새 인스턴스로 업데이트해야 할 경우, 기존 추적을 먼저 해제한다.

```csharp
var tracked = context.ChangeTracker.Entries<User>()
    .FirstOrDefault(e => e.Entity.Id == id);
if (tracked != null)
    tracked.State = EntityState.Detached;

var updatedUser = new User { Id = id, Name = "변경" };
context.Users.Update(updatedUser);
await context.SaveChangesAsync();
```

**방법 4. DbContext 생명주기를 적절히 관리한다**

```csharp
// 기본: Scoped (HTTP 요청당 1개)
services.AddDbContext<AppDbContext>(options => ...);

// 필요 시 Factory 패턴으로 짧은 생명주기 사용
services.AddDbContextFactory<AppDbContext>(options => ...);
```

하나의 요청 안에서 DbContext를 오래 공유할수록 추적 충돌 가능성이 높아진다. 복잡한 배치 처리나 백그라운드 작업에서는 `DbContextFactory`로 필요한 범위마다 새 DbContext를 생성하는 것이 안전하다.

## Notes

- 읽기 전용 조회에 `AsNoTracking()`을 습관적으로 붙이면 대부분의 추적 충돌을 예방할 수 있고 성능도 향상된다
- `DbContext`는 경량 객체이므로 짧게 생성하고 빨리 폐기하는 것이 권장된다. 장시간 유지하면 메모리 누수와 추적 충돌이 모두 증가한다
- EF Core의 `ChangeTracker.Clear()`를 호출하면 모든 추적을 한 번에 해제할 수 있다. 배치 처리 중간에 유용하다
