**Title:** EF Core 다중 경로 CASCADE 참조로 인한 마이그레이션 실패

**Category:** DB

**Stack:** .NET, EF Core

**Status:** Resolved

**Priority:** Medium

---

## Environment

- ORM: Entity Framework Core
- DB: SQL Server (또는 CASCADE 경로 제한이 있는 RDBMS)
- 마이그레이션 방식: `dotnet ef database update`

## Symptom

`dotnet ef database update` 실행 시 FOREIGN KEY 제약 조건 생성에 실패한다. 특정 테이블이 여러 부모 테이블을 참조하고, 각 경로에 `ON DELETE CASCADE`가 설정되어 있을 때 발생한다.

## Cause

하나의 자식 테이블이 동일한 상위 테이블에 대해 두 가지 이상의 삭제 경로를 가질 때 발생한다.

`AuthGroupMenus` 테이블을 예로 들면, 이 테이블은 `SystemCode`를 통해 `Systems` 테이블을 직접 참조하고, `(SystemCode, MenuCode)` 복합 키를 통해 `Menus` 테이블을 참조한다. `Menus` 역시 `SystemCode`로 `Systems`를 참조하고 있다.

이 구조에서 `Systems`의 행이 삭제되면 `AuthGroupMenus`의 행을 삭제하는 경로가 두 가지가 된다.

- 직접 경로: `Systems` → `AuthGroupMenus`
- 간접 경로: `Systems` → `Menus` → `AuthGroupMenus`

두 경로 모두 `ON DELETE CASCADE`가 설정되어 있으면, 데이터베이스는 어떤 삭제 경로를 따라야 할지 결정할 수 없어 제약 조건 생성 자체를 거부한다. 이는 SQL Server 등 다중 CASCADE 경로를 허용하지 않는 RDBMS에서 발생하는 제한사항이다.

## Solution

**방법 1. ON DELETE 동작 변경 (일반적인 해결책)**

두 경로 중 하나의 `ON DELETE` 동작을 `Cascade`에서 `NoAction`으로 변경하여 순환 참조를 끊는다. `DbContext`의 `OnModelCreating`에서 Fluent API로 설정한다.

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);

    modelBuilder.Entity<AuthGroupMenus>()
        .HasOne(agm => agm.System)
        .WithMany()
        .HasForeignKey(agm => agm.SystemCode)
        .OnDelete(DeleteBehavior.NoAction);
}
```

이렇게 하면 직접 경로의 자동 삭제가 비활성화되어 경로 충돌이 해소된다. 단, 해당 경로의 삭제는 애플리케이션 레벨에서 직접 처리해야 한다.

**방법 2. 불필요한 참조 자체를 제거 (근본적인 해결책)**

비즈니스 로직상 `AuthGroupMenus`가 `Systems`를 직접 참조할 필요가 없다면, 해당 관계 자체를 제거하는 것이 더 깔끔하다. `AuthGroupMenus`는 `Menus`를 통해 시스템 정보를 간접적으로 얻을 수 있으므로, 직접 참조를 삭제하면 모델이 단순해지고 오류가 근본적으로 방지된다.

- `AuthGroupMenus` 클래스에서 `Systems`에 대한 탐색 속성과 `[ForeignKey]` 어트리뷰트를 삭제한다
- `OnModelCreating`에서 해당 관계 설정 코드를 제거한다

## Notes

- 이 문제는 SQL Server 특유의 제한사항으로, PostgreSQL은 다중 CASCADE 경로를 허용하는 경우가 많다
- `NoAction`과 `Restrict`의 차이: `NoAction`은 DB 레벨에서 제약 검사를 지연할 수 있고, `Restrict`는 EF Core가 SaveChanges 시점에서 즉시 차단한다
- 방법 1을 적용할 경우, 부모 행 삭제 전에 자식 행을 먼저 삭제하는 로직을 애플리케이션에서 구현해야 한다
