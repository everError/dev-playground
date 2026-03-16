**Title:** git pull 시 로컬 변경사항과 원격 변경사항 충돌로 pull 실패

**Category:** Build/Deploy

**Stack:** Git, GitLab

**Status:** Resolved

**Priority:** Medium

---

## Environment

- Git / GitLab
- 같은 브랜치에서 여러 명이 작업하는 구조

## Symptom

로컬에서 파일을 수정한 뒤 push하기 전에 `git pull`을 시도하면 다음과 같은 에러가 발생하며 pull이 거부된다.

```
error: Your local changes to the following files would be overwritten by merge:
    src/SomeFile.cs
Please commit your changes or stash them before you can merge.
Aborting
```

로컬 변경사항을 커밋하지 않은 상태에서, 원격에 같은 파일의 변경이 있으면 Git이 pull 자체를 막는다. 커밋하자니 아직 작업 중이고, pull을 안 하자니 push가 안 되는 상황이 된다.

## Cause

Git은 워킹 디렉토리에 커밋되지 않은 변경사항이 있는 상태에서 `git pull`을 실행하면, 원격 변경사항과 병합하는 과정에서 로컬 변경사항이 유실될 수 있다고 판단하여 pull을 거부한다.

흐름을 정리하면 다음과 같다.

1. 로컬에서 `SomeFile.cs`를 수정 중 (아직 커밋 안 함)
2. 다른 팀원이 같은 파일을 수정하고 원격에 push
3. 내가 push하기 위해 먼저 `git pull` 시도
4. Git이 "로컬 변경사항이 덮어써질 수 있다"며 pull 거부

이 상태에서 강제로 진행하면 로컬 작업이 날아갈 수 있으므로, 로컬 변경사항을 안전하게 보관한 뒤 pull을 받아야 한다.

## Solution

`git stash`를 사용하여 로컬 변경사항을 임시 저장하고, pull을 받은 뒤 다시 적용한다.

**전체 흐름:**

```bash
# 1. 로컬 변경사항을 임시 저장
git stash

# 2. 원격 변경사항을 받아온다 (워킹 디렉토리가 깨끗하므로 성공)
git pull

# 3. 임시 저장한 변경사항을 다시 적용
git stash pop
```

`git stash pop` 시점에서 두 가지 결과가 나뉜다.

**충돌이 없는 경우:** 로컬 변경사항이 자동으로 병합되어 적용된다. 이후 정상적으로 커밋하고 push하면 된다.

```bash
git add .
git commit -m "작업 내용"
git push
```

**충돌이 발생하는 경우:** 원격 변경사항과 내 변경사항이 같은 부분을 수정했으면 충돌이 발생한다.

```
Auto-merging src/SomeFile.cs
CONFLICT (content): Merge conflict in src/SomeFile.cs
```

파일을 열면 충돌 마커가 표시된다.

```
<<<<<<< Updated upstream
// 원격에서 받아온 코드
public void Process(int id)
=======
// 내가 수정한 코드
public void Process(int id, string name)
>>>>>>> Stashed changes
```

충돌 마커를 제거하고 최종 코드를 정리한 뒤 커밋한다.

```bash
# 충돌 파일 수정 후
git add src/SomeFile.cs
git commit -m "원격 변경사항과 병합"
git push
```

**stash pop 후 충돌이 발생하면 stash가 자동 삭제되지 않는다.** 충돌을 해결한 뒤 수동으로 삭제해야 한다.

```bash
# 충돌 해결 완료 후 stash 목록 확인
git stash list
# stash@{0}: WIP on main: abc1234 이전 커밋 메시지

# 더 이상 필요 없으면 삭제
git stash drop
```

## Notes

- `git stash`는 커밋되지 않은 변경사항만 저장한다. 새로 생성한 파일(untracked)은 기본적으로 포함되지 않으므로, 새 파일도 함께 저장하려면 `git stash -u`를 사용해야 한다
- `git stash pop` 대신 `git stash apply`를 쓰면 적용 후에도 stash가 남아있다. 안전하게 확인한 뒤 `git stash drop`으로 수동 삭제할 수 있어 실수 방지에 유리하다
- 같은 브랜치에서 여러 명이 작업할 때 충돌을 최소화하려면, 작업 단위를 작게 나누고 자주 pull/push하는 습관이 중요하다
- `git pull --rebase`를 사용하면 머지 커밋 없이 깔끔한 히스토리를 유지할 수 있다. 다만 stash와 조합할 때는 `git pull --rebase --autostash` 옵션을 쓰면 stash를 수동으로 하지 않아도 자동으로 처리해준다
