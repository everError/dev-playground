**Title:** Docker 이미지 빌드 시 캐시 무효화로 매번 전체 빌드 수행

**Category:** Infra

**Stack:** Docker, .NET

**Status:** Resolved

**Priority:** Medium

---

## Environment

- Docker / Docker Compose
- .NET 애플리케이션 (Vite 프론트엔드에서도 동일하게 적용)
- CI/CD 파이프라인 또는 로컬에서 반복 빌드하는 구조

## Symptom

소스 코드를 한 줄만 수정해도 `docker build`가 매번 전체 빌드를 수행한다. NuGet 패키지 복원(`dotnet restore`)이나 npm install 단계가 매번 처음부터 실행되어 빌드 시간이 수 분 이상 소요된다. 패키지를 변경하지 않았는데도 의존성 설치가 반복된다.

## Cause

Docker는 Dockerfile의 각 명령어를 레이어로 만들고, 이전 빌드의 레이어를 캐시로 재사용한다. 단, 특정 레이어가 변경되면 그 이후의 모든 레이어 캐시가 무효화된다. 이것이 핵심 규칙이다.

**잘못된 Dockerfile 예시:**

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# 소스 코드 전체를 먼저 복사
COPY . .                          # ← 소스 한 줄만 바뀌어도 이 레이어가 변경됨

# 의존성 복원
RUN dotnet restore                # ← 위 레이어가 변경되었으므로 캐시 무효화

# 빌드
RUN dotnet publish -c Release -o /app  # ← 마찬가지로 캐시 무효화
```

`COPY . .`이 의존성 복원보다 앞에 있으므로, 소스 코드가 조금이라도 바뀌면 `COPY . .` 레이어가 변경된 것으로 판단된다. Docker의 캐시 규칙에 따라 이후의 `dotnet restore`와 `dotnet publish`도 전부 캐시가 무효화되어 처음부터 다시 실행된다.

패키지 목록은 바뀌지 않았는데도, 소스 코드 변경이 의존성 복원까지 끌고 가는 것이 문제의 본질이다.

## Solution

**핵심 원칙: 변경 빈도가 낮은 레이어를 위에, 자주 바뀌는 레이어를 아래에 배치한다.**

**1. .NET 프로젝트 — 프로젝트 파일만 먼저 복사하여 restore 캐시를 분리한다**

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# 1단계: 프로젝트 파일만 먼저 복사 (패키지 목록)
COPY *.sln .
COPY src/Api/Api.csproj src/Api/
COPY src/Domain/Domain.csproj src/Domain/
COPY src/Infrastructure/Infrastructure.csproj src/Infrastructure/

# 2단계: 의존성 복원 (프로젝트 파일이 안 바뀌면 캐시 히트)
RUN dotnet restore

# 3단계: 나머지 소스 코드 복사 (여기서부터만 캐시 무효화)
COPY . .

# 4단계: 빌드
RUN dotnet publish -c Release -o /app --no-restore

# 런타임 이미지 (멀티 스테이지)
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "Api.dll"]
```

소스 코드를 수정해도 1~2단계의 캐시는 유지된다. `dotnet restore`는 `.csproj` 파일이 변경될 때(패키지 추가/삭제)만 다시 실행된다.

**2. Vite/Node.js 프로젝트 — package.json만 먼저 복사한다**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app

# 1단계: 패키지 목록만 복사
COPY package.json package-lock.json ./

# 2단계: 의존성 설치 (package.json이 안 바뀌면 캐시 히트)
RUN npm ci

# 3단계: 소스 코드 복사
COPY . .

# 4단계: 빌드
RUN npm run build
```

동일한 원리로 `npm ci`가 매번 실행되는 것을 방지한다.

**3. .dockerignore로 불필요한 파일을 제외한다**

```
# .dockerignore
bin/
obj/
node_modules/
.git/
*.md
docker-compose*.yml
.env
```

`COPY . .` 시 `bin/`, `obj/`, `node_modules/`, `.git/` 등이 포함되면 해당 폴더 내 파일 변경만으로도 레이어 캐시가 깨진다. 빌드에 불필요한 파일을 제외하면 캐시 히트율이 높아지고 빌드 컨텍스트 전송 시간도 줄어든다.

**4. 멀티 스테이지 빌드로 최종 이미지 크기를 줄인다**

위 .NET 예시에서 이미 적용되어 있지만, 빌드 단계(SDK 이미지)와 런타임 단계(ASP.NET 런타임 이미지)를 분리하면 최종 이미지에 SDK, 소스 코드, 빌드 아티팩트가 포함되지 않는다.

| 이미지                     | 크기   |
| -------------------------- | ------ |
| dotnet/sdk:8.0 (빌드용)    | ~900MB |
| dotnet/aspnet:8.0 (런타임) | ~220MB |
| alpine 기반 런타임         | ~110MB |

**5. 레이어 캐시 상태를 확인한다**

```bash
# 빌드 시 캐시 사용 여부 확인
docker build --progress=plain .

# 출력에서 CACHED가 보이면 캐시 히트
# => [2/6] COPY *.sln .
# => CACHED [3/6] RUN dotnet restore
# => [4/6] COPY . .
```

`--progress=plain` 옵션으로 빌드하면 각 단계별로 `CACHED` 여부를 확인할 수 있다. 의도한 단계에서 캐시가 히트되는지 검증하면 된다.

## Notes

- CI/CD 환경에서는 빌드 서버가 매번 클린 상태이므로 로컬처럼 캐시가 동작하지 않을 수 있다. `docker buildx`의 캐시 백엔드(레지스트리 캐시, GitHub Actions 캐시 등)를 활용하면 CI에서도 레이어 캐시를 유지할 수 있다
- `--no-cache` 옵션을 쓰면 전체 캐시를 무시한다. 캐시 문제가 의심될 때 디버깅 용도로 사용하되, 일상적으로 쓰면 캐시의 의미가 없어진다
- 프로젝트 파일이 많으면 `COPY` 라인이 길어진다. 쉘 스크립트나 와일드카드 패턴(`COPY **/*.csproj ./`)을 활용하되, 디렉토리 구조가 유지되지 않는 점에 주의해야 한다. 필요하면 별도 스크립트로 프로젝트 파일만 복사하는 방식을 사용한다
